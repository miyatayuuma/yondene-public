import {collection,query,orderBy,limit,onSnapshot} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';

// Keep the ordinary bookshelf feed to 15 fetched records and 3 visible unread rows.
// "すべて見る" incrementally widens one live query, never an all-documents listener.
const RECENT_FETCH=15;
const RECENT_VISIBLE=3;
const PAGE_SIZE=20;

export function mountFamilyActivity({db,fid,userUid,readerName,container,members,onBook,onRecommendations,onError}){
  const root=document.createElement('section');root.className='familyActivity';
  const heading=document.createElement('h2');heading.textContent='最近の活動';
  const list=document.createElement('div');list.className='familyActivityList';
  const controls=document.createElement('div');controls.className='familyActivityControls';
  const acknowledge=document.createElement('button');acknowledge.type='button';acknowledge.className='activityAcknowledge';
  const toggle=document.createElement('button');toggle.type='button';toggle.className='activityViewAll';
  const more=document.createElement('button');more.type='button';more.className='activityLoadMore';
  controls.append(toggle,more,acknowledge);
  root.append(heading,list,controls);container.append(root);

  // Store only an acknowledged timestamp, not activity or comment contents.
  // Per-account and per-bookshelf, local to this device (no Firestore writes).
  const storageKey='yondene:activity-seen:'+fid+':'+userUid;
  const loadSeen=()=>{try{return Math.max(0,Number(localStorage.getItem(storageKey))||0)}catch{return 0}};
  let seenAt=loadSeen();
  let active=true,expanded=false,visibleLimit=PAGE_SIZE,rawRows=[],stop=()=>{},listenerGeneration=0;
  const stamp=item=>item.createdAt?.toMillis?.()||item.createdAt?.toDate?.()?.getTime?.()||0;
  const entries=collection(db,'families',fid,'activity');
  const refresh=()=>{
    if(!active)return;
    list.replaceChildren();
    const available=rawRows.filter(item=>!item.hidden);
    const unseen=available.filter(item=>stamp(item)>seenAt);
    const visible=(expanded?available:unseen).slice(0,expanded?visibleLimit:RECENT_VISIBLE);
    root.classList.toggle('activityIsRead',!expanded&&!unseen.length);
    heading.textContent=!expanded&&unseen.length?'最近の活動 · 新着'+unseen.length+'件':'最近の活動';
    if(!visible.length){
      const empty=document.createElement('p');empty.className='muted tiny';
      empty.textContent=rawRows.length?'新しい活動はありません。':'コメントやリアクションなどがここに表示されます。';
      list.append(empty);
    }
    for(const item of visible){
      const who=members().find(m=>m.uid===item.actorUid)?.displayName||'メンバー';
      const button=document.createElement('button');button.type='button';button.className='activityItem';
      const lead=document.createElement('span');lead.className='activityTitle';
      lead.textContent=({
        reflection:(readerName?.()||'子ども')+'の感想が記録されました',
        recommendation:who+'がおすすめしました',
        comment:who+'がコメントしました',
        like:who+'が「いいね」しました',
        'ask-reflection':who+'が感想をききたいと伝えました'
      })[item.kind]||who+'が更新しました';
      const book=document.createElement('span');book.className='activityBook';
      book.textContent=item.title;
      const date=document.createElement('span');date.className='muted tiny';
      date.textContent=item.createdAt?.toDate?.()?.toLocaleDateString('ja-JP')||'';
      button.append(lead,book,date);
      button.onclick=()=>item.kind==='recommendation'
        ?onRecommendations()
        :onBook(item.bookId,item.kind==='comment'?item.sourceId:null);
      list.append(button);
    }
    toggle.textContent=expanded?'閉じる':'履歴を見る';
    acknowledge.textContent='確認済みにする';
    acknowledge.hidden=expanded||!unseen.length;
    toggle.setAttribute('aria-expanded',String(expanded));
    toggle.hidden=!expanded&&!rawRows.length;
    more.textContent='さらに20件を見る';
    more.hidden=!expanded||rawRows.length<=visibleLimit;
    controls.hidden=toggle.hidden&&more.hidden&&acknowledge.hidden;
  };

  const listen=()=>{
    stop();
    const generation=++listenerGeneration;
    // Fetch one sentinel row in expanded mode to avoid guessing if more exist.
    const count=expanded?visibleLimit+1:RECENT_FETCH;
    stop=onSnapshot(query(entries,orderBy('createdAt','desc'),limit(count)),snapshot=>{
      if(!active||generation!==listenerGeneration)return;
      rawRows=snapshot.docs.map(d=>d.data());
      refresh();
    },error=>{if(active&&generation===listenerGeneration)onError?.(error)});
  };
  acknowledge.onclick=()=>{
    const newest=rawRows.filter(item=>!item.hidden).reduce((highest,item)=>Math.max(highest,stamp(item)),seenAt);
    if(newest>seenAt){
      seenAt=newest;
      try{localStorage.setItem(storageKey,String(seenAt))}catch{}
    }
    refresh();
  };
  toggle.onclick=()=>{
    expanded=!expanded;visibleLimit=PAGE_SIZE;rawRows=[];
    refresh();listen();
  };
  more.onclick=()=>{
    if(!expanded||rawRows.length<=visibleLimit)return;
    visibleLimit+=PAGE_SIZE;rawRows=[];
    refresh();listen();
  };
  listen();
  const dispose=()=>{active=false;listenerGeneration++;stop();root.remove()};
  dispose.refresh=refresh; // Public nickname changes do not reopen Firestore listeners.
  return dispose;
}
