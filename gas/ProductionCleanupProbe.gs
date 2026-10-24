/**
 * Yondene production Stage D independent RECONCILE + BOUNDED CLEANUP.
 * Manual, one-shot function; no triggers, Sheet edits or queue writer.
 * It touches only the two matching synthetic root-collection documents
 * created by yondeneProductionCommitProbe. No blind retries.
 */
function yondeneProductionProbeReconcileAndCleanup() {
  // Replace only this placeholder with the testId from the PASS log.
  const TEST_ID='REPLACE_WITH_TEST_ID';
  if(!/^stage-d-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(TEST_ID))
    throw new Error('testIdが未設定または不正です。何も変更しません。');
  if(typeof YONDENE!=='object'||!YONDENE||!YONDENE.project||
      !YONDENE.spreadsheetId) throw new Error('既存の設定がありません。');
  const sync=SpreadsheetApp.openById(YONDENE.spreadsheetId)
    .getSheetByName('同期状態');
  if(!sync) throw new Error('同期状態がありません。');
  const project=String(sync.getRange('B3').getDisplayValue()||'').trim();
  const familyId=String(sync.getRange('B7').getDisplayValue()||'').trim();
  const ownerUid=String(sync.getRange('B8').getDisplayValue()||'').trim();
  if(project!==YONDENE.project ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(familyId)||
      !/^[A-Za-z0-9:_-]{1,128}$/.test(ownerUid))
    throw new Error('プロジェクト・家族の確認に失敗しました。');
  const token=ScriptApp.getOAuthToken();
  if(!token) throw new Error('OAuthトークンがありません。');
  const base='https://firestore.googleapis.com/v1/projects/'+
    encodeURIComponent(project)+'/databases/(default)/documents';
  const prefix='projects/'+project+'/databases/(default)/documents/';
  const auth={Authorization:'Bearer '+token};
  function send(suffix,method,body) {
    const options={method:method,headers:auth,muteHttpExceptions:true};
    if(body!==undefined) {
      options.contentType='application/json';
      options.payload=JSON.stringify(body);
    }
    const response=UrlFetchApp.fetch(base+suffix,options);
    const code=response.getResponseCode();
    let data=null;
    try {data=JSON.parse(response.getContentText());}
    catch(err) {if(code===200) throw new Error('Firestore応答がJSONではありません。');}
    return {code:code,data:data};
  }
  function ok(r,label) {
    if(r.code!==200) throw new Error(label+' HTTP '+r.code);
    return r.data;
  }
  function get(path,transaction) {
    return send('/'+path.split('/').map(encodeURIComponent).join('/')+
      (transaction?'?transaction='+encodeURIComponent(transaction):''),'get');
  }
  const family=ok(get('families/'+familyId),'family');
  if(!family.fields||!family.fields.ownerUid||
      family.fields.ownerUid.stringValue!==ownerUid)
    throw new Error('家族所有者の確認に失敗。');
  const root='yondene_gas_acceptance_tests/'+TEST_ID;
  const dataPath=root+'-data',markerPath=root+'-marker';
  const expectedKeys=['createdAt','kind','nonce','source','testId'];
  function verify(doc,path,kind) {
    if(!doc||doc.name!==prefix+path||!doc.updateTime||!doc.fields)
      throw new Error(kind+'文書のパス・時刻が不正。');
    const f=doc.fields;
    if(JSON.stringify(Object.keys(f).sort())!==JSON.stringify(expectedKeys)||
        !f.source||f.source.stringValue!=='yondene-gas-production-probe'||
        !f.kind||f.kind.stringValue!==kind||
        !f.testId||f.testId.stringValue!==TEST_ID||
        !f.nonce||!/^nonce-[0-9a-f-]{36}$/.test(f.nonce.stringValue||'')||
        !f.createdAt||typeof f.createdAt.timestampValue!=='string')
      throw new Error(kind+'の出所・内容を証明できません。削除を中止。');
    return {time:doc.updateTime,nonce:f.nonce.stringValue,
      created:f.createdAt.timestampValue};
  }
  // Independent production read before opening the cleanup transaction.
  const beforeData=verify(ok(get(dataPath),'data GET'),dataPath,'data');
  const beforeMarker=verify(ok(get(markerPath),'marker GET'),markerPath,'marker');
  if(beforeData.nonce!==beforeMarker.nonce ||
      beforeData.created!==beforeMarker.created)
    throw new Error('2文書のnonce・作成時刻が不一致。削除を中止。');
  let transaction='',attempted=false;
  try {
    const start=ok(send(':beginTransaction','post',{}),'beginTransaction');
    transaction=start && start.transaction;
    if(typeof transaction!=='string'||!transaction)
      throw new Error('トランザクションがありません。');
    const inFamily=ok(get('families/'+familyId,transaction),'family in transaction');
    if(!inFamily.fields||!inFamily.fields.ownerUid||
        inFamily.fields.ownerUid.stringValue!==ownerUid)
      throw new Error('家族所有者が変化しました。');
    const inData=verify(ok(get(dataPath,transaction),'data in transaction'),
      dataPath,'data');
    const inMarker=verify(ok(get(markerPath,transaction),'marker in transaction'),
      markerPath,'marker');
    if(inData.time!==beforeData.time||inMarker.time!==beforeMarker.time||
        inData.nonce!==beforeData.nonce||inMarker.nonce!==beforeMarker.nonce)
      throw new Error('再読取で試験文書が変化。削除を中止。');
    const writes=[
      {delete:prefix+dataPath,currentDocument:{updateTime:inData.time}},
      {delete:prefix+markerPath,currentDocument:{updateTime:inMarker.time}}
    ];
    attempted=true; // Never retry an uncertain commit automatically.
    const committed=send(':commit','post',{transaction:transaction,writes:writes});
    if(committed.code!==200 || !committed.data ||
        !Array.isArray(committed.data.writeResults) ||
        committed.data.writeResults.length!==2)
      throw new Error('CLEANUP_UNCERTAIN HTTP '+committed.code+
        ' testId='+TEST_ID+'; 再実行せず手動照合。');
  } finally {
    if(transaction&&!attempted) {
      try {send(':rollback','post',{transaction:transaction});}
      catch(err) {Logger.log('rollback warning');}
    }
  }
  if(get(dataPath).code!==404||get(markerPath).code!==404)
    throw new Error('CLEANUP_UNCERTAIN: 2文書の消失を確認できません。');
  Logger.log('よんでね本番テスト後片付け PASS: independentReconcile/atomicDelete2/notFound2');
  Logger.log('Firestore実データ変更0件、テスト専用2文書削除、testId='+TEST_ID);
  return {status:'PASS',testId:TEST_ID,deletedSyntheticDocuments:2,
    preexistingDataMutations:0,sheetWrites:0};
}
