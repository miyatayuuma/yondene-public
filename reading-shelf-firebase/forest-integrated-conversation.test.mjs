import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLiveForestOutput} from './book-forest-live-dialogue.mjs';
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
  ...(prompt.npc.id==='cat'?{delivery:'gesture'}:{}),
  choices:prompt.closing?[]:prompt.context.repliesLeft===1?
    [{label:'いっしょに見る',outcome:'木の下に 白い花がさいているよ。'},
      {label:'ここで待つ',outcome:'風の音がよくきこえるね。'}]:['いっしょに見る','ここで待つ']})});
const defaults={now:()=>now,getCharacterProfiles:()=>profiles,
  getBooks:()=>[book],getCatalog:()=>[memory],transport:async(input,args)=>raw(args)};

test('complete production path: first encounter, choice, reply, end and related NPC visit',async()=>{
  const run=await runForestConversationScenario({...defaults,
    visits:[{characterId:'kiki',choices:[0,0]},{characterId:'jiji',choices:[0]}]});
  assert.deepEqual(run.trace.map(t=>t.prompt.mode),['opening','reply','opening','reply']);
  assert.equal(run.trace[0].prompt.context.situation.firstEncounter,true);
  assert.equal(run.frames[2].result.conversationComplete,true);
  assert.deepEqual(run.frames[2].result.choices,[]);
  assert.equal(run.trace[1].prompt.context.chosenLabel,'いっしょに見る');
  assert.equal(run.trace[2].prompt.context.today.previousNpc,'kiki');
  assert.equal(run.progress.visits.kiki,1);
  assert.ok(run.trace.every(t=>t.validation==='accepted'&&t.inputFingerprint.length===16));
});

test('unusable final pairs do not offer a promise or discard an otherwise valid reply',()=>{
  const context={repliesLeft:1,situation:{place:'本の森'}};
  const options={characterId:'kiki',mode:'reply',context,requireLine:true};
  const main='木のそばなら声がよく聞こえるね。';
  const bad=[{label:'かくれんぼしよう',outcome:'わたしたち、かく準備をするね！'},'あとで行く'];
  const good={label:'かくれるならどこ？',outcome:'想像なら、あの大きな木のうらにかくれるよ。'};
  for(const [choices,expected] of [[bad,[]],[[...bad,good],[good]]]){
    const parsed=readCompletion({response:JSON.stringify({text:main,choices})},options);
    assert.deepEqual(parsed.choices,expected);
    assert.deepEqual(validateLiveForestOutput({text:main,choices},options).endings,expected);
  }
  const observed=[{label:'かくれんぼしよう！',outcome:'いいよ！わたしたちが、かくるね！'},
    {label:'お話ししよう！',outcome:'うん！すきなこと、おしえて！'}];
  assert.deepEqual(readCompletion({response:JSON.stringify({text:main,choices:observed})},options).choices,[]);
  const travel={label:'どこへいくの？',outcome:'あの大きな木の下までいこう！'};
  assert.deepEqual(readCompletion({response:JSON.stringify({text:main,choices:[travel,good]})},options).choices,[good]);
  const questionOnly={text:'なにか、おもしろい遊び、あるかな？',choices:observed};
  assert.throws(()=>readCompletion({response:JSON.stringify(questionOnly)},options),/unfinished ending/);
  assert.equal(validateLiveForestOutput(questionOnly,options),null);
  const unsafe={label:'木の実を食べてみよう',outcome:'森の木の実はおいしいよ。'};
  assert.deepEqual(readCompletion({response:JSON.stringify({text:main,choices:[unsafe,good]})},options).choices,[good]);
});

test('story grounding survives both replies; old memories can return after intervening encounters',async()=>{
  const run=await runForestConversationScenario({...defaults,
    visits:Array.from({length:9},()=>({characterId:'kiki',choices:[0,0]}))});
  const story=run.trace.filter(t=>t.prompt.context.sourceKind==='story');
  assert.ok(story.length>=4,'one approved memory must not become permanently ineligible');
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
  for(const line of ['食べないで観察しよう','食べていいかわからない','むやみに食べるのは危ないよ','持ってきたパンを食べよう'])
    assert.equal(unsafeForestForaging({text:line,choices:['見ている','先へ進む']},context),false,line);
  assert.equal(unsafeForestForaging({text:'焼いたパンがおいしいよ。',choices:['食べよう','とっておく']}),false);
  const writing={text:'おいしいものをさがそう。',delivery:'written'};
  const forest={situation:{place:'本の森'}};
  assert.equal(unsafeForestForaging(writing,forest),false);
  assert.equal(unsafeForestForaging({text:'あの ときのことを おもいだしたよ。',
    choices:['おいしい ものを たべよう','おしごとを さがそう']},forest),false);
  assert.equal(unsafeForestForaging({text:'しらない きのこが あったよ。',
    choices:['すこし たべよう','見るだけ']},forest),true);
  assert.equal(unsafeForestForaging({text:'（葉っぱに字を書いた。）',choices:['おいしいものをさがそう？']},forest),false);
  assert.equal(unsafeForestForaging({
    text:'このはっぱはたべられるよ。',delivery:'written',choices:['たべてみる','見るだけ']
  },forest),true);
  assert.equal(unsafeForestForaging({...writing,choices:['知らない木の実をたべよう','見る']},forest),true);

  // A discarded leaf-writing direction cannot turn reassurance about a story
  // into a claim that the leaf is safe to eat.
  const reassure={text:'（はっぱに文字をかく）\nおしろがなくなっても、だいじょうぶだよ。',
    delivery:'written',choices:['どうして？','よかった']};
  const options={characterId:'cat',mode:'opening',context:forest,requireLine:true};
  const completion=payload=>readCompletion({response:JSON.stringify(payload)},options);
  assert.equal(completion(reassure).text,'おしろがなくなっても、だいじょうぶだよ。');
  assert.equal(validateLiveForestOutput(reassure,options).delivery,'written');
  const unsafe={...reassure,text:'（はっぱに文字をかく）\nこのはっぱはたべられるよ。'};
  assert.throws(()=>completion(unsafe),/unsafe-foraging/);
  assert.equal(validateLiveForestOutput(unsafe,options),null);

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

const twinNames=[{id:'sample-pair',schemaVersion:1,approval:'approved',firstName:'あお',secondName:'そら'}];
const twinDefaults={...defaults,getTwinNames:()=>twinNames,
  getCharacterProfiles:()=>[...profiles,profileFixture({id:'twins'})]};
const twinRaw=(closing=false,repliesLeft=2)=>({response:JSON.stringify({
  turns:[{speakerSlot:1,text:'あっ、小川だ。'},{speakerSlot:2,text:'水の音がするね。'}],
  choices:closing?[]:repliesLeft===1?
    [{label:'耳をすます',outcome:'葉っぱがさらさら鳴っているね。',speakerSlot:1},
      {label:'橋はどんな色？',outcome:'水の上に茶色い橋が見えるよ。',speakerSlot:2}]:['耳をすます','橋を見たい']})});

test('twins use the shared generator through opening, choices, closing and a persisted revisit',async()=>{
  const transport=async(_input,args)=>args.prompt.npc.id==='twins'?twinRaw(args.prompt.closing,args.prompt.context.repliesLeft):raw(args);
  const first=await runForestConversationScenario({...twinDefaults,transport,
    visits:[{characterId:'twins',choices:[0,1]},{characterId:'skipper',choices:[0]}]});
  assert.deepEqual(first.frames.slice(0,5).map(f=>f.result?.speakerName),['あお','そら','あお','そら','そら']);
  assert.equal(first.frames[0].result.choices.length,0);
  assert.equal(first.frames[1].result.choices.length,2);
  assert.equal(first.frames[4].result.conversationComplete,true);
  assert.equal(first.trace[1].prompt.context.chosenLabel,'耳をすます');
  assert.equal(first.trace[1].prompt.context.recentTurns[0].turns[1].speakerSlot,2);
  assert.equal(first.trace[2].prompt.context.today.previousNpc,'twins');
  assert.equal(first.progress.visits.twins,1);
  const second=await runForestConversationScenario({...twinDefaults,transport,
    storage:scenarioStorage(first.storage),
    getTwinNames:()=>[{...twinNames[0],id:'other-pair',firstName:'なつ'},...twinNames],
    visits:[{characterId:'twins'}]});
  assert.equal(second.trace[0].prompt.context.situation.firstEncounter,false);
  assert.equal(second.frames[0].result.speakerName,'あお');
  assert.equal(second.frames[1].result.speakerName,'そら');
  assert.equal(second.progress.visits.twins,2);
});

test('twins reject dangerous lines across speakers and stop cleanly after reply failure',async()=>{
  const context={situation:{place:'本の森'}};
  const bad={turns:[{speakerSlot:1,text:'赤い実がなってるよ。'},
    {speakerSlot:2,text:'食べてみよう！'}],choices:['見てみる','調べる']};
  assert.throws(()=>readCompletion({response:JSON.stringify(bad)},
    {characterId:'twins',mode:'opening',context}),/unsafe-foraging/);
  const run=await runForestConversationScenario({...twinDefaults,
    visits:[{characterId:'twins',choices:[0,0]},{characterId:'skipper'}],
    transport:async(_input,args)=>{
      if(args.prompt.npc.id!=='twins')return raw(args);
      if(args.prompt.mode==='reply')throw Error('Model HTTP 503');
      return twinRaw();
    }});
  assert.equal(run.trace[1].failure,'model-http-503');
  assert.equal(run.frames[2].result.conversationComplete,true);
  assert.equal(run.frames[2].result.choices.length,0);
  assert.equal(run.trace[2].prompt.context.today.previousNpc,'twins');
});

test('twins keep the first meeting available after no generated greeting was displayed',async()=>{
  const run=await runForestConversationScenario({...twinDefaults,
    visits:[{characterId:'twins'},{characterId:'twins',display:false},{characterId:'twins'}],
    transport:async(_input,{index})=>{
      if(index===0)throw Error('Model network error');
      return twinRaw();
    }});
  assert.deepEqual(run.trace.map(t=>t.prompt.context.sourceKind),['meet','meet','meet']);
  assert.equal(run.frames[0].result.conversationComplete,true);
  assert.equal(run.progress.visits.twins,1);
});

test('registered names, written cat replies and the remaining reply count survive both validators',async()=>{
  const run=await runForestConversationScenario({...defaults,
    visits:[{characterId:'hachibee',choices:[0,0]},{characterId:'cat',choices:[0,0]}],
    transport:async(_, {prompt})=>{
      const {closing,npc,mode}=prompt;
      if(npc.id==='cat')return {response:JSON.stringify({
        text:mode==='opening'?'（そっと紙を出して書いた。）\nキキと ジジが見つけた木だよ。 どこに小さなとりがいるか、下からそっと見てみよう。':closing?'（ねこはとなりにすわった。）':'あの白い花の上だよ。とりもこちらを見ているね。',
        delivery:closing?'gesture':'written',
        choices:mode==='opening'?['いっしょに見る','ここですわる']:[{label:'しずかに見ている',outcome:'（ねこはとなりにすわった。）',delivery:'gesture'}]})};
      return {response:JSON.stringify({
        text:closing?'ほら、切り株のかげに丸い石があったぞ。':mode==='opening'
          ?'切り株のかげに、何かあるぞ。':'葉っぱをどけると、丸いものが見えるぞ。',
        choices:closing?[]:mode==='opening'?['ハチビーはどう思う？','一緒に見てみよう']:
          [{label:'丸いものって何？',outcome:'切り株のかげにあった丸い石だよ。'},
            {label:'一緒に見てみよう',outcome:'ほら、石の表に白い線があるぞ。'}]})};
    }});
  assert.deepEqual(run.trace.map(t=>t.prompt.context.repliesLeft),[2,1,2,1]);
  assert.equal(run.trace[0].prompt.npc.displayName,'ハチベエ');
  assert.equal(run.trace[2].prompt.context.npcDisplayNames.hachibee,'ハチベエ');
  assert.equal(run.frames[0].result.choices[0].label,'ハチベエはどう思う？');
  assert.equal(run.trace[1].prompt.context.chosenLabel,'ハチベエはどう思う？');
  assert.equal(run.frames[2].result.text,'切り株のかげにあった丸い石だよ。');
  assert.deepEqual(Object.keys(run.frames[1].result.choices[0]).sort(),['id','label']);
  assert.equal(run.frames[2].result.conversationComplete,true);
  assert.equal(run.frames[3].result.delivery,'written');
  assert.match(run.frames[3].result.text,/^キキと ジジ/u);
  assert.deepEqual(run.trace[3].prompt.context.recentTurns[0],{
    npc:run.frames[3].result.text,delivery:'written'});
  assert.equal(run.frames[4].result.delivery,'written');
  assert.equal(run.frames[5].result.delivery,'gesture');
  assert.equal(run.frames[5].result.conversationComplete,true);
  assert.ok(run.trace.every(step=>step.validation==='accepted'));
  assert.throws(()=>readCompletion({response:JSON.stringify({text:'（ねこは葉に文字を書いて見せた。）',
    delivery:'gesture',choices:['見る','待つ']})},{characterId:'cat'}),/Invalid silent cat action/);
  const names=readCompletion({response:JSON.stringify({text:'ハチビーは見たかな。',
    choices:['ハチビーヌはどう思う？','ハチビーはどう思う？']})},{characterId:'jiji'});
  assert.deepEqual(names.choices,['ハチビーヌはどう思う？','ハチベエはどう思う？']);
  assert.equal(names.text,'ハチベエは見たかな。');
});

test('related old reflections span multiple books and NPCs, and never continue after withdrawal',async()=>{
  const old={id:'older',bookId:book.id,quote:'架空の合成感想',attribution:'parent-summary',
    createdAt:now-40*86400000};
  const otherBook={id:'other-read',title:'別の架空本',status:'read'};
  const other={...old,id:'other-older',bookId:otherBook.id,createdAt:old.createdAt-1};
  let records=[old,other];
  const scopes=[];
  const run=await runForestConversationScenario({...defaults,
    getBooks:()=>[book,otherBook],getCatalog:()=>[memory,{...memory,id:'story-two',bookId:otherBook.id}],
    getArchivedReflections:async(ids,before)=>{
      scopes.push(ids);
      return records.filter(r=>ids.includes(r.bookId)&&r.createdAt<before);
    },
    getCurrentReflection:async(bookId,id)=>records.find(r=>r.bookId===bookId&&r.id===id)||null,
    visits:[
      {characterId:'kiki'},{characterId:'kiki'},{characterId:'jiji'},
      {characterId:'king'},{characterId:'jiji',choices:[0]}],
    onStep:({visit,turn})=>{
      if(visit===4&&turn===0)records=[];
    }
  });
  const reviewPrompts=run.trace.filter(t=>t.prompt.context.readerReflection);
  assert.ok(reviewPrompts.length>=2);
  assert.ok(reviewPrompts.every(t=>t.prompt.context.readerReflection.kind==='reading-memory'));
  assert.ok(reviewPrompts.every(t=>t.prompt.context.readerReflection.attribution==='parent-summary'));
  assert.ok(reviewPrompts.every(t=>!JSON.stringify(t.prompt).includes('sourceReflectionId')));
  assert.ok(scopes.every(ids=>ids.length<=2));
  const openings=reviewPrompts.filter(t=>t.prompt.mode==='opening');
  assert.ok(openings.some(t=>t.prompt.npc.id==='jiji'));
  assert.ok(new Set(openings.map(t=>t.prompt.context.readerReflection.bookTitle)).size>1);
  assert.equal(run.trace.at(-1).prompt.mode,'opening','withdrawal prevents another model call');
  assert.equal(run.frames.at(-1).result.conversationComplete,true);
  assert.doesNotMatch(JSON.stringify(run.storage),/架空の合成感想/);
});

test('endings that defer the answer are omitted in both validators',()=>{
  const options={characterId:'king',mode:'reply',requireLine:true,context:{repliesLeft:1}};
  const answer={label:'どうやって見つける？',outcome:'葉っぱの下を見れば、赤いところがすぐ見えるよ。'};
  const choices=[
    {label:'どんな遊び？',outcome:'まずは、何を使うかきめなきゃね。'},
    {label:'見つかったの？',outcome:'「葉の下には、何があるんだろう？」'},
    answer
  ];
  const output={text:'赤いところが目印なんだ。',choices};
  assert.deepEqual(readCompletion({response:JSON.stringify(output)},options).choices,[answer]);
  assert.deepEqual(validateLiveForestOutput(output,options).endings,[answer]);
  choices[1]={label:'友だちは？',outcome:'わたしが呼んでくるよ。'};
  assert.deepEqual(readCompletion({response:JSON.stringify(output)},options).choices,[answer]);
  assert.deepEqual(validateLiveForestOutput(output,options).endings,[answer]);
});

test('context checks distinguish quoted review phrases, actual titles and supported handoffs',()=>{
  const options={characterId:'king',mode:'opening',requireLine:true,context:{
    readerReflection:{bookTitle:'架空の本',quote:'「ルビー色の猫」っていう場所がよかった。'},
    npcDisplayNames:{jiji:'ジジ'}
  }};
  const parse=output=>readCompletion({response:JSON.stringify(output)},options);
  const output={text:'「ルビー色のねこ」という本は、おもしろそうだね。',choices:['どこが好き？','どう思う？']};
  assert.throws(()=>parse(output),/dialogue context/);
  assert.equal(validateLiveForestOutput(output,options),null);
  output.text='もし赤い橋が主役なら、「ルビー色のねこ」という題名もいいね。';
  assert.equal(parse(output).text,output.text);
  output.text='「架空の本」の赤い橋か。夕日に染まったらきれいだろうな。';
  output.choices[0]='ジジに言ってね';
  assert.deepEqual(parse(output).choices,['どう思う？']);
  assert.deepEqual(validateLiveForestOutput(output,options).labels,['どう思う？']);
  output.text='どうだったか聞かせて。気が向いたら言ってね。';
  assert.equal(parse(output).text,output.text);
  output.text='ジジに伝えておくよ。';
  assert.throws(()=>parse(output),/dialogue context/);
  assert.equal(validateLiveForestOutput(output,options),null);
  options.context.handoffTo='jiji';
  output.text='夕日がきれいだったって、ジジに伝えてね。';
  assert.equal(parse(output).text,output.text);
  assert.equal(validateLiveForestOutput(output,options).text,output.text);
});

test('foraging warnings survive while a following unsafe suggestion is rejected',()=>{
  const options={characterId:'king',mode:'opening',requireLine:true,context:{
    scene:{focus:'名前のわからない赤い実が落ちている。'}
  }};
  const output={text:'赤い実は、まだ食べないほうがいいかもしれないね。',
    choices:['どうして？','見るだけにする']};
  const parse=()=>readCompletion({response:JSON.stringify(output)},options);
  assert.equal(parse().text,output.text);
  assert.equal(validateLiveForestOutput(output,options).text,output.text);
  output.text='名前のわからない赤い実は食べないほうがいいけど、ひと口だけ味見してみよう。';
  assert.throws(parse,/unsafe-foraging/);
  assert.equal(validateLiveForestOutput(output,options),null);
});
