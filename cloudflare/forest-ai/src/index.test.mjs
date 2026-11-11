import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createSign} from 'node:crypto';
import {verifyOwnerIdToken,handleRequest} from './index.mjs';

const projectId='kodomo-reading-shelf-87f11',ownerUid='sample-owner';
const origin='https://kodomo-reading-shelf-87f11.web.app';
const now=1800000000;
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const publicJwk={...publicKey.export({format:'jwk'}),kid:'test-key',alg:'RS256',use:'sig'};
const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
function token(claims={}){
  const unsigned=b64({alg:'RS256',kid:'test-key',typ:'JWT'})+'.'+b64({
    aud:projectId,iss:`https://securetoken.google.com/${projectId}`,
    sub:ownerUid,iat:now-300,exp:now+300,auth_time:now-500,...claims});
  return unsigned+'.'+createSign('RSA-SHA256').update(unsigned).sign(privateKey).toString('base64url');
}

test('Firebase JWT verification checks RS256 signature, issuer, expiry and allowed owner UID',async()=>{
  const config={projectId,ownerUid,nowSeconds:()=>now,keys:async()=>[publicJwk]};
  assert.equal(await verifyOwnerIdToken(token(),config),ownerUid);
  for(const bad of [token({sub:'another-user'}),token({exp:now-1}),
    token({aud:'another-project'}),token({iss:'https://evil.example'}),
    token().replace(/.$/u,'!')]){
    await assert.rejects(()=>verifyOwnerIdToken(bad,config),/Unauthenticated|Bad JWT/);
  }
});

const prompt={mode:'choices',closing:false,task:'返答候補を作る',
  npc:{id:'kiki',voice:'元気',approvedExamples:['荷物、気をつけてね。']},
  context:{npcLine:'いい天気だね。',
  chosenLabel:'',recentTurns:[]},constraints:['短い日本語にする']};
function request(path='/dialogue',{
  method='POST',headers={},body={prompt},from=origin}={}){
  return new Request('https://sample.workers.dev'+path,{method,
    headers:{Origin:from,'Content-Type':'application/json',Authorization:'Bearer sample-test-id-token',...headers},
    ...((method==='POST')?{body:JSON.stringify(body)}:{})});
}

test('Worker accepts only authenticated approved-origin requests and invokes Gemma 4',async()=>{
  let called=0,modelInput;
  const env={OWNER_UID:ownerUid,FIREBASE_PROJECT_ID:projectId,AI:{
    async run(model,payload){called++;modelInput={model,payload};return {choices:[{message:{content:
      JSON.stringify({choices:['どこへ行く？','一緒に歩こう']})}}]}}}};
  const response=await handleRequest(request(),env,{verifyToken:async()=>ownerUid});
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{choices:['どこへ行く？','一緒に歩こう']});
  assert.equal(called,1);
  assert.equal(modelInput.model,'@cf/google/gemma-4-26b-a4b-it');
  assert.equal(modelInput.payload.chat_template_kwargs.enable_thinking,false);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.ok(!modelInput.payload.messages.some(message=>message.content.includes('sample-test-id-token')));
  const rejected=await handleRequest(request('/dialogue',{from:'https://evil.example'}),env,
    {verifyToken:async()=>ownerUid});
  assert.equal(rejected.status,403);
  assert.equal(called,1);
  const unauthorized=await handleRequest(request(),env,{verifyToken:async()=>{throw Error('bad');}});
  assert.equal(unauthorized.status,401);
  assert.equal(called,1);
});

test('Worker fails closed without owner configuration and handles preflight and rate caps',async()=>{
  const env={FIREBASE_PROJECT_ID:projectId,AI:{run:async()=>({})}};
  assert.equal((await handleRequest(request(),env)).status,503);
  const options=await handleRequest(request('/dialogue',{method:'OPTIONS'}),env);
  assert.equal(options.status,204);
  assert.equal(options.headers.get('Access-Control-Allow-Headers'),'Authorization, Content-Type');
  const liveEnv={...env,OWNER_UID:ownerUid,AI:{run:async()=>{throw Error('quota exceeded')}}};
  const limited=await handleRequest(request(),liveEnv,{verifyToken:async()=>ownerUid});
  assert.equal(limited.status,429);
  assert.deepEqual(await limited.json(),{error:'AI quota reached'});
  const invalid=await handleRequest(request('/dialogue',{body:{prompt:{...prompt,npc:{id:'cat',voice:'ねこ'}}}}),
    liveEnv,{verifyToken:async()=>ownerUid});
  assert.equal(invalid.status,400);
});

test('Worker normalizes three offered choices and accepts a closing without buttons',async()=>{
  const outputs=[{choices:['風の音を聞く','橋を見に行く','もう少し話す']},
    {text:'じゃあ、またね。',choices:[]}];
  const env={OWNER_UID:ownerUid,FIREBASE_PROJECT_ID:projectId,AI:{
    run:async()=>({choices:[{message:{content:JSON.stringify(outputs.shift())}}]})}};
  const verifyToken=async()=>ownerUid;
  const first=await handleRequest(request(),env,{verifyToken});
  assert.deepEqual(await first.json(),{choices:['風の音を聞く','橋を見に行く']});
  const closing=await handleRequest(request('/dialogue',{body:{prompt:{...prompt,
    mode:'reply',closing:true}}}),env,{verifyToken});
  assert.equal(closing.status,200);
  assert.deepEqual(await closing.json(),{text:'じゃあ、またね。',choices:[]});
});
