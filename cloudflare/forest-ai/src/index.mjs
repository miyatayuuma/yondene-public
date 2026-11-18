import {unsafeForestForaging} from '../../../reading-shelf-firebase/book-forest-output-safety.mjs';
import {FOREST_AI_GENERATION_IDS,FOREST_ACTION_WRITING_IDS,FOREST_MULTI_SPEAKER_IDS,FOREST_ROSTER_REVISION,FOREST_DIALOGUE_PROTOCOL,canonicalForestMention} from '../../../reading-shelf-firebase/forest-character-registry.mjs';
import {validateForestWrittenTurn,FOREST_WRITTEN_TURN_LIMIT} from '../../../reading-shelf-firebase/book-forest-gesture.mjs';
import {validateTwinTurns} from '../../../reading-shelf-firebase/book-forest-twins.mjs';
// よんでね 本の森: a small, owner-only proxy for the free Workers AI allowance.
// No bookshelf data, Firebase private credentials, or Cloudflare API keys here.
const MODEL='@cf/google/gemma-4-26b-a4b-it';
export const FOREST_WORKER_VERSION='forest-dialogue-v25-profile2';
const VERSION=FOREST_WORKER_VERSION;
const JWKS_URL='https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const ORIGINS=new Set(['https://kodomo-reading-shelf-87f11.web.app',
  'https://kodomo-reading-shelf-87f11.firebaseapp.com']);
const NPCS=new Set(FOREST_AI_GENERATION_IDS);
const ACTION_WRITING_IDS=new Set(FOREST_ACTION_WRITING_IDS);
const MULTI_SPEAKER=new Set(FOREST_MULTI_SPEAKER_IDS);
function validSpeakers(speakers){
  return Array.isArray(speakers)&&speakers.length===2&&speakers.every((speaker,i)=>
    speaker?.slot===i+1&&typeof speaker.name==='string'&&
    /^[^「」『』<>\r\n{}]{1,12}$/u.test(speaker.name.trim()))&&
    speakers[0].name.trim()!==speakers[1].name.trim();
}
let cachedKeys=null,keysExpireAt=0;

function json(data,status=200,origin=''){
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
    'X-Forest-AI-Version':VERSION,
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
    prompt.npc.voice.length>0&&prompt.npc.voice.length<=6000&&
    prompt.npc.profileSchemaVersion===2&&/^profile2-[a-f0-9]{16}$/u.test(prompt.npc.profileRevision)&&
    typeof prompt.npc.profileVersion==='string'&&prompt.npc.profileVersion.length<=80&&
    (prompt.npc.approvedExamples===undefined||(Array.isArray(prompt.npc.approvedExamples)&&
      prompt.npc.approvedExamples.length<=2&&prompt.npc.approvedExamples.every(line=>
        typeof line==='string'&&line.length<=100)))&&
    typeof prompt.context?.npcLine==='string'&&
    (!MULTI_SPEAKER.has(prompt.npc.id)||prompt.mode!=='choices'&&validSpeakers(prompt.context.speakers))&&
    Array.isArray(prompt.context.recentTurns)&&prompt.context.recentTurns.length<=4&&
    Array.isArray(prompt.constraints)&&prompt.constraints.length<=12&&
    prompt.constraints.every(item=>typeof item==='string'&&item.length<=500);
}
export function readCompletion(result,{closing=false,mode='reply',characterId='',context={}}={}){
  let content=result?.choices?.[0]?.message?.content??result?.response;
  if(typeof content!=='string'||content.length>3000)throw Error('Invalid model output');
  content=content.trim().replace(/^```(?:json)?\s*/iu,'').replace(/\s*```$/u,'');
  let parsed;
  try{parsed=JSON.parse(content)}catch{throw Error('Invalid model JSON')}
  if(unsafeForestForaging(parsed,context))throw Error('Invalid model unsafe-foraging');
  const multi=MULTI_SPEAKER.has(characterId);
  const validatedTurns=multi?validateTwinTurns(parsed?.turns):null;
  const turns=validatedTurns?.map(turn=>({...turn,text:canonicalForestMention(turn.text,context.speakers)}));
  if(multi&&!turns)throw Error('Invalid model speaker turns');
  if(turns&&closing)return {turns,choices:[]};
  const silent=ACTION_WRITING_IDS.has(characterId);
  const written=silent?validateForestWrittenTurn(parsed?.text,parsed?.delivery):null;
  if(silent&&!written)throw Error('Invalid silent cat action');
  const text=written?.text??canonicalForestMention(parsed?.text,context.speakers);
  if(closing){
    if(typeof parsed?.text!=='string'||parsed.text.length>90)throw Error('Invalid closing line');
    return {text,choices:[],...(written?{delivery:written.delivery}:{})};
  }
  if(!Array.isArray(parsed?.choices)||parsed.choices.length<2||parsed.choices.length>3)
    throw Error('Invalid model output');
  const choices=parsed.choices.map(choice=>canonicalForestMention(typeof choice==='string'?choice:choice?.label,context.speakers));
  if(choices.some(choice=>typeof choice!=='string'||choice.length<2||choice.length>24))
    throw Error('Invalid model choices');
  if(!multi&&mode==='opening'&&(typeof parsed.text!=='string'||!parsed.text.trim()))
    throw Error('Opening line required');
  if(parsed.text!==undefined&&(typeof parsed.text!=='string'||parsed.text.length>90))
    throw Error('Invalid model text');
  // Gemma may supply a third button despite the requested two. Keep its valid
  // NPC line and normalize the UI-only choices instead of discarding the turn.
  return {choices:choices.slice(0,2),...(turns?{turns}:typeof text==='string'?{text}:{}),
    ...(written?{delivery:written.delivery}:{})};
}

export function forestGenerationInput(prompt){
  const actionWriting=ACTION_WRITING_IDS.has(prompt.npc.id);
  const multi=MULTI_SPEAKER.has(prompt.npc.id);
  return {messages:[{role:'system',content:
        'あなたは児童向け「本の森」で登場人物の短い即興会話を助ける。'+
        '子どもの個人情報を質問しない。物語にない出来事を断定しない。'+
        '日本語で人物らしい短い会話を作る。'+
        (actionWriting?
          `このNPCの会話は、声や心の声を使わず、相手へ文字で伝える。通常は {"delivery":"written","text":"王さまなら 木の下にいるよ。"} の形で、相手が実際に読める文を返す。人物設定の身振りや筆記の記述は人物像の資料。会話は書く動作・道具の話から始めず、本人の関心や今の話題を伝える。質問には答え、感想には内容を受けた返事を書く。textは${FOREST_WRITTEN_TURN_LIMIT}字以内、ひらがな・カタカナ・小1配当漢字・句読点・空白。見守りや相づちなど、動作で伝わる返事に限りdelivery:"gesture"でtextに（うなずく）のような動作だけを入れる。`:'')+
        '生成する発話と選択肢の人名は、IDから推測せずcontext.npcDisplayNamesまたはcontext.speakersの表示名を使う。'+
        '人物像はnpc.voiceの非公開台帳由来の設定に従い、設定を説明するだけの文にしない。出力の書式はこの指示に従う。'+
        '各項目の根拠区分・監修状態・適用範囲と本文中の留保を守る。二次資料は原作本文ではない。'+
        '編集解釈・ゲーム演出・暫定採用は演技の手掛かりであり、原作の確定事実として語らない。'+
        'situationのplaceが今いる場所、presentNpcIdsが同席を確認できる人物。relatedNpcIdsは関係性で、今そばにいる証拠ではない。'+
        '今日のsceneはevidence=reviewedなら読了済み原作の承認済み事実を含み、evidence=imaginedなら森の即興の出来事。'+
        '原作の記憶は過去の物語であり、今日この森で起きた事実に置き換えない。森での想像や提案は区別する。'+
        '知らない木の実・きのこ・植物の食用性を断定せず、味見や摂取を選択肢にしない。安全な食事や食欲は表現してよい。見知らぬ実の場面では、見る・調べる・そのままにするなど次の行動を出す。'+
        'readerReflectionがある場合は本の感想を受け止め、別作品の人物なら第三者の立場で反応する。'+
        '原作に登場した・直接目撃したと偽らず、本人の気持ちを勝手に決めつけない。'+
        '保護者による要約を子どもの直接の発言として扱わず、感想の追記を要求しない。'+
        '別のNPCの会話内容を聞いたふりをせず、選択肢を子どもの信念とみなさない。'+
        '必ずJSONオブジェクトだけを返す。mode=choicesならtextを省略し、choicesを2件、各16字以内。'+
        'mode=openingならcontext.sourceKind（meet/story/reflection/relay/ambient/review-reaction）とtaskを優先し、'+
        '台帳のnpcLineをコピーせず、本人の新しい反応とchoicesを2件作る。'+
        'mode=replyは新しい第一声ではなく直前の選択への応答。問いには短く答える。相づちや感想なら同意を言い換えず、人物らしい小さな反応で会話を一歩進める。'+
        'NPCのtextは65字以内。'+
        (multi?
          '出力はturns:[{speakerSlot:1,text:"..."},{speakerSlot:2,text:"..."}]とchoices。各スロットを一度ずつ、順番は会話に合わせる。'+
          '名前はcontext.speakersで固定し、初対面では各自が自分の名前を名乗る。'+
          '二人目は一人目の言葉に反応する。発話に話者ラベルやかぎ括弧を付けず、各65字以内。子どもへの問いかけは二人目まで待つ。':'')+
        '現在の場面はsituation.placeに留める。森の小さな即興は目の前で起こることから選ぶ。移動や合流を済ませたふりはせず、よその場所は想像や思い出として話す。'+
        '選択肢は今の話への子どもの言葉や行動を2つ。context.repliesLeftは選択後に返答できる回数。'+
        '残り1回なら、候補ごとに次の一答で渡せる答えや反応を考えてから、ラベルだけを返す。共同作業なら、その場で一手進んで区切れるものにする。探しに出発したり別の人に会ったりする必要がある約束を選択肢にしない。'+
        'closing=trueではcontext.chosenLabelに具体的に応え、選択に応じた答え、反応、結果のいずれかをここで返す。親しみのある短いひとことや静かな余韻でもよい。新しい質問や次の行動を要求せず、choicesは空配列。'},
        {role:'user',content:JSON.stringify(prompt)}],
      max_completion_tokens:320,temperature:.75,
      chat_template_kwargs:{enable_thinking:false}};
}

export async function handleRequest(request,env,{verifyToken=verifyOwnerIdToken}={}){
  const origin=request.headers.get('Origin')||'';
  const url=new URL(request.url);
  if(request.method==='GET'&&url.pathname==='/health')
    return json({model:MODEL,version:VERSION,
      registryRevision:FOREST_ROSTER_REVISION,protocolRevision:FOREST_DIALOGUE_PROTOCOL,
      supportedNpcCount:NPCS.size,configured:Boolean(env.OWNER_UID&&env.AI)},200,origin);
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
    Number(request.headers.get('Content-Length')||0)>48000)
    return json({error:'Bad request'},400,origin);
  let body;
  try{
    const payload=await request.text();
    if(payload.length>16000)return json({error:'Request too large'},413,origin);
    body=JSON.parse(payload);
  }catch{return json({error:'Bad JSON'},400,origin)}
  if(!validPrompt(body?.prompt))return json({error:'Invalid prompt'},400,origin);
  try{
    const result=await env.AI.run(MODEL,forestGenerationInput(body.prompt));
    return json({...readCompletion(result,{closing:body.prompt.closing===true,
      mode:body.prompt.mode||'reply',characterId:body.prompt.npc.id,context:body.prompt.context}),
      profileRevision:body.prompt.npc.profileRevision},200,origin);
  }catch(error){
    const message=String(error?.message||'');
    const depleted=/3036|daily free allocation|quota|used up|neurons.*exceed/iu.test(message);
    const temporary=error?.status===429||/rate limit|capacity temporarily|out of capacity/iu.test(message);
    // Only fixed diagnostic categories cross the trust boundary; never expose
    // raw model output, prompts, exceptions, user data or authentication tokens.
    const code=message==='Invalid model JSON'?'model-json':
      /^(?:Invalid (?:model|silent|closing)|Opening line required)/u.test(message)?'output-validation':null;
    return json({error:depleted?'AI quota reached':temporary?'AI temporarily busy':'AI unavailable',
      ...(!depleted&&!temporary&&code?{code}:{})},depleted||temporary?429:502,origin);
  }
}

export default {fetch:handleRequest};
