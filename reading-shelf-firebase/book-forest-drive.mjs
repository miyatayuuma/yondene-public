import {FOREST_REQUIRED_SPRITE_NAMES,FOREST_OPTIONAL_SPRITE_NAMES} from './forest-character-registry.mjs';
// All PNGs and the file-ID manifest live in a restricted Google Drive folder.
// This public module contains no sprite pixels, Google OAuth token, or book data.
// The manifest is discovered inside the owner's private folder after OAuth.
// Do not publish any real Drive file/folder identifiers in source or tests.
const FOREST_SPRITE_FOLDER_NAME='箱庭ドット絵（非公開）';
const FOREST_MANIFEST_NAME='manifest.json';
export const FOREST_DRIVE_SCOPE='https://www.googleapis.com/auth/drive.readonly';
export const FOREST_SPRITE_NAMES=FOREST_REQUIRED_SPRITE_NAMES;
export {FOREST_OPTIONAL_SPRITE_NAMES};
const FILE_ID=/^[A-Za-z0-9_-]{20,120}$/;
// Public identity/asset allowlists derive from the shared NPC registry.
export function validateForestSpriteManifest(manifest){
  const legacy=manifest?.schemaVersion===1&&manifest?.frameSize===64;
  const highres=manifest?.schemaVersion===2&&Number.isInteger(manifest?.frameSize)&&
    manifest.frameSize>=128&&manifest.frameSize<=1024;
  if((!legacy&&!highres)||manifest?.columns!==2||manifest?.rows!==2||
    manifest?.frameDurationMs!==250||
    !manifest.assets||typeof manifest.assets!=='object')throw Error('ドット絵の一覧が正しくありません');
  const entries=Object.entries(manifest.assets);
  const supported=[...FOREST_SPRITE_NAMES,...FOREST_OPTIONAL_SPRITE_NAMES];
  if(entries.length<FOREST_SPRITE_NAMES.length||entries.length>supported.length||
    entries.some(([name,id])=>!supported.includes(name)||!FILE_ID.test(id))||
    FOREST_SPRITE_NAMES.some(name=>!manifest.assets[name])){
    throw Error('ドット絵のファイル一覧が一致しません');
  }
  return manifest.assets;
}

export async function authorizeForestDrive({user,GoogleAuthProvider,reauthenticateWithPopup}){
  const provider=new GoogleAuthProvider();
  provider.addScope(FOREST_DRIVE_SCOPE);
  // Prefer the account already authenticated with Firebase when a new Drive
  // authorization is genuinely needed (first visit or explicit image refresh).
  if(user?.email)provider.setCustomParameters({login_hint:user.email});
  const result=await reauthenticateWithPopup(user,provider);
  const token=GoogleAuthProvider.credentialFromResult(result)?.accessToken;
  if(!token)throw Error('Google Driveの読み取り権限が取得できませんでした');
  return token;
}

/** Find the private sprite manifest by names, not a committed Drive file ID.
 * The caller's OAuth token never enters a URL or a persistent browser log.
 * Duplicate folders/manifests fail closed instead of selecting a random file.
 */
export async function findPrivateForestManifestId(token,{fetchImpl=fetch}={}){
  if(typeof token!=='string'||!token)throw Error('Google Driveの認証が必要です');
  async function findOne(name,mimeType,where=''){
    const queryName=name.replaceAll('\\','\\\\').replaceAll("'", "\\'");
    const url=new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q',"name = '"+queryName+"' and mimeType = '"+mimeType+
      "' and trashed = false"+where);
    url.searchParams.set('fields','nextPageToken,files(id,name,mimeType)');
    url.searchParams.set('pageSize','100');
    const response=await fetchImpl(url.href,{
      headers:{Authorization:'Bearer '+token},cache:'no-store'
    });
    if(!response.ok){
      if(response.status===401||response.status===403)
        throw Error('非公開ドット絵の一覧を読む権限がありません');
      throw Error('非公開ドット絵の一覧を取得できませんでした（'+response.status+'）');
    }
    const result=await response.json();
    const entries=Array.isArray(result?.files)?result.files:[];
    const matches=entries.filter(item=>item?.name===name&&item.mimeType===mimeType&&
      FILE_ID.test(item.id));
    if(result?.nextPageToken||matches.length!==1||entries.length!==1)
      throw Error('非公開ドット絵の参照先を一意に特定できませんでした');
    return matches[0].id;
  }
  const folderId=await findOne(FOREST_SPRITE_FOLDER_NAME,
    'application/vnd.google-apps.folder');
  return findOne(FOREST_MANIFEST_NAME,'application/json',
    " and '"+folderId+"' in parents");
}

function mediaURL(fileId){
  if(!FILE_ID.test(fileId))throw Error('ファイル参照が正しくありません');
  return 'https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(fileId)+'?alt=media';
}

export async function loadPrivateForestSprites(token,{
  fetchImpl=fetch,decodeImage=createImageBitmap,onValidatedAssets,
  resolveManifestId=findPrivateForestManifestId
}={}){
  if(!token)throw Error('Google Driveの認証が必要です');
  async function get(fileId){
    const response=await fetchImpl(mediaURL(fileId),{
      headers:{Authorization:'Bearer '+token},cache:'no-store'
    });
    if(!response.ok){
      if(response.status===401||response.status===403)throw Error('Google Driveのアクセスが拒否されました。Drive APIの有効化とGoogleの許可を確認してください');
      throw Error('非公開ドット絵を読み込めませんでした（'+response.status+'）');
    }
    return response;
  }
  const manifestId=await resolveManifestId(token,{fetchImpl});
  const manifestResponse=await get(manifestId);
  const manifest=await manifestResponse.json();
  const assets=validateForestSpriteManifest(manifest);
  const spriteNames=Object.keys(assets);
  const sheetSize=manifest.frameSize*2;
  const images={};
  const blobs=onValidatedAssets?{}:null;
  try{
    // At 128x128 and 64 colors the 11 images collectively weigh ~30 KiB.
    await Promise.all(spriteNames.map(async name=>{
      const response=await get(assets[name]);
      const blob=await response.blob();
      if(blob.size>2000000||blob.type&&!blob.type.includes('image/png'))throw Error('PNG画像の形式が正しくありません');
      const decoded=await decodeImage(blob);
      if(decoded.width!==sheetSize||decoded.height!==sheetSize){
        decoded.close?.();
        throw Error('画像のコマ配置が正しくありません');
      }
      images[name]=decoded;
      if(blobs)blobs[name]=blob;
    }));
    if(onValidatedAssets)await onValidatedAssets(manifest,blobs);
  }catch(error){
    Object.values(images).forEach(image=>image.close?.());
    throw error;
  }
  return {
    images,profiles:manifest.spriteProfiles,
    dispose(){Object.values(images).forEach(image=>image.close?.())}
  };
}
