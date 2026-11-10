// Optional owner-triggered flush of anonymous local seed counters to a PRIVATE
// spreadsheet. A Google access token is used in Authorization headers only;
// event payloads contain no UID, child remarks or generated conversation text.
import {findPrivateForestDialogueSheet} from './book-forest-private-dialogue.mjs';

const HEADER='イベントID';
const VALID_TYPES=new Set(['selected','displayed']);
const SHEET_RANGE="'種の使用履歴'!A:A";
const MAX_EVENTS=250;

export async function authorizeForestThoughtUsageWrite({user,GoogleAuthProvider,reauthenticateWithPopup}){
  const provider=new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/drive.readonly');
  provider.addScope('https://www.googleapis.com/auth/spreadsheets');
  if(user?.email)provider.setCustomParameters({login_hint:user.email});
  const result=await reauthenticateWithPopup(user,provider);
  const token=GoogleAuthProvider.credentialFromResult(result)?.accessToken;
  if(!token)throw Error('使用履歴の記録に必要な権限を取得できませんでした');
  return token;
}

function validEvent(row){
  return row&&typeof row.eventId==='string'&&/^seed-[A-Za-z0-9_-]{1,180}$/u.test(row.eventId)&&
    typeof row.seedId==='string'&&/^[A-Za-z0-9_-]{1,100}$/u.test(row.seedId)&&
    VALID_TYPES.has(row.type)&&['king','kiki','jiji','skipper','zorori','ishishi','noshishi'].includes(row.characterId)&&
    Number.isFinite(Date.parse(row.at))&&/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u.test(row.day);
}
function usageUrl(spreadsheetId,range){
  return 'https://sheets.googleapis.com/v4/spreadsheets/'+spreadsheetId+'/values/'+
    encodeURIComponent(range);
}
async function checkedJson(response){
  if(!response.ok)throw Error('種の使用履歴を同期できません（'+response.status+'）');
  return response.json();
}
export async function syncForestThoughtUsage({token,events=[],fetchImpl=fetch}={}){
  if(typeof token!=='string'||!token)throw Error('Google認証が必要です');
  const pending=(Array.isArray(events)?events:[]).filter(validEvent).slice(-MAX_EVENTS);
  if(!pending.length)return {uploaded:0,skipped:0};
  const spreadsheetId=await findPrivateForestDialogueSheet(token,{fetchImpl});
  const url=usageUrl(spreadsheetId,SHEET_RANGE);
  async function getExisting(){
    const response=await fetchImpl(url,{headers:{Authorization:'Bearer '+token},cache:'no-store'});
    const result=await checkedJson(response);
    if(result?.values?.[0]?.[0]!==HEADER)throw Error('種の使用履歴シートの見出しが違います');
    return new Set(result.values.slice(1).map(row=>String(row?.[0]||'')));
  }
  const existing=await getExisting();
  const added=new Set(),missing=[];
  for(const item of pending){
    if(existing.has(item.eventId)||added.has(item.eventId))continue;
    added.add(item.eventId);
    missing.push([item.eventId,item.seedId,item.at,item.type,item.characterId,'',
      item.day,item.version||'forest-thought-v6','','本の森での利用']);
  }
  if(!missing.length)return {uploaded:0,skipped:pending.length};
  const postUrl=new URL(usageUrl(spreadsheetId,"'種の使用履歴'!A:J")+':append');
  postUrl.searchParams.set('valueInputOption','RAW');
  postUrl.searchParams.set('insertDataOption','INSERT_ROWS');
  await checkedJson(await fetchImpl(postUrl.href,{method:'POST',headers:{
    Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({values:missing})}));
  // Reconciliation is essential: an ambiguous response must not be retried
  // blindly, or selected/displayed counters could be incremented twice.
  const confirmed=await getExisting();
  if(missing.some(row=>!confirmed.has(row[0])))throw Error('書き込み後の照合が未完了です。履歴を確認してください');
  return {uploaded:missing.length,skipped:pending.length-missing.length};
}
