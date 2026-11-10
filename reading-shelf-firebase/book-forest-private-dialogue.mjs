import {parseStoryMemoryRows} from './book-forest-story-memory.mjs';
import {validateForestDialogueCues} from './book-forest-dialogue-director.mjs';

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

export async function loadPrivateForestDialogue(token,{fetchImpl=fetch}={}){
  if(typeof token!=='string'||!token)throw Error('Google Driveの認証が必要です');
  const q=`name = '${PRIVATE_CATALOG_NAME.replaceAll("'","\\'")}' and mimeType = '${SHEET_MIME}' and trashed = false`;
  const driveUrl=new URL('https://www.googleapis.com/drive/v3/files');
  driveUrl.searchParams.set('q',q);driveUrl.searchParams.set('pageSize','10');
  driveUrl.searchParams.set('fields','nextPageToken,files(id,name,mimeType)');
  const found=await authorizedJson(driveUrl.href,token,fetchImpl);
  const files=(Array.isArray(found.files)?found.files:[]).filter(file=>
    file?.name===PRIVATE_CATALOG_NAME&&file.mimeType===SHEET_MIME&&FILE_ID.test(file.id));
  if(found.nextPageToken||files.length!==1)throw Error('非公開の会話台帳を一意に特定できませんでした');
  const sheetUrl=new URL('https://sheets.googleapis.com/v4/spreadsheets/'+files[0].id+'/values:batchGet');
  sheetUrl.searchParams.append('ranges',"'物語記憶'!A1:N140");
  sheetUrl.searchParams.append('ranges',"'会話台本'!A1:J250");
  const data=await authorizedJson(sheetUrl.href,token,fetchImpl);
  if(!Array.isArray(data.valueRanges)||data.valueRanges.length!==2)
    throw Error('非公開の会話台本の形式が正しくありません');
  const catalog=parseStoryMemoryRows(data.valueRanges[0]?.values);
  const cues=parseForestDialogueRows(data.valueRanges[1]?.values);
  if(!cues.length)throw Error('承認済みの会話台本が見つかりません');
  return {catalog,cues};
}
