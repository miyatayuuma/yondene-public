import {validateTwinNamePairs} from './book-forest-twins.mjs';
import {validForestCharacterProfiles} from './book-forest-character-profiles.mjs';

const PREFIX='private-book-forest-dialogue-v8-';
const LEGACY_PREFIX='private-book-forest-dialogue-v';
export const FOREST_DIALOGUE_MAX_AGE_MS=60*60*1000;
export function freshForestDialogue(data,now=Date.now()){
  return Number.isFinite(data?.loadedAt)&&data.loadedAt<=now&&now-data.loadedAt<FOREST_DIALOGUE_MAX_AGE_MS;
}
const IDS=/^[A-Za-z0-9_-]{1,160}$/u;
const pathname='/__book_forest_private_dialogue__/package';
const scopedName=(uid,familyId)=>{
  if(!IDS.test(uid)||!IDS.test(familyId))throw Error('森の会話データの所有者が不明です');
  return PREFIX+uid+'~'+familyId;
};
const url=()=>new URL(pathname,globalThis.location?.origin||'https://local.test').href;

function packageContents(data){
  if(!freshForestDialogue(data)||!Array.isArray(data.catalog)||data.catalog.length>140)
    throw Error('物語記憶の形式または読込時刻が正しくありません');
  const profiles=validForestCharacterProfiles(data.characterProfiles);
  if(!Array.isArray(data.characterProfiles)||profiles.length!==data.characterProfiles.length)
    throw Error('非公開キャラクター設定の形式が正しくありません');
  const names=validateTwinNamePairs(data.twinNames);
  if(!Array.isArray(data.twinNames)||names.length!==data.twinNames.length)
    throw Error('ふたごの名前の形式が正しくありません');
  return {catalog:data.catalog,twinNames:names,characterProfiles:profiles,loadedAt:data.loadedAt};
}

export async function saveCachedForestDialogue({uid,familyId,packageData,cacheStorage=globalThis.caches}={}){
  if(!cacheStorage?.open)return false;
  const body=JSON.stringify(packageContents(packageData));
  if(body.length>480000)throw Error('会話資料が大きすぎます');
  const cache=await cacheStorage.open(scopedName(uid,familyId));
  await cache.put(url(),new Response(body,{headers:{'Content-Type':'application/json'}}));
  return true;
}

export async function loadCachedForestDialogue({uid,familyId,cacheStorage=globalThis.caches}={}){
  if(!cacheStorage?.open)return null;
  const name=scopedName(uid,familyId);
  if(cacheStorage.keys&&!(await cacheStorage.keys()).includes(name))return null;
  const cache=await cacheStorage.open(name),response=await cache.match(url());
  if(!response)return null;
  try{
    const text=await response.text();
    if(text.length>480000)throw Error('oversized');
    return packageContents(JSON.parse(text));
  }catch{
    await cacheStorage.delete(name);return null;
  }
}

export async function clearCachedForestDialogue({uid,familyId,cacheStorage=globalThis.caches}={}){
  if(!cacheStorage?.delete)return;
  if(!cacheStorage.keys)return;
  const names=await cacheStorage.keys();
  const scoped=uid&&familyId?scopedName(uid,familyId):null;
  const matches=name=>name.startsWith(LEGACY_PREFIX)&&(!scoped||name===scoped||
    name===LEGACY_PREFIX+'7-'+uid+'~'+familyId||
    [1,2,3,4,5,6].some(version=>name===LEGACY_PREFIX+version+'-'+uid+'-'+familyId));
  await Promise.all(names.filter(matches).map(name=>cacheStorage.delete(name)));
}
