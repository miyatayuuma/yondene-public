import test from 'node:test';
import assert from 'node:assert/strict';
import {loadPrivateForestDialogue,parseForestDialogueRows} from './book-forest-private-dialogue.mjs';
import {saveCachedForestDialogue,loadCachedForestDialogue,clearCachedForestDialogue} from './book-forest-dialogue-cache.mjs';

const headers=['schemaVersion','cueId','npcId','kind','bookId','memoryId','fromNpc','text','choicesJson','approval'];
const values=[headers,[1,'test-meet','king','meet','','','','こんにちは','', 'approved'],
  [1,'test-review','cat','story','','','','（ねこが絵を描く）{memory}','', 'approved'],
  [1,'test-rejected','king','meet','','','','未承認です','', 'draft']];
const fact=[['schemaVersion','memoryId','bookId','bookTitle','text','tags','characters','spoilerLevel','evidenceStatus','confidence','sourceUrl'],
  [1,'mem-1','test-book','架空の本','友だちが庭に水をまいた','庭','king',1,'approved','high','https://example.org/book']];
const packageData={catalog:[{schemaVersion:1,id:'mem-1',bookId:'test-book',bookTitle:'架空の本',
  text:'友だちが庭に水をまいた',tags:'庭',characters:'king',spoilerLevel:1,
  evidenceStatus:'approved',confidence:'high',sourceUrl:'https://example.org/book'}],
  cues:parseForestDialogueRows(values)};

test('only approved, valid authored dialogue lines load from the private sheet',()=>{
  assert.deepEqual(packageData.cues.map(x=>x.id),['test-meet','test-review']);
  assert.equal(parseForestDialogueRows([['x','y'],[1,2]]).length,0);
});

test('Drive lookup and Google Sheets batchGet are owner-authorized, bounded, and do not disclose IDs in source',async()=>{
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    const data=calls.length===1?{files:[{name:'よんでね｜本の森 キャラクター設定・セリフ台帳',
      mimeType:'application/vnd.google-apps.spreadsheet',id:'x'.repeat(40)}]}:
      {valueRanges:[{values:fact},{values}]};
    return {ok:true,text:async()=>JSON.stringify(data)};
  };
  const result=await loadPrivateForestDialogue('test-token',{fetchImpl});
  assert.equal(result.catalog.length,1);
  assert.equal(result.cues.length,2);
  assert.match(calls[0].url,/drive\/v3\/files/);
  assert.match(calls[1].url,/sheets\.googleapis\.com\/v4\/spreadsheets/);
  assert.equal(calls[1].options.headers.Authorization,'Bearer test-token');
  assert.ok(!calls[0].url.includes('test-book'));
});

test('private conversation cache uses owner scope and clears on command',async()=>{
  const collections=new Map();
  const storage={
    keys:async()=>[...collections.keys()],
    open:async name=>{
      if(!collections.has(name))collections.set(name,new Map());
      return {put:async(k,v)=>collections.get(name).set(k,v),
        match:async k=>collections.get(name).get(k)};
    },
    delete:async name=>collections.delete(name)
  };
  assert.equal(await loadCachedForestDialogue({uid:'user-1',familyId:'family-1',cacheStorage:storage}),null);
  await saveCachedForestDialogue({uid:'user-1',familyId:'family-1',packageData,cacheStorage:storage});
  const recovered=await loadCachedForestDialogue({uid:'user-1',familyId:'family-1',cacheStorage:storage});
  assert.equal(recovered.catalog[0].id,'mem-1');
  assert.equal(await loadCachedForestDialogue({uid:'user-2',familyId:'family-1',cacheStorage:storage}),null);
  await clearCachedForestDialogue({uid:'user-1',familyId:'family-1',cacheStorage:storage});
  assert.equal(await loadCachedForestDialogue({uid:'user-1',familyId:'family-1',cacheStorage:storage}),null);
});

test('ambiguous or missing private sheet never uses a guessed ID',async()=>{
  const fakeFetch=async()=>({ok:true,text:async()=>JSON.stringify({files:[]})});
  await assert.rejects(loadPrivateForestDialogue('token',{fetchImpl:fakeFetch}),/一意に特定/);
});
