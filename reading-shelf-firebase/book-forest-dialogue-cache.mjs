import {validateForestDialogueCues} from './book-forest-dialogue-director.mjs';
import {unlockedStoryMemories} from './book-forest-story-memory.mjs';

const PREFIX='private-book-forest-dialogue-v2-';
const LEGACY_PREFIX='private-book-forest-dialogue-v1-';
const IDS=/^[A-Za-z0-9_-]{1,160}$/u;
const pathname='/__book_forest_private_dialogue__/package';
const scopedName=(uid,familyId)=>{
  if(!IDS.test(uid)||!IDS.test(familyId))throw Error('森の会話データの所有者が不明です');
  return PREFIX+uid+'-'+familyId;
};
const url=()=>new URL(pathname,globalThis.location?.origin||'https://local.test').href;

export async function saveCachedForestDialogue({uid,familyId,packageData,cacheStorage=globalThis.caches}={}){
  if(!cacheStorage?.open)return false;
  if(!validateForestDialogueCues(packageData?.cues).length)throw Error('会話台本が空です');
  if(!Array.isArray(packageData?.catalog)||packageData.catalog.length>140)
    throw Error('物語記憶の件数が正しくありません');
  const body=JSON.stringify(packageData);
  if(body.length>160000)throw Error('会話台本が大きすぎます');
  const name=scopedName(uid,familyId);
  const cache=await cacheStorage.open(name);
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
    if(text.length>160000)throw Error('oversized');
    const data=JSON.parse(text);
    if(!Array.isArray(data.catalog)||data.catalog.length>140||!validateForestDialogueCues(data.cues).length)
      throw Error('invalid');
    // Fact-level authorization still happens with the current Firestore shelf
    // snapshot in the director. Never persist reading state or review quotes.
    return {catalog:data.catalog,cues:validateForestDialogueCues(data.cues)};
  }catch{
    await cacheStorage.delete(name);return null;
  }
}

export async function clearCachedForestDialogue({uid,familyId,cacheStorage=globalThis.caches}={}){
  if(!cacheStorage?.delete)return;
  if(uid&&familyId){
    const oldName=LEGACY_PREFIX+uid+'-'+familyId;
    await Promise.all([cacheStorage.delete(scopedName(uid,familyId)),cacheStorage.delete(oldName)]);
    return;
  }
  if(cacheStorage.keys){
    await Promise.all((await cacheStorage.keys()).filter(name=>
      name.startsWith(PREFIX)||name.startsWith(LEGACY_PREFIX))
      .map(name=>cacheStorage.delete(name)));
  }
}
