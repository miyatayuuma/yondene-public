// Book identity is NOT book-title identity. This module never changes Firestore records.
import {normalize} from './domain.mjs';
const isbnChars=v=>String(v??'').normalize('NFKC').replace(/[\s\-‐‑–—]/g,'').toUpperCase();
export function canonicalIsbn(input){
  const isbn=isbnChars(input);
  if(/^\d{13}$/.test(isbn)){
    const sum=[...isbn.slice(0,12)].reduce((v,c,i)=>v+Number(c)*(i%2?3:1),0);
    return (10-sum%10)%10===Number(isbn[12])?isbn:'';
  }
  if(/^\d{9}[\dX]$/.test(isbn)){
    const sum=[...isbn].reduce((v,c,i)=>v+(c==='X'?10:Number(c))*(10-i),0);
    if(sum%11!==0)return '';
    const body='978'+isbn.slice(0,9);
    const check=(10-[...body].reduce((v,c,i)=>v+Number(c)*(i%2?3:1),0)%10)%10;
    return body+String(check);
  }
  return '';
}
const field=(book,key)=>String(book?.[key]??'').trim();
const titleKey=book=>normalize(field(book,'title'));
export const coverIsAlternate=book=>Boolean(field(book,'coverUrl'))&&
  field(book,'coverEditionStatus')==='known-alternate-edition-reference';
export function coverStatusLabel(book){
  if(!field(book,'coverUrl'))return '';
  switch(field(book,'coverEditionStatus')){
    case 'known-alternate-edition-reference':return '別版の参考書影';
    case 'same-isbn-reference-edition-unconfirmed':return '同ISBNの参考書影（実物未確認）';
    case 'cover-photo-confirmed':return '実物の表紙と照合済み';
    default:return '参考書影（版未確認）';
  }
}
export function editionStatusLabel(book){
  const source=field(book,'isbnEditionStatus');
  const year=field(book,'publicationYearBasis');
  if(source==='photo-confirmed'&&year==='photo-confirmed-edition')
    return '実物の版を照合済み';
  if(year==='photo-confirmed-edition')
    return '出版年は実物で確認（版全体は未確認）';
  return '参照版の書誌（実物の版は未確認）';
}
// Only proven ISBN identity, or complete edition-identifying metadata, may merge recommendations.
// Missing fields are NOT evidence that two records refer to the same edition.
export function recommendationGroupKey(rec){
  const title=titleKey(rec);
  const isbn=canonicalIsbn(rec?.isbn);
  if(title&&isbn)return 'isbn:'+title+':'+isbn;
  const author=normalize(field(rec,'author'));
  const publisher=normalize(field(rec,'publisher'));
  const edition=normalize(field(rec,'edition'));
  if(title&&author&&publisher&&edition)
    return 'described:'+JSON.stringify([title,author,publisher,edition]);
  return 'record:'+String(rec?.id||'unidentified');
}
// Shelf relation is conservative. Title-only equality never proves identical book or edition.
export function shelfRelation(rec,books){
  const title=titleKey(rec);
  if(!title)return {kind:'none',count:0};
  const sameTitle=(Array.isArray(books)?books:[]).filter(b=>titleKey(b)===title);
  if(!sameTitle.length)return {kind:'none',count:0};
  const isbn=canonicalIsbn(rec?.isbn);
  if(isbn){
    const exact=sameTitle.filter(b=>canonicalIsbn(b.isbn)===isbn);
    if(exact.length===1)return {kind:'isbn-matched',count:sameTitle.length};
  }
  if(sameTitle.length>1)return {kind:'ambiguous-title',count:sameTitle.length};
  return {kind:'same-title-unverified',count:1};
}
export function shelfRelationLabel(relation){
  switch(relation?.kind){
    case 'isbn-matched':return '本棚に同ISBNの本があります';
    case 'ambiguous-title':return '本棚に同名の本が複数あります（作品・版未確認）';
    case 'same-title-unverified':return '本棚に同名の本があります（作品・版未確認）';
    default:return 'おすすめ';
  }
}
// Pure candidate report. A finding is NOT a judgment that historical Firestore data are wrong.
export function auditBookIdentities(books){
  const list=Array.isArray(books)?books:[];
  const flagged=[];
  const isbnMap=new Map(),titleMap=new Map();
  for(const book of list){
    const key=canonicalIsbn(book?.isbn);
    const raw=field(book,'isbn');
    if(raw&&!key)flagged.push({id:book.id,kind:'invalid-isbn'});
    if(key){if(!isbnMap.has(key))isbnMap.set(key,[]);isbnMap.get(key).push(book);}
    const title=titleKey(book);
    if(title){if(!titleMap.has(title))titleMap.set(title,[]);titleMap.get(title).push(book);}
    if(coverIsAlternate(book))flagged.push({id:book.id,kind:'alternate-cover-reference'});
    if(field(book,'coverUrl')&&!field(book,'coverEditionStatus'))
      flagged.push({id:book.id,kind:'cover-edition-unverified'});
  }
  for(const [isbn,group] of isbnMap){
    if(group.length>1)flagged.push({kind:'shared-isbn-review',isbn,ids:group.map(b=>b.id)});
  }
  for(const group of titleMap.values()){
    if(group.length>1&&new Set(group.map(b=>canonicalIsbn(b.isbn))).size>1)
      flagged.push({kind:'same-title-different-edition-or-work',ids:group.map(b=>b.id)});
  }
  return flagged;
}
