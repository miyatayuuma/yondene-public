import {addOwnerReflectionForm} from './owner-reflection.mjs?build=20261019-shelf-v28';
import {withdrawReflection,restoreReflection} from './reflection-withdrawal.mjs?build=20261019-shelf-v28';
import {collection,doc,onSnapshot,query,where,orderBy,limit,setDoc,updateDoc,deleteDoc,getDoc,writeBatch,serverTimestamp} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';

const elem=(tag,className='',text='')=>{
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(text)node.textContent=text;
  return node;
};
const newest=(a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0);
const formatted=stamp=>stamp?.toDate?.()?.toLocaleDateString('ja-JP')||'投稿中';
const clean=value=>String(value||'').trim();
const sayError=(onError,e)=>{if(onError)onError(e);else console.error(e)};

export function mountBookCommunity({db,fid,book,user,owner,members,container,onError,focusCommentId='',readerName='子ども',onReflectionSaved}){
  let stopped=false;
  const unsubs=[];
  const base=['families',fid,'books',book.id];
  const comments=collection(db,...base,'comments');
  const targetId=/^[A-Za-z0-9_-]{1,128}$/.test(focusCommentId)?focusCommentId:'';
  let currentComments=[],targetComment=null,targetResolved=false,focusDone=false;
  const activity=collection(db,'families',fid,'activity');
  const activityFor=id=>doc(activity,'comment-'+id);
  const reactionActivityFor=verb=>doc(activity,verb+'-'+book.id+'-'+user.uid);
  const likes=collection(db,...base,'reactions');
  const requests=collection(db,...base,'requests');
  const reflections=collection(db,...base,'childReflections');
  const archive=owner?collection(db,...base,'withdrawnReflections'):null;
  const displayName=uid=>{
    if(uid===user.uid)return '自分';
    const member=members().find(m=>m.uid===uid);
    return member?.displayName||'メンバー';
  };
  const section=elem('section','community');
  const title=elem('h3','communityHeading','感想とコメント');
  section.append(title);

  const reflectionBox=elem('div','communityPanel');
  reflectionBox.append(elem('h4','',readerName+'の感想'));
  const reflectionItems=elem('div','communityStack');
  reflectionItems.append(elem('p','muted tiny','感想はまだありません。'));
  reflectionBox.append(reflectionItems);
  if(owner){
    const disclosure=document.createElement('details');disclosure.className='reflectionEditorDetails';
    const summary=document.createElement('summary');summary.textContent=readerName+'の感想を記録する';
    disclosure.append(summary);reflectionBox.append(disclosure);
    const form=addOwnerReflectionForm({db,fid,book,user,container:disclosure,onError,readerName,onSaved:onReflectionSaved});
    unsubs.push(form.dispose);
  }
  section.append(reflectionBox);

  const reactionBox=elem('div','communityReactions');
  const likeButton=elem('button','reactionButton','♡ いいね');
  const askButton=elem('button','reactionButton','感想をききたい');
  likeButton.type=askButton.type='button';
  reactionBox.append(likeButton,askButton);
  section.append(reactionBox);

  const commentBox=elem('div','communityPanel');
  commentBox.append(elem('h4','','コメント'));
  const jumpNotice=elem('p','muted tiny commentJumpNotice');
  jumpNotice.hidden=!targetId;
  commentBox.append(jumpNotice);
  const commentItems=elem('div','communityStack');
  commentItems.append(elem('p','muted tiny','まだコメントはありません。'));
  commentBox.append(commentItems);
  const form=elem('form','commentCompose');
  const input=elem('textarea');input.rows=2;input.maxLength=2000;
  input.placeholder='この本についてひとこと…';
  input.setAttribute('aria-label','コメントを入力');
  const submit=elem('button','primary','投稿する');submit.type='submit';
  form.append(input,submit);commentBox.append(form);
  const moderatedItems=elem('div','communityStack');
  if(owner){
    const moderatedTitle=elem('h4','','非表示にしたコメント');
    moderatedTitle.className='moderatedHeading';
    commentBox.append(moderatedTitle,moderatedItems);
    moderatedTitle.hidden=true;moderatedItems.hidden=true;
    // Only show moderation tools when there is moderated content.
    unsubs.push(()=>{moderatedTitle.hidden=true;moderatedItems.hidden=true});
  }
  section.append(commentBox);
  container.append(section);

  const subscribe=(ref,callback)=>{
    const unsubscribe=onSnapshot(ref,snapshot=>{
      if(!stopped)callback(snapshot.docs.map(d=>({id:d.id,...d.data()})));
    },e=>{if(!stopped)sayError(onError,e)});
    unsubs.push(unsubscribe);
  };
  const reflectionCard=(entry,archived=false)=>{
    const data=archived?entry.original:entry;
    const card=elem('article','reflectionCard'+(archived?' reflectionArchived':''));
    card.append(elem('p','reflectionQuote',data.quote||data.text||''));
    const label=data.attribution==='verbatim'?'本人の言葉':'親による要約・観察';
    card.append(elem('p','muted tiny',label+(data.observedAt?' · '+data.observedAt:'')));
    if(owner){
      const button=elem('button',archived?'primary':'textAction',
        archived?'復元する':'記録を取り消す');
      button.type='button';
      button.onclick=async()=>{
        const labelText=archived?'復元':'取り消し';
        if(!confirm(book.title+'の感想を'+labelText+'しますか？\n'+String(data.quote||'').slice(0,100)))return;
        button.disabled=true;
        try{
          if(archived)await restoreReflection({db,fid,bookId:book.id,reflectionId:entry.id});
          else await withdrawReflection({db,fid,bookId:book.id,reflectionId:entry.id,uid:user.uid});
          onReflectionSaved?.();
        }catch(e){sayError(onError,e)}
        finally{if(!stopped)button.disabled=false}
      };
      card.append(button);
    }
    return card;
  };
  subscribe(query(reflections,orderBy('createdAt','desc'),limit(30)),list=>{
    reflectionItems.replaceChildren();
    if(!list.length){
      reflectionItems.append(elem('p','muted tiny','感想はまだありません。'));
      return;
    }
    for(const entry of list.sort(newest))reflectionItems.append(reflectionCard(entry));
  });
  if(owner){
    const disclosure=document.createElement('details');
    disclosure.className='withdrawnReflections';
    const head=document.createElement('summary');
    head.textContent='取り消した感想を見る';
    const body=elem('div','communityStack');
    disclosure.append(head,body);reflectionBox.append(disclosure);
    let unsubArchive=null;
    const onToggle=()=>{
      if(!disclosure.open){
        unsubArchive?.();unsubArchive=null;body.replaceChildren();return;
      }
      if(unsubArchive)return;
      body.replaceChildren(elem('p','muted tiny','履歴を読み込んでいます…'));
      unsubArchive=onSnapshot(query(archive,orderBy('withdrawnAt','desc'),limit(30)),snap=>{
        if(stopped)return;
        body.replaceChildren();
        if(snap.empty){
          body.append(elem('p','muted tiny','取り消した感想はありません。'));
          return;
        }
        for(const doc of snap.docs)body.append(reflectionCard({id:doc.id,...doc.data()},true));
      },e=>{if(!stopped)sayError(onError,e)});
    };
    disclosure.addEventListener('toggle',onToggle);
    unsubs.push(()=>{
      disclosure.removeEventListener('toggle',onToggle);
      unsubArchive?.();
    });
  }

  const renderToggle=(button,list,verb)=>{
    const mine=list.some(x=>x.uid===user.uid);
    button.classList.toggle('selected',mine);
    button.setAttribute('aria-pressed',String(mine));
    button.textContent=(verb==='like'?'♡ いいね':'感想をききたい')+' · '+list.length+(mine?' ✓':'');
    button.onclick=async()=>{
      button.disabled=true;
      try{
        const key=doc(db,...base,verb==='like'?'reactions':'requests',user.uid);
        const activityRef=reactionActivityFor(verb==='like'?'like':'ask-reflection');
        if(mine){
          // Older v11 reactions have no corresponding activity; keep their removal working.
          const existing=await getDoc(activityRef);
          const batch=writeBatch(db);
          batch.delete(key);
          if(existing.exists())batch.delete(activityRef);
          await batch.commit();
        }else{
          const batch=writeBatch(db);
          batch.set(key,{uid:user.uid,kind:verb==='like'?'like':'ask-reflection',createdAt:serverTimestamp()});
          batch.set(activityRef,{actorUid:user.uid,kind:verb==='like'?'like':'ask-reflection',
            title:book.title,bookId:book.id,sourceId:user.uid,hidden:false,createdAt:serverTimestamp()});
          await batch.commit();
        }
      }catch(e){sayError(onError,e)}finally{if(!stopped)button.disabled=false}
    };
  };
  subscribe(query(likes,limit(100)),list=>renderToggle(likeButton,list,'like'));
  subscribe(query(requests,limit(100)),list=>renderToggle(askButton,list,'request'));

  function drawComments(whereTo,list,isModerated=false){
    whereTo.replaceChildren();
    const rows=[...list];
    if(!isModerated&&targetComment&&!rows.some(x=>x.id===targetId))rows.unshift(targetComment);
    if(!isModerated&&targetId){
      jumpNotice.hidden=rows.some(x=>x.id===targetId);
      if(!jumpNotice.hidden)jumpNotice.textContent=targetResolved?
        'このコメントは表示できません（削除または非表示）。':'コメントを探しています…';
    }
    if(!rows.length&&!isModerated){whereTo.append(elem('p','muted tiny','まだコメントはありません。'));return}
    for(const item of rows.sort(newest)){
      const card=elem('article','commentItem');
      if(!isModerated&&targetId===item.id){
        card.classList.add('commentFocused');
        card.tabIndex=-1;
        if(!focusDone){
          focusDone=true;
          requestAnimationFrame(()=>{
            if(!stopped&&card.isConnected){
              card.scrollIntoView({block:'center',behavior:'smooth'});
              card.focus({preventScroll:true});
            }
          });
        }
      }
      const head=elem('div','commentHead');
      head.append(elem('strong','',displayName(item.authorUid)),elem('span','muted tiny',formatted(item.createdAt)));
      const message=elem('p','commentText',item.body);
      card.append(head,message);
      const actions=elem('div','commentActions');
      const own=item.authorUid===user.uid;
      const action=(text,fn)=>{
        const button=elem('button','textAction',text);button.type='button';
        button.onclick=async()=>{button.disabled=true;try{await fn()}catch(e){sayError(onError,e)}finally{button.disabled=false}};
        actions.append(button);
      };
      if(own&&!isModerated){
        action('編集',async()=>{
          const editor=elem('textarea','commentEdit');editor.rows=3;editor.maxLength=2000;
          editor.value=item.body;
          const save=elem('button','primary','保存');save.type='button';
          const cancel=elem('button','','やめる');cancel.type='button';
          cancel.onclick=()=>{editor.remove();save.remove();cancel.remove();message.hidden=false};
          save.onclick=async()=>{
            const body=clean(editor.value);
            if(!body||body.length>2000)return;
            save.disabled=true;
            try{
              await updateDoc(doc(comments,item.id),{body,updatedAt:serverTimestamp()});
            }catch(e){sayError(onError,e);save.disabled=false}
          };
          message.hidden=true;message.after(editor,save,cancel);editor.focus();
        });
        action('削除',async()=>{
          if(!confirm('自分のコメントを削除しますか？'))return;
          const activityRef=activityFor(item.id);
          const record=await getDoc(activityRef);
          const batch=writeBatch(db);
          batch.delete(doc(comments,item.id));
          if(record.exists())batch.delete(activityRef);
          await batch.commit();
        });
      }
      if(owner)action(isModerated?'表示を戻す':'非表示にする',async()=>{
        const activityRef=activityFor(item.id);
        const present=await getDoc(activityRef);
        const batch=writeBatch(db);
        batch.update(doc(comments,item.id),{hidden:!isModerated});
        if(present.exists())batch.update(activityRef,{hidden:!isModerated});
        await batch.commit();
      });
      card.append(actions);whereTo.append(card);
    }
  }
  subscribe(query(comments,where('hidden','==',false),limit(40)),list=>{
    currentComments=list;
    drawComments(commentItems,list);
  });
  if(targetId){
    const selected=doc(comments,targetId);
    const stopTarget=onSnapshot(selected,snapshot=>{
      if(stopped)return;
      targetResolved=true;
      targetComment=snapshot.exists()&&!snapshot.data().hidden?
        {id:targetId,...snapshot.data()}:null;
      drawComments(commentItems,currentComments);
    },()=>{
      // A hidden or deleted comment may be unauthorized to read. Do not reveal it.
      if(stopped)return;
      targetResolved=true;targetComment=null;
      drawComments(commentItems,currentComments);
    });
    unsubs.push(stopTarget);
  }

  if(owner){
    const heading=commentBox.querySelector('.moderatedHeading');
    subscribe(query(comments,where('hidden','==',true),limit(40)),list=>{
      heading.hidden=!list.length;
      moderatedItems.hidden=!list.length;
      drawComments(moderatedItems,list,true);
    });
  }
  form.onsubmit=async event=>{
    event.preventDefault();
    const body=clean(input.value);
    if(!body||body.length>2000)return;
    submit.disabled=true;
    try{
      const ref=doc(comments);
      const batch=writeBatch(db);
      batch.set(ref,{authorUid:user.uid,body,createdAt:serverTimestamp(),
        updatedAt:serverTimestamp(),hidden:false});
      batch.set(activityFor(ref.id),{actorUid:user.uid,kind:'comment',
        title:book.title,bookId:book.id,sourceId:ref.id,hidden:false,createdAt:serverTimestamp()});
      await batch.commit();
      input.value='';
    }catch(e){sayError(onError,e)}finally{if(!stopped)submit.disabled=false}
  };
  return ()=>{
    stopped=true;
    for(const unsubscribe of unsubs)unsubscribe();
    form.onsubmit=null;
    likeButton.onclick=askButton.onclick=null;
  };
}
