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
  let queryRows = {}, rating = null, reflection = null, activity = null;
  let bookStatus = 'reading';
  const ctx = {
    YONDENE: {project:'example-project', spreadsheetId:'example-sheet'},
    yondeneSha256_: x => createHash('sha256').update(x,'utf8').digest('hex'),
    yondeneField_: (d,k) => {
      const f=d?.fields?.[k];
      return f?.stringValue ?? (f?.integerValue===undefined ? '' : Number(f.integerValue));
    },
    yondeneFirestoreRequest_: () => ({fields:{ownerUid:{stringValue:'owner-1'}}}),
    UrlFetchApp: {fetch:(url,opts) => {
      if (opts.method === 'get') {
        let data = null;
        if (url.includes('/chatgptMutations/')) data = marker;
        if (url.includes('/childBookRatings/')) data = rating;
        if (url.includes('/childReflections/')) data = reflection;
        if (url.includes('/activity/')) data = activity;
        if (url.endsWith('/books/demo-book')) data = {
          updateTime:'2026-10-24T09:01:02.123456Z',
          fields:{title:{stringValue:'Demo Book'},status:{stringValue:bookStatus},
            updatedAt:{stringValue:updatedAt},notes:{stringValue:''}}
        };
        return {getResponseCode:()=>data ? 200 : 404,
          getContentText:()=>JSON.stringify(data)};
      }
      if (opts.method === 'post') {
        if (url.includes(':runQuery')) {
          const q=JSON.parse(opts.payload).structuredQuery;
          const field=q.where.fieldFilter.field.fieldPath;
          const value=q.where.fieldFilter.value.stringValue;
          const result=queryRows[field+':'+value] || [];
          return {getResponseCode:()=>200,
            getContentText:()=>JSON.stringify(result.map(document=>({document})))};
        }
        if (!url.includes('documents:commit')) throw new Error('Unexpected POST');
        commits++;
        committed = JSON.parse(opts.payload);
        return {getResponseCode:()=>200,
          getContentText:()=>JSON.stringify({writeResults:committed.writes.map(()=>({}))})};
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
    setQuery:(field,value,docs)=>{queryRows[field+':'+value]=docs},
    setRating:x=>{rating=x},setBookStatus:x=>{bookStatus=x},
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


function withCommand(s, command) {
  const cells=s.cells.slice();
  cells[0]=command.commandId;
  cells[2]=command.op;
  cells[3]=JSON.stringify(command);
  return s.api.parse(cells);
}

test('book.create checks title-author and ISBN duplicates and uses create preconditions',()=>{
  const s=setup();
  const command={schemaVersion:1,commandId:'create-book-1',op:'book.create',
    bookId:'brand-new-book',
    book:{title:'Synthetic Book',author:'Test Writer',
      status:'unread',coverUrl:'https://example.invalid/cover.jpg',
      isbn:'9780000000000'},reason:'Create a synthetic test book'};
  const parsed=withCommand(s,command);
  const plan=s.api.preflight('fake',s.env,s.family,parsed);
  assert.equal(plan.action,'create');
  assert.equal(plan.updates.title,'Synthetic Book');
  assert.equal(plan.updates.id,'brand-new-book');
  assert.equal(s.api.commit('fake',s.env,parsed,plan),'APPLIED');
  const writes=s.getCommitted().writes;
  assert.equal(writes.length,2);
  assert.equal(writes[0].currentDocument.exists,false);
  assert.equal(writes[1].currentDocument.exists,false);
  assert.equal(writes[0].update.fields.status.stringValue,'unread');
  assert.equal(writes[0].updateMask,undefined);
  s.setQuery('title','Synthetic Book',[
    {fields:{title:{stringValue:'Synthetic Book'},
      author:{stringValue:'Test Writer'}}}]);
  assert.throws(()=>s.api.preflight('fake',s.env,s.family,parsed),/同名・同著者/);
  s.setQuery('title','Synthetic Book',[]);
  s.setQuery('isbn','9780000000000',[{fields:{isbn:{stringValue:'9780000000000'}}}]);
  assert.throws(()=>s.api.preflight('fake',s.env,s.family,parsed),/ISBN/);
});

test('series.create rejects duplicates and writes create-only document',()=>{
  const s=setup();
  const command={schemaVersion:1,commandId:'series-create-1',op:'series.create',
    seriesId:'synthetic-series',series:{name:'Synthetic Series',totalVolumes:3},
    reason:'Create synthetic series'};
  const parsed=withCommand(s,command);
  const plan=s.api.preflight('fake',s.env,s.family,parsed);
  assert.equal(plan.action,'create');
  assert.equal(plan.updates.name,'Synthetic Series');
  s.api.commit('fake',s.env,parsed,plan);
  const writes=s.getCommitted().writes;
  assert.equal(writes.length,2);
  assert.equal(writes[0].currentDocument.exists,false);
  assert.equal(writes[0].update.fields.totalVolumes.integerValue,'3');
  s.setQuery('name','Synthetic Series',[
    {fields:{name:{stringValue:'Synthetic Series'}}}]);
  assert.throws(()=>s.api.preflight('fake',s.env,s.family,parsed),/同名のシリーズ/);
});

test('childRating.set only creates first rating, repeat uses marker only',()=>{
  const s=setup();
  const command={schemaVersion:1,commandId:'rating-new-1',op:'childRating.set',
    bookId:'demo-book',expectedTitle:'Demo Book',stars:4,reason:'Synthetic rating'};
  const parsed=withCommand(s,command);
  const plan=s.api.preflight('fake',s.env,s.family,parsed);
  assert.equal(plan.action,'create');
  assert.equal(plan.updates.stars,4);
  assert.equal(plan.markerExtra.ratingCreated,true);
  s.api.commit('fake',s.env,parsed,plan);
  assert.equal(s.getCommitted().writes.length,2);
  assert.equal(s.getCommitted().writes[1].update.fields.ratingCreated.booleanValue,true);
  assert.match(s.getCommitted().writes[0].update.fields.createdAt.timestampValue,/^2026/);
  s.setRating({fields:{stars:{integerValue:'4'}}});
  const again=s.api.preflight('fake',s.env,s.family,parsed);
  assert.equal(again.action,'marker-only');
  assert.equal(again.markerExtra.ratingCreated,false);
  s.api.commit('fake',s.env,parsed,again);
  assert.equal(s.getCommitted().writes.length,1);
  assert.equal(s.getCommitted().writes[0].update.fields.ratingCreated.booleanValue,false);
  s.setRating({fields:{stars:{integerValue:'2'}}});
  assert.throws(()=>s.api.preflight('fake',s.env,s.family,parsed),/上書きしません/);
  s.setRating(null);
  s.setBookStatus('unread');
  assert.throws(()=>s.api.preflight('fake',s.env,s.family,parsed),/評価できる/);
});

test('childReflection.create atomically creates reflection, activity and marker',()=>{
  const s=setup();
  const command={schemaVersion:1,commandId:'reflection-new-1',
    op:'childReflection.create',bookId:'demo-book',expectedTitle:'Demo Book',
    quote:'An invented observation',attribution:'parent-summary',
    observedAt:'2026-10-24',reason:'Synthetic reflection'};
  const parsed=withCommand(s,command);
  const plan=s.api.preflight('fake',s.env,s.family,parsed);
  assert.equal(plan.activityData.kind,'reflection');
  s.api.commit('fake',s.env,parsed,plan);
  const writes=s.getCommitted().writes;
  assert.equal(writes.length,3);
  assert.equal(writes[0].currentDocument.exists,false);
  assert.equal(writes[1].currentDocument.exists,false);
  assert.equal(writes[2].currentDocument.exists,false);
  assert.equal(writes[1].update.fields.hidden.booleanValue,false);
  assert.match(writes[0].update.fields.createdAt.timestampValue,/^2026/);
  assert.match(writes[1].update.fields.createdAt.timestampValue,/^2026/);
  assert.match(writes[0].update.name,/childReflections\/reflection-new-1$/);
  assert.match(writes[1].update.name,/activity\/reflection-reflection-new-1$/);
});

test('create rejects unexpected child data, incomplete title and missing cover',()=>{
  const s=setup();
  const base={schemaVersion:1,commandId:'create-invalid-1',op:'book.create',
    bookId:'new-book',book:{title:'Synthetic',status:'unread'},
    reason:'Invalid synthetic create'};
  assert.throws(()=>withCommand(s,base),/書影URL/);
  assert.throws(()=>withCommand(s,{...base,stars:5,
    book:{...base.book,coverUrl:'https://example.invalid/a.jpg'}}),/更新前条件|余分/);
  assert.throws(()=>withCommand(s,{...base,
    book:{...base.book,title:'',coverUrl:'https://example.invalid/a.jpg'}}),/書名/);
});
