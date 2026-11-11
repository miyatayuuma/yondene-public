import test from 'node:test';
import assert from 'node:assert/strict';
import {eligibleForestDailyTopics,createForestDailyContextSession} from './book-forest-daily-context.mjs';

function storage(){
  const values=new Map();
  return {getItem:key=>values.get(key)||null,
    setItem:(key,value)=>values.set(key,value),values};
}
const day=Date.UTC(2026,10,11,13);
const books=[{id:'book-k',status:'read',finishedAt:'2026-11-10'},
  {id:'book-z',status:'read',finishedAt:'2026-11-08'}];
const catalog=[
  {schemaVersion:1,id:'mem-k',bookId:'book-k',characters:'kiki,ジジ',
    text:'キキが店でパンを選んだ',tags:'パン、配達',spoilerLevel:1,
    evidenceStatus:'approved',confidence:'high',sourceUrl:'https://example.org/k'},
  {schemaVersion:1,id:'mem-z',bookId:'book-z',characters:'ゾロリ,イシシ',
    text:'ゾロリが紙の仕掛けを考えた',tags:'作戦',spoilerLevel:1,
    evidenceStatus:'approved',confidence:'high',sourceUrl:'https://example.org/z'},
  {schemaVersion:1,id:'mem-u',bookId:'book-no',characters:'キキ',
    text:'未読の物語',spoilerLevel:1,evidenceStatus:'approved',
    confidence:'high',sourceUrl:'https://example.org/u'}
];
const seeds=[
  {id:'seed-k',bookId:'book-k',memoryId:'mem-k',fact:'キキが店でパンを選んだ',
    tags:'配達',question:'大切なのは何？',contrast:'善悪',spoiler:1,
    sourceUrl:'https://example.org/k',status:'使用可',selectedCount:0,displayedCount:0},
  {id:'seed-z',bookId:'book-z',memoryId:'mem-z',fact:'ゾロリが紙の仕掛けを考えた',
    tags:'作戦',question:'本当の勇気とは？',contrast:'善悪',spoiler:1,
    sourceUrl:'https://example.org/z',status:'使用可',selectedCount:0,displayedCount:0}
];
const cues=[{schemaVersion:1,id:'z-story',characterId:'zorori',kind:'story',
  memoryId:'mem-z',approval:'approved',text:'おれさまの作戦だ！'}];
const input={books,catalog,seeds,cues};

test('topics draw only from approved, read episodes fitting that specific character',()=>{
  const kiki=eligibleForestDailyTopics({characterId:'kiki',...input,now:day});
  const zorori=eligibleForestDailyTopics({characterId:'zorori',...input,now:day});
  const ishishi=eligibleForestDailyTopics({characterId:'ishishi',...input,now:day});
  assert.deepEqual(kiki.map(item=>item.kind),['seed']);
  assert.ok(kiki[0].fact.includes('パン'));
  assert.deepEqual(zorori.map(item=>item.memoryId),['mem-z']);
  assert.deepEqual(ishishi.map(item=>item.memoryId),['mem-z']);
  assert.equal(eligibleForestDailyTopics({characterId:'skipper',...input}).length,0);
  assert.equal(eligibleForestDailyTopics({characterId:'cat',...input}).length,0);
  assert.ok(!JSON.stringify(kiki).includes('大切なのは何'),
    'the philosophical question must not be sent as a daily topic');
  assert.ok(!JSON.stringify(kiki).includes('善悪'));
});

test('no fixed 24-day subject: no eligible source means honest ordinary conversation',()=>{
  const session=createForestDailyContextSession({storage:storage(),now:()=>day});
  const scene=session.visit('skipper',input).scene;
  assert.equal(scene.kind,'ambient');
  assert.equal(scene.evidence,'imagined');
  assert.equal(scene.memoryId,undefined);
});

test('source-based themes stay stable within the day and never leak book IDs',()=>{
  const local=storage(),session=createForestDailyContextSession({storage:local,
    now:()=>day,storageKey:'daily-v2'});
  const a=session.visit('kiki',input);
  const b=session.visit('kiki',input);
  assert.equal(a.scene.id,b.scene.id);
  assert.equal(a.scene.evidence,'reviewed');
  assert.equal(b.visitsToday,2);
  const stored=local.getItem('daily-v2');
  assert.ok(!stored.includes('book-k'));
  assert.ok(!stored.includes('mem-k'));
  assert.ok(!stored.includes('childReflection'));
});

test('the next day can continue a selected sourced topic, but not indefinitely',()=>{
  const local=storage();let timestamp=day;
  const session=createForestDailyContextSession({storage:local,
    now:()=>timestamp});
  const initial=session.visit('kiki',input);
  assert.equal(initial.scene.evidence,'reviewed');
  session.selected('kiki','見にいこう');
  timestamp+=86400000;
  const follow=session.visit('kiki',input);
  assert.equal(follow.scene.kind,'continuation');
  assert.equal(follow.scene.previousChoice,'見にいこう');
  assert.equal(follow.scene.stage,2);
  session.selected('kiki','またね');
  timestamp+=86400000;
  const third=session.visit('kiki',input);
  assert.notEqual(third.scene.kind,'continuation',
    'a polite goodbye or later choice should end the branch');
});

test('unreading a book revokes an active daily source, including follow-ups',()=>{
  const local=storage();let timestamp=day;
  const session=createForestDailyContextSession({storage:local,
    now:()=>timestamp});
  session.visit('kiki',input);session.selected('kiki','行ってみる');
  timestamp+=86400000;
  const revoked=session.visit('kiki',{...input,books:[{...books[0],status:'unread'},books[1]]});
  assert.equal(revoked.scene.kind,'ambient');
  assert.equal(revoked.scene.memoryId,undefined);
});

test('related characters inherit only the game choice; unrelated conversations do not',()=>{
  const local=storage(),session=createForestDailyContextSession({storage:local,
    now:()=>day});
  session.visit('kiki',input);
  session.selected('kiki','ジジと話す');
  const jiji=session.visit('jiji',input);
  assert.equal(jiji.previousNpc,'kiki');
  assert.equal(jiji.relatedEncounter.npc,'kiki');
  assert.equal(jiji.relatedEncounter.selectedLabel,'ジジと話す');
  const zorori=session.visit('zorori',input);
  assert.equal(zorori.relatedEncounter,null);
  assert.equal(zorori.metNpcCount,3);
});

test('authored story opening always points at its own reviewed memory',()=>{
  const local=storage(),session=createForestDailyContextSession({storage:local,now:()=>day});
  const result=session.visit('zorori',{...input,sourceKind:'story',sourceMemoryId:'mem-z'});
  assert.equal(result.scene.memoryId,'mem-z');
  assert.equal(result.scene.evidence,'reviewed');
  const greeting=session.visit('kiki',{...input,sourceKind:'meet'});
  assert.equal(greeting.scene.kind,'ambient');
});
