import test from 'node:test';
import assert from 'node:assert/strict';
import {parseForestCharacterProfiles,parseForestProfileSources,validForestCharacterProfiles,
  forestCharacterVoiceGuide,FOREST_PROFILE_HEADERS,FOREST_PROFILE_FIELDS} from './book-forest-character-profiles.mjs';
import {profileFixture} from './forest-profile-fixture.mjs';
import {promptFor} from './book-forest-live-dialogue.mjs';
import {createForestCloudflareGenerator} from './book-forest-cloudflare-provider.mjs';
import {handleRequest} from '../cloudflare/forest-ai/src/index.mjs';
const row=(key,text,basis='編集解釈',review='暫定採用',refs='',scope='架空の試験場面に限定')=>
  ['cat',FOREST_PROFILE_FIELDS[key],text,basis,refs,scope,review,'test-v2'];
const rows=()=>[FOREST_PROFILE_HEADERS,row('summary','観察好きな架空の相棒'),row('cadence','動作で表す'),row('avoid','声で話さない')];

test('every field survives source -> normalized profile -> actual Worker model input, including late annotations',async()=>{
  const input=[FOREST_PROFILE_HEADERS,...Object.entries(FOREST_PROFILE_FIELDS).map(([key])=>
    row(key,key+'の長い合成設定。'.repeat(24)+'末尾-'+key+'（演出案・本文未照合）'))];
  const profile=parseForestCharacterProfiles(input)[0];
  const captured=[];
  const generate=createForestCloudflareGenerator({workerUrl:'https://fixture.workers.dev',
    getIdToken:async()=>'fixture-authentication-token',
    fetchImpl:async(url,options)=>handleRequest(new Request(url,{...options,
      headers:{...options.headers,Origin:'https://kodomo-reading-shelf-87f11.web.app'}}),{
      OWNER_UID:'fixture-owner',FIREBASE_PROJECT_ID:'kodomo-reading-shelf-87f11',AI:{run:async(_,data)=>{
        captured.push(data);return {response:JSON.stringify({text:'（ねこは木の下で道具をならべる。）',delivery:'gesture',choices:['いっしょに見る','またね']})};}}
    },{verifyToken:async()=>'fixture-owner'})});
  const prompt=promptFor({characterId:'cat',mode:'opening',characterProfile:profile,sourceKind:'ambient'});
  const result=await generate(prompt);
  const modelPrompt=JSON.parse(captured[0].messages[1].content);
  for(const [i,[key]] of Object.entries(FOREST_PROFILE_FIELDS).entries()){
    assert.equal(profile[key],input[i+1][2]);
    assert.ok(modelPrompt.npc.voice.includes(input[i+1][2]),key+' must survive losslessly');
  }
  assert.equal(modelPrompt.npc.profileRevision,profile.revision);
  assert.equal(result.profileRevision,profile.revision);
  assert.match(captured[0].messages[0].content,/暫定採用.*原作の確定事実/u);
});

test('confirmed scoped source facts and provisional pronouns retain distinct evidence',()=>{
  const sources=parseForestProfileSources([['資料ID','根拠の種別','確認状態'],['test-source','作者証言','確認済']]);
  const data=rows();data.push(row('firstPerson','ぼく（初期巻未照合）','公式資料','確認済','test-source','架空の第5巻のみ'));
  data.push(row('endings','〜だぞ（仮案）'));
  const p=parseForestCharacterProfiles(data,sources)[0],guide=forestCharacterVoiceGuide(p);
  assert.match(guide,/一人称 \[公式資料 \/ 確認済 \/ 架空の第5巻のみ \/ 資料:test-source\]:ぼく（初期巻未照合）/);
  assert.match(guide,/語尾 \[編集解釈 \/ 暫定採用/);
  assert.match(guide,/test-source=作者証言\(確認済\)/);
});

test('malformed headers, oversized content, duplicate fields, untyped confidence and dangling sources are visible errors',()=>{
  assert.throws(()=>parseForestCharacterProfiles([['旧形式']]),/ヘッダー/);
  for(const change of [r=>r.push(row('summary','二重')),r=>r[1][2]='x'.repeat(1201),
    r=>r[1][3]='不明',r=>r[1][4]='missing',r=>r[1][6]='確認済',r=>r[1][5]='']){
    const data=rows();change(data);assert.throws(()=>parseForestCharacterProfiles(data),/人物設定/);
  }
  assert.deepEqual(validForestCharacterProfiles([{id:'cat',summary:'legacy',cadence:'legacy',avoid:'legacy'}]),[]);
  const p=profileFixture();assert.deepEqual(validForestCharacterProfiles([{...p,motivation:'injected'}]),[]);
});

test('content and evidence changes invalidate revision without version edits or code redeployment',()=>{
  const a=rows(),first=parseForestCharacterProfiles(a)[0];
  a.push(row('motivation','助け合って道具を直す'));
  const second=parseForestCharacterProfiles(a)[0];
  assert.notEqual(first.revision,second.revision);assert.equal(first.version,second.version);
  a.at(-1)[5]='架空の別場面';const third=parseForestCharacterProfiles(a)[0];
  assert.notEqual(second.revision,third.revision);
  assert.match(promptFor({characterId:'cat',characterProfile:second}).npc.voice,/道具を直す/);
  assert.doesNotMatch(promptFor({characterId:'cat',characterProfile:first}).npc.voice,/道具を直す/);
});

test('silent and speaking identities use the same private field schema',()=>{
  for(const id of ['cat','hachibee','hakase','mochan','jiji']){
    const p=profileFixture({id,behavior:'架空の問題を自分で解決する',relationships:'架空の親友',
      motivation:'一緒に暮らしを工夫する'});
    assert.equal(validForestCharacterProfiles([p]).length,1);
    const prompt=promptFor({characterId:id,characterProfile:p,mode:'opening'});
    for(const key of ['behavior','relationships','motivation'])assert.ok(prompt.npc.voice.includes(p[key]));
  }
});
