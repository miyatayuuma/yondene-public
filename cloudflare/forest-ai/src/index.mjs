// よんでね 本の森: a small, owner-only proxy for the free Workers AI allowance.
// No bookshelf data, Firebase private credentials, or Cloudflare API keys here.
const MODEL='@cf/google/gemma-4-26b-a4b-it';
const JWKS_URL='https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const ORIGINS=new Set(['https://kodomo-reading-shelf-87f11.web.app',
  'https://kodomo-reading-shelf-87f11.firebaseapp.com']);
const NPCS=new Set(['king','kiki','jiji','skipper','zorori','ishishi','noshishi']);
let cachedKeys=null,keysExpireAt=0;

function json(data,status=200,origin=''){
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff','Vary':'Origin'};
  if(ORIGINS.has(origin)){
    headers['Access-Control-Allow-Origin']=origin;
    headers['Access-Control-Allow-Methods']='POST, OPTIONS';
    headers['Access-Control-Allow-Headers']='Authorization, Content-Type';
    headers['Access-Control-Max-Age']='600';
  }
  return new Response(status===204?null:JSON.stringify(data),{status,headers});
}

function decodedPart(segment){
  if(typeof segment!=='string'||!segment||!/^[\w-]+$/u.test(segment))throw Error('Bad JWT');
  const base64=segment.replace(/-/gu,'+').replace(/_/gu,'/');
  const binary=atob(base64.padEnd(Math.ceil(base64.length/4)*4,'='));
  return Uint8Array.from(binary,char=>char.charCodeAt(0));
}
function jwtJson(segment){return JSON.parse(new TextDecoder().decode(decodedPart(segment)))}

async function signingKeys(fetchImpl=fetch){
  if(cachedKeys&&Date.now()<keysExpireAt)return cachedKeys;
  const response=await fetchImpl(JWKS_URL,{headers:{Accept:'application/json'}});
  if(!response.ok)throw Error('Signing keys unavailable');
  const payload=await response.json();
  if(!Array.isArray(payload?.keys)||!payload.keys.length)throw Error('Invalid signing keys');
  const ttl=Number(/max-age=(\d+)/u.exec(response.headers.get('Cache-Control')||'')?.[1]||300);
  cachedKeys=payload.keys;
  keysExpireAt=Date.now()+Math.min(Math.max(ttl,60),3600)*1000;
  return cachedKeys;
}

export async function verifyOwnerIdToken(token,{projectId,ownerUid,keys=signingKeys,
  nowSeconds=()=>Math.floor(Date.now()/1000)}={}){
  if(!projectId||!ownerUid||typeof token!=='string'||token.length>8192)
    throw Error('Unauthenticated');
  const parts=token.split('.');
  if(parts.length!==3)throw Error('Unauthenticated');
  const header=jwtJson(parts[0]),claims=jwtJson(parts[1]),now=nowSeconds();
  if(header?.alg!=='RS256'||!header.kid||
    claims?.aud!==projectId||claims?.iss!==`https://securetoken.google.com/${projectId}`||
    claims?.sub!==ownerUid||!claims.sub||claims.sub.length>128||
    !Number.isFinite(claims.exp)||claims.exp<=now||
    !Number.isFinite(claims.iat)||claims.iat>now||
    !Number.isFinite(claims.auth_time)||claims.auth_time>now)
    throw Error('Unauthenticated');
  const candidates=await keys();
  const jwk=candidates.find(key=>key.kid===header.kid&&key.kty==='RSA'&&
    key.alg==='RS256'&&key.n&&key.e);
  if(!jwk)throw Error('Unauthenticated');
  const publicKey=await crypto.subtle.importKey('jwk',jwk,
    {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',publicKey,
    decodedPart(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
  if(!valid)throw Error('Unauthenticated');
  return claims.sub;
}

function validPrompt(prompt){
  return prompt&&typeof prompt==='object'&&!Array.isArray(prompt)&&
    typeof prompt.task==='string'&&prompt.task.length<100&&
    (prompt.mode===undefined||['choices','opening','reply'].includes(prompt.mode))&&
    (prompt.closing===undefined||typeof prompt.closing==='boolean')&&
    NPCS.has(prompt.npc?.id)&&typeof prompt.npc.voice==='string'&&
    prompt.npc.voice.length<=2500&&
    (prompt.npc.approvedExamples===undefined||(Array.isArray(prompt.npc.approvedExamples)&&
      prompt.npc.approvedExamples.length<=2&&prompt.npc.approvedExamples.every(line=>
        typeof line==='string'&&line.length<=100)))&&
    typeof prompt.context?.npcLine==='string'&&
    Array.isArray(prompt.context.recentTurns)&&prompt.context.recentTurns.length<=4&&
    Array.isArray(prompt.constraints)&&prompt.constraints.length<=12;
}
function readCompletion(result,{closing=false}={}){
  let content=result?.choices?.[0]?.message?.content??result?.response;
  if(typeof content!=='string'||content.length>3000)throw Error('Invalid model output');
  content=content.trim().replace(/^```(?:json)?\s*/iu,'').replace(/\s*```$/u,'');
  const parsed=JSON.parse(content);
  if(closing){
    if(typeof parsed?.text!=='string'||parsed.text.length>90)throw Error('Invalid closing line');
    return {text:parsed.text,choices:[]};
  }
  if(!Array.isArray(parsed?.choices)||parsed.choices.length<2||parsed.choices.length>3)
    throw Error('Invalid model output');
  const choices=parsed.choices.map(choice=>typeof choice==='string'?choice:choice?.label);
  if(choices.some(choice=>typeof choice!=='string'||choice.length<2||choice.length>24))
    throw Error('Invalid model choices');
  if(parsed.text!==undefined&&(typeof parsed.text!=='string'||parsed.text.length>90))
    throw Error('Invalid model text');
  // Gemma may supply a third button despite the requested two. Keep its valid
  // NPC line and normalize the UI-only choices instead of discarding the turn.
  return {choices:choices.slice(0,2),...(typeof parsed.text==='string'?{text:parsed.text}:{})};
}

export async function handleRequest(request,env,{verifyToken=verifyOwnerIdToken}={}){
  const origin=request.headers.get('Origin')||'';
  const url=new URL(request.url);
  if(request.method==='GET'&&url.pathname==='/health')
    return json({model:MODEL,configured:Boolean(env.OWNER_UID&&env.AI)},200,origin);
  if(!ORIGINS.has(origin))return json({error:'Origin not allowed'},403);
  if(request.method==='OPTIONS')return json({},204,origin);
  if(url.pathname!=='/dialogue'||request.method!=='POST')return json({error:'Not found'},404,origin);
  if(!env.AI||!env.OWNER_UID||env.FIREBASE_PROJECT_ID!=='kodomo-reading-shelf-87f11')
    return json({error:'Not configured'},503,origin);
  const authorization=request.headers.get('Authorization')||'';
  if(!authorization.startsWith('Bearer '))return json({error:'Unauthorized'},401,origin);
  try{
    await verifyToken(authorization.slice(7),{projectId:env.FIREBASE_PROJECT_ID,ownerUid:env.OWNER_UID});
  }catch{return json({error:'Unauthorized'},401,origin)}
  if(!/^application\/json\b/iu.test(request.headers.get('Content-Type')||'')||
    Number(request.headers.get('Content-Length')||0)>12000)
    return json({error:'Bad request'},400,origin);
  let body;
  try{
    const payload=await request.text();
    if(payload.length>8000)return json({error:'Request too large'},413,origin);
    body=JSON.parse(payload);
  }catch{return json({error:'Bad JSON'},400,origin)}
  if(!validPrompt(body?.prompt))return json({error:'Invalid prompt'},400,origin);
  try{
    const result=await env.AI.run(MODEL,{
      messages:[{role:'system',content:
        'あなたは児童向け「本の森」で登場人物の短い即興会話を助ける。'+
        '子どもの個人情報を質問しない。物語にない出来事を断定しない。'+
        '日本語で自然に短く話す。人物設定と承認済み台詞例から本人の声を守り、説明文を書かない。'+
        '今日のsceneは森の即興の小さな出来事であり原作の事実ではない。'+
        '別のNPCの会話内容を聞いたふりをせず、選択肢を子どもの信念とみなさない。'+
        '必ずJSONオブジェクトだけを返す。mode=choicesならtextを省略し、choicesを2件、各16字以内。'+
        'mode=openingなら承認済み台詞のコピーはせず、今日のsceneに合う短い本人の台詞textとchoicesを2件作る。'+
        'mode=replyならNPC本人のひと言textを65字以内で返す。'+
        'closing=trueなら新たな質問をせず、choicesは空配列とする。'},
        {role:'user',content:JSON.stringify(body.prompt)}],
      max_completion_tokens:320,temperature:.75,
      chat_template_kwargs:{enable_thinking:false}
    });
    return json(readCompletion(result,{closing:body.prompt.closing===true}),200,origin);
  }catch(error){
    const message=String(error?.message||'');
    const depleted=/3036|daily free allocation|quota|used up|neurons.*exceed/iu.test(message);
    const temporary=error?.status===429||/rate limit|capacity temporarily|out of capacity/iu.test(message);
    return json({error:depleted?'AI quota reached':temporary?'AI temporarily busy':'AI unavailable'},
      depleted||temporary?429:502,origin);
  }
}

export default {fetch:handleRequest};
