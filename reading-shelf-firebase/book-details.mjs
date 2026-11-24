import {STATUSES,readPeriodLabel,readingModeLabel,seriesVolumeLabel} from './domain.mjs';
import {coverStatusLabel,coverIsAlternate,editionStatusLabel} from './bibliography-identity.mjs';
import {mountBookCommunity} from './book-community.mjs';
import {mountChildRating} from './child-rating.mjs';
import {mountReadingRecordEditor} from './reading-record-editor.mjs';
import {safeCover} from './cover-thumbnails.mjs';

const safeSourceUrl=url=>/^https:\/\/[^\s]+$/i.test(String(url||''))?String(url):'';

export function createBookDetails({$,statusError,getBook,getRating,onSaved,members,onReflectionSaved}){
  let closeCommunity=null,closeRating=null,closeReadingEdit=null,refreshRating=null;
  function close(){
    closeCommunity?.();closeCommunity=null;
    closeRating?.();closeRating=null;refreshRating=null;
    closeReadingEdit?.();closeReadingEdit=null;
  }
  function open({db,fid,user,role,series,book,focusCommentId,readerName}){
    close();
    $('bookInfoTitle').textContent=book.title;
    const root=$('bookInfoBody');root.replaceChildren();
    const summary=document.createElement('div');summary.className='bookSummary bookSummaryCompact';
    const art=document.createElement('div');art.className='bookDetailCover cover';art.textContent=book.title;
    const src=safeCover(book.coverUrl);
    if(src){
      const img=document.createElement('img');img.alt=book.title+' の'+coverStatusLabel(book);img.src=src;
      img.onerror=()=>img.remove();art.append(img);
    }
    const lead=document.createElement('div');lead.className='bookLead';
    const label=document.createElement('span');label.className='bookStatusPill';
    label.textContent=STATUSES[book.status]||'状態未登録';lead.append(label);
    for(const value of [
      book.author,
      book.status==='read'?readPeriodLabel(book):'',
      ['read','reading','paused'].includes(book.status)?readingModeLabel(book):'',
      series.find(q=>q.id===book.seriesId)?.name,
    ]){
      if(!value)continue;
      const p=document.createElement('p');p.className='bookLeadLine';p.textContent=value;lead.append(p);
    }
    if(coverIsAlternate(book)){
      const caveat=document.createElement('p');caveat.className='bookCoverWarning';
      caveat.textContent='別版の参考書影です。読んだ実物の表紙とは一致しません。';
      lead.append(caveat);
    }
    summary.append(art,lead);root.append(summary);
    // Independently researched plot descriptions are not reading memories or
    // the child's own words. Keep them visible but clearly sourced and separate.
    const synopsis=String(book.synopsis||'').trim();
    if(synopsis){
      const section=document.createElement('section');section.className='bookSynopsis';
      const title=document.createElement('h3');title.textContent='あらすじ';
      const description=document.createElement('p');description.textContent=synopsis;
      section.append(title,description);
      const sourceUrl=safeSourceUrl(book.synopsisSourceUrl);
      if(sourceUrl){
        const link=document.createElement('a');link.href=sourceUrl;link.target='_blank';
        link.rel='noopener noreferrer';link.textContent='あらすじの参考資料（外部サイト）';
        section.append(link);
      }
      root.append(section);
    }
    const editArea=document.createElement('div');editArea.className='readingRecordEditSection';root.append(editArea);
    const readingEditor=mountReadingRecordEditor({
      db,fid,book,user,owner:role==='owner',container:editArea,
      getBook:()=>getBook(book.id),
      onSaved:saved=>onSaved(saved,fid,user.uid),
      onError:statusError
    });
    closeReadingEdit=readingEditor.dispose;
    const ratingArea=document.createElement('div');ratingArea.className='childRatingSection';
    root.append(ratingArea);
    const ratingControl=mountChildRating({
      db,fid,book,user,owner:role==='owner',container:ratingArea,
      getRating:()=>getRating(book.id),
      getBook:()=>getBook(book.id),
      onError:statusError
    });
    closeRating=ratingControl.dispose;
    refreshRating=ratingControl.refresh;

    // Family interactions are the primary use of the detail page, not ISBN data.
    const community=document.createElement('div');community.className='communityRoot';
    root.append(community);
    closeCommunity=mountBookCommunity({
      db,fid,book,user,owner:role==='owner',members,
      container:community,onError:statusError,focusCommentId,readerName,onReflectionSaved
    });

    // Preserve the complete original bibliography in an optional disclosure.
    const disclosure=document.createElement('details');disclosure.className='bookMetadataDetails';
    const heading=document.createElement('summary');heading.textContent='書誌情報・読書メモを見る';
    disclosure.append(heading);
    const metadata=document.createElement('dl');metadata.className='bibliography';
    const seriesName=series.find(q=>q.id===book.seriesId)?.name||'';
    const fields=[
      ['状態',STATUSES[book.status]||'未登録'],
      ['読んだ時期',book.status==='read'?readPeriodLabel(book):''],
      ['読み方',readingModeLabel(book)],
      ['作者',book.author],
      ['訳',book.translator],
      ['文・再話',book.adaptedBy],
      ['挿絵',book.illustrator],
      ['出版社',book.publisher],
      ['出版年',book.publicationYear?book.publicationYear+'年':'未登録'],
      ['出版年月',book.publicationDate],
      ['書誌の版',editionStatusLabel(book)],
      ['ISBN（'+(book.isbnEditionStatus==='photo-confirmed'?'実物確認':'参照書誌・実物未確認')+'）',book.isbn],
      ['書影の扱い',coverStatusLabel(book)],
      ['ページ数',book.pageCount?book.pageCount+'ページ':''],
      ['対象年齢・学年',book.ageLabel],
      ['シリーズ',seriesName],
      ['シリーズ内の位置',seriesVolumeLabel(book)==='番外編'?'番外編':book.volume?book.volume+'巻':''],
      ['版',book.edition],
      ['作品区分',book.workType]
    ];
    for(const [name,value] of fields){
      if(value===undefined||value===null||value==='')continue;
      const field=document.createElement('dt');field.textContent=name;
      const detail=document.createElement('dd');detail.textContent=String(value);
      metadata.append(field,detail);
    }
    disclosure.append(metadata);
    for(const [name,value] of [
      ['版の説明',book.editionNote],
      ['読書・観察メモ',book.notes],
      ['書影の参照元',book.coverReferenceSource]
    ]){
      if(!value)continue;
      const p=document.createElement('p');p.className='detailNote';
      const strong=document.createElement('strong');strong.textContent=name+'：';
      p.append(strong,document.createTextNode(value));disclosure.append(p);
    }
    const reference=safeCover(book.bibliographicSource);
    if(reference){
      const p=document.createElement('p');p.className='detailNote';
      const a=document.createElement('a');a.href=reference;a.target='_blank';a.rel='noopener noreferrer';
      a.textContent='出版社・図書館などの書誌出典を確認 ↗';
      p.append(a);disclosure.append(p);
    }
    root.append(disclosure);
    const dialog=$('bookInfoDialog');
    dialog.showModal();
    dialog.scrollTop=0;
  }
  return {open,close,refresh:()=>refreshRating?.()};
}
