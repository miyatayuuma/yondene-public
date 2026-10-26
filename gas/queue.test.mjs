import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';

const source = readFileSync(new URL('./Queue.gs', import.meta.url), 'utf8');
const DATE = '2026-10-24T09:00:00Z';
const FAM = 'families/example-family';

function setup({mockRelease=false} = {}) {
  let marker = null, updatedAt = DATE, committed = null, commits = 0;
  let begun=0, rolledBack=0, familyName='Demo Shelf', commitStatus=200;
  const gets=[],queries=[];
  let settingsDesired='Demo Shelf',settingsConfirmed='Demo Shelf';
  const settingsSheet={
    getRange:(...args)=>{
      const ref=args[0];
      if(ref==='C2') return {setValue:v=>{settingsConfirmed=v}};
      if(args.join(',')==='1,1,2,3') return {
        getDisplayValues:()=>[['項目','変更後の名前（入力）','確認済みの名前'],
          ['本棚名',settingsDesired,settingsConfirmed]]
      };
      throw new Error('Unexpected settings range '+args);
    }
  };
  let queryRows = {}, rating = null, reflection = null, activity = null;
  let queueRows = [], simulatePersist = false;
  let bookStatus = 'reading', seriesName = 'Demo Series', publisher = '';
  let bookNotes = '', completionNote = '', ageSource = '', legacyNoUpdatedAt = false;
  const queueSheet={
    getLastRow:()=>queueRows.length+1,
    getRange:(row,col,height,width)=>{
      if(row===1&&col===1&&height===1&&width===10)
        return {getDisplayValues:()=>[[
          'コマンドID','登録時刻','操作','コマンドJSON','状態','処理日時',
          '結果コード','SHA256','試行回数','エラー概要']]};
      if(row===2&&col===1&&width===10&&height===queueRows.length)
        return {getDisplayValues:()=>queueRows.map(v=>v.slice())};
      if(row===2&&col===5&&height===1&&width===6)
        return {setValues:vals=>queueRows[0].splice(4,6,...vals[0])};
      throw Error('Unexpected queue range '+[row,col,height,width].join(','));
    }
  };
  const syncSheet={getRange:key=>({
    getDisplayValue:()=>({B7:'example-family',B8:'owner-1'})[key]
  })};
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
        gets.push(url);
        let data = null;
        if (url.split('?')[0].endsWith('/families/example-family')) data={
          updateTime:'2026-10-24T09:00:00.123456Z',
          fields:{name:{stringValue:familyName},ownerUid:{stringValue:'owner-1'}}
        };
        if (url.includes('/chatgptMutations/')) data = marker;
        if (url.includes('/childBookRatings/')) data = rating;
        if (url.includes('/childReflections/')) data = reflection;
        if (url.includes('/activity/')) data = activity;
        if (url.split('?')[0].endsWith('/books/demo-book')) data = {
          updateTime:'2026-10-24T09:01:02.123456Z',
          fields:{title:{stringValue:'Demo Book'},status:{stringValue:bookStatus},
            ...(legacyNoUpdatedAt ? {} : {updatedAt:{stringValue:updatedAt}}),
            notes:{stringValue:bookNotes},
            finishedPeriodNote:{stringValue:completionNote},
            publisher:{stringValue:publisher},
            ageSource:{stringValue:ageSource}}
        };
        if (url.split('?')[0].endsWith('/books/demo-book-2')) data = {
          updateTime:'2026-10-24T09:01:04.123456Z',
          fields:{title:{stringValue:'Second Demo Book'},publisher:{stringValue:''},
            updatedAt:{stringValue:updatedAt}}
        };
        if (url.split('?')[0].endsWith('/series/demo-series')) data = {
          updateTime:'2026-10-24T09:01:02.123456Z',
          fields:{name:{stringValue:seriesName},updatedAt:{stringValue:updatedAt}}
        };
        return {getResponseCode:()=>data ? 200 : 404,
          getContentText:()=>JSON.stringify(data)};
      }
      if (opts.method === 'post') {
        if (url.includes(':beginTransaction')) {
          begun++;
          return {getResponseCode:()=>200,
            getContentText:()=>JSON.stringify({transaction:'synthetic-transaction'})};
        }
        if (url.includes(':rollback')) {
          assert.equal(JSON.parse(opts.payload).transaction,'synthetic-transaction');
          rolledBack++;
          return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({})};
        }
        if (url.includes(':runQuery')) {
          const body=JSON.parse(opts.payload);
          queries.push(body);
          const q=body.structuredQuery;
          const field=q.where.fieldFilter.field.fieldPath;
          const value=q.where.fieldFilter.value.stringValue;
          const result=queryRows[field+':'+value] || [];
          return {getResponseCode:()=>200,
            getContentText:()=>JSON.stringify(result.map(document=>({document})))};
        }
        if (!url.includes('documents:commit')) throw new Error('Unexpected POST');
        commits++;
        committed = JSON.parse(opts.payload);
        if(commitStatus===200) {
          const familyWrite=committed.writes.find(w=>
            w.update?.name?.endsWith('/families/example-family'));
          if(familyWrite) familyName=familyWrite.update.fields.name.stringValue;
          if(simulatePersist) {
          const bookWrite=committed.writes.find(w=>
            w.update?.name?.endsWith('/books/demo-book'));
          if(bookWrite) {
            if(bookWrite.update.fields.publisher)
              publisher=bookWrite.update.fields.publisher.stringValue;
            if(bookWrite.update.fields.ageSource)
              ageSource=bookWrite.update.fields.ageSource.stringValue;
            if(bookWrite.update.fields.updatedAt) {
              updatedAt=bookWrite.update.fields.updatedAt.stringValue;
              legacyNoUpdatedAt=false;
            }
          }
          const markerWrite=committed.writes.find(w=>
            w.update?.name?.includes('/chatgptMutations/'));
          if(markerWrite) marker={
            name:markerWrite.update.name,fields:markerWrite.update.fields
          };
          }
        }
        return {getResponseCode:()=>commitStatus,
          getContentText:()=>commitStatus===200?
            JSON.stringify({writeResults:committed.writes.map(()=>({}))}):'{}'};
      }
      throw new Error('Unexpected HTTP method');
    }},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
    Logger:{log:()=>{}},ScriptApp:{getOAuthToken:()=>'fake'},
    SpreadsheetApp:{flush:()=>{},
      openById:()=>({getSheetByName:name=>({
        '設定':settingsSheet,'更新キュー':queueSheet,'同期状態':syncSheet
      })[name]||null})},
    Date,JSON,Number,Object,String,Array,Math,RegExp,Error,Set,
  };
  vm.createContext(ctx);
  vm.runInContext(mockRelease ?
    source.replace('WRITE_ENABLED: false','WRITE_ENABLED: true') :
    source,ctx,{filename:'Queue.gs'});
  const api = vm.runInContext(`({cfg:YONDENE_QUEUE, parse:yondeneQueueParse_,
    preflight:yondeneQueuePreflight_, commit:yondeneQueueCommit_,
    pending:yondeneQueuePending_, process:yondeneQueueProcess,
    apply:yondeneQueueApplyTransaction_,settings:yondeneQueueSettingsCommand_,
    processSettings:yondeneQueueProcessSettings_,
    approvedOnce:yondeneQueueAcceptApprovedBookPatchOnce,
    scopedGate:yondeneQueueOneShotBookPatchAuthorized_})`,ctx);
  const command = {schemaVersion:1,commandId:'gas-demo-command-001',
    op:'book.patch',bookId:'demo-book',expectedTitle:'Demo Book',
    expectedUpdatedAt:DATE,
    patch:{status:'read',reportedAt:'2026-10-24',finishedAt:'2026-10-23',
      finishedPeriodBasis:'confirmed_completion_date',notes:''},
    reason:'Test an explicitly confirmed completion'};
  const cells = [
    command.commandId,'2026-10-24 18:00','book.patch',
    JSON.stringify(command),'PENDING','','','','',''
  ];
  queueRows=[cells];
  const env = {familyPath:FAM,familyId:'example-family',ownerUid:'owner-1'};
  const family = {fields:{ownerUid:{stringValue:'owner-1'}}};
  return {api,command,cells,env,family,
    setMarker:x=>{marker=x},setUpdatedAt:x=>{updatedAt=x},
    setQuery:(field,value,docs)=>{queryRows[field+':'+value]=docs},
    setRating:x=>{rating=x},setBookStatus:x=>{bookStatus=x},
    setBookNotes:x=>{bookNotes=x},setCompletionNote:x=>{completionNote=x},
    setAgeSource:x=>{ageSource=x},setLegacyBook:()=>{legacyNoUpdatedAt=true},
    setSeriesName:x=>{seriesName=x},setPublisher:x=>{publisher=x},
    getCommitted:()=>committed,getCommitCount:()=>commits,
    getBeginCount:()=>begun,getRollbackCount:()=>rolledBack,
    getGets:()=>gets,getQueries:()=>queries,getFamilyName:()=>familyName,
    setFamilyName:v=>{familyName=v},setCommitStatus:v=>{commitStatus=v},
    setSettings:(desired,confirmed)=>{settingsDesired=desired;settingsConfirmed=confirmed},
    getSettingsConfirmed:()=>settingsConfirmed,
    setApproval:a=>{ctx.YONDENE_BOOK_PATCH_APPROVAL=a;},
    setQueueCommand:c=>{const row=cells.slice();row[0]=c.commandId;
      row[2]=c.op;row[3]=JSON.stringify(c);queueRows=[row];},
    addQueueCommand:c=>{queueRows.push([
      c.commandId,'2026-10-25','book.patch',JSON.stringify(c),
      'PENDING','','','','',''])},
    queueState:()=>queueRows.map(r=>r.slice()),
    enableCommitPersistence:()=>{simulatePersist=true}};
}

test('Stage A direct invocation cannot write',()=>{
  const s=setup();
  assert.equal(s.api.cfg.WRITE_ENABLED,false);
  assert.throws(()=>s.api.process(),/未承認/);
  assert.equal(s.getCommitCount(),0);
});

test('schema and queue ID checked',()=>{
  const s=setup(), parsed=s.api.parse(s.cells);
  assert.equal(parsed.command.commandId,'gas-demo-command-001');
  assert.match(parsed.digest,/^[0-9a-f]{64}$/);
  const wrong=s.cells.slice();wrong[0]='different-id';
  assert.throws(()=>s.api.parse(wrong),/一致/);
  const legacy=s.cells.slice();
  legacy[0]='legacy-command';
  legacy[3]=JSON.stringify({...s.command,commandId:'legacy-command'});
  assert.throws(()=>s.api.parse(legacy),/gas-/);
});

test('unsafe operations and unknown fields rejected',()=>{
  const s=setup(),cells=s.cells.slice();
  for(const op of ['book.delete','book.patchByTitle','family.rename']) {
    cells[2]=op;cells[3]=JSON.stringify({...s.command,op});
    assert.throws(()=>s.api.parse(cells),/未対応/,op+' must not be accepted from user queue');
  }
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
  assert.equal(plan.updates.finishedAt,'2026-10-23');
  assert.equal(plan.updates.finishedPeriodBasis,'confirmed_completion_date');
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
  const s=setup({mockRelease:true}),parsed=s.api.parse(s.cells);
  const plan=s.api.preflight('fake',s.env,s.family,parsed);
  assert.equal(s.api.commit('fake',s.env,parsed,plan,'synthetic-transaction'),'APPLIED');
  assert.equal(s.getCommitCount(),1);
  const writes=s.getCommitted().writes;
  assert.equal(writes.length,2);
  assert.equal(writes[0].currentDocument.updateTime,plan.recordUpdateTime);
  assert.equal(writes[1].currentDocument.exists,false);
  assert.equal(writes[0].update.fields.status.stringValue,'read');
  assert.ok(writes[0].updateMask.fieldPaths.includes('status'));
  assert.equal(writes[1].update.fields.sourceDigest.stringValue,parsed.digest);
  assert.equal(writes[1].update.fields.sourceCommandChannel.stringValue,'private-google-sheet');
  assert.equal(writes[1].update.fields.sourceDigestScheme.stringValue,
    'sha256-json-stringify-v1');
});

test('book identity corrections are transactionally guarded and preserve stable ID',()=>{
  const s=setup({mockRelease:true});
  const c={...s.command,patch:{title:'Corrected Demo Book',
    author:'Corrected Author',isbn:'9780000000017'}};
  const parsed=withCommand(s,c);
  assert.equal(s.api.apply('fake',s.env,parsed),'APPLIED');
  const writes=s.getCommitted().writes;
  assert.ok(writes[0].update.name.endsWith('/books/demo-book'));
  assert.equal(writes[0].update.fields.title.stringValue,'Corrected Demo Book');
  assert.equal(writes[0].update.fields.isbn.stringValue,'9780000000017');
  assert.equal(s.getQueries().length,2);
  assert.ok(s.getQueries().every(q=>q.transaction==='synthetic-transaction'));
});
test('book title/author/ISBN corrections reject duplicates from other IDs',()=>{
  const s=setup(),prefix='projects/example-project/databases/(default)/documents/'+FAM;
  const sameTitle={name:prefix+'/books/other-book',
    fields:{author:{stringValue:'Another Author'}}};
  s.setQuery('title','Corrected Demo Book',[sameTitle]);
  const corrected={...s.command,patch:{title:'Corrected Demo Book',author:'Another Author'}};
  assert.throws(()=>s.api.preflight('fake',s.env,s.family,
    withCommand(s,corrected)),/同名・同著者/);
  s.setQuery('title','Corrected Demo Book',[]);
  s.setQuery('isbn','9780000000017',[{name:prefix+'/books/another',
    fields:{isbn:{stringValue:'9780000000017'}}}]);
  assert.throws(()=>s.api.preflight('fake',s.env,s.family,
    withCommand(s,{...corrected,patch:{isbn:'9780000000017'}})),/同じISBN/);
});
test('series rename is uniqueness checked and revision-bound',()=>{
  const s=setup({mockRelease:true}),base={
    schemaVersion:1,commandId:'gas-rename-series-01',op:'series.patch',
    seriesId:'demo-series',expectedName:'Demo Series',
    expectedUpdatedAt:DATE,patch:{name:'Corrected Series'},reason:'Synthetic correction'};
  assert.equal(s.api.apply('fake',s.env,withCommand(s,base)),'APPLIED');
  assert.ok(s.getCommitted().writes[0].update.name.endsWith('/series/demo-series'));
  assert.equal(s.getCommitted().writes[0].update.fields.name.stringValue,
    'Corrected Series');
  assert.equal(s.getQueries()[0].transaction,'synthetic-transaction');
  const t=setup(),prefix='projects/example-project/databases/(default)/documents/'+FAM;
  t.setQuery('name','Corrected Series',[{name:prefix+'/series/other',
    fields:{name:{stringValue:'Corrected Series'}}}]);
  assert.throws(()=>t.api.preflight('fake',t.env,t.family,
    withCommand(t,base)),/同名シリーズ/);
  t.setQuery('name','Corrected Series',[]);
  t.setUpdatedAt('stale');
  assert.throws(()=>t.api.preflight('fake',t.env,t.family,
    withCommand(t,base)),/競合/);
});


function withCommand(s, command) {
  const cells=s.cells.slice();
  cells[0]=command.commandId;
  cells[2]=command.op;
  cells[3]=JSON.stringify(command);
  return s.api.parse(cells);
}

test('book.create checks title-author and ISBN duplicates and uses create preconditions',()=>{
  const s=setup({mockRelease:true});
  const command={schemaVersion:1,commandId:'gas-create-book-1',op:'book.create',
    bookId:'brand-new-book',
    book:{title:'Synthetic Book',author:'Test Writer',
      status:'unread',coverUrl:'https://example.invalid/cover.jpg',
      isbn:'9780000000000'},reason:'Create a synthetic test book'};
  const parsed=withCommand(s,command);
  const plan=s.api.preflight('fake',s.env,s.family,parsed);
  assert.equal(plan.action,'create');
  assert.equal(plan.updates.title,'Synthetic Book');
  assert.equal(plan.updates.id,'brand-new-book');
  assert.equal(s.api.commit('fake',s.env,parsed,plan,'synthetic-transaction'),'APPLIED');
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
  const s=setup({mockRelease:true});
  const command={schemaVersion:1,commandId:'gas-series-create-1',op:'series.create',
    seriesId:'synthetic-series',series:{name:'Synthetic Series',totalVolumes:3},
    reason:'Create synthetic series'};
  const parsed=withCommand(s,command);
  const plan=s.api.preflight('fake',s.env,s.family,parsed);
  assert.equal(plan.action,'create');
  assert.equal(plan.updates.name,'Synthetic Series');
  s.api.commit('fake',s.env,parsed,plan,'synthetic-transaction');
  const writes=s.getCommitted().writes;
  assert.equal(writes.length,2);
  assert.equal(writes[0].currentDocument.exists,false);
  assert.equal(writes[0].update.fields.totalVolumes.integerValue,'3');
  s.setQuery('name','Synthetic Series',[
    {fields:{name:{stringValue:'Synthetic Series'}}}]);
  assert.throws(()=>s.api.preflight('fake',s.env,s.family,parsed),/同名のシリーズ/);
});

test('childRating.set only creates first rating, repeat uses marker only',()=>{
  const s=setup({mockRelease:true});
  const command={schemaVersion:1,commandId:'gas-rating-new-1',op:'childRating.set',
    bookId:'demo-book',expectedTitle:'Demo Book',stars:4,reason:'Synthetic rating'};
  const parsed=withCommand(s,command);
  const plan=s.api.preflight('fake',s.env,s.family,parsed);
  assert.equal(plan.action,'create');
  assert.equal(plan.updates.stars,4);
  assert.equal(plan.markerExtra.ratingCreated,true);
  s.api.commit('fake',s.env,parsed,plan,'synthetic-transaction');
  assert.equal(s.getCommitted().writes.length,2);
  assert.equal(s.getCommitted().writes[1].update.fields.ratingCreated.booleanValue,true);
  assert.match(s.getCommitted().writes[0].update.fields.createdAt.timestampValue,/^2026/);
  s.setRating({fields:{stars:{integerValue:'4'}}});
  const again=s.api.preflight('fake',s.env,s.family,parsed);
  assert.equal(again.action,'marker-only');
  assert.equal(again.markerExtra.ratingCreated,false);
  s.api.commit('fake',s.env,parsed,again,'synthetic-transaction');
  assert.equal(s.getCommitted().writes.length,1);
  assert.equal(s.getCommitted().writes[0].update.fields.ratingCreated.booleanValue,false);
  s.setRating({fields:{stars:{integerValue:'2'}}});
  assert.throws(()=>s.api.preflight('fake',s.env,s.family,parsed),/上書きしません/);
  s.setRating(null);
  s.setBookStatus('unread');
  assert.throws(()=>s.api.preflight('fake',s.env,s.family,parsed),/評価できる/);
});

test('childReflection.create atomically creates reflection, activity and marker',()=>{
  const s=setup({mockRelease:true});
  const command={schemaVersion:1,commandId:'gas-reflection-new-1',
    op:'childReflection.create',bookId:'demo-book',expectedTitle:'Demo Book',
    quote:'An invented observation',attribution:'parent-summary',
    observedAt:'2026-10-24',reason:'Synthetic reflection'};
  const parsed=withCommand(s,command);
  const plan=s.api.preflight('fake',s.env,s.family,parsed);
  assert.equal(plan.activityData.kind,'reflection');
  s.api.commit('fake',s.env,parsed,plan,'synthetic-transaction');
  const writes=s.getCommitted().writes;
  assert.equal(writes.length,3);
  assert.equal(writes[0].currentDocument.exists,false);
  assert.equal(writes[1].currentDocument.exists,false);
  assert.equal(writes[2].currentDocument.exists,false);
  assert.equal(writes[1].update.fields.hidden.booleanValue,false);
  assert.match(writes[0].update.fields.createdAt.timestampValue,/^2026/);
  assert.match(writes[1].update.fields.createdAt.timestampValue,/^2026/);
  assert.match(writes[0].update.name,/childReflections\/gas-reflection-new-1$/);
  assert.match(writes[1].update.name,/activity\/reflection-gas-reflection-new-1$/);
});

test('create rejects unexpected child data, incomplete title and missing cover',()=>{
  const s=setup();
  const base={schemaVersion:1,commandId:'gas-create-invalid-1',op:'book.create',
    bookId:'new-book',book:{title:'Synthetic',status:'unread'},
    reason:'Invalid synthetic create'};
  assert.throws(()=>withCommand(s,base),/書影URL/);
  assert.throws(()=>withCommand(s,{...base,stars:5,
    book:{...base.book,coverUrl:'https://example.invalid/a.jpg'}}),/更新前条件|余分/);
  assert.throws(()=>withCommand(s,{...base,
    book:{...base.book,title:'',coverUrl:'https://example.invalid/a.jpg'}}),/書名/);
});

test('disabled code cannot be bypassed through commit, transaction or settings',()=>{
  const s=setup(),parsed=s.api.parse(s.cells);
  assert.equal(s.api.cfg.WRITE_ENABLED,false);
  assert.throws(()=>s.api.apply('fake',s.env,parsed),/未承認/);
  assert.throws(()=>s.api.processSettings('fake',s.env),/未承認/);
  const plan=s.api.preflight('fake',s.env,s.family,parsed);
  assert.throws(()=>s.api.commit('fake',s.env,parsed,plan,'synthetic-transaction'),/未承認/);
  assert.equal(s.getBeginCount(),0);
  assert.equal(s.getCommitCount(),0);
});

test('transaction preflight and commit share one transaction',()=>{
  const s=setup({mockRelease:true});
  const command={schemaVersion:1,commandId:'gas-txn-book-create',
    op:'book.create',bookId:'txn-book',
    book:{title:'Synthetic Title',author:'Synthetic Author',
      status:'unread',coverUrl:'https://example.invalid/book.png',isbn:'9780000000017'},
    reason:'Atomic concurrent duplicate guard'};
  assert.equal(s.api.apply('fake',s.env,withCommand(s,command)),'APPLIED');
  assert.equal(s.getBeginCount(),1);
  assert.equal(s.getRollbackCount(),0);
  assert.equal(s.getCommitCount(),1);
  assert.equal(s.getCommitted().transaction,'synthetic-transaction');
  assert.ok(s.getQueries().length>=2);
  assert.ok(s.getQueries().every(q=>q.transaction==='synthetic-transaction'));
  assert.ok(s.getGets().filter(u=>!u.includes('/chatgptMutations/'))
    .every(u=>u.includes('transaction=synthetic-transaction')));
});

test('already applied marker returns without commit and closes transaction',()=>{
  const s=setup({mockRelease:true}),parsed=s.api.parse(s.cells);
  s.setMarker({fields:{sourceDigest:{stringValue:parsed.digest}}});
  assert.equal(s.api.apply('fake',s.env,parsed),'ALREADY');
  assert.equal(s.getBeginCount(),1);
  assert.equal(s.getRollbackCount(),1);
  assert.equal(s.getCommitCount(),0);
});

test('conflicting preflight rolls back transaction',()=>{
  const s=setup({mockRelease:true}),parsed=s.api.parse(s.cells);
  s.setUpdatedAt('changed');
  assert.throws(()=>s.api.apply('fake',s.env,parsed),/競合/);
  assert.equal(s.getBeginCount(),1);
  assert.equal(s.getRollbackCount(),1);
  assert.equal(s.getCommitCount(),0);
});

test('commit conflict is not blindly retried or reported successful',()=>{
  const s=setup({mockRelease:true}),parsed=s.api.parse(s.cells);
  s.setCommitStatus(409);
  assert.throws(()=>s.api.apply('fake',s.env,parsed),/HTTP 409/);
  assert.equal(s.getBeginCount(),1);
  assert.equal(s.getCommitCount(),1);
  assert.equal(s.getRollbackCount(),0);
});

test('settings B2 rename patches only family.name then confirms C2',()=>{
  const s=setup({mockRelease:true});
  s.setSettings('Demo Shelf Revised','Demo Shelf');
  const candidate=s.api.settings(s.env);
  assert.equal(candidate.desired,'Demo Shelf Revised');
  assert.equal(candidate.parsed.command.op,'family.rename');
  assert.equal(s.api.processSettings('fake',s.env),'APPLIED');
  assert.equal(s.getFamilyName(),'Demo Shelf Revised');
  assert.equal(s.getSettingsConfirmed(),'Demo Shelf Revised');
  assert.equal(s.getCommitted().transaction,'synthetic-transaction');
  const writes=s.getCommitted().writes;
  assert.equal(writes.length,2);
  assert.deepEqual(Object.keys(writes[0].update.fields),['name']);
  assert.deepEqual(writes[0].updateMask.fieldPaths,['name']);
  assert.equal(writes[0].currentDocument.updateTime,'2026-10-24T09:00:00.123456Z');
  assert.equal(writes[1].currentDocument.exists,false);
  assert.equal(s.getCommitCount(),1);
});

test('settings reject stale names and do not alter C2 on conflict',()=>{
  const s=setup({mockRelease:true});
  s.setSettings('Requested New Name','Unexpected Previous Name');
  assert.throws(()=>s.api.processSettings('fake',s.env),/競合/);
  assert.equal(s.getCommitCount(),0);
  assert.equal(s.getRollbackCount(),1);
  assert.equal(s.getSettingsConfirmed(),'Unexpected Previous Name');
});

test('catalog audit atomically patches multiple bibliographic records',()=>{
  const s=setup({mockRelease:true});
  const command={schemaVersion:1,commandId:'gas-catalog-correct-01',op:'catalog.audit',
    entries:[
      {id:'demo-book',expectedTitle:'Demo Book',patch:{publisher:'Publisher One',
        publicationYear:2020}},
      {id:'demo-book-2',expectedTitle:'Second Demo Book',
        patch:{publisher:'Publisher Two'}}
    ],reason:'Synthetic bibliographic update'};
  assert.equal(s.api.apply('fake',s.env,withCommand(s,command)),'APPLIED');
  const writes=s.getCommitted().writes;
  assert.equal(writes.length,3);
  assert.ok(writes[0].update.name.endsWith('/books/demo-book'));
  assert.ok(writes[1].update.name.endsWith('/books/demo-book-2'));
  assert.deepEqual(writes[0].updateMask.fieldPaths,
    ['publisher','publicationYear','updatedAt']);
  assert.equal(writes[0].currentDocument.updateTime,
    '2026-10-24T09:01:02.123456Z');
  assert.equal(writes[2].update.fields.updatedCount.integerValue,'2');
  assert.equal(writes[2].update.fields.entryCount.integerValue,'2');
  assert.equal(s.getCommitCount(),1);
  assert.equal(s.getCommitted().transaction,'synthetic-transaction');
  assert.equal(writes.some(w=>w.update.fields.status!==undefined),false);
});
test('catalog audit rejects duplicates, identity changes, and unexpected payloads',()=>{
  const s=setup();
  const entry={id:'demo-book',expectedTitle:'Demo Book',patch:{publisher:'New'}};
  const cmd={schemaVersion:1,commandId:'gas-catalog-reject-01',op:'catalog.audit',
    entries:[entry],reason:'Synthetic invalid example'};
  assert.throws(()=>withCommand(s,{...cmd,entries:[entry,entry]}),/重複/);
  assert.throws(()=>withCommand(s,{...cmd,entries:[{...entry,
    patch:{title:'Wrong'}}]}),/変更不可/);
  assert.throws(()=>withCommand(s,{...cmd,entries:[{...entry,
    patch:{isbn:'9780000000017'}}]}),/変更不可/);
  assert.throws(()=>withCommand(s,{...cmd,bookId:'demo-book'}),/余分/);
  assert.throws(()=>withCommand(s,{...s.command,entries:[entry]}),/entries/);
});
test('catalog audit checks expected old value and marks no-change without patching',()=>{
  const s=setup({mockRelease:true});
  s.setPublisher('Existing Publisher');
  const base={schemaVersion:1,commandId:'gas-catalog-cas-01',op:'catalog.audit',
    entries:[{id:'demo-book',expectedTitle:'Demo Book',
      patch:{publisher:'New Publisher'},expected:{publisher:'Outdated'}}],
    reason:'Synthetic verified catalog correction'};
  assert.throws(()=>s.api.preflight('fake',s.env,s.family,withCommand(s,base)),
    /既存値が変わっています/);
  const approved={...base,entries:[{...base.entries[0],
    expected:{publisher:'Existing Publisher'}}]};
  assert.equal(s.api.apply('fake',s.env,withCommand(s,approved)),'APPLIED');
  assert.equal(s.getCommitted().writes.length,2);
  const noChange={...base,commandId:'gas-catalog-same-01',
    entries:[{id:'demo-book',expectedTitle:'Demo Book',
      patch:{publisher:'Existing Publisher'}}]};
  assert.equal(s.api.apply('fake',s.env,withCommand(s,noChange)),'APPLIED');
  assert.equal(s.getCommitted().writes.length,1);
  assert.equal(s.getCommitted().writes[0].update.fields.updatedCount.integerValue,'0');
});

test('settings with unchanged shelf name cause no Firestore reads or writes',()=>{
  const s=setup({mockRelease:true});
  assert.equal(s.api.processSettings('fake',s.env),'NO_CHANGE');
  assert.equal(s.getBeginCount(),0);
  assert.equal(s.getCommitCount(),0);
  assert.equal(s.getSettingsConfirmed(),'Demo Shelf');
});


test('completion is rejected without explicit period even if a report date is present',()=>{
  const s=setup({mockRelease:true});
  const patch={status:'read',reportedAt:'2026-10-24',readingMode:'read-aloud'};
  const c={...s.command,patch};
  const parsed=withCommand(s,c);
  assert.throws(()=>s.api.apply('fake',s.env,parsed),/読了時期を明示/);
  assert.equal(s.getCommitCount(),0);
  assert.equal(s.getRollbackCount(),1);
});

test('explicit completion period is never replaced by a later report date',()=>{
  const s=setup({mockRelease:true});
  const c={...s.command,patch:{status:'read',finishedAt:'2026-09',
    reportedAt:'2026-10-24',readingMode:'read-aloud'}};
  const plan=s.api.preflight('fake',s.env,s.family,withCommand(s,c));
  assert.equal(plan.updates.finishedAt,'2026-09');
  assert.equal(plan.updates.reportedAt,'2026-10-24');
  assert.equal(plan.updates.finishedPeriodBasis,undefined);
});

test('new read book requires explicit completion and never defaults from reportedAt',()=>{
  const s=setup({mockRelease:true});
  const base={schemaVersion:1,commandId:'gas-read-create-01',op:'book.create',
    bookId:'new-fake-book',reason:'Synthetic completion rule',
    book:{title:'Synthetic Read Book',author:'Sample Author',
      status:'read',coverUrl:'https://example.invalid/cover.png',
      reportedAt:'2026-10-24',readingMode:'read-aloud'}};
  assert.throws(()=>s.api.parse([base.commandId,'','book.create',
    JSON.stringify(base),'PENDING','','','','','']),/読了時期を明示/);
  assert.equal(s.getCommitCount(),0);
  const approved={...base,commandId:'gas-read-create-02',
    book:{...base.book,finishedAt:'2026-10-22'}};
  const plan=s.api.preflight('fake',s.env,s.family,withCommand(s,approved));
  assert.equal(plan.updates.finishedAt,'2026-10-22');
});

test('read to unread clears completion metadata and reading mode but not observation notes',()=>{
  const s=setup({mockRelease:true});
  s.setBookStatus('read');
  s.setBookNotes('本人の興味と発言を保存');
  const c={...s.command,patch:{status:'unread'}};
  const parsed=withCommand(s,c);
  const plan=s.api.preflight('fake',s.env,s.family,parsed);
  for(const key of ['finishedAt','finishedPeriodLabel','finishedPeriodStart',
    'finishedPeriodEnd','finishedPeriodPrecision','finishedPeriodBasis',
    'finishedPeriodNote','finishPrecision','readingMode']){
    assert.equal(plan.updates[key],'',key);
  }
  assert.equal(plan.updates.notes,undefined);
  assert.equal(s.api.commit('fake',s.env,parsed,plan,'synthetic-transaction'),'APPLIED');
  const fields=s.getCommitted().writes[0].update.fields;
  assert.equal(fields.finishedAt.stringValue,'');
  assert.equal(fields.readingMode.stringValue,'');
  assert.equal(fields.notes,undefined);
});

test('protects a filled free-text completion note before undoing read',()=>{
  const s=setup({mockRelease:true});
  s.setBookStatus('read');
  s.setCompletionNote('子の発言が含まれるかもしれない');
  const pending={...s.command,patch:{status:'unread'}};
  assert.throws(()=>s.api.apply('fake',s.env,withCommand(s,pending)),/退避・確認/);
  assert.equal(s.getCommitCount(),0);
  const explicit={...s.command,commandId:'gas-undo-confirmed-01',
    patch:{status:'unread',finishedPeriodNote:''}};
  const plan=s.api.preflight('fake',s.env,s.family,withCommand(s,explicit));
  assert.equal(plan.updates.finishedPeriodNote,'');
});

test('unread and paused cannot receive an explicit nonempty completion period',()=>{
  const s=setup({mockRelease:true});
  s.setBookStatus('read');
  const bad={...s.command,patch:{status:'unread',finishedAt:'2026-10'}};
  assert.throws(()=>s.api.preflight('fake',s.env,s.family,withCommand(s,bad)),/未読了/);
  const wrong={...s.command,patch:{status:'paused',finishedPeriodStart:'2026-10'}};
  assert.throws(()=>s.api.preflight('fake',s.env,s.family,withCommand(s,wrong)),/未読了/);
});


test('scoped book patch is denied without private approval and general writer stays off',()=>{
  const s=setup();
  const c={...s.command,patch:{publisher:'Corrected Publisher'}};
  const parsed=withCommand(s,c);
  assert.equal(s.api.cfg.WRITE_ENABLED,false);
  assert.throws(()=>s.api.apply('fake',s.env,parsed),/未承認/);
  assert.throws(()=>s.api.approvedOnce(),/限定承認設定/);
  assert.equal(s.getCommitCount(),0);
});

test('one-shot approval binds exact command digest, book, field, and 24-hour expiry',()=>{
  const s=setup();
  const c={...s.command,patch:{publisher:'Corrected Publisher'}};
  const parsed=withCommand(s,c);
  const approval={
    commandId:c.commandId,sourceDigest:parsed.digest,bookId:c.bookId,
    field:'publisher',previousValue:'Old Publisher',
    newValue:'Corrected Publisher',
    expiresAt:new Date(Date.now()+60*60*1000).toISOString()
  };
  s.setApproval(approval);
  assert.equal(s.api.scopedGate(parsed,approval),true);
  assert.equal(s.api.scopedGate(parsed,{...approval}),false,
    'approval must be the PRIVATE bound object');
  for(const bad of [
    {...approval,commandId:'different'},
    {...approval,sourceDigest:'a'.repeat(64)},
    {...approval,bookId:'other-book'},
    {...approval,field:'status'},
    {...approval,newValue:'Injected'},
    {...approval,expiresAt:new Date(Date.now()-1000).toISOString()},
    {...approval,expiresAt:new Date(Date.now()+48*3600000).toISOString()},
    {...approval,extra:'not approved'},
  ]){
    s.setApproval(bad);
    assert.equal(s.api.scopedGate(parsed,bad),false);
  }
  s.setApproval(approval);
  const changed={...c,patch:{publisher:'Corrected Publisher',notes:'Changed'}};
  assert.equal(s.api.scopedGate(withCommand(s,changed),approval),false);
});

test('one-shot scoped grant runs normal transactional book.patch while global writer is off',()=>{
  const s=setup();
  s.setPublisher('Old Publisher');
  const c={...s.command,patch:{publisher:'Corrected Publisher'}};
  const parsed=withCommand(s,c);
  const approval={
    commandId:c.commandId,sourceDigest:parsed.digest,bookId:c.bookId,
    field:'publisher',previousValue:'Old Publisher',
    newValue:'Corrected Publisher',
    expiresAt:new Date(Date.now()+3600000).toISOString()
  };
  s.setApproval(approval);
  const result=s.api.apply('fake',s.env,parsed,approval);
  assert.equal(result,'APPLIED');
  assert.equal(s.api.cfg.WRITE_ENABLED,false);
  assert.equal(s.getCommitCount(),1);
  const writes=s.getCommitted().writes;
  assert.equal(writes.length,2);
  assert.equal(writes[0].update.fields.publisher.stringValue,'Corrected Publisher');
  assert.deepEqual(Array.from(writes[0].updateMask.fieldPaths).sort(),
    ['publisher','updatedAt']);
  assert.equal(writes[0].currentDocument.updateTime,'2026-10-24T09:01:02.123456Z');
  assert.equal(writes[1].currentDocument.exists,false);
  assert.equal(writes[1].update.fields.sourceDigest.stringValue,parsed.digest);
});

test('one-shot forbids expanded implicit status writes even with synthetically forged approval',()=>{
  const s=setup();
  const c={...s.command,patch:{status:'unread'}};
  const parsed=withCommand(s,c);
  const approval={
    commandId:c.commandId,sourceDigest:parsed.digest,bookId:c.bookId,
    field:'status',previousValue:'reading',newValue:'unread',
    expiresAt:new Date(Date.now()+3600000).toISOString()
  };
  s.setApproval(approval);
  assert.equal(s.api.scopedGate(parsed,approval),false);
  assert.throws(()=>s.api.apply('fake',s.env,parsed,approval),/未承認/);
  assert.equal(s.getCommitCount(),0);
});

test('end-to-end manual scoped entrypoint commits exactly one approved book patch',()=>{
  const s=setup();
  s.setPublisher('Old Publisher');
  const c={...s.command,patch:{publisher:'Corrected Publisher'}};
  const parsed=withCommand(s,c);
  const approval={commandId:c.commandId,sourceDigest:parsed.digest,bookId:c.bookId,
    field:'publisher',previousValue:'Old Publisher',newValue:'Corrected Publisher',
    expiresAt:new Date(Date.now()+3600000).toISOString()};
  s.setQueueCommand(c);
  s.setApproval(approval);
  s.enableCommitPersistence();
  assert.equal(s.api.cfg.WRITE_ENABLED,false);
  const result=s.api.approvedOnce();
  assert.equal(result.status,'PASS');
  assert.equal(result.outcome,'APPLIED');
  assert.equal(s.getCommitCount(),1);
  const row=s.queueState()[0];
  assert.equal(row[4],'APPLIED');
  assert.equal(row[6],'COMMIT_OK');
  assert.equal(row[7],parsed.digest);
  assert.equal(row[8],1);
  assert.throws(()=>s.api.approvedOnce(),/PENDING/, 'successful one-shot cannot replay');
});

test('manual scoped entrypoint rejects extra PENDING without a Firestore write',()=>{
  const s=setup();
  s.setPublisher('Old Publisher');
  const c={...s.command,patch:{publisher:'Corrected Publisher'}};
  const parsed=withCommand(s,c);
  const approval={commandId:c.commandId,sourceDigest:parsed.digest,bookId:c.bookId,
    field:'publisher',previousValue:'Old Publisher',newValue:'Corrected Publisher',
    expiresAt:new Date(Date.now()+3600000).toISOString()};
  s.setQueueCommand(c);
  s.addQueueCommand({...c,commandId:'gas-unrelated-command'});
  s.setApproval(approval);
  assert.throws(()=>s.api.approvedOnce(),/PENDINGは承認済みの1件/);
  assert.equal(s.getCommitCount(),0);
  assert.equal(s.queueState()[0][4],'PENDING');
});

test('stale book CAS blocks scoped entrypoint without altering the queue',()=>{
  const s=setup();
  s.setPublisher('Old Publisher');
  s.setUpdatedAt('changed');
  const c={...s.command,patch:{publisher:'Corrected Publisher'}};
  const parsed=withCommand(s,c);
  const approval={commandId:c.commandId,sourceDigest:parsed.digest,bookId:c.bookId,
    field:'publisher',previousValue:'Old Publisher',newValue:'Corrected Publisher',
    expiresAt:new Date(Date.now()+3600000).toISOString()};
  s.setQueueCommand(c);
  s.setApproval(approval);
  assert.throws(()=>s.api.approvedOnce(),/更新前条件/);
  assert.equal(s.getCommitCount(),0);
  assert.equal(s.queueState()[0][4],'PENDING');
});

test('legacy book without updatedAt uses Firestore updateTime CAS for exact ageSource patch',()=>{
  const s=setup();
  s.setLegacyBook();
  const official='https://example.invalid/official-book';
  const currentRevision='2026-10-24T09:01:02.123456Z';
  const c={...s.command,expectedUpdatedAt:currentRevision,
    patch:{ageSource:official}};
  const parsed=withCommand(s,c);
  const approval={
    commandId:c.commandId,sourceDigest:parsed.digest,bookId:c.bookId,
    field:'ageSource',previousValue:'',newValue:official,
    expiresAt:new Date(Date.now()+3600000).toISOString()
  };
  s.setQueueCommand(c);
  s.setApproval(approval);
  s.enableCommitPersistence();
  assert.equal(s.api.cfg.WRITE_ENABLED,false);
  assert.equal(s.api.approvedOnce().status,'PASS');
  const writes=s.getCommitted().writes;
  assert.equal(writes.length,2);
  assert.deepEqual(Array.from(writes[0].updateMask.fieldPaths).sort(),
    ['ageSource','updatedAt']);
  assert.equal(writes[0].currentDocument.updateTime,currentRevision);
  assert.equal(writes[0].update.fields.ageSource.stringValue,official);
  assert.equal(s.getCommitCount(),1);
  assert.equal(s.queueState()[0][4],'APPLIED');
  assert.throws(()=>s.api.approvedOnce(),/PENDING/);
});

test('legacy book rejects arbitrary CAS timestamp rather than bypassing revision',()=>{
  const s=setup();
  s.setLegacyBook();
  const c={...s.command,expectedUpdatedAt:'2026-10-24T09:00:00Z',
    patch:{ageSource:'https://example.invalid/source'}};
  const parsed=withCommand(s,c);
  assert.throws(()=>s.api.preflight('fake',s.env,s.family,parsed),/updateTime/);
  assert.equal(s.getCommitCount(),0);
});
