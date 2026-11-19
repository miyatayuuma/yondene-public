import {forestEndingChoices,forestEndingNeedsReply,forestUnsupportedAction,forestMisattributesReviewTitle} from '../../../reading-shelf-firebase/book-forest-ending.mjs';
import {unsafeForestForaging} from '../../../reading-shelf-firebase/book-forest-output-safety.mjs';
import {FOREST_AI_GENERATION_IDS,FOREST_ACTION_WRITING_IDS,FOREST_MULTI_SPEAKER_IDS,FOREST_ROSTER_REVISION,FOREST_DIALOGUE_PROTOCOL,canonicalForestMention} from '../../../reading-shelf-firebase/forest-character-registry.mjs';
import {validateForestWrittenTurn} from '../../../reading-shelf-firebase/book-forest-gesture.mjs';
import {validateTwinTurns} from '../../../reading-shelf-firebase/book-forest-twins.mjs';
// よんでね 本の森: a small, owner-only proxy for the free Workers AI allowance.
// No bookshelf data, Firebase private credentials, or Cloudflare API keys here.
const MODEL='@cf/google/gemma-4-26b-a4b-it';
export const FOREST_WORKER_VERSION='forest-dialogue-v36-profile2';
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
    (prompt.context.relayMessage===undefined||typeof prompt.context.relayMessage==='string'&&
      prompt.context.relayMessage.length<=150)&&
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
  const multi=MULTI_SPEAKER.has(characterId);
  const validatedTurns=multi?validateTwinTurns(parsed?.turns):null;
  const turns=validatedTurns?.map(turn=>({...turn,text:canonicalForestMention(turn.text,context.speakers)}));
  if(multi&&!turns)throw Error('Invalid model speaker turns');
  const silent=ACTION_WRITING_IDS.has(characterId);
  const written=silent?validateForestWrittenTurn(parsed?.text,parsed?.delivery):null;
  if(silent&&!written)throw Error('Invalid silent cat action');
  if(silent&&context.handoffTo&&written.delivery!=='written')throw Error('Invalid silent relay message');
  const lastChoices=!closing&&context.repliesLeft===1;
  const safetyInput=written?{...parsed,text:written.text}:parsed;
  const lines=turns?turns.map(turn=>turn.text):[safetyInput?.text];
  if(lines.some(line=>forestUnsupportedAction(line,context)||forestMisattributesReviewTitle(line,context)))
    throw Error('Invalid model dialogue context');
  if(unsafeForestForaging(lastChoices?{...safetyInput,choices:[]}:safetyInput,context))
    throw Error('Invalid model unsafe-foraging');
  if(turns&&closing)return {turns,choices:[]};
  const text=written?.text??canonicalForestMention(parsed?.text,context.speakers);
  if(closing){
    if(!written&&(typeof parsed?.text!=='string'||parsed.text.length>90))throw Error('Invalid closing line');
    return {text,choices:[],...(written?{delivery:written.delivery}:{})};
  }
  if(!multi&&mode==='opening'&&(typeof parsed.text!=='string'||!parsed.text.trim()))
    throw Error('Opening line required');
  if(!written&&parsed.text!==undefined&&(typeof parsed.text!=='string'||parsed.text.length>90))
    throw Error('Invalid model text');
  const line=turns?{turns}:{...(typeof text==='string'?{text}:{}),...(written?{delivery:written.delivery}:{})};
  if(lastChoices){
    const choices=forestEndingChoices(parsed.choices,{context,silent,multi,
      line:turns?.map(turn=>turn.text).join(' ')??text});
    if(!choices.length&&forestEndingNeedsReply(turns?.at(-1)?.text??text))throw Error('Invalid model unfinished ending');
    return {...line,choices};
  }
  if(!Array.isArray(parsed?.choices)||parsed.choices.length<2||parsed.choices.length>3)
    throw Error('Invalid model output');
  const choices=parsed.choices.map(choice=>canonicalForestMention(typeof choice==='string'?choice:choice?.label,context.speakers));
  if(choices.some(choice=>typeof choice!=='string'||choice.length<2||choice.length>24))
    throw Error('Invalid model choices');
  return {...line,choices:choices.filter(label=>!forestUnsupportedAction(label,context)&&
    !forestMisattributesReviewTitle(label,context)).slice(0,2)};
}

export function forestGenerationInput(prompt){
  const actionWriting=ACTION_WRITING_IDS.has(prompt.npc.id);
  const multi=MULTI_SPEAKER.has(prompt.npc.id);
  const lastChoices=prompt.context.repliesLeft===1;
  return {messages:[{role:'system',content:
        'あなたは児童向け「本の森」で登場人物の短い即興会話を助ける。'+
        '子どもの個人情報を質問しない。物語にない出来事を断定しない。'+
        '日本語で人物らしい短い会話を作る。'+
        (actionWriting?
          'このNPCは声や心の声を使わず、ふつうは文字で会話する。{"delivery":"written","text":"雨がふったら 木の下で休もう。"}。textは相手へのメッセージ本文だけ。かっこ書き、文字を書く場面、書く場所や道具は要らない。人物資料の「身振り」「筆記」は人物像の参考。書く言葉の内容は他の人物と同じように考え、本文と最後のoutcomeでは、ひらがなや小学1年生で習う漢字をできるだけ使い、自然に伝わる言葉を選ぶ。ひと目で意味が分かる身振りだけのときはdelivery:"gesture"、textは（うなずく）のような動きだけ。':'')+
        '生成する発話と選択肢の人名は、IDから推測せずcontext.npcDisplayNamesまたはcontext.speakersの表示名を使う。'+
        '人物像はnpc.voiceの非公開台帳由来の設定に従い、設定を説明するだけの文にしない。出力の書式はこの指示に従う。'+
        '各項目の根拠区分・監修状態・適用範囲と本文中の留保を守る。二次資料は原作本文ではない。'+
        '編集解釈・ゲーム演出・暫定採用は演技の手掛かりであり、原作の確定事実として語らない。'+
        'situation.placeが現在地。presentNpcIdsにいない人物の現在の場所・予定・様子は不明なので、断定しない。'+
        '今日のsceneはevidence=reviewedなら読了済み原作の承認済み事実を含み、evidence=imaginedなら森の即興の出来事。'+
        '原作の記憶では登場人物が当時したことを話す。子どもは本の読者。原作の続きを今の予定にせず、今に重ねるときは「もし」と分かる形で話す。'+
        '知らない木の実・きのこ・植物の食用性を断定せず、味見や摂取を選択肢にしない。安全な食事や食欲は表現してよい。見知らぬ実なら、食べないようはっきり伝える。選択肢は色や形についての言葉。「おいしそう」「どんな味？」は使わない。'+
        (prompt.context.readerReflection?
          'readerReflection.bookTitleは書誌上の書名。quoteは読者の感想で、その中のかぎ括弧や仮の名前も感想の一部。書名に使うのはbookTitleだけ。題名を復唱せず、感想の具体的なところに、その人らしく反応する。別作品なら第三者の立場で話す。':'')+
        '原作に登場した・直接目撃したと偽らず、本人の気持ちを勝手に決めつけない。'+
        '保護者による要約を子どもの直接の発言として扱わず、感想の追記を要求しない。'+
        '別のNPCの会話内容を聞いたふりをせず、選択肢を子どもの信念とみなさない。'+
        'relayMessageは子どもが今ここで届けた言葉。内容の一点に、その人物ならではの返事をする。返伝を引き受けない。アプリが用意する伝言ボタン以外で伝言を頼まない。'+
        (prompt.context.handoffTo?
          '今の選択で子どもが伝言を預かる。textは届ける本人の言葉だけ。例「風の音が城の門みたいだったぞ。」。宛先や「会ったら伝えて」のような指示は画面上の選択で済んでいる。':'')+
        '必ずJSONオブジェクトだけを返す。mode=choicesならtextを省略し、choicesを2件、各16字以内。'+
        'mode=openingならcontext.sourceKind（meet/story/reflection/relay/ambient/review-reaction）とtaskを優先し、'+
        '台帳のnpcLineをコピーせず、本人の新しい反応とchoicesを2件作る。'+
        'mode=replyは新しい第一声ではなく直前の選択への応答。問いには短く答える。相づちや感想なら同意を言い換えず、人物らしい小さな反応で会話を一歩進める。'+
        'NPCのtextは一言から二文、目安45字、上限65字。'+
        (multi?
          '出力はturns:[{speakerSlot:1,text:"..."},{speakerSlot:2,text:"..."}]とchoices。各スロットを一度ずつ、順番は会話に合わせる。'+
          '名前はcontext.speakersで固定し、初対面では各自が自分の名前を名乗る。'+
          '二人目は一人目の言葉に反応する。発話に話者ラベルやかぎ括弧を付けず、各65字以内。子どもへの問いかけは二人目まで待つ。':'')+
        'ここで起きるのは話すことだけ。移動、調査、合流、物の受け渡しは起こらない。よその場所は、昔の記憶や「もし〜なら」の話題に使う。'+
        '第一声にcontext.ambientFocusがあれば、それを会話のきっかけにする。同じ景色でも、何を面白がるかは人物によって変わる。avoidRecentLinesに出た用事や物を繰り返さない。'+
        '選択肢はその場で言葉にできる疑問や感想。移動・調査などを始める指示や、その先の段取りは選択肢にしない。'+
        '選択肢は今の話への子どもの言葉を二つ。context.repliesLeftは選択後に返答できる回数。'+
        (lastChoices?
          '最後の候補は{label,outcome}を二組。labelは子どもの一言、outcomeはその一言を受けたNPC本人の台詞。一人称と口調は本文と同じ。'+
          (multi?'各候補のspeakerSlotは話す一人の番号。':'')+
          '問いを返さず、選んだことへの答え・感想・面白い見立てを言い切って終える。新しい約束や調査は要らない。'+
          'たとえば風の話なら、子ども「どんな音？」にNPC「葉っぱがこすれて、くしゃくしゃって鳴るよ。」。子ども「雨みたい」にNPC「ほんとだ。木も雨のまねが上手だね。」。':
          'closing=trueでは選ばれた言葉にその場で応え、新しい質問を出さず、choicesは空配列。')},
        {role:'user',content:JSON.stringify(prompt)}],
      max_completion_tokens:320,temperature:actionWriting?.55:.75,
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
