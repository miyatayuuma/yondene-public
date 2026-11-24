import {STATUSES,ACTIVE_READ_FILTER,filteredBooks,compactReadPeriodLabel,readingModeLabel,
  emptyStateMessage,seriesVolumeLabel,sortSeriesBooks} from './domain.mjs';
import {coverStatusLabel,coverIsAlternate} from './bibliography-identity.mjs';
import {safeCover,shelfThumbnailUrl} from './cover-thumbnails.mjs';

export function renderBookshelf({root,view,opts,books,series,ratings,openBookInfo}){
  const data=filteredBooks(books.map(b=>({...b,childRating:b.status==='unread'?null:ratings.get(b.id)?.stars??null})),opts,series);
  root.className='';root.replaceChildren();
  if(!data.length){
    const empty=document.createElement('div');empty.className='empty';
    empty.textContent=emptyStateMessage({view,search:opts.search,hasBooks:books.length>0});
    root.append(empty);return;
  }
  if(view==='shelf'){
    if(opts.filter===ACTIVE_READ_FILTER&&opts.sort!=='rating-high'){
      const reading=data.filter(b=>b.status==='reading');
      const completed=data.filter(b=>b.status==='read');
      if(reading.length){
        root.append(shelfSection('いま読んでる',reading,openBookInfo));
        if(completed.length)root.append(shelfSection('読んだ本',completed,openBookInfo));
        return;
      }
    }
    root.append(bookGrid(data,openBookInfo));return;
  }
  if(view==='series'){
    // A series screen should never collect unrelated stand-alone books.
    const known=new Map(series.map(s=>[s.id,s]));
    const grouped=new Map();
    for(const book of data){
      if(!book.seriesId)continue;
      if(!grouped.has(book.seriesId))grouped.set(book.seriesId,[]);
      grouped.get(book.seriesId).push(book);
    }
    const keys=[...grouped.keys()].sort((a,b)=>(known.get(a)?.name||a).localeCompare(known.get(b)?.name||b,'ja'));
    for(const key of keys){
      const items=sortSeriesBooks(grouped.get(key));
      const meta=known.get(key);
      root.append(groupSection(meta?.name||'名称未登録のシリーズ',meta?.note||'',items,meta?.totalVolumes,openBookInfo));
    }
    if(!keys.length){
      const empty=document.createElement('div');empty.className='empty';
      empty.textContent=emptyStateMessage({view:'series',search:opts.search});
      root.append(empty);
    }
    return;
  }
}
function shelfSection(title,items,openBookInfo){
  const section=document.createElement('section');section.className='group activeShelfGroup';
  const heading=document.createElement('h2');heading.textContent=title;
  section.append(heading,bookGrid(items,openBookInfo));
  return section;
}
function groupSection(title,note,items,total,openBookInfo){
  const section=document.createElement('section');section.className='group';
  const h=document.createElement('h2');h.textContent=title;section.append(h);
  const p=document.createElement('p');
  const read=items.filter(b=>b.status==='read').length;
  p.textContent='登録'+items.length+'冊・読んだ'+read+'冊'+(total?' / 全'+total+'巻':'')+(note?' · '+note:'');
  section.append(p,bookGrid(items,openBookInfo));return section;
}
function bookGrid(data,openBookInfo){
  const div=document.createElement('div');div.className='books';
  for(const b of data){
    const btn=document.createElement('button');btn.className='book';btn.onclick=()=>openBookInfo(b);
    const cover=document.createElement('div');cover.className='cover';cover.textContent=b.title;
    const url=safeCover(b.coverUrl);
    if(url){
      const img=document.createElement('img');img.loading='lazy';img.decoding='async';
      img.alt=b.title+' の'+coverStatusLabel(b);
      const thumbnail=shelfThumbnailUrl(url);
      img.src=thumbnail;
      img.onerror=()=>{if(thumbnail!==url){img.onerror=()=>img.remove();img.src=url}else img.remove()};
      cover.append(img);
    }
    // Only reading attributes overlay the cover; bibliography stays outside.
    const mode=readingModeLabel(b);
    if(mode&&['read','reading','paused'].includes(b.status)){
      const chip=document.createElement('span');chip.className='modeChip';chip.textContent=mode;
      cover.append(chip);
    }
    const tag=document.createElement('span');tag.className='flag '+b.status;
    tag.textContent=STATUSES[b.status]||'';
    if(b.status==='read'){
      const period=compactReadPeriodLabel(b);
      if(period)tag.textContent+=' '+period;
    }
    cover.append(tag);
    if(Number.isInteger(b.childRating)&&b.childRating>=1&&b.childRating<=5){
      const rating=document.createElement('span');rating.className='bookRating';
      rating.textContent='★'.repeat(b.childRating)+'☆'.repeat(5-b.childRating);
      rating.ariaLabel='本人の評価：5点中'+b.childRating+'点';
      cover.append(rating);
    }
    const title=document.createElement('strong');
    const position=seriesVolumeLabel(b);
    if(position){
      const badge=document.createElement('span');
      badge.className='bookSeriesBadge'+(position==='番外編'?' bookSeriesExtra':'');
      badge.textContent=position;
      badge.setAttribute('aria-label',position==='番外編'?'番外編':'シリーズ第'+position+'巻');
      title.append(badge,document.createTextNode(' '));
    }
    title.append(document.createTextNode(b.title+(b.edition?' 〈'+b.edition+'〉':'')));
    const author=document.createElement('span');author.className='sub';author.textContent=b.author||'作者未登録';
    const year=String(b.publicationYear??'').trim();
    const publication=/^[0-9]{4}$/.test(year)?document.createElement('span'):null;
    if(publication){
      publication.className='bookPublicationYear';publication.textContent=year;
    }
    btn.append(cover,title,author);
    if(publication)btn.append(publication);
    if(coverIsAlternate(b)){
      const caveat=document.createElement('span');caveat.className='bookCoverEditionNote';
      caveat.textContent='別版の参考書影';btn.append(caveat);
    }
    div.append(btn);
  }return div;
}
