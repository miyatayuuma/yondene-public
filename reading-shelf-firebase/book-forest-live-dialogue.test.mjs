import test from 'node:test';
import assert from 'node:assert/strict';
import {createForestLiveDialogueDirector,validateLiveForestOutput} from './book-forest-live-dialogue.mjs';

function memoryStorage(){
  const entries=new Map();
  return {getItem:key=>entries.get(key)||null,setItem:(key,value)=>entries.set(key,value),
    removeItem:key=>entries.delete(key),entries};
}
const identity={characterId:'kiki',displayName:'キキ'};
const base=()=>({
  async start(){return {text:'今日はいい風がふいているね。',sourceKind:'ambient',
    choices:[{id:'another-topic',label:'ほかの話も聞く'}]}},
  async select(){return {text:'また遊ぼうね。',choices:[]}},end(){},
  async advance(){return null}
});

test('generates contextual reply choices, then a character reply only after a child selects one',async()=>{
  const storage=memoryStorage(),prompts=[];
  const generator=async prompt=>{
    prompts.push(prompt);
    return prompts.length===1?{text:'この風、少し遠くまで行きたくなるね。',
      choices:['風の音を聞く','どこに行く？']}:
      {text:'この先の道を歩いてみたいな。',choices:['いっしょに行く','ここで待つ']};
  };
  const director=createForestLiveDialogueDirector({base:base(),generate:generator,storage,now:()=>1000});
  const first=await director.start(identity);
  assert.equal(prompts.length,1,'one call on an active encounter, never background loops');
  assert.equal(first.text,'この風、少し遠くまで行きたくなるね。','ambient opening changes');
  assert.deepEqual(first.choices.map(x=>x.label),['風の音を聞く','どこに行く？']);
  assert.equal(prompts[0].context.npcLine,'今日はいい風がふいているね。');
  assert.equal(prompts[0].mode,'opening');
  assert.ok(prompts[0].context.today.scene.focus);
  const second=await director.select({...identity,choiceId:first.choices[0].id});
  assert.equal(prompts.length,2);
  assert.equal(prompts[1].context.chosenLabel,'風の音を聞く');
  assert.equal(second.text,'この先の道を歩いてみたいな。');
  assert.deepEqual(second.choices.map(x=>x.label),['いっしょに行く','ここで待つ']);
  assert.equal(director.getProgress().aiRequestsThisSession,2);
  const log=JSON.parse(storage.getItem('forest-ai-local-v1:log'));
  assert.deepEqual(log.map(x=>x.event),['generated-opening','selected-offered-choice','generated-reply']);
  assert.equal(log[0].text,first.text,'export can reconstruct the initial line');
  assert.equal(log[0].promptVersion,'forest-sourced-interaction-v10');
  assert.equal(log[1].label,'風の音を聞く');
  director.end();
});

test('daily and session limits stop requests rather than retrying or running on idle',async()=>{
  const storage=memoryStorage();let calls=0;
  const generator=async()=>{calls++;return {text:'あの道も歩いてみようかな。',
    choices:['どこに行く？','何をする？']}};
  const director=createForestLiveDialogueDirector({base:base(),generate:generator,storage,
    dailyLimit:1,sessionLimit:1,now:()=>1000});
  const first=await director.start(identity);
  assert.equal(first.choices.length,2);assert.equal(calls,1);
  await director.select({...identity,choiceId:first.choices[0].id});
  assert.equal(calls,1,'no model call after cap, local original script is the fallback');
  await director.start(identity);
  assert.equal(calls,1,'second encounter still respects same-day cap');
});

test('a second AI reply ends the encounter naturally without requesting or showing another choice',async()=>{
  const storage=memoryStorage(),prompts=[];
  const generator=async prompt=>{
    prompts.push(prompt);
    return prompt.task.includes('返答候補だけ')?{choices:['森を歩こう','お話ししよう']}:
      {text:'また森で会えるのが楽しみだね。',choices:['またね','うん、またね']};
  };
  const director=createForestLiveDialogueDirector({base:base(),generate:generator,storage});
  let result=await director.start(identity);
  assert.equal(result.choices.length,2);
  for(let i=0;i<2;i++){
    result=await director.select({...identity,choiceId:result.choices[0].id});
    assert.equal(result.choices.length,i===1?0:2);
  }
  assert.equal(result.conversationComplete,true);
  assert.ok(prompts[2].constraints.some(text=>text.includes('この一言で会話を終える')));
  assert.equal(prompts.length,3,'one opening generation and two replies');
  assert.equal(director.getProgress().aiRepliesThisSession,2);
  await director.select({...identity,choiceId:'old-choice'});
  assert.equal(prompts.length,3,'closed encounter cannot start another AI call');
});

test('closing an encounter during the opening delay sends no AI request',async()=>{
  const storage=memoryStorage();let calls=0;
  const director=createForestLiveDialogueDirector({base:base(),storage,startDelayMs:30,
    generate:async()=>{calls++;return {choices:['近くを歩こう','また今度ね']}}});
  const pending=director.start(identity);
  await new Promise(resolve=>setTimeout(resolve,5));
  director.end();
  assert.equal(await pending,null);
  assert.equal(calls,0);
  assert.equal(director.getProgress().aiRequestsThisSession,0);
});

test('closing while an AI reply is pending aborts its fetch and prevents a late line',async()=>{
  const storage=memoryStorage();let observedSignal;
  const director=createForestLiveDialogueDirector({base:base(),storage,startDelayMs:0,now:()=>2000,
    modelId:'test-gemma',generate:async(prompt,{signal})=>{
      if(prompt.mode==='opening')return {text:'向こうの橋が気になるな。',
        choices:['橋を見よう','もう帰ろう']};
      observedSignal=signal;
      return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));
    }});
  const first=await director.start(identity);
  const pending=director.select({...identity,choiceId:first.choices[0].id});
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(observedSignal.aborted,false);
  director.end();
  assert.equal(observedSignal.aborted,true);
  assert.equal(await pending,null);
  const log=JSON.parse(storage.getItem('forest-ai-local-v1:log'));
  assert.ok(log.some(entry=>entry.event==='cancel-requested'&&entry.modelId==='test-gemma'));
  assert.equal(log.some(entry=>entry.event==='generated-reply'),false);
});

test('reflections and twins never send child remarks or autoplay lines to an external model',async()=>{
  const storage=memoryStorage();let calls=0;
  const generator=async()=>{calls++;return {choices:['うん、そうだね','もうひとつ聞きたい']}};
  const reflection=createForestLiveDialogueDirector({base:{...base(),
    start:async()=>({text:'お子さんが「おもしろかった」と言ったんだね。',
      sourceKind:'reflection',choices:[]})},generate:generator,storage});
  await reflection.start(identity);
  const twins=createForestLiveDialogueDirector({base:{...base(),start:async()=>({mode:'twins',
    text:'わたしはアケビ！',autoNext:true,choices:[]})},generate:generator,storage});
  await twins.start({characterId:'twins'});
  assert.equal(calls,0);
});

test('bad LLM output is rejected, preserving approved fallback and avoiding fabricated NPC facts',async()=>{
  assert.equal(validateLiveForestOutput({text:'キキは、これを見たんだよ。',choices:['はい','いいえ']},
    {characterId:'kiki',requireLine:true}),null);
  assert.equal(validateLiveForestOutput({text:'（こんにちは！）',choices:['はい','いいえ']},
    {characterId:'cat',requireLine:true}),null);
  assert.deepEqual(validateLiveForestOutput({text:'今日は森を歩くね。',choices:['どうして？','どうして？']},
    {characterId:'kiki',requireLine:true}),
    {text:'今日は森を歩くね。',labels:['もう少し聞く','またね']});
  assert.equal(validateLiveForestOutput({text:'ふふ、そうね。わたしも気になるわ。',choices:['どうして？','見に行こう']},
    {characterId:'jiji',requireLine:true}),null,'Jiji must not become a generic female guide');
  assert.equal(validateLiveForestOutput({text:'ぼくはおなかがすいたよ。',choices:['何食べる？','さがそう']},
    {characterId:'ishishi',requireLine:true}),null,'Ishishi does not use a different first person');
  for(const [characterId,text] of [['king','ぼくは何でも知ってるよ！'],
    ['ishishi','俺が考えたんだ。大丈夫さ！'],
    ['jiji','みんな、元気を出して進みましょう！'],
    ['skipper','さあみんな！大冒険の始まりだ！'],
    ['kiki','あのね、キキはその日見たんだよ。']]){
    assert.equal(validateLiveForestOutput({text,choices:['そうだね','もっと聞きたい']},
      {characterId,requireLine:true}),null,`reject role drift: ${characterId}`);
  }
  assert.deepEqual(validateLiveForestOutput({text:'えっ',choices:[]},
    {characterId:'skipper',requireLine:true,closing:true}),{text:'えっ',labels:[]});
  assert.deepEqual(validateLiveForestOutput({text:'おら、これ見て！',
    choices:['見せて','いいね','もう一つ聞く']},{characterId:'ishishi',requireLine:true}),
    {text:'おら、これ見て！',labels:['見せて','いいね']});
  assert.equal(validateLiveForestOutput({text:'とても長い説明です。'.repeat(12),choices:['橋を見に行く','また今度ね']},
    {characterId:'kiki',requireLine:true}),null,'reject verbose lines');
  const original=await base().start();
  const director=createForestLiveDialogueDirector({base:base(),generate:async()=>({choices:['だめ']}),
    storage:memoryStorage()});
  assert.deepEqual(await director.start(identity),original);
});

test('private persona governs each live opening and reply; the shared theme is optional background',async()=>{
  const prompts=[];
  const profile={id:'jiji',summary:'親しい相棒',values:'仲間',motivation:'一緒に旅する',
    relationships:'キキ',behavior:'道を見張る',reactions:'軽い冗談で支える',
    firstPerson:'ぼく',address:'キキ',cadence:'短い観察の言葉',endings:'固定語尾なし',
    habits:'決まり文句は繰り返さない',expression:'目の前の物で比喩する',
    emotion:'驚くと短く言う',avoid:'カウンセラーのような励ましを連発しない',review:'検証中'};
  const input={...base(),start:async()=>({text:'そっちの道は大丈夫かな。',
    sourceKind:'meet',choices:[{id:'other',label:'もっと聞く'}]})};
  const director=createForestLiveDialogueDirector({base:input,storage:memoryStorage(),
    startDelayMs:0,requireCharacterProfile:true,getCharacterProfiles:()=>[profile],
    getCues:()=>[
      {schemaVersion:1,id:'jiji-ambient-1',characterId:'jiji',kind:'ambient',
        text:'あの木、ちょっと曲がってるね。',approval:'approved'},
      {schemaVersion:1,id:'jiji-meet-1',characterId:'jiji',kind:'meet',
        text:'ふうん。きみはそっちに行くんだ。',approval:'approved'},
      {schemaVersion:1,id:'jiji-restricted-1',characterId:'jiji',kind:'ambient',
        bookId:'private-book',text:'その本の秘密を知ってるよ。',approval:'approved'},
      {schemaVersion:1,id:'jiji-reflection',characterId:'jiji',kind:'reflection',
        text:'読書の感想を伝えたね。',approval:'approved'}],
    generate:async prompt=>{
      prompts.push(prompt);
      return {text:'ぼくは先に見ておくよ。',choices:['見てきて','あとでね']};
    }});
  let result=await director.start({characterId:'jiji'});
  assert.equal(result.text,'そっちの道は大丈夫かな。');
  assert.match(prompts[0].npc.voice,/一人称:ぼく/);
  assert.match(prompts[0].npc.voice,/関係性:キキ/);
  assert.deepEqual(prompts[0].npc.approvedExamples,
    ['あの木、ちょっと曲がってるね。','ふうん。きみはそっちに行くんだ。']);
  assert.equal(prompts[0].mode,'choices');
  assert.ok(prompts[0].constraints.some(rule=>rule.includes('情報量や深い話')));
  result=await director.select({characterId:'jiji',choiceId:result.choices[0].id});
  assert.equal(result.text,'ぼくは先に見ておくよ。');
  assert.match(prompts[1].npc.voice,/短い観察の言葉/);
});

test('owner mode never replaces an approved character line when private persona is absent',async()=>{
  let calls=0;
  const director=createForestLiveDialogueDirector({base:base(),storage:memoryStorage(),
    startDelayMs:0,requireCharacterProfile:true,getCharacterProfiles:()=>[],
    generate:async()=>{calls++;return {choices:['歩こう','休もう']}}});
  assert.equal((await director.start(identity)).text,'今日はいい風がふいているね。');
  assert.equal(calls,0);
});

test('the next related NPC can react to the previous selected button and daily scene',async()=>{
  const storage=memoryStorage(),prompts=[];
  const generator=async prompt=>{
    prompts.push(prompt);
    return {text:prompt.npc.id==='kiki'?'今日の森は風が強いね。':'キキは急いでるのかな。',
      choices:['風の音を聞く','ちょっと歩こう']};
  };
  const common={storage,startDelayMs:0,generate:generator,now:()=>Date.UTC(2026,10,11,13)};
  const kiki=createForestLiveDialogueDirector({base:base(),...common,maxReplies:1});
  const start=await kiki.start({characterId:'kiki'});
  await kiki.select({characterId:'kiki',choiceId:start.choices[0].id});
  kiki.end();
  const jiji=createForestLiveDialogueDirector({base:base(),...common});
  await jiji.start({characterId:'jiji'});
  const context=prompts.at(-1).context.today;
  assert.equal(context.previousNpc,'kiki');
  assert.equal(context.relatedEncounter.npc,'kiki');
  assert.equal(context.relatedEncounter.selectedLabel,'風の音を聞く');
  assert.notEqual(context.scene.id,prompts[0].context.today.scene.id);
  assert.ok(prompts.at(-1).constraints.some(rule=>rule.includes('別NPCの会話を本人が聞いたふりはしない')));
});

test('AI choices retain the approved handoff to a related NPC',async()=>{
  const storage=memoryStorage();let generated=0,scriptedSelections=0;
  const authored={...base(),
    start:async()=>({text:'道の奥も気になるね。',sourceKind:'ambient',choices:[
      {id:'another-topic',label:'ほかの話も聞く'},
      {id:'visit-jiji',label:'ジジのところへ',relayTo:'jiji'}]}),
    select:async({choiceId})=>{
      assert.equal(choiceId,'visit-jiji');scriptedSelections++;
      return {text:'ジジも近くにいるよ。',choices:[]};
    }};
  const director=createForestLiveDialogueDirector({base:authored,storage,startDelayMs:0,
    generate:async()=>{generated++;return {text:'ジジはどこかな。',
      choices:['ここで探す','別の道を見る']}}});
  const first=await director.start(identity);
  assert.equal(first.choices.length,2);
  assert.equal(first.choices[0].label,'ここで探す');
  assert.equal(first.choices[1].label,'ジジのところへ');
  const result=await director.select({...identity,choiceId:'visit-jiji'});
  assert.equal(result.text,'ジジも近くにいるよ。');
  assert.equal(scriptedSelections,1);
  assert.equal(generated,1,'handoff never needs an extra AI call');
});

test('Cloudflare quota response disables further model calls for the UTC day',async()=>{
  const storage=memoryStorage();let calls=0;
  const director=createForestLiveDialogueDirector({base:base(),storage,startDelayMs:0,
    now:()=>Date.UTC(2026,10,11,13),generate:async()=>{
      calls++;throw Error('Forest AI daily quota reached');
    }});
  await director.start(identity);
  await director.start(identity);
  assert.equal(calls,1);
  const quota=JSON.parse(storage.getItem('forest-ai-local-v1:budget'));
  assert.equal(quota.day,'2026-11-11');
  assert.equal(quota.exhausted,true);
});

test('a previously generated choice cannot be replayed after a new encounter',async()=>{
  const director=createForestLiveDialogueDirector({base:base(),storage:memoryStorage(),
    generate:async()=>({text:'ちょっと森の奥まで行こうかな。',
      choices:['森を歩きたい','ちょっと休む']})});
  const prior=await director.start(identity);
  await director.start(identity);
  const result=await director.select({...identity,choiceId:prior.choices[0].id});
  assert.equal(result.text,'また遊ぼうね。','old choice is passed only to the local director');
});

test('a related sourced thought informs replies without replacing the approved opening',async()=>{
  const storage=memoryStorage(),prompts=[];
  const books=[{id:'book-1',status:'read'}];
  const catalog=[{schemaVersion:1,id:'mem-1',bookId:'book-1',text:'花を植えた',
    characters:'kiki',
    spoilerLevel:1,evidenceStatus:'approved',confidence:'high',sourceUrl:'https://example.org'}];
  const seeds=[{id:'seed-1',bookId:'book-1',title:'テストの本',memoryId:'mem-1',
    fact:'花を植えた',question:'ひとりでやるのはえらい？',contrast:'助けてもらうのも勇気',
    tags:'協力',lenses:'',spoiler:1,status:'使用可',sourceUrl:'https://example.org',
    selectedCount:0,displayedCount:0}];
  const authored={...base(),start:async()=>({text:'花が咲くといいな。',sourceKind:'story',
    sourceMemoryId:'mem-1',choices:[{id:'another-topic',label:'ほかの話も聞く'}]})};
  const director=createForestLiveDialogueDirector({base:authored,storage,startDelayMs:0,
    now:()=>Date.UTC(2026,10,10,13),getBooks:()=>books,getCatalog:()=>catalog,getSeeds:()=>seeds,
    generate:async prompt=>{prompts.push(prompt);return {text:'わたしも楽しみだな。',
      choices:['自分でやりたい','助けてもらう']}}});
  const first=await director.start(identity);
  assert.equal(first.text,'花が咲くといいな。');
  assert.equal(prompts[0].context.npcLine,'花が咲くといいな。');
  assert.equal(prompts[0].context.topic.fact,'花を植えた');
  assert.equal(prompts[0].context.topic.question,undefined);
  assert.equal(prompts[0].context.topic.philosophy,undefined);
  assert.equal(JSON.stringify(prompts[0]).includes('book-1'),false);
  assert.equal(JSON.parse(storage.getItem('forest-ai-local-v1:thought:events')).length,1,
    'character-specific seed selection preserves the private usage ledger');
  assert.equal(JSON.parse(storage.getItem('forest-ai-local-v1:log')).length,1);
  director.onDisplayed(first,identity);
  director.onDisplayed(first,identity);
  assert.equal(JSON.parse(storage.getItem('forest-ai-local-v1:thought:events')).length,2);
  assert.equal(JSON.parse(storage.getItem('forest-ai-local-v1:log')).length,2,
    'the displayed topic is recorded once');
  books[0].status='unread';
  const revoked=await director.select({...identity,choiceId:first.choices[0].id});
  assert.equal(revoked.conversationComplete,true);
  assert.equal(prompts.length,1,'a revoked book cannot enter another model prompt');
  director.end();
  await director.start(identity);
  assert.equal(prompts.length,2);
  assert.equal(prompts[1].context.topic,undefined,'unread book cannot be forwarded');
});

test('a daily approved seed can drive a new ambient opening without leaking source identifiers',async()=>{
  const local=memoryStorage(),prompts=[],sourced={...base(),
    start:async()=>({text:'今日はいい風がふいているね。',sourceKind:'ambient',
      choices:[{id:'another-topic',label:'ほかの話も聞く'}]})};
  const books=[{id:'private-b',status:'read',finishedAt:'2026-11-11'}];
  const catalog=[{schemaVersion:1,id:'private-m',bookId:'private-b',
    characters:'kiki',text:'キキが荷物を届けた',tags:'配達',
    spoilerLevel:1,evidenceStatus:'approved',confidence:'high',sourceUrl:'https://example.org'}];
  const seeds=[{id:'private-s',bookId:'private-b',memoryId:'private-m',fact:'キキが荷物を届けた',
    tags:'配達',question:'人生に必要な勇気とは？',contrast:'慎重さと勇気',spoiler:1,
    status:'使用可',sourceUrl:'https://example.org',selectedCount:0,displayedCount:0}];
  const director=createForestLiveDialogueDirector({base:sourced,storage:local,startDelayMs:0,
    now:()=>Date.UTC(2026,10,11,13),getBooks:()=>books,getCatalog:()=>catalog,getSeeds:()=>seeds,
    generate:async prompt=>{prompts.push(prompt);return {text:'荷物は無事に届いたよ。',
      choices:['よかったね','配達は大変？']}}});
  const opening=await director.start(identity);
  if(prompts[0].context.today.scene.evidence==='reviewed'){
    const scene=prompts[0].context.today.scene;
    assert.match(scene.focus,/荷物を届けた/u);
    assert.equal(scene.kind,'seed');
    assert.equal(JSON.stringify(prompts[0]).includes('private-b'),false);
    assert.equal(JSON.stringify(prompts[0]).includes('private-m'),false);
    assert.equal(JSON.stringify(prompts[0]).includes('private-s'),false);
    assert.equal(JSON.stringify(prompts[0]).includes('人生に必要な勇気'),false);
    books[0].status='unread';
    const revoked=await director.select({...identity,choiceId:opening.choices[0].id});
    assert.equal(revoked.conversationComplete,true,
      'a once-read source cannot continue after read status is revoked');
    assert.equal(prompts.length,1);
  }else{
    assert.equal(prompts[0].context.today.scene.kind,'ambient',
      'a deliberately ordinary day may skip all book seeds');
  }
});

test('repeat visits can generate choices without replacing an authored story line',async()=>{
  const storage=memoryStorage(),books=[{id:'b1',status:'read'}],calls=[];
  const catalog=[{schemaVersion:1,id:'m1',bookId:'b1',text:'石を拾った',
    spoilerLevel:1,evidenceStatus:'approved',confidence:'high',sourceUrl:'https://example.org'}];
  const seeds=[{id:'s1',bookId:'b1',memoryId:'m1',title:'石の本',fact:'石を拾った',
    question:'どうして？',contrast:'違う見方',tags:'石',spoiler:1,status:'使用可',
    sourceUrl:'https://example.org',selectedCount:0,displayedCount:0}];
  const authored={...base(),start:async()=>({text:'おら、あの石を見つけたぞ！',
    sourceKind:'story',sourceMemoryId:'m1',choices:[{id:'another-topic',label:'ほかの話も聞く'}]})};
  const director=createForestLiveDialogueDirector({base:authored,storage,startDelayMs:0,
    now:()=>Date.UTC(2026,10,10,13),getBooks:()=>books,getCatalog:()=>catalog,getSeeds:()=>seeds,
    generate:async prompt=>{calls.push(prompt);return {choices:['どれどれ','見せて']}}});
  for(let visit=1;visit<=3;visit++){
    const result=await director.start({characterId:'ishishi'});
    assert.equal(result.text,'おら、あの石を見つけたぞ！');
    assert.equal(result.conversationComplete,undefined);
    assert.equal(result.choices.length,2);
    director.end();
  }
  assert.equal(calls.length,3,'generation can continue while the daily request budget remains');
});

test('AI reply failure resumes the authored continuation when possible',async()=>{
  let selected=0;
  const authored={...base(),select:async()=>{selected++;return {text:'あの葉っぱ、見てごらん。',
    sourceKind:'ambient',choices:[{id:'another-topic',label:'ほかの話も聞く'}]}}};
  const director=createForestLiveDialogueDirector({base:authored,storage:memoryStorage(),
    startDelayMs:0,generate:async prompt=>prompt.mode==='choices'?{choices:['見に行く','まだいる']}:
      {text:'ぼくは王さまです。',choices:['そうだね','いいね']}});
  const first=await director.start(identity);
  const next=await director.select({...identity,choiceId:first.choices[0].id});
  assert.equal(next.text,'あの葉っぱ、見てごらん。');
  assert.equal(selected,1);
});


test('a fresh reflection on a different book changes an unrelated NPC opening',async()=>{
  const storage=memoryStorage(),prompts=[];
  const books=[{id:'b-other',title:'ほかの作品',status:'read',
    synopsis:'旅に出る話',synopsisSourceUrl:'https://example.org/story'}];
  const getRecentReflections=async()=>[
    {id:'review-random-id',bookId:'b-other',quote:'タイトルを変えたほうがいい',
      attribution:'verbatim',createdAt:Date.UTC(2026,10,15)}];
  const generator=async prompt=>{
    prompts.push(prompt);
    return {text:'題名を変えるって？ へえ、ちょっと気になるね。',
      choices:['こんな題名は？','別の本は？']};
  };
  const director=createForestLiveDialogueDirector({base:base(),generate:generator,
    storage,startDelayMs:0,now:()=>Date.UTC(2026,10,15,3),
    getBooks:()=>books,getRecentReflections,getCharacterProfiles:()=>[]});
  const line=await director.start(identity);
  assert.equal(prompts.length,1);
  assert.equal(prompts[0].mode,'opening');
  assert.equal(prompts[0].context.sourceKind,'review-reaction');
  assert.equal(prompts[0].context.readerReflection.bookTitle,'ほかの作品');
  assert.equal(prompts[0].context.readerReflection.quote,'タイトルを変えたほうがいい');
  assert.equal(prompts[0].context.readerReflection.summary,'旅に出る話');
  assert.equal(prompts[0].context.readerReflection.key,undefined);
  assert.equal(prompts[0].context.today,undefined,'unrelated daily scene must not intrude');
  assert.ok(prompts[0].constraints.some(text=>text.includes('別作品')));
  assert.equal(line.text,'題名を変えるって？ へえ、ちょっと気になるね。');
  director.onDisplayed(line,identity);
  const raw=JSON.stringify([...storage.entries]);
  assert.equal(raw.includes('review-random-id'),false);
  assert.equal(raw.includes('b-other'),false);
  assert.equal(raw.includes('タイトルを変えたほうがいい'),false,
    'never persist a private reflection excerpt');
  assert.ok(raw.includes('reflection-reaction-displayed'));
  director.end();
  const second=createForestLiveDialogueDirector({base:base(),generate:generator,storage,
    startDelayMs:0,now:()=>Date.UTC(2026,10,15,3),
    getBooks:()=>books,getRecentReflections});
  await second.start(identity);
  assert.equal(prompts[1].context.readerReflection,undefined,
    'review is not replayed to the same character after actual display');
});

test('a private reflection cue is AI-reactive only with an authorized fresh source',async()=>{
  const storage=memoryStorage(),books=[{id:'b',title:'本',status:'read'}],prompts=[];
  const script={async start(){return {text:'きみのことばに「タイトルを変えたい」とあったね。',
      sourceKind:'reflection',choices:[{id:'another-topic',label:'ほかの話'}]}},
    select:async()=>null,end(){}};
  const reactions=[{id:'r',bookId:'b',createdAt:Date.UTC(2026,10,15),
    quote:'タイトルを変えたい',attribution:'parent-summary'}];
  const director=createForestLiveDialogueDirector({base:script,storage,startDelayMs:0,
    now:()=>Date.UTC(2026,10,15,5),getBooks:()=>books,
    getRecentReflections:async()=>reactions,generate:async prompt=>{
      prompts.push(prompt);return {text:'そうか、題名を考えてるんだね。',
        choices:['そうだよ','別の名前もある']};
    }});
  const result=await director.start(identity);
  assert.match(result.text,/題名/);
  assert.equal(prompts[0].context.readerReflection.attribution,'parent-summary');
  assert.equal(prompts[0].context.npcLine,'最近の本の感想を聞いた。');
  director.end();
  const noReview=createForestLiveDialogueDirector({base:script,storage:memoryStorage(),
    getBooks:()=>books,getRecentReflections:async()=>[],
    generate:async()=>{throw Error('not called')}});
  const original=await noReview.start(identity);
  assert.equal(original.sourceKind,'reflection');
});
