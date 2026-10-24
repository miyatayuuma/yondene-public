import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeNickname,visibleFamilyName} from './nickname.mjs';
test('nicknames are explicit 2–20 characters, trimmed and allow duplicates',()=>{
 assert.equal(normalizeNickname(' りんご '),'りんご');
 assert.equal(normalizeNickname('Family Reader'),'Family Reader');
 assert.throws(()=>normalizeNickname(' '));
 assert.throws(()=>normalizeNickname('あ'));
 assert.throws(()=>normalizeNickname('a'.repeat(21)));
 assert.throws(()=>normalizeNickname('line\nbreak'));
});
test('public nickname resolves by immutable uid without reading member email',()=>{
 const rows=[{uid:'a',nickname:'さくら'},{uid:'b',nickname:'さくら'}];
 assert.equal(visibleFamilyName('b',rows),'さくら');
 assert.equal(visibleFamilyName('unknown',rows),'家族');
});
