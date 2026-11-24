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
