// Default: reproducible synthetic model I/O through the production pipeline.
// Real model: --model with scoped test credentials supplied in the environment.
// Private sources: --input /outside/repository/input.json. No writes to Sheets,
// Firestore, application storage or production services are made by this CLI.
import {readFileSync,writeFileSync,realpathSync} from 'node:fs';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {runForestConversationScenario,scenarioStorage} from './forest-conversation-scenario.mjs';
import {profileFixture} from '../reading-shelf-firebase/forest-profile-fixture.mjs';
const args=process.argv.slice(2),option=key=>args.includes(key)?args[args.indexOf(key)+1]:null;
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=resolve(option('--source')||repo);
const ids=['king','cat','kiki','jiji','skipper','zorori','ishishi','noshishi','hachibee','hakase','mochan'];
const clock=Date.parse('2026-11-17T07:00:00Z');
const synthetic={provenance:'synthetic',clock,
  characterProfiles:ids.map(id=>profileFixture({id,firstPerson:id==='cat'?'':'合成試験用'})),
  books:[{id:'synthetic-read',title:'架空の試験本',status:'read'},
    {id:'synthetic-unread',title:'未読の試験本',status:'unread'}],
  catalog:[{schemaVersion:1,id:'synthetic-memory',bookId:'synthetic-read',
    text:'架空の旅人が町でなくした道具を橋の上で見つけた。',tags:'道具',characters:'kiki jiji',
    evidenceStatus:'approved',confidence:'high',spoilerLevel:1,sourceUrl:'https://example.org/story'}],
  reflections:[{id:'synthetic-review',bookId:'synthetic-read',quote:'道具を見つけたところが好き',
    attribution:'parent-summary',createdAt:clock}]};
const data=option('--input')?JSON.parse(readFileSync(option('--input'),'utf8')):synthetic;
if(!Array.isArray(data.books)||!Array.isArray(data.characterProfiles)||!Number.isFinite(data.clock))
  throw Error('Input requires books, characterProfiles and a clock');
if(data.provenance!=='synthetic'&&data.provenance!=='historical-readonly-mirror'&&
  (!Number.isFinite(data.snapshotAt)||Date.now()-data.snapshotAt>7200000))
  throw Error('Private source snapshot is stale');
const load=path=>import(pathToFileURL(resolve(source,path)).href);
const [base,live,worker,registry]=await Promise.all([
  load('reading-shelf-firebase/book-forest-dialogue-director.mjs'),
  load('reading-shelf-firebase/book-forest-live-dialogue.mjs'),
  load('cloudflare/forest-ai/src/index.mjs'),load('reading-shelf-firebase/forest-character-registry.mjs')]);
const constant=(path,name)=>new RegExp("(?:const|export const) "+name+"='([^']+)'",'u')
  .exec(readFileSync(resolve(source,path),'utf8'))?.[1]||'unknown';
const versions={protocolRevision:registry.FOREST_DIALOGUE_PROTOCOL,registryRevision:registry.FOREST_ROSTER_REVISION,
  promptVersion:live.FOREST_PROMPT_VERSION||constant('reading-shelf-firebase/book-forest-live-dialogue.mjs','PROMPT_VERSION'),
  workerVersion:worker.FOREST_WORKER_VERSION||constant('cloudflare/forest-ai/src/index.mjs','VERSION'),
  appBuild:/data-app-build="([^"]+)"/u.exec(readFileSync(resolve(source,'reading-shelf-firebase/index.html'),'utf8'))?.[1]};
let calls=0;
const useModel=args.includes('--model'),maxRequests=40;
if(useModel&&(!process.env.CLOUDFLARE_AI_TEST_TOKEN||
  !/^[a-f0-9]{32}$/iu.test(process.env.CLOUDFLARE_AI_TEST_ACCOUNT_ID||'')))
  throw Error('Scoped test model credentials are not available');
async function transport(input,{prompt,signal}){
  if(++calls>maxRequests)throw Error('Scenario model request cap');
  if(useModel){
    const account=process.env.CLOUDFLARE_AI_TEST_ACCOUNT_ID;
    const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+
      '/ai/run/@cf/google/gemma-4-26b-a4b-it',{method:'POST',signal,
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.CLOUDFLARE_AI_TEST_TOKEN},
      body:JSON.stringify({...input,stream:false})});
    if(!response.ok)throw Error('Model transport HTTP '+response.status);
    const body=await response.json();if(body.success===false)throw Error('Model transport unavailable');
    return body.result;
  }
  return {response:JSON.stringify({text:prompt.npc.id==='cat'?'（ねこはとなりにすわった。）':
    prompt.closing?'続きはまた会ったときにね。':prompt.mode==='reply'?'あの曲がり角まで見に行こう。':
    '向こうの道が気になるな。',...(prompt.npc.id==='cat'?{mark:null}:{}),
    choices:prompt.closing?[]:['いっしょに見る','ここで待つ']})};
}
const visits=data.visits||[...ids.map(characterId=>({characterId,choices:[]})),
  ...Array.from({length:6},()=>({characterId:'kiki',choices:[0,0]})),
  {characterId:'king',choices:[0]},{characterId:'cat',choices:[0]}];
const result=await runForestConversationScenario({visits,transport,storage:scenarioStorage(data.storage),
  now:()=>data.clock,getBooks:()=>data.books,getCatalog:()=>data.catalog||[],getCues:()=>data.cues||[],
  getCharacterProfiles:()=>data.characterProfiles,getRecentReflections:async()=>data.reflections||[],
  implementation:{...base,...live,...worker,versions}});
const storyReplies=result.trace.filter(t=>t.prompt.mode==='reply'&&t.prompt.context.sourceKind==='story');
const reviewReplies=result.trace.filter(t=>t.prompt.mode==='reply'&&t.prompt.context.readerReflection);
const summary={...result.summary,versions,source:data.provenance||'private-readonly',
  transport:useModel?'real-gemma':'synthetic-model-output',qualityAccepted:false,
  structural:{storyReplies:storyReplies.length,groundedStoryReplies:storyReplies.filter(t=>t.prompt.context.topic?.fact).length,
    reviewReplies:reviewReplies.length,continuationReviewTasks:reviewReplies.filter(t=>/直前の会話|直前に選ばれた/u.test(t.prompt.task)).length,
    storyOpenings:result.trace.filter(t=>t.prompt.mode==='opening'&&t.prompt.context.sourceKind==='story').length}};
if(option('--trace-output')){
  const output=resolve(option('--trace-output')),parent=realpathSync(dirname(output));
  const rel=relative(realpathSync(repo),parent);
  if(!rel||(!rel.startsWith('..')&&!isAbsolute(rel)))throw Error('Full traces must remain outside the public repository');
  writeFileSync(output,JSON.stringify({...result,summary},null,2),{mode:0o600});
}
console.log(JSON.stringify(summary,null,2));
