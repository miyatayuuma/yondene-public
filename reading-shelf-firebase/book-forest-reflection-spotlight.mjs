import {FOREST_AI_GENERATION_IDS,forestMemoryBelongsToCharacter} from './forest-character-registry.mjs';
// The forest's reflection event scheduler. Private quotes stay in memory only.
// A new reflection may affect any NPC, but must not become every NPC's topic.
import {unlockedStoryMemories} from './book-forest-story-memory.mjs';

const GENERATORS=new Set(FOREST_AI_GENERATION_IDS);
const MAX_FRESH_DAYS=14;
const KEY=/^[a-z0-9]{1,12}$/u;
const clean=(value,max)=>String(value??'').trim().replace(/\s+/gu,' ').slice(0,max);
const dayJapan=now=>new Date(now+9*3600000).toISOString().slice(0,10);
function hash(value){
  let n=2166136261;
  for(const char of String(value))n=Math.imul(n^char.codePointAt(0),16777619);
  return (n>>>0).toString(36);
}
function validKeys(value,limit=250){
  return [...new Set((Array.isArray(value)?value:[]).filter(x=>
    typeof x==='string'&&KEY.test(x)))].slice(-limit);
}
function load(storage,key,now){
  let raw;
  try{raw=JSON.parse(storage?.getItem?.(key)||'null')}catch{}
  // v11 tracked usage separately for every NPC. Honor all displayed uses
  // when migrating, otherwise a newly installed v12 replays old reactions.
  const acknowledged=raw?.version===2?validKeys(raw.acknowledged):
    raw?.version===1&&raw.seen&&typeof raw.seen==='object'?
      validKeys(Object.values(raw.seen).flatMap(x=>Array.isArray(x)?x:[])):[];
  const day=dayJapan(now);
  const active=raw?.version===2&&raw.day===day;
  return {version:2,day,acknowledged,
    visits:active&&Number.isSafeInteger(raw.visits)?Math.max(0,raw.visits):0,
    lastReactionVisit:active&&Number.isSafeInteger(raw.lastReactionVisit)?
      Math.max(0,raw.lastReactionVisit):0,
    reactors:active?(Array.isArray(raw.reactors)?raw.reactors.filter(x=>GENERATORS.has(x)):[]):[],
    books:active?validKeys(raw.books,20):[]};
}
function save(storage,key,state){
  try{storage?.setItem?.(key,JSON.stringify(state))}catch{}
}
function stamp(value){
  const n=Number(value);
  return Number.isFinite(n)&&n>0?n:0;
}
function affinityFor(bookId,characterId,memories,cues){
  if(memories.some(memory=>memory.bookId===bookId&&forestMemoryBelongsToCharacter(memory,characterId)))
    return 2;
  const relatedMemories=new Set(memories.filter(memory=>memory.bookId===bookId).map(m=>m.id));
  if((Array.isArray(cues)?cues:[]).some(cue=>cue?.approval==='approved'&&
      cue.characterId===characterId&&cue.kind==='story'&&
      (cue.bookId===bookId||relatedMemories.has(cue.memoryId))))return 1;
  return 0;
}

/** Choose an unacknowledged NEW review only when the caller has an ambient slot.
 * No direct/indirect character relation is required: unknown books are allowed.
 * There is no quality or length scoring for the reader's reflection.
 */
export function chooseForestReflectionSpotlight({characterId,books=[],reflections=[],
  catalog=[],cues=[],state={},now=Date.now()}={}){
  if(!GENERATORS.has(characterId)||!Array.isArray(reflections))return null;
  if((state.reactors||[]).includes(characterId))return null;
  // At least two non-review NPC encounters must be displayed between reactions.
  if(state.lastReactionVisit>0&&(state.visits||0)-state.lastReactionVisit<2)return null;
  const readBooks=new Map((Array.isArray(books)?books:[])
    .filter(book=>book?.status==='read'&&typeof book.id==='string')
    .map(book=>[book.id,book]));
  const memories=unlockedStoryMemories(books,catalog);
  const acknowledged=new Set(state.acknowledged||[]);
  const discussedBooks=new Set(state.books||[]);
  const candidates=[];
  for(const review of reflections){
    if(!review||!readBooks.has(review.bookId)||
      !['verbatim','parent-summary'].includes(review.attribution)||
      typeof review.id!=='string'||!review.id)continue;
    const at=stamp(review.createdAt);
    const ageDays=(now-at)/86400000;
    if(ageDays< -1||ageDays>MAX_FRESH_DAYS)continue;
    const quote=clean(review.quote,180);
    if(!quote)continue;
    const key=hash(review.bookId+':'+review.id);
    const bookKey=hash(review.bookId);
    if(acknowledged.has(key)||discussedBooks.has(bookKey))continue;
    const book=readBooks.get(review.bookId);
    const affinity=affinityFor(review.bookId,characterId,memories,cues);
    const incident=memories.find(memory=>memory.bookId===review.bookId&&
      forestMemoryBelongsToCharacter(memory,characterId))||
      memories.find(memory=>memory.bookId===review.bookId);
    candidates.push({key,bookKey,sourceBookId:review.bookId,createdAt:at,
      // Recency dominates, with a modest bonus for an actual character relation.
      score:Math.round((MAX_FRESH_DAYS-ageDays)*5)+affinity*18,
      bookTitle:clean(book.title,80),
      summary:/^https:\/\/[^\s]+$/u.test(book.synopsisSourceUrl||'')?
        clean(book.synopsis,260):'',
      storyContext:incident?clean(incident.text,160):'',
      quote,attribution:review.attribution,
      perspective:affinity?
        'この本と関係のある人物。ただし原作で確認できない出来事は経験したと語らない。':
        '他の作品への感想を聞いた第三者。物語の登場人物だったふりをしない。'});
  }
  candidates.sort((a,b)=>b.score-a.score||b.createdAt-a.createdAt||
    a.key.localeCompare(b.key));
  if(!candidates.length)return null;
  const {score,createdAt,...selected}=candidates[0];
  return selected;
}

/** Re-read the current source on continuation; a cached quote is not authority. */
export function isCurrentForestReflection(evidence,{books=[],reflections=[]}={}){
  return books.some(book=>book.id===evidence?.sourceBookId&&book.status==='read')&&
    reflections.some(review=>review.bookId===evidence.sourceBookId&&
      hash(review.bookId+':'+review.id)===evidence.key&&
      review.attribution===evidence.attribution&&clean(review.quote,180)===evidence.quote);
}

export function createForestReflectionSpotlightSession({storage=null,
  storageKey='forest-reflection-reactions-v1',now=()=>Date.now()}={}){
  function choose({characterId,books=[],reflections=[],catalog=[],cues=[]}={}){
    return chooseForestReflectionSpotlight({characterId,books,reflections,catalog,cues,
      state:load(storage,storageKey,now()),now:now()});
  }
  // Called once per actually displayed encounter, not each generated line.
  function visited(){
    const state=load(storage,storageKey,now());
    state.visits++;
    save(storage,storageKey,state);
  }
  function displayed(characterId,spotlight){
    if(!GENERATORS.has(characterId)||!KEY.test(spotlight?.key||'')||
      !KEY.test(spotlight?.bookKey||''))return;
    const state=load(storage,storageKey,now());
    state.acknowledged=validKeys([...state.acknowledged,spotlight.key]);
    state.books=validKeys([...state.books,spotlight.bookKey],20);
    state.reactors=[...new Set([...state.reactors,characterId])];
    state.lastReactionVisit=state.visits;
    save(storage,storageKey,state);
  }
  return {choose,visited,displayed};
}
