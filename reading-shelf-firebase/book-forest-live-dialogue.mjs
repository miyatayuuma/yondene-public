// Optional, bounded runtime dialogue on top of approved local NPC scripts.
// The generator is injected: this module never holds a key or makes a network call.
import {createForestThoughtSession} from './book-forest-thought-seeds.mjs';
import {createForestDailyContextSession} from './book-forest-daily-context.mjs';
import {validateForestDialogueCues} from './book-forest-dialogue-director.mjs';
import {unlockedStoryMemories} from './book-forest-story-memory.mjs';
import {forestCharacterVoiceGuide,validForestCharacterProfiles} from './book-forest-character-profiles.mjs';
const CHARACTERS=new Set(['king','cat','kiki','jiji','skipper','zorori','ishishi','noshishi']);
const VOICES={
  king:'王さま。自分のことは「余」。大げさで好奇心があり、子どもを歓迎する。',
  cat:'王さまのねこ。人間の言葉は話さない。地の文で短い動作だけを書く。',
  kiki:'キキ。自分の経験を一人称で話し、率直で活発。自分を「キキは」と呼ばない。',
  jiji:'ジジ。気さくで少し皮肉屋だが、相手を傷つけない。',
  skipper:'スキッパー。無口で慎重。小さな発見を静かに観察する。',
  zorori:'ゾロリ。いたずら好きで得意げだが、子どもを怖がらせない。',
  ishishi:'イシシ。食べ物や面白いことに目がなく、おっちょこちょい。',
  noshishi:'ノシシ。のんびりしていて相棒との掛け合いが好き。'
};
const SELF_NAMES={king:'王さま',kiki:'キキ',jiji:'ジジ',skipper:'スキッパー',
  zorori:'ゾロリ',ishishi:'イシシ',noshishi:'ノシシ'};
const PROMPT_VERSION='forest-sourced-interaction-v10';
const GOODBYE={king:'続きはまた今度だ。達者でな！',kiki:'じゃあ、また森で会おうね！',
  jiji:'またね。気をつけて歩くんだよ。',skipper:'またいっしょに探検しよう！',
  zorori:'次はもっと面白い話をしてやるぜ！',ishishi:'じゃあな！また遊ぼうぜ！',
  noshishi:'またね。のんびり待ってるよ。'};
const clean=value=>typeof value==='string'?value.trim().replace(/\s+/gu,' '):'';
// These are unambiguous first-person declarations, not a requirement to repeat
// a catchphrase in every line. Profile-guided nuance is assessed separately.
const WRONG_FIRST_PERSON={
  king:['ぼく','僕','おれ','俺','わたし','私','あたし','おら'],
  kiki:['ぼく','僕','おれ','俺','おれさま','俺様','おら','余'],
  jiji:['わたし','私','あたし','おれ','俺','おれさま','俺様','おら','余'],
  skipper:['わたし','私','あたし','おれ','俺','おれさま','俺様','おら','余'],
  zorori:['ぼく','僕','わたし','私','あたし','おら','余'],
  ishishi:['ぼく','僕','わたし','私','あたし','おれ','俺','おれさま','俺様','余'],
  noshishi:['ぼく','僕','わたし','私','あたし','おれ','俺','おれさま','俺様','余']
};
function readJson(storage,key,fallback){
  try{return JSON.parse(storage?.getItem?.(key)||'null')||fallback}catch{return fallback}
}
function validLine(characterId,text){
  const line=clean(text);
  if(line.length<2||line.length>90||/[{}<>]/u.test(line))return false;
  // The non-speaking cat stays on approved hand-written action lines in v1.
  if(characterId==='cat')return false;
  const name=SELF_NAMES[characterId];
  if(name&&new RegExp('(?:^|[。！？、「『\\s])'+name+'[はが]').test(line))return false;
  if((WRONG_FIRST_PERSON[characterId]||[]).some(word=>
    new RegExp('(?:^|[。！？、「『\\s])'+word+'(?:は|も|が|の|、|って|なら)').test(line)))return false;
  if(characterId==='jiji'&&/(?:^|[。！？、])\s*そうね[。、]|みんな、元気を出して進みましょう/u.test(line))return false;
  if(characterId==='skipper'&&/(?:さあ[、！! ]*みんな|大冒険の始まりだ)/u.test(line))return false;
  return true;
}
export function validateLiveForestOutput(raw,{characterId,requireLine=false,closing=false}={}){
  let data=raw;
  if(typeof raw==='string')try{data=JSON.parse(raw)}catch{return null}
  if(!data||typeof data!=='object'||!CHARACTERS.has(characterId))return null;
  const text=clean(data.text);
  if(requireLine&&!validLine(characterId,text))return null;
  if(closing)return {text,labels:[]};
  const candidates=Array.isArray(data.choices)?data.choices.slice(0,3):[];
  const labels=[...new Set(candidates.map(choice=>clean(typeof choice==='string'?choice:choice?.label))
    .filter(label=>label.length>=2&&label.length<=24&&!/[\r\n{}<>「」]/u.test(label)))].slice(0,2);
  // If a good NPC reply came back with poor buttons, retain the distinctive
  // line and use neutral CHILD choices. An opening without choices stays local.
  if(labels.length<2){
    if(!requireLine)return null;
    return {text,labels:['もう少し聞く','またね']};
  }
  return {text:requireLine?text:null,labels};
}

function approvedVoiceExamples(cues,characterId,currentLine){
  const lines=validateForestDialogueCues(cues).filter(cue=>
    cue.characterId===characterId&&['meet','ambient'].includes(cue.kind)&&
    !cue.bookId&&!cue.memoryId)
    .map(cue=>clean(cue.text)).filter(line=>line&&line!==clean(currentLine)&&
      line.length<=100&&!/[{}]/u.test(line));
  return [...new Set(lines)].slice(0,2);
}

function promptScene(scene,sourceKind){
  if(!scene)return {};
  if(sourceKind!=='ambient')return {tone:scene.tone||''};
  // The private memory ID stays on the device for revocation checks.
  const {id,kind,focus,tone,theme,evidence,previousChoice,stage}=scene;
  return {id,kind,focus,tone,theme,evidence,
    ...(previousChoice?{previousChoice,stage}:{})};
}

function promptFor({characterId,mode,npcLine,chosenLabel='',history=[],closing=false,topic=null,
  characterProfile=null,voiceExamples=[],sourceKind='',dailyContext=null,recentLines=[]}){
  const guide=forestCharacterVoiceGuide(characterProfile);
  return {
    mode,closing,
    task:mode==='reply'?'いま選ばれた返答にNPC本人らしくひと言応じる。説明や教訓は不要':
      mode==='opening'?'承認済み台詞を人物像の手本に、今日の森の小さな出来事を本人らしくひと言話し、子どもの返答候補を2個作る':
        '承認済みのNPCの第一声を変えず、子どもが選べる短い返答候補を2個だけ作る',
    npc:{id:characterId,voice:guide||VOICES[characterId],
      approvedExamples:voiceExamples.slice(0,2)},
    context:{npcLine:clean(npcLine).slice(0,170),sourceKind,
      chosenLabel:clean(chosenLabel).slice(0,24),
      recentTurns:history.slice(-4),...(topic?{topic}:{}),
      ...(dailyContext?{today:{scene:promptScene(dailyContext.scene,sourceKind),
        visitsToday:dailyContext.visitsToday,
        previousNpc:dailyContext.previousNpc,
        metNpcCount:dailyContext.metNpcCount,
        relatedEncounter:dailyContext.relatedEncounter}}:{}),
      ...(recentLines.length?{avoidRecentLines:recentLines.slice(-3)}:{})},
    constraints:[
      '会話は日本語。小学校低学年が読める短い言葉と簡単な漢字にする',
      '会話の相手は実在の子ども。家族、住所、学校、年齢、個人情報を質問しない',
      '原作の出来事を勝手に作らない。別作品の出来事をその場で目撃したと装わず、台詞引用・あらすじ・教訓にしない',
      '本人の感想・行動・気持ちを知っているふりをしない',
      '最優先はNPC本人らしい言葉、間、反応、行動。情報量や深い話を求めず、思考の種から質問・教訓・立派な気づきを全員に強いない',
      '承認済み台詞例は話し方の参考。台詞を引用・コピーせず、人格や関係性だけを手掛かりにする',
      'NPCの返事は自然な一言〜2文で65字以内。前の発言を繰り返さず、設定の説明を会話に混ぜない',
      '返答候補は2個、各16字以内。ありきたりな相づちや無意味な質問を続けない',
      '選択肢はゲーム上の反応であり子どもの実際の信念とはみなさない。別NPCの会話を本人が聞いたふりはしない',
      characterId==='cat'?'ねこは絶対に人語を話さない':'NPC本人の視点で話す',
      ...(topic?['この原作の事実は直前の承認済み台詞と結びつく場合のみ用いる。哲学や説教を求めない']:[]),
      ...(closing?['この一言で会話を終える。新たな話題を出さず自然に別れを告げる']:[])
    ],
    output:{format:'JSON',shape:{text:mode==='choices'?'省略':'NPCの発言（65字以内）',
      choices:closing?[]:['子どもが選ぶ返答A','子どもが選ぶ返答B']}}
  };
}

/** Does not generate on idle, twin autoplay, or a private child reflection. */
export function createForestLiveDialogueDirector({base,generate,storage=null,
  storageKey='forest-ai-local-v1',now=()=>Date.now(),dailyLimit=300,sessionLimit=3,
  maxReplies=2,startDelayMs=280,modelId='unknown',getBooks=()=>[],getCatalog=()=>[],
  getCues=()=>[],
  getSeeds=()=>[],getCharacterProfiles=()=>[],requireCharacterProfile=false}={}){
  if(!base||typeof base.start!=='function'||typeof base.select!=='function'||
    typeof generate!=='function')throw Error('base and generate are required');
  let pending=null,pendingScripted=null,history=[],sessionCount=0,repliesThisSession=0,serial=0,closed=false,epoch=0,
    inflight=null,activeCharacterProfile=null,activeVoiceExamples=[],activeDaily=null,
    displayedTopicKey='';
  const thoughtUsage=createForestThoughtSession({storage,storageKey:storageKey+':thought',now});
  const daily=createForestDailyContextSession({storage,storageKey:storageKey+':daily',now});
  const budgetKey=storageKey+':budget',logKey=storageKey+':log';
  function record(item){
    const existing=readJson(storage,logKey,[]);
    const entries=Array.isArray(existing)?existing.slice(-299):[];
    entries.push({at:now(),...item});
    try{storage?.setItem?.(logKey,JSON.stringify(entries))}catch{}
  }
  function seedSelection(){
    const scene=activeDaily?.scene;
    if(!scene?.seedId)return null;
    return {seed:{id:scene.seedId},day:new Date(now()+9*3600000).toISOString().slice(0,10),
      visit:activeDaily.visitsToday,allowGeneration:true};
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
    sourceKind=''){
    if(!reserve())return null;
    const previousLogs=readJson(storage,logKey,[]);
    const recentLines=(Array.isArray(previousLogs)?previousLogs:[]).filter(entry=>entry?.characterId===characterId&&
      ['generated-opening','generated-reply'].includes(entry.event)&&typeof entry.text==='string')
      .slice(-3).map(entry=>clean(entry.text).slice(0,90));
    const context=promptFor({characterId,mode,npcLine,chosenLabel,history,closing,topic,
      characterProfile:activeCharacterProfile,voiceExamples:activeVoiceExamples,sourceKind,
      dailyContext:activeDaily,recentLines});
    const controller=new AbortController(),startedAt=now();
    inflight={controller,characterId,mode,startedAt};
    let timeout;
    try{
      const raw=await Promise.race([Promise.resolve().then(()=>generate(context,{signal:controller.signal})),
        new Promise((_,reject)=>{timeout=setTimeout(()=>{
          controller.abort();reject(Error('timeout'));
        },11000)})]);
      const result=validateLiveForestOutput(raw,{characterId,
        requireLine:mode!=='choices',closing});
      if(controller.signal.aborted)return null;
      if(!result)record({event:'invalid-generation',characterId,mode,modelId,promptVersion:PROMPT_VERSION});
      return result?{...result,elapsedMs:Math.max(0,now()-startedAt)}:null;
    }catch(error){
      if(/quota reached|neurons.*exceeded|daily free allocation/iu.test(String(error?.message||''))){
        const day=new Date(now()).toISOString().slice(0,10);
        const previous=readJson(storage,budgetKey,{});
        try{storage?.setItem?.(budgetKey,JSON.stringify({day,
          count:previous.day===day?Number(previous.count)||1:1,exhausted:true}))}catch{}
      }
      if(!controller.signal.aborted)record({event:'generation-failed',characterId,mode,modelId,
        promptVersion:PROMPT_VERSION,elapsedMs:Math.max(0,now()-startedAt)});
      return null;
    }finally{clearTimeout(timeout);if(inflight?.controller===controller)inflight=null}
  }
  function decorate(characterId,text,labels,meta={}){
    const relay=meta.relayChoice;
    const choices=labels.slice(0,relay?1:2).map((label,i)=>({id:`ai-${++serial}-${i}`,label}));
    if(relay)choices.push({id:relay.id,label:relay.label,relayTo:relay.relayTo});
    pending={characterId,text,choices,...meta};
    return {text,choices,...(meta.thoughtSeedId?{thoughtSeedId:meta.thoughtSeedId}:{})};
  }
  function scripted(result,characterId){
    pendingScripted=result?.choices?.length?{characterId,choices:result.choices}:null;
    return result;
  }
  async function start(identity){
    const generation=++epoch;
    closed=false;pending=null;pendingScripted=null;history=[];sessionCount=0;
    repliesThisSession=0;
    displayedTopicKey='';
    activeCharacterProfile=null;activeVoiceExamples=[];
    activeDaily=null;
    const characterId=identity?.characterId;
    if(CHARACTERS.has(characterId)){
      try{activeCharacterProfile=validForestCharacterProfiles(await getCharacterProfiles())
        .find(profile=>profile.id===characterId)||null}catch{activeCharacterProfile=null}
    }
    const original=await base.start(identity);
    if(closed||generation!==epoch)return null;
    if(original&&identity?.characterId){
      try{
        const [books,catalog,seeds,cues]=await Promise.all([
          getBooks(),getCatalog(),getSeeds(),getCues()]);
        if(closed||generation!==epoch)return null;
        activeDaily=daily.visit(identity.characterId,{books,catalog,seeds,cues,
          sourceKind:original.sourceKind,sourceMemoryId:original.sourceMemoryId});
      }catch{
        if(closed||generation!==epoch)return null;
        activeDaily=daily.visit(identity.characterId);
      }
    }
    if(!original||!CHARACTERS.has(characterId)||characterId==='cat'||
      original.sourceKind==='reflection'||
      !validLine(characterId,original.text))return scripted(original,characterId);
    // Never swap an approved line for a generic LLM character when private
    // personality material has not loaded in a real owner session.
    if(requireCharacterProfile&&!activeCharacterProfile)return scripted(original,characterId);
    // Repeated encounters are allowed while the true API allowance remains.
    try{activeVoiceExamples=approvedVoiceExamples(await getCues(),characterId,original.text)}
    catch{activeVoiceExamples=[]}
    if(startDelayMs>0)await new Promise(resolve=>setTimeout(resolve,startDelayMs));
    if(closed||generation!==epoch)return null;
    const source=activeDaily?.scene;
    const useSource=Boolean(source?.evidence==='reviewed'&&
      original.sourceMemoryId&&original.sourceMemoryId===source.memoryId);
    const topic=useSource?{fact:source.focus.slice(0,240),theme:source.theme||''}:null;
    const mode=original.sourceKind==='ambient'?'opening':'choices';
    const seed=seedSelection();
    if(seed)thoughtUsage.selected(seed,characterId);
    const result=await request(characterId,mode,original.text,'',false,topic,
      original.sourceKind||'');
    if(closed||generation!==epoch)return null;
    if(!result)return scripted(original,characterId);
    const spoken=mode==='opening'?result.text:original.text;
    history.push({npc:clean(spoken).slice(0,150)});
    record({event:mode==='opening'?'generated-opening':'generated-choices',characterId,
      text:spoken,choices:result.labels,
      dailyTopicKind:source?.kind||'ambient',
      sourceKind:original.sourceKind||'unknown',modelId,promptVersion:PROMPT_VERSION,elapsedMs:result.elapsedMs});
    const fallbackChoiceId=original.choices?.find(choice=>choice.id==='another-topic')?.id||
      original.choices?.find(choice=>typeof choice?.id==='string')?.id||'';
    const relayChoice=original.choices?.find(choice=>choice.relayTo&&
      typeof choice.id==='string'&&typeof choice.label==='string')||null;
    return decorate(characterId,spoken,result.labels,{fallbackChoiceId,
      sourceKind:original.sourceKind||'',sourceMemoryId:original.sourceMemoryId||'',
      relayChoice,
      ...(source?.evidence==='reviewed'?{dailySourceMemoryId:source.memoryId}:{})});
  }
  async function select({characterId,choiceId}={}){
    const generation=epoch;
    const current=pending;
    if(!current||current.characterId!==characterId||
      !current.choices.some(choice=>choice.id===choiceId)){
      const selected=pendingScripted?.characterId===characterId?
        pendingScripted.choices.find(choice=>choice.id===choiceId):null;
      const original=await base.select({characterId,choiceId});
      if(selected&&original)daily.selected(characterId,selected.label);
      return scripted(original,characterId);
    }
    pending=null;
    const label=current.choices.find(choice=>choice.id===choiceId).label;
    if(current.sourceMemoryId||current.dailySourceMemoryId){
      try{
        const authorized=unlockedStoryMemories(await getBooks(),await getCatalog());
        if(!authorized.some(memory=>memory.id===(current.sourceMemoryId||
          current.dailySourceMemoryId)))
          return {text:GOODBYE[characterId]||'また森で会おうね。',choices:[],
            conversationComplete:true};
      }catch{return {text:GOODBYE[characterId]||'また森で会おうね。',choices:[],conversationComplete:true}}
    }
    daily.selected(characterId,label);
    const scriptedRelay=current.relayChoice?.id===choiceId;
    if(scriptedRelay){
      const result=await base.select({characterId,choiceId});
      if(closed||generation!==epoch)return null;
      return scripted(result,characterId);
    }
    history.push({playerChoice:label});history=history.slice(-4);
    record({event:'selected-offered-choice',characterId,label});
    const closing=repliesThisSession+1>=maxReplies;
    const topic=current.sourceMemoryId&&activeDaily?.scene?.memoryId===current.sourceMemoryId?
      {fact:activeDaily.scene.focus.slice(0,240),theme:activeDaily.scene.theme||''}:null;
    const generated=await request(characterId,'reply',current.text,label,closing,topic,
      current.sourceKind);
    if(closed||generation!==epoch)return null;
    if(!generated){
      // Resume an authored continuation instead of ending every character's
      // conversation with the same abrupt AI-error sentence.
      try{
        const scripted=current.fallbackChoiceId?await base.select({characterId,
          choiceId:current.fallbackChoiceId}):null;
        if(closed||generation!==epoch)return null;
        if(scripted?.text)return scripted;
      }catch{}
      return {text:GOODBYE[characterId]||'また、森で会おうね。',choices:[],conversationComplete:true};
    }
    history.push({npc:generated.text});history=history.slice(-4);
    repliesThisSession++;
    record({event:'generated-reply',characterId,text:generated.text,
      dailyTopicKind:activeDaily?.scene?.kind||'ambient',
      choices:closing?[]:generated.labels,closing,modelId,promptVersion:PROMPT_VERSION,
      elapsedMs:generated.elapsedMs,turn:repliesThisSession});
    if(closing){pending=null;return {text:generated.text,choices:[],conversationComplete:true}}
    return decorate(characterId,generated.text,generated.labels,{
      fallbackChoiceId:current.fallbackChoiceId,sourceKind:current.sourceKind,
      sourceMemoryId:current.sourceMemoryId,
      dailySourceMemoryId:current.dailySourceMemoryId});
  }
  return {
    start,select,
    onDisplayed(result,identity){
      const scene=activeDaily?.scene;
      if(scene?.evidence!=='reviewed'||!pending||
        pending.characterId!==identity?.characterId||
        result?.text!==pending.text||displayedTopicKey===scene.id)return;
      displayedTopicKey=scene.id;
      record({event:'daily-topic-displayed',characterId:identity.characterId,
        topicKey:scene.id,kind:scene.kind,promptVersion:PROMPT_VERSION});
      const seed=seedSelection();
      if(seed)thoughtUsage.displayed(seed,identity.characterId);
    },
    advance(identity){return base.advance?.(identity)||null},
    end(){
      epoch++;closed=true;pending=null;pendingScripted=null;history=[];
      activeCharacterProfile=null;
      activeVoiceExamples=[];
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
