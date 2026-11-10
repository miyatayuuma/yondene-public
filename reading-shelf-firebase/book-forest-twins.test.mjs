import test from 'node:test';
import assert from 'node:assert/strict';
import {createTwinConversationDirector,validateTwinNamePairs,validateTwinScenes} from './book-forest-twins.mjs';
import {createForestDialogueDirector} from './book-forest-dialogue-director.mjs';

const names=[['pair-a','テストA','テストB'],['pair-b','テストC','テストD']].map(
  ([id,firstName,secondName])=>({schemaVersion:1,id,firstName,secondName,approval:'approved'}));
const line=(sceneId,sequence,speakerSlot,text,extra={})=>({schemaVersion:1,
  sceneId,sequence,speakerSlot,text,approval:'approved',...extra});
const sceneLines=[
  line('intro',1,0,'あ、だれか来た！'),
  line('intro',2,1,'わたしは{firstName}って呼んで。'),
  line('intro',3,2,'わたしは{secondName}！'),
  line('field',1,1,'あの葉っぱ、魚のしっぽみたい。'),
  line('field',2,2,'わたしには鳥の羽に見えるよ。'),
  line('field',3,1,'あ、きみはどう思う？',{choices:[
    {id:'fish',label:'魚のしっぽ',speakerSlot:2,text:'やっぱり魚かな！'},
    {id:'bird',label:'鳥の羽',speakerSlot:1,text:'鳥もありだね！'}]}),
  line('story',1,2,'ふしぎな木の実、見てみたいね。',{bookId:'book-1',memoryId:'memory-1'}),
  line('story',2,1,'どんな色をしているのかな。',{bookId:'book-1',memoryId:'memory-1'}),
  line('story',3,2,'よし、探してみよう！',{bookId:'book-1',memoryId:'memory-1'})
];
const memory={schemaVersion:1,id:'memory-1',bookId:'book-1',bookTitle:'作り物の本',
  text:'子どもたちは木の実について話した',tags:'木の実',characters:'twins',
  spoilerLevel:1,evidenceStatus:'approved',confidence:'high',sourceUrl:'https://example.org'};
function setup(books=[{id:'book-1',status:'read'}]){
  return createTwinConversationDirector({getNamePairs:()=>names,
    getScenes:()=>validateTwinScenes(sceneLines),getBooks:()=>books,getCatalog:()=>[memory]});
}

test('twins first appear as a group and each turn has its own name without quotation marks',async()=>{
  const engine=setup();
  const a=await engine.start({encounter:0});
  assert.equal(a.speakerName,'ふたご');assert.equal(a.speakerSlot,0);
  assert.equal(a.nextSpeakerName,'テストA');assert.equal(a.nextSpeakerSlot,1);
  const b=await engine.advance();assert.equal(b.speakerName,'テストA');
  assert.equal(b.nextSpeakerName,'テストB');assert.equal(b.nextSpeakerSlot,2);
  assert.match(b.text,/テストA/);
  const c=await engine.advance();assert.equal(c.speakerName,'テストB');
  assert.equal(c.nextSpeakerName,'テストA','next scene speaker is previewed at the scene boundary');
  assert.match(c.text,/テストB/);
  for(const result of [a,b,c])assert.doesNotMatch(result.text,/[「」]/u);
  engine.end();
  const second=await engine.start({encounter:1});
  assert.equal(second.speakerName,'ふたご');
  assert.match((await engine.advance()).text,/テストC/);
});

test('twins autonomously carry on, occasionally offering a player choice',async()=>{
  const engine=setup();await engine.start();
  await engine.advance();await engine.advance();
  const turns=[];
  for(let i=0;i<12;i++){
    const step=await engine.advance();turns.push(step);
    if(step.choices.length){
      assert.equal(step.autoNext,true,'silence does not block the talk');
      assert.equal(engine.select({choiceId:'invalid'}),null);
      const reaction=engine.select({choiceId:'bird'});
      assert.equal(reaction.speakerName,'テストA');
      assert.match(reaction.text,/鳥も/);
      assert.equal(engine.select({choiceId:'bird'}),null);
      break;
    }
  }
  assert.ok(turns.some(turn=>turn.choices.length));
  engine.end();assert.equal(await engine.advance(),null);
});

test('twin story conversations are restricted to currently read and approved memories',async()=>{
  const books=[{id:'book-1',status:'unread'}];const engine=setup(books);
  await engine.start();
  let unreadStory=false;
  for(let i=0;i<35;i++)unreadStory||=(await engine.advance()).text.includes('ふしぎな木の実');
  assert.equal(unreadStory,false);
  engine.end();books[0].status='read';await engine.start({encounter:1});
  let sawStory=false;
  for(let i=0;i<25;i++)sawStory||=(await engine.advance()).text.includes('ふしぎな木の実');
  assert.ok(sawStory);
  engine.end();
});

test('a revoked memory cannot finish an ongoing story scene',async()=>{
  const books=[{id:'book-1',status:'read'}],engine=setup(books);
  await engine.start();
  let startedStory=false;
  for(let i=0;i<15;i++){
    const step=await engine.advance();
    if(step.text.includes('ふしぎな木の実')){startedStory=true;break}
  }
  assert.ok(startedStory);books[0].status='unread';
  assert.doesNotMatch((await engine.advance()).text,/どんな色|探してみよう/);
});

test('invalid name pairs, incomplete scenes and unsafe quoted speech are rejected',()=>{
  assert.equal(validateTwinNamePairs([{...names[0],approval:'draft'}]).length,0);
  assert.equal(validateTwinScenes([line('bad',1,1,'「だめ」'),line('bad',2,2,'はい'),
    line('bad',3,1,'こっち')]).length,0);
  assert.equal(validateTwinScenes([line('partial',1,1,'おはよう'),line('partial',3,2,'やあ'),
    line('partial',4,1,'こんにちは')]).length,0);
});

test('existing conversation director delegates twins, preserving other NPCs',async()=>{
  const director=createForestDialogueDirector({getBooks:()=>[],getCatalog:()=>[],
    getTwinNames:()=>names,getTwinScenes:()=>validateTwinScenes(sceneLines),
    getCues:()=>[{schemaVersion:1,id:'king-hello',characterId:'king',kind:'meet',
      text:'こんにちは、王さまだぞ。',approval:'approved'}]});
  assert.equal((await director.start({characterId:'twins'})).speakerName,'ふたご');
  assert.equal((await director.advance({characterId:'twins'})).speakerName,'テストA');
  director.end();
  assert.match((await director.start({characterId:'king'})).text,/王さま/);
  assert.equal(await director.advance({characterId:'king'}),null);
});
