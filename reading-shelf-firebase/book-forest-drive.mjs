// All PNGs and the file-ID manifest live in a restricted Google Drive folder.
// This public module contains no sprite pixels, Google OAuth token, or book data.
// The only hard-coded reference is the private manifest's opaque Drive ID.
export const FOREST_MANIFEST_ID='1SS9B94oeo_52QfSa6fvmI2hwE4lQ8tYA';
export const FOREST_DRIVE_SCOPE='https://www.googleapis.com/auth/drive.readonly';
export const FOREST_SPRITE_NAMES=[
  'king','cat','kiki','jiji','skipper','twins','zorori','ishishi','noshishi',
  'player_cat','player_rabbit'
];
const FILE_ID=/^[A-Za-z0-9_-]{20,120}$/;

export function validateForestSpriteManifest(manifest){
  const legacy=manifest?.schemaVersion===1&&manifest?.frameSize===64;
  const highres=manifest?.schemaVersion===2&&Number.isInteger(manifest?.frameSize)&&
    manifest.frameSize>=128&&manifest.frameSize<=1024;
  if((!legacy&&!highres)||manifest?.columns!==2||manifest?.rows!==2||
    manifest?.frameDurationMs!==250||
    !manifest.assets||typeof manifest.assets!=='object')throw Error('ドット絵の一覧が正しくありません');
  const entries=Object.entries(manifest.assets);
  if(entries.length!==FOREST_SPRITE_NAMES.length||
    entries.some(([name,id])=>!FOREST_SPRITE_NAMES.includes(name)||!FILE_ID.test(id))||
    FOREST_SPRITE_NAMES.some(name=>!manifest.assets[name])){
    throw Error('ドット絵のファイル一覧が一致しません');
  }
  return manifest.assets;
}

export async function authorizeForestDrive({user,GoogleAuthProvider,reauthenticateWithPopup}){
  const provider=new GoogleAuthProvider();
  provider.addScope(FOREST_DRIVE_SCOPE);
  const result=await reauthenticateWithPopup(user,provider);
  const token=GoogleAuthProvider.credentialFromResult(result)?.accessToken;
  if(!token)throw Error('Google Driveの読み取り権限が取得できませんでした');
  return token;
}

function mediaURL(fileId){
  if(!FILE_ID.test(fileId))throw Error('ファイル参照が正しくありません');
  return 'https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(fileId)+'?alt=media';
}

export async function loadPrivateForestSprites(token,{fetchImpl=fetch,decodeImage=createImageBitmap}={}){
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
  const manifestResponse=await get(FOREST_MANIFEST_ID);
  const manifest=await manifestResponse.json();
  const assets=validateForestSpriteManifest(manifest);
  const sheetSize=manifest.frameSize*2;
  const images={};
  try{
    // At 128x128 and 64 colors the 11 images collectively weigh ~30 KiB.
    await Promise.all(FOREST_SPRITE_NAMES.map(async name=>{
      const response=await get(assets[name]);
      const blob=await response.blob();
      if(blob.size>2000000||blob.type&&!blob.type.includes('image/png'))throw Error('PNG画像の形式が正しくありません');
      const decoded=await decodeImage(blob);
      if(decoded.width!==sheetSize||decoded.height!==sheetSize){
        decoded.close?.();
        throw Error('画像のコマ配置が正しくありません');
      }
      images[name]=decoded;
    }));
  }catch(error){
    Object.values(images).forEach(image=>image.close?.());
    throw error;
  }
  return {
    images,
    dispose(){Object.values(images).forEach(image=>image.close?.())}
  };
}
