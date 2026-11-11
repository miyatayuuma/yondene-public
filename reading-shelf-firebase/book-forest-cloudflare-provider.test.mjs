import test from 'node:test';
import assert from 'node:assert/strict';
import {createForestCloudflareGenerator} from './book-forest-cloudflare-provider.mjs';

test('Cloudflare provider sends a Firebase ID token, no API key, and returns choices',async()=>{
  let args;
  const generate=createForestCloudflareGenerator({workerUrl:'https://demo.workers.dev',
    getIdToken:async()=>('firebase.'+'token'.repeat(8)),
    fetchImpl:async(url,options)=>{args={url,options};return {
      ok:true,json:async()=>({choices:['あっちへ行く','ここで休む']})};}});
  assert.deepEqual((await generate({task:'会話'})).choices,['あっちへ行く','ここで休む']);
  assert.equal(args.url,'https://demo.workers.dev/dialogue');
  assert.equal(args.options.method,'POST');
  assert.equal(args.options.headers.Authorization,'Bearer firebase.'+'token'.repeat(8));
  assert.deepEqual(JSON.parse(args.options.body),{prompt:{task:'会話'}});
  assert.equal(args.options.cache,'no-store');
});

test('Cloudflare provider aborts before dispatch after token retrieval and forwards signals to fetch',async()=>{
  let resolveToken,fetchCalls=0;
  const controller=new AbortController();
  const stalled=createForestCloudflareGenerator({workerUrl:'https://demo.workers.dev',
    getIdToken:()=>new Promise(resolve=>{resolveToken=resolve}),
    fetchImpl:async()=>{fetchCalls++;throw Error('should not dispatch')}});
  const pending=stalled({task:'検証'},{signal:controller.signal});
  controller.abort();
  resolveToken('signed.'+'token'.repeat(8));
  await assert.rejects(()=>pending,/cancelled/);
  assert.equal(fetchCalls,0);
  let receivedSignal;
  const immediate=createForestCloudflareGenerator({workerUrl:'https://demo.workers.dev',
    getIdToken:async()=>('signed.'+'token'.repeat(8)),
    fetchImpl:async(_url,options)=>{receivedSignal=options.signal;
      return {ok:true,json:async()=>({choices:['橋を見たい','森へ行きたい']})}}});
  const fresh=new AbortController();
  await immediate({task:'検証'},{signal:fresh.signal});
  assert.equal(receivedSignal,fresh.signal);
});

test('Cloudflare provider refuses invalid origin, missing auth and quota errors',async()=>{
  assert.throws(()=>createForestCloudflareGenerator({workerUrl:'http://example.com',getIdToken:async()=>''}),/invalid/);
  const withoutLogin=createForestCloudflareGenerator({workerUrl:'https://demo.workers.dev',getIdToken:async()=>''});
  await assert.rejects(()=>withoutLogin({}),/login/);
  const limited=createForestCloudflareGenerator({workerUrl:'https://demo.workers.dev',
    getIdToken:async()=>('signed.'+'token'.repeat(6)),fetchImpl:async()=>({ok:false,status:429})});
  await assert.rejects(()=>limited({}),/429/);
  const quota=createForestCloudflareGenerator({workerUrl:'https://demo.workers.dev',
    getIdToken:async()=>('signed.'+'token'.repeat(6)),fetchImpl:async()=>({ok:false,status:429,
      json:async()=>({error:'AI quota reached'})})});
  await assert.rejects(()=>quota({}),/daily quota reached/);
});
