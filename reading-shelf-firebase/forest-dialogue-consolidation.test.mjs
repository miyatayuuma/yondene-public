import test from 'node:test';
import assert from 'node:assert/strict';
import {loadPrivateForestDialogue} from './book-forest-private-dialogue.mjs';
import {promptFor} from './book-forest-live-dialogue.mjs';
import {eligibleForestDailyTopics} from './book-forest-daily-context.mjs';

test('private dialogue loads without legacy thought seed tab', async ()=>{
  const requested=[];
  const spreadsheetId='A'.repeat(26);
  const fetchImpl=async url=>{
    requested.push(String(url));
    if(String(url).includes('/drive/v3/files')){
      return new Response(JSON.stringify({files:[{
        id:spreadsheetId,name:'よんでね｜本の森 キャラクター設定・セリフ台帳',
        mimeType:'application/vnd.google-apps.spreadsheet'}]}),{status:200});
    }
    return new Response(JSON.stringify({valueRanges:Array.from({length:6},()=>({values:[]}))}),{status:200});
  };
  const data=await loadPrivateForestDialogue('fake-test-google-token',{fetchImpl});
  assert.equal(requested.length,2);
  const ranges=new URL(requested[1]).searchParams.getAll('ranges');
  assert.equal(ranges.length,6);
  assert.equal(ranges.some(range=>range.includes('思考の種')),false);
  assert.equal(ranges.some(range=>range.includes('人物設定')),true);
  assert.equal(ranges.some(range=>range.includes('根拠資料')),true);
  assert.deepEqual(data.thoughtSeeds,[]);
  assert.deepEqual(data.characterProfiles,[]);
});

test('generated speech prompt contains no fallback script text or copied voice examples',()=>{
  for(const characterId of ['king','cat']){
    const p=promptFor({
      characterId,mode:'opening',sourceKind:'meet',
      npcLine:'legacy-script-SENTINEL-DoNotCopy',
      voiceExamples:['legacy-voice-SENTINEL-DoNotCopy']
    });
    const serialized=JSON.stringify(p);
    assert.equal(serialized.includes('SENTINEL'),false);
    assert.equal('approvedExamples' in p.npc,false);
    assert.equal(p.context.npcLine,'');
    assert.equal(p.npc.id,characterId);
  }
});

test('daily theme selection ignores obsolete philosophical seed inputs',()=>{
  assert.deepEqual(eligibleForestDailyTopics({
    characterId:'king',books:[],catalog:[],
    seeds:[{id:'obsolete-philosophy-seed',fact:'未確認事実'}]
  }),[]);
});
