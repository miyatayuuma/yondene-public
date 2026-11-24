import {FOREST_CHARACTER_IDS,
  FOREST_ACTION_WRITING_IDS,FOREST_MULTI_SPEAKER_IDS,FOREST_DIALOGUE_PROTOCOL,FOREST_DISPLAY_NAMES,canonicalForestMention} from './forest-character-registry.mjs';
import {validateTwinTurns,twinDialogueFrame} from './book-forest-twins.mjs';
import {forestEndingChoices,forestEndingNeedsReply,forestUnsupportedAction,forestMisattributesReviewTitle} from './book-forest-ending.mjs';
import {unsafeForestForaging} from './book-forest-output-safety.mjs';
import {isCurrentForestReflection,forestReflectionArchiveCutoff} from './book-forest-reflection-spotlight.mjs';
import {validateForestWrittenTurn} from './book-forest-gesture.mjs';
import {createForestTopics} from './book-forest-topics.mjs';
import {unlockedStoryMemories} from './book-forest-story-memory.mjs';
import {forestCharacterVoiceGuide,validForestCharacterProfiles} from './book-forest-character-profiles.mjs';
const CHARACTERS=new Set(FOREST_CHARACTER_IDS);
const MULTI_SPEAKER=new Set(FOREST_MULTI_SPEAKER_IDS);
const ACTION_WRITING_IDS=new Set(FOREST_ACTION_WRITING_IDS);
const FOREST_AMBIENT_FOCUS=[
  '葉や枝が風で鳴る音',
  '木もれ日で地面の色が変わること',
  '森で足もとの小さな変化に気づくこと',
  '相手がいると見え方が変わる、いつもの景色',
  '夕方の森で音や色が変わること',
  '足を止めると気づく、森の小さな不思議'
];
function ambientFocus(characterId,visitNumber){
  const offset=[...characterId].reduce((sum,ch)=>sum+ch.charCodeAt(0),0);
  return FOREST_AMBIENT_FOCUS[(offset+visitNumber-1)%FOREST_AMBIENT_FOCUS.length];
}
const safeEnd=id=>ACTION_WRITING_IDS.has(id)?
  '（ねこはしっぽをゆっくりふった。）':'また森で会おうね。';
export const FOREST_PROMPT_VERSION='forest-scene-generation-v42-profile2';
const PROMPT_VERSION=FOREST_PROMPT_VERSION;
const clean=value=>typeof value==='string'?value.trim().replace(/\s+/gu,' '):'';
// Older stored relays can contain the sender's instruction around the quote.
function relayPayload(text){
  if(!text)return '';
  const quoted=/[「『]([^」』]+)[」』][ 　]*(?:って|と)[、 　]*(?:伝え|つたえ)/u.exec(text);
  const indirect=/(?:^|[。！？!?])([^。！？!?]+?)って[、 　]*(?:伝え|つたえ)/u.exec(text);
  const standalone=/^[「『]([^」』]+)[」』]$/u.exec(text.trim());
  return (quoted?.[1]??indirect?.[1]??standalone?.[1]??text).trim();
}

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
  const name=FOREST_DISPLAY_NAMES[characterId];
  if(name&&new RegExp('(?:^|[。！？、「『\\s])'+name+'[はが]').test(line))return false;
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
  if(multi&&!turns||gesture&&(!written||context.handoffTo&&written.delivery!=='written')||!multi&&!gesture&&requireLine&&!validLine(characterId,text))return null;
  const lastChoices=!closing&&context.repliesLeft===1;
  const safetyInput=written?{...data,text:written.text}:data;
  const lines=turns?turns.map(turn=>turn.text):[safetyInput.text];
  if(lines.some(line=>forestUnsupportedAction(line,context)||forestMisattributesReviewTitle(line,context)))return null;
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
    if(label.length<2||label.length>24||/[\r\n{}<>「」]/u.test(label)||byLabel.has(label)||
      forestUnsupportedAction(label,context)||forestMisattributesReviewTitle(label,context))continue;
    byLabel.set(label,true);
  }
  const labels=[...byLabel.keys()].slice(0,2);
  // Keep a valid NPC line playable if the model returned unusable buttons.
  if(!labels.length||!requireLine&&labels.length<2){
    if(!requireLine)return null;
    return {...line,labels:gesture?['もうすこしみる','またね']:['もう少し聞く','またね']};
  }
  return {...line,text:requireLine?line.text:null,labels};
}

export function promptFor({characterId,mode,chosenLabel='',history=[],closing=false,topic=null,
  characterProfile=null,sourceKind='',today=null,recentLines=[],reviewSpotlight=null,situation=null,twinNames=null,repliesLeft=closing?0:2,handoffTo='',relayMessage=''}){
  const guide=forestCharacterVoiceGuide(characterProfile);
  const npc={id:characterId,displayName:FOREST_DISPLAY_NAMES[characterId],voice:guide,profileSchemaVersion:2,
    profileRevision:guide?characterProfile.revision:'',profileVersion:guide?characterProfile.version:''};
  // Personhood is always loaded from the same private Sheets as other NPCs.
  // Only the response format differs; this code has no cat personality text.
  const nonverbal=ACTION_WRITING_IDS.has(characterId);
  // Existing Worker protocol requires a string field; keep it empty rather than
  // sending a completed script as a model-generation anchor.
  const visit=situation?.visitNumber;
  const focus=!reviewSpotlight&&!topic&&['meet','ambient'].includes(sourceKind)&&Number.isSafeInteger(visit)&&visit>0
    ?ambientFocus(characterId,visit):'';
  const context={npcLine:'',sourceKind,repliesLeft,npcDisplayNames:FOREST_DISPLAY_NAMES,
    ...(focus?{ambientFocus:focus}:{}),
    ...(twinNames?{speakers:[{slot:1,name:twinNames.firstName},{slot:2,name:twinNames.secondName}]}:{}),
    ...(handoffTo?{handoffTo:FOREST_DISPLAY_NAMES[handoffTo]}:{}),
    ...(sourceKind==='relay'&&relayMessage?{relayMessage:relayPayload(relayMessage),
      ...(FOREST_DISPLAY_NAMES[situation?.fromNpc]?{relayFrom:FOREST_DISPLAY_NAMES[situation.fromNpc]}:{})}:{}),
    chosenLabel:clean(chosenLabel).slice(0,24),...(situation?{situation}:{}),
    recentTurns:history.slice(-4),...(topic?{topic}:{}),
    ...(reviewSpotlight?{readerReflection:Object.fromEntries(
      Object.entries(reviewSpotlight).filter(([key])=>!['key','bookKey','sourceBookId','sourceReflectionId'].includes(key)))}:{}),
    ...(today?{today}:{}),
    ...(recentLines.length?{avoidRecentLines:recentLines.slice(-3)}:{})};
  const endingShape={label:'子どもの一言',outcome:'その一言に対するNPC本人の答え。質問はしない',
    ...(twinNames?{speakerSlot:1}:{}),...(nonverbal?{delivery:'written'}:{})};
  const finishTask=handoffTo?
    '相手に届く一言を伝言本文として書く。宛先や子どもへの伝達依頼は書かない':
    '選ばれた問いや行動に具体的に応え、この返事だけでひと区切りつける';
  const firstLineTask={
    meet:'この相手とは初対面。以前話したふりをせず、キャラ自身の関心から自然な第一声と返答候補2つを作る',
    story:'このキャラが関わる確認済みの物語を過去の記憶として振り返り、本人らしい第一声と返答候補2つを作る。今の森で原作の場面が進行中であるように再演しない',
    reflection:'台帳が示す読書感想を取り上げ、原文と保護者の要約を区別しながら本人らしく反応する',
    relay:relayMessage?'子どもが届けた伝言の具体的な中身に、その人物の立場から答え、返答候補2つを作る':
      '前のキャラからの話題の引き継ぎ。会話を直接聞いたふりをせず、自然な第一声と返答候補2つを作る',
    ambient:'キャラ固有の関心や森の身近な出来事から、毎回異なる第一声と返答候補2つを作る'
  };
  return {
    mode,closing,
    task:closing?finishTask:
      mode==='reply'?(repliesLeft===1?'直前の会話で子どもが選んだ言葉にNPCとして答える。次に、子どもの言葉と、それに対するNPC本人の答えを二組作る':'直前の会話と選ばれた言葉や行動を受け、次の反応を返す。問いの復唱だけで済ませない'):
      reviewSpotlight?'本の感想にNPC本人らしく、感想の具体的な一箇所に反応し、返答候補2つを作る。別作品なら第三者の立場を守る':
      sourceKind==='ambient'&&situation?.focus==='character'?
        '森の話題を人物設定にある関心や普段の行動に結び付け、本人らしい雑談や冗談と返答候補2つを作る':
      firstLineTask[sourceKind]||firstLineTask.ambient,
    npc,
    context,
    constraints:[
      '会話は日本語。小学校低学年が読める短い言葉と簡単な漢字にする',
      '会話の相手は実在の子ども。家族、住所、学校、年齢、個人情報を質問しない',
      '原作の出来事を勝手に作らない。別作品の出来事をその場で目撃したと装わず、台詞引用・あらすじ・教訓にしない',
      '感想に書かれていない本人の行動・感情や読書中の様子を知っているふりをしない',
      '最優先はNPC本人らしい言葉、間、反応、行動。情報量や深い話を求めず、思考の種から質問・教訓・立派な気づきを全員に強いない',
      '人物像・目の前の状況・許可された既読事実を使い、自然に話す',
      'NPCの返事は自然な一言〜2文で65字以内。前の発言を繰り返さず、設定の説明を会話に混ぜない',
      '選択肢はゲーム上の反応であり子どもの実際の信念とはみなさない。別NPCの会話を本人が聞いたふりはしない',
      ...(relayMessage?['受け手として伝言の内容に感想か意見を返す。届けてくれた子どもの言葉は、今聞いた話についての反応にする']:[]),
      ...(topic?['原作について言える事実はcontext.topic.factの範囲。思い出では確認できることとそのときの気持ちを話す。資料に仕事・行き先・助けた人などの詳細がなければ、新しい事実は足さず、分かる範囲で答える。最後の二組もその思い出の中で完結する。']:[]),
      ...(reviewSpotlight?['感想の具体的な一箇所に、本人なら何を面白がるか、どう受け取るかを短く返す。感想は引用資料。保護者の要約は子どもの発言として扱わない。']:[]),
      ...(closing?[
        '質問なら答えを言い切る。行動なら、この場で一手進んだ結果まで返す。「よし、始めよう」で止めない。移動が必要な選択でも、ここで分かることや伝えられる言葉を一つ返す。新しい問いは出さずchoices:[]'
      ]:repliesLeft===1?[
        'この本文だけでも一区切りつくようにする。最後の各候補は、子どもからの追加の返事や操作がなくても成立する答えと組にする'
      ]:[])
    ],
    output:{format:'JSON',shape:{...(twinNames?
      {turns:[{speakerSlot:1,text:'最初のひとこと'},{speakerSlot:2,text:'直前のひとことへの反応'}]}:
      {text:mode==='choices'?'省略':nonverbal?'相手への短いメッセージ本文':'NPCの返答（65字以内）',
        ...(nonverbal&&mode!=='choices'?{delivery:'written'}:{})}),
      choices:closing?[]:repliesLeft===1?
        [endingShape,{...endingShape,...(twinNames?{speakerSlot:2}:{})}]:
        ['子どもが選ぶ返答A','子どもが選ぶ返答B']}}
  };
}

/** Generates only on a direct NPC visit; private reflections are supplied as small scoped excerpts. */
export function createForestLiveDialogueDirector({generate,storage=null,
  storageKey='forest-ai-local-v1',encounterKey=storageKey+':encounters',
  now=()=>Date.now(),dailyLimit=300,sessionLimit=3,maxReplies=2,startDelayMs=280,
  modelId='unknown',getBooks=()=>[],getCatalog=()=>[],getTwinNames=()=>[],
  getCharacterProfiles=()=>[],getRecentReflections=async()=>[],getArchivedReflections=async()=>[],
  getCurrentReflection=null,requestTimeoutMs=11000,
  createAbortController=()=>new AbortController(),
  scheduleTimeout=globalThis.setTimeout,cancelTimeout=globalThis.clearTimeout}={}){
  const topics=createForestTopics({storage,encounterKey,reviewKey:storageKey+':review-reactions',now,
    getBooks,getCatalog,getTwinNames,getRecentReflections,getArchivedReflections});
  let pending=null,history=[],sessionCount=0,repliesThisSession=0,serial=0,closed=false,epoch=0;
  let inflight=null,activeCharacterProfile=null,activeTopic=null,scene=null;
  let encounterDisplayed=false,openingFrame=null,twinNames=null,queuedFrame=null;
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
  async function request(characterId,mode,chosenLabel='',closing=false,topic=null,
    sourceKind='',reviewSpotlight=null,{handoffTo=''}={}){
    if(!reserve())return null;
    const previousLogs=readJson(storage,logKey,[]);
    const recentLines=(Array.isArray(previousLogs)?previousLogs:[]).filter(entry=>entry?.characterId===characterId&&
      ['meet','ambient'].includes(entry.sourceKind)&&typeof entry.text==='string')
      .slice(-3).map(entry=>clean(entry.text).slice(0,90));
    const context=promptFor({characterId,mode,chosenLabel,history,closing,topic,
      characterProfile:activeCharacterProfile,sourceKind,
      today:scene?.today,situation:scene?.situation,
      recentLines,reviewSpotlight,twinNames,handoffTo,relayMessage:scene?.relay?.message,
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
    pending={characterId,text,delivery:result.delivery,choices,endings:result.endings,...meta,relayChoice:relay};
    return present(result,choices,choices.length===0);
  }
  function finish(characterId){
    const text=safeEnd(characterId);
    return {text,choices:[],conversationComplete:true,
      ...(twinNames&&MULTI_SPEAKER.has(characterId)?{mode:'twins',speakerName:encounterDisplayed?twinNames.secondName:'ふたご',speakerSlot:encounterDisplayed?2:0}:{})};
  }
  async function sourceStillAllowed({reviewEvidence,sourceMemoryId}){
    try{
      if(reviewEvidence){
        const reflections=getCurrentReflection
          ?[await getCurrentReflection(reviewEvidence.sourceBookId,reviewEvidence.sourceReflectionId)].filter(Boolean)
          :reviewEvidence.kind==='reading-memory'
            ?await getArchivedReflections([reviewEvidence.sourceBookId],forestReflectionArchiveCutoff(now()))
            :await getRecentReflections();
        return isCurrentForestReflection(reviewEvidence,{books:await getBooks(),reflections});
      }
      if(sourceMemoryId)return unlockedStoryMemories(await getBooks(),await getCatalog())
        .some(memory=>memory.id===sourceMemoryId);
      return true;
    }catch{return false}
  }
  async function start({characterId,preferredMemoryId}={}){
    const generation=++epoch;
    inflight?.controller.abort();
    closed=false;pending=null;history=[];sessionCount=0;repliesThisSession=0;
    twinNames=null;queuedFrame=null;encounterDisplayed=false;openingFrame=null;
    activeCharacterProfile=null;activeTopic=null;scene=null;
    const current=()=>!closed&&generation===epoch;
    if(!CHARACTERS.has(characterId))return finish(characterId);
    let profile,names,selected;
    try{
      profile=validForestCharacterProfiles(await getCharacterProfiles()).find(row=>row.id===characterId);
      if(MULTI_SPEAKER.has(characterId))names=await topics.twinNames();
      if(typeof generate==='function'&&profile&&(!MULTI_SPEAKER.has(characterId)||names))
        selected=await topics.choose(characterId,preferredMemoryId);
    }catch{}
    if(!current())return null;
    if(!selected){
      record({event:'conversation-unavailable',characterId,reason:!profile?'missing-character-profile':
        MULTI_SPEAKER.has(characterId)&&!names?'missing-speaker-names':'source-unavailable'});
      return finish(characterId);
    }
    activeCharacterProfile=profile;
    twinNames=names;
    scene=selected;
    const {kind:sourceKind,memory,review,relay,relayTo,bookTitle}=scene;
    const sourceMemoryId=relay?.memoryId||memory?.id||'';
    const evidence={sourceMemoryId,reviewEvidence:review};
    activeTopic=memory?{fact:clean(memory.text).slice(0,240),bookTitle:clean(bookTitle).slice(0,80)}:null;
    if(startDelayMs>0)await new Promise(resolve=>setTimeout(resolve,startDelayMs));
    if(!current())return null;
    const sourceAllowed=await sourceStillAllowed(evidence);
    if(!current())return null;
    if(!sourceAllowed)return finish(characterId);
    const result=await request(characterId,'opening','',false,activeTopic,sourceKind,review);
    const stillAllowed=result&&await sourceStillAllowed(evidence);
    if(!current())return null;
    if(!stillAllowed){
      record({event:'conversation-unavailable',characterId,reason:result?'source-withdrawn':'generation-unavailable',
        sourceKind,promptVersion:PROMPT_VERSION});
      return finish(characterId);
    }
    history.push(historyLine(result));
    record({event:'generated-opening',characterId,
      ...(review?{}:{text:result.text,choices:result.labels,...(result.delivery?{delivery:result.delivery}:{})}),
      sourceKind,modelId,promptVersion:PROMPT_VERSION,elapsedMs:result.elapsedMs});
    const relayChoice=relayTo?{id:'scene-relay',label:FOREST_DISPLAY_NAMES[relayTo]+'への伝言を聞く',relayTo}:null;
    openingFrame=decorate(characterId,result,{...evidence,sourceKind,relayChoice});
    return openingFrame;
  }
  async function select({characterId,choiceId}={}){
    const generation=epoch;
    if(queuedFrame)return null;
    const current=pending;
    if(!current||current.characterId!==characterId||
      !current.choices.some(choice=>choice.id===choiceId))return null;
    pending=null;
    const chosenIndex=current.choices.findIndex(choice=>choice.id===choiceId);
    const {label}=current.choices[chosenIndex];
    const allowed=await sourceStillAllowed(current);
    if(closed||generation!==epoch)return null;
    if(!allowed)return finish(characterId);
    if(current.relayChoice?.id===choiceId){
      history.push({playerChoice:label});history=history.slice(-4);
      const to=current.relayChoice.relayTo;
      const generated=await request(characterId,'reply',label,true,activeTopic,
        current.sourceKind,null,{handoffTo:to});
      const stillAllowed=generated&&await sourceStillAllowed(current);
      if(closed||generation!==epoch)return null;
      if(!stillAllowed)return finish(characterId);
      const message=relayPayload(generated.turns?.at(-1)?.text||generated.text);
      if(!message||forestUnsupportedAction(message)||/(?:預け|あずけ)ておこう/u.test(message.replace(/[ 　]/gu,'')))
        return finish(characterId);
      topics.relay({from:characterId,to,memoryId:current.sourceMemoryId,message});
      record({event:'generated-reply',characterId,sourceKind:'relay',closing:true,mode:'relay',
        modelId,promptVersion:PROMPT_VERSION,elapsedMs:generated.elapsedMs,turn:1});
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
      await request(characterId,'reply',label,closing,topic,current.sourceKind,current.reviewEvidence||null);
    const stillAllowed=ending||await sourceStillAllowed(current);
    if(closed||generation!==epoch)return null;
    if(!stillAllowed)return finish(characterId);
    if(!generated){
      record({event:'conversation-unavailable',characterId,reason:'generation-unavailable',
        sourceKind:current.sourceKind,promptVersion:PROMPT_VERSION});
      return finish(characterId);
    }
    history.push(historyLine(generated));history=history.slice(-4);
    repliesThisSession++;
    record({event:'generated-reply',characterId,
      ...(['review-reaction','reflection'].includes(current.sourceKind)?{}:
        {text:generated.text,choices:closing?[]:generated.labels,
          ...(generated.delivery?{delivery:generated.delivery}:{})}),
      sourceKind:current.sourceKind,
      closing,modelId,promptVersion:PROMPT_VERSION,
      elapsedMs:generated.elapsedMs,turn:repliesThisSession});
    if(ending?.speakerSlot)return twinDialogueFrame({speakerSlot:ending.speakerSlot,text:generated.text},twinNames,{closing:true});
    if(closing)return present(generated,[],true,current);
    return decorate(characterId,generated,{
      sourceKind:current.sourceKind,
      sourceMemoryId:current.sourceMemoryId,
      reviewEvidence:current.reviewEvidence});
  }
  return {
    start,select,
    onDisplayed(result,identity){
      if(encounterDisplayed||result!==openingFrame||scene?.characterId!==identity?.characterId)return;
      encounterDisplayed=true;
      topics.displayed(scene,twinNames);
      if(scene.review)record({event:'reflection-reaction-displayed',characterId:identity.characterId,
        reflectionKind:scene.review.kind||'recent',promptVersion:PROMPT_VERSION});
    },
    async advance(identity){
      const frame=queuedFrame;
      if(!frame||frame.characterId!==identity?.characterId)return null;
      queuedFrame=null;
      const generation=epoch;
      const allowed=!frame.source||await sourceStillAllowed(frame.source);
      if(closed||generation!==epoch)return null;
      if(!allowed){pending=null;return finish(frame.characterId)}
      return frame.result;
    },
    end(){
      epoch++;closed=true;pending=null;history=[];queuedFrame=null;twinNames=null;openingFrame=null;
      activeCharacterProfile=null;
      scene=null;
      if(inflight&&!inflight.controller.signal.aborted){
        record({event:'cancel-requested',characterId:inflight.characterId,mode:inflight.mode,
          modelId,promptVersion:PROMPT_VERSION,elapsedMs:Math.max(0,now()-inflight.startedAt)});
        inflight.controller.abort();
      }
    },
    getProgress(){return {...topics.getProgress(),aiRequestsThisSession:sessionCount,
      aiRepliesThisSession:repliesThisSession}}
  };
}
