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


test('diagnostic export preserves failure-fallback causality and protocol, never exception text',()=>{
  const source=[
    {at:100,event:'generation-failed',characterId:'cat',mode:'opening',
      reason:'model-json',protocolRevision:'forest-dialogue-v2',promptVersion:'forest-v18',
      rawError:'API token=secret',responseBody:'PRIVATE'},
    {at:101,event:'script-fallback',characterId:'cat',reason:'generation-unavailable',
      protocolRevision:'forest-dialogue-v2'},
    {at:102,event:'generation-failed',characterId:'cat',reason:'secret-private-user-comment',
      protocolRevision:'secret with whitespace'},
    {at:103,event:'generation-failed',characterId:'cat',reason:'worker-http-502'}
  ];
  const store={getItem:key=>key==='yondene-forest-ai-local-v2:owner:family:log'?JSON.stringify(source):null};
  const exported=forestConversationLog({storage:store,uid:'owner',familyId:'family'});
  assert.deepEqual(exported.map(item=>item.event),
    ['generation-failed','script-fallback','generation-failed','generation-failed']);
  assert.deepEqual(exported.map(item=>item.reason),
    ['model-json','generation-unavailable',undefined,'worker-http-502']);
  assert.equal(exported[0].protocolRevision,'forest-dialogue-v2');
  assert.equal(exported[2].protocolRevision,undefined);
  assert.doesNotMatch(JSON.stringify(exported),/secret|PRIVATE|API token|responseBody|rawError/u);
});

test('persona receipts export only fixed-shape revisions and short safe version IDs',()=>{
  const rows=[{event:'generated-opening',profileRevision:'profile2-0123456789abcdef',profileVersion:'v0.5-schema2',profileSchemaVersion:2},
    {event:'generated-opening',profileRevision:'private free text',profileVersion:'private words in metadata'}];
  const log=forestConversationLog({uid:'u',familyId:'f',storage:{getItem:()=>JSON.stringify(rows)}});
  assert.equal(log[0].profileRevision,rows[0].profileRevision);
  assert.equal(log[0].profileVersion,'v0.5-schema2');assert.equal(log[0].profileSchemaVersion,2);
  assert.equal(log[1].profileRevision,undefined);assert.equal(log[1].profileVersion,undefined);
});
