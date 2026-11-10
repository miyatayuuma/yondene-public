// A private, source-grounded daily theme for the forest. The sheet values are
// loaded with the owner's Google token; no book IDs or reader data live here.
import {unlockedStoryMemories} from './book-forest-story-memory.mjs';

const ID=/^[a-zA-Z0-9_-]{1,100}$/u;
const MAX_SEEDS=180;
const HEADER={id:'種ID',bookId:'書籍ID',title:'書名',memoryId:'物語記憶ID',
  fact:'原作の事実（承認済み要約）',question:'思考の問い',contrast:'対立する見方',
  tags:'テーマタグ',lenses:'キャラごとの視点ヒント',spoiler:'ネタバレ度',
  status:'利用状態',sourceUrl:'原作出典URL',selected:'選抜回数',displayed:'実表示回数'};

const PHILOSOPHY=Object.freeze({
  king:{axis:'名誉と謙虚さ',stance:'自分の役目を誇りながら、知らないことを認める',
    tension:'立派に見せたい気持ちと、助けを求める勇気'},
  kiki:{axis:'自立と信頼',stance:'自分で試して失敗から学ぶ。ただし人を頼ることも選べる',
    tension:'自由でいたい気持ちと、他者への責任'},
  jiji:{axis:'慎重さと冒険',stance:'危険を見つけるが、心配だけで好奇心を止めない',
    tension:'安全を守ることと、一歩踏み出すこと'},
  skipper:{axis:'好奇心と注意深さ',stance:'小さな発見を喜び、見逃したものにもう一度目を向ける',
    tension:'先へ進む喜びと、立ち止まって観察する価値'},
  zorori:{axis:'工夫と誠実さ',stance:'うまくいかない場面でも工夫する。ずるい近道の代償も考える',
    tension:'勝つことと、胸を張れるやり方で勝つこと'},
  ishishi:{axis:'欲しいものと分け合うこと',stance:'自分の楽しみを正直に求めつつ、友達の分も考える',
    tension:'目の前の喜びと、分け合う喜び'},
  noshishi:{axis:'気楽さと責任',stance:'失敗を深刻にしすぎず、仲間が困ればきちんと支える',
    tension:'のんびり進むことと、必要なときに動くこと'}
});
const normalize=value=>String(value??'').trim().replace(/\s+/gu,' ');
const count=value=>Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):0;
const dayJapan=timestamp=>new Date(timestamp+9*3600000).toISOString().slice(0,10);

export function parseForestThoughtSeeds(values){
  if(!Array.isArray(values)||!Array.isArray(values[0]))return [];
  const names=values[0].map(String);
  if(Object.values(HEADER).some(name=>!names.includes(name)))return [];
  const seen=new Set();
  return values.slice(1,MAX_SEEDS+1).filter(Array.isArray).map(row=>{
    const get=key=>normalize(row[names.indexOf(HEADER[key])]);
    return {id:get('id'),bookId:get('bookId'),title:get('title'),memoryId:get('memoryId'),
      fact:get('fact'),question:get('question'),contrast:get('contrast'),
      tags:get('tags'),lenses:get('lenses'),spoiler:Number(get('spoiler')),
      status:get('status'),sourceUrl:get('sourceUrl'),
      selectedCount:count(get('selected')),displayedCount:count(get('displayed'))};
  }).filter(seed=>{
    if(!ID.test(seed.id)||seen.has(seed.id)||!ID.test(seed.bookId)||
      !ID.test(seed.memoryId)||seed.status!=='使用可'||
      !seed.fact||seed.fact.length>450||!seed.question||seed.question.length>180||
      !seed.contrast||seed.contrast.length>240||
      !Number.isInteger(seed.spoiler)||seed.spoiler<0||seed.spoiler>2||
      !/^https:\/\/[^\s]+$/u.test(seed.sourceUrl))return false;
    seen.add(seed.id);return true;
  });
}

export function availableForestThoughtSeeds({books=[],catalog=[],seeds=[]}={}){
  const memories=new Map(unlockedStoryMemories(books,catalog).map(item=>[item.id,item]));
  const ids=new Set();
  return (Array.isArray(seeds)?seeds:[]).filter(seed=>{
    const memory=memories.get(seed?.memoryId);
    if(!memory||memory.bookId!==seed.bookId||memory.spoilerLevel<seed.spoiler||
      ids.has(seed.id))return false;
    ids.add(seed.id);return true;
  });
}

function hash(text){
  let result=2166136261;
  for(const char of text){result=Math.imul(result^char.codePointAt(0),16777619)}
  return result>>>0;
}

/** Start with a stable daily theme; a different NPC offers a different lens. */
export function selectForestThoughtSeed({books=[],catalog=[],seeds=[],now=Date.now(),
  state={},characterId='kiki'}={}){
  const day=dayJapan(now),available=availableForestThoughtSeeds({books,catalog,seeds});
  if(!available.length)return null;
  const previous=available.find(seed=>state?.day===day&&state?.seedId===seed.id);
  if(previous)return {day,seed:previous,returning:Boolean(state?.visits?.[characterId])};
  const recent=Array.isArray(state?.recent)?state.recent.slice(-7):[];
  const candidates=available.map(seed=>{
    const recency=recent.lastIndexOf(seed.id);
    return {seed,rank:seed.displayedCount*8+seed.selectedCount*2+
      (recency>=0?(7-recent.length+recency)*22+80:0),tie:hash(day+':'+seed.id)};
  }).sort((a,b)=>a.rank-b.rank||a.tie-b.tie||a.seed.id.localeCompare(b.seed.id));
  return {day,seed:candidates[0].seed,returning:false};
}

export function forestThoughtPrompt(selection,characterId,{visit=1,previousNpc='',previousAngle=''}={}){
  const seed=selection?.seed,philosophy=PHILOSOPHY[characterId];
  if(!seed||!philosophy)return null;
  // Do not send private book IDs, child reflections or unverified prose to the LLM.
  return {title:seed.title.slice(0,85),fact:seed.fact.slice(0,240),
    question:seed.question.slice(0,120),contrast:seed.contrast.slice(0,140),
    theme:seed.tags.slice(0,100),philosophy,
    visit:Math.min(visit,2),previousNpc:PHILOSOPHY[previousNpc]?previousNpc:'',
    previousAngle:normalize(previousAngle).slice(0,18)};
}

export function createForestThoughtSession({storage=null,storageKey='forest-thought-local-v1',
  now=()=>Date.now()}={}){
  const key=storageKey+':state',eventsKey=storageKey+':events';
  function load(){
    try{const data=JSON.parse(storage?.getItem?.(key)||'null');return data&&typeof data==='object'?data:{}}
    catch{return {}}
  }
  function save(data){try{storage?.setItem?.(key,JSON.stringify(data))}catch{}}
  function event(type,seedId,characterId,day,visit){
    if(!ID.test(seedId))return;
    let rows=[];
    try{const prior=JSON.parse(storage?.getItem?.(eventsKey)||'[]');if(Array.isArray(prior))rows=prior.slice(-249)}catch{}
    const eventId='seed-'+day+'-'+seedId+'-'+characterId+'-'+visit+'-'+type;
    if(rows.some(row=>row.eventId===eventId))return;
    rows.push({eventId,seedId,at:new Date(now()).toISOString(),type,characterId,
      day,version:'forest-thought-v6'});
    try{storage?.setItem?.(eventsKey,JSON.stringify(rows))}catch{}
  }
  return {
    choose({books,catalog,seeds,characterId}){
      const current=load(),selection=selectForestThoughtSeed({books,catalog,seeds,
        now:now(),state:current,characterId});
      if(!selection)return null;
      const {day,seed}=selection;
      const sameDay=current.day===day;
      const visits=sameDay&&current.visits&&typeof current.visits==='object'?current.visits:{};
      const visit=(Number(visits[characterId])||0)+1;
      const recent=Array.isArray(current.recent)?current.recent.slice(-7):[];
      if(!sameDay||current.seedId!==seed.id)recent.push(seed.id);
      const previousNpc=sameDay?current.lastNpc:'';
      const previousAngle=sameDay?current.lastChoice:'';
      save({day,seedId:seed.id,visits:{...visits,[characterId]:visit},
        recent:recent.slice(-7),lastNpc:characterId,lastChoice:''});
      return {...selection,visit,previousNpc,previousAngle,allowGeneration:visit<=2};
    },
    noteChoice(selection,characterId,label){
      const state=load();
      if(state.day===selection?.day&&state.seedId===selection?.seed?.id&&
        state.lastNpc===characterId){
        save({...state,lastChoice:normalize(label).slice(0,18)});
      }
    },
    selected(selection,characterId){
      if(selection?.seed?.id&&selection.allowGeneration)
        event('selected',selection.seed.id,characterId,selection.day,selection.visit);
    },
    displayed(selection,characterId){
      if(selection?.seed?.id)event('displayed',selection.seed.id,characterId,selection.day,selection.visit);
    },
    events(){
      try{const rows=JSON.parse(storage?.getItem?.(eventsKey)||'[]');return Array.isArray(rows)?rows:[]}
      catch{return []}
    }
  };
}
