// A single Apps Script bundle shares the production persona / reflection /
// story / prompt / model validators. Real data is loaded only at execution
// from PRIVATE Sheets and the read-only Firestore synchronization mirror.
// Never copy actual family data, quotes, IDs or credentials to public sources.
import {parseForestCharacterProfiles,parseForestProfileSources}
  from '../reading-shelf-firebase/book-forest-character-profiles.mjs';
import {parseStoryMemoryRows}
  from '../reading-shelf-firebase/book-forest-story-memory.mjs';
import {parseTwinNameRows,profileTwinNames} from '../reading-shelf-firebase/book-forest-private-dialogue.mjs';
import {parseForestBookshelfMirror} from '../reading-shelf-firebase/book-forest-mirror-snapshot.mjs';
import {FOREST_MODEL as MODEL} from '../reading-shelf-firebase/forest-ai-config.mjs';
import {runForestConversationScenario,scenarioStorage} from '../scripts/forest-conversation-scenario.mjs';

// The probe has no local daily call cap; provider-side quotas still apply.
const MODES=new Set(['integrated-synthetic','integrated-mirror']);
const safeText=v=>/^\s*[=+@-]/u.test(String(v))?"'"+String(v):String(v);
const norm=x=>String(x??'').trim();
const idPattern=/^[A-Za-z0-9_-]{6,80}$/u;

function readMirror(spreadsheet,props){
  // The ID is private configuration (the bound Sheet's B22 or Script Properties).
  // Never compile it into the public GAS bundle.
  const setting=spreadsheet.getSheetByName('Gemma検証設定');
  const spreadsheetId=norm(props.getProperty('YONDENE_TEST_SHELF_MIRROR_ID')||
    setting?.getRange(22,2).getDisplayValue());
  if(!/^[A-Za-z0-9_-]{20,120}$/u.test(spreadsheetId))throw Error('MIRROR_NOT_CONFIGURED');
  let source;
  try{source=SpreadsheetApp.openById(spreadsheetId)}
  catch{throw Error('MIRROR_NO_ACCESS')}
  if(!source||source.getId()===spreadsheet.getId())throw Error('MIRROR_WRONG_SHEET');
  const status=source.getSheetByName('同期状態'),docs=source.getSheetByName('Firestore原本');
  if(!status||!docs)throw Error('MIRROR_TABS');
  const labels=status.getRange(1,1,12,2).getDisplayValues();
  const last=labels.find(row=>row[0]==='前回成功')?.[1];
  return parseForestBookshelfMirror(docs.getDataRange().getDisplayValues(),{syncAt:last});
}
// Preview a private edit to the canonical profile with the same row parser.
export function compactProbeStorage(storage){
  const result={...storage},key='scenario:live:log';
  const entries=JSON.parse(result[key]||'[]'),counts={};
  result[key]=JSON.stringify(entries.slice().reverse().filter(e=>{
    if(!['meet','ambient'].includes(e.sourceKind)||typeof e.text!=='string')return false;
    counts[e.characterId]=(counts[e.characterId]||0)+1;
    return counts[e.characterId]<=3;
  }).reverse().filter(e=>typeof e.text==='string').map(({event,characterId,sourceKind,text})=>({event,characterId,sourceKind,text})));
  return result;
}

/** GAS replaces only browser timeout/cancellation primitives. UrlFetch is
 * synchronous: discard responses taking >11s in the transport, matching the
 * browser's deadline; no claim that GAS can abort an in-flight network call.
 */
export async function probeConversation(personRows,sourceRows,characterId,{snapshot={books:[],reflections:[]},
  catalog=[],twinNames=[],storage,choices=[0,0],transport,now=()=>Date.now()}={}){
  const profiles=parseForestCharacterProfiles(personRows,parseForestProfileSources(sourceRows));
  if(!profiles.some(p=>p.id===characterId))throw Error('MISSING_PROFILE');
  return runForestConversationScenario({visits:[{characterId,choices}],transport,allowUnavailableChoice:true,
    now,storage:scenarioStorage(storage||{}),getBooks:()=>snapshot.books,
    getCatalog:()=>catalog,getCharacterProfiles:()=>profiles,
    getTwinNames:()=>twinNames,
    getRecentReflections:async()=>snapshot.reflections||[],
    getArchivedReflections:async(bookIds,before)=>bookIds.flatMap(bookId=>
      (snapshot.archiveReflections||[]).filter(row=>row.bookId===bookId&&row.createdAt<before)
        .sort((a,b)=>b.createdAt-a.createdAt).slice(0,3)),
    getCurrentReflection:async(bookId,id)=>[...(snapshot.reflections||[]),...(snapshot.archiveReflections||[])]
      .find(row=>row.bookId===bookId&&row.id===id)||null,
    runtime:{createAbortController:()=>({signal:{aborted:false},abort(){this.signal.aborted=true}}),
      scheduleTimeout:()=>null,cancelTimeout:()=>{}}});
}

/** Run a bounded queue once. Private input JSON may include reader quotes;
 * never export/log it or add it to public code. Only the private results Sheet
 * persists the exact prompt for reproducible testing.
 */
export async function processQueue({maxCases=3}={}){
  const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;
  try{
    const ss=SpreadsheetApp.getActiveSpreadsheet();
    const q=ss.getSheetByName('Gemma検証キュー'),out=ss.getSheetByName('Gemma検証結果');
    const person=ss.getSheetByName('人物設定'),source=ss.getSheetByName('根拠資料');
    if(!q||!out||!person||!source)throw Error('MISSING_TEST_SHEETS');
    const props=PropertiesService.getScriptProperties();
    const token=props.getProperty('CLOUDFLARE_AI_TEST_TOKEN');
    const account=props.getProperty('CLOUDFLARE_AI_TEST_ACCOUNT_ID');
    if(!token||!account||!/^[a-f0-9]{32}$/iu.test(account.trim()))
      throw Error('MISSING_TEST_PROPERTIES');
    const rows=q.getDataRange().getDisplayValues().slice(1),counts={};
    for(const row of rows)counts[row[0]]=(counts[row[0]]||0)+1;
    const results=out.getDataRange().getDisplayValues().slice(1),
      existing=new Set(results.map(r=>r[0]));
    // Count actual requests by Workers AI usage day. The provider handles quota.
    const today=Utilities.formatDate(new Date(),'UTC','yyyy-MM-dd');
    const key='YONDENE_GEMMA_TEST_ATTEMPTS_UTC_'+today;
    let attempts=Number(props.getProperty(key)||0),done=0,mirror=null;
    if(!Number.isFinite(attempts)||attempts<0)throw Error('INVALID_LOCAL_USAGE_COUNTER');
    const catalogSheet=ss.getSheetByName('物語記憶');
    const catalog=parseStoryMemoryRows(catalogSheet?.getDataRange().getDisplayValues()||[]);
    const originalPeople=person.getDataRange().getDisplayValues(),
      originalSources=source.getDataRange().getDisplayValues();
    for(let i=0;i<rows.length&&done<maxCases;i++){
      const [id,npc,scene,utterance,state,,,,modeCell,bookId,previousId,choice,caseId,issue]=rows[i];
      if(state!=='PENDING')continue;
      const mode=norm(modeCell)||'integrated-synthetic';
      const mark=(status,code)=>{q.getRange(i+2,5).setValue(status);
        q.getRange(i+2,7,1,2).setValues([[new Date(),code]]);};
      if(counts[id]!==1||!idPattern.test(id)||!scene||scene.length>500||
        utterance.length>300||!MODES.has(mode)||!idPattern.test(npc)&&!/^[a-z_-]{2,32}$/u.test(npc)){
        mark('ERROR','INVALID_INPUT');continue;
      }
      if(existing.has(id)){mark('APPLIED','ALREADY_RECORDED');continue;}
      const fixtureReflection=mode==='integrated-mirror'&&norm(caseId)==='fictional-reflection';
      if(fixtureReflection&&(!bookId||!utterance)){mark('ERROR','INVALID_INPUT');continue;}
      let selectedChoices;
      try{selectedChoices=choice?JSON.parse(choice):[0,0]}catch{}
      if(!Array.isArray(selectedChoices)||selectedChoices.length>2||
        selectedChoices.some(c=>c!=='relay'&&c!==0&&c!==1)){
        mark('ERROR','INVALID_CHOICE');continue;
      }
      mark('RUNNING','');SpreadsheetApp.flush();done++;
      try{
        if(mode==='integrated-mirror'&&!mirror)mirror=readMirror(ss,props);
        let prior=null;
        if(previousId){
          const matches=results.filter(row=>row[0]===previousId&&['PASS','FAIL'].includes(row[17])&&row[18]===mode);
          if(matches.length!==1)throw Error('PREVIOUS_RESULT_MISSING');
          try{prior=JSON.parse(matches[0][15]).conversation.storage}catch{}
          if(!prior)throw Error('PREVIOUS_INPUT_INVALID');
        }
        let snapshot=mode==='integrated-mirror'?mirror:{books:[],reflections:[]};
        if(bookId){
          const books=snapshot.books.filter(book=>book.id===bookId&&book.status==='read');
          if(!books.length)throw Error('BOOK_NOT_READ');
          snapshot={...snapshot,books};
        }
        if(fixtureReflection){
          // The book and its approved facts remain real. The reader words
          // are explicitly fictional and never written to the bookshelf.
          snapshot={...snapshot,reflections:[{id:'fixture-'+id,bookId,
            quote:utterance,attribution:'verbatim',createdAt:Date.now()}],archiveReflections:[]};
        }
        const conversation=await probeConversation(originalPeople,originalSources,npc,{
          snapshot,catalog,storage:prior,choices:selectedChoices,
          ...(npc==='twins'?{
            twinNames:profileTwinNames(originalPeople)||parseTwinNameRows(
              ss.getSheetByName('ふたご名前')?.getDataRange().getDisplayValues()||[])
          }:{}),
          transport:async input=>{
            props.setProperty(key,String(++attempts));
            const started=Date.now();
            let response;
            try{response=UrlFetchApp.fetch('https://api.cloudflare.com/client/v4/accounts/'+account.trim()+'/ai/run/'+MODEL,{
              method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+token.trim()},
              payload:JSON.stringify({...input,stream:false}),muteHttpExceptions:true,followRedirects:false});
            }catch{throw Error('Model network error')}
            if(Date.now()-started>11000)throw Error('timeout');
            const status=response.getResponseCode();
            if(status<200||status>=300)throw Error('Model HTTP '+status);
            let envelope;
            try{envelope=JSON.parse(response.getContentText())}catch{throw Error('Model response JSON')}
            if(envelope?.success===false)throw Error('Model provider error');
            return envelope.result;
          }});
        const valid=conversation.trace.length>0&&conversation.trace.every(t=>t.validation==='accepted')&&
          conversation.frames.at(-1)?.result?.conversationComplete===true&&
          !conversation.selectionErrors.some(error=>error.selection==='relay')&&
          (!fixtureReflection||conversation.summary.turns[0]?.sourceKind==='review-reaction');
        const compact={...conversation,storage:compactProbeStorage(conversation.storage),
          trace:conversation.trace.map(({prompt,...rest})=>rest)};
        const saved=JSON.stringify({conversation:compact});
        if(saved.length>48000)throw Error('TRACE_TOO_LARGE');
        const savedRow=[safeText(id),npc,npc,safeText(scene),safeText(utterance),
          safeText(JSON.stringify(conversation.frames.map(f=>f.result))),MODEL,
          conversation.trace[0]?.prompt.npc.profileVersion||'', '',
          conversation.summary.promptVersion,new Date(),'','','','品質評価未実施',
          safeText(saved),new Date(),valid?'PASS':'FAIL',mode,mirror?.snapshotAt?new Date(mirror.snapshotAt):'',
          safeText(bookId||''), '',fixtureReflection?'MIRROR_WITH_FICTIONAL_REFLECTION':
            mode==='integrated-synthetic'?'SYNTHETIC':'READ_ONLY_MIRROR',
          safeText(previousId||''),safeText(caseId||''),safeText(issue||''),
          conversation.trace.filter(t=>t.prompt.mode==='reply').length,''];
        out.appendRow(savedRow);
        results.push(savedRow);
        existing.add(id);
        mark(valid?'APPLIED':'ERROR',valid?'':conversation.trace.find(t=>t.failure)?.failure||
          'CONVERSATION_INCOMPLETE');
      }catch(error){
        const code=String(error?.message||'');
        mark('ERROR',/^(?:MIRROR_[A-Z_]+|BOOK_NOT_READ|PREVIOUS_[A-Z_]+|TRACE_TOO_LARGE)$/u.test(code)?
          code:'PROFILE_CONTRACT');
        continue;
      }
    }
  }finally{lock.releaseLock();}
}
