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
  headers: ['コマンドID','登録時刻','操作','コマンドJSON','状態','処理日時',
    '結果コード','SHA256','試行回数','エラー概要'],
  maxRows: 3000,
  maxPendingPerRun: 10,
  maxCommandChars: 30000,
  WRITE_ENABLED: false, // Stage A: permanently read-only until reviewed cutover.
  ops: ['book.patch','series.patch'],
  bookFields: [
    'title','titleKana','author','authorKana','edition','originalAuthor','adaptedBy',
    'illustrator','translator','publisher','publicationYear','publicationDate','isbn',
    'pageCount','ageLabel','ageSource','seriesId','volume','status','finishedAt',
    'finishedPeriodLabel','finishedPeriodStart','finishedPeriodEnd','finishedPeriodPrecision',
    'finishedPeriodBasis','finishedPeriodNote','finishPrecision','readOrder','readingMode',
    'coverUrl','coverReferenceSource','coverEditionStatus','notes','editionNote','workType',
    'bibliographicSource','sourcePhotoNote','reportedAt'
  ],
  seriesFields: ['name','note','totalVolumes']
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
        const plan = yondeneQueuePreflight_(token, env, family, cmd);
        if (plan.already) {
          state = 'ALREADY'; code = 'MARKER_MATCH'; already++;
        } else {
          const result = yondeneQueueCommit_(token, env, cmd, plan);
          if (result === 'APPLIED') {
            state = 'APPLIED'; code = 'COMMIT_OK'; applied++;
          } else {
            state = 'ALREADY'; code = 'MARKER_MATCH_AFTER_COMMIT'; already++;
          }
        }
      } catch (err) {
        review++;
        code = /^競合:/.test(String(err.message || err)) ? 'PRECONDITION_CONFLICT' : 'MANUAL_REVIEW';
        if (code === 'PRECONDITION_CONFLICT') state = 'CONFLICT';
        detail = String(err.message || err).slice(0,280);
        // A timed-out commit may have succeeded: never retry blind.
      }
      env.sheet.getRange(item.row, 5, 1, 6).setValues([[
        state, new Date().toISOString(), code, digest, attempts, detail
      ]]);
      SpreadsheetApp.flush();
    });
    return {applied: applied, already: already, review: review};
  } finally {
    lock.releaseLock();
  }
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
  const commandId = String(cells[0]).trim();
  const op = String(cells[2]).trim();
  const raw = String(cells[3]);
  if (!raw || raw.length > YONDENE_QUEUE.maxCommandChars)
    throw new Error('コマンドJSONの長さが不正です。');
  let command;
  try { command = JSON.parse(raw); } catch(e) { throw new Error('コマンドJSONを解析できません。'); }
  if (!command || typeof command !== 'object' || Array.isArray(command))
    throw new Error('コマンドJSONはオブジェクトが必要です。');
  const names = ['schemaVersion','commandId','op','bookId','seriesId',
    'expectedTitle','expectedName','expectedUpdatedAt','patch','reason'];
  Object.keys(command).forEach(function(key) {
    if (names.indexOf(key) === -1) throw new Error('未知のコマンド項目: ' + key);
  });
  if (command.schemaVersion !== 1 || command.commandId !== commandId ||
      command.op !== op || YONDENE_QUEUE.ops.indexOf(op) === -1)
    throw new Error('コマンドID/操作/バージョンが一致しないか、未対応です。');
  if (typeof command.reason !== 'string' || !command.reason.trim() ||
      command.reason.length > 800) throw new Error('更新理由が必要です。');
  if (typeof command.expectedUpdatedAt !== 'string' ||
      !command.expectedUpdatedAt || command.expectedUpdatedAt.length > 40)
    throw new Error('expectedUpdatedAtが必要です。');
  const id = op === 'book.patch' ? command.bookId : command.seriesId;
  if (typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id))
    throw new Error('対象IDが不正です。');
  if (op === 'book.patch' && command.seriesId !== undefined)
    throw new Error('book.patchのトップレベルseriesIdは禁止です。');
  if (op === 'series.patch' && command.bookId !== undefined)
    throw new Error('series.patchのbookIdは禁止です。');
  if (op === 'book.patch' && (typeof command.expectedTitle !== 'string' ||
      !command.expectedTitle.trim() || command.expectedName !== undefined))
    throw new Error('expectedTitleが必要です。');
  if (op === 'series.patch' && (typeof command.expectedName !== 'string' ||
      !command.expectedName.trim() || command.expectedTitle !== undefined))
    throw new Error('expectedNameが必要です。');
  const patch = command.patch;
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) ||
      !Object.keys(patch).length) throw new Error('空のpatchは禁止です。');
  const allowed = op === 'book.patch' ? YONDENE_QUEUE.bookFields : YONDENE_QUEUE.seriesFields;
  Object.keys(patch).forEach(function(key) {
    if (allowed.indexOf(key) === -1) throw new Error('変更不可フィールド: ' + key);
    const value = patch[key];
    if (['publicationYear','pageCount','volume','readOrder','totalVolumes'].indexOf(key)!==-1) {
      if (value !== null && (!Number.isSafeInteger(value)||value<1||value>999999))
        throw new Error(key + 'は正の整数またはnullが必要です。');
    } else if (typeof value !== 'string' || value.length > 120000)
      throw new Error(key + 'は文字列が必要です。');
  });
  if (patch.status !== undefined &&
      ['read','reading','paused','unread'].indexOf(patch.status) === -1)
    throw new Error('読書状態が無効です。');
  if (patch.coverUrl && !/^https:\/\//i.test(patch.coverUrl) &&
      !/^data:image\/(?:jpeg|png|webp);base64,/i.test(patch.coverUrl))
    throw new Error('coverUrlが不正です。');
  if (patch.finishedAt && !/^\d{4}-(0[1-9]|1[0-2])(-([0-2]\d|3[01]))?$/.test(patch.finishedAt))
    throw new Error('finishedAtの形式が不正です。');
  if (patch.reportedAt && !yondeneQueueCalendarDate_(patch.reportedAt))
    throw new Error('reportedAtが不正です。');
  ['finishedPeriodStart','finishedPeriodEnd'].forEach(function(key){
    if (patch[key] && !/^\d{4}-(0[1-9]|1[0-2])$/.test(patch[key]))
      throw new Error(key+'はYYYY-MMが必要です。');
  });
  if (patch.finishedPeriodStart && patch.finishedPeriodEnd &&
      patch.finishedPeriodStart > patch.finishedPeriodEnd)
    throw new Error('読了期間が逆転しています。');
  if (Object.prototype.hasOwnProperty.call(patch,'title') && !patch.title.trim())
    throw new Error('書名は空にできません。');
  if (Object.prototype.hasOwnProperty.call(patch,'name') && !patch.name.trim())
    throw new Error('シリーズ名は空にできません。');
  // Digest reflects the canonical parsed JSON, not arbitrary cell whitespace.
  return {command:command, digest:yondeneSha256_(JSON.stringify(command)), targetId:id};
}

function yondeneQueueCalendarDate_(s) {
  if (typeof s!=='string' || !/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(s))
    return false;
  const t = new Date(s + 'T00:00:00Z');
  return !isNaN(t.getTime()) && t.toISOString().slice(0,10) === s;
}

function yondeneQueueFamily_(env, token) {
  const family = yondeneFirestoreRequest_(token, env.familyPath, 'GET', null, Date.now());
  if (yondeneField_(family,'ownerUid') !== env.ownerUid)
    throw new Error('ownerUidが一致しません。');
  return family;
}

function yondeneQueueDocument_(token, path) {
  const url = 'https://firestore.googleapis.com/v1/projects/' +
    encodeURIComponent(YONDENE.project) + '/databases/(default)/documents/' +
    path.split('/').map(encodeURIComponent).join('/');
  const response = UrlFetchApp.fetch(url,{
    method:'get',headers:{Authorization:'Bearer '+token},muteHttpExceptions:true
  });
  const status=response.getResponseCode();
  if (status===404) return null;
  if (status!==200) throw new Error('Firestore GET failed HTTP '+status);
  return JSON.parse(response.getContentText());
}

function yondeneQueuePreflight_(token, env, family, parsed) {
  if (yondeneField_(family,'ownerUid')!==env.ownerUid)
    throw new Error('family ownerが変化しました。');
  const c=parsed.command;
  const markerPath=env.familyPath+'/chatgptMutations/'+c.commandId;
  const marker=yondeneQueueDocument_(token,markerPath);
  if (marker) {
    if (yondeneField_(marker,'sourceDigest')!==parsed.digest)
      throw new Error('同一コマンドIDの適用証跡とダイジェストが不一致です。');
    return {already:true};
  }
  const collection=c.op==='book.patch'?'books':'series';
  const recordPath=env.familyPath+'/'+collection+'/'+parsed.targetId;
  const record=yondeneQueueDocument_(token,recordPath);
  if (!record) throw new Error('対象文書が存在しません。');
  const currentUpdatedAt=yondeneField_(record,'updatedAt')||'';
  if (currentUpdatedAt!==c.expectedUpdatedAt)
    throw new Error('競合: updatedAtが変わっています。');
  if (c.op==='book.patch' && yondeneField_(record,'title')!==c.expectedTitle)
    throw new Error('競合: 書名が変わっています。');
  if (c.op==='series.patch' && yondeneField_(record,'name')!==c.expectedName)
    throw new Error('競合: シリーズ名が変わっています。');
  if (!record.updateTime) throw new Error('Firestore updateTimeが取得できません。');
  const updates=Object.assign({}, c.patch, {updatedAt:new Date().toISOString()});
  if (c.op==='book.patch') {
    if (['title','author','isbn'].some(function(key) {
      return Object.prototype.hasOwnProperty.call(updates,key) &&
        updates[key] !== yondeneField_(record,key);
    })) throw new Error('書名・著者・ISBN変更は重複チェック実装まで保留です。');
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
      // Any old progress note needs human review before an automated completion.
      if (typeof yondeneField_(record,'notes')==='string' &&
          /(?:進捗|%|％|読書中|読み始めた)/.test(yondeneField_(record,'notes')) &&
          !Object.prototype.hasOwnProperty.call(updates,'notes'))
        throw new Error('進捗メモの整理が必要です。notesを明示してください。');
    }
    if (newStatus!=='read' && updates.status!==undefined &&
        !Object.prototype.hasOwnProperty.call(updates,'finishedAt'))
      updates.finishedAt='';
    if (newStatus!=='read' && updates.finishedAt)
      throw new Error('未読了の本に読了日を残せません。');
    if (updates.seriesId) {
      const target=yondeneQueueDocument_(token,env.familyPath+'/series/'+updates.seriesId);
      if (!target) throw new Error('参照するシリーズがありません。');
    }
  }
  if (c.op==='series.patch' && c.patch.name!==undefined &&
      c.patch.name!==c.expectedName)
    throw new Error('シリーズ改名は重複チェック未実装のため保留です。');
  return {already:false,recordPath:recordPath,markerPath:markerPath,
    recordUpdateTime:record.updateTime, updates:updates};
}

function yondeneQueueValue_(v) {
  if (v===null) return {nullValue:null};
  if (typeof v==='string') return {stringValue:v};
  if (Number.isSafeInteger(v)) return {integerValue:String(v)};
  throw new Error('未対応のFirestore値型です。');
}

function yondeneQueueCommit_(token, env, parsed, plan) {
  const c=parsed.command;
  const prefix='projects/'+YONDENE.project+'/databases/(default)/documents/';
  const fields={};
  Object.keys(plan.updates).forEach(function(key) {fields[key]=yondeneQueueValue_(plan.updates[key]);});
  const markerFields={
    source:{stringValue:'chatgpt-gas'},
    sourceRepository:{stringValue:'miyatayuuma/yondene-public'},
    commandId:{stringValue:c.commandId},op:{stringValue:c.op},
    sourceDigest:{stringValue:parsed.digest},
    reason:{stringValue:c.reason},
    targetCollection:{stringValue:c.op==='book.patch'?'books':'series'},
    targetId:{stringValue:parsed.targetId},
    appliedAt:{timestampValue:new Date().toISOString()}
  };
  const writes=[
    {update:{name:prefix+plan.recordPath,fields:fields},
      updateMask:{fieldPaths:Object.keys(plan.updates)},
      currentDocument:{updateTime:plan.recordUpdateTime}},
    {update:{name:prefix+plan.markerPath,fields:markerFields},
      currentDocument:{exists:false}}
  ];
  const response=UrlFetchApp.fetch(
    'https://firestore.googleapis.com/v1/projects/'+
      encodeURIComponent(YONDENE.project)+'/databases/(default)/documents:commit',
    {method:'post',contentType:'application/json',
      payload:JSON.stringify({writes:writes}),
      headers:{Authorization:'Bearer '+token},muteHttpExceptions:true});
  const code=response.getResponseCode();
  if (code===200) {
    const out=JSON.parse(response.getContentText());
    if (!out.writeResults || out.writeResults.length!==2)
      throw new Error('commit戻り値が不正: マーカーを再確認してください。');
    return 'APPLIED';
  }
  // Network uncertainty, concurrent writer, lost Sheet update:
  // only a durable marker with a matching digest can resolve to ALREADY.
  const marker=yondeneQueueDocument_(token,plan.markerPath);
  if (marker && yondeneField_(marker,'sourceDigest')===parsed.digest)
    return 'ALREADY';
  throw new Error('Firestore commit HTTP '+code+'。適用不明／競合のため手動確認が必要です。');
}
