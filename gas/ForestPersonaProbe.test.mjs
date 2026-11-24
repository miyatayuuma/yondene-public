import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {probeConversation,compactProbeStorage} from './ForestPersonaProbe.mjs';
import {FOREST_PROFILE_HEADERS} from '../reading-shelf-firebase/book-forest-character-profiles.mjs';
const people=[FOREST_PROFILE_HEADERS,...[['人物像','架空の工作好きな相棒'],['口調','短く行動で表す'],
  ['禁止・注意','声を出さない'],['動機','友だちと道具をなおす'],['関係性','架空の親友']].map(([key,value])=>
  ['cat',key,value,'ゲーム演出','','架空の森だけ','暫定採用','test-v2'])];
const sources=[['資料ID','根拠の種別','確認状態']];
test('GAS adapter runs the production encounter and reuses its persisted state for revisits',async()=>{
  const transport=async(input,{prompt})=>({response:JSON.stringify({
    text:prompt.closing?'（ねこは手をふった。）':'（ねこは道具をならべた。）',delivery:'gesture',
    choices:prompt.closing?[]:prompt.context.repliesLeft===1?
      [{label:'いっしょに見る',outcome:'木の下に 白い花がさいているよ。'}]:['いっしょに見る','見ている']})});
  const first=await probeConversation(people,sources,'cat',{transport});
  assert.equal(first.trace.length,2);
  assert.equal(first.trace[0].prompt.context.sourceKind,'meet');
  assert.equal(first.frames.at(-1).result.conversationComplete,true);
  const second=await probeConversation(people,sources,'cat',{transport,storage:compactProbeStorage(first.storage)});
  const uncompressed=await probeConversation(people,sources,'cat',{transport,storage:first.storage});
  assert.equal(second.trace[0].inputFingerprint,uncompressed.trace[0].inputFingerprint);
  assert.equal(second.trace[0].prompt.context.situation.place,'本の森');
  assert.deepEqual(second.trace[0].prompt.context.situation.presentNpcIds,['cat']);
  assert.equal(second.trace[0].prompt.context.sourceKind,'ambient');
  assert.equal(second.progress.visits.cat,2);
});
test('bundled integrated queue records two transport calls and state in the existing results shape',async()=>{
  const rows=[['headers'],['integrated-request','cat','統合試験','','PENDING','','','','integrated-synthetic']];
  const results=[['headers']],marks=[],requests=[];
  const dataSheet=data=>({getDataRange:()=>({getDisplayValues:()=>data})});
  const sheets={人物設定:dataSheet(people),根拠資料:dataSheet(sources),
    Gemma検証キュー:{...dataSheet(rows),getRange:(row,col)=>({setValue:v=>marks.push([row,col,v]),setValues:()=>{}})},
    Gemma検証結果:{...dataSheet(results),getRange:()=>({setValues:()=>{}}),appendRow:row=>results.push(row)}};
  const properties={CLOUDFLARE_AI_TEST_TOKEN:'fixture-test-token',CLOUDFLARE_AI_TEST_ACCOUNT_ID:'a'.repeat(32)};
  const ctx=vm.createContext({SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:n=>sheets[n]}),flush:()=>{}},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k],setProperty:(k,v)=>properties[k]=v})},
    Utilities:{formatDate:()=> '2026-11-18'},UrlFetchApp:{fetch:(_url,options)=>{
      const input=JSON.parse(options.payload),prompt=JSON.parse(input.messages[1].content);requests.push(prompt);
      return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({success:true,result:{response:JSON.stringify({
        text:'おしろの かねが きこえるね。',delivery:'written',choices:prompt.closing?[]:prompt.context.repliesLeft===1?
      [{label:'鐘はどこ？',outcome:'かねは おしろの 上に あるよ。'},
        {label:'いつ鳴る？',outcome:'ひるに なるよ。'}]:['お城の話を聞く','景色を見る']})}})};
    }}});
  vm.runInContext(readFileSync(new URL('./ForestPersonaProbe.gs',import.meta.url),'utf8'),ctx);
  await vm.runInContext('yondeneGemmaTestProcessQueue()',ctx);
  assert.equal(requests.length,2);assert.equal(results[1].length,28);assert.equal(results[1][17],'PASS');
  const saved=JSON.parse(results[1][15]);
  assert.equal(saved.conversation.trace.length,2);
  assert.equal(saved.conversation.frames[0].result.text,'おしろの かねが きこえるね。');
  assert.equal(saved.conversation.frames[1].result.choices.length,2);
  assert.equal(saved.conversation.frames.at(-1).result.text,'かねは おしろの 上に あるよ。');
  assert.equal(saved.conversation.progress.visits.cat,1);
  assert.equal(properties.YONDENE_GEMMA_TEST_ATTEMPTS_UTC_2026_11_18,undefined);
  assert.equal(properties['YONDENE_GEMMA_TEST_ATTEMPTS_UTC_2026-11-18'],'2');
  assert.ok(marks.some(([row,col,value])=>row===2&&col===5&&value==='APPLIED'));
  // A new visit can reuse encounter state after many previous attempts.
  properties['YONDENE_GEMMA_TEST_ATTEMPTS_UTC_2026-11-18']='76';
  rows[1][4]='APPLIED';
  rows.push(['replay-request','cat','統合試験','','PENDING','','','','integrated-synthetic',
    '','integrated-request','[0,0]','revisit']);
  await vm.runInContext('yondeneGemmaTestProcessQueue()',ctx);
  assert.equal(requests.length,4);
  assert.equal(properties['YONDENE_GEMMA_TEST_ATTEMPTS_UTC_2026-11-18'],'78');
  const replay=JSON.parse(results[2][15]).conversation;
  assert.equal(replay.progress.visits.cat,2);
  assert.equal(replay.frames.at(-1).result.text,'かねは おしろの 上に あるよ。');

});
test('compressed replay keeps the same last visible lines when recent review logs have no reader text',()=>{
  const entries=['前の一言','次の一言','その次の一言'].map(text=>({event:'generated-reply',sourceKind:'ambient',characterId:'cat',text,at:1}));
  entries.push({event:'generated-opening',sourceKind:'meet',characterId:'cat',readerContext:true});
  const compact=compactProbeStorage({'scenario:live:log':JSON.stringify(entries)});
  assert.deepEqual(JSON.parse(compact['scenario:live:log']).map(e=>e.text),['前の一言','次の一言','その次の一言']);
});
