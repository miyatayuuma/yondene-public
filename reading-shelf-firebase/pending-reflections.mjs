import {collection,query,limit,getDocs} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';

// Intentionally lazy: no permanent listeners, cross-book collectionGroup query, or
// modification of the child observations. Refresh reads requests first and only
// queries reflections for books that actually have a request.
export function mountPendingReflections({db,fid,books,container,onBook,onError}){
  const root=document.createElement('details');
  root.className='pendingReflections';
  const summary=document.createElement('summary');
  summary.textContent='感想待ち';
  const description=document.createElement('p');
  description.className='muted';
  description.textContent='「感想をききたい」があり、感想がまだ記録されていない本です。';
  const actions=document.createElement('div');actions.className='pendingReflectionsActions';
  const refreshButton=document.createElement('button');
  refreshButton.type='button';refreshButton.textContent='最新の状態を確認';
  const status=document.createElement('p');status.className='muted tiny';
  status.setAttribute('role','status');
  const list=document.createElement('div');list.className='pendingReflectionsList';
  actions.append(refreshButton);
  root.append(summary,description,actions,status,list);
  container.append(root);

  let disposed=false,seq=0,loaded=false;
  const renderRows=rows=>{
    list.replaceChildren();
    if(!rows.length){
      const empty=document.createElement('p');empty.className='muted tiny';
      empty.textContent='現在、感想待ちの本はありません。';
      list.append(empty);return;
    }
    for(const item of rows){
      const row=document.createElement('div');row.className='person pendingReflectionItem';
      const meta=document.createElement('div');meta.className='pendingReflectionMeta';
      const title=document.createElement('strong');title.textContent=item.title;
      const count=document.createElement('span');count.className='muted tiny';
      count.textContent='感想リクエスト '+(item.count>100?'100人以上':item.count+'人');
      meta.append(title,count);
      const open=document.createElement('button');open.type='button';
      open.textContent='感想を記録';open.onclick=()=>onBook(item.id);
      row.append(meta,open);list.append(row);
    }
  };
  async function refresh(){
    if(disposed||!root.open)return;
    const current=++seq;
    const entries=books().filter(b=>typeof b.id==='string'&&b.id.length);
    const rows=[];
    let index=0,scanned=0;
    refreshButton.disabled=true;
    list.replaceChildren();
    status.textContent=entries.length+'冊を確認しています…';
    try{
      // Limit active requests per book and simultaneous network queries.
      const worker=async()=>{
        while(!disposed&&current===seq){
          const i=index++;
          if(i>=entries.length)return;
          const book=entries[i];
          const base=['families',fid,'books',book.id];
          const requests=await getDocs(query(collection(db,...base,'requests'),limit(101)));
          if(disposed||current!==seq)return;
          if(!requests.empty){
            const reflections=await getDocs(query(collection(db,...base,'childReflections'),limit(1)));
            if(disposed||current!==seq)return;
            if(reflections.empty)rows.push({id:book.id,title:book.title||'書名未登録',count:requests.size});
          }
          scanned++;
          status.textContent=scanned+' / '+entries.length+'冊を確認中…';
        }
      };
      await Promise.all(Array.from({length:Math.min(3,entries.length)},()=>worker()));
      if(disposed||current!==seq)return;
      rows.sort((a,b)=>b.count-a.count||a.title.localeCompare(b.title,'ja'));
      renderRows(rows);
      status.textContent=rows.length+'冊が感想待ちです（'+entries.length+'冊を確認）。';
      loaded=true;
    }catch(error){
      if(disposed||current!==seq)return;
      // Abort the other in-flight workers instead of continuing costly reads.
      seq++;
      refreshButton.disabled=false;
      status.textContent='一覧を取得できませんでした。もう一度お試しください。';
      onError?.(error);
    }finally{
      if(!disposed&&current===seq)refreshButton.disabled=false;
    }
  }
  const onToggle=()=>{
    if(!root.open){seq++;refreshButton.disabled=false;return}
    if(!loaded)void refresh();
  };
  refreshButton.onclick=()=>{void refresh()};
  root.addEventListener('toggle',onToggle);
  const dispose=()=>{
    disposed=true;seq++;
    root.removeEventListener('toggle',onToggle);
    refreshButton.onclick=null;
    root.remove();
  };
  // Called after an owner saves a new child reflection, when the list is open.
  return {dispose,refresh:()=>{if(root.open)return refresh()}};
}
