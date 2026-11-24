// Runs the production director and Worker request/response contract. Only the
// clock, storage, source readers and network transport are replaced. Full traces
// may contain PRIVATE inputs: callers must not log or publish them by default.
import {createForestLiveDialogueDirector,validateLiveForestOutput,FOREST_PROMPT_VERSION}
  from '../reading-shelf-firebase/book-forest-live-dialogue.mjs';
import {FOREST_DIALOGUE_PROTOCOL,FOREST_ROSTER_REVISION}
  from '../reading-shelf-firebase/forest-character-registry.mjs';
import {FOREST_MODEL} from '../reading-shelf-firebase/forest-ai-config.mjs';
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
  getRecentReflections=async()=>[],
  getArchivedReflections=async()=>[],getCurrentReflection=null,getCharacterProfiles=()=>[],getTwinNames=()=>[],
  dailyLimit=300,requestTimeoutMs=11000,runtime={},allowUnavailableChoice=false,
  implementation={createForestLiveDialogueDirector,
    forestGenerationInput,readCompletion,validateLiveForestOutput},onStep=()=>{}}={}){
  if(typeof transport!=='function')throw Error('A model transport is required');
  const trace=[],frames=[],selectionErrors=[];
  const versions={protocolRevision:FOREST_DIALOGUE_PROTOCOL,registryRevision:FOREST_ROSTER_REVISION,
    promptVersion:FOREST_PROMPT_VERSION,workerVersion:FOREST_WORKER_VERSION,...implementation.versions};
  const live=implementation.createForestLiveDialogueDirector({storage,getBooks,getCatalog,getTwinNames,
    getRecentReflections,getArchivedReflections,getCurrentReflection,getCharacterProfiles,
    encounterKey:'scenario:base',storageKey:'scenario:live',now,startDelayMs:0,
    dailyLimit,requestTimeoutMs,...runtime,modelId:FOREST_MODEL,
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
          /Model network error/u.test(String(error?.message||''))?'network':
          /Model response JSON/u.test(String(error?.message||''))?'response-json':
          /Model provider error/u.test(String(error?.message||''))?'model-provider':
          /Invalid model unsafe-foraging/u.test(String(error?.message||''))?'unsafe-foraging':
          /Invalid silent cat action/u.test(String(error?.message||''))?'silent-output-contract':
          /Model HTTP (\d{3})/u.exec(String(error?.message||''))?.[0]?.toLowerCase().replaceAll(' ','-')||
          (/Invalid model JSON/u.test(String(error?.message||''))?'model-json':
          /Invalid model|Invalid silent|Invalid closing/u.test(String(error?.message||''))?'output-validation':'model-or-transport');
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
      let frameNumber=0;
      async function showSegment(){
        await display(result,identity,visit,frameNumber++,item.display!==false);
        for(let n=0;result?.autoNext&&!result.choices?.length&&n<10;n++){
          result=await live.advance(identity);
          if(!result)break;
          await display(result,identity,visit,frameNumber++,item.display!==false);
        }
      }
      await showSegment();
      for(const selection of item.choices||[]){
        if(!result||result.conversationComplete&&!result.choices?.length)break;
        const offered=result.choices||[];
        let choice=typeof selection==='number'?offered[selection]:
          offered.find(c=>selection==='relay'?c.relayTo:c.label===selection);
        if(!choice){
          if(!allowUnavailableChoice)throw Error('Scenario selected a choice that was not displayed');
          selectionErrors.push({visit,selection,offered:offered.length});
          // A target branch that was absent stays an explicit failure. An
          // available numbered branch can still exercise the remainder.
          if(typeof selection!=='number'||!offered.length)break;
          choice=offered[0];
        }
        result=await live.select({...identity,choiceId:choice.id});
        await showSegment();
      }
      for(let n=0;result?.autoNext&&n<10;n++){
        result=await live.advance(identity);if(!result)break;
        await display(result,identity,visit,frameNumber++,item.display!==false);
      }
      live.end();
    }
  }finally{live.end()}
  return {trace,frames,selectionErrors,storage:storage.snapshot?.(),progress:live.getProgress(),
    summary:{requests:trace.length,accepted:trace.filter(t=>t.validation==='accepted').length,
      frames:frames.length,...versions,
      turns:trace.map(t=>({npc:t.prompt.npc.id,mode:t.prompt.mode,
        sourceKind:t.prompt.context.sourceKind,profileRevision:t.prompt.npc.profileRevision,
        inputFingerprint:t.inputFingerprint,validation:t.validation}))}};
}
