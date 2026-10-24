// Stage A: queue validation only. This file intentionally contains no Firestore write call.
const QUEUE_HEADERS = Object.freeze(['コマンドID','登録時刻','操作','コマンドJSON','状態','処理日時','結果コード','SHA256','試行回数','エラー概要']);
const QUEUE_OPS = new Set(['book.create','book.patch','series.create','series.patch','childRating.set','childReflection.create']);
const QUEUE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
function yondeneQueueValidate_(row) {
  if (!Array.isArray(row) || row.length < 5) throw Error('QUEUE_ROW_INVALID');
  const [id, , op, raw, status] = row;
  if (typeof id !== 'string' || !QUEUE_ID.test(id) || status !== 'PENDING') throw Error('QUEUE_STATE_INVALID');
  if (typeof raw !== 'string' || raw.length > 100000) throw Error('QUEUE_PAYLOAD_INVALID');
  const cmd = JSON.parse(raw);
  if (!cmd || Array.isArray(cmd) || cmd.schemaVersion !== 1 || cmd.commandId !== id || cmd.op !== op || !QUEUE_OPS.has(op)) throw Error('QUEUE_COMMAND_INVALID');
  if (typeof cmd.reason !== 'string' || !cmd.reason.trim() || cmd.reason.length > 800) throw Error('QUEUE_REASON_INVALID');
  if (['book.patch','series.patch'].includes(op) && (typeof cmd.expectedUpdatedAt !== 'string' || !cmd.expectedUpdatedAt)) throw Error('QUEUE_REVISION_REQUIRED');
  return cmd;
}
function yondeneQueueAuditStageA() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('更新キュー');
  if (!sheet) throw Error('QUEUE_SHEET_MISSING');
  const header = sheet.getRange(1,1,1,10).getDisplayValues()[0];
  if (JSON.stringify(header) !== JSON.stringify(QUEUE_HEADERS)) throw Error('QUEUE_HEADERS_CHANGED');
  const rows = sheet.getLastRow() > 1 ? sheet.getRange(2,1,sheet.getLastRow()-1,10).getValues() : [];
  const seen = new Set();
  let pending = 0;
  for (const row of rows) {
    if (!row[0]) continue;
    if (seen.has(row[0])) throw Error('QUEUE_DUPLICATE_ID');
    seen.add(row[0]);
    if (row[4] === 'PENDING') { yondeneQueueValidate_(row); pending++; }
  }
  Logger.log('QUEUE_STAGE_A_PASS rows=' + seen.size + ' pending=' + pending + ' writes=0');
  return {rows:seen.size,pending,writes:0};
}
function yondeneQueueApply() { throw Error('GAS_FIRESTORE_WRITER_DISABLED'); }
