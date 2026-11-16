// One-time cleanup of local forest conversation tests. The bookshelf,
// reflections, approved private dialogue scripts, and daily AI quota stay intact.
export function resetForestConversationHistoryOnce({storage,uid,familyId}={}){
  if(!storage||!uid||!familyId)return false;
  const suffix=`${uid}:${familyId}`;
  const marker=`yondene-forest-conversations-reset-20261110-v4:${suffix}`;
  if(storage.getItem(marker)==='done')return false;
  const keys=[
    `yondene-forest-dialogue-state-v1:${suffix}`,
    `yondene-forest-ai-local-v1:${suffix}:log`,
    `yondene-forest-ai-local-v2:${suffix}:log`
  ];
  for(const key of keys)storage.removeItem(key);
  storage.setItem(marker,'done');
  return true;
}
