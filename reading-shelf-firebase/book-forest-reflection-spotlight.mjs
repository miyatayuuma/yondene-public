// Read-only selection of real child reflections for character reactions.
// No personal review text or Firestore identifiers are written to localStorage.
import {unlockedStoryMemories} from './book-forest-story-memory.mjs';

const SPEAKERS=new Set(['king','kiki','jiji','skipper','zorori','ishishi','noshishi',
  'hachibee','hakase','mochan']);
const normalize=(value,max)=>String(value??'').trim().replace(/\s+/gu,' ').slice(0,max);
function hash(value){
  let n=2166136261;
  for(const char of String(value))n=Math.imul(n^char.codePointAt(0),16777619);
  return (n>>>0).toString(36);
}
function load(storage,key){
  try{
    const value=JSON.parse(storage?.getItem?.(key)||'null');
    return value?.version===1&&value.seen&&typeof value.seen==='object'?value:
      {version:1,seen:{}};
  }catch{return {version:1,seen:{}}}
}
function stamp(value){
  const n=Number(value);
  return Number.isFinite(n)&&n>0?n:0;
}

/**
 * React to a review of ANY read book, even when the speaking NPC is from
 * another story. The only text sent to the model is a bounded excerpt,
 * a book title and independently sourced background. Never infer feelings.
 */
export function chooseForestReflectionSpotlight({characterId,books=[],reflections=[],
  catalog=[],seen={},now=Date.now()}={}){
  if(!SPEAKERS.has(characterId)||!Array.isArray(reflections))return null;
  const readBooks=new Map((Array.isArray(books)?books:[])
    .filter(book=>book?.status==='read'&&typeof book.id==='string')
    .map(book=>[book.id,book]));
  const memories=unlockedStoryMemories(books,catalog);
  const selected=new Map();
  for(const review of reflections){
    if(!review||!readBooks.has(review.bookId)||
      !['verbatim','parent-summary'].includes(review.attribution)||
      typeof review.id!=='string'||!review.id)continue;
    const quote=normalize(review.quote,180);
    if(!quote)continue;
    const book=readBooks.get(review.bookId);
    const at=stamp(review.createdAt);
    if(!at)continue;
    const key=hash(review.bookId+':'+review.id);
    const usedBy=Object.entries(seen).filter(([,entries])=>
      Array.isArray(entries)&&entries.includes(key)).length;
    if((seen[characterId]||[]).includes(key))continue;
    const age=Math.max(0,Math.floor((now-at)/86400000));
    const ageBonus=age<=2?120:age<=14?60:age<=45?20:0;
    const score=ageBonus-Math.min(8,usedBy)*18+Math.min(20,at/1e12);
    const related=memories.find(memory=>memory.bookId===review.bookId);
    const item={
      key,bookTitle:normalize(book.title,80),
      summary:/^https:\/\/[^\s]+$/u.test(book.synopsisSourceUrl||'')?
        normalize(book.synopsis,260):'',
      storyContext:related?normalize(related.text,160):'',
      quote,attribution:review.attribution,
      perspective:'読んだ本への感想を聞いた第三者として反応。自分が登場した／経験したと偽らない。',
      score,createdAt:at
    };
    const prior=selected.get(key);
    if(!prior||prior.createdAt<at)selected.set(key,item);
  }
  const sorted=[...selected.values()].sort((a,b)=>b.score-a.score||
    b.createdAt-a.createdAt||a.key.localeCompare(b.key));
  if(!sorted.length)return null;
  const {score,createdAt,...safe}=sorted[0];
  return safe;
}

export function createForestReflectionSpotlightSession({storage=null,
  storageKey='forest-reflection-reactions-v1',now=()=>Date.now()}={}){
  function choose({characterId,books=[],reflections=[],catalog=[]}={}){
    return chooseForestReflectionSpotlight({characterId,books,reflections,catalog,
      now:now(),seen:load(storage,storageKey).seen});
  }
  function displayed(characterId,spotlight){
    if(!SPEAKERS.has(characterId)||!/^[a-z0-9]{1,12}$/u.test(spotlight?.key||''))return;
    const state=load(storage,storageKey);
    const existing=Array.isArray(state.seen[characterId])?state.seen[characterId]:[];
    state.seen[characterId]=[...new Set([...existing,spotlight.key])].slice(-50);
    try{storage?.setItem?.(storageKey,JSON.stringify(state))}catch{}
  }
  return {choose,displayed};
}
