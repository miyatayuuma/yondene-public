/**
 * Yondene / Google Sheets command queue.
 * Public, code-only module. Paste into a NEW file named Queue.gs in the
 * existing Sheet-bound Apps Script project, alongside the private Code.gs.
 *
 * Initial safety state: WRITE_ENABLED is hardcoded false. Do NOT change until:
 * (1) independent staging tests pass; (2) legacy GitHub writer is disabled;
 * (3) marker and source-state reconciliation passes; and
 * (4) the owner approves a narrowly scoped production acceptance command.
 *
 * Requires the existing private Code.gs helpers: YONDENE,
 * yondeneFirestoreRequest_, yondeneField_, yondeneSha256_.
 */
const YONDENE_QUEUE = Object.freeze({
  sheet: '更新キュー',
  settingsSheet: '設定',
  headers: ['コマンドID','登録時刻','操作','コマンドJSON','状態','処理日時',
    '結果コード','SHA256','試行回数','エラー概要'],
  maxRows: 3000,
  maxPendingPerRun: 10,
  maxCommandChars: 30000,
  WRITE_ENABLED: false, // Stage C draft: write gate remains disabled.
  ops: ['book.patch','series.patch','book.create','series.create',
    'childRating.set','childReflection.create','catalog.audit'],
  bookFields: [
    'title','titleKana','author','authorKana','edition','originalAuthor','adaptedBy',
    'illustrator','translator','publisher','publicationYear','publicationDate','isbn',
    'pageCount','ageLabel','ageSource','seriesId','volume','status','finishedAt',
    'finishedPeriodLabel','finishedPeriodStart','finishedPeriodEnd','finishedPeriodPrecision',
    'finishedPeriodBasis','finishedPeriodNote','finishPrecision','readOrder','readingMode',
    'coverUrl','coverReferenceSource','coverEditionStatus','notes','editionNote','workType',
    'bibliographicSource','sourcePhotoNote','reportedAt'
  ],
  seriesFields: ['name','note','totalVolumes'],
  catalogFields: ['title','publicationYear','publicationDate','publicationYearBasis',
    'isbn','isbnEditionStatus','pageCount','publisher','illustrator','translator',
    'ageLabel','ageSource','volume','bibliographicSource','editionNote',
    'coverUrl','coverReferenceSource','coverEditionStatus']
});

/** Explicit manual audit; never writes to Firestore or any Sheet cell. */
function yondeneQueueDryRun() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('別のよんでね処理が実行中です。');
  try {
    const env = yondeneQueueEnvironment_();
    const pending = yondeneQueuePending_(env.sheet);
    const token = ScriptApp.getOAuthToken();
    const family = yondeneQueueFamily_(env, token);
    let ready = 0, conflicts = 0;
    pending.forEach(function(item) {
      try {
        const cmd = yondeneQueueParse_(item.cells);
        const preflight = yondeneQueuePreflight_(token, env, family, cmd);
        if (preflight.already) {
          Logger.log('row=' + item.row + ' ALREADY (same marker digest)');
        } else {
          ready++;
          Logger.log('row=' + item.row + ' READY ' + cmd.command.op +
            ' id=' + cmd.command.commandId);
        }
      } catch (err) {
        conflicts++;
        Logger.log('row=' + item.row + ' REVIEW ' + String(err.message || err).slice(0,300));
      }
    });
    const setting=yondeneQueueSettingsCommand_(env);
    if(setting) {
      try {
        const plan=yondeneQueuePreflight_(token,env,family,setting.parsed);
        Logger.log('settings dry-run '+(plan.already?'ALREADY':'READY')+
          ' name change (write disabled)');
      } catch(err) {
        conflicts++;
        Logger.log('settings dry-run REVIEW: '+String(err.message||err).slice(0,300));
      }
    }
    Logger.log('queue dry-run pending=' + pending.length + ' ready=' + ready +
      ' review=' + conflicts + ' writeEnabled=' + YONDENE_QUEUE.WRITE_ENABLED);
    return {pending: pending.length, ready: ready, review: conflicts, writeEnabled: false};
  } finally {
    lock.releaseLock();
  }
}

/** Not installed as a trigger. Hard-denied while WRITE_ENABLED is false. */
function yondeneQueueProcess() {
  if (!YONDENE_QUEUE.WRITE_ENABLED)
    throw new Error('GAS書き込みは未承認・無効です。キュー監査のみ実行できます。');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('別のよんでね処理が実行中です。');
  try {
    const env = yondeneQueueEnvironment_();
    const token = ScriptApp.getOAuthToken();
    const family = yondeneQueueFamily_(env, token);
    let applied = 0, already = 0, review = 0;
    yondeneQueuePending_(env.sheet).forEach(function(item) {
      const attempts = Number(item.cells[8] || 0) + 1;
      let state = 'REVIEW', code = 'UNKNOWN', digest = '', detail = '';
      try {
        const cmd = yondeneQueueParse_(item.cells);
        digest = cmd.digest;
        const result = yondeneQueueApplyTransaction_(token,env,cmd);
        if(result==='APPLIED') {
          state='APPLIED';code='COMMIT_OK';applied++;
        } else {
          state='ALREADY';code='MARKER_MATCH';already++;
        }
      } catch (err) {
        review++;
        code = /^(競合:|Firestore commit HTTP (409|412))/.test(String(err.message || err)) ? 'PRECONDITION_CONFLICT' : 'MANUAL_REVIEW';
        if (code === 'PRECONDITION_CONFLICT') state = 'CONFLICT';
        detail = String(err.message || err).slice(0,280);
        // A timed-out commit may have succeeded: never retry blind.
      }
      env.sheet.getRange(item.row, 5, 1, 6).setValues([[
        state, new Date().toISOString(), code, digest, attempts, detail
      ]]);
      SpreadsheetApp.flush();
    });
    let settingsResult='NO_CHANGE';
    try {settingsResult=yondeneQueueProcessSettings_(token,env);}
    catch(err) {
      settingsResult='REVIEW';
      Logger.log('settings write REVIEW: '+String(err.message||err).slice(0,300));
    }
    return {applied:applied,already:already,review:review,settings:settingsResult};
  } finally {
    lock.releaseLock();
  }
}

function yondeneQueueSettingsCommand_(env) {
  const ss=SpreadsheetApp.openById(YONDENE.spreadsheetId);
  const sheet=ss.getSheetByName(YONDENE_QUEUE.settingsSheet);
  if(!sheet) throw new Error('設定シートが存在しません。');
  const rows=sheet.getRange(1,1,2,3).getDisplayValues();
  if(JSON.stringify(rows[0])!==JSON.stringify([
    '項目','変更後の名前（入力）','確認済みの名前'
  ]) || rows[1][0]!=='本棚名') throw new Error('設定シートの構造が不正です。');
  const desired=String(rows[1][1]||''),current=String(rows[1][2]||'');
  function valid(s){return s.trim()===s&&s.length>=1&&s.length<=80&&
    !/[\u0000-\u001f\u007f]/.test(s);}
  if(!valid(desired)||!valid(current))
    throw new Error('本棚名は1〜80文字、前後空白・制御文字なしで入力してください。');
  if(desired===current) return null;
  const fingerprint=yondeneSha256_(JSON.stringify([
    env.familyId,current,desired
  ]));
  const command={
    schemaVersion:1,commandId:'shelf-name-'+fingerprint.slice(0,40),
    op:'family.rename',expectedName:current,newName:desired,
    reason:'非公開の設定シートから本棚名を変更'
  };
  return {sheet:sheet,desired:desired,
    parsed:{command:command,
      digest:yondeneSha256_(JSON.stringify(command)),targetId:env.familyId}};
}

function yondeneQueueProcessSettings_(token,env) {
  if(!YONDENE_QUEUE.WRITE_ENABLED)
    throw new Error('GAS書き込みは未承認・無効です。');
  const setting=yondeneQueueSettingsCommand_(env);
  if(!setting) return 'NO_CHANGE';
  // The setting's original value must agree with Firestore inside the transaction.
  // A matching immutable marker safely completes a Sheet update after a crash.
  const result=yondeneQueueApplyTransaction_(token,env,setting.parsed);
  if(result==='APPLIED'||result==='ALREADY') {
    const verified=yondeneQueueDocument_(token,env.familyPath);
    if(!verified||yondeneField_(verified,'name')!==setting.desired)
      throw new Error('本棚名の永続化を検証できません。設定の確認済み値は更新しません。');
    setting.sheet.getRange('C2').setValue(setting.desired);
    SpreadsheetApp.flush();
  }
  return result;
}

function yondeneQueueEnvironment_() {
  const ss = SpreadsheetApp.openById(YONDENE.spreadsheetId);
  const sheet = ss.getSheetByName(YONDENE_QUEUE.sheet);
  if (!sheet) throw new Error('更新キューが見つかりません。');
  const headers = sheet.getRange(1, 1, 1, 10).getDisplayValues()[0];
  if (JSON.stringify(headers) !== JSON.stringify(YONDENE_QUEUE.headers))
    throw new Error('更新キューのヘッダーが変更されています。');
  if (sheet.getLastRow() > YONDENE_QUEUE.maxRows)
    throw new Error('更新キューの行数が上限を超えています。');
  const status = ss.getSheetByName('同期状態');
  if (!status) throw new Error('同期状態がありません。');
  const familyId = String(status.getRange('B7').getDisplayValue() || '').trim();
  const ownerUid = String(status.getRange('B8').getDisplayValue() || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(familyId) ||
      !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/.test(ownerUid))
    throw new Error('同期状態の対象IDが無効です。');
  return {sheet: sheet, familyId: familyId, ownerUid: ownerUid,
    familyPath: 'families/' + familyId};
}

function yondeneQueuePending_(sheet) {
  const count = sheet.getLastRow() - 1;
  if (count <= 0) return [];
  const records = sheet.getRange(2,1,count,10).getDisplayValues();
  const seen = {};
  const queue = [];
  records.forEach(function(cells, index) {
    if (cells.every(function(x){return x === '';})) return;
    const id = String(cells[0] || '').trim();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id))
      throw new Error('row=' + (index+2) + ' コマンドIDが不正です。');
    if (seen[id]) throw new Error('コマンドID重複: ' + id);
    seen[id] = true;
    if (cells[4] === 'PENDING')
      queue.push({row:index+2,cells:cells});
    else if (['APPLIED','ALREADY','CONFLICT','REVIEW'].indexOf(cells[4]) === -1)
      throw new Error('row=' + (index+2) + ' 状態が不正です。');
  });
  if (queue.length > YONDENE_QUEUE.maxPendingPerRun)
    throw new Error('一度に処理するPENDINGが多すぎます。10件以下にしてください。');
  return queue;
}

function yondeneQueueParse_(cells) {
  const commandId=String(cells[0]).trim(), op=String(cells[2]).trim();
  const raw=String(cells[3]);
  if (!raw || raw.length>YONDENE_QUEUE.maxCommandChars)
    throw new Error('コマンドJSONの長さが不正です。');
  let c;
  try { c=JSON.parse(raw); } catch(e) { throw new Error('コマンドJSONを解析できません。'); }
  if (!c || typeof c!=='object' || Array.isArray(c))
    throw new Error('コマンドJSONはオブジェクトが必要です。');
  const allowed=['schemaVersion','commandId','op','bookId','seriesId','expectedTitle',
    'expectedName','expectedUpdatedAt','patch','book','series','stars','quote',
    'attribution','observedAt','reason','entries'];
  Object.keys(c).forEach(function(key){
    if (allowed.indexOf(key)===-1) throw new Error('未知のコマンド項目: '+key);
  });
  if (c.schemaVersion!==1 || c.commandId!==commandId ||
      c.op!==op || YONDENE_QUEUE.ops.indexOf(op)===-1)
    throw new Error('コマンドID/操作/バージョンが一致しないか、未対応です。');
  if (typeof c.reason!=='string' || !c.reason.trim() || c.reason.length>800)
    throw new Error('更新理由が必要です。');
  // Never reuse a historical GitHub command ID: raw-file and parsed-JSON
  // SHA-256 digests deliberately use different contracts.
  if(!/^gas-[A-Za-z0-9][A-Za-z0-9._-]{0,123}$/.test(c.commandId))
    throw new Error('新規GASキューのコマンドIDはgas-で始めてください。');
  if(op==='catalog.audit') {
    if(Object.keys(c).some(function(key){
      return ['schemaVersion','commandId','op','reason','entries'].indexOf(key)===-1;
    })) throw new Error('書誌監査に余分な項目があります。');
    yondeneQueueValidateCatalogAudit_(c.entries);
    return {command:c,digest:yondeneSha256_(JSON.stringify(c)),targetId:'catalog'};
  }
  if(c.entries!==undefined) throw new Error('書誌監査以外にentriesは指定できません。');
  const bookOp=op.startsWith('book.') || op==='childRating.set' || op==='childReflection.create';
  const id=bookOp?c.bookId:c.seriesId;
  if (typeof id!=='string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id))
    throw new Error('対象IDが不正です。');
  if (bookOp && c.seriesId!==undefined)
    throw new Error('seriesIdはbook内に格納してください。');
  if (!bookOp && c.bookId!==undefined) throw new Error('series操作にbookIdは禁止です。');

  const create=op==='book.create'||op==='series.create';
  const patch=op==='book.patch'||op==='series.patch';
  if (create) {
    if (c.expectedUpdatedAt!==undefined || c.expectedTitle!==undefined ||
        c.expectedName!==undefined || c.patch!==undefined ||
        c.stars!==undefined || c.quote!==undefined ||
        c.attribution!==undefined || c.observedAt!==undefined)
      throw new Error('新規登録には更新前条件・patchを付与しないでください。');
    if ((op==='book.create' && c.series!==undefined) ||
        (op==='series.create' && c.book!==undefined))
      throw new Error('新規登録の対象データが不正です。');
    const data=op==='book.create'?c.book:c.series;
    yondeneQueueValidateValues_(data,op==='book.create'?
      YONDENE_QUEUE.bookFields:YONDENE_QUEUE.seriesFields);
    if (op==='book.create') {
      if (typeof data.title!=='string'||!data.title.trim())
        throw new Error('書名は必須です。');
      if (['read','reading','paused','unread'].indexOf(data.status)===-1)
        throw new Error('状態が不正です。');
      if (data.status!=='read' && data.finishedAt)
        throw new Error('未読了の本には読了日を設定できません。');
      if (!data.coverUrl) throw new Error('書影URLを確認してください。');
    } else if (typeof data.name!=='string'||!data.name.trim())
      throw new Error('シリーズ名は必須です。');
  } else if (patch) {
    if (c.book!==undefined || c.series!==undefined || c.stars!==undefined ||
        c.quote!==undefined || c.attribution!==undefined || c.observedAt!==undefined)
      throw new Error('patchに余分なペイロードがあります。');
    if (typeof c.expectedUpdatedAt!=='string' || !c.expectedUpdatedAt ||
        c.expectedUpdatedAt.length>40)
      throw new Error('expectedUpdatedAtが必要です。');
    if (op==='book.patch') {
      if (typeof c.expectedTitle!=='string'||!c.expectedTitle.trim()||
          c.expectedName!==undefined)
        throw new Error('expectedTitleが必要です。');
    } else {
      if (typeof c.expectedName!=='string'||!c.expectedName.trim()||
          c.expectedTitle!==undefined)
        throw new Error('expectedNameが必要です。');
    }
    yondeneQueueValidateValues_(c.patch,op==='book.patch'?
      YONDENE_QUEUE.bookFields:YONDENE_QUEUE.seriesFields);
  } else {
    if (c.book!==undefined||c.series!==undefined||c.patch!==undefined||
        c.expectedUpdatedAt!==undefined||c.expectedName!==undefined)
      throw new Error('子どもの記録コマンドに余分な項目があります。');
    if (typeof c.expectedTitle!=='string'||!c.expectedTitle.trim()||
        c.expectedTitle.length>250)
      throw new Error('書名の事前条件が必要です。');
    if (op==='childRating.set') {
      if (c.quote!==undefined||c.attribution!==undefined||c.observedAt!==undefined||
          !Number.isInteger(c.stars)||c.stars<1||c.stars>5)
        throw new Error('星評価は1〜5のみです。');
    } else {
      if (c.stars!==undefined || typeof c.quote!=='string'||
          !c.quote.trim()||c.quote.length>3000 ||
          ['verbatim','parent-summary'].indexOf(c.attribution)===-1)
        throw new Error('感想本文と記録区分が必要です。');
      if (c.observedAt!==undefined &&
          (typeof c.observedAt!=='string'||c.observedAt.length>100))
        throw new Error('観察時期が不正です。');
    }
  }
  return {command:c,digest:yondeneSha256_(JSON.stringify(c)),targetId:id};
}

/**
 * Bibliographic-only multi-record audit. Identity edits (title/ISBN) must use
 * a dedicated book.patch with full transactional duplicate checks.
 */
function yondeneQueueValidateCatalogAudit_(entries) {
  if(!Array.isArray(entries)||entries.length<1||entries.length>50)
    throw new Error('書誌監査は1〜50件で指定してください。');
  const seen={};
  entries.forEach(function(e){
    if(!e||typeof e!=='object'||Array.isArray(e)||
       Object.keys(e).some(function(k){
         return ['id','expectedTitle','patch','expected'].indexOf(k)===-1;
       })) throw new Error('書誌監査の項目が不正です。');
    if(typeof e.id!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(e.id)||
       seen[e.id]) throw new Error('書誌監査のIDが重複または不正です。');
    seen[e.id]=true;
    if(typeof e.expectedTitle!=='string'||!e.expectedTitle.trim())
      throw new Error('書誌監査の照合書名が必要です。');
    if(!e.patch||typeof e.patch!=='object'||Array.isArray(e.patch)||
       !Object.keys(e.patch).length)
      throw new Error('書誌監査の修正項目が必要です。');
    Object.keys(e.patch).forEach(function(key){
      const value=e.patch[key];
      if(YONDENE_QUEUE.catalogFields.indexOf(key)===-1 ||
         key==='title'||key==='isbn')
        throw new Error('書誌監査では変更不可: '+key+'。書籍IDで個別訂正してください。');
      if(['publicationYear','pageCount','volume'].indexOf(key)!==-1) {
        if(!Number.isSafeInteger(value)||value<1||value>999999)
          throw new Error('書誌監査の数値が不正です。');
      } else if(typeof value!=='string'||value.length>1800)
        throw new Error('書誌監査の文字列が不正です。');
      if(key==='publicationDate' && !/^\d{4}-\d{2}(?:-\d{2})?$/.test(value))
        throw new Error('出版日の形式が不正です。');
      if(['bibliographicSource','coverUrl'].indexOf(key)!==-1 &&
         !/^https:\/\//.test(value)) throw new Error('書誌出典はHTTPSが必要です。');
      if(key==='publicationYearBasis' &&
         ['reference-edition','photo-confirmed-edition'].indexOf(value)===-1)
        throw new Error('出版年の根拠が不正です。');
      if(key==='isbnEditionStatus' &&
         ['reference-edition-unverified','photo-confirmed'].indexOf(value)===-1)
        throw new Error('ISBN版の状態が不正です。');
    });
    if(e.expected!==undefined) {
      if(!e.expected||typeof e.expected!=='object'||Array.isArray(e.expected))
        throw new Error('期待値が不正です。');
      Object.keys(e.expected).forEach(function(key){
        if(YONDENE_QUEUE.catalogFields.indexOf(key)===-1)
          throw new Error('書誌監査の期待値項目が不正です。');
        const value=e.expected[key];
        if(typeof value!=='string'&&typeof value!=='number'&&value!==null)
          throw new Error('書誌監査の期待値の型が不正です。');
      });
    }
  });
}

function yondeneQueueValidateValues_(data,allowed) {
  if (!data||typeof data!=='object'||Array.isArray(data)||
      !Object.keys(data).length) throw new Error('登録・更新データが空です。');
  Object.keys(data).forEach(function(key){
    if (allowed.indexOf(key)===-1) throw new Error('変更不可フィールド: '+key);
    const value=data[key];
    if (['publicationYear','pageCount','volume','readOrder','totalVolumes'].indexOf(key)!==-1) {
      if (value!==null && (!Number.isSafeInteger(value)||value<1||value>999999))
        throw new Error(key+'は正の整数またはnullが必要です。');
    } else if (typeof value!=='string'||value.length>120000)
      throw new Error(key+'は文字列が必要です。');
  });
  if (data.status!==undefined &&
      ['read','reading','paused','unread'].indexOf(data.status)===-1)
    throw new Error('読書状態が無効です。');
  if (data.coverUrl && !/^https:\/\//i.test(data.coverUrl)&&
      !/^data:image\/(?:jpeg|png|webp);base64,/i.test(data.coverUrl))
    throw new Error('coverUrlが不正です。');
  if (data.finishedAt && !/^\d{4}-(0[1-9]|1[0-2])$/.test(data.finishedAt) &&
      !yondeneQueueCalendarDate_(data.finishedAt))
    throw new Error('finishedAtの形式が不正です。');
  if (data.reportedAt!==undefined && !yondeneQueueCalendarDate_(data.reportedAt))
    throw new Error('reportedAtが不正です。');
  ['finishedPeriodStart','finishedPeriodEnd'].forEach(function(key){
    if (data[key]&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(data[key]))
      throw new Error(key+'はYYYY-MMが必要です。');
  });
  if (data.finishedPeriodStart&&data.finishedPeriodEnd&&
      data.finishedPeriodStart>data.finishedPeriodEnd)
    throw new Error('読了期間が逆転しています。');
  if (Object.prototype.hasOwnProperty.call(data,'title')&&!data.title.trim())
    throw new Error('書名は空にできません。');
  if (Object.prototype.hasOwnProperty.call(data,'name')&&!data.name.trim())
    throw new Error('シリーズ名は空にできません。');
}

function yondeneQueueCalendarDate_(s) {
  if (typeof s!=='string' || !/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(s))
    return false;
  const t = new Date(s + 'T00:00:00Z');
  return !isNaN(t.getTime()) && t.toISOString().slice(0,10) === s;
}

function yondeneQueueWithoutStaleProgressNotes_(value) {
  if(typeof value!=='string'||!value) return value;
  const pieces=value.split(/(?<=。)|(?<=\n)/u);
  const progress=/^(?:(?:約\s*)?\d{1,3}(?:\.\d+)?\s*[%％](?:(?:まで)?(?:進行中|読書中|読んだ|読み進めた|進捗))?|半分まで(?:読んだ|読み進めた)|進捗は保護者による概算|読書中|読み始めた)。?$/u;
  return pieces.filter(function(part){return !progress.test(part.trim());}).join('').trim();
}

function yondeneQueueDocumentName_(path) {
  return 'projects/'+YONDENE.project+'/databases/(default)/documents/'+path;
}

function yondeneQueueDatabaseUrl_() {
  return 'https://firestore.googleapis.com/v1/projects/' +
    encodeURIComponent(YONDENE.project)+'/databases/(default)/documents';
}

function yondeneQueueBeginTransaction_(token) {
  const response=UrlFetchApp.fetch(yondeneQueueDatabaseUrl_()+':beginTransaction',{
    method:'post',contentType:'application/json',payload:'{}',
    headers:{Authorization:'Bearer '+token},muteHttpExceptions:true
  });
  if(response.getResponseCode()!==200)
    throw new Error('Firestore beginTransaction HTTP '+response.getResponseCode());
  const transaction=JSON.parse(response.getContentText()).transaction;
  if(typeof transaction!=='string'||!transaction||transaction.length>8192)
    throw new Error('Firestore transaction IDの取得に失敗しました。');
  return transaction;
}

function yondeneQueueRollback_(token,transaction) {
  const response=UrlFetchApp.fetch(yondeneQueueDatabaseUrl_()+':rollback',{
    method:'post',contentType:'application/json',
    payload:JSON.stringify({transaction:transaction}),
    headers:{Authorization:'Bearer '+token},muteHttpExceptions:true
  });
  if(response.getResponseCode()!==200)
    throw new Error('Firestore rollback HTTP '+response.getResponseCode());
}

function yondeneQueueApplyTransaction_(token,env,parsed) {
  if(!YONDENE_QUEUE.WRITE_ENABLED)
    throw new Error('GAS書き込みは未承認・無効です。');
  const transaction=yondeneQueueBeginTransaction_(token);
  let commitAttempted=false;
  try {
    const family=yondeneQueueDocument_(token,env.familyPath,transaction);
    if(!family) throw new Error('家族ドキュメントが存在しません。');
    const plan=yondeneQueuePreflight_(token,env,family,parsed,transaction);
    if(plan.already) return 'ALREADY';
    commitAttempted=true;
    return yondeneQueueCommit_(token,env,parsed,plan,transaction);
  } finally {
    if(!commitAttempted) {
      try {yondeneQueueRollback_(token,transaction);}
      catch(err){Logger.log('rollback warning: '+String(err.message||err).slice(0,160));}
    }
  }
}

function yondeneQueueFamily_(env, token) {
  const family = yondeneFirestoreRequest_(token, env.familyPath, 'GET', null, Date.now());
  if (yondeneField_(family,'ownerUid') !== env.ownerUid)
    throw new Error('ownerUidが一致しません。');
  return family;
}

function yondeneQueueDocument_(token, path, transaction) {
  const url = 'https://firestore.googleapis.com/v1/projects/' +
    encodeURIComponent(YONDENE.project) + '/databases/(default)/documents/' +
    path.split('/').map(encodeURIComponent).join('/') +
    (transaction?'?transaction='+encodeURIComponent(transaction):'');
  const response = UrlFetchApp.fetch(url,{
    method:'get',headers:{Authorization:'Bearer '+token},muteHttpExceptions:true
  });
  const status=response.getResponseCode();
  if (status===404) return null;
  if (status!==200) throw new Error('Firestore GET failed HTTP '+status);
  return JSON.parse(response.getContentText());
}

function yondeneQueueQuery_(token, familyPath, collection, field, value, limit, transaction) {
  const parent='https://firestore.googleapis.com/v1/projects/' +
    encodeURIComponent(YONDENE.project)+'/databases/(default)/documents/' +
    familyPath.split('/').map(encodeURIComponent).join('/')+':runQuery';
  const payload={structuredQuery:{
    from:[{collectionId:collection}],
    where:{fieldFilter:{field:{fieldPath:field},op:'EQUAL',value:{stringValue:value}}},
    limit:limit
  }};
  if(transaction) payload.transaction=transaction;
  const response=UrlFetchApp.fetch(parent,{
    method:'post',contentType:'application/json',
    headers:{Authorization:'Bearer '+token},payload:JSON.stringify(payload),
    muteHttpExceptions:true
  });
  if(response.getResponseCode()!==200)
    throw new Error('Firestore query failed HTTP '+response.getResponseCode());
  const entries=JSON.parse(response.getContentText());
  if (!Array.isArray(entries)) throw new Error('Firestore queryの応答形式が不正です。');
  return entries.filter(function(x){return x.document;}).map(function(x){return x.document;});
}

function yondeneQueuePreflight_(token, env, family, parsed, transaction) {
  if (yondeneField_(family,'ownerUid')!==env.ownerUid)
    throw new Error('family ownerが変化しました。');
  const c=parsed.command;
  const markerPath=env.familyPath+'/chatgptMutations/'+c.commandId;
  const marker=yondeneQueueDocument_(token,markerPath,transaction);
  if (marker) {
    if (yondeneField_(marker,'sourceDigest')!==parsed.digest)
      throw new Error('同一コマンドIDの適用証跡とダイジェストが不一致です。');
    return {already:true};
  }
  if(c.op==='family.rename') {
    if(yondeneField_(family,'name')!==c.expectedName)
      throw new Error('競合: Firestoreの本棚名が変更されています。');
    if(!family.updateTime) throw new Error('家族文書のupdateTimeがありません。');
    return {already:false,action:'patch',recordPath:env.familyPath,
      recordUpdateTime:family.updateTime,markerPath:markerPath,
      updates:{name:c.newName}};
  }
  if(c.op==='catalog.audit') {
    const patches=[],now=new Date().toISOString();
    c.entries.forEach(function(e){
      const path=env.familyPath+'/books/'+e.id;
      const record=yondeneQueueDocument_(token,path,transaction);
      if(!record||yondeneField_(record,'title')!==e.expectedTitle)
        throw new Error('書誌監査の書籍ID・書名が一致しません。');
      if(!record.updateTime)
        throw new Error('書誌監査の更新時刻を取得できません。');
      const delta={};
      Object.keys(e.patch).forEach(function(key){
        const field=(record.fields||{})[key];
        let before;
        if(!field) before=undefined;
        else if(Object.prototype.hasOwnProperty.call(field,'stringValue'))
          before=field.stringValue;
        else if(Object.prototype.hasOwnProperty.call(field,'integerValue'))
          before=Number(field.integerValue);
        else if(Object.prototype.hasOwnProperty.call(field,'nullValue'))
          before=null;
        else throw new Error('書誌監査で未対応の既存データ型です。');
        const after=e.patch[key];
        if(before===after) return;
        if(before!==undefined&&before!==null&&before!=='' &&
           (!e.expected||!Object.prototype.hasOwnProperty.call(e.expected,key)||
            e.expected[key]!==before))
          throw new Error('書誌監査の既存値が変わっています。');
        delta[key]=after;
      });
      if(Object.keys(delta).length) {
        delta.updatedAt=now;
        patches.push({recordPath:path,recordUpdateTime:record.updateTime,updates:delta});
      }
    });
    return {already:false,action:'multi-patch',markerPath:markerPath,
      patches:patches,markerExtra:{entryCount:c.entries.length,updatedCount:patches.length}};
  }
  if (c.op==='book.create'||c.op==='series.create') {
    const isBook=c.op==='book.create';
    const collection=isBook?'books':'series';
    const recordPath=env.familyPath+'/'+collection+'/'+parsed.targetId;
    if (yondeneQueueDocument_(token,recordPath,transaction))
      throw new Error('対象IDの文書がすでに存在します。');
    const data=Object.assign({},isBook?c.book:c.series);
    const now=new Date().toISOString();
    if(isBook) {
      const sameTitle=yondeneQueueQuery_(token,env.familyPath,'books','title',data.title,10,transaction);
      if(sameTitle.length===10)
        throw new Error('同じ書名の本が多すぎます。版の照合が必要です。');
      if(sameTitle.some(function(doc){
        return yondeneField_(doc,'author')===(data.author||'');
      })) throw new Error('同名・同著者の本が登録済みです。');
      if(data.isbn) {
        const sameIsbn=yondeneQueueQuery_(token,env.familyPath,'books','isbn',data.isbn,2,transaction);
        if(sameIsbn.length) throw new Error('同じISBNの本が登録済みです。');
      }
      if(data.seriesId&&!yondeneQueueDocument_(token,env.familyPath+'/series/'+data.seriesId,transaction))
        throw new Error('参照するシリーズがありません。');
      if(data.status==='read' && !data.finishedAt &&
          yondeneQueueCalendarDate_(data.reportedAt)) {
        data.finishedAt=data.reportedAt;
        data.finishedPeriodBasis='completion_report_date';
      }
      if(data.status==='read' && typeof data.notes==='string')
        data.notes=yondeneQueueWithoutStaleProgressNotes_(data.notes);
      if(!data.finishedAt)data.finishedAt='';
      if(!data.seriesId)data.seriesId='';
      data.id=parsed.targetId;
      data.createdAt=now;
    } else {
      const sameName=yondeneQueueQuery_(token,env.familyPath,'series','name',data.name,2,transaction);
      if(sameName.length) throw new Error('同名のシリーズが登録済みです。');
      data.id=parsed.targetId;
    }
    data.updatedAt=now;
    return {already:false,action:'create',recordPath:recordPath,markerPath:markerPath,
      updates:data};
  }
  if (c.op==='childRating.set'||c.op==='childReflection.create') {
    const book=yondeneQueueDocument_(token,env.familyPath+'/books/'+c.bookId,transaction);
    if(!book || yondeneField_(book,'title')!==c.expectedTitle)
      throw new Error('書籍ID・書名が一致しません。');
    if (c.op==='childRating.set') {
      if (['read','reading','paused'].indexOf(yondeneField_(book,'status'))===-1)
        throw new Error('評価できる読書状態ではありません。');
      const recordPath=env.familyPath+'/childBookRatings/'+c.bookId;
      const rating=yondeneQueueDocument_(token,recordPath,transaction);
      if(rating && yondeneField_(rating,'stars')!==c.stars)
        throw new Error('既存の★評価と異なるため自動上書きしません。');
      return {already:false,action:rating?'marker-only':'create',
        recordPath:recordPath,markerPath:markerPath,
        updates:rating?{}:{
          stars:c.stars,enteredByUid:env.ownerUid,
          createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
        },
        markerExtra:{ratingCreated:!rating}};
    }
    const recordPath=env.familyPath+'/books/'+c.bookId+
      '/childReflections/'+c.commandId;
    const activityPath=env.familyPath+'/activity/reflection-'+c.commandId;
    if (yondeneQueueDocument_(token,recordPath,transaction) ||
        yondeneQueueDocument_(token,activityPath,transaction))
      throw new Error('感想または活動履歴のIDがすでに存在します。');
    const now=new Date().toISOString();
    return {already:false,action:'create',recordPath:recordPath,markerPath:markerPath,
      updates:{quote:c.quote,attribution:c.attribution,observedAt:c.observedAt||'',
        createdAt:now,source:'chatgpt-gas'},
      activityPath:activityPath,activityData:{
        actorUid:env.ownerUid,kind:'reflection',title:c.expectedTitle,
        bookId:c.bookId,sourceId:c.commandId,hidden:false,createdAt:now
      }};
  }
  const collection=c.op==='book.patch'?'books':'series';
  const recordPath=env.familyPath+'/'+collection+'/'+parsed.targetId;
  const record=yondeneQueueDocument_(token,recordPath,transaction);
  if (!record) throw new Error('対象文書が存在しません。');
  const currentUpdatedAt=yondeneField_(record,'updatedAt')||'';
  if (currentUpdatedAt!==c.expectedUpdatedAt)
    throw new Error('競合: updatedAtが変わっています。');
  if (c.op==='book.patch' && yondeneField_(record,'title')!==c.expectedTitle)
    throw new Error('競合: 書名が変わっています。');
  if (c.op==='series.patch' && yondeneField_(record,'name')!==c.expectedName)
    throw new Error('競合: シリーズ名が変わっています。');
  if (!record.updateTime) throw new Error('Firestore updateTimeが取得できません。');
  const updates=Object.assign({},c.patch,{updatedAt:new Date().toISOString()});
  if (c.op==='book.patch') {
    // Identity-changing bibliographic corrections need transactional uniqueness
    // checks. Keep the current document ID stable and never infer an edition
    // solely from a title match.
    const title=Object.prototype.hasOwnProperty.call(updates,'title')?
      updates.title:yondeneField_(record,'title');
    const author=Object.prototype.hasOwnProperty.call(updates,'author')?
      updates.author:yondeneField_(record,'author');
    const isbn=Object.prototype.hasOwnProperty.call(updates,'isbn')?
      updates.isbn:yondeneField_(record,'isbn');
    if(title!==yondeneField_(record,'title') ||
       author!==yondeneField_(record,'author')) {
      const sameTitle=yondeneQueueQuery_(
        token,env.familyPath,'books','title',title,10,transaction);
      if(sameTitle.length===10)
        throw new Error('同名書籍が多すぎます。版の個別照合が必要です。');
      if(sameTitle.some(function(doc){
        return doc.name!==yondeneQueueDocumentName_(recordPath) &&
          yondeneField_(doc,'author')===author;
      })) throw new Error('同名・同著者の別ID書籍が存在します。');
    }
    if(isbn && isbn!==yondeneField_(record,'isbn')) {
      const sameIsbn=yondeneQueueQuery_(
        token,env.familyPath,'books','isbn',isbn,2,transaction);
      if(sameIsbn.length===2)
        throw new Error('同じISBNの書籍が複数存在します。手動照合が必要です。');
      if(sameIsbn.some(function(doc){
        return doc.name!==yondeneQueueDocumentName_(recordPath);
      })) throw new Error('同じISBNの別ID書籍が存在します。');
    }
    const oldStatus=yondeneField_(record,'status');
    const newStatus=updates.status===undefined?oldStatus:updates.status;
    if (newStatus==='read' && oldStatus!=='read') {
      const period=['finishedAt','finishedPeriodLabel','finishedPeriodStart',
        'finishedPeriodEnd','finishedPeriodPrecision','finishedPeriodBasis',
        'finishedPeriodNote','finishPrecision'];
      if (!period.some(function(key){return Object.prototype.hasOwnProperty.call(updates,key);}) &&
          yondeneQueueCalendarDate_(updates.reportedAt)) {
        updates.finishedAt=updates.reportedAt;
        updates.finishedPeriodBasis='completion_report_date';
      }
      const originalNotes=Object.prototype.hasOwnProperty.call(updates,'notes') ?
        updates.notes : yondeneField_(record,'notes');
      if(typeof originalNotes==='string') {
        const withoutProgress=yondeneQueueWithoutStaleProgressNotes_(originalNotes);
        if(withoutProgress!==originalNotes) updates.notes=withoutProgress;
      }
    }
    if (newStatus!=='read' && updates.status!==undefined &&
        !Object.prototype.hasOwnProperty.call(updates,'finishedAt'))
      updates.finishedAt='';
    if (newStatus!=='read' && updates.finishedAt)
      throw new Error('未読了の本に読了日を残せません。');
    if (updates.seriesId) {
      const target=yondeneQueueDocument_(token,env.familyPath+'/series/'+updates.seriesId,transaction);
      if (!target) throw new Error('参照するシリーズがありません。');
    }
  }
  if(c.op==='series.patch' && c.patch.name!==undefined &&
     c.patch.name!==c.expectedName) {
    const names=yondeneQueueQuery_(
      token,env.familyPath,'series','name',c.patch.name,2,transaction);
    if(names.length===2)
      throw new Error('同名シリーズが複数存在します。手動照合が必要です。');
    if(names.some(function(doc){
      return doc.name!==yondeneQueueDocumentName_(recordPath);
    })) throw new Error('同名シリーズが別IDで登録済みです。');
  }
  return {already:false,action:'patch',recordPath:recordPath,markerPath:markerPath,
    recordUpdateTime:record.updateTime,updates:updates};
}

function yondeneQueueValue_(v) {
  if (v===null) return {nullValue:null};
  if (typeof v==='string') return {stringValue:v};
  if (Number.isSafeInteger(v)) return {integerValue:String(v)};
  if (typeof v==='boolean') return {booleanValue:v};
  throw new Error('未対応のFirestore値型です。');
}

function yondeneQueueCommit_(token, env, parsed, plan, transaction) {
  if(!YONDENE_QUEUE.WRITE_ENABLED)
    throw new Error('GAS書き込みは未承認・無効です。');
  if(!transaction) throw new Error('Firestore transactionが必要です。');
  const c=parsed.command;
  const prefix='projects/'+YONDENE.project+'/databases/(default)/documents/';
  const markerFields={
    source:{stringValue:'chatgpt-gas'},
    sourceRepository:{stringValue:'miyatayuuma/yondene-public'},
    sourceCommandChannel:{stringValue:'private-google-sheet'},
    sourceDigestScheme:{stringValue:'sha256-json-stringify-v1'},
    commandId:{stringValue:c.commandId},op:{stringValue:c.op},
    sourceDigest:{stringValue:parsed.digest},
    reason:{stringValue:c.reason},
    targetCollection:{stringValue:c.op==='family.rename'?'families':
      c.op==='childRating.set'?'childBookRatings':
      c.op==='childReflection.create'?'childReflections':
      c.op==='catalog.audit'?'books':
      c.op.startsWith('book.')?'books':'series'},
    targetId:{stringValue:parsed.targetId},
    appliedAt:{timestampValue:new Date().toISOString()}
  };
  if(plan.markerExtra) Object.keys(plan.markerExtra).forEach(function(key){
    markerFields[key]=yondeneQueueValue_(plan.markerExtra[key]);
  });
  const writes=[];
  function encodeFields(data, useFirestoreTimestamp) {
    const fields={};
    Object.keys(data).forEach(function(key){
      if(useFirestoreTimestamp && (key==='createdAt'||key==='updatedAt'))
        fields[key]={timestampValue:data[key]};
      else fields[key]=yondeneQueueValue_(data[key]);
    });
    return fields;
  }
  if(plan.action==='multi-patch') {
    (plan.patches||[]).forEach(function(patch){
      writes.push({update:{
        name:prefix+patch.recordPath,fields:encodeFields(patch.updates,false)
      },updateMask:{fieldPaths:Object.keys(patch.updates)},
        currentDocument:{updateTime:patch.recordUpdateTime}});
    });
  } else if(plan.action!=='marker-only') {
    const target={update:{
      name:prefix+plan.recordPath,fields:encodeFields(plan.updates,
        c.op==='childRating.set'||c.op==='childReflection.create')
    }};
    if(plan.action==='patch') {
      target.updateMask={fieldPaths:Object.keys(plan.updates)};
      target.currentDocument={updateTime:plan.recordUpdateTime};
    } else if(plan.action==='create') {
      target.currentDocument={exists:false};
    } else throw new Error('不正なプラン操作です。');
    writes.push(target);
  }
  if(plan.activityPath) writes.push({update:{
    name:prefix+plan.activityPath,fields:encodeFields(plan.activityData,true)
  },currentDocument:{exists:false}});
  writes.push({update:{name:prefix+plan.markerPath,fields:markerFields},
    currentDocument:{exists:false}});
  const response=UrlFetchApp.fetch(
    'https://firestore.googleapis.com/v1/projects/'+
      encodeURIComponent(YONDENE.project)+'/databases/(default)/documents:commit',
    {method:'post',contentType:'application/json',
      payload:JSON.stringify(transaction?{writes:writes,transaction:transaction}:{writes:writes}),
      headers:{Authorization:'Bearer '+token},muteHttpExceptions:true});
  const code=response.getResponseCode();
  if (code===200) {
    const out=JSON.parse(response.getContentText());
    if (!out.writeResults || out.writeResults.length!==writes.length)
      throw new Error('commit戻り値が不正: マーカーを再確認してください。');
    return 'APPLIED';
  }
  // Network uncertainty or concurrent writer: only matching durable marker
  // can resolve to ALREADY. No blind retries.
  const marker=yondeneQueueDocument_(token,plan.markerPath);
  if (marker && yondeneField_(marker,'sourceDigest')===parsed.digest)
    return 'ALREADY';
  throw new Error('Firestore commit HTTP '+code+'。適用不明／競合のため手動確認が必要です。');
}
