// The authoritative character profiles live in the owner's PRIVATE spreadsheet.
// Public code contains only column contracts and validation, never real rows.
const CHARACTER_IDS=new Set(['king','cat','kiki','jiji','skipper','zorori',
  'ishishi','noshishi','twins','hachibee','hakase','mochan']);
const CHARACTER_COLUMNS={id:'NPC ID',summary:'人物像の要約',values:'大切にすること',
  motivation:'望み・動機',relationships:'関係性',behavior:'普段の行動',
  reactions:'状況への反応',verification:'原作確認'};
const SPEECH_COLUMNS={id:'NPC／会話ID',firstPerson:'一人称',address:'相手の呼び方',
  cadence:'基本口調・テンポ',endings:'語尾（使用条件）',habits:'口癖と使用頻度',
  expression:'言い回しの特徴',emotion:'感情による変化',avoid:'避ける表現・NG',
  review:'監修状態'};
const NORMALIZE=value=>String(value??'').replace(/[\u0000-\u001f\u007f]/gu,' ').trim().replace(/\s+/gu,' ');

function readRows(values,columns){
  if(!Array.isArray(values)||!Array.isArray(values[0]))return new Map();
  const headers=values[0].map(NORMALIZE);
  if(Object.values(columns).some(header=>!headers.includes(header)))return new Map();
  const result=new Map();
  for(const row of values.slice(1,21)){
    if(!Array.isArray(row))continue;
    const read=key=>NORMALIZE(row[headers.indexOf(columns[key])]).slice(0,260);
    const id=read('id');
    if(!CHARACTER_IDS.has(id)||result.has(id))continue;
    result.set(id,Object.fromEntries(Object.keys(columns).map(key=>[key,read(key)])));
  }
  return result;
}

/** Join owner-reviewed identities and provisional speech guidance by NPC ID. */
export function parseForestCharacterProfiles(characters,speech){
  const people=readRows(characters,CHARACTER_COLUMNS),speakers=readRows(speech,SPEECH_COLUMNS);
  const result=[];
  for(const [id,person] of people){
    const voice=speakers.get(id);
    if(person.verification!=='確認済'||!voice||!person.summary||!voice.cadence||
      !voice.firstPerson||!voice.avoid)continue;
    result.push({id,
      summary:person.summary,values:person.values,motivation:person.motivation,
      relationships:person.relationships,behavior:person.behavior,reactions:person.reactions,
      firstPerson:voice.firstPerson,address:voice.address,cadence:voice.cadence,
      endings:voice.endings,habits:voice.habits,expression:voice.expression,
      emotion:voice.emotion,avoid:voice.avoid,review:voice.review});
  }
  return result;
}

export function validForestCharacterProfiles(profiles){
  if(!Array.isArray(profiles)||profiles.length>CHARACTER_IDS.size)return [];
  const seen=new Set();
  return profiles.filter(profile=>{
    if(!profile||!CHARACTER_IDS.has(profile.id)||seen.has(profile.id)||
      typeof profile.summary!=='string'||!profile.summary||profile.summary.length>260||
      typeof profile.cadence!=='string'||!profile.cadence||profile.cadence.length>260||
      typeof profile.firstPerson!=='string'||!profile.firstPerson||profile.firstPerson.length>260||
      typeof profile.avoid!=='string'||!profile.avoid||profile.avoid.length>260)return false;
    const keys=['values','motivation','relationships','behavior','reactions','address',
      'endings','habits','expression','emotion','review'];
    if(keys.some(key=>typeof profile[key]!=='string'||profile[key].length>260))return false;
    seen.add(profile.id);return true;
  });
}

/** Concise behavioral instructions, not unchecked examples or quoted story lines. */
export function forestCharacterVoiceGuide(profile){
  if(!validForestCharacterProfiles([profile]).length)return '';
  // Source-confidence notes explain the sheet, not the character's speech.
  const firstPerson=profile.firstPerson.split(/[（(]/u)[0].trim();
  const parts=[
    ['人物像',profile.summary,125],['大切にすること',profile.values,95],
    ['望み',profile.motivation,75],['関係性',profile.relationships,85],
    ['行動',profile.behavior,90],['状況への反応',profile.reactions,100],
    ['一人称',firstPerson,65],['呼び方',profile.address,50],
    ['口調',profile.cadence,130],['語尾の条件',profile.endings,105],
    ['癖の頻度',profile.habits,100],['言い回し',profile.expression,110],
    ['感情の変化',profile.emotion,85],['禁止・注意',profile.avoid,145]
  ];
  return parts.filter(([,value])=>value).map(([name,value,limit])=>
    `${name}:${value.slice(0,limit)}`).join('\n');
}
