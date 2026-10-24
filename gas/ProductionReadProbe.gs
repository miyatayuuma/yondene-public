/**
 * Yondene production REST transaction READ PROBE (manual invocation only).
 *
 * No Firestore document mutations, no Sheet edits, no installable trigger,
 * and no changes to YONDENE_QUEUE.WRITE_ENABLED.
 * Requires private bound Code.gs's YONDENE configuration and existing
 * Apps Script authorization. Never print family IDs, UIDs, or response bodies.
 */
function yondeneProductionReadProbe() {
  const startedAt=Date.now();
  if(typeof YONDENE!=='object' || !YONDENE || !YONDENE.project ||
      !YONDENE.spreadsheetId)
    throw new Error('設定が不足しています。');
  const sheet=SpreadsheetApp.openById(YONDENE.spreadsheetId)
    .getSheetByName('同期状態');
  if(!sheet) throw new Error('同期状態シートがありません。');
  const project=String(sheet.getRange('B3').getDisplayValue()||'').trim();
  const familyId=String(sheet.getRange('B7').getDisplayValue()||'').trim();
  const ownerUid=String(sheet.getRange('B8').getDisplayValue()||'').trim();
  if(project!==YONDENE.project || !/^[A-Za-z0-9_-]{1,128}$/.test(familyId) ||
      !/^[A-Za-z0-9:_-]{1,128}$/.test(ownerUid))
    throw new Error('プロジェクトまたは対象家族の検証に失敗しました。');

  const token=ScriptApp.getOAuthToken();
  if(!token) throw new Error('OAuthトークンがありません。');
  const base='https://firestore.googleapis.com/v1/projects/'+
    encodeURIComponent(project)+'/databases/(default)/documents';
  const familyPath='/families/'+encodeURIComponent(familyId);
  const auth={Authorization:'Bearer '+token};
  function request(suffix,method,body,label) {
    const options={method:method,headers:auth,muteHttpExceptions:true};
    if(body!==undefined) {
      options.contentType='application/json';
      options.payload=JSON.stringify(body);
    }
    const response=UrlFetchApp.fetch(base+suffix,options);
    const code=response.getResponseCode();
    if(code!==200) throw new Error(label+' HTTP '+code);
    try {return JSON.parse(response.getContentText());}
    catch(err){throw new Error(label+' の応答がJSONではありません。');}
  }
  function ownerVerified(doc) {
    return !!doc && !!doc.fields && !!doc.fields.ownerUid &&
      doc.fields.ownerUid.stringValue===ownerUid;
  }
  const baseline=request(familyPath,'get',undefined,'family baseline');
  if(!ownerVerified(baseline)) throw new Error('家族の所有者を確認できません。');
  const name=baseline.fields.name && baseline.fields.name.stringValue;
  if(typeof name!=='string'||!name) throw new Error('本棚名が取得できません。');

  let transaction='', failure=null, queryChecked=false;
  try {
    const begun=request(':beginTransaction','post',{},'beginTransaction');
    if(typeof begun.transaction!=='string'||!begun.transaction)
      throw new Error('トランザクショントークンが空です。');
    transaction=begun.transaction;
    const inside=request(familyPath+'?transaction='+
      encodeURIComponent(transaction),'get',undefined,'transaction GET');
    if(!ownerVerified(inside) ||
        !inside.fields.name || inside.fields.name.stringValue!==name)
      throw new Error('トランザクション内の家族情報が基準値と不一致です。');
    const sentinel='yondene-read-probe-'+Utilities.getUuid();
    const results=request(familyPath+':runQuery','post',{
      structuredQuery:{
        from:[{collectionId:'books'}],
        where:{fieldFilter:{field:{fieldPath:'title'},op:'EQUAL',
          value:{stringValue:sentinel}}},limit:1
      },
      transaction:transaction
    },'transaction runQuery');
    if(!Array.isArray(results)||results.some(function(x){return !!x.document;}))
      throw new Error('クエリ応答形式または安全な不一致条件が想定外です。');
    queryChecked=true;
  } catch(err) {
    failure=err;
  } finally {
    if(transaction) {
      try {
        request(':rollback','post',{transaction:transaction},'rollback');
      } catch(err) {
        if(!failure) failure=err;
        Logger.log('よんでね読み取り検証: rollback失敗（機密情報なし）');
      }
    }
  }
  if(failure) throw failure;
  if(!queryChecked) throw new Error('トランザクションクエリが未実行です。');
  const result={status:'PASS',transactionRead:true,transactionQuery:true,
    rollback:true,productionMutations:0,sheetWrites:0,
    elapsedMs:Date.now()-startedAt};
  Logger.log('よんでね読み取り検証 PASS: tx read/query/rollback; Firestore更新0件');
  return result;
}
