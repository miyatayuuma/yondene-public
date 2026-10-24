import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';

const source = readFileSync(new URL('./Queue.gs', import.meta.url), 'utf8');
const DATE = '2026-10-24T09:00:00Z';
const FAM = 'families/example-family';

function setup() {
  let marker = null, updatedAt = DATE, committed = null, commits = 0;
  const ctx = {
    YONDENE: {project:'example-project', spreadsheetId:'example-sheet'},
    yondeneSha256_: x => createHash('sha256').update(x,'utf8').digest('hex'),
    yondeneField_: (d,k) => d?.fields?.[k]?.stringValue ?? '',
    yondeneFirestoreRequest_: () => ({fields:{ownerUid:{stringValue:'owner-1'}}}),
    UrlFetchApp: {fetch:(url,opts) => {
      if (opts.method === 'get') {
        let data = null;
        if (url.includes('/chatgptMutations/')) data = marker;
        if (url.includes('/books/demo-book')) data = {
          updateTime:'2026-10-24T09:01:02.123456Z',
          fields:{title:{stringValue:'Demo Book'},status:{stringValue:'reading'},
            updatedAt:{stringValue:updatedAt},notes:{stringValue:''}}
        };
        return {getResponseCode:()=>data ? 200 : 404,
          getContentText:()=>JSON.stringify(data)};
      }
      if (opts.method === 'post') {
        commits++;
        committed = JSON.parse(opts.payload);
        return {getResponseCode:()=>200,
          getContentText:()=>JSON.stringify({writeResults:[{},{}]})};
      }
      throw new Error('Unexpected HTTP method');
    }},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
    Logger:{log:()=>{}},ScriptApp:{getOAuthToken:()=>'fake'},
    SpreadsheetApp:{flush:()=>{}},
    Date,JSON,Number,Object,String,Array,Math,RegExp,Error,Set,
  };
  vm.createContext(ctx);
  vm.runInContext(source,ctx,{filename:'Queue.gs'});
  const api = vm.runInContext('({cfg:YONDENE_QUEUE, parse:yondeneQueueParse_, preflight:yondeneQueuePreflight_, commit:yondeneQueueCommit_, pending:yondeneQueuePending_, process:yondeneQueueProcess})',ctx);
  const command = {schemaVersion:1,commandId:'demo-command-001',
    op:'book.patch',bookId:'demo-book',expectedTitle:'Demo Book',
    expectedUpdatedAt:DATE,patch:{status:'read',reportedAt:'2026-10-24',notes:''},
    reason:'Test an explicitly reported completion'};
  const cells = [
    command.commandId,'2026-10-24 18:00','book.patch',
    JSON.stringify(command),'PENDING','','','','',''
  ];
  const env = {familyPath:FAM,ownerUid:'owner-1'};
  const family = {fields:{ownerUid:{stringValue:'owner-1'}}};
  return {api,command,cells,env,family,
    setMarker:x=>{marker=x},setUpdatedAt:x=>{updatedAt=x},
    getCommitted:()=>committed,getCommitCount:()=>commits};
}

test('Stage A direct invocation cannot write',()=>{
  const s=setup();
  assert.equal(s.api.cfg.WRITE_ENABLED,false);
  assert.throws(()=>s.api.process(),/未承認/);
  assert.equal(s.getCommitCount(),0);
});

test('schema and queue ID checked',()=>{
  const s=setup(), parsed=s.api.parse(s.cells);
  assert.equal(parsed.command.commandId,'demo-command-001');
  assert.match(parsed.digest,/^[0-9a-f]{64}$/);
  const wrong=s.cells.slice();wrong[0]='different-id';
  assert.throws(()=>s.api.parse(wrong),/一致/);
});

test('unsafe operations and unknown fields rejected',()=>{
  const s=setup(),del={...s.command,op:'book.delete'},cells=s.cells.slice();
  cells[2]='book.delete';cells[3]=JSON.stringify(del);
  assert.throws(()=>s.api.parse(cells),/未対応/);
  cells[2]='book.patch';cells[3]=JSON.stringify({...s.command,patch:{admin:true}});
  assert.throws(()=>s.api.parse(cells),/変更不可/);
});

test('duplicate IDs stop queue scan',()=>{
  const s=setup();
  const sheet={getLastRow:()=>3,getRange:()=>({getDisplayValues:()=>[s.cells,s.cells]})};
  assert.throws(()=>s.api.pending(sheet),/重複/);
});

test('preflight guards target, owner and completion date',()=>{
  const s=setup(),parsed=s.api.parse(s.cells);
  const plan=s.api.preflight('fake',s.env,s.family,parsed);
  assert.equal(plan.recordUpdateTime,'2026-10-24T09:01:02.123456Z');
  assert.equal(plan.updates.finishedAt,'2026-10-24');
  assert.equal(plan.updates.finishedPeriodBasis,'completion_report_date');
  s.setUpdatedAt('changed');
  assert.throws(()=>s.api.preflight('fake',s.env,s.family,parsed),/競合/);
  assert.throws(()=>s.api.preflight('fake',s.env,{fields:{}},parsed),/owner/);
});

test('matching marker skips replay, mismatch refuses',()=>{
  const s=setup(),parsed=s.api.parse(s.cells);
  s.setMarker({fields:{sourceDigest:{stringValue:parsed.digest}}});
  assert.equal(s.api.preflight('fake',s.env,s.family,parsed).already,true);
  s.setMarker({fields:{sourceDigest:{stringValue:'different'}}});
  assert.throws(()=>s.api.preflight('fake',s.env,s.family,parsed),/不一致/);
});

test('commit uses atomic target CAS plus create-only marker',()=>{
  const s=setup(),parsed=s.api.parse(s.cells);
  const plan=s.api.preflight('fake',s.env,s.family,parsed);
  assert.equal(s.api.commit('fake',s.env,parsed,plan),'APPLIED');
  assert.equal(s.getCommitCount(),1);
  const writes=s.getCommitted().writes;
  assert.equal(writes.length,2);
  assert.equal(writes[0].currentDocument.updateTime,plan.recordUpdateTime);
  assert.equal(writes[1].currentDocument.exists,false);
  assert.equal(writes[0].update.fields.status.stringValue,'read');
  assert.ok(writes[0].updateMask.fieldPaths.includes('status'));
  assert.equal(writes[1].update.fields.sourceDigest.stringValue,parsed.digest);
});

test('book rename requires later duplicate audit',()=>{
  const s=setup(),cells=s.cells.slice();
  cells[3]=JSON.stringify({...s.command,patch:{title:'Unverified Rename'}});
  assert.throws(()=>s.api.preflight('fake',s.env,s.family,s.api.parse(cells)),/重複チェック/);
});
