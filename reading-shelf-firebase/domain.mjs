// App-domain contract: an unread book and a book of interest are the SAME shelf
// state. Recommendation intent belongs to the separate recommendations feature.
// See docs/unread-interest-model.md; display copy may change, persisted key must not.
export const STATUSES=Object.freeze({read:'読んだ',reading:'読んでる',paused:'お休み中',unread:'きになる'});
export const INTEREST_SHELF_STATUS='unread';
export const isInterestBook=book=>book?.status===INTEREST_SHELF_STATUS;
// UI-only filter. Do not add this key to persisted STATUSES or Firestore.
export const ACTIVE_READ_FILTER='active-read';
export const READING_MODES=Object.freeze({'read-aloud':'読み聞かせ','independent':'自力読書','mixed':'併用'});
export function readingModeLabel(book){
  return Object.hasOwn(READING_MODES,book?.readingMode)?READING_MODES[book.readingMode]:'';
}
const collator=new Intl.Collator('ja',{numeric:true,sensitivity:'base'});
export function normalize(v){return String(v??'').normalize('NFKC').toLowerCase().replace(/[\s\u3000『』（）・\-]/g,'')}
export function cleanTitle(t){return String(t??'').trim().slice(0,250)}
export function validDate(s){return s===''||/^\d{4}-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?$/.test(s)}
export function validMonth(s){return !s||/^\d{4}-(0[1-9]|1[0-2])$/.test(s)}
// Historical periods may be month/term/year ranges; newly reported exact
// completion dates remain ISO YYYY-MM-DD. Display and sort never compare
// localized text labels, and never infer an exact day for historic records.
export function readPeriodLabel(b){
  if(b.finishedPeriodLabel)return b.finishedPeriodLabel;
  const date=String(b.finishedAt||"");
  const m=/^(\d{4})-(0[1-9]|1[0-2])(?:-([0-2]\d|3[01]))?$/.exec(date);
  if(!m)return "時期未登録";
  return m[1]+"年"+Number(m[2])+"月"+(m[3]?Number(m[3])+"日":"");
}

// Card-only projection. Does not change detailed labels or chronological sort.
export function compactReadPeriodLabel(book){
  if(book?.status!=='read')return '';
  const label=String(book.finishedPeriodLabel||'').trim();
  const start=String(book.finishedPeriodStart||'').trim();
  const end=String(book.finishedPeriodEnd||'').trim();
  const exact=String(book.finishedAt||'').trim();
  // Parent-confirmed display refinements. Both stable ID and original record must match.
  if(!exact&&book.id==='initial-01'&&book.title==='星モグラサンジの伝説'&&
      label==='2025年度・年長'&&start==='2025-04'&&end==='2026-03')return '2025';
  if(!exact&&book.id==='initial-02'&&book.title==='窓ぎわのトットちゃん'&&
      label==='2026年度・小1・1学期'&&start==='2026-04'&&end==='2026-07')return '2026.春';
  const month=(year,value)=>year+'.'+String(Number(value)).padStart(2,'0');
  if(label){
    let m=/^(\d{4})年(1[0-2]|0?[1-9])月(?:([12]?\d|3[01])日)?$/.exec(label);
    if(m)return month(m[1],m[2]);
    m=/^(\d{4})-(0[1-9]|1[0-2])(?:-(?:[12]\d|3[01]|0[1-9]))?$/.exec(label);
    if(m)return month(m[1],m[2]);
    m=/^(\d{4})年[・\s]*(春|夏|秋|冬)(?:休み)?$/.exec(label);
    if(m)return m[1]+'.'+m[2];
    m=/^(\d{4})(?:年)?$/.exec(label);
    if(m)return m[1];
    // For a broad school-term label, a year is safe only if both bounds
    // fall within that calendar year (no guessed month or season).
    const year=start.slice(0,4);
    if(/^20\d{2}$/.test(year)&&start.startsWith(year+'-')&&end.startsWith(year+'-')&&
       /^20\d{2}年度/.test(label)&&label.slice(0,4)===year)return year;
    return '';
  }
  let m=/^(\d{4})-(0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?$/.exec(exact);
  if(m)return month(m[1],m[2]);
  if(start&&start===end){
    m=/^(\d{4})-(0[1-9]|1[0-2])$/.exec(start);
    if(m)return month(m[1],m[2]);
  }
  if(/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(start)&&
     /^20\d{2}-(?:0[1-9]|1[0-2])$/.test(end)&&
     start.slice(0,4)===end.slice(0,4))return start.slice(0,4);
  return '';
}

export function readPeriodStart(b){return b.finishedPeriodStart||String(b.finishedAt||"").slice(0,7)}
export function readPeriodEnd(b){return b.finishedPeriodEnd||String(b.finishedAt||"").slice(0,7)}
export function readPeriodGrouping(b){
  if(b.finishedPeriodLabel)return b.finishedPeriodLabel;
  const m=/^(\d{4})-(0[1-9]|1[0-2])/.exec(String(b.finishedAt||""));
  return m?m[1]+"年"+Number(m[2])+"月":"時期未登録";
}
export function readPeriodSortKey(b){
  const exact=String(b.finishedAt||"");
  const month=String(b.finishedPeriodStart||"");
  const validExact=/^\d{4}-(0[1-9]|1[0-2])-[0-3]\d$/.test(exact);
  // Explicit historical period ranges take precedence over an unrelated date.
  if(validExact&&(!month||month===exact.slice(0,7)))return exact;
  if(/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return month+"-01";
  if(/^\d{4}-(0[1-9]|1[0-2])$/.test(exact))return exact+"-01";
  return "";
}
export function sortBooks(books,sort="order-new"){
  if(sort==="rating-high"){
    const score=b=>Number.isInteger(b.childRating)&&b.childRating>=1&&b.childRating<=5?b.childRating:null;
    return [...books].sort((a,b)=>{
      const x=score(a),y=score(b);
      if(x===null||y===null){
        if(x===null&&y===null)return collator.compare(a.title||"",b.title||"");
        return x===null?1:-1;
      }
      if(x!==y)return y-x;
      const ax=readPeriodSortKey(a),bx=readPeriodSortKey(b);
      if(ax!==bx)return !ax?1:!bx?-1:collator.compare(bx,ax);
      return collator.compare(a.title||"",b.title||"");
    });
  }
  const dateSort=["order-new","order-old","read-new","read-old"].includes(sort);
  if(dateSort){
    const dir=["order-new","read-new"].includes(sort)?-1:1;
    return [...books].sort((a,b)=>{
      const aDate=readPeriodSortKey(a),bDate=readPeriodSortKey(b);
      // Undated books always follow books with a known year/month/day.
      if(Boolean(aDate)!==Boolean(bDate))return aDate?-1:1;
      if(aDate&&bDate&&aDate!==bDate)return dir*collator.compare(aDate,bDate);
      const ao=Number.isSafeInteger(a.readOrder)&&a.readOrder>0?a.readOrder:null;
      const bo=Number.isSafeInteger(b.readOrder)&&b.readOrder>0?b.readOrder:null;
      if(ao!==null&&bo!==null&&ao!==bo)return dir*(ao-bo);
      if((ao===null)!==(bo===null))return ao===null?1:-1;
      return collator.compare(a.title||"",b.title||"");
    });
  }
  const fields={
    "author-asc":["authorKana",1],
    "author-desc":["authorKana",-1],
    "title-asc":["titleKana",1],
    "title-desc":["titleKana",-1],
    "year-new":["publicationYear",-1],
    "year-old":["publicationYear",1]
  };
  const [field,dir]=fields[sort]||fields["title-asc"];
  return [...books].sort((a,b)=>{
    const pick=o=>field==="authorKana"?(o.authorKana||o.author):field==="titleKana"?(o.titleKana||o.title):o[field];
    const x=pick(a),y=pick(b),missing=v=>v===undefined||v===null||v==="";
    if(missing(x)!==missing(y))return missing(x)?1:-1;
    const diff=missing(x)?0:dir*collator.compare(String(x),String(y));
    return diff||collator.compare(a.title||"",b.title||"");
  });
}

export function filteredBooks(books,{search='',filter=ACTIVE_READ_FILTER,sort='order-new'}={},series=[]){
  const q=normalize(search), names=new Map(series.map(s=>[s.id,s.name]));
  const active=filter===ACTIVE_READ_FILTER;
  const matched=books.filter(b=>(filter==='all'||(active?['reading','read'].includes(b.status):
      filter===INTEREST_SHELF_STATUS?isInterestBook(b):b.status===filter))
    &&normalize([b.title,b.titleKana,b.author,b.authorKana,names.get(b.seriesId)].join(' ')).includes(q));
  // Pin currently reading books above completed books in the combined shelf,
  // regardless of sort choice. All-books and single-status views sort normally.
  return active&&sort!=='rating-high'
    ?[...sortBooks(matched.filter(b=>b.status==='reading'),sort),
      ...sortBooks(matched.filter(b=>b.status==='read'),sort)]
    :sortBooks(matched,sort);
}
export function validateBackup(raw){
  if(!raw||raw.version!==1||!Array.isArray(raw.books)||!Array.isArray(raw.series))throw Error('読書記録のJSON形式が正しくありません');
  if(raw.books.length>10000||raw.series.length>1000)throw Error('データ件数が上限を超えています');
  const ids=new Set();for(const b of raw.books){
    if(!b||typeof b.id!=='string'||b.id.length>200||!b.id||ids.has(b.id))throw Error('書籍IDが重複または不正です');
    if(!cleanTitle(b.title)||!Object.hasOwn(STATUSES,b.status))throw Error('作品名または読書状況が不正です');
    ids.add(b.id);
  }
  const seriesIds=new Set();for(const s of raw.series){
    if(!s||typeof s.id!=='string'||!s.id||seriesIds.has(s.id)||!cleanTitle(s.name))throw Error('シリーズ情報が不正です');
    seriesIds.add(s.id);
  }
  return {books:raw.books,series:raw.series};
}
export function normalizeBook(src){
  const title=cleanTitle(src.title);if(!title)throw Error('作品名を入力してください');
  const status=src.status;if(!Object.hasOwn(STATUSES,status))throw Error('読書状況が不正です');
  const finishedAt=status==='read'?String(src.finishedAt||'').trim():'';
  if(!validDate(finishedAt))throw Error('読了時期はYYYY-MMまたはYYYY-MM-DDです');
  const start=String(src.finishedPeriodStart||'').trim(),end=String(src.finishedPeriodEnd||'').trim(),label=String(src.finishedPeriodLabel||'').trim();
  if(!validMonth(start)||!validMonth(end))throw Error('期間の月はYYYY-MMで入力してください');
  if((start&&!end)||(!start&&end)|| (start&&end&&start>end))throw Error('期間の開始・終了月を確認してください');
  if(label.length>160)throw Error('読了時期の表示名は160文字以内です');
  if(status!=='read'&&(start||end||label))throw Error('未読・中断の本には読了期間を登録できません');
  const cover=String(src.coverUrl||'').trim();
  if(cover&&!/^https:\/\//i.test(cover)&&!/^data:image\/(?:jpeg|png|webp);base64,/i.test(cover))throw Error('表紙はHTTPS画像URLまたは画像データのみ指定できます');
  if(cover.length>650000)throw Error('表紙画像が大きすぎます');
  const toNum=v=>v?Number(v):null;
  return {...src,title,status,finishedAt,finishedPeriodStart:start,finishedPeriodEnd:end,
    finishedPeriodLabel:label,coverUrl:cover,
    publicationYear:toNum(src.publicationYear),volume:toNum(src.volume),
    pageCount:toNum(src.pageCount),updatedAt:new Date().toISOString()};
}
export function newBook(){return {id:crypto.randomUUID(),title:'',titleKana:'',author:'',authorKana:'',status:'unread',publicationYear:null,finishedAt:'',finishedPeriodStart:'',finishedPeriodEnd:'',finishedPeriodLabel:'',isbn:'',seriesId:'',volume:null,edition:'',publisher:'',ageLabel:'',ageSource:'',coverUrl:'',notes:'',readOrder:null,readingMode:''}}

// Patch-only import: never overwrites the book record, status, or family notes.
export function validatePeriodUpdates(raw){
  if(!raw||raw.schemaVersion!==1||raw.type!=='reading-period-update'||!Array.isArray(raw.books))throw Error('読了時期の更新ファイル形式が不正です');
  if(raw.books.length===0||raw.books.length>10000)throw Error('期間の件数が不正です');
  const ids=new Set();
  return raw.books.map((b)=>{
    if(!b||typeof b.id!=='string'||!b.id||b.id.includes('/')||ids.has(b.id))throw Error('期間情報のIDが重複または不正です');
    ids.add(b.id);
    if(typeof b.title!=='string'||!b.title.trim())throw Error('書名を指定してください');
    const start=b.finishedPeriodStart,end=b.finishedPeriodEnd,label=b.finishedPeriodLabel;
    if(!validMonth(start)||!start||!validMonth(end)||!end||start>end)throw Error('期間の年月が不正です: '+b.title);
    if(typeof label!=='string'||!label.trim()||label.length>160)throw Error('表示名が不正です: '+b.title);
    if(!['school_year','school_term','school_holiday','month','month_range','quarter'].includes(b.finishedPeriodPrecision))throw Error('読了時期の精度が不正です: '+b.title);
    if(typeof b.finishedPeriodBasis!=='string'||b.finishedPeriodBasis.length>120)throw Error('根拠情報が不正です');
    if(b.finishedPeriodNote!==undefined&&(typeof b.finishedPeriodNote!=='string'||b.finishedPeriodNote.length>1500))throw Error('注記が不正です');
    return b;
  });
}

/** A missing search result is different from an empty catalog or an empty series. */
export function emptyStateMessage({view='shelf',search='',hasBooks=true}={}){
  if(String(search).trim())return '検索に一致する本はありません。検索語を変えてお試しください。';
  if(view==='series')return 'シリーズに登録された本はまだありません。';
  if(!hasBooks)return '本棚にはまだ本が登録されていません。';
  return 'この条件に当てはまる本はありません。';
}
