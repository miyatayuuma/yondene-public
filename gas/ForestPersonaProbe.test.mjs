import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {probeInput} from './ForestPersonaProbe.mjs';
import {FOREST_PROFILE_HEADERS} from '../reading-shelf-firebase/book-forest-character-profiles.mjs';
const people=[FOREST_PROFILE_HEADERS,...[['人物像','架空の工作好きな相棒'],['口調','短く行動で表す'],
  ['禁止・注意','声を出さない'],['動機','友だちと道具をなおす'],['関係性','架空の親友']].map(([key,value])=>
  ['cat',key,value,'ゲーム演出','','架空の森だけ','暫定採用','test-v2'])];
const sources=[['資料ID','根拠の種別','確認状態']];
test('independent GAS probe uses the same parser, prompt and Worker input, with no real reading data',()=>{
  const p=probeInput(people,sources,'cat','架空の橋','道具をなおそう');
  assert.equal(p.input.max_completion_tokens,320);
  assert.equal(p.input.chat_template_kwargs.enable_thinking,false);
  const sent=JSON.parse(p.input.messages[1].content);
  assert.equal(sent.npc.profileRevision,p.profile.revision);
  assert.ok(sent.npc.voice.includes('友だちと道具をなおす'));
  assert.equal(sent.context.situation.evidence,'imagined');
  assert.equal('readerReflection' in sent.context,false);
});
test('generated Apps Script saves actual output and exact model input before marking one pending request applied',()=>{
  const output=[],marks=[],requests=[];
  const dataSheet=rows=>({getDataRange:()=>({getDisplayValues:()=>rows})});
  const sheets={人物設定:dataSheet(people),根拠資料:dataSheet(sources),
    Gemma検証キュー:{...dataSheet([['headers'],['fixture-request','cat','架空の橋','道具をなおそう','PENDING'],
      ['draft-request','cat','架空の橋','','DRAFT']]),getRange:(row,col)=>({setValue:v=>marks.push([row,col,v]),setValues:()=>{}})},
    Gemma検証結果:{...dataSheet([['headers']]),getRange:()=>({setValues:()=>{}}),appendRow:row=>output.push(row)}};
  const properties={CLOUDFLARE_AI_TEST_TOKEN:'fixture-test-token',CLOUDFLARE_AI_TEST_ACCOUNT_ID:'a'.repeat(32)};
  const ctx=vm.createContext({SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:n=>sheets[n]}),flush:()=>{}},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k],setProperty:(k,v)=>properties[k]=v})},
    Utilities:{formatDate:()=> '2026-11-17'},
    UrlFetchApp:{fetch:(_url,options)=>{requests.push(JSON.parse(options.payload));return {
      getResponseCode:()=>200,getContentText:()=>JSON.stringify({success:true,result:{response:JSON.stringify({
        text:'（ねこは木の下で道具をならべる。）',mark:null,choices:['いっしょに見る','またね']})}})};}}});
  vm.runInContext(readFileSync(new URL('./ForestPersonaProbe.gs',import.meta.url),'utf8'),ctx);
  vm.runInContext('yondeneGemmaTestProcessQueue()',ctx);
  assert.equal(requests.length,1);assert.equal(output.length,1);assert.equal(output[0].length,18);
  assert.equal(output[0][17],'PASS');assert.match(output[0][7],/profile2-/);
  assert.equal(JSON.parse(output[0][15]).messages[1].content,requests[0].messages[1].content);
  assert.ok(marks.some(([row,col,value])=>row===2&&col===5&&value==='APPLIED'));
});
