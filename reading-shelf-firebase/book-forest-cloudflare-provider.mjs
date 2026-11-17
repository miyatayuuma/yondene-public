import {FOREST_DIALOGUE_PROTOCOL} from './forest-character-registry.mjs';
// The user's Firebase ID token authenticates calls to the separately deployed
// Cloudflare Worker. Never embed a Cloudflare API token in a web application.
export function createForestCloudflareGenerator({workerUrl,getIdToken,
  fetchImpl=globalThis.fetch}={}){
  let endpoint;
  try{endpoint=new URL('/dialogue',workerUrl)}catch{throw Error('Cloudflare Worker URL is required')}
  if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||
    !/^https:\/\//u.test(workerUrl)||typeof getIdToken!=='function'||
    typeof fetchImpl!=='function')throw Error('Cloudflare Worker configuration is invalid');
  return async (prompt,{signal}={})=>{
    if(signal?.aborted)throw Error('Forest AI request cancelled');
    const token=await getIdToken();
    // Authentication can be slow on mobile; do not send a request if the child
    // has already closed the conversation while waiting for its ID token.
    if(signal?.aborted)throw Error('Forest AI request cancelled');
    if(typeof token!=='string'||token.length<20)throw Error('Firebase login is required');
    const response=await fetchImpl(endpoint.href,{
      method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
      body:JSON.stringify({prompt}),cache:'no-store',signal
    });
    if(!response.ok){
      let reason='',code='';
      try{const failure=await response.json();reason=failure?.error||'';
        code=failure?.code||''}catch{}
      if(response.status===429&&reason==='AI quota reached')
        throw Error('Forest AI daily quota reached');
      // Ignore anything except a small fixed set of worker diagnostic codes.
      if(response.status===502&&['model-json','output-validation'].includes(code))
        throw Error('Forest AI diagnostic '+code);
      throw Error('Forest AI unavailable ('+response.status+')');
    }
    let value;
    try{value=await response.json()}catch{throw Error('Invalid Forest AI JSON')}
    if(!value||!Array.isArray(value.choices)||JSON.stringify(value).length>3000)
      throw Error('Invalid Forest AI response');
    return value;
  };
}

/** Fail early on a separately deployed Worker that still has the old NPC set.
 * Health is public and transmits no reader, household or Firebase credentials.
 */
export async function verifyForestCloudflareRoster({workerUrl,expectedRevision,expectedProtocol=FOREST_DIALOGUE_PROTOCOL,
  fetchImpl=globalThis.fetch}={}){
  let endpoint;
  try{endpoint=new URL('/health',workerUrl)}catch{throw Error('Forest AI worker URL invalid')}
  if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||
    typeof expectedRevision!=='string'||!expectedRevision||
    typeof fetchImpl!=='function')throw Error('Forest AI worker configuration invalid');
  const response=await fetchImpl(endpoint.href,{cache:'no-store'});
  if(!response.ok)throw Error('Forest AI health unavailable ('+response.status+')');
  let health;
  try{health=await response.json()}catch{throw Error('Forest AI health invalid')}
  if(health?.configured!==true||health.registryRevision!==expectedRevision||health.protocolRevision!==expectedProtocol)
    throw Error('Forest AI roster mismatch: deploy the current Cloudflare Worker');
  return {version:String(health.version||''),supportedNpcCount:Number(health.supportedNpcCount)||0};
}
