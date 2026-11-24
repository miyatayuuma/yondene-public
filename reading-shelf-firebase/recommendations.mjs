import {collection,doc,query,where,limit,onSnapshot,setDoc,updateDoc,deleteDoc,getDoc,writeBatch,serverTimestamp} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';
import {normalize} from './domain.mjs';
import {recommendationGroupKey,shelfRelation,shelfRelationLabel} from './bibliography-identity.mjs';
import {shelfThumbnailUrl} from './cover-thumbnails.mjs';
import {recommendationCoverUrls,recommendationPeopleCount,recommendationShelfRequest,lookupRecommendationCover} from './recommendation-card-data.mjs';

const el=(tag,className='',text='')=>{
  const n=document.createElement(tag);
  if(className)n.className=className;
  if(text)n.textContent=text;
  return n;
};
const stamp=r=>r.createdAt?.toMillis?.()||0;
const safeURL=v=>!v||(/^https:\/\/[^\s]+$/i.test(v)&&v.length<=1500);
export function mountRecommendations({db,fid,user,owner,members,books,container,onError}){
  const ref=collection(db,'families',fid,'recommendations');
  const subscriptions=[];
  const activity=collection(db,'families',fid,'activity');
  const activityFor=id=>doc(activity,'recommendation-'+id);
  let active=true,visible=[],moderated=[];
  const who=uid=>members().find(m=>m.uid===uid)?.displayName||'メンバー';
  const labels={roku:'Roku',gemini:'Gemini',muse:'Muse'};
  const recommender=rec=>rec.recommenderType==='ai'
    ?(labels[rec.recommenderId]||'AI')+'（AI）':who(rec.authorUid);
  const modeLabels={'read-aloud':'読み聞かせ',independent:'自力読書',mixed:'併用',shared:'いっしょに読む'};
  const root=el('section','recommendationPage');
  root.append(el('h2','','おすすめ'));
  root.append(el('p','muted','読んでほしい本を紹介できます。おすすめは読書履歴には追加されません。'));
  const compose=el('form','recommendationCompose');
  const title=el('input');title.type='text';title.maxLength=250;title.required=true;
  title.placeholder='本のタイトル';title.setAttribute('aria-label','おすすめする本のタイトル');
  const author=el('input');author.type='text';author.maxLength=250;
  author.placeholder='著者（同じ作品のおすすめをまとめるため推奨）';author.setAttribute('aria-label','おすすめする本の著者');
  const url=el('input');url.type='url';url.maxLength=1500;
  url.placeholder='本の紹介URL（任意）';url.setAttribute('aria-label','本の紹介URL');
  const reason=el('textarea');reason.rows=2;reason.maxLength=1000;
  reason.placeholder='おすすめしたい理由（任意）';reason.setAttribute('aria-label','おすすめ理由');
  const submit=el('button','primary','おすすめする');submit.type='submit';
  const status=el('p','muted tiny');status.setAttribute('role','status');
  compose.append(title,author,url,reason,submit,status);
  const composer=el('details','recommendationComposer');
  composer.append(el('summary','','本をおすすめする'),compose);root.append(composer);
  const list=el('div','books recommendationList');root.append(list);
  const moderation=el('div','recommendationModeration');
  if(owner){
    moderation.append(el('h3','','非表示にしたおすすめ'));
    root.append(moderation);
  }
  const detail=el('dialog','recommendationDialog');
  const detailInner=el('div','dialogInner');
  const detailTop=el('div','dialogTop');
  const detailTitle=el('h2','','本のおすすめ');
  const detailClose=el('button','ghost','×');detailClose.type='button';
  detailClose.setAttribute('aria-label','閉じる');
  detailClose.onclick=()=>detail.close();
  detailTop.append(detailTitle,detailClose);
  const detailBody=el('div','recommendationDetailBody');
  detailInner.append(detailTop,detailBody);detail.append(detailInner);root.append(detail);
  detail.setAttribute('aria-label','おすすめの詳細');
  detail.addEventListener('click',event=>{if(event.target===detail)detail.close()});
  detail.addEventListener('close',()=>{detail.dataset.key=''});
  container.replaceChildren(root);
  const notify=e=>{if(onError)onError(e);else console.error(e)};
  const link=(url,label)=>{
    const a=el('a','recommendationLink',label);
    a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;
  };
  async function mutate(rec,patch){await updateDoc(doc(ref,rec.id),patch)}
  const date=x=>x.createdAt?.toDate?.()?.toLocaleDateString('ja-JP')||'投稿中';
  function renderCover(group,detailMode=false){
    const book=group[0],art=el('div','cover'+(detailMode?' recommendationDetailCover':''));
    art.textContent=book.title;
    const candidates=recommendationCoverUrls(group,books());
    const loadRemote=()=>lookupRecommendationCover(group).then(url=>{
      if(!active||!art.isConnected||!url)return;
      const remote=el('img');remote.loading='lazy';remote.decoding='async';
      remote.alt=book.title+' の参考書影（版未確認）';
      remote.onerror=()=>remote.remove();art.prepend(remote);remote.src=url;
    }).catch(()=>{});
    if(candidates.length){
      const img=el('img');img.alt=book.title+' の参考書影（版未確認）';
      img.loading='lazy';img.decoding='async';
      let next=0;
      const tryNext=()=>{
        if(next>=candidates.length){img.remove();loadRemote();return}
        const original=candidates[next++];
        const thumb=detailMode?original:shelfThumbnailUrl(original);
        img.onerror=()=>{
          if(thumb!==original){img.onerror=tryNext;img.src=original}
          else tryNext();
        };
        img.src=thumb;
      };
      art.append(img);tryNext();
    }else loadRemote();
    if(!detailMode){
      const count=el('span','flag recommendationCount',recommendationPeopleCount(group)+'人推薦');
      art.append(count);
    }
    return art;
  }
  function renderOpinion(rec,moderationMode=false){
    const item=el('section','recommendationOpinion');
    item.append(el('strong','',recommender(rec)+' · '+date(rec)));
    if(rec.recommendedMode&&modeLabels[rec.recommendedMode])
      item.append(el('p','muted tiny','おすすめの読み方：'+modeLabels[rec.recommendedMode]));
    if(rec.reason)item.append(el('p','',rec.recommenderType==='ai'?'推薦理由：'+rec.reason:rec.reason));
    if(rec.goal)item.append(el('p','recommendationGoal','ねらい：'+rec.goal));
    if(rec.url&&safeURL(rec.url))item.append(link(rec.url,'本の紹介を見る'));
    const actions=el('div','commentActions');
    const feedback=el('p','muted tiny');feedback.setAttribute('role','status');
    const action=(label,work)=>{
      const btn=el('button','textAction',label);btn.type='button';
      btn.onclick=async()=>{btn.disabled=true;try{await work()}catch(e){notify(e);feedback.textContent='操作に失敗しました'}finally{btn.disabled=false}};
      actions.append(btn);
    };
    if(rec.authorUid===user.uid&&!moderationMode){
      action('編集',async()=>{
        const edit=el('textarea','commentEdit');edit.maxLength=1000;edit.rows=3;edit.value=rec.reason||'';
        const address=el('input');address.type='url';address.maxLength=1500;address.value=rec.url||'';
        const save=el('button','primary','保存');save.type='button';
        const cancel=el('button','','やめる');cancel.type='button';
        cancel.onclick=()=>{edit.remove();address.remove();save.remove();cancel.remove()};
        save.onclick=async()=>{
          const next=address.value.trim();
          if(!safeURL(next)){feedback.textContent='紹介URLはHTTPSを指定してください';return}
          save.disabled=true;
          try{await mutate(rec,{reason:edit.value.trim(),url:next,updatedAt:serverTimestamp()})}
          catch(e){notify(e);feedback.textContent='保存に失敗しました';save.disabled=false}
        };
        item.append(edit,address,save,cancel);edit.focus();
      });
      action('取り下げる',async()=>{
        if(!confirm('自分のおすすめを取り下げますか？'))return;
        const a=activityFor(rec.id),existing=await getDoc(a);
        const batch=writeBatch(db);batch.delete(doc(ref,rec.id));
        if(existing.exists())batch.delete(a);
        await batch.commit();
      });
    }
    if(owner)action(moderationMode?'表示を戻す':'非表示にする',async()=>{
      const a=activityFor(rec.id),existing=await getDoc(a);
      const batch=writeBatch(db);batch.update(doc(ref,rec.id),{hidden:!moderationMode});
      if(existing.exists())batch.update(a,{hidden:!moderationMode});
      await batch.commit();
    });
    item.append(actions,feedback);
    return item;
  }
  function renderDetail(group,moderationMode=false){
    const lead=group[0],booksNow=books();
    const relation=shelfRelation(lead,booksNow);
    detailTitle.textContent=lead.title;
    detailBody.replaceChildren();
    const summary=el('div','bookSummary bookSummaryCompact recommendationDetailSummary');
    const bookLead=el('div','bookLead');
    const contributorCount=recommendationPeopleCount(group);
    bookLead.append(el('span','bookStatusPill',contributorCount+'人が推薦'));
    const enriched=group.find(r=>r.author||r.publisher);
    if(enriched?.author||enriched?.publisher)
      bookLead.append(el('p','bookLeadLine',[enriched.author,enriched.publisher].filter(Boolean).join(' · ')));
    if(relation.kind!=='none')
      bookLead.append(el('p','bookCoverWarning',shelfRelationLabel(relation)));
    bookLead.append(el('p','muted tiny','書影は参考画像です。推薦は読書状態を変更しません。'));
    summary.append(renderCover(group,true),bookLead);detailBody.append(summary);
    for(const rec of group)detailBody.append(renderOpinion(rec,moderationMode));
    if(owner&&!moderationMode){
      const panel=el('section','recommendationShelfAction');
      panel.append(el('h3','','本棚に登録する'));
      panel.append(el('p','muted tiny','登録には書誌・版・重複の確認が必要です。依頼文をコピーしてChatGPTに送信してください。コピーだけでは本棚は変わりません。'));
      const copy=el('button','primary','本棚登録の依頼文をコピー');copy.type='button';
      const copyStatus=el('p','muted tiny');copyStatus.setAttribute('role','status');
      copy.onclick=async()=>{
        const request=recommendationShelfRequest(group);
        try{
          if(!navigator.clipboard?.writeText)throw Error('clipboard unavailable');
          await navigator.clipboard.writeText(request);
          copyStatus.textContent='コピーしました。ChatGPTの会話に貼り付けて送信してください。';
        }catch{
          copyStatus.textContent='コピーできない場合は、下の文章を選択してChatGPTへ送信してください。';
          const manual=el('textarea','recommendationRegistrationText');
          manual.readOnly=true;manual.value=request;manual.rows=8;
          copyStatus.replaceChildren(document.createTextNode(copyStatus.textContent),manual);
          manual.focus();manual.select();
        }
      };
      panel.append(copy,copyStatus);detailBody.append(panel);
    }
  }
  function renderCard(group,moderationMode=false){
    const lead=group[0],card=el('button','book recommendationCard');
    card.type='button';
    card.append(renderCover(group),el('strong','',lead.title));
    const enriched=group.find(r=>r.author);
    card.append(el('span','sub',enriched?.author||'著者未登録'));
    card.setAttribute('aria-label',lead.title+'、'+recommendationPeopleCount(group)+'人が推薦。詳細を見る');
    card.onclick=()=>{
      detail.dataset.key=recommendationGroupKey(lead);
      detail.dataset.moderation=moderationMode?'true':'false';
      renderDetail(group,moderationMode);detail.showModal();detail.scrollTop=0;
    };
    return card;
  }
  function draw(){
    list.replaceChildren();
    const groups=new Map();
    for(const rec of visible){
      const key=recommendationGroupKey(rec);
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(rec);
    }
    const rows=[...groups.values()].sort((a,b)=>Math.max(...b.map(stamp))-Math.max(...a.map(stamp)));
    if(!rows.length)list.append(el('p','empty','まだおすすめはありません。最初の1冊を紹介してみましょう。'));
    for(const row of rows){row.sort((a,b)=>stamp(b)-stamp(a));list.append(renderCard(row))}
    const hiddenGroups=new Map();
    if(owner){
      moderation.replaceChildren(el('h3','','非表示にしたおすすめ'));
      const hidden=[...moderated].sort((a,b)=>stamp(b)-stamp(a));
      for(const rec of hidden){
        const key=recommendationGroupKey(rec);
        if(!hiddenGroups.has(key))hiddenGroups.set(key,[]);
        hiddenGroups.get(key).push(rec);
      }
      for(const row of hiddenGroups.values())moderation.append(renderCard(row,true));
      moderation.hidden=!hidden.length;
    }
    if(detail.open){
      const activeGroups=detail.dataset.moderation==='true'?hiddenGroups:groups;
      const current=activeGroups.get(detail.dataset.key);
      if(current){
        const top=detail.scrollTop;renderDetail(current,detail.dataset.moderation==='true');detail.scrollTop=top;
      }else detail.close();
    }
  }
  const listen=(q,fn)=>{
    subscriptions.push(onSnapshot(q,snap=>{
      if(!active)return;
      fn(snap.docs.map(d=>({id:d.id,...d.data()})));draw();
    },e=>{if(active)notify(e)}));
  };
  listen(query(ref,where('hidden','==',false),limit(100)),a=>{visible=a});
  if(owner)listen(query(ref,where('hidden','==',true),limit(100)),a=>{moderated=a});
  compose.onsubmit=async event=>{
    event.preventDefault();
    const book=title.value.trim(),writer=author.value.trim(),web=url.value.trim(),why=reason.value.trim();
    if(!book||!safeURL(web)){status.textContent='本のタイトルとHTTPSの紹介URLを確認してください';return}
    if(visible.some(x=>x.authorUid===user.uid&&normalize(x.title)===normalize(book)&&
      (!writer||!x.author||normalize(x.author)===normalize(writer)))){
      status.textContent='この本はすでにおすすめしています';return;
    }
    submit.disabled=true;status.textContent='';
    try{
      const recRef=doc(ref);
      const batch=writeBatch(db);
      batch.set(recRef,{authorUid:user.uid,title:book,normalizedTitle:normalize(book),
        ...(writer?{author:writer}:{}),
        reason:why,url:web,hidden:false,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
      batch.set(activityFor(recRef.id),{actorUid:user.uid,kind:'recommendation',title:book,
        bookId:'',sourceId:recRef.id,hidden:false,createdAt:serverTimestamp()});
      await batch.commit();
      title.value=author.value=url.value=reason.value='';
      status.textContent='おすすめを追加しました';
    }catch(e){notify(e)}finally{if(active)submit.disabled=false}
  };
  return ()=>{
    active=false;for(const unsub of subscriptions)unsub();
    if(detail.open)detail.close();
    compose.onsubmit=null;
  };
}
