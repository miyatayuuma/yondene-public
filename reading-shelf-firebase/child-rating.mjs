import {doc,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';

const canRate=book=>book&&['read','reading','paused'].includes(book.status);
const starsOf=entry=>Number.isInteger(entry?.stars)&&entry.stars>=1&&entry.stars<=5?entry.stars:0;
const version=entry=>entry?.updatedAt?.toMillis?.()??null;

export function mountChildRating({db,fid,book,user,owner,container,getRating,getBook,onError}){
  const section=document.createElement('div');section.className='ratingSummary';
  const value=document.createElement('strong');
  const button=document.createElement('button');button.type='button';button.className='ghost';
  section.append(value,button);container.append(section);
  let disposed=false,dialog=null,selection=0,expected=null,busy=false,repaint=null;
  const ref=doc(db,'families',fid,'childBookRatings',book.id);
  const close=()=>{
    if(!dialog)return;
    const current=dialog;dialog=null;
    if(current.open)current.close();
    repaint=null;
    current.remove();
    if(button.isConnected)button.focus();
  };
  const refresh=()=>{
    if(disposed)return;
    const current=starsOf(getRating());
    const active=canRate(getBook());
    value.textContent=current&&active?'この本の★：'+current+' / 5':active?'★はまだついていません':current&&owner?'以前の★：'+current+' / 5（要確認）':'★評価はありません';
    button.hidden=!owner||(!active&&!current);
    button.textContent=!active?'★を確認':current?'★をかえる':'★をつける';
  };
  async function persist(next){
    if(busy||disposed)return;
    busy=true;
    for(const item of dialog?.querySelectorAll('button')||[])item.disabled=true;
    const message=dialog?.querySelector('.ratingDialogNotice');
    try{
      await runTransaction(db,async tx=>{
        const [latest,source]=await Promise.all([tx.get(ref),tx.get(doc(db,'families',fid,'books',book.id))]);
        if(!source.exists()||(next!==null&&!canRate(source.data())))throw Error('本の状態が変わりました。画面を開き直してください。');
        const existing=latest.exists()?latest.data():null;
        if(version(existing)!==expected)throw Error('ほかの端末で★が変更されました。開き直して確認してください。');
        if(next===null)tx.delete(ref);
        else if(existing)tx.update(ref,{stars:next,updatedAt:serverTimestamp()});
        else tx.set(ref,{stars:next,enteredByUid:user.uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
      });
      close();
      refresh();
    }catch(error){
      if(message)message.textContent=error?.message||'保存できませんでした。もう一度お試しください。';
      else onError?.(error);
    }finally{
      busy=false;
      if(dialog){for(const item of dialog.querySelectorAll('button'))item.disabled=false;repaint?.()}
    }
  }
  button.onclick=()=>{
    if(!owner||disposed||(!canRate(getBook())&&!starsOf(getRating())))return;
    close();selection=starsOf(getRating());expected=version(getRating());
    dialog=document.createElement('dialog');dialog.className='childRatingDialog';
    const head=document.createElement('div');head.className='ratingDialogHead';
    const url=String(book.coverUrl||'');
    if(/^(https:\/\/|data:image\/(jpeg|png|webp);base64,)/i.test(url)){
      const img=document.createElement('img');img.src=url;img.alt='';head.append(img);
    }
    const title=document.createElement('span');title.className='ratingTitle';title.textContent=book.title;head.append(title);
    const question=document.createElement('p');question.className='ratingQuestion';question.textContent='この本、どのくらいすき？';
    const choice=document.createElement('div');choice.className='ratingStars';choice.setAttribute('role','group');choice.setAttribute('aria-label','星の数を選ぶ');
    const live=document.createElement('p');live.className='ratingDialogNotice';live.setAttribute('aria-live','polite');
    const actions=document.createElement('div');actions.className='ratingActions';
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='やめる';
    const save=document.createElement('button');save.type='button';save.className='primary';save.textContent='これにする';
    const remove=document.createElement('button');remove.type='button';remove.textContent='星を消す';
    const paint=()=>{
      const keys=choice.querySelectorAll('button');
      for(let i=0;i<keys.length;i++){
        keys[i].classList.toggle('selected',i<selection);
        keys[i].setAttribute('aria-pressed',String(i+1===selection));
      }
      save.disabled=!canRate(getBook())||selection===0||selection===starsOf(getRating())||busy;
      live.textContent=selection?selection+'こ選んでいます':'まだ選んでいません';
    };
    for(let n=1;n<=5;n++){
      const star=document.createElement('button');star.type='button';
      star.textContent='★';star.setAttribute('aria-label',n+'こ星');
      star.disabled=!canRate(getBook());
      star.onclick=()=>{selection=n;paint()};
      choice.append(star);
    }
    repaint=paint;
    cancel.onclick=close;
    save.onclick=()=>{if(selection)void persist(selection)};
    remove.hidden=starsOf(getRating())===0;
    remove.onclick=()=>{if(window.confirm('この本の★を消しますか？'))void persist(null)};
    actions.append(cancel,save);
    if(!remove.hidden)actions.append(remove);
    dialog.append(head,question,choice,live,actions);
    dialog.addEventListener('close',()=>{if(dialog){dialog.remove();dialog=null;if(button.isConnected)button.focus()}});
    document.body.append(dialog);dialog.showModal();paint();
  };
  refresh();
  return {refresh,dispose:()=>{disposed=true;close();button.onclick=null}};
}
