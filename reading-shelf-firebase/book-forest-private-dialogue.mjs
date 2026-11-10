import {parseStoryMemoryRows} from './book-forest-story-memory.mjs';
import {parseForestThoughtSeeds} from './book-forest-thought-seeds.mjs';
import {validateForestDialogueCues} from './book-forest-dialogue-director.mjs';
import {validateTwinNamePairs,validateTwinScenes} from './book-forest-twins.mjs';

// The title is a discovery hint, NOT an API credential or spreadsheet ID.
// The sheet ID, records and OAuth token never appear in the public source.
const PRIVATE_CATALOG_NAME='よんでね｜本の森 キャラクター設定・セリフ台帳';
const SHEET_MIME='application/vnd.google-apps.spreadsheet';
const FILE_ID=/^[A-Za-z0-9_-]{20,120}$/u;

function parseChoices(value){
  if(!value)return [];
  try{const choices=JSON.parse(value);return Array.isArray(choices)?choices:[]}
  catch{return []}
}

/** The private "会話台本" sheet has a fixed, versioned 10-column schema. */
export function parseForestDialogueRows(values){
  if(!Array.isArray(values)||!Array.isArray(values[0]))return [];
  const header=values[0].map(String);
  const names=['schemaVersion','cueId','npcId','kind','bookId','memoryId',
    'fromNpc','text','choicesJson','approval'];
  if(names.some(name=>!header.includes(name)))return [];
  const result=values.slice(1).filter(Array.isArray).map(row=>{
    const field=name=>String(row[header.indexOf(name)]??'').trim();
    const cue={schemaVersion:Number(field('schemaVersion')),id:field('cueId'),
      characterId:field('npcId'),kind:field('kind'),text:field('text'),
      approval:field('approval'),choices:parseChoices(field('choicesJson'))};
    if(field('bookId'))cue.bookId=field('bookId');
    if(field('memoryId'))cue.memoryId=field('memoryId');
    if(field('fromNpc'))cue.fromCharacterId=field('fromNpc');
    return cue;
  });
  return validateForestDialogueCues(result);
}

function rowObjects(values,columns){
  if(!Array.isArray(values)||!Array.isArray(values[0]))return [];
  const header=values[0].map(String);
  if(columns.some(column=>!header.includes(column)))return [];
  return values.slice(1).filter(Array.isArray).map(row=>
    Object.fromEntries(columns.map(column=>[column,row[header.indexOf(column)]??''])));
}

export function parseTwinNameRows(values){
  const rows=rowObjects(values,['schemaVersion','pairId','firstName','secondName','approval']);
  return validateTwinNamePairs(rows.map(row=>({schemaVersion:Number(row.schemaVersion),
    id:String(row.pairId),firstName:String(row.firstName).trim(),
    secondName:String(row.secondName).trim(),approval:String(row.approval)})));
}

export function parseTwinSceneRows(values){
  const rows=rowObjects(values,['schemaVersion','sceneId','sequence','speakerSlot',
    'text','bookId','memoryId','choicesJson','approval']);
  return validateTwinScenes(rows.map(row=>({schemaVersion:Number(row.schemaVersion),
    sceneId:String(row.sceneId),sequence:Number(row.sequence),speakerSlot:Number(row.speakerSlot),
    text:String(row.text),...(row.bookId?{bookId:String(row.bookId)}:{}),
    ...(row.memoryId?{memoryId:String(row.memoryId)}:{}),
    choices:parseChoices(String(row.choicesJson)),approval:String(row.approval)})));
}

async function authorizedJson(url,token,fetchImpl){
  const response=await fetchImpl(url,{headers:{Authorization:'Bearer '+token},cache:'no-store'});
  if(!response.ok){
    if(response.status===401||response.status===403)
      throw Error('非公開の会話台帳を読む権限がありません。Google認証とSheets APIの設定を確認してください');
    throw Error('会話台帳の読み込みに失敗しました（'+response.status+'）');
  }
  const body=await response.text();
  if(body.length>240000)throw Error('会話台帳が規定のサイズを超えています');
  return JSON.parse(body);
}

export async function findPrivateForestDialogueSheet(token,{fetchImpl=fetch}={}){
  if(typeof token!=='string'||!token)throw Error('Google Driveの認証が必要です');
  const q=`name = '${PRIVATE_CATALOG_NAME.replaceAll("'","\\'")}' and mimeType = '${SHEET_MIME}' and trashed = false`;
  const driveUrl=new URL('https://www.googleapis.com/drive/v3/files');
  driveUrl.searchParams.set('q',q);driveUrl.searchParams.set('pageSize','10');
  driveUrl.searchParams.set('fields','nextPageToken,files(id,name,mimeType)');
  const found=await authorizedJson(driveUrl.href,token,fetchImpl);
  const files=(Array.isArray(found.files)?found.files:[]).filter(file=>
    file?.name===PRIVATE_CATALOG_NAME&&file.mimeType===SHEET_MIME&&FILE_ID.test(file.id));
  if(found.nextPageToken||files.length!==1)throw Error('非公開の会話台帳を一意に特定できませんでした');
  return files[0].id;
}

export async function loadPrivateForestDialogue(token,{fetchImpl=fetch}={}){
  const spreadsheetId=await findPrivateForestDialogueSheet(token,{fetchImpl});
  const sheetUrl=new URL('https://sheets.googleapis.com/v4/spreadsheets/'+spreadsheetId+'/values:batchGet');
  sheetUrl.searchParams.append('ranges',"'物語記憶'!A1:N140");
  sheetUrl.searchParams.append('ranges',"'会話台本'!A1:J250");
  sheetUrl.searchParams.append('ranges',"'ふたご名前'!A1:E40");
  sheetUrl.searchParams.append('ranges',"'ふたご会話'!A1:I200");
  sheetUrl.searchParams.append('ranges',"'思考の種'!A1:R190");
  const data=await authorizedJson(sheetUrl.href,token,fetchImpl);
  if(!Array.isArray(data.valueRanges)||data.valueRanges.length!==5)
    throw Error('非公開の会話台本の形式が正しくありません');
  const catalog=parseStoryMemoryRows(data.valueRanges[0]?.values);
  const cues=parseForestDialogueRows(data.valueRanges[1]?.values);
  if(!cues.length)throw Error('承認済みの会話台本が見つかりません');
  const twinNames=parseTwinNameRows(data.valueRanges[2]?.values);
  const twinScenes=parseTwinSceneRows(data.valueRanges[3]?.values);
  const thoughtSeeds=parseForestThoughtSeeds(data.valueRanges[4]?.values);
  return {catalog,cues,twinNames,twinScenes,thoughtSeeds};
}
