// Optional, bounded runtime dialogue on top of approved local NPC scripts.
// The generator is injected: this module never holds a key or makes a network call.
import {createForestThoughtSession,forestThoughtPrompt} from './book-forest-thought-seeds.mjs';
const CHARACTERS=new Set(['king','cat','kiki','jiji','skipper','zorori','ishishi','noshishi']);
const VOICES={
  king:'王さま。自分のことは「余」。大げさで好奇心があり、子どもを歓迎する。',
  cat:'王さまのねこ。人間の言葉は話さない。地の文で短い動作だけを書く。',
  kiki:'キキ。自分の経験を一人称で話し、率直で活発。自分を「キキは」と呼ばない。',
  jiji:'ジジ。気さくで少し皮肉屋だが、相手を傷つけない。',
  skipper:'スキッパー。元気で小さな探検を楽しむ。',
  zorori:'ゾロリ。いたずら好きで得意げだが、子どもを怖がらせない。',
  ishishi:'イシシ。食べ物や面白いことに目がなく、おっちょこちょい。',
  noshishi:'ノシシ。のんびりしていて相棒との掛け合いが好き。'
};
const SELF_NAMES={king:'王さま',kiki:'キキ',jiji:'ジジ',skipper:'スキッパー',
  zorori:'ゾロリ',ishishi:'イシシ',noshishi:'ノシシ'};
const PROMPT_VERSION='forest-thought-exchange-v6';
const GOODBYE={king:'続きはまた今度だ。達者でな！',kiki:'じゃあ、また森で会おうね！',
  jiji:'またね。気をつけて歩くんだよ。',skipper:'またいっしょに探検しよう！',
  zorori:'次はもっと面白い話をしてやるぜ！',ishishi:'じゃあな！また遊ぼうぜ！',
  noshishi:'またね。のんびり待ってるよ。'};
const clean=value=>typeof value==='string'?value.trim().replace(/\s+/gu,' '):'';
function readJson(storage,key,fallback){
  try{return JSON.parse(storage?.getItem?.(key)||'null')||fallback}catch{return fallback}
}
function validLine(characterId,text){
  const line=clean(text);
  if(line.length<5||line.length>90||/[{}<>]/u.test(line))return false;
  // The non-speaking cat stays on approved hand-written action lines in v1.
  if(characterId==='cat')return false;
  const name=SELF_NAMES[characterId];
  return !name||!new RegExp('^'+name+'[はが]').test(line);
}
export function validateLiveForestOutput(raw,{characterId,requireLine=false}={}){
  let data=raw;
  if(typeof raw==='string')try{data=JSON.parse(raw)}catch{return null}
  if(!data||typeof data!=='object'||!CHARACTERS.has(characterId))return null;
  const text=clean(data.text);
  if(requireLine&&!validLine(characterId,text))return null;
  if(!Array.isArray(data.choices)||data.choices.length!==2)return null;
  const labels=data.choices.map(choice=>clean(typeof choice==='string'?choice:choice?.label));
  if(labels.some(label=>label.length<2||label.length>18||/[\r\n{}<>「」]/u.test(label))||
    new Set(labels).size!==labels.length)return null;
  return {text:requireLine?text:null,labels};
}

function promptFor({characterId,mode,npcLine,chosenLabel='',history=[],closing=false,topic=null}){
  return {
    task:mode==='opening'?'今日の本の出来事と問いから、NPCらしい短い第一声と返答候補を2個作る':
      mode==='reply'?'いま選ばれた返答に自然に応じる短いNPCのひと言を作る':
        '現在のNPCのひと言に対する短い返答候補を2個だけ作る',
    npc:{id:characterId,voice:VOICES[characterId]},
    context:{npcLine:mode==='opening'?'':clean(npcLine).slice(0,170),
      chosenLabel:clean(chosenLabel).slice(0,24),
      recentTurns:history.slice(-2),...(topic?{topic}:{})},
    constraints:[
      '会話は日本語。小学校低学年が読める短い言葉と簡単な漢字にする',
      '会話の相手は実在の子ども。家族、住所、学校、年齢、個人情報を質問しない',
      '原作の出来事を勝手に作らない。わからないときは森の身近なものを話題にする',
      '原作や台本から台詞を引用しない。説明文、あらすじ、教訓、長い回想にしない',
      '本人の感想・行動・気持ちを知っているふりをしない',
      'NPCの返事は1〜2文で65字以内。前の発言を言い換えて繰り返さない',
      '返答候補は2個、各16字以内。ありきたりな相づちや無意味な質問を続けない',
      'ひとつの返答候補を選んでも、子どもの実際の信念や経験とはみなさない',
      characterId==='cat'?'ねこは絶対に人語を話さない':'NPC本人の視点で話す',
      ...(topic?['作品の確認済み事実に触れ、その登場人物ならではの価値観の違いを自然ににじませる。抽象的な説教はしない',
        '今日の問いは共有しても、他のNPCとの会話を聞いたと断定しない。前に選ばれた選択肢は子どもの信念ではない。再訪なら少し深める']:[]),
      ...(closing?['この一言で会話を終える。新たな話題を出さず自然に別れを告げる']:[])
    ],
    output:{format:'JSON',shape:{text:mode==='reply'||mode==='opening'?'NPCの発言（65字以内）':'省略可',
      choices:['子どもが選ぶ返答A','子どもが選ぶ返答B']}}
  };
}

/** Does not generate on idle, twin autoplay, or a private child reflection. */
export function createForestLiveDialogueDirector({base,generate,storage=null,
  storageKey='forest-ai-local-v1',now=()=>Date.now(),dailyLimit=150,sessionLimit=3,
  maxReplies=2,startDelayMs=280,modelId='unknown',getBooks=()=>[],getCatalog=()=>[],
  getSeeds=()=>[]}={}){
  if(!base||typeof base.start!=='function'||typeof base.select!=='function'||
    typeof generate!=='function')throw Error('base and generate are required');
  let pending=null,history=[],sessionCount=0,repliesThisSession=0,serial=0,closed=false,epoch=0,
    inflight=null,activeThought=null;
  const thoughts=createForestThoughtSession({storage,storageKey:storageKey+':thought',now});
  const budgetKey=storageKey+':budget',logKey=storageKey+':log';
  function record(item){
    const existing=readJson(storage,logKey,[]);
    const entries=Array.isArray(existing)?existing.slice(-299):[];
    entries.push({at:now(),...item});
    try{storage?.setItem?.(logKey,JSON.stringify(entries))}catch{}
  }
  function reserve(){
    if(typeof storage?.getItem!=='function'||typeof storage?.setItem!=='function')return false;
    if(sessionCount>=sessionLimit)return false;
    const day=new Date(now()+9*3600000).toISOString().slice(0,10);
    const previous=readJson(storage,budgetKey,{});
    const used=previous?.day===day?Number(previous.count)||0:0;
    if(used>=dailyLimit)return false;
    try{storage?.setItem?.(budgetKey,JSON.stringify({day,count:used+1}))}catch{
      // No durable quota => fail closed, not unlimited API calls.
      return false;
    }
    sessionCount++;
    return true;
  }
  async function request(characterId,mode,npcLine,chosenLabel='',closing=false,topic=null){
    if(!reserve())return null;
    if(mode==='opening'&&topic&&activeThought)thoughts.selected(activeThought,characterId);
    const context=promptFor({characterId,mode,npcLine,chosenLabel,history,closing,topic});
    const controller=new AbortController(),startedAt=now();
    inflight={controller,characterId,mode,startedAt};
    let timeout;
    try{
      const raw=await Promise.race([Promise.resolve().then(()=>generate(context,{signal:controller.signal})),
        new Promise((_,reject)=>{timeout=setTimeout(()=>{
          controller.abort();reject(Error('timeout'));
        },11000)})]);
      const result=validateLiveForestOutput(raw,{characterId,
        requireLine:mode==='reply'||mode==='opening'});
      if(controller.signal.aborted)return null;
      if(!result)record({event:'invalid-generation',characterId,mode,modelId,promptVersion:PROMPT_VERSION});
      return result?{...result,elapsedMs:Math.max(0,now()-startedAt)}:null;
    }catch{
      if(!controller.signal.aborted)record({event:'generation-failed',characterId,mode,modelId,
        promptVersion:PROMPT_VERSION,elapsedMs:Math.max(0,now()-startedAt)});
      return null;
    }finally{clearTimeout(timeout);if(inflight?.controller===controller)inflight=null}
  }
  function decorate(characterId,text,labels){
    const choices=labels.map((label,i)=>({id:`ai-${++serial}-${i}`,label}));
    pending={characterId,text,choices};
    return {text,choices,...(activeThought?.seed?.id?{thoughtSeedId:activeThought.seed.id}:{})};
  }
  async function start(identity){
    const generation=++epoch;
    closed=false;pending=null;history=[];sessionCount=0;repliesThisSession=0;activeThought=null;
    const characterId=identity?.characterId;
    if(CHARACTERS.has(characterId)&&characterId!=='cat'){
      try{activeThought=thoughts.choose({books:await getBooks(),catalog:await getCatalog(),
        seeds:await getSeeds(),characterId})}catch{activeThought=null}
    }
    const original=await base.start({...identity,
      ...(activeThought?.seed?.memoryId?{preferredMemoryId:activeThought.seed.memoryId}:{})});
    if(closed||generation!==epoch)return null;
    if(!original||!CHARACTERS.has(characterId)||characterId==='cat'||
      original.sourceKind==='reflection'||
      !validLine(characterId,original.text))return original;
    if(activeThought&&!activeThought.allowGeneration){
      return {text:'今日も会えたね。また明日、ちがう話をしよう。',
        choices:[],conversationComplete:true};
    }
    if(startDelayMs>0)await new Promise(resolve=>setTimeout(resolve,startDelayMs));
    if(closed||generation!==epoch)return null;
    const topic=forestThoughtPrompt(activeThought,characterId,{visit:activeThought?.visit,
      previousNpc:activeThought?.previousNpc,previousAngle:activeThought?.previousAngle});
    const result=await request(characterId,topic?'opening':'choices',original.text,'',false,topic);
    if(closed||generation!==epoch)return null;
    if(!result)return original;
    const opening=topic?result.text:original.text;
    history.push({npc:clean(opening).slice(0,150)});
    record({event:'generated-choices',characterId,text:opening,choices:result.labels,
      ...(topic?{thoughtSeedId:activeThought.seed.id}:{}),
      sourceKind:original.sourceKind||'unknown',modelId,promptVersion:PROMPT_VERSION,elapsedMs:result.elapsedMs});
    return decorate(characterId,opening,result.labels);
  }
  async function select({characterId,choiceId}={}){
    const generation=epoch;
    const current=pending;
    if(!current||current.characterId!==characterId||
      !current.choices.some(choice=>choice.id===choiceId)){
      const original=await base.select({characterId,choiceId});
      return original;
    }
    pending=null;
    const label=current.choices.find(choice=>choice.id===choiceId).label;
    history.push({playerChoice:label});history=history.slice(-2);
    if(activeThought)thoughts.noteChoice(activeThought,characterId,label);
    record({event:'selected-offered-choice',characterId,label});
    const closing=repliesThisSession+1>=maxReplies;
    const topic=forestThoughtPrompt(activeThought,characterId,{visit:activeThought?.visit,
      previousNpc:activeThought?.previousNpc,previousAngle:activeThought?.previousAngle});
    const generated=await request(characterId,'reply',current.text,label,closing,topic);
    if(closed||generation!==epoch)return null;
    if(!generated){
      return {text:GOODBYE[characterId]||'また、森で会おうね。',choices:[],conversationComplete:true};
    }
    history.push({npc:generated.text});history=history.slice(-2);
    repliesThisSession++;
    record({event:'generated-reply',characterId,text:generated.text,
      ...(topic?{thoughtSeedId:activeThought.seed.id}:{}),
      choices:closing?[]:generated.labels,closing,modelId,promptVersion:PROMPT_VERSION,
      elapsedMs:generated.elapsedMs,turn:repliesThisSession});
    if(closing){pending=null;return {text:generated.text,choices:[],conversationComplete:true}}
    return decorate(characterId,generated.text,generated.labels);
  }
  return {
    start,select,
    onDisplayed(result,identity){
      if(activeThought?.seed?.id&&result?.thoughtSeedId===activeThought.seed.id&&
        identity?.characterId&&identity.characterId===pending?.characterId){
        thoughts.displayed(activeThought,identity.characterId);
      }
    },
    advance(identity){return base.advance?.(identity)||null},
    end(){
      epoch++;closed=true;pending=null;history=[];activeThought=null;
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
