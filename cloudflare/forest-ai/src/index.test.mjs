import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createSign} from 'node:crypto';
import {verifyOwnerIdToken,handleRequest} from './index.mjs';
import {FOREST_AI_GENERATION_IDS,FOREST_ROSTER_REVISION,FOREST_DIALOGUE_PROTOCOL} from '../../../reading-shelf-firebase/forest-character-registry.mjs';

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

const profileMeta={profileSchemaVersion:2,profileRevision:'profile2-0123456789abcdef',profileVersion:'test-v2'};
const prompt={mode:'choices',closing:false,task:'返答候補を作る',
  npc:{...profileMeta,id:'kiki',voice:'元気',approvedExamples:['荷物、気をつけてね。']},
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
  assert.deepEqual((({profileRevision,...rest})=>rest)(await response.json()),{choices:['どこへ行く？','一緒に歩こう']});
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
  assert.deepEqual((({profileRevision,...rest})=>rest)(await limited.json()),{error:'AI quota reached'});
  const invalid=await handleRequest(request('/dialogue',{body:{prompt:{...prompt,npc:{...profileMeta,id:'unregistered',voice:'ねこ'}}}}),
    liveEnv,{verifyToken:async()=>ownerUid});
  assert.equal(invalid.status,400);
  const temporarilyBusy=await handleRequest(request(),{...liveEnv,
    AI:{run:async()=>{throw Object.assign(Error('Capacity temporarily exceeded'),{status:429})}}},
    {verifyToken:async()=>ownerUid});
  assert.equal(temporarilyBusy.status,429);
  assert.deepEqual((({profileRevision,...rest})=>rest)(await temporarilyBusy.json()),{error:'AI temporarily busy'});
});

test('Worker normalizes three offered choices and accepts a closing without buttons',async()=>{
  const outputs=[{choices:['風の音を聞く','橋を見に行く','もう少し話す']},
    {text:'じゃあ、またね。',choices:[]}];
  const env={OWNER_UID:ownerUid,FIREBASE_PROJECT_ID:projectId,AI:{
    run:async()=>({choices:[{message:{content:JSON.stringify(outputs.shift())}}]})}};
  const verifyToken=async()=>ownerUid;
  const first=await handleRequest(request(),env,{verifyToken});
  assert.deepEqual((({profileRevision,...rest})=>rest)(await first.json()),{choices:['風の音を聞く','橋を見に行く']});
  const closing=await handleRequest(request('/dialogue',{body:{prompt:{...prompt,
    mode:'reply',closing:true}}}),env,{verifyToken});
  assert.equal(closing.status,200);
  assert.deepEqual((({profileRevision,...rest})=>rest)(await closing.json()),{text:'じゃあ、またね。',choices:[]});
});

test('Worker accepts a scene-specific opening with two choices, using the same owner authentication',async()=>{
  let systemText='';
  const env={OWNER_UID:ownerUid,FIREBASE_PROJECT_ID:projectId,AI:{
    run:async(_,body)=>{
      systemText=body.messages[0].content;
      return {choices:[{message:{content:JSON.stringify({text:'あの木のそば、風が気持ちいいね。',
        choices:['見に行く','少し休む']})}}]};
    }}};
  const response=await handleRequest(request('/dialogue',{body:{prompt:{...prompt,
    mode:'opening',context:{...prompt.context,today:{scene:{id:'tree',focus:'風を聞く',tone:'静か'}}}}}}),
    env,{verifyToken:async()=>ownerUid});
  assert.equal(response.status,200);
  assert.deepEqual((({profileRevision,...rest})=>rest)(await response.json()),{text:'あの木のそば、風が気持ちいいね。',
    choices:['見に行く','少し休む']});
  assert.match(systemText,/今日のscene/);
});


test('Worker accepts an outsider reaction with bounded reader context and new NPCs',async()=>{
  let forwarded,system;
  const env={OWNER_UID:ownerUid,FIREBASE_PROJECT_ID:projectId,AI:{
    run:async(_,body)=>{
      forwarded=JSON.parse(body.messages[1].content);
      system=body.messages[0].content;
      return {choices:[{message:{content:JSON.stringify({
        text:'へえ、そんな題名にするのか。ちょっと面白いな。',
        choices:['そうだね','もっと考える']})}}]};
    }}};
  const response=await handleRequest(request('/dialogue',{body:{prompt:{
    mode:'opening',closing:false,task:'感想に第三者として反応する',
    npc:{...profileMeta,id:'hachibee',voice:'せっかちな行動派',approvedExamples:[]},
    context:{npcLine:'本の感想を聞いた。',recentTurns:[],readerReflection:{
      bookTitle:'よその本',quote:'題名を変えたい',attribution:'verbatim',
      perspective:'別作品なので他人の話として聞く'}},
    constraints:['感想を要求しない','原作の出来事を捏造しない']
  }}}),env,{verifyToken:async()=>ownerUid});
  assert.equal(response.status,200);
  assert.equal(forwarded.context.readerReflection.bookTitle,'よその本');
  assert.match(system,/第三者の立場/);
  assert.deepEqual((({profileRevision,...rest})=>rest)(await response.json()),{
    text:'へえ、そんな題名にするのか。ちょっと面白いな。',
    choices:['そうだね','もっと考える']});
});


test('Health reports all supported generators, including non-speaking cat',async()=>{
  const response=await handleRequest(request('/health',{method:'GET'}),{
    OWNER_UID:ownerUid,AI:{run:async()=>({})}});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('X-Forest-AI-Version'),'forest-dialogue-v28-profile2');
  assert.deepEqual((({profileRevision,...rest})=>rest)(await response.json()),{
    model:'@cf/google/gemma-4-26b-a4b-it',version:'forest-dialogue-v28-profile2',
    registryRevision:FOREST_ROSTER_REVISION,protocolRevision:FOREST_DIALOGUE_PROTOCOL,
    supportedNpcCount:FOREST_AI_GENERATION_IDS.length,configured:true});
});

test('an opening lacking a generated NPC first line is an API failure, never a silent scripted success',async()=>{
  const env={OWNER_UID:ownerUid,FIREBASE_PROJECT_ID:projectId,AI:{
    run:async()=>({choices:[{message:{content:JSON.stringify({
      choices:['森を探す','ここで休む']})}}]})}};
  const response=await handleRequest(request('/dialogue',{body:{prompt:{...prompt,
    mode:'opening',context:{...prompt.context,sourceKind:'meet'}}}}),env,
    {verifyToken:async()=>ownerUid});
  assert.equal(response.status,502);
  assert.equal((await response.json()).error,'AI unavailable');
});

test('all three Zukkoke NPC IDs are accepted as opening speakers by Worker',async()=>{
  let calls=0;
  const env={OWNER_UID:ownerUid,FIREBASE_PROJECT_ID:projectId,AI:{
    run:async()=>{calls++;return {choices:[{message:{content:JSON.stringify({
      text:'おっ、あそこに何かあるぞ！',
      choices:['見に行こう','あとでね']})}}]}}}};
  for(const npcId of ['hachibee','hakase','mochan']){
    const response=await handleRequest(request('/dialogue',{body:{prompt:{...prompt,
      mode:'opening',npc:{...profileMeta,id:npcId,voice:'テスト用の固有の口調'},
      context:{...prompt.context,sourceKind:'meet'}}}}),env,
      {verifyToken:async()=>ownerUid});
    assert.equal(response.status,200,npcId+' must not fail with HTTP 400');
  }
  assert.equal(calls,3);
});

test('Worker sends written dialogue and silent gestures through one dialogue contract',async()=>{
  const messages=[],opening={text:'キキと ジジは木の下だよ。雨がふるまえに、あそこですこし休もう。',
    delivery:'written',choices:[{label:'ここで雨を見る',outcome:'雨の音が きこえてきたね。',delivery:'written'}]};
  const closing={text:'（ねこはうなずいた。）',delivery:'gesture',choices:[]};
  const output=[opening,closing];
  const env={OWNER_UID:ownerUid,FIREBASE_PROJECT_ID:projectId,AI:{
    async run(_model,request){messages.push(request.messages);return {response:JSON.stringify(output.shift())}}
  }};
  const catPrompt={...prompt,mode:'opening',npc:{...profileMeta,id:'cat',voice:'非公開Sheetsの合成設定A'},
    context:{...prompt.context,sourceKind:'meet',repliesLeft:1}};
  for(const expected of [opening,closing]){
    const ending=expected===closing;
    const res=await handleRequest(request('/dialogue',{body:{prompt:{...catPrompt,
      mode:ending?'reply':'opening',closing:ending}}}),env,{verifyToken:async()=>ownerUid});
    assert.equal(res.status,200);
    const {profileRevision,...rest}=await res.json();
    assert.deepEqual(rest,expected);
  }
  assert.match(messages[0][0].content,/最後の候補は\{label,outcome\}/);
  assert.match(messages[0][0].content,/声や心の声を使わず/);
  assert.match(messages[0][1].content,/非公開Sheetsの合成設定A/);
  assert.doesNotMatch(messages[0][0].content,/王さまの親友|家事・買い物/);
});

test('Worker rejects nonverbal speech and writing outside grade-one glyphs',async()=>{
  const invalid=[
    {text:'ねこ「こんにちは！」',delivery:'gesture',choices:['みる','あそぶ']},
    {text:'前の道に行こう',delivery:'written',choices:['みる','あそぶ']},
    {text:'（ねこは声を出して話しかけた。）',delivery:'gesture',choices:['みる','あそぶ']}
  ];
  const env={OWNER_UID:ownerUid,FIREBASE_PROJECT_ID:projectId,AI:{
    run:async()=>({choices:[{message:{content:JSON.stringify(invalid.shift())}}]})}};
  const gesture={...prompt,mode:'opening',npc:{...profileMeta,id:'cat',voice:'ねこは無言',approvedExamples:[]}};
  for(let i=0;i<3;i++){
    const res=await handleRequest(request('/dialogue',{body:{prompt:gesture}}),env,
      {verifyToken:async()=>ownerUid});
    assert.equal(res.status,502);
  }
});


test('Worker returns only safe model JSON/validation categories without raw exceptions',async()=>{
  const failures=[
    {payload:'this is not JSON',code:'model-json'},
    {payload:JSON.stringify({text:'返事だけで選択肢がない'}),code:'output-validation'}
  ];
  for(const {payload,code} of failures){
    const env={OWNER_UID:ownerUid,FIREBASE_PROJECT_ID:projectId,
      AI:{run:async()=>({response:payload})}};
    const response=await handleRequest(request('/dialogue',{body:{prompt:{...prompt,mode:'opening'}}}),
      env,{verifyToken:async()=>ownerUid});
    assert.equal(response.status,502);
    assert.deepEqual(await response.json(),{error:'AI unavailable',code});
    assert.equal(response.headers.get('Cache-Control'),'no-store');
  }
});

test('twins use the same authenticated Worker contract and reject duplicate speaker slots',async()=>{
  const speakers=[{slot:1,name:'あお'},{slot:2,name:'そら'}];
  const twinPrompt={...prompt,mode:'opening',npc:{...profileMeta,id:'twins',voice:'架空の双子'},
    context:{...prompt.context,speakers,sourceKind:'meet'}};
  const turns=[{speakerSlot:1,text:'わたしはあお。'},{speakerSlot:2,text:'わたしはそら。'}];
  let duplicate=false;
  const env={OWNER_UID:ownerUid,FIREBASE_PROJECT_ID:projectId,AI:{run:async()=>({
    response:JSON.stringify({turns:duplicate?[turns[0],{...turns[1],speakerSlot:1}]:turns,
      choices:['こんにちは','森を見る']})})}};
  const send=p=>handleRequest(request('/dialogue',{body:{prompt:p}}),env,{verifyToken:async()=>ownerUid});
  const accepted=await send(twinPrompt);
  assert.equal(accepted.status,200);
  assert.deepEqual((await accepted.json()).turns,turns);
  assert.equal((await send({...twinPrompt,context:{...twinPrompt.context,speakers:[]}})).status,400);
  duplicate=true;
  const rejected=await send(twinPrompt);
  assert.equal(rejected.status,502);
  assert.equal((await rejected.json()).code,'output-validation');
});
