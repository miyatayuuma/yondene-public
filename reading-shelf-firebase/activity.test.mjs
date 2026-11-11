import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

class FakeElement {
  constructor(tag){
    this.tag=tag;this.children=[];this._textContent='';this.hidden=false;
    this.removed=false;this.attributes={};this.classes=new Set();
    this.classList={
      add:name=>this.classes.add(name),
      toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name)
    };
  }
  get textContent(){return this._textContent+this.children.map(child=>child.textContent).join('')}
  set textContent(value){this._textContent=String(value);this.children=[]}
  append(...children){this.children.push(...children)}
  replaceChildren(...children){this.children=[...children]}
  setAttribute(name,value){this.attributes[name]=value}
  remove(){this.removed=true}
}
const fakeDocs=items=>({docs:items.map(item=>({data:()=>item}))});
const fakeDoc=data=>({exists:()=>Boolean(data),data:()=>data});
async function harnessRun(fn){
  const oldDoc=globalThis.document,oldStorage=globalThis.localStorage;
  const original=readFileSync(new URL('./activity.mjs',import.meta.url),'utf8');
  const harness={created:0,closed:0,callbacks:[],limits:[],
    previewCreated:[],previewClosed:[],previewCallbacks:new Map()};
  globalThis.__activityHarness=harness;
  globalThis.document={createElement:tag=>new FakeElement(tag)};
  const backing=new Map();
  globalThis.localStorage={
    getItem:key=>backing.get(key)??null,
    setItem:(key,v)=>backing.set(key,String(v))
  };
  const source=original.replace(/^import .* from 'https:\/\/www\.gstatic\.com\/firebasejs\/[^']+';$/m,
    `const collection=(...paths)=>paths;
     const doc=(db,...paths)=>({paths});
     const query=(...args)=>args;
     const orderBy=(...args)=>args;
     const limit=n=>n;
     const onSnapshot=(q,callback)=>{
       const h=globalThis.__activityHarness;
       if(q.paths){
         const path=q.paths.join('/');
         h.previewCreated.push(path);h.previewCallbacks.set(path,callback);
         return ()=>{h.previewClosed.push(path);h.previewCallbacks.delete(path)};
       }
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
    assert.match(list.children[1].children[0].textContent,/赤毛のアン.*感想/);
    assert.equal(harness.previewCreated.length,2,'only visible text activities load their sources');
    list.children[0].onclick();
    assert.deepEqual(visited,[['book1','c1']]);
    profiles=[{uid:'u1',displayName:'新しい名前'}];
    close.refresh();
    assert.match(list.children[0].children[0].textContent,/新しい名前のコメント/);
    assert.equal(harness.created,1,'nickname changes must not resubscribe');
    assert.equal(controls.children[2].hidden,false,'acknowledge button visible');
    controls.children[2].onclick();
    assert.match(list.children[0].textContent,/新しい活動はありません。/);
    assert.equal(harness.previewClosed.length,2,'acknowledging closes hidden preview listeners');
    assert.equal(backing.get('yondene:activity-seen:bookshelf:u1'),'1000');
    close.refresh();
    assert.equal(list.children.length,1,'read items remain collapsed');
    harness.callbacks[0](fakeDocs([activity('like','u1',1100),activity('comment','c1',1000)]));
    assert.equal(list.children.length,1);
    assert.match(list.children[0].children[0].textContent,/いいね/);
    close();assert.equal(harness.closed,1);assert.equal(section.removed,true);
  });
});

test('reflection, comment and recommendation show live, bounded source previews without copying text to activity',async()=>{
  await harnessRun(async({harness,module})=>{
    const container=new FakeElement('main'),visited=[];
    const close=module.mountFamilyActivity({
      db:{},fid:'bookshelf',userUid:'u1',readerName:()=> 'さくら',
      container,members:()=>[{uid:'u1',displayName:'おばあちゃん'}],
      onBook:(...args)=>visited.push(args),onRecommendations:()=>visited.push(['recommended'])
    });
    const list=container.children[0].children[1];
    const recommendation={...activity('recommendation','rec1',1000),bookId:'',title:'ちょっと長い書名'};
    harness.callbacks[0](fakeDocs([
      recommendation,activity('comment','c1',900),activity('reflection','r1',800),
      activity('like','u1',700),activity('ask-reflection','u1',600)
    ]));
    assert.deepEqual(harness.previewCreated,[
      'families/bookshelf/recommendations/rec1',
      'families/bookshelf/books/book1/comments/c1',
      'families/bookshelf/books/book1/childReflections/r1'
    ]);
    harness.previewCallbacks.get('families/bookshelf/recommendations/rec1')(fakeDoc({reason:'この本が好きな理由。'}));
    harness.previewCallbacks.get('families/bookshelf/books/book1/comments/c1')(fakeDoc({body:'すごく面白かったね。',hidden:false}));
    harness.previewCallbacks.get('families/bookshelf/books/book1/childReflections/r1')(
      fakeDoc({quote:'自分だったらこうする！',attribution:'parent-summary'}));
    assert.match(list.children[0].textContent,/ちょっと長い書名.*おすすめ.*この本が好きな理由/);
    assert.match(list.children[1].textContent,/おばあちゃんのコメント.*すごく面白かったね/);
    assert.match(list.children[2].textContent,/赤毛のアン.*感想.*自分だったらこうする！/);
    assert.doesNotMatch(list.children[2].textContent,/要約|本人の言葉/);
    assert.equal(list.children[2].children[2].className,'activityPreview');
    assert.equal(harness.previewCreated.length,3,'source callbacks must not re-subscribe');
    list.children[0].onclick();list.children[1].onclick();list.children[2].onclick();
    assert.deepEqual(visited,[['recommended'],['book1','c1'],['book1',null]]);

    harness.previewCallbacks.get('families/bookshelf/books/book1/comments/c1')(fakeDoc({body:'編集後のコメント',hidden:false}));
    assert.match(list.children[1].textContent,/編集後のコメント/);
    harness.previewCallbacks.get('families/bookshelf/books/book1/childReflections/r1')(
      fakeDoc({text:'以前の形式で保存した感想'}));
    assert.match(list.children[2].textContent,/以前の形式で保存した感想/);
    harness.previewCallbacks.get('families/bookshelf/books/book1/childReflections/r1')(fakeDoc(null));
    assert.equal(list.children[2].children.length,2,'removed text is not shown from a stale cached preview');
    harness.previewCallbacks.get('families/bookshelf/recommendations/rec1')(fakeDoc({reason:'非表示',hidden:true}));
    assert.equal(list.children[0].children.length,2,'hidden recommendations reveal no reason');

    const controls=container.children[0].children[2];
    controls.children[0].onclick();
    harness.callbacks[1](fakeDocs([
      recommendation,activity('comment','c1',900),activity('reflection','r1',800),
      activity('like','u1',700),activity('ask-reflection','u1',600)
    ]));
    assert.equal(list.children.length,5);
    assert.match(list.children[3].textContent,/いいね/);
    assert.match(list.children[4].textContent,/感想をききたい/);
    assert.equal(list.children[3].children.length,2);
    assert.equal(list.children[4].children.length,2);
    assert.equal(harness.previewCreated.length,6,'only the three text activities resubscribe after reopening history');
    close();
    assert.equal(harness.previewClosed.length,6,'dispose closes source listeners');
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
