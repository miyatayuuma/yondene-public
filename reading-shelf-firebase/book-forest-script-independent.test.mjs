import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

// Register genuinely new IDs in an isolated copy of the production modules.
// No engine allowlist, profile validator, Worker or scheduler is patched.
const root=await mkdtemp(join(tmpdir(),'forest-new-npc-'));
after(()=>rm(root,{recursive:true,force:true}));
await cp(new URL('./',import.meta.url),join(root,'reading-shelf-firebase'),{
  recursive:true,filter:source=>!source.includes('node_modules')&&!source.includes('.firebase')});
await cp(new URL('../cloudflare',import.meta.url),join(root,'cloudflare'),{recursive:true});
const ids=Array.from({length:6},(_,i)=>'fixture_friend_'+i);
const additions=ids.map((id,i)=>({id,name:'架空の友だち'+i,aliases:['架空'+i],
  mode:'ai',related:[ids[(i+1)%ids.length],ids[(i+ids.length-1)%ids.length]],actor:{x:i,z:0,scale:1},
  voice:{rate:1.4,pitch:1},fallbackVoice:'架空の人物',goodbye:'また会おうね。'}));
const registryPath=join(root,'reading-shelf-firebase/forest-character-registry.mjs');
await writeFile(registryPath,(await readFile(registryPath,'utf8'))
  .replace('const roster=[','const roster=['+additions.map(x=>JSON.stringify(x)+',').join('')));
const load=path=>import(pathToFileURL(join(root,path)).href);
const {createForestDialogueDirector}=await load('reading-shelf-firebase/book-forest-dialogue-director.mjs');
const {createForestLiveDialogueDirector}=await load('reading-shelf-firebase/book-forest-live-dialogue.mjs');
const {createForestCloudflareGenerator,verifyForestCloudflareRoster}=await load('reading-shelf-firebase/book-forest-cloudflare-provider.mjs');
const {handleRequest}=await load('cloudflare/forest-ai/src/index.mjs');
const {FOREST_ROSTER_REVISION,FOREST_CHARACTER_REGISTRY}=await load('reading-shelf-firebase/forest-character-registry.mjs');
const {diagnoseForestCharacters}=await load('reading-shelf-firebase/book-forest-character-profiles.mjs');
const {profileFixture}=await load('reading-shelf-firebase/forest-profile-fixture.mjs');
const now=Date.UTC(2026,10,16,3);
const profiles=ids.map(id=>profileFixture({id,summary:'慎重で木の実を集める架空の人物',values:'友だち',
  motivation:'木の実を見つける',relationships:'森の友だち',behavior:'木を見る',reactions:'小声で驚く',
  firstPerson:'ぼく',address:'きみ',cadence:'短く静かに話す',endings:'固定しない',habits:'なし',
  expression:'自然に',emotion:'小さく笑う',avoid:'説教しない',review:'確認済'}));
const memory=(id,bookId,characters=ids[0])=>({schemaVersion:1,id,bookId,characters,
  text:'架空の仲間と木の実を分けた。',tags:'木の実',spoilerLevel:1,evidenceStatus:'approved',
  confidence:'high',sourceUrl:'https://example.org/fiction'});
const book=(id,status='read')=>({id,title:'架空の木の実の本'+id,status});
const storage=()=>{const data=new Map();return {getItem:key=>data.get(key)||null,
  setItem:(key,value)=>data.set(key,value)}};
function stack({books=[],catalog=[],reflections=[],cues=[],fail=false,limits={}}={}){
  const local=storage(),prompts=[];
  const env={OWNER_UID:'fixture-owner',FIREBASE_PROJECT_ID:'kodomo-reading-shelf-87f11',AI:{
    async run(_model,input){
      const prompt=JSON.parse(input.messages[1].content);
      assert.ok(prompt.constraints.length<=12,'retain the existing Worker input cap');
      prompts.push(prompt);
      if(fail)throw Error('fixture unavailable');
      return {response:JSON.stringify({text:prompt.mode==='reply'?'木の実をさがしてみよう。':'あの木の実、まんまるだね。',
        choices:prompt.closing?[]:prompt.context.repliesLeft===1?
          [{label:'いっしょに見る',outcome:'ほら、足もとに丸い木の実が見えるよ。'},
            {label:'ここで待つ',outcome:'ここなら葉の音がよく聞こえるね。'}]:['いっしょに見る','ここで待つ']})};
    }}};
  const fetchImpl=async(url,options={})=>handleRequest(new Request(url,{
    ...options,headers:{...options.headers,Origin:'https://kodomo-reading-shelf-87f11.web.app'}}),env,
    {verifyToken:async()=>'fixture-owner'});
  const generate=createForestCloudflareGenerator({workerUrl:'https://fixture.workers.dev',
    getIdToken:async()=>'fixture-token-for-tests-only',fetchImpl});
  const base=createForestDialogueDirector({getBooks:()=>books,getCatalog:()=>catalog,
    getCues:()=>cues,storage:local});
  const live=createForestLiveDialogueDirector({base,generate,storage:local,startDelayMs:0,
    now:()=>now,getBooks:()=>books,getCatalog:()=>catalog,getCues:()=>cues,
    getCharacterProfiles:()=>profiles,requireCharacterProfile:true,
    getRecentReflections:async()=>reflections,...limits});
  async function visit(id){const identity={characterId:id};const result=await live.start(identity);
    live.onDisplayed(result,identity);return result;}
  return {live,base,prompts,local,visit,fetchImpl};
}

test('zero-cue future NPC: real director -> provider -> Worker -> displayed opening/replies, first meet and revisits',async()=>{
  const s=stack();
  const first=await s.visit(ids[0]);
  assert.equal(first.text,'あの木の実、まんまるだね。');
  assert.equal(s.prompts[0].context.sourceKind,'meet');
  assert.equal(s.prompts[0].context.situation.firstEncounter,true);
  assert.match(s.prompts[0].task,/初対面/);
  assert.match(s.prompts[0].npc.voice,/一人称 \[.*\]:ぼく/);
  const reply=await s.live.select({characterId:ids[0],choiceId:first.choices[0].id});
  assert.equal(reply.text,'木の実をさがしてみよう。');
  const closing=await s.live.select({characterId:ids[0],choiceId:reply.choices[0].id});
  assert.equal(closing.conversationComplete,true);
  assert.equal(closing.text,'ほら、足もとに丸い木の実が見えるよ。');
  assert.deepEqual(closing.choices,[]);
  const next=await s.visit(ids[0]);
  assert.ok(next.text);assert.equal(s.prompts.at(-1).context.sourceKind,'ambient');
  assert.equal(s.prompts.at(-1).context.situation.firstEncounter,false);
  const focus=s.prompts.at(-1).context.situation.focus;
  await s.visit(ids[0]);
  assert.notEqual(s.prompts.at(-1).context.situation.focus,focus);
  assert.equal(s.prompts.at(-1).context.situation.visitNumber,3);
  assert.equal(s.base.getProgress().visits[ids[0]],3);
});

test('only currently read, related source facts reach generation; no memory needs no fabricated facts',async()=>{
  const books=[book('read'),book('unread','unread')];
  const s=stack({books,catalog:[memory('known','read'),memory('secret','unread')]});
  await s.visit(ids[0]);await s.visit(ids[0]);
  assert.equal(s.prompts.at(-1).context.sourceKind,'story');
  assert.equal(s.prompts.at(-1).context.topic.bookTitle,books[0].title);
  assert.ok(!JSON.stringify(s.prompts).includes(books[1].title));
  books[0].status='unread';
  await s.visit(ids[0]);
  assert.equal(s.prompts.at(-1).context.sourceKind,'ambient');
  assert.equal(s.prompts.at(-1).context.topic,undefined);
  assert.notEqual(s.prompts.at(-1).context.today.scene.evidence,'reviewed');
  const none=stack();await none.visit(ids[1]);await none.visit(ids[1]);
  assert.equal(none.prompts.at(-1).context.sourceKind,'ambient');
  assert.equal(none.prompts.at(-1).context.topic,undefined);
});

for(const count of [1,3])test(`reflection scheduler with ${count} reviews and six future NPCs is forest-wide and attribution-safe`,async()=>{
  const books=Array.from({length:count},(_,i)=>book('b'+i));
  const reflections=books.map((b,i)=>({id:'review'+i,bookId:b.id,
    quote:'架空の感想'+i,attribution:i%2?'parent-summary':'verbatim',createdAt:now-1000}));
  // Even authored reflection cues must not bypass the shared scheduler.
  const cues=ids.flatMap(id=>books.map((b,i)=>({schemaVersion:1,id:id+'-review'+i,
    approval:'approved',characterId:id,kind:'reflection',bookId:b.id,text:'{reflection}'})));
  const s=stack({books,reflections,cues});
  for(const id of ids)await s.visit(id); // establish genuine first meetings
  assert.ok(s.prompts.every(p=>p.context.sourceKind==='meet'));
  for(const id of ids)await s.visit(id);
  const reactions=s.prompts.filter(p=>p.context.readerReflection);
  assert.ok(reactions.length>0);assert.ok(reactions.length<6);
  assert.ok(reactions.length<=count);
  assert.equal(new Set(reactions.map(p=>p.context.readerReflection.quote)).size,reactions.length);
  assert.equal(new Set(reactions.map(p=>p.context.readerReflection.bookTitle)).size,reactions.length);
  for(const p of reactions)assert.equal(p.context.readerReflection.attribution,
    reflections.find(r=>r.quote===p.context.readerReflection.quote).attribution);
  assert.ok(!s.local.getItem('forest-ai-local-v1:log').includes('架空の感想'));
});

test('new IDs retain relation choice, relay and previous encounter without individual cue',async()=>{
  const s=stack();await s.visit(ids[0]);
  const ambient=await s.visit(ids[0]);
  const relay=ambient.choices.find(c=>c.relayTo===ids[1]);assert.ok(relay);
  await s.live.select({characterId:ids[0],choiceId:relay.id});
  assert.equal(s.base.getProgress().nextNpc,ids[1]);
  await s.visit(ids[1]);
  const context=s.prompts.at(-1).context;
  assert.equal(context.sourceKind,'meet');
  assert.equal(context.today.relatedEncounter.npc,ids[0]);
  assert.equal(context.situation.firstEncounter,true);
  await s.visit(ids[1]);
  assert.equal(s.prompts.at(-1).context.sourceKind,'relay');
  assert.equal(s.prompts.at(-1).context.situation.fromNpc,ids[0]);
  assert.equal(s.prompts.at(-1).context.situation.firstEncounter,false);
  assert.equal(s.base.getProgress().nextNpc,null);
});

test('outage, quota and missing profile fail safely without scripts or invented story/reader facts',async()=>{
  const s=stack({fail:true});const result=await s.visit(ids[0]);
  assert.ok(result.text);assert.ok(!result.text.includes('架空の'));
  assert.ok(JSON.parse(s.local.getItem('forest-ai-local-v1:log')).some(e=>e.event==='script-fallback'));
  const limited=stack({limits:{dailyLimit:1}});await limited.visit(ids[0]);await limited.visit(ids[1]);
  assert.equal(limited.prompts.length,1);
  const missing=stack({limits:{getCharacterProfiles:()=>[]}});await missing.visit(ids[0]);
  assert.equal(missing.prompts.length,0);
  assert.ok(missing.local.getItem('forest-ai-local-v1:log').includes('missing-character-profile'));
  const diagnostics=diagnoseForestCharacters({registry:FOREST_CHARACTER_REGISTRY,profiles,
    images:{[ids[0]]:{}},aiAvailable:true});
  assert.deepEqual(diagnostics.find(x=>x.id===ids[0]).missing,[]);
  assert.deepEqual(diagnostics.find(x=>x.id===ids[1]).missing,['sprite']);
  assert.ok(!JSON.stringify(diagnostics).includes('慎重'));
});

test('real Worker health verifies new registration and rejects old roster/protocol',async()=>{
  const s=stack();
  await verifyForestCloudflareRoster({workerUrl:'https://fixture.workers.dev',
    expectedRevision:FOREST_ROSTER_REVISION,fetchImpl:s.fetchImpl});
  await assert.rejects(verifyForestCloudflareRoster({workerUrl:'https://fixture.workers.dev',
    expectedRevision:'old-roster',fetchImpl:s.fetchImpl}),/roster mismatch/);
  await assert.rejects(verifyForestCloudflareRoster({workerUrl:'https://fixture.workers.dev',
    expectedRevision:FOREST_ROSTER_REVISION,expectedProtocol:'old-protocol',fetchImpl:s.fetchImpl}),/roster mismatch/);
});


test('review source stays attributed across replies and read->unread revokes it immediately',async()=>{
  const books=[book('review-source')];
  const s=stack({books,reflections:[{id:'r',bookId:books[0].id,
    quote:'保護者が記録した架空の感想',attribution:'parent-summary',createdAt:now-1000}]});
  await s.visit(ids[0]);
  const opening=await s.visit(ids[0]);
  assert.equal(s.prompts.at(-1).context.readerReflection.attribution,'parent-summary');
  assert.equal(s.prompts.at(-1).context.readerReflection.sourceBookId,undefined);
  const reply=await s.live.select({characterId:ids[0],choiceId:opening.choices[0].id});
  assert.equal(s.prompts.at(-1).context.readerReflection.attribution,'parent-summary');
  const before=s.prompts.length;
  books[0].status='unread';
  const result=await s.live.select({characterId:ids[0],choiceId:reply.choices[0].id});
  assert.equal(result.conversationComplete,true);
  assert.doesNotMatch(result.text,/足もとに丸い木の実/);
  assert.equal(s.prompts.length,before);
  assert.ok(!s.local.getItem('forest-ai-local-v1:log').includes('保護者が記録した'));
});
