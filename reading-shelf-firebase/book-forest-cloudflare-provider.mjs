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
      let reason='';
      try{reason=(await response.json())?.error||''}catch{}
      if(response.status===429&&reason==='AI quota reached')
        throw Error('Forest AI daily quota reached');
      throw Error('Forest AI unavailable ('+response.status+')');
    }
    const value=await response.json();
    if(!value||!Array.isArray(value.choices)||JSON.stringify(value).length>3000)
      throw Error('Invalid Forest AI response');
    return value;
  };
}
