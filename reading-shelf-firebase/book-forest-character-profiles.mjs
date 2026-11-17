import {FOREST_CHARACTER_IDS,FOREST_ACTION_WRITING_IDS,
  FOREST_AI_GENERATION_IDS} from './forest-character-registry.mjs';
// Only contracts and synthetic tests belong here. Actual claims live in private Sheets.
const CHARACTER_IDS=new Set(FOREST_CHARACTER_IDS);
const ACTION_WRITING_IDS=new Set(FOREST_ACTION_WRITING_IDS);
const AI_IDS=new Set(FOREST_AI_GENERATION_IDS);
export const FOREST_PROFILE_SCHEMA=2;
export const FOREST_PROFILE_ROWS=2000;
export const FOREST_PROFILE_HEADERS=['NPC ID','項目','内容','根拠区分','根拠資料ID',
  '適用範囲','監修状態','設定版'];
export const FOREST_PROFILE_FIELDS={summary:'人物像',values:'価値観',motivation:'動機',
  relationships:'関係性',behavior:'行動',reactions:'反応',firstPerson:'一人称',
  address:'呼称',cadence:'口調',endings:'語尾',habits:'癖の頻度',
  expression:'言い回し',emotion:'感情変化',avoid:'禁止・注意'};
const BASES=new Set(['原作本文','公式資料','二次資料','編集解釈','ゲーム演出']);
const REVIEWS=new Set(['確認済','暫定採用']);
const METADATA=new Set(['表示名','作品・版','監修メモ']);
const NORMALIZE=value=>String(value??'').replace(/[\u0000-\u001f\u007f]/gu,' ').trim().replace(/\s+/gu,' ');
const FIELD_KEYS=Object.keys(FOREST_PROFILE_FIELDS);
const KEY_BY_LABEL=Object.fromEntries(Object.entries(FOREST_PROFILE_FIELDS).map(([k,v])=>[v,k]));
// Content fingerprint is diagnostic, not an authorization or integrity signature.
// Two independent 32-bit hashes include every claim, annotation and revision.
function fingerprint(value){
  let a=2166136261,b=5381;
  for(const c of JSON.stringify(value)){const n=c.codePointAt(0);
    a=Math.imul(a^n,16777619);b=Math.imul(b,33)^n;}
  return 'profile2-'+(a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');
}
function profileError(id,reason){throw Error('人物設定 '+id+': '+reason)}

/** One row per semantic field, with its own evidence, scope and adoption status.
 * No legacy wide-sheet reader, no implicit confidence upgrade, no text slicing.
 * Oversize / duplicates / dangling source IDs are explicit editing errors.
 */
export function parseForestCharacterProfiles(rows,sources=[]){
  if(!Array.isArray(rows)||!Array.isArray(rows[0]))return [];
  const headers=rows[0].map(NORMALIZE);
  if(FOREST_PROFILE_HEADERS.some(h=>!headers.includes(h)))throw Error('人物設定のヘッダーが正しくありません');
  if(rows.length>FOREST_PROFILE_ROWS+1)throw Error('人物設定の行数上限を超えています');
  const sourceIds=new Set(sources.map(s=>s.id));
  const people=new Map();
  for(const row of rows.slice(1)){
    if(!Array.isArray(row)||row.every(v=>!NORMALIZE(v)))continue;
    const [id,field,text,basis,refs,scope,review,version]=FOREST_PROFILE_HEADERS.map(h=>NORMALIZE(row[headers.indexOf(h)]));
    // Additional sprite actors may share a registered dialogue identity.
    if(!CHARACTER_IDS.has(id))continue;
    if(METADATA.has(field))continue; // human editing metadata stays in the ledger
    const key=KEY_BY_LABEL[field];
    if(!key)profileError(id,'不明な項目');
    if(!text||text.length>1200||!scope||scope.length>200||!version||version.length>80)
      profileError(id,'内容・適用範囲・設定版を確認してください（自動切捨てはしません）');
    if(!BASES.has(basis)||!REVIEWS.has(review))profileError(id,'根拠区分・監修状態を確認してください');
    if(review==='確認済'&&['編集解釈','ゲーム演出'].includes(basis))
      profileError(id,'解釈・演出は原作確認済にできません');
    const sourceRefs=[...new Set(refs.split(/[,、\s]+/u).filter(Boolean))];
    if(sourceRefs.some(ref=>!sourceIds.has(ref))||
      (review==='確認済'&&sourceRefs.some(ref=>sources.find(s=>s.id===ref)?.status!=='確認済'))||
      (['原作本文','公式資料','二次資料'].includes(basis)&&!sourceRefs.length))
      profileError(id,'根拠資料IDを確認してください');
    if(!people.has(id))people.set(id,{id,schemaVersion:FOREST_PROFILE_SCHEMA,version,claims:[]});
    const p=people.get(id);
    if(p.version!==version||p.claims.some(c=>c.key===key))profileError(id,'項目重複または設定版の不一致');
    p.claims.push({key,text,basis,sourceRefs,scope,review});
  }
  return [...people.values()].map(p=>{
    p.claims.sort((a,b)=>FIELD_KEYS.indexOf(a.key)-FIELD_KEYS.indexOf(b.key));
    for(const c of p.claims)p[c.key]=c.text;
    for(const k of FIELD_KEYS)if(p[k]===undefined)p[k]='';
    const used=new Set(p.claims.flatMap(c=>c.sourceRefs));
    p.sources=sources.filter(s=>used.has(s.id)).map(({id,kind,status})=>({id,kind,status}));
    p.review=p.claims.some(c=>c.review==='暫定採用')?'暫定事項あり':'確認済';
    p.revision=fingerprint([p.id,p.version,p.claims,p.sources]);
    if(!validForestCharacterProfiles([p]).length)profileError(p.id,'必須項目不足または生成入力の上限超過');
    return p;
  });
}

export function parseForestProfileSources(rows){
  if(!Array.isArray(rows)||!Array.isArray(rows[0]))return [];
  const headers=rows[0].map(NORMALIZE),required=['資料ID','根拠の種別','確認状態'];
  if(required.some(h=>!headers.includes(h)))throw Error('根拠資料のヘッダーが正しくありません');
  const ids=new Set();
  return rows.slice(1).filter(r=>Array.isArray(r)&&NORMALIZE(r[0])).map(row=>{
    const [id,kind,status]=required.map(h=>NORMALIZE(row[headers.indexOf(h)]));
    if(ids.has(id)||!id||!kind||!status)throw Error('根拠資料IDの重複または資料情報の不足');
    ids.add(id);return {id,kind,status};
  });
}

function guideText(p){
  return ['人物設定版:'+p.version+' / '+p.revision,
    '優先順:価値観・動機・関係性・行動を核に反応する。話し方はその表現。',
    '根拠規約:原作本文・公式資料・二次資料を区別。編集解釈・ゲーム演出・暫定採用は原作確定ではない。各適用範囲と本文の留保を守り、未確認事項を断定しない。',
    ...p.claims.map(c=>FOREST_PROFILE_FIELDS[c.key]+' ['+c.basis+' / '+c.review+' / '+c.scope+
      (c.sourceRefs.length?' / 資料:'+c.sourceRefs.join(','):'')+']:'+c.text),
    ...(p.sources.length?['資料の種別・照合状態:'+p.sources.map(s=>s.id+'='+s.kind+'('+s.status+')').join(';')]:[])
  ].join('\n');
}

export function validForestCharacterProfiles(profiles){
  if(!Array.isArray(profiles)||profiles.length>CHARACTER_IDS.size)return [];
  const seen=new Set();
  return profiles.filter(p=>{
    if(!p||!CHARACTER_IDS.has(p.id)||seen.has(p.id)||p.schemaVersion!==FOREST_PROFILE_SCHEMA||
      typeof p.version!=='string'||!p.version||p.version.length>80||
      !Array.isArray(p.claims)||p.claims.length>FIELD_KEYS.length||!Array.isArray(p.sources)||
      p.sources.length>80||!p.summary||!p.cadence||!p.avoid||
      (!p.firstPerson&&!ACTION_WRITING_IDS.has(p.id)))return false;
    const keys=new Set();
    for(const c of p.claims){
      if(!c||!FIELD_KEYS.includes(c.key)||keys.has(c.key)||typeof c.text!=='string'||
        !c.text||c.text.length>1200||p[c.key]!==c.text||!BASES.has(c.basis)||!REVIEWS.has(c.review)||
        !c.scope||c.scope.length>200||!Array.isArray(c.sourceRefs)||
        c.sourceRefs.some(ref=>!p.sources.some(s=>s.id===ref))||
        (['原作本文','公式資料','二次資料'].includes(c.basis)&&!c.sourceRefs.length)||
        (c.review==='確認済'&&c.sourceRefs.some(ref=>p.sources.find(s=>s.id===ref)?.status!=='確認済'))||
        (c.review==='確認済'&&['編集解釈','ゲーム演出'].includes(c.basis)))return false;
      keys.add(c.key);
    }
    if(FIELD_KEYS.some(k=>typeof p[k]!=='string'||(p[k]&&!keys.has(k)))||
      p.sources.some(s=>typeof s.id!=='string'||typeof s.kind!=='string'||typeof s.status!=='string')||
      p.revision!==fingerprint([p.id,p.version,p.claims,p.sources])||guideText(p).length>6000)return false;
    seen.add(p.id);return true;
  });
}

export function forestCharacterVoiceGuide(profile){
  return validForestCharacterProfiles([profile]).length?guideText(profile):'';
}

/** Public IDs and reason codes only: never profile text, image IDs or credentials. */
export function diagnoseForestCharacters({registry,profiles=[],images={},aiAvailable=false}={}){
  const reviewed=new Set(validForestCharacterProfiles(profiles).map(profile=>profile.id));
  return (registry||[]).map(character=>({id:character.id,
    missing:[...(!images[character.id]?['sprite']:[]),
      ...(AI_IDS.has(character.id)&&!reviewed.has(character.id)?['character-profile']:[]),
      ...(AI_IDS.has(character.id)&&!aiAvailable?['ai-connection']:[])]}));
}
