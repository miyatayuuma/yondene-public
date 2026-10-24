import {initializeApp} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,signInWithRedirect,getRedirectResult,setPersistence,browserLocalPersistence,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js';
import {getFirestore,doc,collection,getDoc,setDoc,deleteDoc,onSnapshot,Timestamp,serverTimestamp,runTransaction,writeBatch} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.mjs?build=20261019-shelf-v28';
import {isPermissionDenied,staleMembershipRoute} from './startup-recovery.mjs?build=20261019-shelf-v28';
import {newInviteToken,parseInviteHash,oneTimeInviteUrl} from './invite-links.mjs?build=20261019-shelf-v28';
import {shelfThumbnailUrl} from './cover-thumbnails.mjs?build=20261019-shelf-v28';
import {normalizeNickname} from './nickname.mjs?build=20261019-shelf-v28';
import {mountBookCommunity} from './book-community.mjs?build=20261019-shelf-v28';
import {mountRecommendations} from './recommendations.mjs?build=20261019-shelf-v28';
import {coverStatusLabel,coverIsAlternate,editionStatusLabel} from './bibliography-identity.mjs?build=20261019-shelf-v28';
import {mountPendingReflections} from './pending-reflections.mjs?build=20261019-shelf-v28';
import {mountFamilyActivity} from './activity.mjs?build=20261019-shelf-v28';
import {mountChildRating} from './child-rating.mjs?build=20261019-shelf-v28';
import {mountReadingRecordEditor} from './reading-record-editor.mjs?build=20261019-shelf-v28';
import {readerNameFromShelf} from './reader-name.mjs?build=20261019-shelf-v28';
import {STATUSES,ACTIVE_READ_FILTER,filteredBooks,readPeriodLabel,compactReadPeriodLabel,readingModeLabel,emptyStateMessage} from './domain.mjs?build=20261019-shelf-v28';

const APP_BUILD='20261019-shelf-v28';
const $=id=>{const element=document.getElementById(id);if(!element)throw new Error('APP_DOM_MISMATCH: missing #'+id);return element};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeCover=url=>/^(https:\/\/|data:image\/(jpeg|png|webp);base64,)/i.test(String(url||''))?String(url):'';
const SHOW=['loading','loginPanel','setupPanel','shelfPanel'];
let auth,db,user=null,fid='',role='',household=null,books=[],series=[],members=[],profiles=[],invites=[],openInvites=[],lastInviteLink='';
let unsubs=[],view='shelf',generation=0,ratings=new Map(),closeRating=null,refreshRating=null,closeReadingEdit=null;
let closeCommunity=null,closeRecommendations=null,closeActivity=null,pendingUI=null;
const inviteFromUrl=new URLSearchParams(location.search).get('family')||'';
const openInviteFromUrl=parseInviteHash(location.hash);

function show(id){SHOW.forEach(x=>$(x).hidden=x!==id)}
function notice(m,error=false){$('message').hidden=!m;$('message').textContent=m||'';$('message').className='notice'+(error?' error':'')}
function statusError(e){
  console.error(e);
  const detail=String(e?.code||e?.message||e);
  const versionMismatch=/APP_DOM_MISMATCH|Cannot set properties of null|Cannot read properties of null/.test(detail);
  notice(versionMismatch
    ?'アプリの表示に不整合が発生しました。更新後の画面を読み直すため、アプリを一度終了して開き直してください。改善しない場合はブラウザから開いてください。'
    :'操作を完了できません: '+detail+'\n接続状態・ログイン権限を確認してください。',true);
}
let deferredInstallPrompt=null;
function registerInstallAction(){
  const button=$('installApp');
  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();
    deferredInstallPrompt=event;
    button.hidden=false;
  });
  window.addEventListener('appinstalled',()=>{
    deferredInstallPrompt=null;
    button.hidden=true;
  });
  button.onclick=async()=>{
    if(!deferredInstallPrompt)return;
    const prompt=deferredInstallPrompt;deferredInstallPrompt=null;
    button.hidden=true;
    try{await prompt.prompt();await prompt.userChoice}catch(error){console.warn('Install prompt cancelled',error)}
  };
}
function initUI(){
  registerInstallAction();
  $('googleLogin').onclick=login;
  $('signOut').onclick=async()=>{closeListeners();await signOut(auth)};
  const resetShelf=()=>{$('filter').value=ACTIVE_READ_FILTER;$('search').value=''};
  resetShelf(); // Browser form restoration must not override the default bookshelf.
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{
    if(b.dataset.view==='shelf')resetShelf();
    view=b.dataset.view;render();
  });
  $('familySettings').onclick=()=>{
    const toShelf=view==='family';
    if(toShelf){$('filter').value=ACTIVE_READ_FILTER;$('search').value=''}
    view=toShelf?'shelf':'family';render()
  };
  $('search').addEventListener('input',render);
  $('filter').addEventListener('change',render);
  $('sort').addEventListener('change',render);
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$((b.dataset.close)).close());
  $('bookInfoDialog').addEventListener('close',()=>{closeCommunity?.();closeCommunity=null;closeRating?.();closeRating=null;refreshRating=null;closeReadingEdit?.();closeReadingEdit=null});
}
function updateShelfHeading(){
  const name=household?.name||'本棚';
  $('shelfName').textContent=name;
  $('shelfBrand').textContent=household?name:'家族のほんだな';
  document.title=household?'よんでね | '+name:'よんでね';
}
function closeListeners(){pendingUI?.dispose();pendingUI=null;closeActivity?.();closeActivity=null;closeRecommendations?.();closeRecommendations=null;closeCommunity?.();closeCommunity=null;closeRating?.();closeRating=null;refreshRating=null;closeReadingEdit?.();closeReadingEdit=null;ratings=new Map();unsubs.forEach(u=>u());unsubs=[];fid='';books=[];series=[];members=[];profiles=[];invites=[];openInvites=[];lastInviteLink='';household=null;role='';view='shelf';delete $('content').dataset.screen;$('content').replaceChildren();updateShelfHeading()}
function familyDoc(...a){return doc(db,'families',fid,...a)}
function familyCollection(...a){return collection(db,'families',fid,...a)}
async function login(){
  try{await setPersistence(auth,browserLocalPersistence);await signInWithPopup(auth,new GoogleAuthProvider())}
  catch(e){
    if(['auth/popup-blocked','auth/operation-not-supported-in-this-environment','auth/cancelled-popup-request'].includes(e.code)){
      await signInWithRedirect(auth,new GoogleAuthProvider());return;
    }
    if(e.code!=='auth/popup-closed-by-user')statusError(e);
  }
}
async function signedIn(u){
  const seq=++generation;closeListeners();user=u;notice('');
  $('identity').textContent=u?.email||'';$('signOut').hidden=!u;$('familySettings').hidden=!u;
  if(!u){show('loginPanel');return}
  show('loading');
  let stage='users-profile',storedFamilyId='';
  try{
    const profile=await getDoc(doc(db,'users',u.uid));if(seq!==generation)return;
    if(profile.exists()&&profile.data().familyId){
      storedFamilyId=profile.data().familyId;
      stage='family-access';
      await enterFamily(storedFamilyId,seq);
    }else if(openInviteFromUrl){stage='one-time-invite';await joinOpenInvite(openInviteFromUrl,seq)}
    else if(inviteFromUrl&&/^[A-Za-z0-9]{8,60}$/.test(inviteFromUrl)){
      stage='email-invite';await joinInvite(inviteFromUrl,seq)
    }else showFirstSetup();
  }catch(e){
    if(seq!==generation)return;
    if(e?.code==='stale-family-access'){
      closeListeners();
      const route=staleMembershipRoute({
        storedFamilyId,openInviteFamilyId:openInviteFromUrl?.familyId,
        emailInviteFamilyId:/^[A-Za-z0-9]{8,60}$/.test(inviteFromUrl)?inviteFromUrl:''
      });
      if(route==='one-time-invite'){await joinOpenInvite(openInviteFromUrl,seq);return}
      if(route==='email-invite'){await joinInvite(inviteFromUrl,seq);return}
      show('setupPanel');
      $('setupTitle').textContent='本棚へのアクセスがありません';
      $('setupDesc').textContent=route==='different-family'
        ?'このアカウントには別の本棚の登録情報が残っています。管理者へお問い合わせください。'
        :'このアカウントは本棚から削除されていますが、ブロックされていません。管理者から新しい招待URLを受け取れば、同じGoogleアカウントで再登録できます。';
      $('setupBody').replaceChildren();
      return;
    }
    // Avoid leaving users stuck indefinitely on the generic loading screen.
    show('setupPanel');
    $('setupTitle').textContent='本棚を開けませんでした';
    $('setupDesc').textContent='読み込みに失敗しました。接続を確認し、もう一度お試しください。';
    const body=$('setupBody');body.replaceChildren();
    const retry=document.createElement('button');retry.type='button';retry.className='primary';
    retry.textContent='再試行';
    retry.onclick=()=>void signedIn(u);
    body.append(retry);
    console.warn('Startup stage failed:',stage);
    statusError(e);
  }
}
function showFirstSetup(){
  show('setupPanel');
  $('setupTitle').textContent='本棚に参加';
  $('setupDesc').textContent='この本棚は招待制です。管理者から招待URLを受け取って開いてください。';
  $('setupBody').replaceChildren();
}
async function joinOpenInvite({familyId,token},seq){
  show('setupPanel');$('setupTitle').textContent='本棚に参加';
  $('setupDesc').textContent='1回限りの招待を確認しています…';$('setupBody').replaceChildren();
  try{
    if(!user.emailVerified)throw Error('確認済みのGoogleメールアドレスが必要です');
    const invite=doc(db,'families',familyId,'openInvites',token);
    const membership=doc(db,'families',familyId,'members',user.uid);
    const inviteResult=await runTransaction(db,async transaction=>{
      const snapshot=await transaction.get(invite);
      if(!snapshot.exists())throw Error('招待URLが見つからないか、取り消されています');
      const row=snapshot.data();
      if(row.claimedByUid===user.uid)return 'already-claimed-by-self'; // May recover interrupted profile write.
      if(row.claimedByUid)throw Error('この招待URLはすでに使用されています');
      if(row.expiresAt.toMillis()<=Date.now())throw Error('招待URLの期限が切れています');
      if(row.role!=='viewer')throw Error('招待の権限設定が正しくありません');
      transaction.update(invite,{claimedByUid:user.uid,claimedAt:serverTimestamp()});
      transaction.set(membership,{uid:user.uid,email:user.email,displayName:user.displayName||'',
        role:'viewer',joinedAt:serverTimestamp(),inviteToken:token});
      return 'new-claim';
    });
    if(seq!==generation)return;
    if(inviteResult==='already-claimed-by-self'){
      // A previously deleted member cannot reuse a consumed invite. For an
      // active member, retain the interrupted-profile-write recovery behavior.
      const existing=await getDoc(membership).catch(()=>null);
      if(!existing?.exists()){
        throw Error('この招待URLは使用済みです。削除済みアカウントの再登録には新しい招待URLが必要です。');
      }
    }
    await setDoc(doc(db,'users',user.uid),{familyId});
    if(seq!==generation)return;
    history.replaceState(null,'',location.pathname);
    await enterFamily(familyId,++generation);
  }catch(error){
    if(seq!==generation)return;
    $('setupDesc').textContent='招待による参加を完了できませんでした。';
    statusError(error);
  }
}

async function joinInvite(id,seq){
  show('setupPanel');$('setupTitle').textContent='本棚に参加';
  $('setupDesc').textContent='招待を確認しています…';$('setupBody').replaceChildren();
  try{
    if(!user.emailVerified)throw Error('確認済みのGoogleメールアドレスが必要です');
    const email=user.email.toLowerCase(), ref=doc(db,'families',id,'invites',email);
    const invitation=await getDoc(ref);if(seq!==generation)return;
    if(!invitation.exists()||invitation.data().expiresAt.toMillis()<Date.now())throw Error('有効な招待がありません。管理者へ確認してください');
    const info=invitation.data();
    $('setupDesc').textContent=email+' 宛に家族の本棚への招待が届いています。';
    const btn=document.createElement('button');btn.textContent='本棚に参加する';btn.className='primary';
    btn.onclick=async()=>{btn.disabled=true;try{
      const membership=doc(db,'families',id,'members',user.uid);
      try{await setDoc(membership,{uid:user.uid,email:user.email,displayName:user.displayName||'',role:info.role,joinedAt:Timestamp.now()})}
      catch(error){const existing=await getDoc(membership).catch(()=>null);if(!existing?.exists())throw error}
      await setDoc(doc(db,'users',user.uid),{familyId:id});
      history.replaceState(null,'',location.pathname);
      await enterFamily(id,++generation);
    }catch(e){btn.disabled=false;statusError(e)}};
    $('setupBody').append(btn);
  }catch(e){$('setupDesc').textContent='招待を確認できませんでした。';statusError(e)}
}
async function requireNickname(id,seq){
  const profileRef=doc(db,'families',id,'publicProfiles',user.uid);
  const snapshot=await getDoc(profileRef);
  if(seq!==generation||snapshot.exists())return;
  show('setupPanel');
  $('setupTitle').textContent='ニックネームを登録';
  $('setupDesc').textContent='コメントやおすすめにはニックネームを表示します。Googleアカウントの氏名やメールは公開しません。';
  const body=$('setupBody');body.replaceChildren();
  const form=document.createElement('form');
  const label=document.createElement('label');label.textContent='表示するニックネーム（2〜20文字）';
  const input=document.createElement('input');input.type='text';input.minLength=2;input.maxLength=20;input.required=true;
  input.autocomplete='nickname';input.setAttribute('aria-label','ニックネーム');
  const submit=document.createElement('button');submit.type='submit';submit.className='primary';submit.textContent='登録して本棚へ';
  const error=document.createElement('p');error.className='muted tiny';error.setAttribute('role','alert');
  label.append(input);form.append(label,submit,error);body.append(form);
  await new Promise(resolve=>{
    form.onsubmit=async event=>{
      event.preventDefault();if(seq!==generation)return;
      submit.disabled=true;
      try{
        const nickname=normalizeNickname(input.value);
        await setDoc(profileRef,{uid:user.uid,nickname,updatedAt:serverTimestamp()});
        resolve();
      }catch(e){error.textContent=e?.message||'保存に失敗しました。再試行してください';submit.disabled=false}
    };
  });
}

async function enterFamily(id,seq){
  fid=id;
  let f;
  try{f=await getDoc(doc(db,'families',id))}
  catch(error){
    if(!isPermissionDenied(error))throw error;
    const unavailable=new Error('Previous family membership is not accessible.');
    unavailable.code='stale-family-access';
    throw unavailable;
  }
  if(seq!==generation)return;
  if(!f.exists())throw Error('家族の本棚が見つかりません。アクセス権を確認してください');
  household=f.data();
  updateShelfHeading();
  const memberRef=await getDoc(doc(db,'families',id,'members',user.uid));
  role=household.ownerUid===user.uid?'owner':memberRef.data()?.role||'viewer';
  await requireNickname(id,seq);if(seq!==generation)return;
  show('shelfPanel');
  unsubs.push(onSnapshot(doc(db,'families',fid),snapshot=>{
    if(!snapshot.exists()){notice('本棚が見つかりません。管理者にお問い合わせください。',true);return}
    household=snapshot.data();updateShelfHeading();if(view==='family')render();
  },statusError));
  unsubs.push(onSnapshot(familyCollection('books'),snap=>{books=snap.docs.map(d=>d.data());render();refreshRating?.()},statusError));
  unsubs.push(onSnapshot(familyCollection('childBookRatings'),snap=>{
    ratings=new Map(snap.docs.map(d=>[d.id,d.data()]));render();refreshRating?.();
  },statusError));
  unsubs.push(onSnapshot(familyCollection('series'),snap=>{series=snap.docs.map(d=>d.data());render()},statusError));
  unsubs.push(onSnapshot(familyCollection('publicProfiles'),snap=>{
    profiles=snap.docs.map(d=>d.data());render();closeActivity?.refresh?.()
  },statusError));
  if(role==='owner'){
    unsubs.push(onSnapshot(familyCollection('members'),snap=>{members=snap.docs.map(d=>d.data());render()},statusError));
    unsubs.push(onSnapshot(familyCollection('invites'),snap=>{invites=snap.docs.map(d=>d.data());render()},statusError));
    unsubs.push(onSnapshot(familyCollection('openInvites'),snap=>{openInvites=snap.docs.map(d=>({id:d.id,...d.data()}));render()},statusError));
  }
  render();
}
function render(){
  if(view!=='family'&&pendingUI){pendingUI.dispose();pendingUI=null}
  if(view!=='recommendations'){closeRecommendations?.();closeRecommendations=null}
  if(!fid||!$('shelfPanel')||$('shelfPanel').hidden)return;
  // Activity is independent of the filtered book grid and is mounted once per
  // shelf visit. Search/sort/snapshot refreshes must not recreate its listener.
  const activityMount=$('activityMount');
  activityMount.hidden=view!=='shelf';
  if(view==='shelf'&&!closeActivity){
    closeActivity=mountFamilyActivity({db,fid,container:activityMount,
      userUid:user.uid,readerName:()=>readerNameFromShelf(household?.name),
      members:()=>profiles.map(p=>({uid:p.uid,displayName:p.nickname})),
      onError:statusError,
      onBook:(id,commentId)=>{const found=books.find(b=>b.id===id);if(found)openBookInfo(found,commentId)},
      onRecommendations:()=>{view='recommendations';render()}});
  }else if(view!=='shelf'&&closeActivity){
    closeActivity();closeActivity=null;
  }
  $('readCount').textContent=books.filter(b=>b.status==='read').length+'冊';
  $('totalCount').textContent=books.length+'冊';
  $('seriesCount').textContent=series.length;
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  $('familySettings').classList.toggle('active',view==='family');
  $('bookControls').hidden=view!=='shelf';
  if(view==='family'){renderFamily();return}
  const content=$('content');
  delete content.dataset.screen;
  if(view==='recommendations'){renderRecommendations();return}
  const opts={
    search:$('search').value,
    filter:view==='series'?'all':$('filter').value,
    sort:$('sort').value
  };
  const data=filteredBooks(books.map(b=>({...b,childRating:b.status==='unread'?null:ratings.get(b.id)?.stars??null})),opts,series);
  const root=content;root.className='';root.replaceChildren();
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
        root.append(shelfSection('いま読んでる',reading));
        if(completed.length)root.append(shelfSection('読んだ本',completed));
        return;
      }
    }
    root.append(bookGrid(data));return;
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
      const items=grouped.get(key).sort((a,b)=>(a.volume||999)-(b.volume||999));
      const meta=known.get(key);
      root.append(groupSection(meta?.name||'名称未登録のシリーズ',meta?.note||'',items,meta?.totalVolumes,true));
    }
    if(!keys.length){
      const empty=document.createElement('div');empty.className='empty';
      empty.textContent=emptyStateMessage({view:'series',search:opts.search});
      root.append(empty);
    }
    return;
  }
}
function shelfSection(title,items){
  const section=document.createElement('section');section.className='group activeShelfGroup';
  const heading=document.createElement('h2');heading.textContent=title;
  section.append(heading,bookGrid(items));
  return section;
}
function groupSection(title,note,items,total,isSeries=false){
  const section=document.createElement('section');section.className='group';
  const h=document.createElement('h2');h.textContent=title;section.append(h);
  const p=document.createElement('p');
  const read=items.filter(b=>b.status==='read').length;
  p.textContent=isSeries
    ?'登録'+items.length+'冊・読んだ'+read+'冊'+(total?' / 全'+total+'巻':'')+(note?' · '+note:'')
    :read+'冊読んだ'+(note?' · '+note:'');
  section.append(p,bookGrid(items));return section;
}
function bookGrid(data){
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
    const title=document.createElement('strong');title.textContent=b.title+(b.edition?' 〈'+b.edition+'〉':'');
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
function openBookInfo(book,focusCommentId=''){
  closeRating?.();closeRating=null;refreshRating=null;closeReadingEdit?.();closeReadingEdit=null;
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
  const editArea=document.createElement('div');editArea.className='readingRecordEditSection';root.append(editArea);
  const readingEditor=mountReadingRecordEditor({
    db,fid,book,user,owner:role==='owner',container:editArea,
    getBook:()=>books.find(item=>item.id===book.id)||null,
    onSaved:saved=>{
      books=books.map(item=>item.id===saved.id?saved:item);
      render();openBookInfo(saved);
    },
    onError:statusError
  });
  closeReadingEdit=readingEditor.dispose;
  const ratingArea=document.createElement('div');ratingArea.className='childRatingSection';
  root.append(ratingArea);
  const ratingControl=mountChildRating({
    db,fid,book,user,owner:role==='owner',container:ratingArea,
    getRating:()=>ratings.get(book.id)||null,
    getBook:()=>books.find(item=>item.id===book.id)||null,
    onError:statusError
  });
  closeRating=ratingControl.dispose;
  refreshRating=ratingControl.refresh;

  // Family interactions are the primary use of the detail page, not ISBN data.
  closeCommunity?.();
  const community=document.createElement('div');community.className='communityRoot';
  root.append(community);
  closeCommunity=mountBookCommunity({
    db,fid,book,user,owner:role==='owner',members:()=>profiles.map(p=>({uid:p.uid,displayName:p.nickname})),
    container:community,onError:statusError,focusCommentId,readerName:readerNameFromShelf(household?.name),
    onReflectionSaved:()=>{void pendingUI?.refresh()}
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
    ['巻番号',book.volume?book.volume+'巻':''],
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
function renderRecommendations(){
  if(closeRecommendations)return;
  const root=$('content');root.className='';root.replaceChildren();
  closeRecommendations=mountRecommendations({
    db,fid,user,owner:role==='owner',members:()=>profiles.map(p=>({uid:p.uid,displayName:p.nickname})),books:()=>books,container:root,onError:statusError
  });
}
function renderFamily(){
  const root=$('content');
  // Create the profile editor once per visit. Snapshot updates must not destroy
  // a focused text input or interrupt Japanese IME composition.
  if(root.dataset.screen!=='family'){
    root.replaceChildren();root.className='listPanel';root.dataset.screen='family';
    const title=document.createElement('h2');title.textContent='プロフィールと設定';root.append(title);
    const info=document.createElement('p');info.className='muted';info.textContent='ログイン中：'+user.email;root.append(info);
    const nicknameHeading=document.createElement('h3');nicknameHeading.textContent='自分のニックネーム';root.append(nicknameHeading);
    const nicknameForm=document.createElement('form');nicknameForm.className='familyActions nicknameForm';
    const nicknameInput=document.createElement('input');nicknameInput.type='text';nicknameInput.minLength=2;
    nicknameInput.maxLength=20;nicknameInput.required=true;
    nicknameInput.value=profiles.find(p=>p.uid===user.uid)?.nickname||'';
    nicknameInput.setAttribute('aria-label','ニックネームを変更');
    nicknameInput.oninput=()=>{nicknameInput.dataset.dirty='true'};
    const nicknameSave=document.createElement('button');nicknameSave.className='primary';
    nicknameSave.type='submit';nicknameSave.textContent='変更を保存';
    nicknameForm.append(nicknameInput,nicknameSave);root.append(nicknameForm);
    nicknameForm.onsubmit=async e=>{
      e.preventDefault();nicknameSave.disabled=true;nicknameInput.disabled=true;
      try{
        const nickname=normalizeNickname(nicknameInput.value);
        await setDoc(familyDoc('publicProfiles',user.uid),{
          uid:user.uid,nickname,updatedAt:serverTimestamp()
        });
        nicknameInput.value=nickname;
        delete nicknameInput.dataset.dirty;
        notice('ニックネームを更新しました');
      }catch(error){statusError(error)}
      finally{nicknameSave.disabled=false;nicknameInput.disabled=false}
    };
    if(role==='owner'){
      pendingUI=mountPendingReflections({db,fid,books:()=>books,container:root,
        onBook:id=>{
          const found=books.find(b=>b.id===id);
          if(!found)return;
          openBookInfo(found);
          const editor=$('bookInfoDialog').querySelector('.reflectionEditorDetails');
          if(editor){
            editor.open=true;
            requestAnimationFrame(()=>editor.isConnected&&editor.scrollIntoView({block:'nearest'}));
          }
        },onError:statusError
      });
    }
    const memberArea=document.createElement('section');memberArea.className='settingsMembers';
    memberArea.dataset.familyMembers='';root.append(memberArea);
    if(role==='owner'){
      const inviteArea=document.createElement('section');inviteArea.className='settingsInvites';
      inviteArea.dataset.familyInvites='';root.append(inviteArea);
    }
  }
  // Only synchronize untouched input. A dirty field retains its DOM node,
  // caret and composition state through every Firestore onSnapshot.
  const input=root.querySelector('.nicknameForm input');
  if(input&&!input.dataset.dirty&&document.activeElement!==input){
    input.value=profiles.find(p=>p.uid===user.uid)?.nickname||input.value;
  }
  const memberArea=root.querySelector('[data-family-members]');
  memberArea.replaceChildren();
  const heading=document.createElement('h3');heading.textContent='メンバー';memberArea.append(heading);
  // Only owners receive private member email data.
  const listing=role==='owner'?members:profiles;
  for(const m of listing){
    const row=document.createElement('div');row.className='person';
    const who=document.createElement('div');
    const name=document.createElement('strong');
    name.textContent=profiles.find(p=>p.uid===m.uid)?.nickname||'ニックネーム未設定';
    who.append(name);
    if(role==='owner'){
      const detail=document.createElement('div');detail.className='muted tiny';
      detail.textContent=m.email+(m.role==='owner'?' · 管理者':'');
      who.append(detail);
    }
    row.append(who);
    if(role==='owner'&&m.role!=='owner'){
      const revoke=document.createElement('button');revoke.className='danger';
      revoke.textContent='メンバーから削除';
      revoke.onclick=async()=>{
        if(!confirm(m.email+' をメンバーから削除しますか？\n現在のアクセス権だけを解除します。ブロックではないため、新しい招待URLから再登録できます。'))return;
        try{
          const batch=writeBatch(db);
          batch.delete(familyDoc('members',m.uid));
          batch.delete(familyDoc('publicProfiles',m.uid));
          await batch.commit();
        }catch(e){statusError(e)}
      };
      row.append(revoke);
    }
    memberArea.append(row);
  }
  if(role!=='owner')return;
  const inviteArea=root.querySelector('[data-family-invites]');
  inviteArea.replaceChildren();
  const inviteTitle=document.createElement('h3');inviteTitle.textContent='招待';inviteArea.append(inviteTitle);
  const hint=document.createElement('p');hint.className='muted';
  hint.textContent='リンクを受け取った最初のGoogleログイン利用者1人だけが参加できます。有効期限は7日間です。URLは招待する相手に個別に共有してください。';
  inviteArea.append(hint);
  const create=document.createElement('button');create.className='primary';create.textContent='1回限りの招待URLを作成';
  create.onclick=async()=>{
    create.disabled=true;
    try{
      const token=newInviteToken();
      await setDoc(familyDoc('openInvites',token),{role:'viewer',createdAt:serverTimestamp(),
        expiresAt:Timestamp.fromMillis(Date.now()+7*86400000),claimedByUid:'',claimedAt:null});
      lastInviteLink=oneTimeInviteUrl(location.href,fid,token);
      if(view==='family')renderFamily();
      notice('新しい招待URLを作成しました。招待する相手へ個別に送ってください。');
    }catch(error){statusError(error)}finally{create.disabled=false}
  };
  inviteArea.append(create);
  if(lastInviteLink){
    const share=document.createElement('div');share.className='invite';
    const label=document.createElement('strong');label.textContent='新しく発行した招待URL';
    const address=document.createElement('div');address.className='link';address.textContent=lastInviteLink;
    const copy=document.createElement('button');copy.textContent='URLをコピー';
    copy.onclick=async()=>{try{await navigator.clipboard.writeText(lastInviteLink);notice('URLをコピーしました')}catch(e){statusError(e)}};
    share.append(label,address,copy);inviteArea.append(share);
  }
  for(const invite of openInvites){
    const row=document.createElement('div');row.className='person';
    const label=document.createElement('span');
    label.textContent=(invite.claimedByUid?'使用済み':'未使用')+' · 有効期限 '+invite.expiresAt?.toDate?.()?.toLocaleDateString('ja-JP');
    row.append(label);
    if(!invite.claimedByUid){
      const cancel=document.createElement('button');cancel.textContent='リンクを取り消す';
      cancel.onclick=async()=>{try{
        await deleteDoc(familyDoc('openInvites',invite.id));
        if(lastInviteLink.includes(invite.id))lastInviteLink='';
      }catch(error){statusError(error)}};
      row.append(cancel);
    }
    inviteArea.append(row);
  }
  if(invites.length){
    const old=document.createElement('p');old.className='muted tiny';
    old.textContent='旧方式のメール招待（新規発行は終了）';inviteArea.append(old);
  }
  for(const invite of invites){
    const row=document.createElement('div');row.className='person';
    const tx=document.createElement('span');
    tx.textContent=invite.email+' · 有効期限 '+invite.expiresAt?.toDate().toLocaleDateString('ja-JP');
    const cancel=document.createElement('button');cancel.textContent='招待を取り消す';
    cancel.onclick=async()=>{try{await deleteDoc(familyDoc('invites',invite.email))}catch(e){statusError(e)}};
    row.append(tx,cancel);inviteArea.append(row);
  }
  const note=document.createElement('p');note.className='muted';
  note.textContent='本の登録・修正・削除は管理者が行います。';
  inviteArea.append(note);
  const version=document.createElement('p');version.className='muted tiny appVersion';
  version.textContent='アプリのバージョン：'+APP_BUILD;
  inviteArea.append(version);
}
async function start(){
  if(document.documentElement.dataset.appBuild!==APP_BUILD){
    console.error('HTML and JavaScript build IDs do not match');
    const alert=document.getElementById('message');
    if(alert){alert.hidden=false;alert.textContent='アプリの更新データが一致しません。画面を更新してください。';alert.className='notice error'}
    return;
  }
  initUI();
  if(!firebaseConfig?.apiKey||!firebaseConfig?.projectId||!firebaseConfig?.appId){
    show('setupPanel');$('setupTitle').textContent='Firebaseの初期設定が必要です';$('setupDesc').textContent='プロジェクト接続設定がまだ登録されていません。管理者がFirebaseを作成し、firebase-config.mjsを設定してください。';$('setupBody').replaceChildren();return;
  }
  try{
    const app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);
    await setPersistence(auth,browserLocalPersistence);
    await getRedirectResult(auth).catch(e=>{if(e.code!=='auth/no-auth-event')throw e});
    onAuthStateChanged(auth,u=>{void signedIn(u)},statusError);
  }catch(e){show('setupPanel');statusError(e)}
}
// Install the app shell without caching private Firebase data.
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'})
      .then(registration=>registration.update())
      .catch(error=>console.warn('PWA registration failed',error));
  });
}
void start();
