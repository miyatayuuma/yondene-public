import test from 'node:test';
import assert from 'node:assert/strict';
import {createForestLiveDialogueDirector,validateLiveForestOutput,promptFor} from './book-forest-live-dialogue.mjs';
import {parseForestCharacterProfiles} from './book-forest-character-profiles.mjs';
import {profileFixture} from './forest-profile-fixture.mjs';

function memoryStorage(){
  const entries=new Map();
  return {getItem:key=>entries.get(key)||null,setItem:(key,value)=>entries.set(key,value),
    removeItem:key=>entries.delete(key),entries};
}
// Synthetic private-sheet fixture; never copy actual household profile rows.
const mockCatProfiles=(summary='架空の相棒・テスト設定A')=>[profileFixture({id:'cat',summary,
    values:'王さまとの友情',motivation:'生活を整える',relationships:'王さま',
    behavior:'家事・買い物を助ける',reactions:'落ち着いて工夫する',firstPerson:'',
    cadence:'人語を話さず行動で伝える',expression:'用件のある文字を書く',avoid:'声で話さない'})];

const identity={characterId:'kiki',displayName:'キキ'};
const kikiProfiles=()=>[profileFixture({id:'kiki'})];

test('generates contextual reply choices, then a character reply only after a child selects one',async()=>{
  const storage=memoryStorage(),prompts=[];
  const generator=async prompt=>{
    prompts.push(prompt);
    return prompts.length===1?{text:'この風、少し遠くまで行きたくなるね。',
      choices:['風の音を聞く','どこに行く？']}:
      {text:'この先の道を歩いてみたいな。',choices:[
        {label:'どんな道？',outcome:'小さな花が道のわきに並んでいるよ。'},
        {label:'ここで待つ',outcome:'この木の下なら風がやさしいね。'}]};
  };
  const director=createForestLiveDialogueDirector({getCharacterProfiles:kikiProfiles,generate:generator,storage,now:()=>1000});
  const first=await director.start(identity);
  assert.equal(prompts.length,1,'one call on an active encounter, never background loops');
  assert.equal(first.text,'この風、少し遠くまで行きたくなるね。','ambient opening changes');
  assert.deepEqual(first.choices.map(x=>x.label),['風の音を聞く','どこに行く？']);
  assert.equal(prompts[0].context.npcLine,'','legacy script must not enter prompt');
  assert.equal(prompts[0].mode,'opening');
  assert.equal(prompts[0].context.today.visitsToday,1);
  const second=await director.select({...identity,choiceId:first.choices[0].id});
  assert.equal(prompts.length,2);
  assert.equal(prompts[1].context.chosenLabel,'風の音を聞く');
  assert.equal(second.text,'この先の道を歩いてみたいな。');
  assert.deepEqual(second.choices.map(x=>x.label),['どんな道？','ここで待つ']);
  assert.equal(director.getProgress().aiRequestsThisSession,2);
  const log=JSON.parse(storage.getItem('forest-ai-local-v1:log'));
  assert.deepEqual(log.map(x=>x.event),['generated-opening','selected-offered-choice','generated-reply']);
  assert.equal(log[0].text,first.text,'export can reconstruct the initial line');
  assert.equal(log[0].promptVersion,'forest-scene-generation-v42-profile2');
  assert.equal(log[1].label,'風の音を聞く');
  director.end();
});

test('a second AI reply ends the encounter naturally without requesting or showing another choice',async()=>{
  const storage=memoryStorage(),prompts=[];
  const generator=async prompt=>{
    prompts.push(prompt);
    const choices=prompt.context.repliesLeft===1?
      [{label:'何の音？',outcome:'風が木を鳴らしている音だよ。'},
        {label:'ここで待つ',outcome:'風の音、少し小さくなったね。'}]:['もう少し聞く','ここで待つ'];
    return {text:'森の奥から音がするね。',choices};
  };
  const director=createForestLiveDialogueDirector({getCharacterProfiles:kikiProfiles,generate:generator,storage});
  let result=await director.start(identity);
  assert.equal(result.choices.length,2);
  for(let i=0;i<2;i++){
    result=await director.select({...identity,choiceId:result.choices[0].id});
    assert.equal(result.choices.length,i===1?0:2);
  }
  assert.equal(result.conversationComplete,true);
  assert.equal(prompts[1].context.repliesLeft,1);
  assert.equal(result.text,'風が木を鳴らしている音だよ。');
  assert.equal(prompts.length,2,'the selected ending makes no network request');
  assert.equal(director.getProgress().aiRepliesThisSession,2);
  await director.select({...identity,choiceId:'old-choice'});
  assert.equal(prompts.length,2,'closed encounter cannot start another AI call');
});

test('closing an encounter during the opening delay sends no AI request',async()=>{
  const storage=memoryStorage();let calls=0;
  const director=createForestLiveDialogueDirector({getCharacterProfiles:kikiProfiles,storage,startDelayMs:30,
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
  const director=createForestLiveDialogueDirector({getCharacterProfiles:kikiProfiles,storage,startDelayMs:0,now:()=>2000,
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

test('a previously generated choice cannot be replayed after a new encounter',async()=>{
  const director=createForestLiveDialogueDirector({getCharacterProfiles:kikiProfiles,storage:memoryStorage(),
    generate:async()=>({text:'ちょっと森の奥まで行こうかな。',
      choices:['森を歩きたい','ちょっと休む']})});
  const prior=await director.start(identity);
  await director.start(identity);
  const result=await director.select({...identity,choiceId:prior.choices[0].id});
  assert.equal(result,null);
});

test('nonverbal NPC chooses reactions by context, with writing optional and no hardcoded persona',()=>{
  const characterProfile=mockCatProfiles()[0];
  const base={characterId:'cat',characterProfile,mode:'opening'};
  const review={bookTitle:'架空の読了本',quote:'石がころがるところがおもしろい',
    attribution:'verbatim',perspective:'別作品を聞いた第三者'};
  const reflection=promptFor({...base,sourceKind:'review-reaction',reviewSpotlight:review});
  const casual=promptFor({...base,sourceKind:'ambient'});
  const story=promptFor({...base,sourceKind:'story',topic:{fact:'架空の本の出来事'}});
  const reply=promptFor({...base,mode:'reply',sourceKind:'review-reaction',
    reviewSpotlight:review,chosenLabel:'もう少し見る',history:[{npc:'（石を見つめる。）'}]});
  const closing=promptFor({...base,mode:'reply',closing:true,
    sourceKind:'review-reaction',reviewSpotlight:review});
  assert.match(reflection.task,/感想の具体的な一箇所/u);
  assert.match(story.task,/確認済み/u);
  assert.match(reply.task,/選ばれた言葉/u);
  assert.match(closing.task,/ひと区切り/u);
  assert.notEqual(reflection.task,casual.task);
  assert.equal(reflection.task,promptFor({...base,characterId:'king',reviewSpotlight:review}).task);
  assert.equal(reflection.output.shape.delivery,'written');
  assert.equal(reflection.context.readerReflection.quote,review.quote);
  assert.equal(reflection.context.readerReflection.attribution,'verbatim');
  assert.equal(reflection.npc.voice.includes('家事・買い物'),true);
  assert.doesNotMatch(reflection.constraints.join(' '),/家事・買い物|王さまとの友情/u,
    'character personality must come from the private profile');
  assert.deepEqual(validateLiveForestOutput({text:'（石を指して、しばらく静かに見守る。）',
    delivery:'gesture',choices:['近くで見てみる','そのまま待つ']},
  {characterId:'cat',requireLine:true}),{text:'（石を指して、しばらく静かに見守る。）',
    delivery:'gesture',labels:['近くで見てみる','そのまま待つ']});
  assert.deepEqual(validateLiveForestOutput({text:'（枝を拾い、転がりそうな石の前に置いた。）',
    delivery:'gesture',choices:['いっしょに見る','別の道へ行く']},
  {characterId:'cat',requireLine:true}),{text:'（枝を拾い、転がりそうな石の前に置いた。）',
    delivery:'gesture',labels:['いっしょに見る','別の道へ行く']});
  assert.equal(validateLiveForestOutput({text:'（「そうね」と心の中で思った。）',
    delivery:'gesture',choices:['近くで見る','もう帰る']},{characterId:'cat',requireLine:true}),null);
});

test('cat uses a private Sheets persona for nonverbal AI action and writing, never TTS',async()=>{
  const storage=memoryStorage(),prompts=[];
  const director=createForestLiveDialogueDirector({
    generate:async prompt=>{
      prompts.push(prompt);
      return {text:'おしろの 下に ききの りぼんが あるよ。',delivery:'written',choices:[
        {label:'なにいろ？',outcome:'夕やけみたいな だいだいだよ。',delivery:'written'},
        {label:'しずかに見ている',outcome:'（ねこはうなずいた。）',delivery:'gesture'}]};
    },
    storage,startDelayMs:0,maxReplies:1,
    getCharacterProfiles:()=>mockCatProfiles()
  });
  const identity={characterId:'cat',displayName:'ねこ'};
  const opening=await director.start(identity);
  assert.equal(prompts.length,1,'silent cat also receives a generated first encounter');
  assert.ok(prompts[0].npc.voice.includes('人語を話さず'));
  assert.deepEqual(Object.keys(prompts[0].output.shape).sort(),['choices','delivery','text']);
  assert.match(prompts[0].npc.voice,/架空の相棒・テスト設定A/);
  assert.match(prompts[0].npc.voice,/家事・買い物/);
  assert.doesNotMatch(prompts[0].constraints.join('|'),/王さまとの友情|家事・買い物/, 'persona must come from Sheets only');
  assert.equal(opening.delivery,'written');
  assert.equal(opening.text,'おしろの 下に ききの りぼんが あるよ。');
  assert.equal(opening.choices.length,2);
  const final=await director.select({...identity,choiceId:opening.choices[0].id});
  assert.equal(final.conversationComplete,true);
  assert.equal(final.delivery,'written');
  assert.equal(final.text,'夕やけみたいな だいだいだよ。');
  assert.equal(prompts.length,1);
  assert.deepEqual(final.choices,[]);
  director.end();
});

test('cat rejects model-generated speech and invalid writing, preserving its authored action',async()=>{
  const lines=[
    {text:'こんにちは！',delivery:'gesture',choices:['みる','ついていく']},
    {text:'HELLO',delivery:'written',choices:['みる','ついていく']},
    {text:'（ねこは「はい」としゃべった。）',delivery:'gesture',choices:['みる','ついていく']}
  ];
  for(const output of lines){
    assert.equal(validateLiveForestOutput(output,{characterId:'cat',requireLine:true}),null);
  }
  let calls=0;
  const director=createForestLiveDialogueDirector({
    generate:async()=>{calls++;return lines[0]},
    getCharacterProfiles:()=>mockCatProfiles(),storage:memoryStorage(),startDelayMs:0
  });
  const line=await director.start({characterId:'cat'});
  assert.equal(calls,1);
  assert.equal(line.text,'（ねこはしっぽをゆっくりふった。）');
  director.end();
});

test('quota or network failure after a cat action cannot turn into a spoken goodbye',async()=>{
  const storage=memoryStorage();let calls=0;
  const director=createForestLiveDialogueDirector({
    generate:async()=>++calls===1?
      {text:'（ねこはうなずいた。）',delivery:'gesture',choices:['みてみる','ついていく']}:
      Promise.reject(Error('Forest AI unavailable (502)')),
    getCharacterProfiles:()=>mockCatProfiles(),storage,startDelayMs:0
  });
  const identity={characterId:'cat'};
  const first=await director.start(identity);
  const final=await director.select({...identity,choiceId:first.choices[0].id});
  assert.match(final.text,/^（ねこは/);
  assert.equal(final.text.includes('また森で会おうね'),false);
  assert.equal(final.conversationComplete,true);
  director.end();
});

test('cat does not call Gemma without its private Sheets persona, even if output mode permits AI',async()=>{
  let requests=0;
  const director=createForestLiveDialogueDirector({
    generate:async()=>{requests++;return {text:'おはよう',delivery:'written',choices:['みる','あそぶ']}},
    storage:memoryStorage(),startDelayMs:0,getCharacterProfiles:()=>[],

  });
  assert.equal((await director.start({characterId:'cat'})).conversationComplete,true);
  assert.equal(requests,0);
  director.end();
});

test('changing only the private cat profile changes the generated prompt without code edits',async()=>{
  const received=[];
  async function visit(summary){
    const director=createForestLiveDialogueDirector({
      generate:async prompt=>{received.push(prompt);return {
        text:'（ねこは王さまに向かってしずかにうなずいた。）',
        delivery:'gesture',choices:['いっしょに行く','もうすこしみる']}},
      storage:memoryStorage(),startDelayMs:0,getCharacterProfiles:()=>mockCatProfiles(summary),

    });
    const result=await director.start({characterId:'cat'});
    assert.equal(result.delivery,'gesture','writing is genuinely optional');
    director.end();
  }
  await visit('設定を確認する用の人物像A');
  await visit('更新後に選ばれる別の人物像B');
  assert.match(received[0].npc.voice,/人物像A/);
  assert.match(received[1].npc.voice,/人物像B/);
  assert.doesNotMatch(received[1].npc.voice,/人物像A/);
  assert.equal(received[0].context.sourceKind,'meet');
});


test('model failures retain distinct safe categories and fallback causality',async()=>{
  for(const [message,reason] of [
    ['Forest AI diagnostic model-json','model-json'],
    ['Forest AI diagnostic output-validation','output-validation'],
    ['Invalid Forest AI JSON','response-json'],
    ['Forest AI unavailable (401)','authentication'],
    ['Failed to fetch','network']
  ]){
    const storage=memoryStorage();
    const director=createForestLiveDialogueDirector({getCharacterProfiles:kikiProfiles,storage,startDelayMs:0,
      generate:async()=>{throw Error(message)}});
    const result=await director.start(identity);
    assert.equal(result.text,'また森で会おうね。');
    const entries=JSON.parse(storage.getItem('forest-ai-local-v1:log'));
    assert.equal(entries.find(entry=>entry.event==='generation-failed')?.reason,reason,message);
    assert.ok(entries.some(entry=>entry.event==='conversation-unavailable'));
    assert.ok(entries.every(entry=>typeof entry.protocolRevision==='string'));
  }
});

test('an automatic timeout is diagnosed, whereas player cancellation is not a model failure',async()=>{
  const storage=memoryStorage();
  const director=createForestLiveDialogueDirector({getCharacterProfiles:kikiProfiles,storage,startDelayMs:0,
    requestTimeoutMs:5,generate:async()=>new Promise(()=>{})});
  const result=await director.start(identity);
  assert.equal(result.text,'また森で会おうね。');
  const events=JSON.parse(storage.getItem('forest-ai-local-v1:log'));
  assert.ok(events.some(event=>event.event==='generation-failed'&&event.reason==='timeout'));
  assert.ok(events.some(event=>event.event==='conversation-unavailable'&&event.reason==='generation-unavailable'));
});


test('cat writing counts content rather than reading spaces',()=>{
  const message='しろい 花が さいているね。木の 下は すずしいよ。水の 音も きこえるし、小さな 虫も いる。雨が ふったら 木の 下で 休もうね。';
  assert.ok(message.length>65);
  assert.ok(message.replaceAll(' ','').length<=65);
  const data={text:message,delivery:'written',choices:['花は なにいろ？','音を ききたい']};
  const options={characterId:'cat',requireLine:true};
  assert.equal(validateLiveForestOutput(data,options)?.text,message);
  assert.equal(validateLiveForestOutput({...data,delivery:'gesture',text:'（はっぱに もじを かく。）'},options),null);
  assert.equal(validateLiveForestOutput({...data,text:'おしろを おぼえているよ。'},options)?.text,
    'おしろを おぼえているよ。');
});

test('closing choices keep an immediate answer and remove the invitation to move',()=>{
  const result=validateLiveForestOutput({text:'木のうらならぼうしも見えないね。',choices:[
    {label:'どこがいい？',outcome:'大きな石のかげ。小さくなれば見つかりにくいよ。'},
    {label:'その先は？',outcome:'王さまと いっしょに いこう。わくわくするね。'}
  ]},{characterId:'king',requireLine:true,context:{repliesLeft:1}});
  assert.deepEqual(result.labels,['どこがいい？']);
});
