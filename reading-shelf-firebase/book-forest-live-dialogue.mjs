// Optional, bounded runtime dialogue on top of approved local NPC scripts.
// The generator is injected: this module never holds a key or makes a network call.
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
const clean=value=>typeof value==='string'?value.trim().replace(/\s+/gu,' '):'';
function readJson(storage,key,fallback){
  try{return JSON.parse(storage?.getItem?.(key)||'null')||fallback}catch{return fallback}
}
function validLine(characterId,text){
  const line=clean(text);
  if(line.length<5||line.length>150||/[{}<>]/u.test(line))return false;
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
  if(!Array.isArray(data.choices)||data.choices.length<2||data.choices.length>3)return null;
  const labels=data.choices.map(choice=>clean(typeof choice==='string'?choice:choice?.label));
  if(labels.some(label=>label.length<2||label.length>24||/[\r\n{}<>「」]/u.test(label))||
    new Set(labels).size!==labels.length)return null;
  return {text:requireLine?text:null,labels};
}

function promptFor({characterId,mode,npcLine,chosenLabel='',history=[]}){
  return {
    task:mode==='reply'?'選ばれた返答に応じたNPCのひと言と次の返答候補を作る':
      'NPCのひと言に合う、子どもが選べる自然な返答候補だけを作る',
    npc:{id:characterId,voice:VOICES[characterId]},
    context:{npcLine:clean(npcLine).slice(0,170),chosenLabel:clean(chosenLabel).slice(0,24),
      recentTurns:history.slice(-4)},
    constraints:[
      '会話は日本語。小学校低学年が読める短い言葉と簡単な漢字にする',
      '会話の相手は実在の子ども。家族、住所、学校、年齢、個人情報を質問しない',
      '原作の出来事を勝手に作らない。わからないときは森の身近なものを話題にする',
      '原作や台本から台詞を引用しない。説明文やあらすじにしない',
      '本人の感想・行動・気持ちを知っているふりをしない',
      '返答候補は2〜3個、それぞれ24字以内。正解誘導より自然な会話を優先する',
      'ひとつの返答候補を選んでも、子どもの実際の信念や経験とはみなさない',
      characterId==='cat'?'ねこは絶対に人語を話さない':'NPC本人の視点で話す'
    ],
    output:{format:'JSON',shape:{text:mode==='reply'?'NPCの発言（150字以内）':'省略可',
      choices:['子どもが選ぶ返答A','子どもが選ぶ返答B']}}
  };
}

/** Does not generate on idle, twin autoplay, or a private child reflection. */
export function createForestLiveDialogueDirector({base,generate,storage=null,
  storageKey='forest-ai-local-v1',now=()=>Date.now(),dailyLimit=150,sessionLimit=20}={}){
  if(!base||typeof base.start!=='function'||typeof base.select!=='function'||
    typeof generate!=='function')throw Error('base and generate are required');
  let pending=null,history=[],sessionCount=0,serial=0,closed=false,epoch=0;
  const budgetKey=storageKey+':budget',logKey=storageKey+':log';
  function record(item){
    const existing=readJson(storage,logKey,[]);
    const entries=Array.isArray(existing)?existing.slice(-59):[];
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
  async function request(characterId,mode,npcLine,chosenLabel=''){
    if(!reserve())return null;
    const context=promptFor({characterId,mode,npcLine,chosenLabel,history});
    let timeout;
    try{
      const raw=await Promise.race([Promise.resolve().then(()=>generate(context)),new Promise((_,reject)=>
        {timeout=setTimeout(()=>reject(Error('timeout')),11000)})]);
      return validateLiveForestOutput(raw,{characterId,requireLine:mode==='reply'});
    }catch{return null}finally{clearTimeout(timeout)}
  }
  function decorate(characterId,text,labels){
    const choices=labels.map((label,i)=>({id:`ai-${++serial}-${i}`,label}));
    pending={characterId,text,choices};
    return {text,choices};
  }
  async function start(identity){
    const generation=++epoch;
    closed=false;pending=null;history=[];sessionCount=0;
    const original=await base.start(identity),characterId=identity?.characterId;
    if(closed||generation!==epoch)return null;
    if(!original||!CHARACTERS.has(characterId)||characterId==='cat'||
      original.sourceKind==='reflection'||
      !validLine(characterId,original.text))return original;
    const result=await request(characterId,'choices',original.text);
    if(closed||generation!==epoch)return null;
    if(!result)return original;
    history.push({npc:clean(original.text).slice(0,150)});
    record({event:'generated-choices',characterId,choices:result.labels});
    return decorate(characterId,original.text,result.labels);
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
    history.push({playerChoice:label});history=history.slice(-4);
    record({event:'selected-offered-choice',characterId,label});
    const generated=await request(characterId,'reply',current.text,label);
    if(closed||generation!==epoch)return null;
    if(!generated){
      const fallback=await base.start({characterId});
      return fallback;
    }
    history.push({npc:generated.text});history=history.slice(-4);
    record({event:'generated-reply',characterId,text:generated.text,choices:generated.labels});
    return decorate(characterId,generated.text,generated.labels);
  }
  return {
    start,select,
    advance(identity){return base.advance?.(identity)||null},
    end(){epoch++;closed=true;pending=null;history=[];base.end?.()},
    getProgress(){return {...(base.getProgress?.()||{}),aiRequestsThisSession:sessionCount}}
  };
}
