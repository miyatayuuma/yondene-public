// The user's Firebase ID token authenticates calls to the separately deployed
// Cloudflare Worker. Never embed a Cloudflare API token in a web application.
export function createForestCloudflareGenerator({workerUrl,getIdToken,
  fetchImpl=globalThis.fetch}={}){
  let endpoint;
  try{endpoint=new URL('/dialogue',workerUrl)}catch{throw Error('Cloudflare Worker URL is required')}
  if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||
    !/^https:\/\//u.test(workerUrl)||typeof getIdToken!=='function'||
    typeof fetchImpl!=='function')throw Error('Cloudflare Worker configuration is invalid');
  return async prompt=>{
    const token=await getIdToken();
    if(typeof token!=='string'||token.length<20)throw Error('Firebase login is required');
    const response=await fetchImpl(endpoint.href,{
      method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
      body:JSON.stringify({prompt}),cache:'no-store'
    });
    if(!response.ok)throw Error('Forest AI unavailable ('+response.status+')');
    const value=await response.json();
    if(!value||!Array.isArray(value.choices)||JSON.stringify(value).length>3000)
      throw Error('Invalid Forest AI response');
    return value;
  };
}
