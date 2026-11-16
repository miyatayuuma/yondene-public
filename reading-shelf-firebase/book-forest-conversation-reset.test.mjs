import test from 'node:test';
import assert from 'node:assert/strict';
import {resetForestConversationHistoryOnce} from './book-forest-conversation-reset.mjs';

test('resets local first-visit state and generated logs once, preserving quota and private data',()=>{
  const local=new Map([
    ['yondene-forest-dialogue-state-v1:owner:family','{"visits":{"twins":8,"kiki":2}}'],
    ['yondene-forest-ai-local-v1:owner:family:log','legacy log'],
    ['yondene-forest-ai-local-v2:owner:family:log','Gemma log'],
    ['yondene-forest-ai-local-v2:owner:family:budget','{"day":"today","count":4}'],
    ['yondene-forest-dialogue-state-v1:other:family','other user'],
    ['yondene-private-dialogue-cache','approved script']
  ]);
  const storage={getItem:key=>local.get(key)??null,
    removeItem:key=>local.delete(key),setItem:(key,value)=>local.set(key,value)};
  assert.equal(resetForestConversationHistoryOnce({storage,uid:'owner',familyId:'family'}),true);
  assert.equal(local.has('yondene-forest-dialogue-state-v1:owner:family'),false);
  assert.equal(local.has('yondene-forest-ai-local-v1:owner:family:log'),false);
  assert.equal(local.has('yondene-forest-ai-local-v2:owner:family:log'),false);
  assert.equal(local.get('yondene-forest-ai-local-v2:owner:family:budget'),'{"day":"today","count":4}');
  assert.equal(local.get('yondene-forest-dialogue-state-v1:other:family'),'other user');
  assert.equal(local.get('yondene-private-dialogue-cache'),'approved script');

  local.set('yondene-forest-dialogue-state-v1:owner:family','{"visits":{"twins":1}}');
  assert.equal(resetForestConversationHistoryOnce({storage,uid:'owner',familyId:'family'}),false);
  assert.equal(local.get('yondene-forest-dialogue-state-v1:owner:family'),'{"visits":{"twins":1}}');
});
