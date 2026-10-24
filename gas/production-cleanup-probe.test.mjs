import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const template=readFileSync(new URL('./ProductionCleanupProbe.gs',import.meta.url),'utf8');
const id='stage-d-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function harness(config={}) {
  const calls=[],logs=[],docs=new Map();
  const prefix='projects/demo-only/databases/(default)/documents/';
  const root='/yondene_gas_acceptance_tests/'+id;
  function doc(kind) {
    const path=root+'-'+kind;
    return {name:prefix+path.slice(1),updateTime:'2026-10-24T14:34:10.000Z',
      fields:{
        createdAt:{timestampValue:'2026-10-24T14:34:10.000Z'},
        kind:{stringValue:kind},
        nonce:{stringValue:'nonce-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},
        source:{stringValue:config.tampered&&kind==='marker'?'UNKNOWN':'yondene-gas-production-probe'},
        testId:{stringValue:id}
      }};
  }
  docs.set(root+'-data',doc('data'));
  docs.set(root+'-marker',doc('marker'));
  const family={fields:{ownerUid:{stringValue:'owner_fake'}}};
  const response=(code,body)=>({
    getResponseCode:()=>code,
    getContentText:()=>JSON.stringify(body||{})
  });
  let commits=0,rollbacks=0;
  const ctx={
    YONDENE:{project:'demo-only',spreadsheetId:'dummy'},
    SpreadsheetApp:{openById:()=>({getSheetByName:()=>({
      getRange:cell=>({getDisplayValue:()=>
        ({B3:'demo-only',B7:'fake_family',B8:'owner_fake'})[cell]})
    })})},
    ScriptApp:{getOAuthToken:()=> 'synthetic-token'},
    Logger:{log:s=>logs.push(s)},
    UrlFetchApp:{fetch:(url,opt)=>{
      const suffix=url.split('/documents')[1];
      const body=opt.payload?JSON.parse(opt.payload):null;
      calls.push({suffix,method:opt.method,body});
      if(suffix===':beginTransaction')return response(200,{transaction:'synthetic-tx'});
      if(suffix===':rollback'){rollbacks++;return response(200,{})}
      if(suffix===':commit') {
        commits++;
        if(config.ambiguousCommit)return response(503,{});
        if(!body.writes.every(w=>w.delete&&
            docs.has('/'+w.delete.split('/documents/')[1])&&
            docs.get('/'+w.delete.split('/documents/')[1]).updateTime===
              w.currentDocument.updateTime))
          return response(412,{error:'precondition'});
        for(const w of body.writes)
          docs.delete('/'+w.delete.split('/documents/')[1]);
        return response(200,{writeResults:[{},{}]});
      }
      if(suffix==='/families/fake_family' ||
          suffix==='/families/fake_family?transaction=synthetic-tx')
        return response(200,family);
      const path=suffix.split('?')[0];
      if(!docs.has(path))return response(404,{});
      const found=docs.get(path);
      if(config.staleRead&&suffix.includes('?transaction='))
        return response(200,{...found,updateTime:'2026-10-24T14:34:11.000Z'});
      return response(200,found);
    }}
  };
  const source=template.replace("'REPLACE_WITH_TEST_ID'",
    "'"+(config.wrongId?'missing':id)+"'");
  runInNewContext(source,ctx);
  return {call:()=>ctx.yondeneProductionProbeReconcileAndCleanup(),
    docs,calls,logs,commits:()=>commits,rollbacks:()=>rollbacks};
}

test('reconciles both exact synthetic documents and atomically deletes only them',()=>{
  const h=harness();
  const out=h.call();
  assert.equal(out.status,'PASS');
  assert.equal(out.deletedSyntheticDocuments,2);
  assert.equal(out.preexistingDataMutations,0);
  assert.equal(h.docs.size,0);
  assert.equal(h.commits(),1);
  const writes=h.calls.find(c=>c.suffix===':commit').body.writes;
  assert.equal(writes.length,2);
  assert.ok(writes.every(w=>w.delete.includes('/yondene_gas_acceptance_tests/') &&
    !!w.currentDocument.updateTime));
  assert.ok(h.calls.every(c=>!c.suffix.includes('/books/') &&
    !c.suffix.includes('/chatgptMutations/')));
  assert.doesNotMatch(h.logs.join('\n'),/fake_family|owner_fake|synthetic-token/);
});

test('tampered marker fails without a transaction or delete',()=>{
  const h=harness({tampered:true});
  assert.throws(()=>h.call(),/出所・内容を証明できません/);
  assert.equal(h.commits(),0);
  assert.equal(h.docs.size,2);
});

test('stale transaction-bound read aborts and rolls back before deletion',()=>{
  const h=harness({staleRead:true});
  assert.throws(()=>h.call(),/再読取で試験文書が変化/);
  assert.equal(h.commits(),0);
  assert.equal(h.rollbacks(),1);
  assert.equal(h.docs.size,2);
});

test('ambiguous commit is never retried',()=>{
  const h=harness({ambiguousCommit:true});
  assert.throws(()=>h.call(),/CLEANUP_UNCERTAIN HTTP 503/);
  assert.equal(h.commits(),1);
  assert.equal(h.docs.size,2);
});

test('placeholder/wrong testId cannot issue any request',()=>{
  const h=harness({wrongId:true});
  assert.throws(()=>h.call(),/testIdが未設定または不正/);
  assert.equal(h.calls.length,0);
});
