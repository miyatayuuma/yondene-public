import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseForestReflectionSpotlight,
  createForestReflectionSpotlightSession} from './book-forest-reflection-spotlight.mjs';

function storage(){
  const map=new Map();
  return {getItem:key=>map.get(key)||null,
    setItem:(key,value)=>map.set(key,value),map};
}
const now=Date.UTC(2026,10,15,3);
const books=[
  {id:'other-book',title:'よその物語',status:'read',
    synopsis:'別の主人公が森を旅するお話。',
    synopsisSourceUrl:'https://example.com/summary'},
  {id:'old-book',title:'前の本',status:'read'},
  {id:'unread-book',title:'未読の本',status:'unread'}];
const catalog=[{schemaVersion:1,id:'mem-1',bookId:'other-book',
  text:'主人公は道で大きな石を見つけた。',tags:'石',characters:'another',
  spoilerLevel:0,evidenceStatus:'approved',confidence:'high',
  sourceUrl:'https://example.com/story'}];
const reflections=[
  {id:'ref-new',bookId:'other-book',quote:'タイトルを変えたいな。',
    attribution:'verbatim',createdAt:now-60_000},
  {id:'ref-old',bookId:'old-book',quote:'別のほうがいいかも。',
    attribution:'parent-summary',createdAt:now-6*86400_000},
  {id:'ref-unread',bookId:'unread-book',quote:'未読のネタバレ',
    attribution:'verbatim',createdAt:now}
];

test('any speaking NPC can objectively react to a reflection from an unrelated read book',()=>{
  for(const characterId of ['king','kiki','skipper','zorori','hachibee','hakase','mochan']){
    const result=chooseForestReflectionSpotlight({characterId,books,reflections,catalog,now});
    assert.equal(result.bookTitle,'よその物語');
    assert.equal(result.quote,'タイトルを変えたいな。');
    assert.equal(result.summary,'別の主人公が森を旅するお話。');
    assert.match(result.storyContext,/石/);
    assert.equal(result.attribution,'verbatim');
    assert.equal(result.bookId,undefined);
    assert.equal(result.id,undefined);
  }
  assert.equal(chooseForestReflectionSpotlight({characterId:'cat',books,reflections,now}),null);
  assert.equal(chooseForestReflectionSpotlight({characterId:'twins',books,reflections,now}),null);
});

test('new comments take precedence; once displayed, another book can be discussed',()=>{
  const local=storage(),session=createForestReflectionSpotlightSession({storage:local,now:()=>now});
  const input={characterId:'zorori',books,reflections,catalog};
  const latest=session.choose(input);
  assert.equal(latest.quote,'タイトルを変えたいな。');
  session.displayed('zorori',latest);
  assert.equal(session.choose(input).quote,'別のほうがいいかも。');
  // Another NPC may react differently to the same new reflection.
  assert.equal(session.choose({...input,characterId:'skipper'}).quote,'タイトルを変えたいな。');
  const raw=local.getItem('forest-reflection-reactions-v1');
  for(const secret of ['ref-new','other-book','タイトル','別のほうが'])assert.equal(raw.includes(secret),false);
});

test('withdrawn and unread comments cannot be chosen from the current read snapshot',()=>{
  const input={characterId:'kiki',books,reflections:reflections.slice(2),catalog,now};
  assert.equal(chooseForestReflectionSpotlight(input),null);
  assert.equal(chooseForestReflectionSpotlight({...input,
    reflections:[{...reflections[0],attribution:'unknown'}]}),null);
  assert.equal(chooseForestReflectionSpotlight({...input,
    books:[{...books[0],status:'unread'},books[1],books[2]],
    reflections:[reflections[0]]}),null);
});

test('a parent summary is labelled as such and lacks assumed child feelings',()=>{
  const result=chooseForestReflectionSpotlight({characterId:'ishishi',books,
    reflections:[reflections[1]],catalog,now});
  assert.equal(result.attribution,'parent-summary');
  assert.equal(result.quote,'別のほうがいいかも。');
  assert.equal(result.storyContext,'');
});

test('unverified synopsis and lengthy quote are bounded; no unrelated fact is borrowed',()=>{
  const result=chooseForestReflectionSpotlight({characterId:'king',
    books:[{id:'b',title:'短い題',status:'read',synopsis:'S'.repeat(600)}],
    reflections:[{id:'r',bookId:'b',attribution:'verbatim',
      quote:'く'.repeat(400),createdAt:now}],catalog,now});
  assert.equal(result.quote.length,180);
  assert.equal(result.summary,'');
  assert.equal(result.storyContext,'');
});
