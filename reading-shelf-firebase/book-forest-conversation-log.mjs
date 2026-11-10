// Browser-only diagnostic export. No household identifier or Firestore records
// leave the device, and opening/exporting the log never contacts an AI model.
export function forestConversationLog({storage,uid,familyId}={}){
  if(!storage||!uid||!familyId)return [];
  const suffix=`${uid}:${familyId}`,events=[];
  for(const version of ['v1','v2']){
    let rows=[];
    try{rows=JSON.parse(storage.getItem(`yondene-forest-ai-local-${version}:${suffix}:log`)||'[]')}
    catch{continue}
    if(!Array.isArray(rows))continue;
    for(const item of rows.slice(-300)){
      if(!item||typeof item!=='object'||typeof item.event!=='string')continue;
      const safe={event:item.event.slice(0,40),at:Number(item.at)||0};
      for(const key of ['characterId','mode','promptVersion','sourceKind','modelId']){
        if(typeof item[key]==='string')safe[key]=item[key].slice(0,80);
      }
      for(const key of ['text','label']){
        if(typeof item[key]==='string')safe[key]=item[key].slice(0,200);
      }
      if(Array.isArray(item.choices))safe.choices=item.choices.slice(0,3)
        .filter(x=>typeof x==='string').map(x=>x.slice(0,50));
      for(const key of ['elapsedMs','turn'])if(Number.isFinite(item[key]))safe[key]=item[key];
      if(typeof item.closing==='boolean')safe.closing=item.closing;
      events.push(safe);
    }
  }
  return events.sort((a,b)=>a.at-b.at).slice(-300);
}
