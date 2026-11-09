import test from 'node:test';
import assert from 'node:assert/strict';
import {forestGrowth,characterReadingContext} from './book-forest-progress.mjs';

test('only finished books affect growth and NPC reading context',()=>{
  const books=[{id:'a',title:'読了',status:'read'},{id:'b',title:'未読の秘密',status:'unread'},
    {id:'c',title:'読みかけ',status:'reading'}];
  const ratings=new Map([['a',{stars:5}],['b',{stars:5}]]);
  const growth=forestGrowth({books,ratings,reflectedBookIds:new Set(['a','b'])});
  assert.deepEqual([growth.readCount,growth.ratedCount,growth.reflectedCount,growth.seeds],[1,1,1,4]);
  assert.deepEqual(characterReadingContext(books),[{id:'a',title:'読了'}]);
});

test('stages progress without a fixed initial baseline',()=>{
  const many=Array.from({length:31},(_,i)=>({id:String(i),status:'read'}));
  assert.equal(forestGrowth({books:many}).stage,3);
  assert.equal(forestGrowth({books:many,reflectedBookIds:new Set(many.map(b=>b.id))}).stage,4);
  assert.equal(forestGrowth().stage,0);
});
