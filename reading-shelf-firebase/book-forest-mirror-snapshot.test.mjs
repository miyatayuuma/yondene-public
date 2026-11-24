import test from 'node:test';
import assert from 'node:assert/strict';
import {selectRecentForestReflectionEntries,normalizeRecentForestReflection}
  from './book-forest-reflection-source.mjs';
import {parseForestBookshelfMirror} from './book-forest-mirror-snapshot.mjs';
const makeField=v=>typeof v==='string'?{stringValue:v}:
  typeof v==='boolean'?{booleanValue:v}:typeof v==='number'?{timestampValue:new Date(v).toISOString()}:{nullValue:null};
const doc=fields=>JSON.stringify({fields:Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,makeField(v)]))});
const stamp='2026-11-17T07:00:00.000Z',now=Date.parse('2026-11-17T07:30:00Z');
const rows=[
 ['文書パス','更新日時','分割番号','分割数','Firestore JSON'],
 ['families/fakeFamily',stamp,'1','1',doc({name:'synthetic'})],
 ['families/fakeFamily/books/read-book',stamp,'1','1',doc({
   title:'架空の読了本',status:'read',synopsis:'架空のあらすじ',synopsisSourceUrl:'https://example.org/test'})],
 ['families/fakeFamily/books/unread-book',stamp,'1','1',doc({title:'架空の未読本',status:'unread'})],
 ['families/fakeFamily/activity/entry-1',stamp,'1','1',doc({
   kind:'reflection',bookId:'read-book',sourceId:'review-1',createdAt:now-60000})],
 ['families/fakeFamily/activity/entry-duplicate',stamp,'1','1',doc({
   kind:'reflection',bookId:'read-book',sourceId:'review-1',createdAt:now-120000})],
 ['families/fakeFamily/activity/entry-withdrawn',stamp,'1','1',doc({
   kind:'reflection',bookId:'read-book',sourceId:'gone',createdAt:now-180000})],
 ['families/fakeFamily/activity/entry-unread',stamp,'1','1',doc({
   kind:'reflection',bookId:'unread-book',sourceId:'hidden-review',createdAt:now-240000})],
 ['families/fakeFamily/books/read-book/childReflections/review-1',stamp,'1','1',doc({
   attribution:'parent-summary',quote:'保護者による架空の要約',createdAt:now-61000})],
 ['families/fakeFamily/books/unread-book/childReflections/hidden-review',stamp,'1','1',doc({
   attribution:'verbatim',quote:'読んでいない本の発言',createdAt:now-240000})]
];
test('read-only mirror mimics production activity limits, dedupe, attribution and revocation',()=>{
  const snapshot=parseForestBookshelfMirror(rows,{syncAt:stamp,now});
  assert.equal(snapshot.bookCount,2);assert.equal(snapshot.readCount,1);
  assert.equal(snapshot.reflectionCount,1);
  assert.deepEqual(snapshot.reflections,[{id:'review-1',bookId:'read-book',
    quote:'保護者による架空の要約',attribution:'parent-summary',createdAt:now-61000}]);
  const first=selectRecentForestReflectionEntries([{kind:'reflection',bookId:'read-book',
    sourceId:'review-1'}, {kind:'reflection',bookId:'read-book',sourceId:'review-1'}],snapshot.books);
  assert.equal(first.length,1);
  assert.equal(normalizeRecentForestReflection(first[0],{hidden:true,
    quote:'never',attribution:'verbatim',createdAt:now},{id:'review-1'}),null);
});
test('stale/malformed/foreign/missing or withdrawn mirror records fail closed',()=>{
  assert.throws(()=>parseForestBookshelfMirror(rows,{syncAt:stamp,now:now+3*3600000}),/MIRROR_STALE/);
  assert.throws(()=>parseForestBookshelfMirror(rows,{syncAt:stamp,now,
    maxAgeMs:1}),/MIRROR_STALE/);
  assert.throws(()=>parseForestBookshelfMirror([...rows,[
    'families/anotherFamily/books/bad',stamp,'1','1',doc({title:'x'})]],
    {syncAt:stamp,now}),/MIRROR_MULTIFAMILY/);
  assert.throws(()=>parseForestBookshelfMirror([...rows,rows[1]],
    {syncAt:stamp,now}),/MIRROR_DUPLICATE/);
  const missing=[...rows].filter(r=>!r[0]?.includes('/childReflections/review-1'));
  assert.equal(parseForestBookshelfMirror(missing,{syncAt:stamp,now}).reflectionCount,0);
  const hidden=rows.map(r=>r[0]?.endsWith('/childReflections/review-1')?
    [r[0],stamp,'1','1',doc({attribution:'verbatim',hidden:true,quote:'private',createdAt:now})]:r);
  assert.equal(parseForestBookshelfMirror(hidden,{syncAt:stamp,now}).reflectionCount,0);
});
test('exactly the first 60 activity events and at most 12 unique reflections are considered',()=>{
  const books=[{id:'read-book',status:'read'}];
  const events=Array.from({length:62},(_,i)=>({kind:'reflection',bookId:'read-book',
    sourceId:'review-'+i}));
  assert.equal(selectRecentForestReflectionEntries(events,books).length,12);
  const over=Array.from({length:60},()=>({kind:'other'}));
  over.push({kind:'reflection',bookId:'read-book',sourceId:'too-old'});
  assert.deepEqual(selectRecentForestReflectionEntries(over,books),[]);
});
