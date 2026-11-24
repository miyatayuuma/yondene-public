import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendationCoverUrls,recommendationPeopleCount,recommendationShelfRequest,lookupRecommendationCover}
  from './recommendation-card-data.mjs';

const rec=(more={})=>({title:'架空の森の冒険',author:'架空 太郎',...more});

test('covers use confirmed source links, a single work-matched shelf cover, then ISBN publisher fallback',()=>{
  const a=rec({isbn:'9784834000139',coverUrl:'https://example.org/rec.jpg'});
  const shelf=[{title:'架空の森の冒険',author:'架空 太郎',coverUrl:'https://example.org/shelf.jpg'}];
  assert.deepEqual(recommendationCoverUrls([a],shelf),[
    'https://example.org/rec.jpg','https://example.org/shelf.jpg',
    'https://img.hanmoto.com/bd/img/9784834000139.jpg'
  ]);
  assert.deepEqual(recommendationCoverUrls([rec({url:'https://www.hanmoto.com/bd/isbn/9784834000139'})]),[
    'https://img.hanmoto.com/bd/img/9784834000139.jpg'
  ]);
});

test('same title different author never borrows a shelf cover and unsafe URL is discarded',()=>{
  assert.deepEqual(recommendationCoverUrls([rec({coverUrl:'javascript:alert(1)'})],[
    {title:'架空の森の冒険',author:'別の著者',coverUrl:'https://example.org/wrong.jpg'}
  ]),[]);
  assert.deepEqual(recommendationCoverUrls([rec()],[
    {title:'架空の森の冒険',author:'架空 太郎',coverUrl:'https://example.org/a.jpg'},
    {title:'架空の森の冒険',author:'架空 太郎',coverUrl:'https://example.org/b.jpg'}
  ]),[],'multiple editions are not arbitrarily picked');
});

test('number of people is distinct from raw recommendation count',()=>{
  const entries=[
    rec({recommenderType:'ai',recommenderId:'roku'}),
    rec({recommenderType:'ai',recommenderId:'gemini'}),
    rec({recommenderType:'ai',recommenderId:'roku'})
  ];
  assert.equal(recommendationPeopleCount(entries),2);
});

test('owner handoff requests normal queue path, leaves registration to ChatGPT and preserves unread status',()=>{
  const text=recommendationShelfRequest([rec({publisher:'架空出版社',isbn:'9784834000139'})]);
  assert.match(text,/きになる/);
  assert.match(text,/ChatGPT→Sheets更新キュー→GAS/);
  assert.match(text,/重複/);
  assert.match(text,/コピーだけでは本棚には登録されていない/);
  assert.doesNotMatch(text,/読了した/);
});

test('public image fallback requires exact work identity, never uses an unrelated image',async()=>{
  const payload={items:[
    {volumeInfo:{title:'架空の森の冒険',authors:['別人'],imageLinks:{thumbnail:'https://books.google.com/wrong.jpg'}}},
    {volumeInfo:{title:'架空の森の冒険',authors:['架空 太郎'],imageLinks:{thumbnail:'http://books.google.com/books/content?id=abc'}}}
  ]};
  let calls=0;
  const cover=await lookupRecommendationCover([rec()],async url=>{
    calls++;assert.match(url,/www.googleapis.com\/books\/v1\/volumes/);
    return {ok:true,json:async()=>payload};
  });
  assert.equal(calls,1);
  assert.equal(cover,'https://books.google.com/books/content?id=abc');
  const miss=await lookupRecommendationCover([rec({title:'全く違うお話'})],async()=>({
    ok:true,json:async()=>payload
  }));
  assert.equal(miss,'');
});
