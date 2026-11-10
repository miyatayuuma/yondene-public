import test from 'node:test';
import assert from 'node:assert/strict';
import {forestConversationLog} from './book-forest-conversation-log.mjs';

test('diagnostic export is scoped to the owner and omits unapproved storage fields',()=>{
  const data=new Map([
    ['yondene-forest-ai-local-v2:owner:family:log',JSON.stringify([
      {at:20,event:'generated-reply',characterId:'kiki',text:'またね。',modelId:'gemma',
        promptVersion:'v5',elapsedMs:700,secret:'do-not-export',uid:'private-owner'}])],
    ['yondene-forest-ai-local-v2:other:family:log',JSON.stringify([
      {at:10,event:'generated-reply',text:'other private conversation'}])]
  ]);
  const log=forestConversationLog({storage:{getItem:key=>data.get(key)||null},uid:'owner',familyId:'family'});
  assert.equal(log.length,1);
  assert.equal(log[0].text,'またね。');
  assert.equal(log[0].elapsedMs,700);
  assert.doesNotMatch(JSON.stringify(log),/secret|do-not-export|private-owner|other private conversation/);
});
