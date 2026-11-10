import test from 'node:test';
import assert from 'node:assert/strict';
import {createForestDialogueDirector,validateForestDialogueCues} from './book-forest-dialogue-director.mjs';

const story=(id,bookId,text,characters='king')=>({schemaVersion:1,id,bookId,bookTitle:'架空の本',
  text,tags:'勇気',characters,spoilerLevel:1,evidenceStatus:'approved',confidence:'high',
  sourceUrl:'https://example.org/book'});
const cue=(id,characterId,kind,text,extras={})=>({schemaVersion:1,id,characterId,kind,
  text,approval:'approved',...extras});
const first=cue('hello-king','king','meet','お城の外もおもしろいものだ。');
const kingStory=cue('story-king','king','story','小さな舟か。余も一度作ってみたいぞ。',{
  memoryId:'memory-1'});
const catStory=cue('story-cat','cat','story','（ねこは小枝で小さな舟を描き、そっとこちらを見る。）',{
  memoryId:'memory-1'});
const kikiStory=cue('story-kiki','kiki','story','小さな舟を作るのって楽しそう。どこに浮かべる？',{
  memoryId:'memory-1',
  choices:[{id:'to-jiji',label:'ジジにも聞いてみる',text:'ジジなら、また別の見方をするかも。',relayTo:'jiji'}]
});
const jijiStory=cue('story-jiji','jiji','story','ぼくなら舟が沈まないか、先に見ておくな。',{
  memoryId:'memory-1'});
const jijiRelay=cue('relay-jiji','jiji','relay','さっきキキと話したんだね。{memory} ぼくにも話があるよ。',{fromCharacterId:'kiki'});
const jijiAmbient=cue('rest-jiji','jiji','ambient','静かなところを見つけたよ。');
const reflection=cue('review-king','king','reflection','感想を覚えているよ。{reflection}',{bookId:'book-1'});
const memories=[story('memory-1','book-1','友だちが小さな舟を作った。','king,cat'),
  story('memory-2','book-2','まだ読んでいない話の秘密。','king,cat')];
function storage(){
  const rows=new Map();return {rows,getItem:key=>rows.get(key)||null,setItem:(key,value)=>rows.set(key,value)};
}
function setup({books=[{id:'book-1',status:'read'},{id:'book-2',status:'unread'}],
  cues=[first,kingStory,catStory,kikiStory,jijiStory,jijiRelay,jijiAmbient,reflection],reviews=[],cache=storage()}={}){
  return {director:createForestDialogueDirector({getBooks:()=>books,getCatalog:()=>memories,
    getCues:()=>cues,getReflections:async()=>reviews,storage:cache,storageKey:'test-dialogue'}),cache};
}

test('first conversation is an introduction, next conversation uses only read books',async()=>{
  const {director}=setup();
  assert.match((await director.start({characterId:'king'})).text,/お城の外/);
  director.end();
  const second=await director.start({characterId:'king'});
  assert.match(second.text,/余も一度作ってみたい/);
  assert.doesNotMatch(second.text,/友だちが小さな舟を作った/);
  assert.doesNotMatch(second.text,/秘密|book-1|https:/);
  assert.equal(director.getProgress().seenMemories,1);
  director.end();
});

test('current read status revokes story knowledge without cached unlock',async()=>{
  const books=[{id:'book-1',status:'read'}],{director}=setup({books,cues:[kingStory]});
  assert.match((await director.start({characterId:'king'})).text,/余も一度/);
  director.end();books[0].status='unread';
  assert.doesNotMatch((await director.start({characterId:'king'})).text,/余も一度/);
});

test('every NPC can use the same approved read-book memory with different behavior',async()=>{
  const {director}=setup({cues:[kingStory,catStory]});
  const king=await director.start({characterId:'king'});director.end();
  const cat=await director.start({characterId:'cat'});director.end();
  assert.match(king.text,/余も一度/);
  assert.match(cat.text,/ねこは小枝で/);
  assert.doesNotMatch(cat.text,/友だちが小さな舟を作った/);
});

test('other NPC conversation creates a one-time relay with only vetted receiver lines',async()=>{
  const {director}=setup({cues:[kikiStory,jijiStory,jijiRelay,jijiAmbient]});
  const first=await director.start({characterId:'jiji'});
  assert.match(first.text,/舟が沈まないか/);director.end();
  const from=await director.start({characterId:'kiki'});
  assert.equal(from.choices[0].label,'ジジにも聞いてみる');
  const chosen=await director.select({characterId:'kiki',choiceId:'to-jiji'});
  assert.match(chosen.text,/別の見方/);
  assert.equal(director.getProgress().nextNpc,'jiji');director.end();
  const relay=await director.start({characterId:'jiji'});
  assert.match(relay.text,/さっきキキと話した/);
  assert.match(relay.text,/舟が沈まないか/,'the same incident uses the receiving NPC voice');
  assert.doesNotMatch(relay.text,/友だちが小さな舟を作った/);
  assert.equal(director.getProgress().nextNpc,null);
  director.end();
  assert.doesNotMatch((await director.start({characterId:'jiji'})).text,/さっきキキと話した/);
});

test('a newly read book gets priority ahead of older untold episodes',async()=>{
  const books=[{id:'book-1',status:'read'},{id:'book-2',status:'unread'}];
  const newStory=cue('new-king','king','story','その秘密、余にも聞かせてくれぬか。',{
    memoryId:'memory-2'});
  const {director}=setup({books,cues:[first,kingStory,newStory]});
  assert.match((await director.start({characterId:'king'})).text,/お城の外/);
  director.end();
  books[1].status='read';
  assert.match((await director.start({characterId:'king'})).text,/その秘密/);
});

test('a shared incident is not repeated by a relay after the source book becomes unread',async()=>{
  const books=[{id:'book-1',status:'read'}];
  const {director}=setup({books,cues:[kikiStory,jijiStory,jijiRelay,jijiAmbient]});
  await director.start({characterId:'kiki'});
  await director.select({characterId:'kiki',choiceId:'to-jiji'});
  director.end();books[0].status='unread';
  const followup=await director.start({characterId:'jiji'});
  assert.match(followup.text,/さっきキキと話した/);
  assert.doesNotMatch(followup.text,/舟が沈まないか/);
});

test('verbatim child comments are labeled, parent observations are not ascribed to the child',async()=>{
  const stored=storage();
  const {director}=setup({cache:stored,cues:[reflection],reviews:[
    {id:'reflection-1',quote:'ここが面白かった。',attribution:'verbatim'}]});
  const fromChild=await director.start({characterId:'king'});
  assert.match(fromChild.text,/きみのことば/);
  assert.match(fromChild.text,/ここが面白かった/);
  assert.doesNotMatch([...stored.rows.values()].join(''),/ここが面白かった/,'never cache raw reflections');
  director.end();
  const fromParent=setup({cache:storage(),cues:[reflection],reviews:[
    {id:'reflection-2',quote:'親から見て楽しかったようだ。',attribution:'parent-summary'}]});
  const output=await fromParent.director.start({characterId:'king'});
  assert.match(output.text,/おうちの人が残した記録/);
  assert.doesNotMatch(output.text,/きみのことば/);
});

test('invalid, unreviewed, wrong-character and wrong-state cues are discarded',async()=>{
  assert.deepEqual(validateForestDialogueCues([cue('bad','cat','story','話す',{approval:'draft'}),
    cue('bad','king','ambient','test',{approval:'approved'}),
    cue('bad','king','ambient','duplicate')]).map(c=>c.id),['bad']);
  const {director}=setup({cues:[cue('draft','king','ambient','でっち上げ',{approval:'draft'}),
    cue('unread','king','story','秘密にしたいぞ。',{memoryId:'memory-2'})]});
  assert.doesNotMatch((await director.start({characterId:'king'})).text,/でっち上げ|秘密/);
});

test('legacy generic synopsis templates are rejected instead of voiced by a character',async()=>{
  const old=cue('old-story','kiki','story','キキはそうしたんだね。{memory}');
  assert.deepEqual(validateForestDialogueCues([old]),[]);
  assert.deepEqual(validateForestDialogueCues([
    cue('bad-person','kiki','story','キキは満月に旅立った。',{memoryId:'memory-1'}),
    cue('speaking-cat','cat','story','こんにちは。',{memoryId:'memory-1'})]),[]);
  const {director}=setup({cues:[old,cue('greeting','kiki','ambient','今日は風が気持ちいいね。')]});
  assert.match((await director.start({characterId:'kiki'})).text,/風が気持ちいい/);
});

test('relays never reveal unreviewed memory text without a receiver-specific line',async()=>{
  const {director}=setup({cues:[kikiStory,jijiRelay,jijiAmbient]});
  await director.start({characterId:'kiki'});
  await director.select({characterId:'kiki',choiceId:'to-jiji'});
  director.end();
  const reply=await director.start({characterId:'jiji'});
  assert.match(reply.text,/静かなところ/);
  assert.doesNotMatch(reply.text,/友だちが小さな舟を作った/);
});

test('choices cannot be injected from a different NPC or previous conversation',async()=>{
  const {director}=setup({cues:[kikiStory,jijiAmbient]});
  const start=await director.start({characterId:'kiki'});
  assert.equal(start.choices.length,1);
  assert.equal(await director.select({characterId:'jiji',choiceId:'to-jiji'}),null);
  assert.equal(await director.select({characterId:'kiki',choiceId:'unknown'}),null);
  director.end();
  assert.equal(await director.select({characterId:'kiki',choiceId:'to-jiji'}),null);
});

test('a new story fact is preferred over an already discussed fact',async()=>{
  const additional=story('memory-3','book-1','友だちと木の実を分け合った。');
  const alternate=cue('story-king-3','king','story','木の実も分け合えば、立派なごちそうだぞ。',{
    memoryId:'memory-3'});
  const director=createForestDialogueDirector({getBooks:()=>[{id:'book-1',status:'read'}],
    getCatalog:()=>[memories[0],additional],getCues:()=>[kingStory,alternate]});
  const a=await director.start({characterId:'king'});
  director.end();
  const b=await director.start({characterId:'king'});
  assert.notEqual(a.text,b.text);
});

test('daily conversation alternates with story instead of repeating the same synopsis',async()=>{
  const daily=cue('daily-king','king','ambient','この森の風は、城の庭とは違うな。');
  const director=createForestDialogueDirector({getBooks:()=>[{id:'book-1',status:'read'}],
    getCatalog:()=>[memories[0]],getCues:()=>[kingStory,daily]});
  const one=await director.start({characterId:'king'});director.end();
  const two=await director.start({characterId:'king'});director.end();
  const three=await director.start({characterId:'king'});director.end();
  assert.match(one.text,/余も一度/);
  assert.match(two.text,/森の風/);
  assert.match(three.text,/余も一度/);
});
