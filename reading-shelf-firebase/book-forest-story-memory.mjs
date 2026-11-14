/**
 * The forest's read-only story-memory selector.
 *
 * Story facts are authored and reviewed in a PRIVATE catalog. This module must
 * never contain real family IDs, book IDs, reading records, or licensed text.
 * Callers supply the current Firestore bookshelf snapshot on every retrieval.
 * A read->unread transition therefore revokes access without an unlock cache.
 *
 * Memory record (schemaVersion 1):
 * {id, bookId, text, tags, characters, spoilerLevel, sourceUrl,
 *  evidenceStatus:'approved', confidence:'high'|'medium'}
 */

const DEFAULT_CONTEXT_CHARS=680;
const MAX_CONTEXT_CHARS=1200;
const MAX_ITEMS=4;
const ALLOWED_CHARACTERS=new Set([
  'king','cat','kiki','jiji','zorori','ishishi','noshishi','skipper','twins',
  'hachibee','hakase','mochan'
]);

function normalized(text){return String(text??'').normalize('NFKC').toLocaleLowerCase('ja-JP').trim()}
function terms(value){
  if(Array.isArray(value))return value.map(normalized).filter(Boolean);
  return String(value??'').split(/[、，,;；|\n]/u).map(normalized).filter(Boolean);
}
function safeLimit(value,defaultValue,upper){
  return Number.isSafeInteger(value)&&value>0?Math.min(value,upper):defaultValue;
}

/** Parse a PRIVATE Google Sheet values export without relying on column order. */
export function parseStoryMemoryRows(values){
  if(!Array.isArray(values)||!Array.isArray(values[0]))return [];
  const names=values[0].map(value=>String(value??''));
  const required=['schemaVersion','memoryId','bookId','bookTitle','text','tags','characters',
    'spoilerLevel','evidenceStatus','confidence','sourceUrl'];
  if(required.some(key=>!names.includes(key)))return [];
  return values.slice(1).filter(Array.isArray).map(row=>{
    const get=name=>row[names.indexOf(name)];
    return {schemaVersion:Number(get('schemaVersion')),id:String(get('memoryId')??''),
      bookId:String(get('bookId')??''),bookTitle:String(get('bookTitle')??''),
      text:String(get('text')??''),tags:String(get('tags')??''),
      characters:String(get('characters')??''),spoilerLevel:Number(get('spoilerLevel')),
      evidenceStatus:String(get('evidenceStatus')??''),confidence:String(get('confidence')??''),
      sourceUrl:String(get('sourceUrl')??'')};
  }).filter(record=>record.id);
}

/** Returns only approved, sourced memories for books whose current status is read. */
export function unlockedStoryMemories(books,catalog,{maxSpoilerLevel=2}={}){
  const readableIds=new Set((Array.isArray(books)?books:[])
    .filter(book=>book?.status==='read'&&typeof book?.id==='string'&&book.id.length>0)
    .map(book=>book.id));
  const spoiler=Number.isInteger(maxSpoilerLevel)?Math.min(3,Math.max(0,maxSpoilerLevel)):2;
  const usedIds=new Set();
  return (Array.isArray(catalog)?catalog:[]).filter(item=>{
    if(item?.schemaVersion!==1||typeof item?.id!=='string'||!item.id||usedIds.has(item.id))return false;
    if(typeof item.bookId!=='string'||!readableIds.has(item.bookId))return false;
    if(item.evidenceStatus!=='approved'||!['high','medium'].includes(item.confidence))return false;
    if(typeof item.sourceUrl!=='string'||!/^https:\/\/[^\s]+$/iu.test(item.sourceUrl))return false;
    if(typeof item.text!=='string'||!item.text.trim()||item.text.length>400)return false;
    if(!Number.isInteger(item.spoilerLevel)||item.spoilerLevel<0||item.spoilerLevel>spoiler)return false;
    usedIds.add(item.id);return true;
  });
}

/**
 * Keyword retrieval; no paid embedding/vector service or full-book prompt.
 * The character ID changes ranking, NEVER which already-read books are known.
 * `context` is the only text intended to be forwarded to a later LLM adapter.
 */
export function retrieveStoryMemory({books=[],catalog=[],query='',characterId='',maxItems=3,maxContextChars=DEFAULT_CONTEXT_CHARS,maxSpoilerLevel=2}={}){
  const ask=normalized(query);
  const limit=safeLimit(maxItems,3,MAX_ITEMS);
  const chars=safeLimit(maxContextChars,DEFAULT_CONTEXT_CHARS,MAX_CONTEXT_CHARS);
  const unlocked=unlockedStoryMemories(books,catalog,{maxSpoilerLevel});
  if(!ask)return {memories:[],context:'',unlockedCount:unlocked.length};
  const queryWords=ask.split(/[\s、。!?？！,，]+/u).filter(t=>t.length>1);
  // Japanese has no spaces; segment casual questions such as 「お城のことを教えて」.
  if(typeof Intl.Segmenter==='function'){
    for(const part of new Intl.Segmenter('ja',{granularity:'word'}).segment(ask)){
      const token=normalized(part.segment);
      if(part.isWordLike&&token.length>1)queryWords.push(token);
    }
  }
  const matches=unlocked.map((memory,index)=>{
    const labels=terms(memory.tags);
    const actors=terms(memory.characters);
    const fact=normalized(memory.text);
    const title=normalized(memory.bookTitle);
    let score=0;
    // Whole-query match is stronger than incidental one-character collisions.
    if(ask.length>=2&&fact.includes(ask))score+=8;
    if(ask.length>=2&&title.includes(ask))score+=7;
    for(const label of labels){
      if(label.length>=2&&(ask.includes(label)||label.includes(ask)))score+=6;
      else if(label.length===1&&ask.includes(label))score+=1;
    }
    for(const word of queryWords){
      if(word.length>=2&&fact.includes(word))score+=3;
      if(word.length>=2&&title.includes(word))score+=4;
      if(word.length>=2&&labels.some(tag=>tag.includes(word)))score+=4;
    }
    if(score>0&&ALLOWED_CHARACTERS.has(characterId)&&actors.includes(characterId))score+=2;
    return {memory,index,score};
  }).filter(item=>item.score>0).sort((a,b)=>b.score-a.score||a.index-b.index);
  const selected=[];let used=0;
  for(const {memory} of matches){
    if(selected.length>=limit)break;
    const story=memory.text.trim().replace(/\s+/gu,' ');
    if(used+story.length+4>chars)continue;
    selected.push(memory);used+=story.length+4;
  }
  // Do not append URLs, private Firestore IDs or reader data to LLM prompts.
  const context=selected.map((memory,index)=>`${index+1}. ${memory.text.trim().replace(/\s+/gu,' ')}`).join('\n');
  return {memories:selected,context,unlockedCount:unlocked.length};
}

export function storyMemoryPrompt(selection){
  if(!selection?.context)return '';
  return `以下は読了済みの本から公開資料で確認できた事実です。登場人物としての口調を保ち、作品の筋を勝手に補わず、知らないことは知らないと答えてください。自分が読者の読書現場を目撃したかのような発言もしないでください。\n${selection.context}`;
}
