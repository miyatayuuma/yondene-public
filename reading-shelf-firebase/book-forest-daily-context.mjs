// A character's daily interest comes from a reviewed episode or thought seed,
// with ordinary idle conversation when no relevant source is available.
// Never let a shared philosophical question replace the character's personality.
import {unlockedStoryMemories} from './book-forest-story-memory.mjs';
import {availableForestThoughtSeeds} from './book-forest-thought-seeds.mjs';

const DAY_MS=86400000, MAX_EVENTS=24, MAX_RECENT=8;
const ACTOR_NAMES={
  king:['king','王さま','王様'],cat:['cat','ねこ'],
  kiki:['kiki','キキ'],jiji:['jiji','ジジ'],
  skipper:['skipper','スキッパー'],twins:['twins','ふたご','双子'],
  zorori:['zorori','ゾロリ'],ishishi:['ishishi','イシシ'],
  noshishi:['noshishi','ノシシ']
};
const RELATIONS={king:['cat'],cat:['king'],kiki:['jiji'],jiji:['kiki'],
  skipper:['twins'],twins:['skipper'],zorori:['ishishi','noshishi'],
  ishishi:['zorori','noshishi'],noshishi:['zorori','ishishi']};
const dayJapan=timestamp=>new Date(timestamp+9*3600000).toISOString().slice(0,10);
const dayNumber=day=>Math.floor(Date.parse(day+'T00:00:00Z')/DAY_MS);
const clean=(value,max=32)=>String(value??'').trim().replace(/\s+/gu,' ').slice(0,max);
function hash(value){
  let n=2166136261;
  for(const char of String(value))n=Math.imul(n^char.codePointAt(0),16777619);
  return n>>>0;
}
function read(storage,key){try{return JSON.parse(storage?.getItem?.(key)||'null')||{}}catch{return {}}}
function write(storage,key,value){try{storage?.setItem?.(key,JSON.stringify(value))}catch{}}
function actorsMatch(memory,characterId){
  const actors=String(memory.characters||'').split(/[\s,，、|;；]+/u).filter(Boolean);
  return actors.some(actor=>(ACTOR_NAMES[characterId]||[]).includes(actor));
}
function recentReadBonus(book,day){
  const finished=String(book?.finishedAt||'').slice(0,10);
  if(!/^\d{4}-\d{2}(?:-\d{2})?$/u.test(finished))return 0;
  const exact=finished.length===7?finished+'-01':finished;
  const age=dayNumber(day)-dayNumber(exact);
  return age>=0&&age<=21?22:0;
}

/** All facts are rechecked against the current read-status snapshot on every visit. */
export function eligibleForestDailyTopics({characterId,books=[],catalog=[],seeds=[],cues=[],now=Date.now()}={}){
  if(!ACTOR_NAMES[characterId]||characterId==='cat'||characterId==='twins')return [];
  const day=dayJapan(now),memories=unlockedStoryMemories(books,catalog);
  const usable=availableForestThoughtSeeds({books,catalog,seeds});
  const authored=new Set((Array.isArray(cues)?cues:[])
    .filter(cue=>cue?.approval==='approved'&&cue.kind==='story'&&
      cue.characterId===characterId&&typeof cue.memoryId==='string')
    .map(cue=>cue.memoryId));
  const bookById=new Map((Array.isArray(books)?books:[]).map(book=>[book.id,book]));
  const result=[];
  for(const memory of memories){
    const affinity=authored.has(memory.id)?3:actorsMatch(memory,characterId)?2:0;
    if(!affinity)continue; // Do not make characters recount unrelated books.
    const relatedSeeds=usable.filter(seed=>seed.memoryId===memory.id);
    const shared={memoryId:memory.id,affinity,
      freshBonus:recentReadBonus(bookById.get(memory.bookId),day)};
    if(relatedSeeds.length){
      for(const seed of relatedSeeds){
        result.push({...shared,key:'seed-'+hash(seed.id).toString(16),seedId:seed.id,
          kind:'seed',fact:clean(seed.fact,220),theme:clean(seed.tags,60),
          sourceUse:seed.displayedCount*2+seed.selectedCount});
      }
    }else{
      result.push({...shared,key:'memory-'+hash(memory.id).toString(16),
        kind:'memory',fact:clean(memory.text,220),theme:clean(memory.tags,60),
        sourceUse:0});
    }
  }
  return result;
}

const idleScene={
  id:'daily-idle',kind:'ambient',
  focus:'いま目の前の森のことを、本人らしく短く話す',
  tone:'気取った教訓や質問にせず、自然な一言・身振り・沈黙でもよい',
  evidence:'imagined'
};
function sceneFrom(topic,{continuationChoice='',stage=1}={}){
  return {id:topic.key,kind:continuationChoice?'continuation':topic.kind,
    focus:topic.fact,tone:'原作の事実を説明せず、本人らしい反応・小さな行動・会話にする',
    theme:topic.theme,evidence:'reviewed',memoryId:topic.memoryId,
    ...(topic.seedId?{seedId:topic.seedId}:{}),
    ...(continuationChoice?{previousChoice:continuationChoice,stage}:{})};
}
function pickTopic(characterId,day,candidates,recent,usedToday){
  if(!candidates.length)return null;
  // A little ordinary life is essential: every NPC must not always lecture on a book.
  if(hash(day+':idle:'+characterId)%5===0)return null;
  const seen=Array.isArray(recent)?recent:[];
  return candidates.map(topic=>{
    const position=seen.lastIndexOf(topic.key);
    const penalty=position<0?0:66+(position-seen.length+1)*5;
    const shared=usedToday.has(topic.key)?28:0;
    return {topic,score:topic.affinity*22+topic.freshBonus+
      (topic.kind==='seed'?10:0)+hash(day+':'+characterId+':'+topic.key)%17-
      penalty-shared-Math.min(20,topic.sourceUse)};
  }).sort((a,b)=>b.score-a.score||a.topic.key.localeCompare(b.topic.key))[0].topic;
}
function empty(day,prior={}){
  return {version:2,day,events:[],visits:{},topics:{},
    arcs:prior.version===2&&prior.arcs&&typeof prior.arcs==='object'?prior.arcs:{},
    recent:prior.version===2&&prior.recent&&typeof prior.recent==='object'?prior.recent:{}};
}

/** Selection is local, deterministic and does not spend AI tokens. */
export function createForestDailyContextSession({storage=null,
  storageKey='forest-daily-context-v2',now=()=>Date.now()}={}){
  function current(){
    const day=dayJapan(now()),previous=read(storage,storageKey);
    return previous.version===2&&previous.day===day&&
      Array.isArray(previous.events)?previous:empty(day,previous);
  }
  function save(state){
    const topics=Object.fromEntries(Object.entries(state.topics||{}).map(([npc,scene])=>{
      const {memoryId,seedId,...safe}=scene;
      return [npc,safe];
    }));
    write(storage,storageKey,{...state,topics});
  }
  return {
    visit(characterId,{books=[],catalog=[],seeds=[],cues=[],sourceKind='',sourceMemoryId=''}={}){
      const state=current(),candidates=['meet','reflection'].includes(sourceKind)?[]:
        eligibleForestDailyTopics({characterId,books,catalog,seeds,cues,now:now()});
      const usable=new Map(candidates.map(topic=>[topic.key,topic]));
      const earlier=state.events.slice().reverse();
      const connected=earlier.find(event=>event.npc!==characterId&&
        (RELATIONS[characterId]||[]).includes(event.npc));
      const last=earlier.find(event=>event.npc!==characterId);
      const visitsToday=(Number(state.visits[characterId])||0)+1;
      let scene=state.topics[characterId];
      // A local script about a sourced episode always overrides a different idle subject.
      const authored=['story','relay'].includes(sourceKind)&&sourceMemoryId?
        candidates.find(topic=>topic.memoryId===sourceMemoryId):null;
      if(authored)scene=sceneFrom(authored);
      else if(scene?.evidence==='reviewed'){
        const source=candidates.find(topic=>topic.key===scene.id);
        scene=source?{...scene,memoryId:source.memoryId,
          ...(source.seedId?{seedId:source.seedId}:{})}:null;
        // Read->unread revokes yesterday's or today's source.
      }
      if(!scene){
        const previous=state.arcs[characterId],delta=previous?
          dayNumber(state.day)-dayNumber(previous.day):0;
        const candidate=previous&&delta===1&&previous.stage<3&&previous.choice&&
          !/またね|帰る|やめる|おしまい/iu.test(previous.choice)?
          usable.get(previous.key):null;
        if(candidate)scene=sceneFrom(candidate,{continuationChoice:previous.choice,
          stage:previous.stage+1});
        else{
          const usedToday=new Set(Object.values(state.topics).map(item=>item?.id));
          const recent=state.recent[characterId];
          const chosen=pickTopic(characterId,state.day,candidates,recent,usedToday);
          scene=chosen?sceneFrom(chosen):{...idleScene,id:'daily-idle-'+characterId};
        }
      }
      state.topics[characterId]=scene;
      state.visits[characterId]=visitsToday;
      state.events.push({npc:characterId,kind:'visit'});
      state.events=state.events.slice(-MAX_EVENTS);
      if(scene.evidence==='reviewed'&&visitsToday===1){
        const list=Array.isArray(state.recent[characterId])?
          state.recent[characterId].slice(-MAX_RECENT+1):[];
        state.recent[characterId]=[...list,scene.id];
      }
      save(state);
      return {scene,visitsToday,metNpcCount:Object.keys(state.visits).length,
        previousNpc:last?.npc||'',
        relatedEncounter:connected?{
          npc:connected.npc,selectedLabel:clean(connected.kind==='choice'?connected.label:''),
          scene:state.topics[connected.npc]?.id||''}:null};
    },
    selected(characterId,label){
      if(!RELATIONS[characterId]||!clean(label))return;
      const state=current(),scene=state.topics[characterId];
      state.events.push({npc:characterId,kind:'choice',label:clean(label)});
      state.events=state.events.slice(-MAX_EVENTS);
      if(scene?.evidence==='reviewed'){
        state.arcs[characterId]={day:state.day,key:scene.id,
          choice:clean(label),stage:scene.stage||1};
      }else delete state.arcs[characterId];
      save(state);
    },
    getState(){return current()}
  };
}
