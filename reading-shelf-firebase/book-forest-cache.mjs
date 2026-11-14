import {validateForestSpriteManifest} from './book-forest-drive.mjs';

// These entries are stored locally by the browser, not uploaded to Hosting.
// The cache name is scoped to the Firebase user and family. It contains no
// OAuth credential and is never consulted before the owner role is verified.
const CACHE_PREFIX='private-book-forest-art-v1-';
const CACHE_PATH='/__book_forest_private_art__/';
const ID=/^[A-Za-z0-9_-]{1,160}$/;

function cacheName(uid,familyId){
  if(!ID.test(uid)||!ID.test(familyId))throw Error('森の画像キャッシュの識別情報が正しくありません');
  return CACHE_PREFIX+uid+'-'+familyId;
}

function cacheUrl(name){
  const origin=globalThis.location?.origin||'https://local.test';
  return new URL(CACHE_PATH+name,origin).href;
}

export async function saveCachedForestSprites({uid,familyId,manifest,blobs,cacheStorage=globalThis.caches}){
  if(!cacheStorage?.open)return false;
  const spriteNames=Object.keys(validateForestSpriteManifest(manifest));
  for(const name of spriteNames){
    const blob=blobs?.[name];
    if(!(blob instanceof Blob)||blob.size>2000000||
      (blob.type&&!blob.type.includes('image/png'))){
      throw Error('保存する森の画像の形式が正しくありません');
    }
  }
  const name=cacheName(uid,familyId);
  // The manifest is written last as a completion marker. An interrupted write
  // cannot make a partially populated cache look ready.
  await cacheStorage.delete(name);
  const cache=await cacheStorage.open(name);
  for(const assetName of spriteNames){
    await cache.put(cacheUrl(assetName),new Response(blobs[assetName],{
      headers:{'Content-Type':'image/png'}
    }));
  }
  await cache.put(cacheUrl('manifest'),new Response(JSON.stringify(manifest),{
    headers:{'Content-Type':'application/json'}
  }));
  return true;
}

export async function loadCachedForestSprites({
  uid,familyId,cacheStorage=globalThis.caches,decodeImage=globalThis.createImageBitmap
}){
  if(!cacheStorage?.open)return null;
  const name=cacheName(uid,familyId);
  if(cacheStorage.keys&&!(await cacheStorage.keys()).includes(name))return null;
  const cache=await cacheStorage.open(name);
  const manifestResponse=await cache.match(cacheUrl('manifest'));
  if(!manifestResponse)return null;
  const images={};
  try{
    const manifest=await manifestResponse.json();
    const spriteNames=Object.keys(validateForestSpriteManifest(manifest));
    const size=manifest.frameSize*2;
    const results=await Promise.allSettled(spriteNames.map(async assetName=>{
      const response=await cache.match(cacheUrl(assetName));
      if(!response)throw Error('森の画像キャッシュに不足があります');
      const blob=await response.blob();
      if(blob.size>2000000||blob.type!=='image/png')throw Error('森の画像キャッシュが壊れています');
      const image=await decodeImage(blob);
      if(image.width!==size||image.height!==size){
        image.close?.();
        throw Error('森の画像キャッシュのサイズが一致しません');
      }
      images[assetName]=image;
    }));
    const failed=results.find(result=>result.status==='rejected');
    if(failed)throw failed.reason;
  }catch(error){
    Object.values(images).forEach(image=>image.close?.());
    await cacheStorage.delete(name);
    console.warn('Discarded an invalid private forest image cache:',String(error?.message||error));
    return null;
  }
  return {images,dispose(){Object.values(images).forEach(image=>image.close?.())}};
}

export async function clearCachedForestSprites({uid,familyId,cacheStorage=globalThis.caches}={}){
  if(!cacheStorage?.delete)return;
  if(uid&&familyId){
    await cacheStorage.delete(cacheName(uid,familyId));
    return;
  }
  if(!cacheStorage.keys)return;
  const names=await cacheStorage.keys();
  await Promise.all(names.filter(name=>name.startsWith(CACHE_PREFIX))
    .map(name=>cacheStorage.delete(name)));
}
