import test from 'node:test';
import assert from 'node:assert/strict';
import {runForestConversationScenario,scenarioStorage} from '../scripts/forest-conversation-scenario.mjs';
import {profileFixture} from './forest-profile-fixture.mjs';
import {unsafeForestForaging} from './book-forest-output-safety.mjs';
import {readCompletion} from '../cloudflare/forest-ai/src/index.mjs';

const now=Date.parse('2026-11-17T07:00:00Z');
const ids=['king','cat','kiki','jiji','zorori','ishishi','noshishi','hachibee','hakase','mochan','skipper'];
const profiles=ids.map(id=>profileFixture({id,firstPerson:id==='cat'?'':'試験用',
  cadence:id==='cat'?'発声せず行動する':'短く話す'}));
const book={id:'fiction-read',title:'架空の試験本',status:'read'};
const memory={schemaVersion:1,id:'fiction-episode',bookId:book.id,
  text:'架空の相棒が町の橋でなくした道具を見つけた。',characters:'kiki jiji',tags:'道具',
  evidenceStatus:'approved',confidence:'high',spoilerLevel:1,sourceUrl:'https://example.org/fiction'};
const raw=({prompt})=>({response:JSON.stringify({
  text:prompt.npc.id==='cat'?'（ねこはとなりにすわった。）':
    prompt.closing?'続きはまた会ったときにね。':prompt.mode==='reply'?
      'あの曲がり角まで見に行こう。':'向こうの道が気になるな。',
  ...(prompt.npc.id==='cat'?{mark:null}:{}),
  choices:prompt.closing?[]:['いっしょに見る','ここで待つ']})});
const defaults={now:()=>now,getCharacterProfiles:()=>profiles,
  getBooks:()=>[book],getCatalog:()=>[memory],transport:async(input,args)=>raw(args)};

test('complete production path: first encounter, choice, reply, end and related NPC visit',async()=>{
  const run=await runForestConversationScenario({...defaults,
    visits:[{characterId:'kiki',choices:[0,0]},{characterId:'jiji',choices:[0]}]});
  assert.deepEqual(run.trace.map(t=>t.prompt.mode),['opening','reply','reply','opening','reply']);
  assert.equal(run.trace[0].prompt.context.situation.firstEncounter,true);
  assert.equal(run.frames[2].result.conversationComplete,true);
  assert.deepEqual(run.frames[2].result.choices,[]);
  assert.equal(run.trace[1].prompt.context.chosenLabel,'いっしょに見る');
  assert.equal(run.trace[3].prompt.context.today.previousNpc,'kiki');
  assert.equal(run.progress.visits.kiki,1);
  assert.ok(run.trace.every(t=>t.validation==='accepted'&&t.inputFingerprint.length===16));
});

test('story grounding survives both replies; old memories can return after intervening encounters',async()=>{
  const run=await runForestConversationScenario({...defaults,
    visits:Array.from({length:9},()=>({characterId:'kiki',choices:[0,0]}))});
  const story=run.trace.filter(t=>t.prompt.context.sourceKind==='story');
  assert.ok(story.length>=6,'one approved memory must not become permanently ineligible');
  assert.ok(story.every(t=>t.prompt.context.topic?.fact===memory.text));
  const ambient=run.trace.filter(t=>t.prompt.context.sourceKind==='ambient');
  assert.ok(ambient.length>0);
  assert.ok(ambient.every(t=>!t.prompt.context.topic&&!t.prompt.context.today.scene.focus.includes(memory.text)),
    'ambient slots deliberately do not run another independent story selector');
});

test('unseen encounters do not consume first-meet or memory history',async()=>{
  const run=await runForestConversationScenario({...defaults,
    visits:[{characterId:'kiki',display:false},{characterId:'kiki'}]});
  assert.deepEqual(run.trace.map(t=>t.prompt.context.sourceKind),['meet','meet']);
  assert.equal(run.progress.visits.kiki,1);
  assert.equal(run.trace[1].prompt.context.today.visitsToday,1);
});

test('multiple NPC visits share reflection acknowledgement without a review echo chamber',async()=>{
  const reflection={id:'synthetic-review',bookId:book.id,quote:'道具を見つけるところが好き',
    attribution:'parent-summary',createdAt:now};
  const run=await runForestConversationScenario({...defaults,getCatalog:()=>[],
    getRecentReflections:async()=>[reflection],visits:[...ids,...ids].map(characterId=>({characterId,choices:[0]}))});
  const reviews=run.trace.filter(t=>t.prompt.context.readerReflection);
  assert.equal(reviews.length,2,'one opening and its own continuation only');
  assert.equal(reviews[0].prompt.context.readerReflection.attribution,'parent-summary');
  assert.match(reviews[1].prompt.task,/直前の会話/);
  assert.doesNotMatch(reviews[1].prompt.task,/第一声|返答候補2つを作る/);
  assert.ok(run.trace.filter(t=>t.prompt.npc.id==='cat').every(t=>t.validated.text.startsWith('（')));
  assert.doesNotMatch(run.storage['scenario:live:log'],/道具を見つけるところが好き/);
});

test('withdrawn reflections and unread status revoke continuation before another model call',async()=>{
  for(const revoke of ['reflection','book']){
    let books=[book],reflections=[{id:'synthetic-review',bookId:book.id,quote:'架空の感想',
      attribution:'verbatim',createdAt:now}];
    const run=await runForestConversationScenario({...defaults,getCatalog:()=>[],
      getBooks:()=>books,getRecentReflections:async()=>reflections,
      visits:[{characterId:'king'},{characterId:'king',choices:[0]}],
      onStep:({visit,turn})=>{if(visit===1&&turn===0){
        if(revoke==='reflection')reflections=[];else books=[{...book,status:'unread'}];
      }}});
    assert.equal(run.trace.length,2);
    assert.equal(run.frames.at(-1).result.conversationComplete,true);
  }
});

test('transport, quota, invalid JSON and unsafe output remain operable and bounded',async()=>{
  for(const failure of ['network','quota','json','unsafe']){
    let calls=0;
    const run=await runForestConversationScenario({...defaults,
      visits:[{characterId:'kiki',choices:[0,0]}],transport:async(input,args)=>{
        if(calls++===0)return raw(args);
        if(failure==='network')throw Error('Failed to fetch');
        if(failure==='quota')throw Error('AI quota reached');
        return {response:failure==='json'?'not json':JSON.stringify({
          text:'知らない木の実を拾ったよ。',choices:['拾って食べてみる？','見ている']})};
      }});
    assert.equal(run.frames.at(-1).result.conversationComplete,true);
    assert.deepEqual(run.frames.at(-1).result.choices,[]);
    assert.ok(run.trace.length<=3);
    assert.doesNotMatch(JSON.stringify(run.frames),/食べてみる/);
  }
});

test('an offered goodbye closes immediately; model timeout and daily budget also end safely',async()=>{
  const goodbye=await runForestConversationScenario({...defaults,
    visits:[{characterId:'king',choices:['またね']}],transport:async(input,{prompt})=>({response:JSON.stringify({
      text:'また会えるといいね。',choices:prompt.closing?[]:['話そう','またね']})})});
  assert.equal(goodbye.trace[1].prompt.closing,true);
  assert.equal(goodbye.frames.at(-1).result.conversationComplete,true);
  const timeout=await runForestConversationScenario({...defaults,requestTimeoutMs:5,
    visits:[{characterId:'king',choices:[0]}],transport:async()=>new Promise(()=>{})});
  assert.match(timeout.storage['scenario:live:log'],/timeout/);
  const capped=await runForestConversationScenario({...defaults,dailyLimit:1,
    visits:[{characterId:'king',choices:[0,0]}]});
  assert.equal(capped.trace.length,1);
  assert.equal(capped.frames.at(-1).result.conversationComplete,true);
});

test('foraging guard distinguishes unidentified plants, refusals and ordinary known food',()=>{
  const context={situation:{scene:'知らない木の実を見つけた。'}};
  for(const line of ['拾って食べてみる？','食べてみてもいい？','食べてみていいよ','おいしい木の実だよ']){
    assert.equal(unsafeForestForaging({text:'見つけたよ。',choices:[line,'見ている']},context),true,line);
    assert.throws(()=>readCompletion({response:JSON.stringify({text:'見つけたよ。',choices:[line,'見ている']})},
      {characterId:'king',mode:'opening',context}),/unsafe-foraging/);
  }
  for(const line of ['食べないで観察しよう','食べていいかわからない','持ってきたパンを食べよう'])
    assert.equal(unsafeForestForaging({text:line,choices:['見ている','先へ進む']},context),false,line);
  assert.equal(unsafeForestForaging({text:'焼いたパンがおいしいよ。',choices:['食べよう','とっておく']}),false);
});


test('unidentified forest fruit is guarded even when the model omits the word unknown',()=>{
  const context={situation:{place:'本の森',presentNpcIds:['mochan']}};
  const opening={text:'そこの木、なんだかおいしそうな実がなっているね。',
    choices:['本当だ、おいしそう！','食べられるのかな？']};
  assert.equal(unsafeForestForaging(opening,context),true);
  assert.equal(unsafeForestForaging({text:'これ、食べていいのかな？',choices:['食べてみようよ！','ゆっくり見よう。']},
    {...context,recentTurns:[{npc:opening.text}]}),true);
  assert.equal(unsafeForestForaging({text:'森で持ってきたパンを食べよう。',choices:['いっしょに食べる','とっておく']},context),false);
});


test('a model-format success rejected by the real browser validator is not a pipeline PASS',async()=>{
  const run=await runForestConversationScenario({...defaults,visits:[{characterId:'kiki'}],
    transport:async()=>({response:JSON.stringify({text:'キキはここにいるよ。',choices:['見ている','手をふる']})})});
  assert.equal(run.trace[0].workerValidation,'accepted');
  assert.equal(run.trace[0].validation,'rejected');
  assert.doesNotMatch(run.frames[0].result.text,/キキは/);
});
