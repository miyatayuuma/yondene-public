import {parseStoryMemoryRows} from './book-forest-story-memory.mjs';
import {validateTwinNamePairs} from './book-forest-twins.mjs';
import {parseForestCharacterProfiles,parseForestProfileSources,FOREST_PROFILE_ROWS} from './book-forest-character-profiles.mjs';

const PRIVATE_CATALOG_NAME='よんでね｜本の森 キャラクター設定・セリフ台帳';
const SHEET_MIME='application/vnd.google-apps.spreadsheet';
const FILE_ID=/^[A-Za-z0-9_-]{10,100}$/u;

export function parseTwinNameRows(values){
  const header=values?.[0];
  if(!Array.isArray(header))return [];
  const columns=['schemaVersion','pairId','firstName','secondName','approval'].map(name=>header.indexOf(name));
  if(columns.includes(-1))return [];
  return validateTwinNamePairs(values.slice(1).map(row=>{
    const [version,id,firstName,secondName,approval]=columns.map(index=>String(row?.[index]??'').trim());
    return {schemaVersion:Number(version),id,firstName,secondName,approval};
  }));
}

// Preserve pair IDs already pinned on readers' devices when retiring the old tab.
export function profileTwinNames(values){
  const header=values?.[0];
  if(!Array.isArray(header))return null;
  const columns=['NPC ID','項目','内容'].map(name=>header.indexOf(name));
  if(columns.includes(-1))return null;
  const [npc,field,content]=columns;
  const rows=values.slice(1).filter(row=>row[npc]==='twins'&&row[field]==='名前ペア');
  if(!rows.length)return null;
  if(rows.length===1){
    try{
      const parsed=JSON.parse(rows[0][content]);
      const pairs=validateTwinNamePairs(parsed);
      if(pairs.length&&pairs.length===parsed.length)return pairs;
    }catch{}
  }
  throw Error('人物設定 twins: 名前ペアの形式を確認してください');
}

async function authorizedJson(url,token,fetchImpl){
  const response=await fetchImpl(url,{headers:{Authorization:'Bearer '+token},cache:'no-store'});
  if(!response.ok){
    if(response.status===401||response.status===403)
      throw Error('非公開の会話台帳を読む権限がありません。Google認証とSheets APIの設定を確認してください');
    throw Error('会話台帳の読み込みに失敗しました（'+response.status+'）');
  }
  const body=await response.text();
  if(body.length>480000)throw Error('会話台帳が規定のサイズを超えています');
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
  const ranges=["'物語記憶'!A1:N140","'人物設定'!A1:H"+(FOREST_PROFILE_ROWS+2),"'根拠資料'!A1:J500"];
  for(const range of ranges)sheetUrl.searchParams.append('ranges',range);
  const data=await authorizedJson(sheetUrl.href,token,fetchImpl);
  if(!Array.isArray(data.valueRanges)||data.valueRanges.length!==ranges.length)
    throw Error('非公開の会話資料の形式が正しくありません');
  const [stories,people,sources]=data.valueRanges.map(range=>range?.values);
  const catalog=parseStoryMemoryRows(stories);
  const characterProfiles=parseForestCharacterProfiles(people,parseForestProfileSources(sources));
  let twinNames=profileTwinNames(people);
  if(!twinNames){
    const legacyUrl=sheetUrl.pathname.replace(/:batchGet$/u,'/'+encodeURIComponent("'ふたご名前'!A1:E40"));
    try{
      const legacy=await authorizedJson(new URL(legacyUrl,sheetUrl.origin).href,token,fetchImpl);
      twinNames=parseTwinNameRows(legacy.values);
    }catch{
      // Missing legacy names disable only this NPC until names are configured.
      twinNames=[];
    }
  }
  return {catalog,twinNames,characterProfiles,loadedAt:Date.now()};
}
