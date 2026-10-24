// Owner-only reading-record state machine. No bibliography, reflection or rating mutation.
export const READING_EDIT_FIELDS=Object.freeze([
  'status','readingMode','finishedAt','finishedPeriodLabel','finishedPeriodStart',
  'finishedPeriodEnd','finishedPeriodPrecision','finishedPeriodBasis',
  'finishedPeriodNote','finishPrecision'
]);
export const READING_STATUS=Object.freeze(['unread','reading','paused','read']);
export const READING_MODE=Object.freeze(['read-aloud','independent','mixed']);
export const PERIOD_PRECISIONS=Object.freeze(['school_year','school_term','school_holiday','month_range','quarter']);
export function readingSnapshot(book){
  return Object.fromEntries(READING_EDIT_FIELDS.map(key=>[key,String(book?.[key]??'')]));
}
const hasPeriod=b=>READING_EDIT_FIELDS.slice(2).some(k=>String(b?.[k]??'')!=='');
const validMonth=v=>/^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const validDay=v=>{
  if(!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v))return false;
  const d=new Date(v+'T00:00:00.000Z');
  return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===v;
};
export function initialPeriod(book){
  // Never silently overwrite historical completion precision when editing mode/status.
  if(book?.status==='read')return 'keep';
  return 'day';
}
export function localToday(now=new Date()){
  return [now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
}
export function makeReadingNext(book,draft){
  const previous=readingSnapshot(book);
  if(!READING_STATUS.includes(draft.status))throw Error('読書状態が不正です。');
  if(!['',...READING_MODE].includes(draft.readingMode))throw Error('読み方が不正です。');
  // A correction is not a reread: it retracts an erroneous completion claim.
  // Only a consciously acknowledged correction may reverse an existing read state.
  if(book.status==='read'&&draft.status!=='read'&&draft.correctionConfirmed!==true)
    throw Error('読了の誤登録を取り消す場合は、訂正内容を確認してください。再読開始は別の操作です。');
  if(book.status!=='read'&&draft.status!=='read'&&hasPeriod(book))
    throw Error('古い読了情報が残っています。ChatOpsで確認してください。');
  if(draft.status!=='unread'&&!READING_MODE.includes(draft.readingMode))
    throw Error('読み方を選んでください。');
  const next={...previous,status:draft.status,readingMode:draft.status==='unread'?'':draft.readingMode};
  if(draft.status!=='read'){
    for(const key of READING_EDIT_FIELDS.slice(2))next[key]='';
  }else if(draft.periodKind==='keep'&&book.status==='read'){
    // Preserve historical term/season/year precision exactly, including unknown fields.
  }else{
    for(const key of READING_EDIT_FIELDS.slice(2))next[key]='';
    if(draft.periodKind==='day'){
      if(!validDay(draft.day))throw Error('読了日を確認してください。');
      next.finishedAt=draft.day;
      next.finishedPeriodBasis='owner_confirmed_date';
    }else if(draft.periodKind==='month'){
      if(!validMonth(draft.month))throw Error('読了月をYYYY-MMで入力してください。');
      next.finishedAt=draft.month;
      next.finishedPeriodBasis='owner_confirmed_month';
    }else if(draft.periodKind==='period'){
      if(!PERIOD_PRECISIONS.includes(draft.precision))throw Error('時期の精度を選んでください。');
      if(!validMonth(draft.start)||!validMonth(draft.end)||draft.start>draft.end)
        throw Error('期間の開始月・終了月を確認してください。');
      const label=String(draft.label??'').trim();
      if(!label||label.length>160)throw Error('学期・季節などの時期を入力してください。');
      next.finishedPeriodStart=draft.start;next.finishedPeriodEnd=draft.end;
      next.finishedPeriodLabel=label;next.finishedPeriodPrecision=draft.precision;
      next.finishedPeriodBasis='owner_confirmed_period';
    }else if(draft.periodKind!=='unknown'){
      throw Error('読了時期の精度が不正です。');
    }
  }
  if(JSON.stringify(previous)===JSON.stringify(next))
    throw Error('読書記録に変更がありません。');
  return {previous,next};
}
export function makeReadingMutation(book,draft,{eventId,updatedAt,editedAt,actorUid}){
  if(!/^edit-[a-f0-9-]{36}$/.test(eventId))throw Error('更新識別子が不正です。');
  if(typeof updatedAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(updatedAt)
     ||updatedAt===String(book.updatedAt??''))throw Error('更新時刻が不正です。');
  const {previous,next}=makeReadingNext(book,draft);
  return {
    patch:{...next,updatedAt,lastReadingEditId:eventId,manualEditedAt:editedAt},
    event:{bookId:book.id,actorUid,previous,next,
      previousUpdatedAt:String(book.updatedAt??''),newUpdatedAt:updatedAt,editedAt,
      ...(book.status==='read'&&next.status!=='read'?{correctionKind:'mistaken-completion'}:{})}
  };
}

export function assertReadingRevision(current,captured){
  if(!current||current.id!==captured?.id||current.title!==captured.title
      ||String(current.updatedAt??'')!==String(captured.updatedAt??'')
      ||JSON.stringify(readingSnapshot(current))!==JSON.stringify(readingSnapshot(captured)))
    throw Error('ほかの端末・ChatOpsで本が変更されました。いったん閉じて最新状態で編集してください。');
}
