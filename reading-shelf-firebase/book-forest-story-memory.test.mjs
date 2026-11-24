import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStoryMemoryRows,unlockedStoryMemories} from './book-forest-story-memory.mjs';

const read={id:'test-book-1',status:'read',title:'ねこと王さま'};
const other={id:'test-book-2',status:'unread',title:'まだ読んでいない本'};
const fact=(id,bookId,text,tags='')=>({schemaVersion:1,id,bookId,text,tags,characters:'king,cat',spoilerLevel:1,
  evidenceStatus:'approved',confidence:'high',sourceUrl:'https://example.org/books/1'});
const catalog=[
  fact('a','test-book-1','ドラゴンのためにお城が燃えて、王さまとねこは町の小さな家に引っ越した。','ドラゴン,城,引っ越し'),
  fact('b','test-book-1','王さまはねこの手助けを受けながら買い物と皿洗いを少しずつ覚える。','買い物,皿洗い,家事'),
  fact('c','test-book-2','まだ読んでいない本の重大な結末。','結末')
];

test('only current, explicitly read book IDs unlock sourced and reviewed memories',()=>{
  const items=unlockedStoryMemories([read,other],catalog);
  assert.deepEqual(items.map(item=>item.id),['a','b']);
  assert.deepEqual(unlockedStoryMemories([{...read,status:'reading'},other],catalog),[]);
  assert.deepEqual(unlockedStoryMemories([{...read,id:'different-id'},other],catalog),[]);
  assert.deepEqual(unlockedStoryMemories([{...read,title:other.title},other],catalog).map(x=>x.id),['a','b'],
    'never infer access from title alone');
});

test('unsupported, unreviewed, malformed and high-spoiler rows cannot leak into context',()=>{
  const invalid=[{...catalog[0],id:'draft',evidenceStatus:'draft'},
    {...catalog[0],id:'unsupported',sourceUrl:''},
    {...catalog[0],id:'film',confidence:'film-only'},
    {...catalog[0],id:'spoiler',spoilerLevel:3},
    {...catalog[0],id:'too-long',text:'長'.repeat(401)},
    {...catalog[0],id:'version',schemaVersion:2}];
  assert.deepEqual(unlockedStoryMemories([read],[...invalid,catalog[0],catalog[0]]).map(x=>x.id),['a']);
});

test('private sheet rows parse by header and cannot bypass book authorization',()=>{
  const headers=['text','bookId','memoryId','bookTitle','schemaVersion','tags','characters',
    'spoilerLevel','evidenceStatus','confidence','sourceUrl'];
  const raw=[headers,['ドラゴンの話','test-book-2','private-row','本の名',1,'ドラゴン','king',1,
    'approved','high','https://example.org/source']];
  const parsed=parseStoryMemoryRows(raw);
  assert.equal(parsed.length,1);
  assert.equal(parsed[0].bookId,'test-book-2');
  assert.ok(!unlockedStoryMemories([read,other],parsed).some(memory=>memory.spoilerLevel>2));
  assert.equal(parseStoryMemoryRows([['text'],['only text']]).length,0);
});
