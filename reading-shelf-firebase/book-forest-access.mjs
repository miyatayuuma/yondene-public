import {getIdToken,GoogleAuthProvider,reauthenticateWithPopup} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js';
import {getDocFromServer,getDocsFromServer,query,limit,orderBy,where,Timestamp} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';
import {FOREST_MODEL,FOREST_WORKER_URL} from './forest-ai-config.mjs';
import {FOREST_CHARACTER_REGISTRY,FOREST_ROSTER_REVISION} from './forest-character-registry.mjs';
import {mountBookForest,getForestAvatar,setForestAvatar} from './book-forest.mjs';
import {authorizeForestDrive,loadPrivateForestSprites} from './book-forest-drive.mjs';
import {saveCachedForestSprites,loadCachedForestSprites,clearCachedForestSprites} from './book-forest-cache.mjs';
import {loadPrivateForestDialogue} from './book-forest-private-dialogue.mjs';
import {saveCachedForestDialogue,loadCachedForestDialogue,clearCachedForestDialogue,freshForestDialogue} from './book-forest-dialogue-cache.mjs';
import {diagnoseForestCharacters} from './book-forest-character-profiles.mjs';
import {createForestLiveDialogueDirector} from './book-forest-live-dialogue.mjs';
import {selectRecentForestReflectionEntries,normalizeRecentForestReflection} from './book-forest-reflection-source.mjs';
import {forestConversationLog} from './book-forest-conversation-log.mjs';
import {createForestCloudflareGenerator,verifyForestCloudflareRoster} from './book-forest-cloudflare-provider.mjs';

export function createForestAccess({getUser,getFamilyId,isOwner,getBooks,familyDoc,familyCollection,
  notice,statusError,appBuild}){
  let closeForest=null,forestSpriteCache=null,forestDialogueCache=null;
  function close(){
    closeForest?.();closeForest=null;
    forestSpriteCache?.dispose();forestSpriteCache=null;forestDialogueCache=null;
  }
  async function clearPrivateData({ownerUid,familyId}){
    const removals=await Promise.allSettled([clearCachedForestSprites(),clearCachedForestDialogue()]);
    if(removals.some(result=>result.status==='rejected'))console.warn('Could not clear private forest caches');
    if(!ownerUid||!familyId)return;
    const scope=ownerUid+':'+familyId;
    try{
      localStorage.removeItem('yondene-forest-dialogue-state-v1:'+scope);
      for(const version of [1,2]){
        for(const suffix of ['budget','log','review-reactions','daily'])
          localStorage.removeItem('yondene-forest-ai-local-v'+version+':'+scope+':'+suffix);
      }
    }catch{}
  }
  function mountControls(forestArea){
    const forestDescription=document.createElement('p');
    forestDescription.textContent='小さな森を歩いて、登場人物に会いに行こう。画像と会話資料は非公開Google Driveから読み込み、この端末に保存します。人物設定を編集したら「人物設定・会話を更新」で反映できます。';
    forestArea.append(forestDescription);
    const avatarLabel=document.createElement('label');avatarLabel.className='forestAvatarChoice';
    avatarLabel.append('いっしょに歩く ');
    const avatarSelect=document.createElement('select');avatarSelect.setAttribute('aria-label','本の森の主人公');
    for(const [value,label] of [['player_cat','ねこ'],['player_rabbit','うさぎ']]){
      const option=document.createElement('option');option.value=value;option.textContent=label;avatarSelect.append(option);
    }
    avatarSelect.value=getForestAvatar(getFamilyId());avatarSelect.onchange=()=>setForestAvatar(getFamilyId(),avatarSelect.value);
    avatarLabel.append(avatarSelect);forestArea.append(avatarLabel);
    const forestLaunch=document.createElement('button');forestLaunch.className='primary';
    forestLaunch.type='button';forestLaunch.textContent='本の森へ行く';
    forestLaunch.onclick=async()=>{
      if(!isOwner(getFamilyId(),getUser()?.uid)||closeForest)return;
      forestLaunch.disabled=true;forestLaunch.textContent='森を準備しています…';
      const familyId=getFamilyId(),user=getUser(),ownerUid=user.uid;
      try{
        // A newly registered NPC must not be hidden by an old on-device
        // sprite/persona cache. This runs once per owner/family per roster,
        // not on ordinary launches, and never changes Firestore.
        const rosterKey='yondene-forest-roster:'+ownerUid+':'+familyId;
        let rosterUpdated=false;
        try{rosterUpdated=localStorage.getItem(rosterKey)!==FOREST_ROSTER_REVISION}
        catch{rosterUpdated=true}
        if(rosterUpdated){
          await clearCachedForestSprites({uid:ownerUid,familyId});
          await clearCachedForestDialogue({uid:ownerUid,familyId});
          if(!isOwner(familyId,ownerUid))return;
          forestSpriteCache?.dispose();forestSpriteCache=null;
          forestDialogueCache=null;
          try{localStorage.setItem(rosterKey,FOREST_ROSTER_REVISION)}catch{}
        }
        let token='';
        if(!forestSpriteCache){
          try{
            const cached=await loadCachedForestSprites({uid:ownerUid,familyId});
            if(!isOwner(familyId,ownerUid)){cached?.dispose();return}
            forestSpriteCache=cached;
          }catch(error){console.warn('Private forest image cache unavailable',error)}
          if(!forestSpriteCache){
            forestLaunch.textContent='Google Driveへのアクセスを確認しています…';
            // A Drive popup is needed only if the private images are not on this device.
            token=await authorizeForestDrive({user,GoogleAuthProvider,reauthenticateWithPopup});
            forestLaunch.textContent='非公開の画像を読み込んでいます…';
            const loaded=await loadPrivateForestSprites(token,{
              onValidatedAssets:async(manifest,blobs)=>{
                if(!isOwner(familyId,ownerUid))return;
                try{
                  await saveCachedForestSprites({uid:ownerUid,familyId,manifest,blobs});
                  // Signing out during a slow cache write must not leave private
                  // artwork behind after the logout cleanup has run.
                  if(!isOwner(familyId,ownerUid)){
                    await clearCachedForestSprites({uid:ownerUid,familyId});
                  }
                }
                catch(error){console.warn('Could not cache private forest images',error)}
              }
            });
            if(!isOwner(familyId,ownerUid)){loaded.dispose();return}
            forestSpriteCache=loaded;
          }
        }
        if(!freshForestDialogue(forestDialogueCache)){
          forestDialogueCache=null;
          try{
            const cached=await loadCachedForestDialogue({uid:ownerUid,familyId});
            if(!isOwner(familyId,ownerUid))return;
            forestDialogueCache=cached;
            if(!forestDialogueCache){
              forestLaunch.textContent='非公開の人物設定・物語記憶を読み込んでいます…';
              if(!token)token=await authorizeForestDrive({user,GoogleAuthProvider,reauthenticateWithPopup});
              const loaded=await loadPrivateForestDialogue(token);
              if(!isOwner(familyId,ownerUid))return;
              forestDialogueCache=loaded;
              try{
                await saveCachedForestDialogue({uid:ownerUid,familyId,packageData:loaded});
                if(!isOwner(familyId,ownerUid)){
                  await clearCachedForestDialogue({uid:ownerUid,familyId});
                }
              }
              catch(error){console.warn('Private dialogue cache unavailable',error)}
            }
          }catch(error){
            // Unavailable Sheets data must not
            // prevent children from exploring the visual forest.
            console.warn('Forest dialogue data unavailable:',error);
            notice('本の森の会話データを読めませんでした。景色の探索は利用できます。会話の更新は「森の素材を更新」から行えます。');
          }
        }
        if(!isOwner(familyId,ownerUid)){
          return;
        }
        const canReadForest=()=>isOwner(familyId,ownerUid);
        let generate;let aiAvailable=false;
        try{
          await verifyForestCloudflareRoster({workerUrl:FOREST_WORKER_URL,expectedRevision:FOREST_ROSTER_REVISION});
          if(!canReadForest())return;
          generate=createForestCloudflareGenerator({workerUrl:FOREST_WORKER_URL,
            getIdToken:()=>canReadForest()?getIdToken(getUser()):Promise.reject(Error('Firebase login required'))});
          aiAvailable=true;
        }catch(error){
          console.warn('Forest AI connection unavailable',error?.message);
          notice('AI会話に接続できません。森の探索は利用できます。');
        }
        if(!canReadForest())return;
        const canReadBook=bookId=>canReadForest()&&getBooks()
          .some(book=>book.id===bookId&&book.status==='read');
        const getCurrentReflection=async(bookId,id)=>{
          if(!canReadBook(bookId)||!id)return null;
          const record=await getDocFromServer(familyDoc('books',bookId,'childReflections',id));
          return record.exists()&&canReadBook(bookId)
            ?normalizeRecentForestReflection({bookId},record.data(),{id:record.id}):null;
        };
        const getArchivedReflections=async(bookIds,before)=>{
          const results=await Promise.all(bookIds.filter(canReadBook).map(async bookId=>{
            const snapshot=await getDocsFromServer(query(familyCollection('books',bookId,'childReflections'),
              where('createdAt','<',Timestamp.fromMillis(before)),orderBy('createdAt','desc'),limit(3)));
            return canReadBook(bookId)?snapshot.docs.map(record=>
              normalizeRecentForestReflection({bookId},record.data(),{id:record.id})).filter(Boolean):[];
          }));
          return results.flat();
        };
        const getRecentReflections=async()=>{
          if(!canReadForest())return [];
          const snapshot=await getDocsFromServer(query(familyCollection('activity'),
            orderBy('createdAt','desc'),limit(60)));
          if(!canReadForest())return [];
          const selected=selectRecentForestReflectionEntries(snapshot.docs.map(item=>item.data()),getBooks());
          const recent=await Promise.all(selected.map(entry=>
            getCurrentReflection(entry.bookId,entry.sourceId).catch(()=>null)));
          return canReadForest()?recent.filter(Boolean):[];
        };
        const dialogue=createForestLiveDialogueDirector({generate,storage:localStorage,
          storageKey:'yondene-forest-ai-local-v2:'+ownerUid+':'+familyId,
          encounterKey:'yondene-forest-dialogue-state-v1:'+ownerUid+':'+familyId,
          getBooks:()=>canReadForest()?getBooks():[],
          getCatalog:()=>forestDialogueCache?.catalog||[],
          getTwinNames:()=>forestDialogueCache?.twinNames||[],
          getRecentReflections,getArchivedReflections,getCurrentReflection,
          getCharacterProfiles:()=>forestDialogueCache?.characterProfiles||[],
          modelId:FOREST_MODEL});
        const readiness=diagnoseForestCharacters({registry:FOREST_CHARACTER_REGISTRY,
          profiles:forestDialogueCache?.characterProfiles,images:forestSpriteCache?.images,aiAvailable});
        const missing=readiness.filter(item=>item.missing.length);
        if(missing.length){
          console.warn('Forest character readiness',missing);
          const labels={'sprite':'画像','character-profile':'人物像・口調','ai-connection':'AI接続'};
          notice('森の設定で不足：'+missing.map(item=>item.id+'（'+item.missing.map(key=>labels[key]).join('・')+'）').join('、'));
        }
        closeForest=mountBookForest({familyId,privateSprites:forestSpriteCache,
          dialogue,
          onClose:()=>{closeForest=null}});
      }catch(error){statusError(error)}
      finally{forestLaunch.disabled=false;forestLaunch.textContent='本の森へ行く'}
    };
    const forestRefresh=document.createElement('button');forestRefresh.className='forestRefresh';
    forestRefresh.type='button';forestRefresh.textContent='森の素材を更新';
    forestRefresh.onclick=async()=>{
      if(!isOwner(getFamilyId(),getUser()?.uid)||closeForest)return;
      forestRefresh.disabled=true;
      try{
        const identity={uid:getUser().uid,familyId:getFamilyId()};
        await clearCachedForestSprites(identity);
        await clearCachedForestDialogue(identity);
        if(!isOwner(identity.familyId,identity.uid))return;
        forestSpriteCache?.dispose();forestSpriteCache=null;
        forestDialogueCache=null;
        notice('保存済みの森の画像と人物設定・物語記憶を削除しました。次回は非公開Google Driveから最新版を読み込みます。');
      }catch(error){statusError(error)}
      finally{forestRefresh.disabled=false}
    };
    const profileRefresh=document.createElement('button');profileRefresh.type='button';
    profileRefresh.className='forestRefresh';profileRefresh.textContent='人物設定・会話を更新';
    profileRefresh.onclick=async()=>{
      if(!isOwner(getFamilyId(),getUser()?.uid)||closeForest)return;
      const user=getUser(),ownerUid=user.uid,familyId=getFamilyId();
      profileRefresh.disabled=true;forestLaunch.disabled=true;
      try{
        const token=await authorizeForestDrive({user,GoogleAuthProvider,reauthenticateWithPopup});
        const loaded=await loadPrivateForestDialogue(token);
        if(!isOwner(familyId,ownerUid))return;
        await saveCachedForestDialogue({uid:ownerUid,familyId,packageData:loaded});
        if(!isOwner(familyId,ownerUid)){
          await clearCachedForestDialogue({uid:ownerUid,familyId});return;
        }
        forestDialogueCache=loaded;
        notice('最新の人物設定・物語記憶を読み込みました。次の会話から反映します。');
      }catch(error){statusError(error)}
      finally{profileRefresh.disabled=false;forestLaunch.disabled=false}
    };
    forestArea.append(forestLaunch,profileRefresh,forestRefresh);
    const forestLog=document.createElement('button');forestLog.type='button';
    forestLog.className='forestRefresh';forestLog.textContent='会話ログを保存';
    forestLog.onclick=()=>{
      try{
        const entries=forestConversationLog({storage:localStorage,uid:getUser().uid,familyId:getFamilyId()});
        if(!entries.length){notice('保存されたAI会話ログはまだありません。');return}
        const report={schema:'yondene-forest-dialogue-log-v1',appBuild,exportedAt:new Date().toISOString(),entries};
        const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});
        const url=URL.createObjectURL(blob),link=document.createElement('a');
        link.href=url;link.download='yondene-forest-conversations-'+new Date().toISOString().slice(0,10)+'.json';
        document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
        notice('端末にAI会話ログを保存しました。必要ならこのJSONをチャットに添付してください。');
      }catch(error){statusError(error)}
    };
    forestArea.append(forestLog);
  }
  return {close,clearPrivateData,mountControls};
}
