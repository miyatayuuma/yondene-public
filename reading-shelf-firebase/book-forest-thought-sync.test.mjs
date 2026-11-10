import test from 'node:test';
import assert from 'node:assert/strict';
import {syncForestThoughtUsage} from './book-forest-thought-sync.mjs';

const event=(type='displayed')=>({eventId:'seed-2026-11-10-s1-kiki-1-'+type,
  seedId:'s1',at:'2026-11-10T13:00:00.000Z',type,characterId:'kiki',day:'2026-11-10',
  version:'forest-thought-v6'});

test('appends anonymous usage without UID or book text, then reconciles and deduplicates',async()=>{
  let posts=0;
  const ids=['イベントID'];
  const fetchImpl=async(url,options={})=>{
    const result=options.method==='POST'?(posts++,ids.push(...JSON.parse(options.body).values.map(row=>{
      assert.equal(row.length,10);
      assert.equal(row[5],'','anonymous session field');
      assert.equal(row[6],'2026-11-10');
      return row[0];
    })),{}):url.includes('drive/v3')?
      {files:[{id:'a'.repeat(40),name:'よんでね｜本の森 キャラクター設定・セリフ台帳',
        mimeType:'application/vnd.google-apps.spreadsheet'}]}:{values:ids.map(id=>[id])};
    return {ok:true,json:async()=>result,text:async()=>JSON.stringify(result)};
  };
  const events=[event('selected'),event('displayed')];
  const first=await syncForestThoughtUsage({token:'test',events,fetchImpl});
  assert.deepEqual(first,{uploaded:2,skipped:0});
  const second=await syncForestThoughtUsage({token:'test',events,fetchImpl});
  assert.deepEqual(second,{uploaded:0,skipped:2});
  assert.equal(posts,1);
});

test('refuses to write to an unexpected sheet or upload invalid events',async()=>{
  let posts=0;
  const fetchImpl=async(url,options={})=>{
    if(options.method==='POST')posts++;
    const result=url.includes('drive/v3')?{files:[{id:'x'.repeat(40),
      name:'よんでね｜本の森 キャラクター設定・セリフ台帳',
      mimeType:'application/vnd.google-apps.spreadsheet'}]}:{values:[['wrong header']]};
    return {ok:true,json:async()=>result,text:async()=>JSON.stringify(result)};
  };
  await assert.rejects(syncForestThoughtUsage({token:'test',events:[event()],fetchImpl}),/見出し/);
  assert.equal(posts,0);
  assert.deepEqual(await syncForestThoughtUsage({token:'test',events:[{...event(),seedId:'?' }],
    fetchImpl}),{uploaded:0,skipped:0});
});
