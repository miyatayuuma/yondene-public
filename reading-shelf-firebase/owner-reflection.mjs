import {collection,doc,writeBatch,serverTimestamp} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';

import {attachSpeechInput} from './speech-dictation.mjs?build=20261019-shelf-v28';

export function addOwnerReflectionForm({db,fid,book,user,container,onError,readerName='子ども',onSaved}){
  const form=document.createElement('form');
  form.className='reflectionCompose';
  const heading=document.createElement('h5');heading.textContent=readerName+'の感想を記録する';
  const kind=document.createElement('select');kind.setAttribute('aria-label','記録方法');
  for(const [value,name] of [['verbatim','本人が話した言葉'],['parent-summary','保護者による要約']]){
    const option=document.createElement('option');option.value=value;option.textContent=name;kind.append(option);
  }
  const input=document.createElement('textarea');
  input.rows=3;input.maxLength=3000;input.placeholder='感想をここに入力';
  input.setAttribute('aria-label',readerName+'の感想');
  const date=document.createElement('input');date.type='text';date.maxLength=100;
  date.placeholder='観察した時期（任意）';
  const save=document.createElement('button');save.className='primary';save.textContent='感想を記録する';
  save.type='submit';
  const help=document.createElement('p');help.className='muted tiny';
  help.textContent='本人の発言と親による要約を区別して保存します。';
  form.append(heading,kind,input,date,help,save);container.append(form);
  const stopSpeech=attachSpeechInput({input,help,container:form});
  form.onsubmit=async event=>{
    event.preventDefault();
    const quote=input.value.trim();if(!quote)return;
    save.disabled=true;
    try{
      const reflection=doc(collection(db,'families',fid,'books',book.id,'childReflections'));
      const activity=doc(db,'families',fid,'activity','reflection-'+reflection.id);
      const batch=writeBatch(db);
      batch.set(reflection,{quote,attribution:kind.value,observedAt:date.value.trim(),
        authorUid:user.uid,source:'owner-app',createdAt:serverTimestamp()});
      batch.set(activity,{actorUid:user.uid,kind:'reflection',title:book.title,
        bookId:book.id,sourceId:reflection.id,hidden:false,createdAt:serverTimestamp()});
      await batch.commit();
      input.value='';date.value='';help.textContent='感想を記録しました。';
      onSaved?.();
    }catch(error){onError?.(error)}finally{save.disabled=false}
  };
  return {form,input,help,dispose:()=>{stopSpeech();form.onsubmit=null}};
}
