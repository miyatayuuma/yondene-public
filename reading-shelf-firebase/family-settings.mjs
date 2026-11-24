import {doc,setDoc,deleteDoc,Timestamp,serverTimestamp,writeBatch} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';
import {normalizeNickname} from './nickname.mjs';
import {newInviteToken,oneTimeInviteUrl} from './invite-links.mjs';

export function createSettingsView({forest,mountPending,notice,statusError,isCurrent,onInviteChange,appBuild}){
  let lastInviteLink='';
  function render({root,db,fid,role,user,profiles,members,invites,openInvites}){
    const identity={fid,uid:user.uid};
    const familyDoc=(...parts)=>doc(db,'families',fid,...parts);
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
        const forestArea=document.createElement('section');forestArea.className='forestSettingsEntry';
        const forestTitle=document.createElement('h3');forestTitle.textContent='🌿 本の森';forestArea.append(forestTitle);
        forest.mountControls(forestArea);root.append(forestArea);
      }
      if(role==='owner')mountPending(root);
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
        if(!isCurrent(identity))return;
        lastInviteLink=oneTimeInviteUrl(location.href,fid,token);
        onInviteChange();
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
          if(isCurrent(identity)&&lastInviteLink.includes(invite.id)){lastInviteLink='';onInviteChange()}
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
    version.textContent='アプリのバージョン：'+appBuild;
    inviteArea.append(version);
  }
  return {render,reset:()=>{lastInviteLink=''}};
}
