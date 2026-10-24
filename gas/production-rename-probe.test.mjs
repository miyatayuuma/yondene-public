import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const template=readFileSync(new URL('./ProductionRenameProbe.gs',import.meta.url),'utf8');
const original='sample-before';
const desired='sample-after';
function harness(options={}) {
  const logs=[],calls=[];
  const id='demo_family',owner='owner_demo',project='demo-only';
  const prefix='projects/'+project+'/databases/(default)/documents/';
  const familyPath='families/'+id;
  const digest=s=>createHash('sha256').update(s).digest('hex');
  const cmdId='shelf-name-'+digest(JSON.stringify([id,original,desired])).slice(0,40);
  const markerPath=familyPath+'/chatgptMutations/'+cmdId;
  let applied=false,commits=0,rollbacks=0;
  let confirmed=original;
  const before={name:prefix+familyPath,createTime:'2026-10-24T00:00:00Z',
    updateTime:'2026-10-24T00:00:01Z',
    fields:{name:{stringValue:options.familyMismatch?'different':original},
      ownerUid:{stringValue:owner},coverMode:{booleanValue:true}}};
  let family=structuredClone(before);
  let marker=options.markerExisting?{name:prefix+markerPath,fields:{}}:null;
  const setting={
    getRange:(range)=>({
      getDisplayValues:()=>{
        if(range==='A1:C2')return [
          ['項目','変更後の名前（入力）','確認済みの名前'],
          ['本棚名',options.sheetMismatch?'wrong':desired,confirmed]
        ];
        if(range==='B2:C2')return [[options.sheetMismatch?'wrong':desired,confirmed]];
        throw Error('unexpected range '+range);
      },
      getDisplayValue:()=>confirmed,
      setValue:x=>{confirmed=x;}
    })
  };
  const sync={getRange:(key)=>({getDisplayValue:()=>
    ({B3:project,B7:id,B8:owner})[key]})};
  const queue={getLastRow:()=>options.pendingQueue?2:1};
  const response=(status,data)=>({
    getResponseCode:()=>status,getContentText:()=>JSON.stringify(data||{})
  });
  const ctx={
    YONDENE:{project,spreadsheetId:'private-sheet'},
    YONDENE_QUEUE:{WRITE_ENABLED:options.writerEnabled??false},
    yondeneSha256_:digest,
    ScriptApp:{getOAuthToken:()=> 'fake-token'},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
    SpreadsheetApp:{openById:()=>({getSheetByName:n=>
      ({'設定':setting,'同期状態':sync,'更新キュー':queue})[n]}),
      flush:()=>{}},
    Logger:{log:x=>logs.push(x)},
    UrlFetchApp:{fetch:(url,opt)=>{
      const suffix=url.split('/documents')[1];
      const data=opt.payload?JSON.parse(opt.payload):null;
      calls.push({suffix,method:opt.method,data});
      if(suffix===':beginTransaction')return response(200,{transaction:'tx-demo'});
      if(suffix===':rollback'){rollbacks++;return response(200,{})}
      if(suffix===':commit') {
        commits++;
        if(options.commitUncertain)return response(503,{error:'unavailable'});
        const [w1,w2]=data.writes;
        if(data.transaction!=='tx-demo'||data.writes.length!==2||
            w1.update.name!==prefix+familyPath||
            JSON.stringify(w1.updateMask.fieldPaths)!=='["name"]'||
            w1.currentDocument.updateTime!==before.updateTime||
            w2.update.name!==prefix+markerPath||
            w2.currentDocument.exists!==false||marker)
          return response(412,{error:'precondition'});
        family={...family,updateTime:'2026-10-24T00:00:02Z',
          fields:{...family.fields,name:{stringValue:desired}}};
        marker={name:prefix+markerPath,createTime:'2026-10-24T00:00:02Z',
          updateTime:'2026-10-24T00:00:02Z',fields:w2.update.fields};
        applied=true;
        return response(200,{writeResults:[{},{}]});
      }
      if(suffix.startsWith('/families/'+id+'?')||
          suffix==='/families/'+id)
        return response(200,options.transactionDrift&&suffix.includes('?')?
          {...family,updateTime:'2026-10-24T00:00:99Z'}:family);
      if(suffix.startsWith('/families/'+id+'/chatgptMutations/'))
        return marker?response(200,
          options.tamperMarker&&applied?
            {...marker,fields:{...marker.fields,
              sourceDigest:{stringValue:'invalid'}}}:marker):response(404,{});
      throw Error('Unexpected Firestore path '+suffix);
    }}
  };
  const source=template.replace("'REPLACE_WITH_OLD_NAME'","'"+original+"'")
    .replace("'REPLACE_WITH_NEW_NAME'","'"+desired+"'");
  runInNewContext(source,ctx);
  return {call:()=>ctx.yondeneProductionRenameOnce(),calls,logs,
    commits:()=>commits,rollbacks:()=>rollbacks,
    confirmed:()=>confirmed,family:()=>family,marker:()=>marker,applied:()=>applied};
}

test('one-shot family rename writes only masked name and matching marker, then confirms C2',()=>{
  const h=harness();
  const result=h.call();
  assert.equal(result.status,'PASS');
  assert.equal(h.commits(),1);
  assert.equal(h.confirmed(),desired);
  assert.equal(h.family().fields.coverMode.booleanValue,true);
  assert.equal(h.family().fields.name.stringValue,desired);
  assert.equal(h.marker().fields.source.stringValue,'chatgpt-gas');
  assert.equal(h.marker().fields.op.stringValue,'family.rename');
  assert.ok(h.calls.every(x=>!x.suffix.includes('/books/')&&!x.suffix.includes('/series/')));
  assert.doesNotMatch(h.logs.join('\n'),/demo_family|owner_demo|fake-token/);
  const writes=h.calls.find(x=>x.suffix===':commit').data.writes;
  assert.equal(writes.length,2);
  assert.deepEqual(Array.from(writes[0].updateMask.fieldPaths),['name']);
  assert.equal(writes[1].currentDocument.exists,false);
});

test('an unprepared sheet request fails closed before Firestore',()=>{
  const h=harness({sheetMismatch:true});
  assert.throws(()=>h.call(),/設定!B2\/C2/);
  assert.equal(h.calls.length,0);
  assert.equal(h.commits(),0);
});

test('writer enabled or an occupied command queue blocks the acceptance',()=>{
  for(const options of [{writerEnabled:true},{pendingQueue:true}]) {
    const h=harness(options);
    assert.throws(()=>h.call());
    assert.equal(h.commits(),0);
    assert.equal(h.confirmed(),original);
  }
});

test('family mismatch or existing marker prevents write',()=>{
  for(const options of [{familyMismatch:true},{markerExisting:true}]) {
    const h=harness(options);
    assert.throws(()=>h.call());
    assert.equal(h.commits(),0);
    assert.equal(h.confirmed(),original);
  }
});

test('transaction drift rolls back without creating marker',()=>{
  const h=harness({transactionDrift:true});
  assert.throws(()=>h.call(),/家族情報が変化/);
  assert.equal(h.commits(),0);
  assert.equal(h.rollbacks(),1);
  assert.equal(h.marker(),null);
});

test('ambiguous commit is attempted once and leaves C2 unchanged',()=>{
  const h=harness({commitUncertain:true});
  assert.throws(()=>h.call(),/RENAME_UNCERTAIN/);
  assert.equal(h.commits(),1);
  assert.equal(h.confirmed(),original);
});

test('post-commit marker mismatch leaves C2 untouched for manual reconciliation',()=>{
  const h=harness({tamperMarker:true});
  assert.throws(()=>h.call(),/RENAME_UNCERTAIN/);
  assert.equal(h.commits(),1);
  assert.equal(h.family().fields.name.stringValue,desired);
  assert.equal(h.confirmed(),original);
});
