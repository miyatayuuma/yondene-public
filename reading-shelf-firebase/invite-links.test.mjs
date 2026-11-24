import test from 'node:test';
import assert from 'node:assert/strict';
import {newInviteToken,parseInviteHash,oneTimeInviteUrl} from './invite-links.mjs';
test('token has 256 random bits encoded as 43 URL-safe characters',()=>{
  const token=newInviteToken(n=>new Uint8Array(Array.from({length:n},(_,i)=>i)));
  assert.match(token,/^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(token,newInviteToken(n=>new Uint8Array(n).fill(255)));
});
test('token is only in fragment, not URL query',()=>{
  const token=newInviteToken(n=>new Uint8Array(n).fill(3));
  const url=new URL(oneTimeInviteUrl('https://example.com/?family=old#old','familyOne',token));
  assert.equal(url.search,'');
  assert.deepEqual(parseInviteHash(url.hash),{familyId:'familyOne',token});
  assert.equal(parseInviteHash('#invite=familyOne.too-short'),null);
  assert.equal(parseInviteHash('#invite=../'+token),null);
});
test('invalid IDs and short entropy are rejected',()=>{
  assert.throws(()=>newInviteToken(()=>new Uint8Array(16)));
  assert.throws(()=>oneTimeInviteUrl('https://example.com','bad/',newInviteToken(n=>new Uint8Array(n))));
});
