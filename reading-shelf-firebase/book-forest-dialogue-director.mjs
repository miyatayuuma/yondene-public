import {unlockedStoryMemories} from './book-forest-story-memory.mjs';
import {createTwinConversationDirector} from './book-forest-twins.mjs';

// The conversation director is intentionally independent of Firebase, Sheets,
// Google Drive and Three.js. Real dialogue and story facts are PRIVATE inputs.
// There is no runtime LLM call and no reader text is persisted by this module.
const CHARACTERS=new Set(['king','cat','kiki','jiji','skipper','twins','zorori','ishishi','noshishi']);
const KINDS=new Set(['meet','ambient','story','reflection','relay']);
const MAX_CUES=600,MAX_SEEN=100,MAX_TEXT=230;
const SELF_NAMES={king:'王さま',kiki:'キキ',jiji:'ジジ',skipper:'スキッパー',
  zorori:'ゾロリ',ishishi:'イシシ',noshishi:'ノシシ'};
const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value);
const normalizeText=value=>typeof value==='string'?value.trim().replace(/\s+/gu,' '):'';
const numbers=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max?value:min;
const unique=list=>[...new Set(list)];

function validCue(cue){
  if(!cue||cue.schemaVersion!==1||cue.approval!=='approved'||!validId(cue.id)||
    !CHARACTERS.has(cue.characterId)||!KINDS.has(cue.kind)||
    !normalizeText(cue.text)||cue.text.length>MAX_TEXT)return false;
  if(['story','reflection'].includes(cue.kind)&&cue.bookId!==undefined&&
    !validId(cue.bookId))return false;
  // Story lines are authored for one specific, sourced memory. A generic
  // {memory} interpolation would turn a third-person synopsis into speech.
  if(cue.kind==='story'&&(!validId(cue.memoryId)||cue.text.includes('{memory}')))return false;
  if(cue.kind==='story'){
    const text=normalizeText(cue.text);
    const name=SELF_NAMES[cue.characterId];
    if(name&&(text.startsWith(name+'は')||text.startsWith(name+'が')))return false;
    // The king's cat communicates by gesture; narration must not make it talk.
    if(cue.characterId==='cat'&&(!/^（.*）$/u.test(text)||/[「」]/u.test(text)))return false;
  }
  if(cue.kind==='relay'&&!CHARACTERS.has(cue.fromCharacterId))return false;
  if(cue.memoryId!==undefined&&!validId(cue.memoryId))return false;
  if(cue.choices!==undefined&&(!Array.isArray(cue.choices)||cue.choices.length>3||
    cue.choices.some(choice=>!validId(choice?.id)||!normalizeText(choice?.label)||
      choice.label.length>28||choice.text!==undefined&&
      (!normalizeText(choice.text)||choice.text.length>MAX_TEXT)||
      choice.relayTo!==undefined&&!CHARACTERS.has(choice.relayTo))))return false;
  return true;
}

export function validateForestDialogueCues(cues){
  if(!Array.isArray(cues))return [];
  const seen=new Set();
  return cues.slice(0,MAX_CUES).filter(cue=>{
    if(!validCue(cue)||seen.has(cue.id))return false;
    seen.add(cue.id);return true;
  });
}

function emptyState(){return {version:1,visits:{},lastKinds:{},seen:[],seenMemories:[],seenReviews:[],
  knownRead:[],freshRead:[],readInitialized:false,pendingRelay:null};}
function parseState(raw){
  try{
    const value=JSON.parse(raw);
    if(value?.version!==1)return emptyState();
    const visits={};
    for(const [id,count] of Object.entries(value.visits||{})){
      if(CHARACTERS.has(id))visits[id]=numbers(count,0,100000);
    }
    const lastKinds={};
    for(const [id,kind] of Object.entries(value.lastKinds||{})){
      if(CHARACTERS.has(id)&&KINDS.has(kind))lastKinds[id]=kind;
    }
    const ids=field=>unique((Array.isArray(value[field])?value[field]:[])
      .filter(validId)).slice(-MAX_SEEN);
    const relay=value.pendingRelay;
    return {version:1,visits,lastKinds,seen:ids('seen'),seenMemories:ids('seenMemories'),
      seenReviews:ids('seenReviews'),knownRead:ids('knownRead'),freshRead:ids('freshRead'),
      readInitialized:value.readInitialized===true,pendingRelay:
        CHARACTERS.has(relay?.to)&&CHARACTERS.has(relay?.from)?{from:relay.from,to:relay.to,
          memoryId:validId(relay.memoryId)?relay.memoryId:null}:null};
  }catch{return emptyState()}
}

function remember(items,id){if(validId(id)){const index=items.indexOf(id);if(index!==-1)items.splice(index,1);items.push(id);if(items.length>MAX_SEEN)items.shift()}}
function safeReview(entry){
  if(!validId(entry?.id)||!['verbatim','parent-summary'].includes(entry?.attribution))return null;
  const quote=normalizeText(entry.quote||entry.text);
  if(!quote||quote.length>3000)return null;
  return {id:entry.id,attribution:entry.attribution,quote};
}
function reviewExcerpt(review,narration=false){
  // The attribution is part of the actual dialogue; parent summaries are never
  // presented as words spoken by the child.
  const short=review.quote.slice(0,45).replace(/[「」]/gu,'');
  if(narration)return `「${short}${review.quote.length>45?'…':''}」（${review.attribution==='verbatim'?'本人の言葉':'保護者の記録'}）`;
  const label=review.attribution==='verbatim'?'きみのことば':'おうちの人が残した記録';
  return `${label}に「${short}${review.quote.length>45?'…':''}」とあったね。`;
}

/**
 * A local, choice-based director. Snapshot functions are invoked on every visit.
 * `getReflections(bookId)` reads only active, authorized reader reflections; it
 * must never return withdrawn items. An error is treated as no reflections.
 */
export function createForestDialogueDirector({getBooks=()=>[],getCatalog=()=>[],getCues=()=>[],
  getReflections=async()=>[],getTwinNames=()=>[],getTwinScenes=()=>[],
  storage=null,storageKey='forest-dialogue-local-v1',maxSpoilerLevel=2}={}){
  let state=parseState(storage?.getItem?.(storageKey)||null),active=null;
  const twins=createTwinConversationDirector({getBooks,getCatalog,
    getNamePairs:getTwinNames,getScenes:getTwinScenes});
  function persist(){
    try{storage?.setItem?.(storageKey,JSON.stringify(state))}catch{}
  }
  async function candidates(characterId){
    const books=await getBooks(),catalog=await getCatalog();
    const readable=new Set((Array.isArray(books)?books:[])
      .filter(book=>book?.status==='read'&&validId(book.id)).map(book=>book.id));
    // First launch starts from the current snapshot. Later read transitions
    // become fresh topics until an NPC actually discusses one of their facts.
    if(!state.readInitialized){state.knownRead=[...readable].slice(-MAX_SEEN);state.readInitialized=true}
    else{
      const previous=new Set(state.knownRead);
      for(const bookId of readable){if(!previous.has(bookId))remember(state.freshRead,bookId)}
      state.knownRead=[...readable].slice(-MAX_SEEN);
      state.freshRead=state.freshRead.filter(bookId=>readable.has(bookId));
    }
    persist();
    const memories=unlockedStoryMemories(books,catalog,{maxSpoilerLevel});
    const memoryById=new Map(memories.map(item=>[item.id,item]));
    const approved=validateForestDialogueCues(await getCues());
    const relevant=approved.filter(cue=>cue.characterId===characterId);
    const relayTargets=new Map();
    for(const voice of approved.filter(cue=>cue.kind==='story'&&memoryById.has(cue.memoryId))){
      if(!relayTargets.has(voice.memoryId))relayTargets.set(voice.memoryId,new Set());
      relayTargets.get(voice.memoryId).add(voice.characterId);
    }
    const voicedMemories=new Map(relevant.filter(cue=>cue.kind==='story')
      .map(cue=>[cue.memoryId,cue]));
    const reviewBooks=unique(relevant.filter(cue=>cue.kind==='reflection'&&cue.bookId&&
      readable.has(cue.bookId)).map(cue=>cue.bookId)).slice(0,5);
    const reviews=new Map();
    await Promise.all(reviewBooks.map(async bookId=>{
      try{reviews.set(bookId,(await getReflections(bookId)).map(safeReview).filter(Boolean).slice(0,5))}
      catch{reviews.set(bookId,[])}
    }));
    const options=[],lastKind=state.lastKinds[characterId];
    for(const [index,cue] of relevant.entries()){
      if(cue.kind==='meet'&&(state.visits[characterId]||0)>0)continue;
      if(cue.kind==='relay'&&!(state.pendingRelay?.to===characterId&&
        state.pendingRelay?.from===cue.fromCharacterId))continue;
      if(cue.kind==='relay'){
        const related=memoryById.get(state.pendingRelay?.memoryId)||null;
        if(related&&!voicedMemories.has(related.id)){
          // This NPC has no reviewed account of the same incident. Consume the
          // stale relay instead of repeatedly promising a missing conversation.
          state.pendingRelay=null;persist();continue;
        }
        options.push({cue,memory:related,voiceCue:related?voicedMemories.get(related.id):null,
          relayTargets,index,score:150+(related?4:0)});
        continue;
      }
      if(cue.kind==='story'){
        const matches=[memoryById.get(cue.memoryId)].filter(memory=>
          memory&&(!cue.bookId||cue.bookId===memory.bookId));
        for(const memory of matches){
          const relevance=String(memory.characters||'').split(/[\s,，、|]+/u).includes(characterId)?6:0;
          options.push({cue,memory,relayTargets,index,score:66+relevance+
            (state.seenMemories.includes(memory.id)?-35:22)+
            (state.seen.includes(cue.id)?-12:0)+
            (lastKind==='story'?-45:lastKind==='ambient'?18:0)+
            (state.freshRead.includes(memory.bookId)?42:0)});
        }
        continue;
      }
      if(cue.kind==='reflection'){
        for(const review of reviews.get(cue.bookId)||[]){
          options.push({cue,review,index,score:82+
            (state.seenReviews.includes(review.id)?-65:60)+
            (state.seen.includes(cue.id)?-12:0)+
            (lastKind==='reflection'?-120:0)});
        }
        continue;
      }
      const base={meet:160,ambient:40}[cue.kind];
      options.push({cue,index,score:base+(state.seen.includes(cue.id)?-12:20)+
        (cue.kind==='ambient'&&lastKind==='ambient'?-12:0)});
    }
    return options.sort((a,b)=>b.score-a.score||a.index-b.index||
      String(a.memory?.id||a.review?.id||'').localeCompare(String(b.memory?.id||b.review?.id||'')));
  }
  function render(option){
    const {cue,memory,review,voiceCue,relayTargets}=option;
    let text=normalizeText(cue.text);
    if(cue.kind==='story'&&!memory)return null;
    if(cue.kind==='relay'){
      // Relay preserves the episode ID, but can only quote a reviewed line
      // written for the *receiving* character. Never paste catalog prose.
      if(memory&&text.includes('{memory}')&&!voiceCue)return null;
      text=text.replaceAll('{memory}',normalizeText(voiceCue?.text));
    }
    if(review)text=text.replaceAll('{reflection}',reviewExcerpt(review,cue.characterId==='cat'));
    // A script with a required placeholder cannot render the wrong fact.
    if(/\{(?:memory|reflection)\}/u.test(text))return null;
    const choices=(cue.choices||[])
      .filter(choice=>!choice.relayTo||!memory||relayTargets?.get(memory.id)?.has(choice.relayTo))
      .map(choice=>({id:choice.id,label:choice.label}));
    if(!choices.length)choices.push({id:'another-topic',label:'ほかの話も聞く'});
    return {text,choices,sourceKind:cue.kind,
      ...(memory?.id?{sourceMemoryId:memory.id}:{})};
  }
  function selectOption(option,characterId){
    const response=render(option);if(!response)return null;
    active={characterId,option,choices:response.choices};
    remember(state.seen,option.cue.id);
    state.lastKinds[characterId]=option.cue.kind;
    if(option.memory)remember(state.seenMemories,option.memory.id);
    if(option.cue.kind==='story'&&option.memory){
      state.freshRead=state.freshRead.filter(id=>id!==option.memory.bookId);
    }
    if(option.review)remember(state.seenReviews,option.review.id);
    if(option.cue.kind==='relay')state.pendingRelay=null;
    persist();return response;
  }
  async function nextTopic(characterId,excludeKey='',preferredMemoryId=''){
    const options=await candidates(characterId);
    const preferred=preferredMemoryId&&options.find(option=>option.cue.kind==='story'&&
      option.memory?.id===preferredMemoryId&&render(option));
    const picked=preferred||options.find(option=>`${option.cue.id}:${option.memory?.id||option.review?.id||''}`!==excludeKey&&render(option))||
      options.find(option=>render(option));
    if(picked)return selectOption(picked,characterId);
    active=null;
    return {text:characterId==='cat'?'（ねこはしっぽをゆっくり振って、森の奥を見つめている。）':
      'いまは、森をいっしょに歩いてみよう。',choices:[]};
  }
  return {
    async start({characterId,preferredMemoryId=''}={}){
      if(!CHARACTERS.has(characterId))return {text:'また、森で会おうね。',choices:[]};
      active=null;
      if(characterId==='twins'){
        const result=await twins.start({encounter:state.visits.twins||0});
        if(result){state.visits.twins=numbers((state.visits.twins||0)+1,0,100000);
          persist();return result}
      }
      const result=await nextTopic(characterId,'',preferredMemoryId);
      state.visits[characterId]=numbers((state.visits[characterId]||0)+1,0,100000);
      persist();return result;
    },
    async select({characterId,choiceId}={}){
      if(characterId==='twins'&&twins.getActiveNames())return twins.select({choiceId});
      if(!active||active.characterId!==characterId||!active.choices.some(choice=>choice.id===choiceId))return null;
      const {option}=active;
      if(choiceId==='another-topic'){
        const key=`${option.cue.id}:${option.memory?.id||option.review?.id||''}`;
        return nextTopic(characterId,key);
      }
      const choice=option.cue.choices?.find(item=>item.id===choiceId);
      if(!choice)return null;
      if(choice.relayTo&&choice.relayTo!==characterId){
        state.pendingRelay={from:characterId,to:choice.relayTo,
          memoryId:option.memory?.id||null};persist();
      }
      const response=normalizeText(choice.text);
      if(response){active.choices=[];return {text:response,choices:[]}}
      return nextTopic(characterId,`${option.cue.id}:${option.memory?.id||option.review?.id||''}`);
    },
    async advance({characterId}={}){
      return characterId==='twins'?twins.advance():null;
    },
    end(){active=null;twins.end()},
    // Expose only a count summary for developer tests, never raw reviews.
    getProgress(){return {visits:{...state.visits},seenTopics:state.seen.length,
      seenMemories:state.seenMemories.length,seenReflections:state.seenReviews.length,
      nextNpc:state.pendingRelay?.to||null}}
  };
}
