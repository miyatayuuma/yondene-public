/**
 * One-shot production acceptance: rename only a verified family shelf name.
 * Manually install in PRIVATE Sheet-bound GAS. No triggers and no queue enablement.
 * PUBLIC template deliberately contains neither real family IDs nor shelf names.
 *
 * Do not rerun after any failed/uncertain commit. Ask for read-only reconciliation.
 */
function yondeneProductionRenameOnce() {
  const EXPECTED_FROM='REPLACE_WITH_OLD_NAME';
  const EXPECTED_TO='REPLACE_WITH_NEW_NAME';
  function validName(s) {
    return typeof s==='string' && s===s.trim() && s.length>=1 &&
      s.length<=80 && !/[\u0000-\u001f\u007f]/.test(s);
  }
  if(!validName(EXPECTED_FROM)||!validName(EXPECTED_TO)||
      /^REPLACE_WITH_/.test(EXPECTED_FROM)||
      /^REPLACE_WITH_/.test(EXPECTED_TO)||EXPECTED_FROM===EXPECTED_TO)
    throw new Error('受入専用の変更前後の本棚名が未設定・不正です。変更なし。');
  if(typeof YONDENE!=='object'||!YONDENE||!YONDENE.project||
      !YONDENE.spreadsheetId || typeof yondeneSha256_!=='function')
    throw new Error('非公開の既存設定・SHA256ヘルパーが不足。');
  if(typeof YONDENE_QUEUE!=='object'||!YONDENE_QUEUE||
      YONDENE_QUEUE.WRITE_ENABLED!==false)
    throw new Error('通常のGAS writerが無効であることを確認できません。');
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(20000)) throw new Error('別のGAS処理が実行中です。');
  try {
    const ss=SpreadsheetApp.openById(YONDENE.spreadsheetId);
    const sync=ss.getSheetByName('同期状態');
    const setting=ss.getSheetByName('設定');
    const queue=ss.getSheetByName('更新キュー');
    if(!sync||!setting||!queue) throw new Error('必須シートがありません。');
    const project=String(sync.getRange('B3').getDisplayValue()||'').trim();
    const familyId=String(sync.getRange('B7').getDisplayValue()||'').trim();
    const ownerUid=String(sync.getRange('B8').getDisplayValue()||'').trim();
    if(project!==YONDENE.project||
        !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(familyId)||
        !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/.test(ownerUid))
      throw new Error('本番プロジェクト・家族・所有者の照合に失敗。');
    if(queue.getLastRow()!==1)
      throw new Error('更新キューに行があります。受入を中止。');
    const header=setting.getRange('A1:C2').getDisplayValues();
    if(JSON.stringify(header[0])!==JSON.stringify([
        '項目','変更後の名前（入力）','確認済みの名前'
      ])||header[1][0]!=='本棚名')
      throw new Error('設定シートの構造が不正。');
    function confirmSheet() {
      const row=setting.getRange('B2:C2').getDisplayValues()[0];
      if(row[0]!==EXPECTED_TO||row[1]!==EXPECTED_FROM)
        throw new Error('設定!B2/C2が承認された変更前後の値と不一致。');
    }
    confirmSheet();
    const token=ScriptApp.getOAuthToken();
    if(!token) throw new Error('OAuthトークンを取得できません。');
    const base='https://firestore.googleapis.com/v1/projects/'+
      encodeURIComponent(project)+'/databases/(default)/documents';
    const prefix='projects/'+project+'/databases/(default)/documents/';
    const familyPath='families/'+familyId;
    const commandFingerprint=yondeneSha256_(JSON.stringify([
      familyId,EXPECTED_FROM,EXPECTED_TO
    ]));
    if(!/^[a-f0-9]{64}$/.test(commandFingerprint))
      throw new Error('コマンドIDの生成形式が不正。');
    const commandId='shelf-name-'+commandFingerprint.slice(0,40);
    const command={
      schemaVersion:1,commandId:commandId,op:'family.rename',
      expectedName:EXPECTED_FROM,newName:EXPECTED_TO,
      reason:'非公開の設定シートから本棚名を変更'
    };
    const digest=yondeneSha256_(JSON.stringify(command));
    if(!/^[a-f0-9]{64}$/.test(digest))
      throw new Error('ダイジェスト形式が不正。');
    const markerPath=familyPath+'/chatgptMutations/'+commandId;
    function request(suffix,method,body) {
      const opt={method:method,headers:{Authorization:'Bearer '+token},
        muteHttpExceptions:true};
      if(body!==undefined) {
        opt.contentType='application/json';
        opt.payload=JSON.stringify(body);
      }
      const response=UrlFetchApp.fetch(base+suffix,opt);
      const status=response.getResponseCode();
      let data=null;
      try {data=JSON.parse(response.getContentText());}
      catch(e){if(status===200)throw new Error('Firestore応答がJSONでない。');}
      return {status:status,data:data};
    }
    function get(path,tx) {
      return request('/'+path.split('/').map(encodeURIComponent).join('/')+
        (tx?'?transaction='+encodeURIComponent(tx):''),'get');
    }
    function ok(r,label) {
      if(r.status!==200||!r.data)
        throw new Error(label+' HTTP '+r.status);
      return r.data;
    }
    function canonical(x) {
      if(Array.isArray(x))return x.map(canonical);
      if(x&&typeof x==='object') {
        const z={};
        Object.keys(x).sort().forEach(function(k){z[k]=canonical(x[k]);});
        return z;
      }
      return x;
    }
    function familyIdentity(doc,name) {
      return !!doc&&doc.name===prefix+familyPath&&!!doc.fields&&
        !!doc.fields.ownerUid&&
        doc.fields.ownerUid.stringValue===ownerUid&&
        !!doc.fields.name&&doc.fields.name.stringValue===name&&
        typeof doc.updateTime==='string'&&!!doc.updateTime;
    }
    function withoutName(doc) {
      const copy=JSON.parse(JSON.stringify(doc.fields));
      delete copy.name;
      return JSON.stringify(canonical(copy));
    }
    const before=ok(get(familyPath),'family GET');
    if(!familyIdentity(before,EXPECTED_FROM))
      throw new Error('変更前のFirestore本棚名または所有者が不一致。');
    if(get(markerPath).status!==404)
      throw new Error('同一改名マーカーが既存または照合不能。');
    let tx='',commitAttempted=false;
    try {
      const begun=ok(request(':beginTransaction','post',{}),'beginTransaction');
      tx=begun.transaction;
      if(typeof tx!=='string'||!tx||tx.length>8192)
        throw new Error('有効なFirestore transactionがありません。');
      const inside=ok(get(familyPath,tx),'family in transaction');
      if(!familyIdentity(inside,EXPECTED_FROM)||
          inside.updateTime!==before.updateTime||
          withoutName(inside)!==withoutName(before))
        throw new Error('家族情報が変化したため書き込みを中止。');
      if(get(markerPath,tx).status!==404)
        throw new Error('トランザクション内で改名マーカーが存在。');
      confirmSheet();
      const marker={
        source:{stringValue:'chatgpt-gas'},
        sourceRepository:{stringValue:'miyatayuuma/yondene-public'},
        commandId:{stringValue:commandId},op:{stringValue:'family.rename'},
        sourceDigest:{stringValue:digest},
        reason:{stringValue:command.reason},
        targetCollection:{stringValue:'families'},
        targetId:{stringValue:familyId},
        appliedAt:{timestampValue:new Date().toISOString()}
      };
      const writes=[
        {update:{name:prefix+familyPath,
          fields:{name:{stringValue:EXPECTED_TO}}},
          updateMask:{fieldPaths:['name']},
          currentDocument:{updateTime:inside.updateTime}},
        {update:{name:prefix+markerPath,fields:marker},
          currentDocument:{exists:false}}
      ];
      commitAttempted=true; // An ambiguous result must never be auto-retried.
      let result;
      try {result=request(':commit','post',{transaction:tx,writes:writes});}
      catch(e) {throw new Error('RENAME_UNCERTAIN: commit応答不明。再実行禁止。');}
      if(result.status!==200||!result.data||
          !Array.isArray(result.data.writeResults)||
          result.data.writeResults.length!==2)
        throw new Error('RENAME_UNCERTAIN: commit HTTP '+result.status+
          '。再実行せず照合。');
    } finally {
      if(tx&&!commitAttempted) {
        try {request(':rollback','post',{transaction:tx});}
        catch(e){Logger.log('transaction rollback warning');}
      }
    }
    const after=ok(get(familyPath),'family verification');
    const marker=ok(get(markerPath),'marker verification');
    if(!familyIdentity(after,EXPECTED_TO)||
        withoutName(after)!==withoutName(before)||
        after.createTime!==before.createTime||
        !marker||marker.name!==prefix+markerPath||!marker.fields||
        !marker.fields.sourceDigest||
        marker.fields.sourceDigest.stringValue!==digest||
        !marker.fields.commandId||
        marker.fields.commandId.stringValue!==commandId||
        !marker.fields.op||marker.fields.op.stringValue!=='family.rename'||
        !marker.fields.targetId||
        marker.fields.targetId.stringValue!==familyId)
      throw new Error('RENAME_UNCERTAIN: 永続証跡または不変性の照合失敗。C2は変更しません。');
    confirmSheet();
    setting.getRange('C2').setValue(EXPECTED_TO);
    SpreadsheetApp.flush();
    if(setting.getRange('C2').getDisplayValue()!==EXPECTED_TO)
      throw new Error('Firestore適用済みですがC2の反映を確認できません。再実行禁止。');
    Logger.log('よんでね本棚名変更 PASS: family.rename CAS+marker+verified; 設定C2反映');
    Logger.log('Firestore家族name以外のフィールド変更0件・読書記録変更0件・通常writer無効のまま');
    return {status:'PASS',operation:'family.rename',
      realFamilyNameChanged:true,otherFamilyFieldsChanged:0,
      bookMutations:0,markerCreated:1,settingsC2Verified:true};
  } finally {
    lock.releaseLock();
  }
}
