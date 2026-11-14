// A private, source-grounded daily theme for the forest. The sheet values are
// loaded with the owner's Google token; no book IDs or reader data live here.
import {unlockedStoryMemories} from './book-forest-story-memory.mjs';

const ID=/^[a-zA-Z0-9_-]{1,100}$/u;
const MAX_SEEDS=180;
const HEADER={id:'種ID',bookId:'書籍ID',title:'書名',memoryId:'物語記憶ID',
  fact:'原作の事実（承認済み要約）',question:'思考の問い',contrast:'対立する見方',
  tags:'テーマタグ',lenses:'キャラごとの視点ヒント',spoiler:'ネタバレ度',
  status:'利用状態',sourceUrl:'原作出典URL',selected:'選抜回数',displayed:'実表示回数'};

const THOUGHT_SPEAKERS=new Set(['king','kiki','jiji','skipper','zorori','ishishi','noshishi',
  'hachibee','hakase','mochan']);
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

export function forestThoughtPrompt(selection,characterId){
  const seed=selection?.seed;
  if(!seed||!THOUGHT_SPEAKERS.has(characterId))return null;
  // A source-checked fact may support a matching approved story cue. The
  // common philosophical question, contrast, and other NPCs' activity do not
  // belong in every character's prompt: they homogenize otherwise distinct voices.
  // Never forward private book IDs, child reflections, or source URLs.
  return {fact:seed.fact.slice(0,240),theme:seed.tags.slice(0,100)};
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
