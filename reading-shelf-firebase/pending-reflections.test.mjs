import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

class Node {
  constructor(tag){
    this.tag=tag;this.children=[];this.hidden=false;this.open=false;this.textContent='';
    this.events=new Map();this.attributes={};this.disabled=false;this.removed=false;
  }
  append(...nodes){this.children.push(...nodes)}
  replaceChildren(...nodes){this.children=[...nodes]}
  setAttribute(k,v){this.attributes[k]=v}
  addEventListener(k,fn){this.events.set(k,fn)}
  removeEventListener(k){this.events.delete(k)}
  remove(){this.removed=true}
}

async function harnessRun(load,fn){
  const prevDoc=globalThis.document,prevApi=globalThis.__pendingApi;
  const calls=[];
  const original=readFileSync(new URL('./pending-reflections.mjs',import.meta.url),'utf8');
  const source=original.replace(/^import .* from 'https:\/\/www\.gstatic\.com\/firebasejs\/[^']+';$/m,`
    const collection=(db,...p)=>p;
    const query=ref=>ref;
    const limit=n=>n;
    const getDocs=ref=>globalThis.__pendingApi.load(ref);`);
  assert.notEqual(source,original);
  globalThis.document={createElement:tag=>new Node(tag)};
  globalThis.__pendingApi={load:async path=>{
    calls.push(path.join('/'));
    const values=await load(path);
    return {empty:values.length===0,size:values.length,docs:values.map(data=>({data:()=>data}))};
  }};
  try{
    const mod=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
    await fn({mod,calls});
  }finally{
    globalThis.document=prevDoc;globalThis.__pendingApi=prevApi;
  }
}

test('owner queue does not read until opened, queries requests before reflections, shows only pending',async()=>{
  const books=[{id:'a',title:'本A'},{id:'b',title:'本B'},{id:'c',title:'本C'}];
  await harnessRun(async path=>{
    const book=path[3],bucket=path[4];
    if(bucket==='requests')return book==='a'?[{uid:'user1'},{uid:'user2'}]:book==='b'?[{uid:'user1'}]:[];
    if(bucket==='childReflections')return book==='b'?[{quote:'感想あり'}]:[];
    return [];
  },async({mod,calls})=>{
    const container=new Node('div'),opened=[];
    const ui=mod.mountPendingReflections({db:{},fid:'family',books:()=>books,container,onBook:id=>opened.push(id),onError:()=>{}});
    const details=container.children[0],status=details.children[3],list=details.children[4];
    assert.equal(details.open,false);
    assert.equal(calls.length,0,'mount must perform zero Firestore reads');
    details.open=true;
    await ui.refresh();
    assert.equal(calls.filter(x=>x.endsWith('/requests')).length,3);
    assert.equal(calls.filter(x=>x.endsWith('/childReflections')).length,2);
    assert.equal(list.children.length,1);
    assert.equal(list.children[0].children[0].children[0].textContent,'本A');
    assert.match(list.children[0].children[0].children[1].textContent,/2人/);
    assert.match(status.textContent,/1冊が感想待ち/);
    list.children[0].children[1].onclick();
    assert.deepEqual(opened,['a']);
    details.open=false;
    const before=calls.length;
    await ui.refresh();
    assert.equal(calls.length,before,'closed details cannot cause queries');
    ui.dispose();
    assert.equal(details.removed,true);
  });
});

test('queue rechecks after a successful reflection, keeps requests unchanged, and can recover errors',async()=>{
  let recorded=false,fail=false,errors=0;
  await harnessRun(async path=>{
    if(fail)throw Error('network offline');
    if(path[4]==='requests')return [{uid:'member'}];
    if(path[4]==='childReflections')return recorded?[{quote:'記録済'}]:[];
    return [];
  },async({mod})=>{
    const root=new Node('div');
    const ui=mod.mountPendingReflections({db:{},fid:'one',books:()=>[{id:'book1',title:'本'}],container:root,
      onBook:()=>{},onError:()=>{errors++}});
    const details=root.children[0],status=details.children[3],list=details.children[4];
    details.open=true;
    await ui.refresh();
    assert.equal(list.children.length,1);
    recorded=true;
    await ui.refresh();
    assert.match(list.children[0].textContent,/現在、感想待ちの本はありません/);
    fail=true;
    await ui.refresh();
    assert.equal(errors,1);
    assert.match(status.textContent,/取得できません/);
    ui.dispose();
  });
});
