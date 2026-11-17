import {selectRecentForestReflectionEntries,normalizeRecentForestReflection}
  from './book-forest-reflection-source.mjs';

// Only interpret Firestore's *read-only* synchronized JSON mirror. This is a
// bounded, freshness-checked test fixture, NOT a new bookshelf authority.
// Do not log/serialize family IDs, member UIDs, quotes or raw snapshot rows.
const MAX_ROWS=1000, MAX_BYTES=2000000, MAX_AGE_MS=2*60*60*1000;
const parseTime=value=>Number.isFinite(Date.parse(String(value||'')))?Date.parse(value):0;
const get=(fields,key)=>{
  const v=fields?.[key];
  if(!v||typeof v!=='object')return undefined;
  if('stringValue' in v)return v.stringValue;
  if('timestampValue' in v)return parseTime(v.timestampValue);
  if('booleanValue' in v)return v.booleanValue;
  if('integerValue' in v)return Number(v.integerValue);
  if('doubleValue' in v)return Number(v.doubleValue);
  return undefined;
};
const safeId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,120}$/u.test(v);
const bookFields=['title','status','finishedAt','synopsis','synopsisSourceUrl'];

/** Fail closed on stale, incomplete, multi-family or malformed mirrors.
 * Source rows match the five-column Firestore原本 schema; syncAt must come
 * independently from 同期状態/前回成功, never from book.updatedAt.
 */
export function parseForestBookshelfMirror(rows,{syncAt,now=Date.now(),
  maxAgeMs=MAX_AGE_MS}={}){
  if(!Array.isArray(rows)||!Array.isArray(rows[0])||rows.length>MAX_ROWS+1)
    throw Error('MIRROR_SHAPE');
  const header=rows[0].map(String),cols=['文書パス','分割番号','分割数','Firestore JSON'];
  if(cols.some(name=>!header.includes(name)))throw Error('MIRROR_HEADERS');
  const age=now-parseTime(syncAt);
  if(!Number.isFinite(age)||age< -600000||age>maxAgeMs)throw Error('MIRROR_STALE');
  const index=Object.fromEntries(cols.map(k=>[k,header.indexOf(k)]));
  const chunks=new Map();let bytes=0,root=null;
  for(const row of rows.slice(1)){
    const path=String(row?.[index['文書パス']]||'');
    if(!path)continue;
    const parts=path.split('/');
    if(parts[0]!=='families'||!safeId(parts[1]))throw Error('MIRROR_SCOPE');
    if(root===null)root=parts[1];
    if(root!==parts[1])throw Error('MIRROR_MULTIFAMILY');
    const i=Number(row[index['分割番号']]),n=Number(row[index['分割数']]);
    const chunk=String(row[index['Firestore JSON']]||'');
    bytes+=chunk.length;
    if(bytes>MAX_BYTES||!Number.isInteger(i)||!Number.isInteger(n)||
      i<1||n<1||n>100||i>n||!chunk)throw Error('MIRROR_PARTS');
    if(!chunks.has(path))chunks.set(path,{n,parts:new Map()});
    const part=chunks.get(path);
    if(part.n!==n||part.parts.has(i))throw Error('MIRROR_DUPLICATE');
    part.parts.set(i,chunk);
  }
  if(!root||!chunks.has('families/'+root))throw Error('MIRROR_MISSING_ROOT');
  const books=[],activities=[],records=new Map();
  for(const [path,part] of chunks){
    if(part.parts.size!==part.n)throw Error('MIRROR_INCOMPLETE');
    let doc;
    try{doc=JSON.parse(Array.from({length:part.n},(_,i)=>part.parts.get(i+1)||'').join(''))}
    catch{throw Error('MIRROR_JSON')}
    if(!doc||typeof doc.fields!=='object')throw Error('MIRROR_DOCUMENT');
    const p=path.split('/'),f=doc.fields;
    if(p.length===4&&p[2]==='books'&&safeId(p[3])){
      const book={id:p[3]};
      for(const k of bookFields){const v=get(f,k);if(typeof v==='string')book[k]=v}
      books.push(book);
    }else if(p.length===4&&p[2]==='activity'&&safeId(p[3])){
      activities.push({kind:get(f,'kind'),bookId:get(f,'bookId'),
        sourceId:get(f,'sourceId'),hidden:get(f,'hidden')===true,
        createdAt:get(f,'createdAt')||0});
    }else if(p.length===6&&p[2]==='books'&&p[4]==='childReflections'&&
      safeId(p[3])&&safeId(p[5])){
      records.set(p[3]+':'+p[5],{id:p[5],hidden:get(f,'hidden')===true,
        attribution:get(f,'attribution'),quote:get(f,'quote'),
        text:get(f,'text'),createdAt:get(f,'createdAt')||0});
    }
  }
  if(!books.length)throw Error('MIRROR_NO_BOOKS');
  // Firestore query(activity, orderBy(createdAt,desc), limit(60)).
  activities.sort((a,b)=>b.createdAt-a.createdAt);
  const selected=selectRecentForestReflectionEntries(activities,books);
  const reflections=selected.map(event=>{
    const record=records.get(event.bookId+':'+event.sourceId);
    return normalizeRecentForestReflection(event,record,{id:record?.id||''});
  }).filter(Boolean);
  return {books,reflections,snapshotAt:parseTime(syncAt),
    bookCount:books.length,readCount:books.filter(b=>b.status==='read').length,
    reflectionCount:reflections.length};
}
