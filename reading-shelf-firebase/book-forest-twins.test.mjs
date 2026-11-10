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
  assert.equal(c.nextSpeakerName,undefined,'one encounter must not roll into another scene');
  assert.equal(c.autoNext,false);assert.equal(c.conversationComplete,true);
  assert.equal(await engine.advance(),null,'one approved scene is one encounter');
  assert.match(c.text,/テストB/);
  for(const result of [a,b,c])assert.doesNotMatch(result.text,/[「」]/u);
  engine.end();
  const second=await engine.start({encounter:1});
  assert.equal(second.speakerName,'テストC','subsequent visits open a different scene, not the introduction');
  assert.equal((await engine.advance()).speakerName,'テストD');
});

test('twins autoplay one prepared scene, then offer optional participation and close',async()=>{
  const engine=setup();await engine.start({encounter:1});
  const second=await engine.advance();
  assert.equal(second.autoNext,true);
  const last=await engine.advance();
  assert.equal(last.choices.length,2);
  assert.equal(last.autoNext,false,'a scene boundary is a natural stop, not an infinite loop');
  assert.equal(last.conversationComplete,true);
  assert.equal(engine.select({choiceId:'invalid'}),null);
  const reaction=engine.select({choiceId:'bird'});
  assert.equal(reaction.speakerName,'テストC');
  assert.match(reaction.text,/鳥も/);
  assert.equal(reaction.autoNext,false);
  assert.equal(reaction.conversationComplete,true);
  assert.equal(engine.select({choiceId:'bird'}),null);
  engine.end();assert.equal(await engine.advance(),null);
});

test('twin story conversations are restricted to currently read and approved memories',async()=>{
  const books=[{id:'book-1',status:'unread'}];const engine=setup(books);
  const unread=await engine.start({encounter:2});
  assert.doesNotMatch(unread.text,/ふしぎな木の実/);
  await engine.advance();await engine.advance();
  assert.equal(await engine.advance(),null);
  engine.end();books[0].status='read';
  const story=await engine.start({encounter:2});
  assert.match(story.text,/ふしぎな木の実/);
  engine.end();
});

test('a revoked memory cannot finish an ongoing story scene',async()=>{
  const books=[{id:'book-1',status:'read'}],engine=setup(books);
  assert.match((await engine.start({encounter:2})).text,/ふしぎな木の実/);
  books[0].status='unread';
  assert.equal(await engine.advance(),null,'the revoked scene ends without leaking later lines');
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
