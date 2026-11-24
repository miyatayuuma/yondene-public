// Shared production/test selection policy. This module has no household data,
// credentials or service calls; callers supply an authorized snapshot.
const isRead=book=>book?.status==='read'&&typeof book.id==='string'&&book.id.length>0;
const time=value=>value?.toMillis?.()??(typeof value==='number'?value:0);

/** Activity has already been sorted newest-first by the caller. Identical
 * Firestore limit(60), read-status, visibility, dedupe and limit(12) policy.
 */
export function selectRecentForestReflectionEntries(activities=[],books=[]){
  const readIds=new Set((Array.isArray(books)?books:[]).filter(isRead).map(book=>book.id));
  const seen=new Set(),selected=[];
  for(const entry of (Array.isArray(activities)?activities:[]).slice(0,60)){
    if(entry?.kind!=='reflection'||entry.hidden||!readIds.has(entry.bookId)||
      typeof entry.sourceId!=='string'||!entry.sourceId)continue;
    const key=entry.bookId+':'+entry.sourceId;
    if(seen.has(key))continue;
    seen.add(key);selected.push(entry);
    if(selected.length>=12)break;
  }
  return selected;
}

/** Resolve the current childReflections record, never an old event excerpt.
 * The withdrawn/hidden/unauthorized record is not eligible, even if an old
 * activity row refers to it. Preserve verbatim vs parent-summary attribution.
 */
export function normalizeRecentForestReflection(entry,record,{id=''}={}){
  if(!record||record.hidden||!['verbatim','parent-summary'].includes(record.attribution)||
    typeof entry?.bookId!=='string'||typeof id!=='string'||!id)return null;
  const quote=String(record.quote||record.text||'').trim();
  const createdAt=time(record.createdAt)||time(entry.createdAt);
  return quote&&createdAt?{id,bookId:entry.bookId,quote,
    attribution:record.attribution,createdAt}:null;
}
