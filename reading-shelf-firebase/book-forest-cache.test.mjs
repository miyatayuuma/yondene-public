import test from 'node:test';
import assert from 'node:assert/strict';
import {FOREST_SPRITE_NAMES} from './book-forest-drive.mjs';
import {
  saveCachedForestSprites,loadCachedForestSprites,clearCachedForestSprites
} from './book-forest-cache.mjs';

function fakeStorage(){
  const stores=new Map();
  return {
    async open(name){
      if(!stores.has(name))stores.set(name,new Map());
      const entries=stores.get(name);
      return {
        async match(key){return entries.get(key)?.clone()},
        async put(key,response){entries.set(key,response.clone())}
      };
    },
    async keys(){return [...stores.keys()]},
    async delete(name){return stores.delete(name)}
  };
}

const manifest={
  schemaVersion:2,frameSize:627,columns:2,rows:2,frameDurationMs:250,
  assets:Object.fromEntries(FOREST_SPRITE_NAMES.map((name,i)=>[
    name,'abcDEFGHIJKLMNO_'+String(i).padStart(10,'0')
  ]))
};
const blobs=Object.fromEntries(FOREST_SPRITE_NAMES.map(name=>[
  name,new Blob([name],{type:'image/png'})
]));

test('restores all high-resolution character sheets without a Drive token or fetch',async()=>{
  const cacheStorage=fakeStorage();
  const uid='owner123',familyId='household456';
  assert.equal(await saveCachedForestSprites({uid,familyId,manifest,blobs,cacheStorage}),true);
  let decoded=0,closed=0;
  const loaded=await loadCachedForestSprites({uid,familyId,cacheStorage,
    decodeImage:async()=>{decoded++;return {width:1254,height:1254,close(){closed++}}}
  });
  assert.deepEqual(Object.keys(loaded.images).sort(),[...FOREST_SPRITE_NAMES].sort());
  assert.equal(decoded,FOREST_SPRITE_NAMES.length);
  loaded.dispose();
  assert.equal(closed,FOREST_SPRITE_NAMES.length);
});

test('optional NPC images round-trip through private cache while old manifests remain valid',async()=>{
  const cacheStorage=fakeStorage(),extras=['hachibee','hakase','mochan'];
  const extended={...manifest,assets:{...manifest.assets}};
  for(const [i,name] of extras.entries())extended.assets[name]='abcdefghijklmnopqrstuv0'+i;
  const withBlobs={...blobs};
  for(const name of extras)withBlobs[name]=new Blob([name],{type:'image/png'});
  await saveCachedForestSprites({uid:'u',familyId:'f',manifest:extended,blobs:withBlobs,cacheStorage});
  const loaded=await loadCachedForestSprites({uid:'u',familyId:'f',cacheStorage,
    decodeImage:async()=>({width:1254,height:1254,close(){}})});
  assert.equal(Object.keys(loaded.images).length,14);
  loaded.dispose();
});

test('cached images are isolated by Firebase user and family and purged on logout',async()=>{
  const cacheStorage=fakeStorage();
  await saveCachedForestSprites({uid:'owner123',familyId:'familyA',manifest,blobs,cacheStorage});
  const decodeImage=async()=>({width:1254,height:1254,close(){}});
  assert.equal(await loadCachedForestSprites({uid:'other456',familyId:'familyA',cacheStorage,decodeImage}),null);
  assert.equal(await loadCachedForestSprites({uid:'owner123',familyId:'familyB',cacheStorage,decodeImage}),null);
  await clearCachedForestSprites({uid:'owner123',familyId:'familyA',cacheStorage});
  assert.equal(await loadCachedForestSprites({uid:'owner123',familyId:'familyA',cacheStorage,decodeImage}),null);
  await saveCachedForestSprites({uid:'owner123',familyId:'familyA',manifest,blobs,cacheStorage});
  await clearCachedForestSprites({cacheStorage});
  assert.equal(await loadCachedForestSprites({uid:'owner123',familyId:'familyA',cacheStorage,decodeImage}),null);
});

test('corrupt or incomplete cached images are discarded and require renewed Drive loading',async()=>{
  const cacheStorage=fakeStorage();
  const uid='owner123',familyId='familyA';
  await saveCachedForestSprites({uid,familyId,manifest,blobs,cacheStorage});
  let closed=0;
  const loaded=await loadCachedForestSprites({uid,familyId,cacheStorage,
    decodeImage:async()=>({width:20,height:20,close(){closed++}})
  });
  assert.equal(loaded,null);
  assert.ok(closed>0);
  assert.equal(await loadCachedForestSprites({uid,familyId,cacheStorage,
    decodeImage:async()=>({width:1254,height:1254})
  }),null);
  assert.ok(!await cacheStorage.keys().then(keys=>keys.some(k=>k.includes('owner123-familyA'))));
});

test('no persistent-storage support falls back cleanly to Drive authorization',async()=>{
  assert.equal(await loadCachedForestSprites({uid:'owner123',familyId:'familyA',cacheStorage:null}),null);
  assert.equal(await saveCachedForestSprites({uid:'owner123',familyId:'familyA',manifest,blobs,cacheStorage:null}),false);
});
