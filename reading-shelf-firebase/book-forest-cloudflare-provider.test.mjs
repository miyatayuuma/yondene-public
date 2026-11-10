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

test('Cloudflare provider refuses invalid origin, missing auth and quota errors',async()=>{
  assert.throws(()=>createForestCloudflareGenerator({workerUrl:'http://example.com',getIdToken:async()=>''}),/invalid/);
  const withoutLogin=createForestCloudflareGenerator({workerUrl:'https://demo.workers.dev',getIdToken:async()=>''});
  await assert.rejects(()=>withoutLogin({}),/login/);
  const limited=createForestCloudflareGenerator({workerUrl:'https://demo.workers.dev',
    getIdToken:async()=>('signed.'+'token'.repeat(6)),fetchImpl:async()=>({ok:false,status:429})});
  await assert.rejects(()=>limited({}),/429/);
});
