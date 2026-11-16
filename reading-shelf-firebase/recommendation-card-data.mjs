// Pure, public-book image candidates and owner handoff. Never writes shelf data.
import {canonicalIsbn} from './bibliography-identity.mjs';
import {normalize} from './domain.mjs';

const https=value=>typeof value==='string'&&/^https:\/\/[^\s]+$/i.test(value)&&value.length<=1500?value:'';
const key=value=>normalize(String(value||''));
const titleAndAuthorMatch=(a,b)=>key(a.title)===key(b.title)&&key(a.author)&&key(a.author)===key(b.author);
function isbnFromSource(rec){
  const explicit=canonicalIsbn(rec.isbn);
  if(explicit)return explicit;
  const url=https(rec.url);
  // A publication link can contain an ISBN; other arbitrary numbers are not trusted.
  const m=url.match(/(?:isbn\/|\/books\/|\/bd\/|\/)(97[89]\d{10})(?=\D|$)/i);
  return m?canonicalIsbn(m[1]):'';
}
export function recommendationCoverUrls(group,books=[]){
  const records=Array.isArray(group)?group:[];
  const urls=[],seen=new Set();
  const add=raw=>{const url=https(raw);if(url&&!seen.has(url)){seen.add(url);urls.push(url)}};
  for(const rec of records)add(rec.coverUrl);
  // A verified work match can supply an illustrative cover, but not proof of edition.
  for(const rec of records){
    const isbn=isbnFromSource(rec);
    const matching=(Array.isArray(books)?books:[]).filter(book=>
      titleAndAuthorMatch(rec,book)||
      (isbn&&key(book.title)===key(rec.title)&&canonicalIsbn(book.isbn)===isbn));
    if(matching.length===1)add(matching[0].coverUrl);
  }
  // Hanmoto's ISBN-addressed public promotional covers. On error the UI falls
  // back to its text cover, never to an unrelated image.
  for(const rec of records){
    const isbn=isbnFromSource(rec);
    if(isbn)add('https://img.hanmoto.com/bd/img/'+isbn+'.jpg');
  }
  return urls;
}
export function recommendationPeopleCount(group){
  const records=Array.isArray(group)?group:[];
  return new Set(records.map(r=>r.recommenderType==='ai'
    ?'ai:'+r.recommenderId:'human:'+(r.authorUid||r.id))).size;
}
export function recommendationShelfRequest(group){
  const lead=(Array.isArray(group)?group:[])[0];
  if(!lead)return '';
  const description=[
    'よんでねのおすすめから次の本を本棚に登録したい。',
    'タイトル：'+lead.title,
    lead.author?'著者：'+lead.author:'',
    lead.publisher?'出版社：'+lead.publisher:'',
    lead.isbn?'参考ISBN（版未照合）：'+lead.isbn:'',
    lead.url&&https(lead.url)?'書誌参考URL：'+lead.url:'',
    '本人の読書状態はまだ未読。今回は「きになる」（unread）として登録する。',
    'Firestore正本で作品・版・ISBN・重複を確認し、必要な書影・出典・あらすじを調査すること。',
    '既存書籍があれば重複作成しない。ChatGPT→Sheets更新キュー→GASの通常経路で処理し、結果を確認すること。',
    'この依頼文の作成・コピーだけでは本棚には登録されていない。'
  ];
  return description.filter(Boolean).join('\n');
}

// Public-image fallback for recommendations without a stored cover.
// No family IDs, recommendation text, ratings, or reading records leave the app.
const imageSearchCache=new Map();
const compact=value=>key(value).replace(/[\s\u3000・･:：―－-]/g,'');
const authorParts=value=>String(value||'').split(/[・･,，、／/]/).map(compact).filter(p=>p.length>=3);
function coverFromGoogleResult(record,info){
  if(!info?.title||compact(info.title)!==compact(record.title))return '';
  const parts=authorParts(record.author);
  if(!parts.length||!Array.isArray(info.authors)||
    !info.authors.some(a=>parts.some(p=>compact(a).includes(p))))return '';
  let candidate=info.imageLinks?.thumbnail||info.imageLinks?.smallThumbnail||'';
  try{
    const url=new URL(candidate);
    if(url.protocol==='http:'&&url.hostname==='books.google.com')url.protocol='https:';
    candidate=url.toString();
  }catch{return ''}
  return https(candidate);
}
export function lookupRecommendationCover(group,request=fetch){
  const rec=(Array.isArray(group)?group:[]).find(r=>r.title&&r.author);
  if(!rec)return Promise.resolve('');
  const isbn=isbnFromSource(rec);
  const cacheKey=[rec.title,rec.author,isbn].join('|');
  if(imageSearchCache.has(cacheKey))return imageSearchCache.get(cacheKey);
  const q=isbn?'isbn:'+isbn:'intitle:"'+rec.title+'" inauthor:"'+rec.author+'"';
  const endpoint='https://www.googleapis.com/books/v1/volumes?q='+encodeURIComponent(q)+'&maxResults=8&printType=books&projection=lite';
  const result=Promise.resolve().then(()=>request(endpoint)).then(async response=>{
    if(!response.ok)return '';
    const data=await response.json();
    const candidates=Array.isArray(data.items)?data.items:[];
    for(const item of candidates){
      const info=item.volumeInfo||{};
      if(isbn){
        const ids=info.industryIdentifiers||[];
        if(!ids.some(i=>canonicalIsbn(i.identifier)===isbn))continue;
        const url=coverFromGoogleResult(rec,info);
        if(url)return url;
      }else{
        const url=coverFromGoogleResult(rec,info);
        if(url)return url;
      }
    }
    return '';
  }).catch(()=>'' );
  imageSearchCache.set(cacheKey,result);
  return result;
}
