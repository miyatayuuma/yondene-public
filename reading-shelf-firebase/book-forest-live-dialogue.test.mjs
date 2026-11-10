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
    return prompts.length===1?{choices:['風の音を聞く','どこに行く？']}:
      {text:'この先の道を歩いてみたいな。',choices:['いっしょに行く','ここで待つ']};
  };
  const director=createForestLiveDialogueDirector({base:base(),generate:generator,storage,now:()=>1000});
  const first=await director.start(identity);
  assert.equal(prompts.length,1,'one call on an active encounter, never background loops');
  assert.equal(first.text,'今日はいい風がふいているね。','approved NPC line stays intact');
  assert.deepEqual(first.choices.map(x=>x.label),['風の音を聞く','どこに行く？']);
  assert.equal(prompts[0].context.npcLine,'今日はいい風がふいているね。');
  const second=await director.select({...identity,choiceId:first.choices[0].id});
  assert.equal(prompts.length,2);
  assert.equal(prompts[1].context.chosenLabel,'風の音を聞く');
  assert.equal(second.text,'この先の道を歩いてみたいな。');
  assert.deepEqual(second.choices.map(x=>x.label),['いっしょに行く','ここで待つ']);
  assert.equal(director.getProgress().aiRequestsThisSession,2);
  const log=JSON.parse(storage.getItem('forest-ai-local-v1:log'));
  assert.deepEqual(log.map(x=>x.event),['generated-choices','selected-offered-choice','generated-reply']);
  assert.equal(log[1].label,'風の音を聞く');
  director.end();
});

test('daily and session limits stop requests rather than retrying or running on idle',async()=>{
  const storage=memoryStorage();let calls=0;
  const generator=async()=>{calls++;return {choices:['どこに行く？','何をする？']}};
  const director=createForestLiveDialogueDirector({base:base(),generate:generator,storage,
    dailyLimit:1,sessionLimit:1,now:()=>1000});
  const first=await director.start(identity);
  assert.equal(first.choices.length,2);assert.equal(calls,1);
  await director.select({...identity,choiceId:first.choices[0].id});
  assert.equal(calls,1,'no model call after cap, local original script is the fallback');
  await director.start(identity);
  assert.equal(calls,1,'second encounter still respects same-day cap');
});

test('a fourth AI reply ends the encounter naturally without requesting or showing another choice',async()=>{
  const storage=memoryStorage(),prompts=[];
  const generator=async prompt=>{
    prompts.push(prompt);
    return prompt.task.includes('返答候補だけ')?{choices:['森を歩こう','お話ししよう']}:
      {text:'また森で会えるのが楽しみだね。',choices:['またね','うん、またね']};
  };
  const director=createForestLiveDialogueDirector({base:base(),generate:generator,storage});
  let result=await director.start(identity);
  assert.equal(result.choices.length,2);
  for(let i=0;i<4;i++){
    result=await director.select({...identity,choiceId:result.choices[0].id});
    assert.equal(result.choices.length,i===3?0:2);
  }
  assert.equal(result.conversationComplete,true);
  assert.ok(prompts[4].constraints.some(text=>text.includes('最後のひと言')));
  assert.equal(prompts.length,5,'one opening generation and four replies');
  assert.equal(director.getProgress().aiRepliesThisSession,4);
  await director.select({...identity,choiceId:'old-choice'});
  assert.equal(prompts.length,5,'closed encounter cannot start another AI call');
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
  assert.equal(validateLiveForestOutput({text:'今日は森を歩くね。',choices:['どうして？','どうして？']},
    {characterId:'kiki',requireLine:true}),null);
  const original=await base().start();
  const director=createForestLiveDialogueDirector({base:base(),generate:async()=>({choices:['だめ']}),
    storage:memoryStorage()});
  assert.deepEqual(await director.start(identity),original);
});

test('a previously generated choice cannot be replayed after a new encounter',async()=>{
  const director=createForestLiveDialogueDirector({base:base(),storage:memoryStorage(),
    generate:async()=>({choices:['森を歩きたい','ちょっと休む']})});
  const prior=await director.start(identity);
  await director.start(identity);
  const result=await director.select({...identity,choiceId:prior.choices[0].id});
  assert.equal(result.text,'また遊ぼうね。','old choice is passed only to the local director');
});
