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

test('all generated NPCs, including non-speaking cat, CAN react as outsiders',()=>{
  for(const characterId of ['king','kiki','skipper','zorori','hachibee','hakase','mochan']){
    const result=chooseForestReflectionSpotlight({characterId,books,reflections,catalog,now});
    assert.equal(result.bookTitle,'よその物語');
    assert.equal(result.quote,'タイトルを変えたいな。');
    assert.equal(result.summary,'別の主人公が森を旅するお話。');
    assert.match(result.storyContext,/石/);
    assert.equal(result.attribution,'verbatim');
    assert.match(result.perspective,/第三者/);
    assert.equal(result.bookId,undefined);
    assert.equal(result.id,undefined);
  }
  const cat=chooseForestReflectionSpotlight({characterId:'cat',books,reflections,catalog,now});
  assert.equal(cat.quote,'タイトルを変えたいな。');
  assert.match(cat.perspective,/第三者/);
  assert.equal(cat.sourceBookId,'other-book');
  assert.equal(chooseForestReflectionSpotlight({characterId:'twins',books,reflections,now})?.attribution,'verbatim');
});

test('one displayed review is acknowledged forest-wide, other NPCs do not repeat it',()=>{
  const local=storage(),session=createForestReflectionSpotlightSession({storage:local,now:()=>now});
  const input={characterId:'zorori',books,reflections,catalog};
  const latest=session.choose(input);
  session.visited();
  session.displayed('zorori',latest);
  assert.equal(session.choose({...input,characterId:'skipper'}),null,
    'do not react back-to-back; no duplicate of first review');
  session.visited();session.visited();
  assert.equal(session.choose({...input,characterId:'skipper'}).quote,'別のほうがいいかも。',
    'this line replaced below');
});

test('different fresh books are staggered; the same book is not revisited that day',()=>{
  const local=storage(),session=createForestReflectionSpotlightSession({storage:local,now:()=>now});
  const a=session.choose({characterId:'zorori',books,reflections,catalog});
  session.visited();session.displayed('zorori',a);
  session.visited();session.visited();
  const next=session.choose({characterId:'kiki',books,reflections,catalog});
  assert.equal(next.quote,'別のほうがいいかも。');
  session.visited();session.displayed('kiki',next);
  assert.equal(session.choose({characterId:'hakase',books,reflections,catalog}),null);
  const raw=local.getItem('forest-reflection-reactions-v1');
  for(const secret of ['ref-new','ref-old','other-book','タイトル','別のほうが'])assert.equal(raw.includes(secret),false);
});

test('one NPC cannot monopolize multiple new reactions on the same day',()=>{
  const local=storage(),session=createForestReflectionSpotlightSession({storage:local,now:()=>now});
  const first=session.choose({characterId:'zorori',books,reflections,catalog});
  session.visited();session.displayed('zorori',first);
  session.visited();session.visited();
  assert.equal(session.choose({characterId:'zorori',books,reflections,catalog}),null);
});

test('v11 per-NPC seen history migrates to a single forest-wide acknowledged history',()=>{
  const local=storage(),session=createForestReflectionSpotlightSession({storage:local,now:()=>now});
  const current=session.choose({characterId:'king',books,reflections,catalog});
  local.setItem('forest-reflection-reactions-v1',JSON.stringify({
    version:1,seen:{king:[current.key]}}));
  const next=session.choose({characterId:'skipper',books,reflections,catalog});
  assert.equal(next.quote,'別のほうがいいかも。');
  session.visited();
  const state=JSON.parse(local.getItem('forest-reflection-reactions-v1'));
  assert.equal(state.version,2);
  assert.ok(state.acknowledged.includes(current.key));
});

test('approved character-specific book knowledge influences perspective, never creates fake relation',()=>{
  const relatedCatalog=[{...catalog[0],characters:'zorori'}];
  const zorori=chooseForestReflectionSpotlight({characterId:'zorori',books,
    catalog:relatedCatalog,reflections,now});
  assert.match(zorori.perspective,/関係のある人物/);
  const kiki=chooseForestReflectionSpotlight({characterId:'kiki',books,
    catalog:relatedCatalog,reflections,now});
  assert.match(kiki.perspective,/第三者/);
});

test('an old comment is not falsely announced as a newly written reflection',()=>{
  const input={characterId:'kiki',books,reflections:reflections.map(r=>({
    ...r,createdAt:now-30*86400_000})),catalog,now};
  assert.equal(chooseForestReflectionSpotlight(input),null);
});

test('unread or withdrawn comments cannot be chosen from the current read snapshot',()=>{
  const input={characterId:'kiki',books,reflections:reflections.slice(2),catalog,now};
  assert.equal(chooseForestReflectionSpotlight(input),null);
  assert.equal(chooseForestReflectionSpotlight({...input,
    reflections:[{...reflections[0],attribution:'unknown'}]}),null);
  assert.equal(chooseForestReflectionSpotlight({...input,
    books:[{...books[0],status:'unread'},books[1],books[2]],
    reflections:[reflections[0]]}),null);
});

test('parent summary attribution, long text and unverified synopsis are preserved safely',()=>{
  const result=chooseForestReflectionSpotlight({characterId:'ishishi',books,
    reflections:[reflections[1]],catalog,now});
  assert.equal(result.attribution,'parent-summary');
  assert.equal(result.storyContext,'');
  const long=chooseForestReflectionSpotlight({characterId:'king',
    books:[{id:'b',title:'短い題',status:'read',synopsis:'S'.repeat(600)}],
    reflections:[{id:'r',bookId:'b',attribution:'verbatim',
      quote:'く'.repeat(400),createdAt:now}],catalog,now});
  assert.equal(long.quote.length,180);
  assert.equal(long.summary,'');
  assert.equal(long.storyContext,'');
});

test('a new reflection may return as an older memory for another NPC after cooldown',()=>{
  let clock=now;
  const session=createForestReflectionSpotlightSession({storage:storage(),now:()=>clock});
  const related=[{...catalog[0],characters:'kiki jiji'}];
  const input={books,reflections:[reflections[0]],catalog:related,cues:[]};
  const recent=session.choose({...input,characterId:'kiki'});
  assert.ok(recent);
  session.visited();session.displayed('kiki',recent);
  clock+=16*86400000;
  const jiji={...input,characterId:'jiji'};
  assert.equal(session.choose(jiji),null);
  const archiveBooks=session.archiveBooks(jiji);
  const older=session.choose({...jiji,archiveBooks});
  assert.equal(older?.key,recent.key);
  assert.equal(older.kind,'reading-memory');
  session.visited();session.displayed('jiji',older);
  clock+=2*86400000;
  assert.equal(session.archiveBooks({...input,characterId:'kiki'}).length,0);
  clock+=6*86400000;
  assert.equal(session.choose({...input,characterId:'kiki',
    archiveBooks:session.archiveBooks({...input,characterId:'kiki'})})?.key,recent.key);
});
