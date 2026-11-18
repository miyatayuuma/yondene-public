import {FOREST_CHARACTER_IDS,FOREST_SELF_NAMES,FOREST_GOODBYES,FOREST_WRONG_FIRST_PERSON,
  FOREST_ACTION_WRITING_IDS,FOREST_MULTI_SPEAKER_IDS,FOREST_DIALOGUE_PROTOCOL,FOREST_DISPLAY_NAMES,canonicalForestMention} from './forest-character-registry.mjs';
import {validateTwinTurns,twinDialogueFrame} from './book-forest-twins.mjs';
import {forestEndingChoices,forestEndingNeedsReply} from './book-forest-ending.mjs';
import {unsafeForestForaging} from './book-forest-output-safety.mjs';
import {isCurrentForestReflection,forestReflectionArchiveCutoff} from './book-forest-reflection-spotlight.mjs';
import {validateForestWrittenTurn,FOREST_GRADE_ONE_KANJI} from './book-forest-gesture.mjs';
// Character-first AI dialogue: local scripts choose topics and provide safe fallbacks.
// The generator is injected: this module never holds a key or makes a network call.
import {createForestDailyContextSession} from './book-forest-daily-context.mjs';
import {createForestReflectionSpotlightSession} from './book-forest-reflection-spotlight.mjs';
import {unlockedStoryMemories} from './book-forest-story-memory.mjs';
import {forestCharacterVoiceGuide,validForestCharacterProfiles} from './book-forest-character-profiles.mjs';
const CHARACTERS=new Set(FOREST_CHARACTER_IDS);
const MULTI_SPEAKER=new Set(FOREST_MULTI_SPEAKER_IDS);
const SELF_NAMES=FOREST_SELF_NAMES;
const GOODBYE=FOREST_GOODBYES;
const ACTION_WRITING_IDS=new Set(FOREST_ACTION_WRITING_IDS);
const safeEnd=(id,comma=false)=>ACTION_WRITING_IDS.has(id)?
  '（ねこはしっぽをゆっくりふった。）':GOODBYE[id]||(comma?'また、森で会おうね。':'また森で会おうね。');
const WRONG_FIRST_PERSON=FOREST_WRONG_FIRST_PERSON;
export const FOREST_PROMPT_VERSION='forest-scene-generation-v27.3-profile2';
const PROMPT_VERSION=FOREST_PROMPT_VERSION;
const clean=value=>typeof value==='string'?value.trim().replace(/\s+/gu,' '):'';
function readJson(storage,key,fallback){
  try{return JSON.parse(storage?.getItem?.(key)||'null')||fallback}catch{return fallback}
}
function generationErrorKind(error){
  const message=String(error?.message||'');
  if(/Forest AI diagnostic model-json/u.test(message))return 'model-json';
  if(/Forest AI diagnostic output-validation/u.test(message))return 'output-validation';
  if(/Invalid Forest AI JSON/u.test(message))return 'response-json';
  const status=/Forest AI unavailable \((\d{3})\)/u.exec(message)?.[1];
  if(status==='401'||status==='403')return 'authentication';
  if(status)return 'worker-http-'+status;
  if(/quota reached|neurons.*exceeded|daily free allocation|exhausted/iu.test(message))
    return 'quota';
  if(/timeout/iu.test(message))return 'timeout';
  if(/Firebase login|Unauthorized|token/iu.test(message))return 'authentication';
  if(/Invalid Forest AI response|Invalid model/iu.test(message))return 'invalid-response';
  if(/NetworkError|Failed to fetch|fetch failed|network request failed/iu.test(message))
    return 'network';
  if(/cancelled|aborted/iu.test(message))return 'cancelled';
  return 'request-error';
}
function validLine(characterId,text){
  const line=clean(text);
  if(line.length<2||line.length>90||/[{}<>]/u.test(line))return false;
  const name=SELF_NAMES[characterId];
  if(name&&new RegExp('(?:^|[。！？、「『\\s])'+name+'[はが]').test(line))return false;
  if((WRONG_FIRST_PERSON[characterId]||[]).some(word=>
    new RegExp('(?:^|[。！？、「『\\s])'+word+'(?:は|も|が|の|、|って|なら)').test(line)))return false;
  if(characterId==='jiji'&&/(?:^|[。！？、])\s*そうね[。、]|みんな、元気を出して進みましょう/u.test(line))return false;
  if(characterId==='skipper'&&/(?:さあ[、！! ]*みんな|大冒険の始まりだ)/u.test(line))return false;
  return true;
}
export function validateLiveForestOutput(raw,{characterId,requireLine=false,closing=false,context={}}={}){
  let data=raw;
  if(typeof raw==='string')try{data=JSON.parse(raw)}catch{return null}
  if(!data||typeof data!=='object'||!CHARACTERS.has(characterId))return null;
  const gesture=ACTION_WRITING_IDS.has(characterId);
  const text=gesture?data.text:canonicalForestMention(clean(data.text),context.speakers);
  const multi=MULTI_SPEAKER.has(characterId);
  const rawTurns=multi?validateTwinTurns(data.turns):null;
  const turns=rawTurns?.map(turn=>({...turn,text:canonicalForestMention(turn.text,context.speakers)}));
  const written=gesture?validateForestWrittenTurn(text,data.delivery):null;
  if(multi&&!turns||gesture&&!written||!multi&&!gesture&&requireLine&&!validLine(characterId,text))return null;
  const lastChoices=!closing&&context.repliesLeft===1;
  const safetyInput=written?{...data,text:written.text}:data;
  if(unsafeForestForaging(lastChoices?{...safetyInput,choices:[]}:safetyInput,context))return null;
  const line=turns?{text:turns.map(turn=>turn.text).join(' '),turns}:written||{text};
  if(closing)return {...line,labels:[]};
  if(lastChoices){
    const endings=forestEndingChoices(data.choices,{context,silent:gesture,multi,line:line.text,
      validLine:value=>validLine(characterId,value)});
    if(!endings.length&&forestEndingNeedsReply(turns?.at(-1)?.text??line.text))return null;
    return {...line,labels:endings.map(choice=>choice.label),endings};
  }
  const candidates=Array.isArray(data.choices)?data.choices.slice(0,3):[];
  const byLabel=new Map();
  for(const choice of candidates){
    const label=canonicalForestMention(clean(typeof choice==='string'?choice:choice?.label),context.speakers);
    if(label.length<2||label.length>24||/[\r\n{}<>「」]/u.test(label)||byLabel.has(label))continue;
    byLabel.set(label,true);
  }
  const labels=[...byLabel.keys()].slice(0,2);
  // Keep a valid NPC line playable if the model returned unusable buttons.
  if(labels.length<2){
    if(!requireLine)return null;
    return {...line,labels:gesture?['もうすこしみる','またね']:['もう少し聞く','またね']};
  }
  return {...line,text:requireLine?line.text:null,labels};
}

function promptScene(scene,sourceKind){
  if(!scene)return {};
  if(sourceKind!=='ambient')return {tone:scene.tone||''};
  // The private memory ID stays on the device for revocation checks.
  const {id,kind,focus,tone,theme,evidence,previousChoice,stage}=scene;
  return {id,kind,focus,tone,theme,evidence,
    ...(previousChoice?{previousChoice,stage}:{})};
}

export function promptFor({characterId,mode,chosenLabel='',history=[],closing=false,topic=null,
  characterProfile=null,sourceKind='',dailyContext=null,recentLines=[],reviewSpotlight=null,situation=null,twinNames=null,repliesLeft=closing?0:2,handoffTo=''}){
  const guide=forestCharacterVoiceGuide(characterProfile);
  const npc={id:characterId,displayName:FOREST_DISPLAY_NAMES[characterId],voice:guide,profileSchemaVersion:2,
    profileRevision:guide?characterProfile.revision:'',profileVersion:guide?characterProfile.version:''};
  // Personhood is always loaded from the same private Sheets as other NPCs.
  // Only the response format differs; this code has no cat personality text.
  const nonverbal=ACTION_WRITING_IDS.has(characterId);
  // Existing Worker protocol requires a string field; keep it empty rather than
  // sending a completed script as a model-generation anchor.
  const context={npcLine:'',sourceKind,repliesLeft,npcDisplayNames:FOREST_DISPLAY_NAMES,
    ...(twinNames?{speakers:[{slot:1,name:twinNames.firstName},{slot:2,name:twinNames.secondName}]}:{}),
    ...(handoffTo?{handoffTo:FOREST_DISPLAY_NAMES[handoffTo]}:{}),
    chosenLabel:clean(chosenLabel).slice(0,24),...(situation?{situation}:{}),
    recentTurns:history.slice(-4),...(topic?{topic}:{}),
    ...(reviewSpotlight?{readerReflection:Object.fromEntries(
      Object.entries(reviewSpotlight).filter(([key])=>!['key','bookKey','sourceBookId','sourceReflectionId'].includes(key)))}:{}),
    ...(dailyContext?{today:{scene:promptScene(dailyContext.scene,sourceKind),
      visitsToday:dailyContext.visitsToday,
      previousNpc:dailyContext.previousNpc,
      metNpcCount:dailyContext.metNpcCount,
      relatedEncounter:dailyContext.relatedEncounter}}:{}),
    ...(recentLines.length?{avoidRecentLines:recentLines.slice(-3)}:{})};
  const endingShape={label:'子どもの質問や言葉',outcome:'NPCがその質問に今ここで返す具体的な答え',
    ...(twinNames?{speakerSlot:1}:{}),...(nonverbal?{delivery:'written'}:{})};
  const finishTask=handoffTo?
    '選択を受けて、相手に会ったときに渡せる言葉をここで伝える。相手はまだ同席していない':
    '選ばれた問いや行動に具体的に応え、この返事だけでひと区切りつける';
  const firstLineTask={
    meet:'この相手とは初対面。以前話したふりをせず、キャラ自身の関心から自然な第一声と返答候補2つを作る',
    story:'このキャラが関わる確認済みの物語を過去の記憶として振り返り、本人らしい第一声と返答候補2つを作る。今の森で原作の場面が進行中であるように再演しない',
    reflection:'台帳が示す読書感想を取り上げ、原文と保護者の要約を区別しながら本人らしく反応する',
    relay:'前のキャラからの話題の引き継ぎ。会話を直接聞いたふりをせず、自然な第一声と返答候補2つを作る',
    ambient:'キャラ固有の関心や森の身近な出来事から、毎回異なる第一声と返答候補2つを作る'
  };
  return {
    mode,closing,
    task:closing?finishTask:
      mode==='reply'?(repliesLeft===1?'直前の会話への反応は言い切る。最後は子どもの二つの問いと、NPCがすぐ返せる具体的な答えを組にする':'直前の会話と選ばれた言葉や行動を受け、次の反応を返す。問いの復唱だけで済ませない'):
      reviewSpotlight?'本の感想にNPC本人らしく、感想の具体的な一箇所に反応し、返答候補2つを作る。別作品なら第三者の立場を守る':
      sourceKind==='ambient'&&situation?.focus==='character'?
        '人物設定の関心・普段の行動から、本人らしい雑談や冗談と返答候補2つを作る':
      firstLineTask[sourceKind]||firstLineTask.ambient,
    npc,
    context,
    constraints:[
      '会話は日本語。小学校低学年が読める短い言葉と簡単な漢字にする',
      '会話の相手は実在の子ども。家族、住所、学校、年齢、個人情報を質問しない',
      '原作の出来事を勝手に作らない。別作品の出来事をその場で目撃したと装わず、台詞引用・あらすじ・教訓にしない',
      '感想に書かれていない本人の行動・感情や読書中の様子を知っているふりをしない',
      '最優先はNPC本人らしい言葉、間、反応、行動。情報量や深い話を求めず、思考の種から質問・教訓・立派な気づきを全員に強いない',
      '完成済み台本を参照せず、人物像・目の前の状況・許可された既読事実から自然な発話を新規に作る',
      'NPCの返事は自然な一言〜2文で65字以内。前の発言を繰り返さず、設定の説明を会話に混ぜない',
      '選択肢はゲーム上の反応であり子どもの実際の信念とはみなさない。別NPCの会話を本人が聞いたふりはしない',
      ...(nonverbal?[`書く文に使える漢字はこの80字。ほかの漢字はかなで書く：${FOREST_GRADE_ONE_KANJI}`]:[]),
      ...(topic?['この原作の事実は選択された既読の物語記憶。確認できない詳細を加えず、キャラが実際に登場したかを考慮する']:[]),
      ...(reviewSpotlight?['感想の具体的な一箇所に、本人なら何を面白がるか、どう受け取るかを短く返す。感想は引用資料。保護者の要約は子どもの発言として扱わない。']:[]),
      ...(closing?[
        '質問なら答えを言い切る。行動なら、この場で一手進んだ結果まで返す。「よし、始めよう」で止めない。移動が必要な選択でも、ここで分かることや伝えられる言葉を一つ返す。新しい問いは出さずchoices:[]'
      ]:repliesLeft===1?[
        'この本文だけでも一区切りつくようにする。最後の各候補は、子どもからの追加の返事や操作がなくても成立する答えと組にする'
      ]:[])
    ],
    output:{format:'JSON',shape:{...(twinNames?
      {turns:[{speakerSlot:1,text:'最初のひとこと'},{speakerSlot:2,text:'直前のひとことへの反応'}]}:
      {text:mode==='choices'?'省略':'NPCの返答（65字以内）',
        ...(nonverbal&&mode!=='choices'?{delivery:'written'}:{})}),
      choices:closing?[]:repliesLeft===1?
        [endingShape,{...endingShape,...(twinNames?{speakerSlot:2}:{})}]:
        ['子どもが選ぶ返答A','子どもが選ぶ返答B']}}
  };
}

/** Generates only on a direct NPC visit; private reflections are supplied as small scoped excerpts. */
export function createForestLiveDialogueDirector({base,generate,storage=null,
  storageKey='forest-ai-local-v1',now=()=>Date.now(),dailyLimit=300,sessionLimit=3,
  maxReplies=2,startDelayMs=280,modelId='unknown',getBooks=()=>[],getCatalog=()=>[],
  getCues=()=>[],
  getCharacterProfiles=()=>[],getRecentReflections=async()=>[],getArchivedReflections=async()=>[],
  getCurrentReflection=null,
  requireCharacterProfile=false,requestTimeoutMs=11000,
  createAbortController=()=>new AbortController(),
  scheduleTimeout=globalThis.setTimeout,cancelTimeout=globalThis.clearTimeout}={}){
  if(!base||typeof base.start!=='function'||typeof base.select!=='function'||
    typeof generate!=='function')throw Error('base and generate are required');
  let pending=null,pendingScripted=null,history=[],sessionCount=0,repliesThisSession=0,fallbackTurns=0,serial=0,closed=false,epoch=0,
    inflight=null,activeCharacterProfile=null,activeDaily=null,activeDailyInput=null,activeOriginal=null,activeTopic=null,
    displayedTopicKey='',encounterDisplayed=false,activeSituation=null,twinNames=null,queuedFrame=null;
  const daily=createForestDailyContextSession({storage,storageKey:storageKey+':daily',now});
  const reviewSession=createForestReflectionSpotlightSession({storage,
    storageKey:storageKey+':review-reactions',now});
  const budgetKey=storageKey+':budget',logKey=storageKey+':log';
  function record(item){
    const existing=readJson(storage,logKey,[]);
    const entries=Array.isArray(existing)?existing.slice(-299):[];
    entries.push({at:now(),protocolRevision:FOREST_DIALOGUE_PROTOCOL,
      ...(activeCharacterProfile?{profileRevision:activeCharacterProfile.revision,
        profileVersion:activeCharacterProfile.version,profileSchemaVersion:2}:{}),...item});
    try{storage?.setItem?.(logKey,JSON.stringify(entries))}catch{}
  }
  function reserve(){
    if(typeof storage?.getItem!=='function'||typeof storage?.setItem!=='function')return false;
    if(sessionCount>=sessionLimit)return false;
    // Cloudflare's free Neuron allowance resets at 00:00 UTC (09:00 JST).
    const day=new Date(now()).toISOString().slice(0,10);
    const previous=readJson(storage,budgetKey,{});
    const used=previous?.day===day?Number(previous.count)||0:0;
    if(used>=dailyLimit||previous.day===day&&previous.exhausted===true)return false;
    try{storage?.setItem?.(budgetKey,JSON.stringify({day,count:used+1}))}catch{
      // No durable quota => fail closed, not unlimited API calls.
      return false;
    }
    sessionCount++;
    return true;
  }
  async function request(characterId,mode,npcLine,chosenLabel='',closing=false,topic=null,
    sourceKind='',reviewSpotlight=null,{handoffTo=''}={}){
    if(!reserve())return null;
    const previousLogs=readJson(storage,logKey,[]);
    const recentLines=(Array.isArray(previousLogs)?previousLogs:[]).filter(entry=>entry?.characterId===characterId&&
      ['generated-opening','generated-reply'].includes(entry.event)&&typeof entry.text==='string')
      .slice(-3).map(entry=>clean(entry.text).slice(0,90));
    const context=promptFor({characterId,mode,chosenLabel,history,closing,topic,
      characterProfile:activeCharacterProfile,sourceKind,
      dailyContext:reviewSpotlight||sourceKind==='review-reaction'?null:activeDaily,situation:activeSituation,
      recentLines,reviewSpotlight,twinNames,handoffTo,
      repliesLeft:closing?0:Math.max(0,Math.min(maxReplies,sessionLimit-1)-repliesThisSession-(mode==='reply'?1:0))});
    const controller=createAbortController(),startedAt=now();
    inflight={controller,characterId,mode,startedAt};
    let timeout,timedOut=false;
    try{
      const raw=await Promise.race([Promise.resolve().then(()=>generate(context,{signal:controller.signal})),
        new Promise((_,reject)=>{timeout=scheduleTimeout(()=>{
          timedOut=true;controller.abort();reject(Error('timeout'));
        },Math.max(1,Math.min(11000,Number(requestTimeoutMs)||11000)))})]);
      const result=validateLiveForestOutput(raw,{characterId,
        requireLine:mode!=='choices',closing,context:context.context});
      if(controller.signal.aborted)return null;
      if(!result)record({event:'invalid-generation',characterId,mode,
        reason:'invalid-response',modelId,promptVersion:PROMPT_VERSION});
      return result?{...result,elapsedMs:Math.max(0,now()-startedAt)}:null;
    }catch(error){
      if(/quota reached|neurons.*exceeded|daily free allocation/iu.test(String(error?.message||''))){
        const day=new Date(now()).toISOString().slice(0,10);
        const previous=readJson(storage,budgetKey,{});
        try{storage?.setItem?.(budgetKey,JSON.stringify({day,
          count:previous.day===day?Number(previous.count)||1:1,exhausted:true}))}catch{}
      }
      // Timeouts abort the fetch as well, but unlike user cancellation they
      // must remain visible in diagnosis and exported causal history.
      if(timedOut||!controller.signal.aborted)record({event:'generation-failed',characterId,mode,
        reason:timedOut?'timeout':generationErrorKind(error),modelId,
        promptVersion:PROMPT_VERSION,elapsedMs:Math.max(0,now()-startedAt)});
      return null;
    }finally{cancelTimeout(timeout);if(inflight?.controller===controller)inflight=null}
  }
  function present(result,choices,closing=false,source=pending){
    if(!result.turns)return {...(result.delivery?{delivery:result.delivery}:{}),text:result.text,choices,
      ...(closing?{conversationComplete:true}:{})};
    const [first,second]=result.turns;
    queuedFrame={characterId:'twins',source,
      result:twinDialogueFrame(second,twinNames,{choices,closing})};
    return twinDialogueFrame(first,twinNames,{next:second});
  }
  const historyLine=result=>result.turns?{turns:result.turns}:
    {npc:result.delivery?result.text:clean(result.text).slice(0,150),
      ...(result.delivery?{delivery:result.delivery}:{})};
  function decorate(characterId,result,meta={}){
    const {text,labels}=result;
    const relay=result.endings?null:meta.relayChoice;
    const choices=labels.slice(0,relay?1:2).map((label,i)=>({id:`ai-${++serial}-${i}`,label}));
    if(relay)choices.push({id:relay.id,label:relay.label,relayTo:relay.relayTo});
    pending={characterId,text,choices,endings:result.endings,...meta,relayChoice:relay};
    return present(result,choices,choices.length===0);
  }
  function finish(characterId){
    const text=safeEnd(characterId);
    return {text,choices:[],conversationComplete:true,
      ...(twinNames&&MULTI_SPEAKER.has(characterId)?{mode:'twins',speakerName:encounterDisplayed?twinNames.secondName:'ふたご',speakerSlot:encounterDisplayed?2:0}:{})};
  }
  async function sourceStillAllowed({reviewEvidence,sourceMemoryId,dailySourceMemoryId}){
    try{
      if(reviewEvidence){
        const reflections=getCurrentReflection
          ?[await getCurrentReflection(reviewEvidence.sourceBookId,reviewEvidence.sourceReflectionId)].filter(Boolean)
          :reviewEvidence.kind==='reading-memory'
            ?await getArchivedReflections([reviewEvidence.sourceBookId],forestReflectionArchiveCutoff(now()))
            :await getRecentReflections();
        return isCurrentForestReflection(reviewEvidence,{books:await getBooks(),reflections});
      }
      const memoryId=sourceMemoryId||dailySourceMemoryId;
      if(memoryId)return unlockedStoryMemories(await getBooks(),await getCatalog())
        .some(memory=>memory.id===memoryId);
      return true;
    }catch{return false}
  }
  function scripted(result,characterId){
    pendingScripted=result?.choices?.length?{characterId,choices:result.choices}:null;
    return result&&!result.autoNext&&!result.choices?.length?{...result,conversationComplete:true}:result;
  }
  async function start(identity){
    const generation=++epoch;
    closed=false;pending=null;pendingScripted=null;history=[];sessionCount=0;
    twinNames=null;queuedFrame=null;
    repliesThisSession=0;fallbackTurns=0;
    displayedTopicKey='';encounterDisplayed=false;
    activeCharacterProfile=null;
    activeDaily=null;activeDailyInput=null;activeOriginal=null;activeTopic=null;activeSituation=null;
    let spotlight=null;
    const characterId=identity?.characterId;
    if(CHARACTERS.has(characterId)){
      let profile=null;
      try{profile=validForestCharacterProfiles(await getCharacterProfiles())
        .find(row=>row.id===characterId)||null}catch{}
      if(closed||generation!==epoch)return null;
      activeCharacterProfile=profile;
    }
    if(MULTI_SPEAKER.has(characterId)){
      let names;
      try{names=await base.twinNames?.()}catch{}
      if(closed||generation!==epoch)return null;
      if(!names||!activeCharacterProfile){
        const fallback=await base.start(identity);
        return closed||generation!==epoch?null:scripted(fallback,characterId);
      }
      twinNames=names;
    }
    const original=await base.start({...identity,generation:true});
    if(closed||generation!==epoch)return null;
    activeOriginal=original;
    activeSituation=original?.situation||null;
    // The local director chooses the scene independently of fallback scripts.
    // Fresh review events occupy only ambient slots; first encounters, stories
    // and relays keep their intended topic without a global override.
    const canReact=original&&CHARACTERS.has(characterId)&&
      original.sourceKind==='ambient'&&
      (!requireCharacterProfile||activeCharacterProfile);
    let books=[],catalog=[],cues=[];
    try{
      [books,catalog,cues]=await Promise.all([
        getBooks(),getCatalog(),getCues()]);
      if(closed||generation!==epoch)return null;
    }catch{
      // The approved script remains usable without optional topic metadata.
      books=[];catalog=[];cues=[];
    }
    if(canReact){
      try{
        const reflections=await getRecentReflections();
        if(closed||generation!==epoch)return null;
        spotlight=reviewSession.choose({characterId,books,catalog,cues,reflections});
      }catch{spotlight=null}
    }
    if(!spotlight&&(canReact||original?.sourceKind==='story'&&
      (!requireCharacterProfile||activeCharacterProfile))){
      try{
        const input={characterId,books,catalog,cues,sourceMemoryId:original.sourceMemoryId};
        const archiveBooks=reviewSession.archiveBooks(input);
        if(archiveBooks.length){
          const reflections=await getArchivedReflections(archiveBooks.map(book=>book.id),
            forestReflectionArchiveCutoff(now()));
          spotlight=reviewSession.choose({...input,reflections,archiveBooks});
        }
      }catch{spotlight=null}
      if(closed||generation!==epoch)return null;
    }
    if(original&&identity?.characterId){
      try{
        // The base director owns story vs ambient priority. Ambient generation
        // deliberately has no second, independent story selector. Daily state
        // still supplies visits, relations and the previous offered choice.
        activeDailyInput={books,
          catalog:original.situation&&original.sourceKind==='ambient'?[]:catalog,
          cues,sourceKind:spotlight?'reflection':original.sourceKind,
          sourceMemoryId:original.sourceMemoryId};
        activeDaily=daily.visit(characterId,{...activeDailyInput,commit:false});
      }catch{activeDailyInput={};activeDaily=daily.visit(characterId,{commit:false})}
    }
    // The source cue is a prompt reference, not a model-generated NPC line.
    // Especially a reflection cue may contain a 45-char excerpt and be longer
    // than the 90-char output limit. Validate outputs, not approved inputs.
    if(!original||!CHARACTERS.has(characterId)||
      !clean(original.text)||clean(original.text).length>350)
      return scripted(original,characterId);
    // Never swap an approved line for a generic LLM character when private
    // personality material has not loaded in a real owner session.
    if((requireCharacterProfile||ACTION_WRITING_IDS.has(characterId))&&!activeCharacterProfile){
      record({event:'script-fallback',characterId,reason:'missing-character-profile',
        sourceKind:original.sourceKind||'unknown',promptVersion:PROMPT_VERSION});
      return scripted(original,characterId);
    }
    // Approved script text is reserved for explicit fallback; it is never model context.
    if(startDelayMs>0)await new Promise(resolve=>setTimeout(resolve,startDelayMs));
    if(closed||generation!==epoch)return null;
    const source=activeDaily?.scene;
    const sourceKind=spotlight?'review-reaction':original.sourceKind||'ambient';
    const sourceMemory=original.sourceMemoryId?
      unlockedStoryMemories(books,catalog).find(item=>item.id===original.sourceMemoryId):null;
    // A recalled episode must come from a currently read book, never an
    // unrelated ambient seed or a non-authorized story.
    const topic=!spotlight&&sourceMemory?
      {fact:clean(sourceMemory.text).slice(0,240),
        bookTitle:clean(books.find(book=>book.id===sourceMemory.bookId)?.title).slice(0,80)}:null;
    if(original.sourceMemoryId&&!sourceMemory)return scripted({text:safeEnd(characterId),choices:[]},characterId);
    activeTopic=topic;
    const mode='opening';
    const result=await request(characterId,mode,
      spotlight?'最近の本の感想を聞いた。':original.text,'',false,topic,
      sourceKind,spotlight);
    const allowed=!spotlight||!getCurrentReflection||await sourceStillAllowed({reviewEvidence:spotlight});
    if(closed||generation!==epoch)return null;
    if(!allowed)return finish(characterId);
    if(!result){
      record({event:'script-fallback',characterId,reason:'generation-unavailable',
        sourceKind,promptVersion:PROMPT_VERSION});
      return twinNames?finish(characterId):scripted(original,characterId);
    }
    const {text,delivery}=result;
    history.push(historyLine(result));
    record({event:'generated-opening',characterId,
      // Generated review lines may quote the child's words: never persist them
      // in the diagnostic history. The live conversation itself stays in memory.
      ...(spotlight||sourceKind==='reflection'?{}:{text,choices:result.labels,...(delivery?{delivery}:{})}),
      dailyTopicKind:spotlight?'reflection':sourceKind==='ambient'?source?.kind||'ambient':sourceKind,
      sourceKind,
      modelId,promptVersion:PROMPT_VERSION,elapsedMs:result.elapsedMs});
    const relayChoice=spotlight?null:original.choices?.find(choice=>choice.relayTo&&
      typeof choice.id==='string'&&typeof choice.label==='string')||null;
    return decorate(characterId,result,{
      sourceKind,
      sourceMemoryId:spotlight?'':original.sourceMemoryId||'',
      relayChoice,
      ...(spotlight?{reviewSpotlightKey:spotlight.key,reviewEvidence:spotlight}:{}),
      ...(!spotlight&&sourceKind==='ambient'&&source?.evidence==='reviewed'?
        {dailySourceMemoryId:source.memoryId}:{})});
  }
  async function select({characterId,choiceId}={}){
    const generation=epoch;
    if(queuedFrame)return null;
    const current=pending;
    if(!current||current.characterId!==characterId||
      !current.choices.some(choice=>choice.id===choiceId)){
      const selected=pendingScripted?.characterId===characterId?
        pendingScripted.choices.find(choice=>choice.id===choiceId):null;
      if(selected&&characterId!=='twins'&&++fallbackTurns>=maxReplies){
        pendingScripted=null;return {text:safeEnd(characterId),choices:[],conversationComplete:true};
      }
      const original=await base.select({characterId,choiceId});
      if(selected&&original)daily.selected(characterId,selected.label);
      return original?scripted(original,characterId):{text:safeEnd(characterId),choices:[],conversationComplete:true};
    }
    pending=null;
    const chosenIndex=current.choices.findIndex(choice=>choice.id===choiceId);
    const {label}=current.choices[chosenIndex];
    const allowed=await sourceStillAllowed(current);
    if(closed||generation!==epoch)return null;
    if(!allowed)return finish(characterId);
    if(current.sourceKind!=='review-reaction')daily.selected(characterId,label);
    const scriptedRelay=current.relayChoice?.id===choiceId;
    if(scriptedRelay){
      // Preserve the local one-time relay state, but never display the
      // authored hand-off sentence unless the model fails.
      const authored=await base.select({characterId,choiceId});
      if(closed||generation!==epoch)return null;
      history.push({playerChoice:label});history=history.slice(-4);
      const generated=await request(characterId,'reply',current.text,label,true,activeTopic,
        current.sourceKind,null,{handoffTo:current.relayChoice.relayTo});
      if(closed||generation!==epoch)return null;
      if(!generated){
        record({event:'script-fallback',characterId,reason:'relay-generation-unavailable',
          sourceKind:current.sourceKind,promptVersion:PROMPT_VERSION});
        return !twinNames&&authored?.text?scripted(authored,characterId):finish(characterId);
      }
      record({event:'generated-reply',characterId,
        ...(current.sourceKind==='reflection'?{}:{text:generated.text}),
        closing:true,mode:'relay',modelId,promptVersion:PROMPT_VERSION,
        elapsedMs:generated.elapsedMs,turn:1});
      return present(generated,[],true,current);
    }
    history.push({playerChoice:label});history=history.slice(-4);
    record({event:'selected-offered-choice',characterId,
      ...(['review-reaction','reflection'].includes(current.sourceKind)?{}:{label})});
    const ending=current.endings?.[chosenIndex];
    const closing=Boolean(ending)||repliesThisSession+1>=maxReplies||sessionCount+1>=sessionLimit||
      /^(?:またね|ばいばい|バイバイ|帰る|かえる|おしまい|また今度)[。！!]*$/u.test(label);
    const topic=activeTopic;
    const generated=ending?{text:ending.outcome,delivery:ending.delivery}:
      await request(characterId,'reply',current.text,label,closing,topic,current.sourceKind,current.reviewEvidence||null);
    const stillAllowed=ending||!current.reviewEvidence||!getCurrentReflection||await sourceStillAllowed(current);
    if(closed||generation!==epoch)return null;
    if(!stillAllowed)return finish(characterId);
    if(!generated){
      // These are newly generated CHILD choices. They do not identify an
      // authored continuation: switching to another script would discard the
      // child's intent and can introduce an unrelated story as if it happened.
      record({event:'script-fallback',characterId,reason:'generation-unavailable',
        sourceKind:current.sourceKind,promptVersion:PROMPT_VERSION});
      return finish(characterId);
    }
    history.push(historyLine(generated));history=history.slice(-4);
    repliesThisSession++;
    record({event:'generated-reply',characterId,
      ...(['review-reaction','reflection'].includes(current.sourceKind)?{}:
        {text:generated.text,choices:closing?[]:generated.labels,
          ...(generated.delivery?{delivery:generated.delivery}:{})}),
      dailyTopicKind:current.sourceKind==='review-reaction'?'reflection':
        activeDaily?.scene?.kind||'ambient',
      closing,modelId,promptVersion:PROMPT_VERSION,
      elapsedMs:generated.elapsedMs,turn:repliesThisSession});
    if(ending?.speakerSlot)return twinDialogueFrame({speakerSlot:ending.speakerSlot,text:generated.text},twinNames,{closing:true});
    if(closing)return present(generated,[],true,current);
    return decorate(characterId,generated,{
      sourceKind:current.sourceKind,
      sourceMemoryId:current.sourceMemoryId,
      dailySourceMemoryId:current.dailySourceMemoryId,
      reviewSpotlightKey:current.reviewSpotlightKey,
      reviewEvidence:current.reviewEvidence});
  }
  return {
    start,select,
    onDisplayed(result,identity){
      // A greeting that failed before either twin spoke is still a first
      // encounter on the next visit. No names or story were presented.
      if(twinNames&&!encounterDisplayed&&!result?.autoNext)return;
      if(!encounterDisplayed&&typeof result?.text==='string'){
        encounterDisplayed=true;
        if(twinNames)base.pinTwinNames?.(twinNames);
        base.onDisplayed?.(activeOriginal,identity);
        if(activeDailyInput)daily.visit(identity?.characterId,activeDailyInput);
        reviewSession.visited();
      }
      if(pending?.reviewSpotlightKey&&pending.characterId===identity?.characterId&&
        (result?.text===pending.text||result?.mode==='twins'&&!result.autoNext)){
        reviewSession.displayed(identity.characterId,pending.reviewEvidence);
        pending.reviewSpotlightKey='';
        record({event:'reflection-reaction-displayed',characterId:identity.characterId,
          reflectionKind:pending.reviewEvidence?.kind||'recent',promptVersion:PROMPT_VERSION});
      }
      if(pending?.sourceKind!=='ambient')return;
      const scene=activeDaily?.scene;
      if(scene?.evidence!=='reviewed'||!pending||
        pending.characterId!==identity?.characterId||
        (result?.text!==pending.text&&(result?.mode!=='twins'||result.autoNext))||displayedTopicKey===scene.id)return;
      displayedTopicKey=scene.id;
      record({event:'daily-topic-displayed',characterId:identity.characterId,
        topicKey:scene.id,kind:scene.kind,promptVersion:PROMPT_VERSION});
    },
    async advance(identity){
      const frame=queuedFrame;
      if(!frame||frame.characterId!==identity?.characterId)return base.advance?.(identity)||null;
      queuedFrame=null;
      const generation=epoch;
      const allowed=!frame.source||await sourceStillAllowed(frame.source);
      if(closed||generation!==epoch)return null;
      if(!allowed){pending=null;return finish(frame.characterId)}
      return frame.result;
    },
    end(){
      epoch++;closed=true;pending=null;pendingScripted=null;history=[];queuedFrame=null;twinNames=null;
      activeCharacterProfile=null;
      activeDaily=null;
      if(inflight&&!inflight.controller.signal.aborted){
        record({event:'cancel-requested',characterId:inflight.characterId,mode:inflight.mode,
          modelId,promptVersion:PROMPT_VERSION,elapsedMs:Math.max(0,now()-inflight.startedAt)});
        inflight.controller.abort();
      }
      base.end?.();
    },
    getProgress(){return {...(base.getProgress?.()||{}),aiRequestsThisSession:sessionCount,
      aiRepliesThisSession:repliesThisSession}}
  };
}
