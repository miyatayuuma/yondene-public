import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('./ProductionReadProbe.gs',import.meta.url),'utf8');

function makeHarness(options={}) {
  const calls=[], logs=[];
  const doc={fields:{name:{stringValue:'架空の本棚'},ownerUid:{stringValue:'owner_test'}}};
  const sync={B3:'demo-fake',B7:'family_test',B8:'owner_test'};
  const data=options.data||sync;
  const reply=(code,value)=>({
    getResponseCode:()=>code,
    getContentText:()=>JSON.stringify(value)
  });
  const ctx={
    YONDENE:{project:'demo-fake',spreadsheetId:'dummy-private'},
    SpreadsheetApp:{openById:()=>({getSheetByName:name=>
      name==='同期状態'?{getRange:cell=>({
        getDisplayValue:()=>data[cell]||''
      })}:null})},
    ScriptApp:{getOAuthToken:()=> 'synthetic-token'},
    Utilities:{getUuid:()=> '0000-fake-unique'},
    Logger:{log:message=>logs.push(message)},
    UrlFetchApp:{fetch:(url,options)=>{
      const path=url.split('/documents')[1];
      calls.push({path,method:options.method,body:options.payload||null});
      if(path===':beginTransaction') return reply(200,{transaction:'tx-fake'});
      if(path===':rollback') return reply(200,{});
      if(path?.includes('?transaction=')) {
        if(options.failTransactionRead) return reply(503,{error:'simulated'});
        return reply(200,doc);
      }
      if(path?.endsWith(':runQuery')) return reply(200,[{readTime:'2026-10-24T00:00:00Z'}]);
      if(path==='/families/family_test') return reply(200,doc);
      throw Error('unexpected request '+path);
    }}
  };
  if(options.failTransactionRead) {
    const oldFetch=ctx.UrlFetchApp.fetch;
    ctx.UrlFetchApp.fetch=(url,request)=>{
      if(url.includes('?transaction=')) return reply(503,{error:'simulated'});
      return oldFetch(url,request);
    };
  }
  runInNewContext(source,ctx);
  return {call:()=>ctx.yondeneProductionReadProbe(),calls,logs};
}

test('full production probe performs only GET / begin / query / rollback and no writes',()=>{
  const h=makeHarness();
  const result=h.call();
  assert.equal(result.status,'PASS');
  assert.equal(result.productionMutations,0);
  assert.equal(result.sheetWrites,0);
  assert.deepEqual(h.calls.map(c=>c.method),
    ['get','post','get','post','post']);
  assert.deepEqual(h.calls.map(c=>c.path),
    ['/families/family_test',':beginTransaction',
      '/families/family_test?transaction=tx-fake',
      '/families/family_test:runQuery',':rollback']);
  assert.ok(h.calls.every(c=>!c.path.includes(':commit')));
  assert.match(h.calls[3].body,/yondene-read-probe-0000-fake-unique/);
  assert.doesNotMatch(h.logs.join('\n'),/family_test|owner_test|synthetic-token/);
});

test('transaction read HTTP failure still rolls back and never commits',()=>{
  const h=makeHarness({failTransactionRead:true});
  assert.throws(()=>h.call(),/transaction GET HTTP 503/);
  assert.equal(h.calls.at(-1).path,':rollback');
  assert.ok(h.calls.every(c=>!c.path.includes(':commit')));
});

test('mismatched target identifiers abort before any Firestore request',()=>{
  const h=makeHarness({data:{B3:'other-project',B7:'family_test',B8:'owner_test'}});
  assert.throws(()=>h.call(),/プロジェクトまたは対象家族/);
  assert.equal(h.calls.length,0);
});
