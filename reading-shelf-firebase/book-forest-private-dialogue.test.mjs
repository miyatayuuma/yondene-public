import test from 'node:test';
import assert from 'node:assert/strict';
import {loadPrivateForestDialogue,profileTwinNames} from './book-forest-private-dialogue.mjs';
import {saveCachedForestDialogue,loadCachedForestDialogue,clearCachedForestDialogue} from './book-forest-dialogue-cache.mjs';
import {FOREST_PROFILE_HEADERS} from './book-forest-character-profiles.mjs';
import {profileFixture} from './forest-profile-fixture.mjs';
import {promptFor} from './book-forest-live-dialogue.mjs';

const pair={schemaVersion:1,id:'pair-a',firstName:'あお',secondName:'そら',approval:'approved'};
const fact=[['schemaVersion','memoryId','bookId','bookTitle','text','tags','characters','spoilerLevel','evidenceStatus','confidence','sourceUrl'],
  [1,'mem-1','test-book','架空の本','友だちが庭に水をまいた','庭','king',1,'approved','high','https://example.org/book']];
const packageData={catalog:[{id:'mem-1'}],twinNames:[pair],
  loadedAt:Date.now(),characterProfiles:[profileFixture({id:'jiji'})]};

function source({summary='架空の設定A',migrated=true}={}){
  const calls=[];
  const people=[FOREST_PROFILE_HEADERS,...[['人物像',summary],['口調','みじかく話す'],
    ['一人称','ぼく'],['禁止・注意','説教しない']].map(([field,content])=>
    ['jiji',field,content,'ゲーム演出','','架空の場面','暫定採用','fixture-2'])];
  if(migrated)people.push(['twins','名前ペア',JSON.stringify([pair])]);
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    const data=calls.length===1?{files:[{name:'よんでね｜本の森 キャラクター設定・セリフ台帳',
      mimeType:'application/vnd.google-apps.spreadsheet',id:'x'.repeat(40)}]}:
      calls.length===2?{valueRanges:[{values:fact},{values:people},
        {values:[['資料ID','根拠の種別','確認状態']]}]}:
        {values:[['schemaVersion','pairId','firstName','secondName','approval'],
          [1,pair.id,pair.firstName,pair.secondName,pair.approval]]};
    return new Response(JSON.stringify(data));
  };
  return {calls,fetchImpl};
}

test('private package reads the three source tabs and resolves saved names without a script tab',async()=>{
  for(const migrated of [false,true]){
    const {fetchImpl,calls}=source({migrated});
    const result=await loadPrivateForestDialogue('test-token',{fetchImpl});
    assert.equal(result.catalog[0].id,'mem-1');
    assert.deepEqual(result.twinNames,[pair]);
    assert.equal(result.characterProfiles[0].firstPerson,'ぼく');
    assert.equal(calls.length,migrated?2:3);
    const ranges=new URL(calls[1].url).searchParams.getAll('ranges');
    assert.deepEqual(ranges.map(range=>range.split('!')[0]),["'物語記憶'","'人物設定'","'根拠資料'"]);
    assert.ok(calls.every(call=>call.options.headers.Authorization==='Bearer test-token'));
    if(!migrated)assert.match(decodeURIComponent(calls[2].url),/ふたご名前/);
  }
  assert.throws(()=>profileTwinNames([FOREST_PROFILE_HEADERS,['twins','名前ペア','{}']]),/名前ペア/);
});

test('reloading the authenticated package changes model input without deployment',async()=>{
  const a=await loadPrivateForestDialogue('test-token',source());
  const b=await loadPrivateForestDialogue('test-token',source({summary:'架空の設定B'}));
  assert.notEqual(a.characterProfiles[0].revision,b.characterProfiles[0].revision);
  const prompt=promptFor({characterId:'jiji',characterProfile:b.characterProfiles[0]});
  assert.match(prompt.npc.voice,/架空の設定B/);
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
  assert.equal(recovered.twinNames[0].id,'pair-a');
  assert.equal('thoughtSeeds' in recovered,false);
  assert.equal(recovered.characterProfiles[0].id,'jiji');
  assert.equal(await loadCachedForestDialogue({uid:'user-2',familyId:'family-1',cacheStorage:storage}),null);
  await clearCachedForestDialogue({uid:'user-1',familyId:'family-1',cacheStorage:storage});
  assert.equal(await loadCachedForestDialogue({uid:'user-1',familyId:'family-1',cacheStorage:storage}),null);
});

test('ambiguous or missing private sheet never uses a guessed ID',async()=>{
  const fakeFetch=async()=>({ok:true,text:async()=>JSON.stringify({files:[]})});
  await assert.rejects(loadPrivateForestDialogue('token',{fetchImpl:fakeFetch}),/一意に特定/);
});


test('stale or future-dated packages cannot silently keep an old persona alive',async()=>{
  const {freshForestDialogue,FOREST_DIALOGUE_MAX_AGE_MS}=await import('./book-forest-dialogue-cache.mjs');
  const now=Date.now();
  assert.equal(freshForestDialogue({loadedAt:now},now),true);
  assert.equal(freshForestDialogue({loadedAt:now-FOREST_DIALOGUE_MAX_AGE_MS},now),false);
  assert.equal(freshForestDialogue({loadedAt:now+1},now),false);
  assert.equal(freshForestDialogue({}),false);
  await assert.rejects(saveCachedForestDialogue({uid:'u',familyId:'f',
    packageData:{...packageData,loadedAt:now-FOREST_DIALOGUE_MAX_AGE_MS},
    cacheStorage:{open:async()=>({})}}),/読込時刻/);
});
