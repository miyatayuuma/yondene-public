// Runs the production directors and Worker request/response contract. Only the
// clock, storage, source readers and network transport are replaced. Full traces
// may contain PRIVATE inputs: callers must not log or publish them by default.
import {createForestDialogueDirector} from '../reading-shelf-firebase/book-forest-dialogue-director.mjs';
import {createForestLiveDialogueDirector,validateLiveForestOutput,FOREST_PROMPT_VERSION}
  from '../reading-shelf-firebase/book-forest-live-dialogue.mjs';
import {FOREST_DIALOGUE_PROTOCOL,FOREST_ROSTER_REVISION}
  from '../reading-shelf-firebase/forest-character-registry.mjs';
import {forestGenerationInput,readCompletion,FOREST_WORKER_VERSION}
  from '../cloudflare/forest-ai/src/index.mjs';

export function scenarioStorage(initial={}){
  const values=new Map(Object.entries(initial));
  return {getItem:key=>values.get(key)||null,setItem:(key,v)=>values.set(key,v),
    removeItem:key=>values.delete(key),snapshot:()=>Object.fromEntries(values)};
}
export function forestInputFingerprint(value){
  let a=2166136261,b=5381;
  for(const c of JSON.stringify(value)){const n=c.codePointAt(0);
    a=Math.imul(a^n,16777619);b=Math.imul(b,33)^n;}
  return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');
}
export async function runForestConversationScenario({visits=[],transport,
  storage=scenarioStorage(),now=()=>Date.now(),getBooks=()=>[],getCatalog=()=>[],
  getCues=()=>[],getReflections=async()=>[],getRecentReflections=async()=>[],
  getCharacterProfiles=()=>[],getTwinNames=()=>[],getTwinScenes=()=>[],
  dailyLimit=300,requestTimeoutMs=11000,runtime={},
  implementation={createForestDialogueDirector,createForestLiveDialogueDirector,
    forestGenerationInput,readCompletion,validateLiveForestOutput},onStep=()=>{}}={}){
  if(typeof transport!=='function')throw Error('A model transport is required');
  const trace=[],frames=[];
  const versions={protocolRevision:FOREST_DIALOGUE_PROTOCOL,registryRevision:FOREST_ROSTER_REVISION,
    promptVersion:FOREST_PROMPT_VERSION,workerVersion:FOREST_WORKER_VERSION,...implementation.versions};
  const common={getBooks,getCatalog,getCues,storage};
  const base=implementation.createForestDialogueDirector({...common,getReflections,
    getTwinNames,getTwinScenes,storageKey:'scenario:base'});
  const live=implementation.createForestLiveDialogueDirector({...common,base,
    getRecentReflections,getCharacterProfiles,requireCharacterProfile:true,
    storageKey:'scenario:live',now,startDelayMs:0,sessionLimit:3,maxReplies:2,
    dailyLimit,requestTimeoutMs,...runtime,modelId:'@cf/google/gemma-4-26b-a4b-it',
    generate:async(prompt,{signal}={})=>{
      const input=implementation.forestGenerationInput(prompt);
      const entry={prompt,input,inputFingerprint:forestInputFingerprint(input),
        ...versions,
        validation:'pending'};
      trace.push(entry);
      // Use exactly the Worker model-output validator before the browser's
      // second validation. A successful raw API call is not a displayed frame.
      try{
        entry.raw=await transport(input,{prompt,signal,index:trace.length-1});
        entry.validated=implementation.readCompletion(entry.raw,{characterId:prompt.npc.id,
          mode:prompt.mode,closing:prompt.closing,context:prompt.context});
        entry.workerValidation='accepted';
        entry.validation=implementation.validateLiveForestOutput(entry.validated,{characterId:prompt.npc.id,
          requireLine:prompt.mode!=='choices',closing:prompt.closing,context:prompt.context})?'accepted':'rejected';
        if(entry.validation==='rejected')entry.failure='output-validation';
        return entry.validated;
      }catch(error){entry.validation='rejected';
        // Do not retain provider exception bodies or credentials in traces.
        entry.failure=/timeout/iu.test(String(error?.message||''))?'timeout':
          /Invalid model JSON/u.test(String(error?.message||''))?'model-json':
          /Invalid model|Invalid silent|Invalid closing/u.test(String(error?.message||''))?'output-validation':'model-or-transport';
        throw error;}
    }});
  async function display(result,identity,visit,turn,visible=true){
    frames.push({visit,turn,characterId:identity.characterId,result,displayed:visible});
    // Same hook and ordering as book-forest.mjs after its text frame is rendered.
    if(visible&&result)live.onDisplayed(result,identity);
    await onStep({visit,turn,result,live,storage});
  }
  try{
    for(const [visit,item] of visits.entries()){
      const identity={characterId:item.characterId};
      let result=await live.start(identity);
      await display(result,identity,visit,0,item.display!==false);
      for(const [turn,selection] of (item.choices||[]).entries()){
        if(result?.conversationComplete&&!result.choices?.length)break;
        const choice=typeof selection==='number'?result?.choices?.[selection]:
          result?.choices?.find(c=>c.label===selection);
        if(!choice)throw Error('Scenario selected a choice that was not displayed');
        result=await live.select({...identity,choiceId:choice.id});
        await display(result,identity,visit,turn+1,item.display!==false);
      }
      // Twins retain their existing local presentation, until the separate
      // structured multi-speaker migration has passed real-model acceptance.
      for(let n=0;result?.autoNext&&n<10;n++){
        result=await live.advance(identity);if(!result)break;
        await display(result,identity,visit,n+1,item.display!==false);
      }
      live.end();
    }
  }finally{live.end()}
  return {trace,frames,storage:storage.snapshot?.(),progress:live.getProgress(),
    summary:{requests:trace.length,accepted:trace.filter(t=>t.validation==='accepted').length,
      frames:frames.length,...versions,
      turns:trace.map(t=>({npc:t.prompt.npc.id,mode:t.prompt.mode,
        sourceKind:t.prompt.context.sourceKind,profileRevision:t.prompt.npc.profileRevision,
        inputFingerprint:t.inputFingerprint,validation:t.validation}))}};
}
