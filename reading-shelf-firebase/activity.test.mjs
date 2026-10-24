import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

class FakeElement {
  constructor(tag){
    this.tag=tag;this.children=[];this.textContent='';this.hidden=false;
    this.removed=false;this.attributes={};this.classes=new Set();
    this.classList={
      add:name=>this.classes.add(name),
      toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name)
    };
  }
  append(...children){this.children.push(...children)}
  replaceChildren(...children){this.children=[...children]}
  setAttribute(name,value){this.attributes[name]=value}
  remove(){this.removed=true}
}
const fakeDocs=items=>({docs:items.map(item=>({data:()=>item}))});
async function harnessRun(fn){
  const oldDoc=globalThis.document,oldStorage=globalThis.localStorage;
  const original=readFileSync(new URL('./activity.mjs',import.meta.url),'utf8');
  const harness={created:0,closed:0,callbacks:[],limits:[]};
  globalThis.__activityHarness=harness;
  globalThis.document={createElement:tag=>new FakeElement(tag)};
  const backing=new Map();
  globalThis.localStorage={
    getItem:key=>backing.get(key)??null,
    setItem:(key,v)=>backing.set(key,String(v))
  };
  const source=original.replace(/^import .* from 'https:\/\/www\.gstatic\.com\/firebasejs\/[^']+';$/m,
    `const collection=(...paths)=>paths;
     const query=(...args)=>args;
     const orderBy=(...args)=>args;
     const limit=n=>n;
     const onSnapshot=(q,callback)=>{
       const h=globalThis.__activityHarness;
       h.created++;h.callbacks.push(callback);h.limits.push(q.at(-1));
       return ()=>{h.closed++};
     };`);
  assert.notEqual(source,original,'Firebase import must be isolated');
  const module=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  try{await fn({harness,module,backing})}
  finally{
    globalThis.document=oldDoc;globalThis.localStorage=oldStorage;
    delete globalThis.__activityHarness;
  }
}
function activity(kind,id,ms){
  return {kind,actorUid:'u1',bookId:'book1',sourceId:id,title:'赤毛のアン',
    createdAt:{toMillis:()=>ms,toDate:()=>new Date(ms)}};
}

test('feed remains compact, can be acknowledged, and only new activity reappears',async()=>{
  await harnessRun(async({harness,module,backing})=>{
    const container=new FakeElement('main'),visited=[];
    let profiles=[{uid:'u1',displayName:'さくら'}];
    const close=module.mountFamilyActivity({
      db:{},fid:'bookshelf',userUid:'u1',readerName:()=> 'さくら',
      container,members:()=>profiles,
      onBook:(id,comment)=>visited.push([id,comment]),
      onRecommendations:()=>{},onError:()=>{}
    });
    const section=container.children[0],list=section.children[1],controls=section.children[2];
    assert.equal(harness.created,1);assert.equal(harness.limits[0],15);
    harness.callbacks[0](fakeDocs([activity('comment','c1',1000),activity('reflection','r1',900),activity('like','u1',800),activity('like','u1',700)]));
    assert.equal(list.children.length,3);
    assert.match(list.children[1].children[0].textContent,/さくらの感想が記録されました/);
    list.children[0].onclick();
    assert.deepEqual(visited,[['book1','c1']]);
    profiles=[{uid:'u1',displayName:'新しい名前'}];
    close.refresh();
    assert.match(list.children[0].children[0].textContent,/新しい名前がコメントしました/);
    assert.equal(harness.created,1,'nickname changes must not resubscribe');
    assert.equal(controls.children[2].hidden,false,'acknowledge button visible');
    controls.children[2].onclick();
    assert.match(list.children[0].textContent,/新しい活動はありません。/);
    assert.equal(backing.get('yondene:activity-seen:bookshelf:u1'),'1000');
    close.refresh();
    assert.equal(list.children.length,1,'read items remain collapsed');
    harness.callbacks[0](fakeDocs([activity('like','u1',1100),activity('comment','c1',1000)]));
    assert.equal(list.children.length,1);
    assert.match(list.children[0].children[0].textContent,/いいね/);
    close();assert.equal(harness.closed,1);assert.equal(section.removed,true);
  });
});

test('history loads on demand in bounded increments and collapses again',async()=>{
  await harnessRun(async({harness,module})=>{
    const container=new FakeElement('main');
    const close=module.mountFamilyActivity({
      db:{},fid:'bookshelf2',userUid:'u1',readerName:()=> 'さくら',
      container,members:()=>[{uid:'u1',displayName:'さくら'}],
      onBook:()=>{},onRecommendations:()=>{},onError:()=>{}
    });
    const section=container.children[0],list=section.children[1],controls=section.children[2];
    const data=Array.from({length:22},(_,i)=>activity('like','id'+i,2200-i));
    harness.callbacks[0](fakeDocs(data.slice(0,15)));
    assert.equal(list.children.length,3);
    controls.children[0].onclick();
    assert.equal(harness.created,2);
    assert.equal(harness.limits[1],21);
    harness.callbacks[1](fakeDocs(data.slice(0,21)));
    assert.equal(list.children.length,20);
    assert.equal(controls.children[1].hidden,false);
    controls.children[1].onclick();
    assert.equal(harness.created,3);
    assert.equal(harness.limits[2],41);
    harness.callbacks[2](fakeDocs(data));
    assert.equal(list.children.length,22);
    controls.children[0].onclick();
    assert.equal(harness.created,4);
    assert.equal(harness.limits[3],15);
    harness.callbacks[3](fakeDocs(data.slice(0,15)));
    assert.equal(list.children.length,3);
    close();assert.equal(harness.closed,4);
  });
});
