// A single Apps Script bundle shares the production persona / reflection /
// story / prompt / model validators. Real data is loaded only at execution
// from PRIVATE Sheets and the read-only Firestore synchronization mirror.
// Never copy actual family data, quotes, IDs or credentials to public sources.
import {parseForestCharacterProfiles,parseForestProfileSources}
  from '../reading-shelf-firebase/book-forest-character-profiles.mjs';
import {parseStoryMemoryRows,unlockedStoryMemories}
  from '../reading-shelf-firebase/book-forest-story-memory.mjs';
import {parseForestDialogueRows} from '../reading-shelf-firebase/book-forest-private-dialogue.mjs';
import {chooseForestReflectionSpotlight}
  from '../reading-shelf-firebase/book-forest-reflection-spotlight.mjs';
import {createForestDailyContextSession}
  from '../reading-shelf-firebase/book-forest-daily-context.mjs';
import {parseForestBookshelfMirror}
  from '../reading-shelf-firebase/book-forest-mirror-snapshot.mjs';
import {forestMemoryBelongsToCharacter}
  from '../reading-shelf-firebase/forest-character-registry.mjs';
import {promptFor} from '../reading-shelf-firebase/book-forest-live-dialogue.mjs';
import {forestGenerationInput,readCompletion} from '../cloudflare/forest-ai/src/index.mjs';

const MODEL='@cf/google/gemma-4-26b-a4b-it';
const MODES=new Set(['synthetic','mirror-reflection','mirror-daily','mirror-story','continuation']);
const safeText=v=>/^\s*[=+@-]/u.test(String(v))?"'"+String(v):String(v);
const norm=x=>String(x??'').trim();
const SOURCE_PROVEN='READ_ONLY_MIRROR';
const idPattern=/^[A-Za-z0-9_-]{6,80}$/u;

/** Keep original unit-test call signature and synthetic fallback isolated. */
export function probeInput(personRows,sourceRows,id,scene,utterance,options={}){
  const profile=parseForestCharacterProfiles(personRows,
    parseForestProfileSources(sourceRows)).find(p=>p.id===id);
  if(!profile)throw Error('MISSING_PROFILE');
  const mode=options.mode||'synthetic';
  if(!MODES.has(mode))throw Error('INVALID_MODE');
  let prompt,meta={mode,bookId:'',reflectionId:'',attribution:'',
    syncAt:'',sourceKind:'ambient',turn:0};
  if(mode==='synthetic'){
    prompt=promptFor({characterId:id,characterProfile:profile,mode:'opening',sourceKind:'ambient',
      situation:{scene,utterance,evidence:'imagined'}});
  }else if(mode==='continuation'){
    const prev=options.previous;
    if(!prev||prev.characterId!==id||!idPattern.test(norm(options.previousId))||
      !norm(options.choice))throw Error('INVALID_CONTINUATION');
    const previous=readCompletion({response:prev.raw},{mode:prev.prompt.mode||'opening',
      characterId:id,closing:prev.prompt.closing===true});
    if(!previous.choices?.includes(norm(options.choice)))throw Error('INVALID_CHOICE');
    const previousTurns=Array.isArray(prev.prompt.context?.recentTurns)?
      prev.prompt.context.recentTurns:[];
    const turn=Number(prev.turn||0)+1;
    if(turn>2)throw Error('MAX_REPLIES');
    const snapshot=options.mirror;
    if(prev.bookId){
      if(!snapshot||!snapshot.books.some(b=>b.id===prev.bookId&&b.status==='read'))
        throw Error('READ_REVOKED');
      if(prev.reflectionId&&!snapshot.reflections.some(r=>
        r.id===prev.reflectionId&&r.bookId===prev.bookId&&
        r.attribution===prev.attribution))throw Error('REFLECTION_REVOKED');
    }
    const review=prev.prompt.context?.readerReflection||null;
    const context=prev.prompt.context||{};
    prompt=promptFor({characterId:id,characterProfile:profile,mode:'reply',
      chosenLabel:norm(options.choice),history:[...previousTurns,{npc:previous.text},
        {playerChoice:norm(options.choice)}].slice(-4),
      closing:turn>=2,sourceKind:context.sourceKind||'ambient',
      topic:context.topic||null,reviewSpotlight:review,
      dailyContext:context.today||null,situation:context.situation||null,
      recentLines:[...(context.avoidRecentLines||[]),previous.text].slice(-3)});
    meta={mode,bookId:prev.bookId||'',reflectionId:prev.reflectionId||'',
      attribution:prev.attribution||'',syncAt:snapshot?.snapshotAt||'',
      sourceKind:context.sourceKind||'ambient',turn};
  }else{
    const snapshot=options.mirror;
    if(!snapshot||!Array.isArray(snapshot.books))throw Error('MIRROR_REQUIRED');
    const books=snapshot.books,catalog=options.catalog||[],cues=options.cues||[];
    const now=options.now||Date.now(),targetId=norm(options.bookId);
    if(targetId&&!books.some(b=>b.id===targetId&&b.status==='read'))
      throw Error('BOOK_NOT_READ');
    const daily=createForestDailyContextSession({now:()=>now});
    const situation={firstEncounter:false,visitNumber:2,focus:'forest'};
    let sourceKind='ambient',review=null,topic=null,dailyContext=null;
    if(mode==='mirror-reflection'){
      // The caller explicitly requests a *later ambient encounter*; an actual
      // first meet/story/relay does NOT trigger a review in the live app.
      const available=targetId?snapshot.reflections.filter(r=>r.bookId===targetId):
        snapshot.reflections;
      review=chooseForestReflectionSpotlight({characterId:id,books,reflections:available,
        catalog,cues,state:{visits:2,lastReactionVisit:0,reactors:[],acknowledged:[],books:[]},now});
      if(!review)throw Error('NO_ELIGIBLE_REFLECTION');
      sourceKind='review-reaction';
      meta.bookId=review.sourceBookId;
      meta.reflectionId=snapshot.reflections.find(r=>r.bookId===review.sourceBookId&&
        r.createdAt===review.createdAt&&r.quote.slice(0,180)===review.quote)?.id||'';
      meta.attribution=review.attribution;
      if(!meta.reflectionId)throw Error('REFLECTION_IDENTITY');
    }else if(mode==='mirror-story'){
      const memories=unlockedStoryMemories(books,catalog)
        .filter(m=>forestMemoryBelongsToCharacter(m,id)&&(!targetId||m.bookId===targetId));
      if(!memories.length)throw Error('NO_VERIFIED_STORY');
      const memory=memories[0],book=books.find(b=>b.id===memory.bookId);
      sourceKind='story';topic={fact:memory.text.slice(0,240),bookTitle:(book?.title||'').slice(0,80)};
      meta.bookId=memory.bookId;
      dailyContext=daily.visit(id,{books,catalog,cues,sourceKind:'story',sourceMemoryId:memory.id});
      situation.focus='story';
    }else{
      // Same daily selection function as the app, but a deliberately requested
      // ambient slot. Persistent encounter history is not fabricated.
      dailyContext=daily.visit(id,{books,catalog,cues,sourceKind:'ambient'});
      situation.focus='forest';
    }
    prompt=promptFor({characterId:id,characterProfile:profile,mode:'opening',
      sourceKind,topic,reviewSpotlight:review,
      dailyContext:review?null:dailyContext,situation});
    meta={...meta,mode,syncAt:snapshot.snapshotAt,sourceKind};
  }
  for(const claim of profile.claims)if(!prompt.npc.voice.includes(claim.text))
    throw Error('PROFILE_LOSS');
  return {profile,prompt,input:forestGenerationInput(prompt),meta};
}

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
function getPrevious(rows,id){
  const list=rows.filter(row=>row[0]===id);
  if(list.length!==1||list[0][17]!=='PASS')throw Error('PREVIOUS_RESULT_MISSING');
  const row=list[0],raw=row[5];
  let input,prompt;
  try{input=JSON.parse(row[15]);prompt=JSON.parse(input.messages[1].content)}
  catch{throw Error('PREVIOUS_INPUT_INVALID')}
  if(!prompt||!raw)throw Error('PREVIOUS_INPUT_INVALID');
  return {characterId:row[1],prompt,raw,
    bookId:row[20]||'',attribution:row[21]||'',reflectionId:row[27]||'',
    turn:Number(row[26])||0};
}

/** Run a bounded queue once. Private input JSON may include reader quotes;
 * never export/log it or add it to public code. Only the private results Sheet
 * persists the exact prompt for reproducible testing.
 */
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
    if(!token||!account||!/^[a-f0-9]{32}$/iu.test(account.trim()))
      throw Error('MISSING_TEST_PROPERTIES');
    const rows=q.getDataRange().getDisplayValues().slice(1),counts={};
    for(const row of rows)counts[row[0]]=(counts[row[0]]||0)+1;
    const results=out.getDataRange().getDisplayValues().slice(1),
      existing=new Set(results.map(r=>r[0]));
    const today=Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy-MM-dd');
    const key='YONDENE_GEMMA_TEST_ATTEMPTS_'+today;
    let attempts=Number(props.getProperty(key)||0),done=0,mirror=null;
    if(!Number.isFinite(attempts)||attempts<0)throw Error('INVALID_LOCAL_USAGE_COUNTER');
    const catalogSheet=ss.getSheetByName('物語記憶');
    const cuesSheet=ss.getSheetByName('会話台本');
    const catalog=parseStoryMemoryRows(catalogSheet?.getDataRange().getDisplayValues()||[]);
    const cues=parseForestDialogueRows(cuesSheet?.getDataRange().getDisplayValues()||[]);
    const originalPeople=person.getDataRange().getDisplayValues(),
      originalSources=source.getDataRange().getDisplayValues();
    for(let i=0;i<rows.length&&done<3&&attempts<60;i++){
      const [id,npc,scene,utterance,state,,,,modeCell,bookId,previousId,choice,caseId,issue]=rows[i];
      if(state!=='PENDING')continue;
      const mode=norm(modeCell)||'synthetic';
      const mark=(status,code)=>{q.getRange(i+2,5).setValue(status);
        q.getRange(i+2,7,1,2).setValues([[new Date(),code]]);};
      if(counts[id]!==1||!idPattern.test(id)||!scene||scene.length>500||
        utterance.length>300||!MODES.has(mode)||!idPattern.test(npc)&&!/^[a-z_-]{2,32}$/u.test(npc)||
        mode==='continuation'&&(!idPattern.test(previousId)||!choice)){
        mark('ERROR','INVALID_INPUT');continue;
      }
      if(existing.has(id)){mark('APPLIED','ALREADY_RECORDED');continue;}
      mark('RUNNING','');SpreadsheetApp.flush();done++;
      let prepared;
      try{
        // Never silently replace an unavailable bookshelf mirror with invented text.
        if(mode!=='synthetic'&&!mirror)mirror=readMirror(ss,props);
        const previous=mode==='continuation'?getPrevious(results,previousId):null;
        prepared=probeInput(originalPeople,originalSources,npc,scene,utterance,{
          mode,mirror:mode==='synthetic'?null:mirror,catalog,cues,
          bookId,previous,previousId,choice,now:Date.now()});
      }catch(error){
        const code=String(error?.message||'');
        mark('ERROR',/^(?:MIRROR_[A-Z_]+|BOOK_NOT_READ|READ_REVOKED|REFLECTION_REVOKED|NO_ELIGIBLE_REFLECTION|NO_VERIFIED_STORY|INVALID_CHOICE|PREVIOUS_[A-Z_]+|REFLECTION_IDENTITY|INVALID_CONTINUATION|MAX_REPLIES)$/u.test(code)?
          code:'PROFILE_CONTRACT');
        continue;
      }
      // Count attempts before network dispatch; never retry unknown outcomes.
      props.setProperty(key,String(++attempts));
      let result;
      try{
        const response=UrlFetchApp.fetch('https://api.cloudflare.com/client/v4/accounts/'+account.trim()+'/ai/run/'+MODEL,{
          method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+token.trim()},
          payload:JSON.stringify({...prepared.input,stream:false}),muteHttpExceptions:true,
          followRedirects:false});
        const status=response.getResponseCode();
        if(status<200||status>=300){mark('ERROR','HTTP_'+status);continue;}
        const envelope=JSON.parse(response.getContentText());
        if(envelope.success===false){mark('ERROR','PROVIDER_ERROR');continue;}
        result=envelope.result;
      }catch{mark('ERROR','NETWORK_OR_RESPONSE');continue;}
      const raw=result?.response??result?.choices?.[0]?.message?.content;
      let valid=false;
      try{readCompletion(result,{mode:prepared.prompt.mode,characterId:npc,
        closing:prepared.prompt.closing===true});valid=true}catch{}
      out.getRange(1,16,1,13).setValues([[
        '生成入力JSON','人物設定取得時刻','出力形式検証','文脈モード',
        '本棚同期日時','対象書籍ID','感想帰属','文脈確認','先行requestId',
        'ケースID','関連Issue','返答段階','感想ID'
      ]]);
      const meta=prepared.meta;
      out.appendRow([safeText(id),safeText(npc),safeText(npc),safeText(scene),safeText(utterance),
        safeText(typeof raw==='string'?raw:JSON.stringify(raw??null)),MODEL,
        prepared.profile.version+' / '+prepared.profile.revision,prepared.profile.review,
        'profile2-worker-v19',new Date(),'','','','品質評価未実施',
        safeText(JSON.stringify(prepared.input)),new Date(),valid?'PASS':'FAIL',
        mode,meta.syncAt?new Date(meta.syncAt):'',safeText(meta.bookId||''),
        meta.attribution||'',mode==='synthetic'?'SYNTHETIC':SOURCE_PROVEN,
        safeText(previousId||''),safeText(caseId||''),safeText(issue||''),
        meta.turn||0,safeText(meta.reflectionId||'')]);
      existing.add(id);mark(valid?'APPLIED':'ERROR',valid?'':'OUTPUT_VALIDATION');
    }
  }finally{lock.releaseLock();}
}
