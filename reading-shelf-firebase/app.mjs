import {initializeApp} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,signInWithRedirect,getRedirectResult,setPersistence,browserLocalPersistence,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js';
import {getFirestore,doc,collection,getDoc,getDocs,query,limit,orderBy,setDoc,onSnapshot,Timestamp,serverTimestamp,runTransaction} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.mjs';
import {isPermissionDenied,staleMembershipRoute} from './startup-recovery.mjs';
import {parseInviteHash} from './invite-links.mjs';
import {normalizeNickname} from './nickname.mjs';
import {mountRecommendations} from './recommendations.mjs';
import {mountPendingReflections} from './pending-reflections.mjs';
import {mountFamilyActivity} from './activity.mjs';
import {readerNameFromShelf} from './reader-name.mjs';
import {renderBookshelf} from './bookshelf-view.mjs';
import {createBookDetails} from './book-details.mjs';
import {createSettingsView} from './family-settings.mjs';
import {createForestAccess} from './book-forest-access.mjs';
import {ACTIVE_READ_FILTER} from './domain.mjs';

const APP_BUILD=document.documentElement.dataset.appBuild;
const $=id=>{const element=document.getElementById(id);if(!element)throw new Error('APP_DOM_MISMATCH: missing #'+id);return element};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SHOW=['loading','loginPanel','setupPanel','shelfPanel'];
let auth,db,user=null,fid='',role='',household=null,books=[],series=[],members=[],profiles=[],invites=[],openInvites=[];
let unsubs=[],view='shelf',generation=0,ratings=new Map();
let closeRecommendations=null,closeActivity=null,pendingUI=null;
const inviteFromUrl=new URLSearchParams(location.search).get('family')||'';
const openInviteFromUrl=parseInviteHash(location.hash);

const forest=createForestAccess({getUser:()=>user,getFamilyId:()=>fid,
  isOwner:(familyId,uid)=>Boolean(familyId&&uid&&role==='owner'&&fid===familyId&&user?.uid===uid),
  getBooks:()=>books,familyDoc,familyCollection,notice,statusError,appBuild:APP_BUILD});

const visibleMembers=()=>profiles.map(p=>({uid:p.uid,displayName:p.nickname}));
const bookDetails=createBookDetails({$,statusError,members:visibleMembers,
  getBook:id=>books.find(book=>book.id===id)||null,getRating:id=>ratings.get(id)||null,
  onReflectionSaved:()=>{void pendingUI?.refresh()},
  onSaved:(saved,familyId,uid)=>{
    if(fid!==familyId||user?.uid!==uid)return;
    books=books.map(item=>item.id===saved.id?saved:item);
    render();openBookInfo(saved);
  }});
const familySettings=createSettingsView({forest,notice,statusError,appBuild:APP_BUILD,
  isCurrent:identity=>fid===identity.fid&&user?.uid===identity.uid,
  onInviteChange:()=>{if(view==='family')renderFamily()},
  mountPending:container=>{
    pendingUI=mountPendingReflections({db,fid,books:()=>books,container,
      onBook:id=>{
        const found=books.find(b=>b.id===id);
        if(!found)return;
        openBookInfo(found);
        const editor=$('bookInfoDialog').querySelector('.reflectionEditorDetails');
        if(editor){
          editor.open=true;
          requestAnimationFrame(()=>editor.isConnected&&editor.scrollIntoView({block:'nearest'}));
        }
      },onError:statusError});
  }});

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
  $('signOut').onclick=async()=>{
    const identity={ownerUid:user?.uid,familyId:fid};
    closeListeners();
    await forest.clearPrivateData(identity);
    await signOut(auth);
  };
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
  $('bookInfoDialog').addEventListener('close',bookDetails.close);
}
function updateShelfHeading(){
  const name=household?.name||'本棚';
  $('shelfName').textContent=name;
  $('shelfBrand').textContent=household?name:'家族のほんだな';
  document.title=household?'よんでね | '+name:'よんでね';
}
function closeListeners(){
  forest.close();familySettings.reset();bookDetails.close();
  $('bookInfoDialog').close();$('bookInfoBody').replaceChildren();
  pendingUI?.dispose();pendingUI=null;
  closeActivity?.();closeActivity=null;
  closeRecommendations?.();closeRecommendations=null;
  unsubs.forEach(unsubscribe=>unsubscribe());unsubs=[];
  fid='';books=[];series=[];members=[];profiles=[];invites=[];openInvites=[];
  ratings=new Map();household=null;role='';view='shelf';
  delete $('content').dataset.screen;$('content').replaceChildren();
  updateShelfHeading();
}
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
  unsubs.push(onSnapshot(familyCollection('books'),snap=>{books=snap.docs.map(d=>d.data());render();bookDetails.refresh()},statusError));
  unsubs.push(onSnapshot(familyCollection('childBookRatings'),snap=>{
    ratings=new Map(snap.docs.map(d=>[d.id,d.data()]));render();bookDetails.refresh();
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
      members:visibleMembers,
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
  renderBookshelf({root:content,view,opts,books,series,ratings,openBookInfo});
}
function openBookInfo(book,focusCommentId=''){
  bookDetails.open({db,fid,user,role,series,book,focusCommentId,readerName:readerNameFromShelf(household?.name)});
}
function renderRecommendations(){
  if(closeRecommendations)return;
  const root=$('content');root.className='';root.replaceChildren();
  closeRecommendations=mountRecommendations({
    db,fid,user,owner:role==='owner',members:visibleMembers,books:()=>books,container:root,onError:statusError
  });
}
function renderFamily(){
  familySettings.render({root:$('content'),db,fid,role,user,profiles,members,invites,openInvites});
}
async function start(){
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
