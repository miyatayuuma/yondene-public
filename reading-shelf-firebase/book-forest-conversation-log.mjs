// Browser-only diagnostic export. No household identifier or Firestore records
// leave the device, and opening/exporting the log never contacts an AI model.
// A fixed allowlist prevents arbitrary exception strings or user text from
// leaking through an otherwise useful diagnostic export.
const SAFE_REASONS=new Set(['model-json','output-validation','response-json',
  'invalid-response','authentication','network','quota','timeout','cancelled',
  'request-error','missing-character-profile','generation-unavailable',
  'relay-generation-unavailable']);
const safeReason=value=>typeof value==='string'&&
  (SAFE_REASONS.has(value)||/^worker-http-(?:4\\d{2}|5\\d{2})$/u.test(value));

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
      if(safeReason(item.reason))safe.reason=item.reason;
      if(typeof item.protocolRevision==='string'&&/^[A-Za-z0-9._-]{1,64}$/u.test(item.protocolRevision))
        safe.protocolRevision=item.protocolRevision;
      for(const key of ['elapsedMs','turn'])if(Number.isFinite(item[key]))safe[key]=item[key];
      if(typeof item.closing==='boolean')safe.closing=item.closing;
      events.push(safe);
    }
  }
  return events.sort((a,b)=>a.at-b.at).slice(-300);
}
