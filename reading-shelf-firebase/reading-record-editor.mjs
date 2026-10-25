import {doc,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';
import {READING_MODE,PERIOD_PRECISIONS,
  makeReadingNext,makeReadingMutation,initialPeriod,localToday,assertReadingRevision} from './reading-record-domain.mjs?build=20261025-reading-legacy-v1';

const el=(tag,label='',className='')=>{
  const node=document.createElement(tag);if(label)node.textContent=label;
  if(className)node.className=className;return node;
};
function option(value,label){const o=el('option',label);o.value=value;return o}
function field(parent,label,control){const wrap=el('label','', 'readingEditField');wrap.append(el('span',label),control);parent.append(wrap);return wrap}
export function mountReadingRecordEditor({db,fid,book,user,owner,container,getBook,onSaved,onError}){
  if(!owner)return {dispose:()=>{}};
  let disposed=false,dialog=null,busy=false;
  const row=el('div','','readingEditEntry');
  const edit=el('button','読書記録を編集','ghost');
  const finish=el('button','読み終えた','primary');
  finish.hidden=book.status==='read';
  row.append(edit,finish);container.append(row);
  const close=()=>{
    if(!dialog)return;
    const current=dialog;dialog=null;
    if(current.open)current.close();
    current.remove();
    if(edit.isConnected)edit.focus();
  };
  const open=(complete=false)=>{
    if(disposed||busy)return;
    close();
    const source=getBook()||book;
    dialog=el('dialog','','readingEditDialog');
    const form=el('form','','readingEditForm');
    form.noValidate=true;
    const heading=el('h3','読書記録を編集');
    const bookTitle=el('p',source.title,'muted');
    const status=el('select');status.setAttribute('aria-label','読書状態');
    for(const [v,label] of [['unread','きになる'],['reading','読んでる'],['paused','お休み中'],['read','読んだ']]){
      const o=option(v,label);
      status.append(o);
    }
    status.value=complete?'read':source.status;
    const mode=el('select');mode.setAttribute('aria-label','読み方');
    for(const [v,label] of [['','選択してください'],['read-aloud','読み聞かせ'],['independent','自力読書'],['mixed','併用']])mode.append(option(v,label));
    mode.value=READING_MODE.includes(source.readingMode)?source.readingMode:'';
    const periodWrap=el('fieldset','','readingPeriodFields');
    const legend=el('legend','読了時期');periodWrap.append(legend);
    const periodType=el('select');periodType.setAttribute('aria-label','読了時期の精度');
    if(source.status==='read')periodType.append(option('keep','現在の記録をそのまま保持'));
    for(const [v,label] of [['day','日付'],['month','月単位'],['period','学期・季節など'],['unknown','時期は不明']])periodType.append(option(v,label));
    periodType.value=complete&&source.status!=='read'?'day':initialPeriod(source);
    const date=el('input');date.type='date';date.value=/^\d{4}-\d\d-\d\d$/.test(source.finishedAt||'')?source.finishedAt:localToday();
    const month=el('input');month.type='month';month.value=/^\d{4}-\d\d$/.test(source.finishedAt||'')?source.finishedAt:localToday().slice(0,7);
    const label=el('input');label.type='text';label.maxLength=160;label.placeholder='例：2026年秋';label.value=source.finishedPeriodLabel||'';
    const start=el('input');start.type='month';start.value=source.finishedPeriodStart||'';
    const end=el('input');end.type='month';end.value=source.finishedPeriodEnd||'';
    const precision=el('select');
    for(const [v,t] of [['school_year','学年・年度'],['school_term','学期'],['school_holiday','休暇'],['quarter','季節・四半期'],['month_range','月の範囲']])precision.append(option(v,t));
    precision.value=PERIOD_PRECISIONS.includes(source.finishedPeriodPrecision)?source.finishedPeriodPrecision:'quarter';
    const dateField=field(periodWrap,'日付',date);
    const monthField=field(periodWrap,'年月',month);
    const typeField=field(periodWrap,'時期の精度',precision);
    const labelField=field(periodWrap,'時期の表記',label);
    const startField=field(periodWrap,'開始月',start);
    const endField=field(periodWrap,'終了月',end);
    periodWrap.insertBefore(field(document.createDocumentFragment(),'入力精度',periodType),dateField);
    const info=el('p','読了日は保存前に確認してください。「今日」は初期候補です。','muted tiny');
    periodWrap.append(info);
    const feedback=el('p','','readingEditFeedback');feedback.setAttribute('role','alert');
    const correction=el('label','','readingCorrectionConfirm');
    const correctionCheck=el('input');correctionCheck.type='checkbox';
    const correctionText=el('span','これは「読んだ」の誤登録の訂正です。再読開始ではありません。読了時期は現在の記録から外れ、変更前の情報は履歴に残ります。本人の感想・★・観察メモは削除しません。');
    correction.append(correctionCheck,correctionText);
    const actions=el('div','','readingEditActions');
    const cancel=el('button','やめる','ghost');cancel.type='button';
    const save=el('button','保存する','primary');save.type='submit';
    actions.append(cancel,save);
    form.append(heading,bookTitle);field(form,'読書状態',status);
    const modeField=field(form,'読み方',mode);
    form.append(periodWrap,correction,feedback,actions);
    dialog.append(form);document.body.append(dialog);dialog.showModal();
    const showFields=()=>{
      periodWrap.hidden=status.value!=='read';
      modeField.hidden=status.value==='unread';
      correction.hidden=!(source.status==='read'&&status.value!=='read');
      save.disabled=!correction.hidden&&!correctionCheck.checked;
      const kind=periodType.value;
      for(const [f,visible] of [[dateField,kind==='day'],[monthField,kind==='month'],
        [typeField,kind==='period'],[labelField,kind==='period'],[startField,kind==='period'],[endField,kind==='period']])f.hidden=!visible;
    };
    showFields();status.onchange=()=>{
      correctionCheck.checked=false;
      showFields();
    };
    correctionCheck.onchange=showFields;
    periodType.onchange=showFields;cancel.onclick=close;
    dialog.addEventListener('close',()=>{if(dialog){dialog.remove();dialog=null;if(edit.isConnected)edit.focus()}});
    form.onsubmit=async event=>{
      event.preventDefault();if(busy||disposed)return;
      const draft={status:status.value,readingMode:mode.value,periodKind:periodType.value,
        day:date.value,month:month.value,label:label.value,start:start.value,end:end.value,precision:precision.value,
        correctionConfirmed:source.status==='read'&&status.value!=='read'&&correctionCheck.checked};
      try{makeReadingNext(source,draft)}catch(error){feedback.textContent=error.message;return}
      busy=true;save.disabled=true;cancel.disabled=true;feedback.textContent='保存しています…';
      try{
        const bookRef=doc(db,'families',fid,'books',source.id);
        const eventId='edit-'+crypto.randomUUID();
        const eventRef=doc(db,'families',fid,'books',source.id,'readingEditEvents',eventId);

        const saved=await runTransaction(db,async tx=>{
          const [current,priorEvent]=await Promise.all([tx.get(bookRef),tx.get(eventRef)]);
          if(!current.exists()||priorEvent.exists())throw Error('対象の本が見つからないか更新識別子が重複しました。');
          const data=current.data();
          assertReadingRevision(data,source);
          let ts=new Date().toISOString();
          if(ts===String(data.updatedAt??''))ts=new Date(Date.now()+1).toISOString();
          const sentinel=serverTimestamp();
          const mutation=makeReadingMutation(data,draft,{eventId,updatedAt:ts,editedAt:sentinel,actorUid:user.uid});
          tx.update(bookRef,mutation.patch);tx.set(eventRef,mutation.event);
          return {...data,...mutation.patch};
        });
        close();if(!disposed)onSaved(saved);
      }catch(error){
        if(!disposed&&dialog)feedback.textContent=error?.message||'保存に失敗しました。再試行してください。';
        else onError?.(error);
      }finally{busy=false;if(dialog){save.disabled=false;cancel.disabled=false}}
    };
  };
  edit.onclick=()=>open(false);finish.onclick=()=>open(true);
  return {dispose:()=>{disposed=true;close();edit.onclick=null;finish.onclick=null}};
}
