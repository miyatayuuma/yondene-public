// Build into a single bound Apps Script file. Private rows and credentials are
// read only at execution time; never run this against the bookshelf writer.
import {parseForestCharacterProfiles,parseForestProfileSources} from '../reading-shelf-firebase/book-forest-character-profiles.mjs';
import {promptFor} from '../reading-shelf-firebase/book-forest-live-dialogue.mjs';
import {forestGenerationInput,readCompletion} from '../cloudflare/forest-ai/src/index.mjs';
const MODEL='@cf/google/gemma-4-26b-a4b-it';
export function probeInput(personRows,sourceRows,id,scene,utterance){
  const profile=parseForestCharacterProfiles(personRows,parseForestProfileSources(sourceRows)).find(p=>p.id===id);
  if(!profile)throw Error('MISSING_PROFILE');
  const prompt=promptFor({characterId:id,characterProfile:profile,mode:'opening',sourceKind:'ambient',
    situation:{scene,utterance,evidence:'imagined'}});
  for(const claim of profile.claims)if(!prompt.npc.voice.includes(claim.text))throw Error('PROFILE_LOSS');
  return {profile,prompt,input:forestGenerationInput(prompt)};
}
const safeText=v=>/^\s*[=+@-]/u.test(String(v))?"'"+String(v):String(v);
export function processQueue(){
  const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;
  try{
    const ss=SpreadsheetApp.getActiveSpreadsheet();
    const q=ss.getSheetByName('Gemma検証キュー'),out=ss.getSheetByName('Gemma検証結果');
    const person=ss.getSheetByName('人物設定'),source=ss.getSheetByName('根拠資料');
    if(!q||!out||!person||!source)throw Error('MISSING_TEST_SHEETS');
    const props=PropertiesService.getScriptProperties();
    const token=props.getProperty('CLOUDFLARE_AI_TEST_TOKEN');
    const account=props.getProperty('CLOUDFLARE_AI_TEST_ACCOUNT_ID');
    if(!token||!account||!/^[a-f0-9]{32}$/iu.test(account.trim()))throw Error('MISSING_TEST_PROPERTIES');
    const rows=q.getDataRange().getDisplayValues().slice(1),counts={};
    for(const row of rows)counts[row[0]]=(counts[row[0]]||0)+1;
    const existing=new Set(out.getDataRange().getDisplayValues().slice(1).map(r=>r[0]));
    const today=Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy-MM-dd');
    const key='YONDENE_GEMMA_TEST_ATTEMPTS_'+today;
    let attempts=Number(props.getProperty(key)||0),done=0;
    if(!Number.isFinite(attempts)||attempts<0)throw Error('INVALID_LOCAL_USAGE_COUNTER');
    for(let i=0;i<rows.length&&done<3&&attempts<60;i++){
      const [id,npc,scene,utterance,state]=rows[i];if(state!=='PENDING')continue;
      const mark=(status,code)=>{q.getRange(i+2,5).setValue(status);q.getRange(i+2,7,1,2).setValues([[new Date(),code]]);};
      if(counts[id]!==1||!/^[A-Za-z0-9_-]{6,80}$/u.test(id)||!scene||scene.length>500||utterance.length>300){mark('ERROR','INVALID_INPUT');continue;}
      if(existing.has(id)){mark('APPLIED','ALREADY_RECORDED');continue;}
      mark('RUNNING','');SpreadsheetApp.flush();done++;
      let prepared;
      try{prepared=probeInput(person.getDataRange().getDisplayValues(),source.getDataRange().getDisplayValues(),npc,scene,utterance);}
      catch{mark('ERROR','PROFILE_CONTRACT');continue;}
      // Reserve before sending; even failed calls count. No retries of unknown outcomes.
      props.setProperty(key,String(++attempts));
      let result;
      try{
        const response=UrlFetchApp.fetch('https://api.cloudflare.com/client/v4/accounts/'+account.trim()+'/ai/run/'+MODEL,{
          method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+token.trim()},
          payload:JSON.stringify({...prepared.input,stream:false}),muteHttpExceptions:true,followRedirects:false});
        const status=response.getResponseCode();if(status<200||status>=300){mark('ERROR','HTTP_'+status);continue;}
        const envelope=JSON.parse(response.getContentText());
        if(envelope.success===false){mark('ERROR','PROVIDER_ERROR');continue;}
        result=envelope.result;
      }catch{mark('ERROR','NETWORK_OR_RESPONSE');continue;}
      const raw=result?.response??result?.choices?.[0]?.message?.content;
      let valid=false;
      try{readCompletion(result,{mode:'opening',characterId:npc});valid=true;}catch{}
      // Store actual output and the exact Worker model input, even if validation fails.
      // A receipt proves input identity, never character quality or factual accuracy.
      out.getRange(1,16,1,3).setValues([['生成入力JSON','人物設定取得時刻','出力形式検証']]);
      out.appendRow([safeText(id),safeText(npc),safeText(npc),safeText(scene),safeText(utterance),
        safeText(typeof raw==='string'?raw:JSON.stringify(raw??null)),MODEL,
        prepared.profile.version+' / '+prepared.profile.revision,prepared.profile.review,
        'profile2-worker-v19',new Date(),'','','','品質評価未実施',
        safeText(JSON.stringify(prepared.input)),new Date(),valid?'PASS':'FAIL']);
      existing.add(id);mark(valid?'APPLIED':'ERROR',valid?'':'OUTPUT_VALIDATION');
    }
  }finally{lock.releaseLock();}
}
