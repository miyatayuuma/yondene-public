import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {probeInput,probeConversation,compactProbeStorage} from './ForestPersonaProbe.mjs';
import {FOREST_PROFILE_HEADERS} from '../reading-shelf-firebase/book-forest-character-profiles.mjs';
const people=[FOREST_PROFILE_HEADERS,...[['人物像','架空の工作好きな相棒'],['口調','短く行動で表す'],
  ['禁止・注意','声を出さない'],['動機','友だちと道具をなおす'],['関係性','架空の親友']].map(([key,value])=>
  ['cat',key,value,'ゲーム演出','','架空の森だけ','暫定採用','test-v2'])];
const sources=[['資料ID','根拠の種別','確認状態']];
test('GAS adapter runs the production encounter and reuses its persisted state for revisits',async()=>{
  const transport=async(input,{prompt})=>({response:JSON.stringify({
    text:prompt.closing?'（ねこは手をふった。）':'（ねこは道具をならべた。）',mark:null,
    choices:prompt.closing?[]:['いっしょに見る','見ている']})});
  const first=await probeConversation(people,sources,'cat',{transport});
  assert.equal(first.trace.length,3);
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
test('bundled integrated queue records three real transport calls and state in the existing results shape',async()=>{
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
        text:'（ねこは道具をならべた。）',mark:null,choices:prompt.closing?[]:['いっしょに見る','見ている']})}})};
    }}});
  vm.runInContext(readFileSync(new URL('./ForestPersonaProbe.gs',import.meta.url),'utf8'),ctx);
  await vm.runInContext('yondeneGemmaTestProcessQueue()',ctx);
  assert.equal(requests.length,3);assert.equal(results[1].length,28);assert.equal(results[1][17],'PASS');
  const saved=JSON.parse(results[1][15]);
  assert.equal(saved.conversation.trace.length,3);
  assert.equal(saved.conversation.progress.visits.cat,1);
  assert.equal(properties.YONDENE_GEMMA_TEST_ATTEMPTS_2026_11_18,undefined);
  assert.equal(properties['YONDENE_GEMMA_TEST_ATTEMPTS_2026-11-18'],'3');
  assert.ok(marks.some(([row,col,value])=>row===2&&col===5&&value==='APPLIED'));
});
test('independent GAS probe uses the same parser, prompt and Worker input, with no real reading data',()=>{
  const p=probeInput(people,sources,'cat','架空の橋','道具をなおそう');
  assert.equal(p.input.max_completion_tokens,320);
  assert.equal(p.input.chat_template_kwargs.enable_thinking,false);
  const sent=JSON.parse(p.input.messages[1].content);
  assert.equal(sent.npc.profileRevision,p.profile.revision);
  assert.ok(sent.npc.voice.includes('友だちと道具をなおす'));
  assert.equal(sent.context.situation.evidence,'imagined');
  assert.equal('readerReflection' in sent.context,false);
  assert.ok(sent.constraints.some(rule=>rule.includes('書かない場面はmark:null')));
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
  assert.equal(requests.length,1);assert.equal(output.length,1);assert.equal(output[0].length,28);
  assert.equal(output[0][17],'PASS');assert.match(output[0][7],/profile2-/);
  assert.equal(output[0][18],'synthetic');assert.equal(output[0][22],'SYNTHETIC');
  assert.equal(JSON.parse(output[0][15]).messages[1].content,requests[0].messages[1].content);
  assert.ok(marks.some(([row,col,value])=>row===2&&col===5&&value==='APPLIED'));
});

test('real mirror reflection uses the production selector and labels parent summaries as summaries',()=>{
  const now=Date.parse('2026-11-17T07:00:00.000Z');
  const books=[{id:'fake-read',title:'架空の読了本',status:'read'},
    {id:'fake-unread',title:'架空の未読本',status:'unread'}];
  const reflection={id:'fake-review',bookId:'fake-read',quote:'実際に見た気がする（架空の保護者要約）',
    attribution:'parent-summary',createdAt:now-3600000};
  const mirror={books,reflections:[reflection,
    {id:'bad',bookId:'fake-unread',quote:'未読の記録',attribution:'verbatim',createdAt:now}],
    snapshotAt:now-60000};
  const p=probeInput(people,sources,'cat','ignored','ignored',
    {mode:'mirror-reflection',mirror,now});
  const sent=JSON.parse(p.input.messages[1].content);
  assert.equal(sent.context.sourceKind,'review-reaction');
  assert.match(sent.task,/readerReflectionの具体的な内容/);
  assert.equal(sent.context.readerReflection.attribution,'parent-summary');
  assert.equal(sent.context.readerReflection.quote,reflection.quote);
  assert.equal(sent.context.readerReflection.bookTitle,'架空の読了本');
  assert.equal(p.meta.bookId,'fake-read');
  assert.equal(p.meta.reflectionId,'fake-review');
  assert.equal(p.meta.attribution,'parent-summary');
  assert.equal(sent.npc.profileRevision,p.profile.revision);
  assert.doesNotMatch(sent.context.readerReflection.perspective,/この本に登場した/u);
  assert.throws(()=>probeInput(people,sources,'cat','','',
    {mode:'mirror-reflection',mirror,now,bookId:'fake-unread'}),/BOOK_NOT_READ/);
  assert.throws(()=>probeInput(people,sources,'cat','','',
    {mode:'mirror-reflection',mirror:{...mirror,reflections:[]},now}),/NO_ELIGIBLE_REFLECTION/);
});

test('real read-only story and daily inputs retain provenance and reject unread facts',()=>{
  const now=Date.parse('2026-11-17T07:00:00Z');
  const books=[{id:'fake-read',title:'架空の本',status:'read',finishedAt:'2026-11-15'},
    {id:'fake-unread',title:'未読の本',status:'unread'}];
  const catalog=[
    {schemaVersion:1,id:'fiction-1',bookId:'fake-read',text:'ねこが枝を見つけた（架空の事実）',
      tags:'道具',characters:'cat',spoilerLevel:1,evidenceStatus:'approved',confidence:'high',
      sourceUrl:'https://example.org/fake'},
    {schemaVersion:1,id:'fiction-2',bookId:'fake-unread',text:'未読の出来事',
      tags:'道具',characters:'cat',spoilerLevel:1,evidenceStatus:'approved',confidence:'high',
      sourceUrl:'https://example.org/unread'}
  ];
  const mirror={books,reflections:[],snapshotAt:now-60000};
  const story=probeInput(people,sources,'cat','no','no',
    {mode:'mirror-story',mirror,catalog,now});
  assert.equal(story.prompt.context.sourceKind,'story');
  assert.match(story.prompt.context.topic.fact,/枝を見つけた/);
  assert.doesNotMatch(JSON.stringify(story.prompt),/未読の出来事/);
  assert.equal(story.meta.bookId,'fake-read');
  const daily=probeInput(people,sources,'cat','','',
    {mode:'mirror-daily',mirror,catalog,now});
  assert.equal(daily.prompt.context.sourceKind,'ambient');
  assert.equal(daily.prompt.context.today.visitsToday,1);
  assert.ok(['imagined','reviewed'].includes(daily.prompt.context.today.scene.evidence));
  assert.throws(()=>probeInput(people,sources,'cat','','',
    {mode:'mirror-story',mirror:{...mirror,books:[{id:'fake-read',status:'unread'}]},catalog,now}),
    /NO_VERIFIED_STORY/);
});

test('continuation reuses the same prompt builder, checks offered choices and revoked reading records',()=>{
  const now=Date.parse('2026-11-17T07:00:00Z');
  const books=[{id:'fake-read',title:'架空本',status:'read'}];
  const record={id:'fake-review',bookId:'fake-read',quote:'架空の感想',
    attribution:'verbatim',createdAt:now-10000};
  const mirror={books,reflections:[record],snapshotAt:now};
  const opening=probeInput(people,sources,'cat','','',{mode:'mirror-reflection',mirror,now});
  const previous={characterId:'cat',prompt:opening.prompt,bookId:opening.meta.bookId,
    reflectionId:opening.meta.reflectionId,attribution:'verbatim',turn:0,
    raw:JSON.stringify({text:'（ねこは枝を持って川べりへ行った。）',
      mark:null,choices:['いっしょに行く','待っている']})};
  const reply=probeInput(people,sources,'cat','','',{mode:'continuation',mirror,
    previous,previousId:'fixture-previous',choice:'いっしょに行く',now});
  assert.equal(reply.prompt.mode,'reply');assert.equal(reply.prompt.closing,false);
  assert.deepEqual(reply.prompt.context.recentTurns,[{npc:'（ねこは枝を持って川べりへ行った。）'},
    {playerChoice:'いっしょに行く'}]);
  assert.equal(reply.prompt.context.readerReflection.attribution,'verbatim');
  const finish=probeInput(people,sources,'cat','','',{mode:'continuation',mirror,
    previous:{...previous,prompt:reply.prompt,turn:1},previousId:'fixture-previous',
    choice:'待っている',now});
  assert.equal(finish.prompt.closing,true);
  assert.throws(()=>probeInput(people,sources,'cat','','',
    {mode:'continuation',mirror,previous,previousId:'fixture-previous',choice:'うそ',now}),
    /INVALID_CHOICE/);
  assert.throws(()=>probeInput(people,sources,'cat','','',
    {mode:'continuation',mirror:{...mirror,books:[{id:'fake-read',status:'unread'}]},
      previous,previousId:'fixture-previous',choice:'いっしょに行く',now}),/READ_REVOKED/);
});


test('compressed replay keeps the same last visible lines when recent review logs have no reader text',()=>{
  const entries=['前の一言','次の一言','その次の一言'].map(text=>({event:'generated-reply',characterId:'cat',text,at:1}));
  entries.push({event:'generated-opening',characterId:'cat',readerContext:true});
  const compact=compactProbeStorage({'scenario:live:log':JSON.stringify(entries)});
  assert.deepEqual(JSON.parse(compact['scenario:live:log']).map(e=>e.text),['前の一言','次の一言','その次の一言']);
});
