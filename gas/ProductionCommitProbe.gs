/**
 * Yondene production SYNTHETIC write probe, manual execution ONCE only.
 * The existing family, books, series, history and ChatGPT markers are READ-ONLY.
 * Creates exactly two new documents in an otherwise unused ROOT collection:
 *   yondene_gas_acceptance_tests/{random-id}-data
 *   yondene_gas_acceptance_tests/{random-id}-marker
 * No trigger, Sheet edit, auto-retry, deletion, or writer gate change.
 * Both synthetic documents are intentionally retained for independent review.
 */
function yondeneProductionCommitProbe() {
  if(typeof YONDENE!=='object'||!YONDENE||!YONDENE.project||
      !YONDENE.spreadsheetId) throw new Error('既存の設定がありません。');
  const sync=SpreadsheetApp.openById(YONDENE.spreadsheetId)
    .getSheetByName('同期状態');
  if(!sync) throw new Error('同期状態がありません。');
  const project=String(sync.getRange('B3').getDisplayValue()||'').trim();
  const familyId=String(sync.getRange('B7').getDisplayValue()||'').trim();
  const ownerUid=String(sync.getRange('B8').getDisplayValue()||'').trim();
  if(project!==YONDENE.project ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(familyId) ||
      !/^[A-Za-z0-9:_-]{1,128}$/.test(ownerUid))
    throw new Error('対象プロジェクト・家族の確認に失敗しました。');
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
  function requireOk(r,label) {
    if(r.code!==200)throw new Error(label+' HTTP '+r.code);
    return r.data;
  }
  const familyPath='/families/'+encodeURIComponent(familyId);
  function verifyFamily(doc) {
    return !!doc && !!doc.fields && !!doc.fields.ownerUid &&
      doc.fields.ownerUid.stringValue===ownerUid;
  }
  const baseline=requireOk(send(familyPath,'get'),'family GET');
  if(!verifyFamily(baseline)) throw new Error('家族所有者が不一致です。');

  const uuid=Utilities.getUuid();
  if(!/^[0-9a-fA-F-]{32,40}$/.test(uuid))
    throw new Error('テスト用ID生成に失敗しました。');
  const testId='stage-d-'+uuid.toLowerCase();
  const path='yondene_gas_acceptance_tests/'+testId;
  const dataPath=path+'-data', markerPath=path+'-marker';
  function fullName(p){return prefix+p;}
  function get(p,transaction) {
    return send('/'+p.split('/').map(encodeURIComponent).join('/')+
      (transaction?'?transaction='+encodeURIComponent(transaction):''),'get');
  }
  if(get(dataPath).code!==404||get(markerPath).code!==404)
    throw new Error('テスト用IDが既存文書と衝突しました。書き込みを中止。');
  const nonce='nonce-'+uuid.toLowerCase();
  const stamp=new Date().toISOString();
  function create(p,kind) {
    return {update:{name:fullName(p),fields:{
      source:{stringValue:'yondene-gas-production-probe'},
      kind:{stringValue:kind},nonce:{stringValue:nonce},
      testId:{stringValue:testId},createdAt:{timestampValue:stamp}
    }},currentDocument:{exists:false}};
  }
  const writes=[create(dataPath,'data'),create(markerPath,'marker')];
  let transaction='',attempted=false;
  try {
    const start=requireOk(send(':beginTransaction','post',{}),'beginTransaction');
    transaction=start && start.transaction;
    if(typeof transaction!=='string'||!transaction)
      throw new Error('トランザクションが取得できません。');
    const family=requireOk(get('families/'+familyId,transaction),'transaction family GET');
    if(!verifyFamily(family)) throw new Error('家族所有者が変化しました。');
    if(get(dataPath,transaction).code!==404 ||
        get(markerPath,transaction).code!==404)
      throw new Error('トランザクション内でテストIDが存在しています。');
    attempted=true; // No automatic retry, even after ambiguous failure.
    const committed=send(':commit','post',{transaction:transaction,writes:writes});
    if(committed.code!==200) throw new Error('COMMIT_UNCERTAIN HTTP '+
      committed.code+' testId='+testId+'; 再実行せず手動照合。');
    if(!committed.data||!Array.isArray(committed.data.writeResults)||
        committed.data.writeResults.length!==2)
      throw new Error('COMMIT_UNCERTAIN 応答不整合 testId='+testId+'; 手動照合。');
  } finally {
    if(transaction&&!attempted) {
      try {send(':rollback','post',{transaction:transaction});}
      catch(err) {Logger.log('rollback warning (no IDs)');}
    }
  }
  function assertSynthetic(p,kind) {
    const doc=requireOk(get(p),'post-commit '+kind);
    const fields=doc && doc.fields;
    if(!fields||!fields.source||fields.source.stringValue!=='yondene-gas-production-probe'||
        !fields.kind||fields.kind.stringValue!==kind ||
        !fields.nonce||fields.nonce.stringValue!==nonce ||
        !fields.testId||fields.testId.stringValue!==testId)
      throw new Error('作成後の'+kind+'文書の照合に失敗。testId='+testId);
    return doc;
  }
  const beforeData=assertSynthetic(dataPath,'data');
  const beforeMarker=assertSynthetic(markerPath,'marker');
  // Second commit must be rejected by exists:false, without any transaction replay.
  const repeat=send(':commit','post',{writes:writes});
  if(repeat.code!==409 && repeat.code!==412)
    throw new Error('重複作成拒否の検証に失敗 HTTP '+repeat.code+
      ' testId='+testId);
  const afterData=assertSynthetic(dataPath,'data');
  const afterMarker=assertSynthetic(markerPath,'marker');
  if(beforeData.updateTime!==afterData.updateTime ||
      beforeMarker.updateTime!==afterMarker.updateTime)
    throw new Error('重複試行で更新時刻が変化。testId='+testId);
  const afterFamily=requireOk(send(familyPath,'get'),'final family GET');
  if(!verifyFamily(afterFamily)) throw new Error('最終家族所有者検証に失敗。');
  Logger.log('よんでね本番合成書き込み検証 PASS: atomic2/replayRejected/verified; テスト専用2文書');
  Logger.log('testId='+testId+'（2文書の独立照合・後日削除に使用）');
  return {status:'PASS',testId:testId,atomicDocuments:2,
    duplicateRejected:true,verified:true,existingBookChanges:0,
    sheetWrites:0,cleanupPending:true};
}
