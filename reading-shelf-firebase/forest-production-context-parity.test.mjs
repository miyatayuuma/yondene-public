import test from 'node:test';
import assert from 'node:assert/strict';
import {createForestLiveDialogueDirector} from './book-forest-live-dialogue.mjs';
import {parseForestCharacterProfiles,parseForestProfileSources,FOREST_PROFILE_HEADERS}
  from './book-forest-character-profiles.mjs';
import {selectRecentForestReflectionEntries,normalizeRecentForestReflection}
  from './book-forest-reflection-source.mjs';

const personRows=[FOREST_PROFILE_HEADERS,
  ...[['人物像','架空の有能な相棒'],['口調','無言で道具を使う'],['禁止・注意','人語を使わない'],
    ['価値観','大事なものを助ける'],['一人称','人語の一人称は使用しない']
  ].map(([key,value])=>['cat',key,value,'ゲーム演出','','架空','暫定採用','test-parity'])];
const profile=parseForestCharacterProfiles(personRows,parseForestProfileSources([
  ['資料ID','根拠の種別','確認状態']
]))[0];
function storage(){
  const data=new Map();
  return {getItem:key=>data.get(key)||null,setItem:(key,v)=>data.set(key,v)};
}
test('production director selects a fresh read-only reflection only in its eligible ambient slot',async()=>{
  const now=Date.parse('2026-11-17T07:00:00Z'),state=storage();
  const books=[{id:'read',title:'架空の本',status:'read'}, {id:'unread',title:'未読',status:'unread'}];
  const activity=[
    {kind:'reflection',bookId:'read',sourceId:'good',createdAt:now-3600000},
    {kind:'reflection',bookId:'unread',sourceId:'bad',createdAt:now-1800000},
    {kind:'reflection',bookId:'read',sourceId:'good',createdAt:now-7200000}
  ];
  const records=new Map([
    ['good',{attribution:'parent-summary',quote:'保護者の架空の要約',createdAt:now-3600000}],
    ['bad',{attribution:'verbatim',quote:'未読本の内容',createdAt:now-1800000}]
  ]);
  const recent=()=>selectRecentForestReflectionEntries(activity,books).map(entry=>
    normalizeRecentForestReflection(entry,records.get(entry.sourceId),{id:entry.sourceId})).filter(Boolean);
  assert.deepEqual(recent().map(x=>x.id),['good']);
  const prompts=[];
  const live=createForestLiveDialogueDirector({generate:async prompt=>{
    prompts.push(prompt);
    return {text:'（ねこは木の枝を持って小川へ向かった。）',delivery:'gesture',
      choices:['いっしょに行く','見ている']};
  },storage:state,storageKey:'live',now:()=>now,
  getCharacterProfiles:()=>[profile],getBooks:()=>books,getCatalog:()=>[],
  getRecentReflections:async()=>recent(),
  startDelayMs:0,sessionLimit:3});
  const identity={characterId:'cat'};
  const first=await live.start(identity);
  assert.ok(first?.text);
  assert.equal(prompts[0].context.sourceKind,'meet');
  assert.equal(prompts[0].context.readerReflection,undefined);
  live.onDisplayed(first,identity);live.end();
  const second=await live.start(identity);
  assert.ok(second?.text);
  assert.equal(prompts[1].context.sourceKind,'review-reaction');
  assert.equal(prompts[1].context.readerReflection.quote,'保護者の架空の要約');
  assert.equal(prompts[1].context.readerReflection.attribution,'parent-summary');
  assert.doesNotMatch(JSON.stringify(prompts[1]),/未読本の内容/);
  live.onDisplayed(second,identity);live.end();
  // Same reflection must not be replayed immediately after being shown.
  await live.start(identity);
  assert.equal(prompts.at(-1).context.readerReflection,undefined);
  live.end();
});
