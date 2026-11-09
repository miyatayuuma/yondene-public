import test from 'node:test';
import assert from 'node:assert/strict';
import {FOREST_SPRITE_NAMES,validateForestSpriteManifest,loadPrivateForestSprites} from './book-forest-drive.mjs';

const assets=Object.fromEntries(FOREST_SPRITE_NAMES.map((name,i)=>[name,'abcDEFGHIJKLMNO_'+String(i).padStart(10,'0')]));
const manifest={schemaVersion:1,columns:2,rows:2,frameSize:64,frameDurationMs:250,assets};

test('only declared private Drive pixel sprites are accepted',()=>{
  assert.equal(validateForestSpriteManifest(manifest),assets);
  assert.equal(validateForestSpriteManifest({...manifest,schemaVersion:2,frameSize:627}),assets);
  assert.throws(()=>validateForestSpriteManifest({...manifest,assets:{...assets,evil:'1234567890123456789012'}}));
  assert.throws(()=>validateForestSpriteManifest({...manifest,frameSize:32}));
  assert.throws(()=>validateForestSpriteManifest({...manifest,schemaVersion:2,frameSize:64}));
});

test('fetches only the manifest and its validated PNGs via bearer headers',async()=>{
  const calls=[],decoded=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    if(calls.length===1)return {ok:true,json:async()=>manifest};
    return {ok:true,blob:async()=>({size:2000,type:'image/png'})};
  };
  const decodeImage=async()=>{const image={width:128,height:128,close:()=>decoded.push(true)};return image};
  const result=await loadPrivateForestSprites('opaque-test-token',{fetchImpl,decodeImage});
  assert.equal(Object.keys(result.images).length,11);
  assert.equal(calls.length,12);
  for(const call of calls){
    assert.ok(call.url.startsWith('https://www.googleapis.com/drive/v3/files/'));
    assert.ok(!call.url.includes('opaque-test-token'));
    assert.equal(call.options.headers.Authorization,'Bearer opaque-test-token');
  }
  result.dispose();
  assert.equal(decoded.length,11);
});

test('accepts full-resolution 2-by-2 image sheets from the private Drive manifest',async()=>{
  let calls=0;
  const fetchImpl=async()=>{
    calls++;
    return calls===1?{ok:true,json:async()=>({...manifest,schemaVersion:2,frameSize:627})}:
      {ok:true,blob:async()=>({size:1000000,type:'image/png'})};
  };
  const result=await loadPrivateForestSprites('test-token',{
    fetchImpl,decodeImage:async()=>({width:1254,height:1254,close(){}})
  });
  assert.equal(Object.keys(result.images).length,11);
  result.dispose();
});
