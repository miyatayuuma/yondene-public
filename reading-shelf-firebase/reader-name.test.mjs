import test from 'node:test';
import assert from 'node:assert/strict';
import {readerNameFromShelf,reflectionTitleFromShelf} from './reader-name.mjs';
test('reflection headings follow the bookshelf identity, not a hard-coded name',()=>{
  assert.equal(readerNameFromShelf('みどりのほんだな'),'みどり');
  assert.equal(reflectionTitleFromShelf('みどりのほんだな'),'みどりの感想');
  assert.equal(reflectionTitleFromShelf('ゆうの本棚'),'ゆうの感想');
  assert.equal(reflectionTitleFromShelf(' みどりのほんだな '),'みどりの感想');
  assert.equal(reflectionTitleFromShelf('うちの読書記録'),'子どもの感想');
  assert.equal(reflectionTitleFromShelf(''),'子どもの感想');
});
