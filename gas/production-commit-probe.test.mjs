import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('./ProductionCommitProbe.gs',import.meta.url),'utf8');
const uuid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function harness(config={}) {
  const calls=[],logs=[],docs=new Map();
  const suffix='/yondene_gas_acceptance_tests/stage-d-'+uuid;
  if(config.preexisting) docs.set(suffix+'-data',{name:'preexisting',fields:{},updateTime:'t0'});
  const family={fields:{name:{stringValue:'架空の本棚'},
    ownerUid:{stringValue:'owner_fake'}}};
  const reply=(status,body)=>({
    getResponseCode:()=>status,
    getContentText:()=>JSON.stringify(body||{})
  });
  let commits=0,rollbacks=0;
  const cells={B3:config.project||'demo-only',B7:'fake_family',
    B8:'owner_fake'};
  const ctx={
    YONDENE:{project:'demo-only',spreadsheetId:'dummy'},
    SpreadsheetApp:{openById:()=>({getSheetByName:()=>({
      getRange:cell=>({getDisplayValue:()=>cells[cell]})
    })})},
    ScriptApp:{getOAuthToken:()=> 'synthetic-token'},
    Utilities:{getUuid:()=>uuid},
    Logger:{log:s=>logs.push(s)},
    UrlFetchApp:{fetch:(url,opt)=>{
      const suffix=url.split('/documents')[1];
      const body=opt.payload?JSON.parse(opt.payload):null;
      calls.push({suffix,method:opt.method,body});
      if(suffix===':beginTransaction')return reply(200,{transaction:'synthetic-tx'});
      if(suffix===':rollback'){rollbacks++;return reply(200,{})}
      if(suffix===':commit') {
        commits++;
        if(config.failCommit)return reply(503,{});
        if(body.writes.some(w=>docs.has('/'+w.update.name.split('/documents/')[1])))
          return reply(409,{error:'exists'});
        for(const w of body.writes) {
          const path='/'+w.update.name.split('/documents/')[1];
          docs.set(path,{name:w.update.name,fields:w.update.fields,updateTime:'t1'});
        }
        return reply(200,{writeResults:[{},{}]});
      }
      if(suffix==='/families/fake_family' ||
          suffix==='/families/fake_family?transaction=synthetic-tx')
        return reply(200,family);
      const path=suffix.split('?')[0];
      return docs.has(path)?reply(200,docs.get(path)):reply(404,{error:'not found'});
    }}
  };
  runInNewContext(source,ctx);
  return {call:()=>ctx.yondeneProductionCommitProbe(),calls,logs,docs,
    commits:()=>commits,rollbacks:()=>rollbacks,suffix};
}

test('synthetic transaction creates exactly 2 root-only docs, verifies replay rejection',()=>{
  const h=harness();
  const out=h.call();
  assert.equal(out.status,'PASS');
  assert.equal(out.atomicDocuments,2);
  assert.equal(out.duplicateRejected,true);
  assert.equal(out.existingBookChanges,0);
  assert.equal(out.sheetWrites,0);
  assert.equal(out.cleanupPending,true);
  assert.equal(h.docs.size,2);
  assert.ok([...h.docs.keys()].every(key=>
    key.startsWith('/yondene_gas_acceptance_tests/')));
  assert.equal(h.commits(),2);
  assert.ok(h.calls.some(c=>c.suffix===':commit'&&
    c.body.transaction==='synthetic-tx'));
  assert.ok(h.calls.every(c=>!c.suffix.includes('/books/') &&
    !c.suffix.includes('/chatgptMutations/')));
  assert.doesNotMatch(h.logs.join('\n'),/fake_family|owner_fake|synthetic-token/);
});

test('commit uncertainty performs no automatic retry or write cleanup',()=>{
  const h=harness({failCommit:true});
  assert.throws(()=>h.call(),/COMMIT_UNCERTAIN HTTP 503/);
  assert.equal(h.commits(),1);
  assert.equal(h.docs.size,0);
  assert.equal(h.rollbacks(),0);
});

test('preexisting test path aborts before transaction begin',()=>{
  const h=harness({preexisting:true});
  assert.throws(()=>h.call(),/テスト用IDが既存文書と衝突/);
  assert.equal(h.commits(),0);
  assert.ok(h.calls.every(c=>c.suffix!==':beginTransaction'));
});

test('wrong project aborts without network calls',()=>{
  const h=harness({project:'wrong-project'});
  assert.throws(()=>h.call(),/対象プロジェクト・家族/);
  assert.equal(h.calls.length,0);
});
