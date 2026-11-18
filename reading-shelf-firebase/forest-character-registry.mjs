// Public NPC registration for the forest. One entry controls supported IDs,
// placement, sprite requirements, dialogue eligibility, voice presets and
// character relationships. The owner's book data, persona and story records
// remain in PRIVATE Firestore / Sheets, never in this public module.
//
// To add an ordinary NPC: add one entry with mode:'ai', a Drive sprite and
// matching reviewed character + speech rows in the private character ledger.
// Cloudflare Worker and browser read the SAME registry; no second allowlist.
const FIRST_PERSON={
  king:['ぼく','僕','おれ','俺','わたし','私','あたし','おら'],
  kiki:['ぼく','僕','おれ','俺','おれさま','俺様','おら','余'],
  jiji:['わたし','私','あたし','おれ','俺','おれさま','俺様','おら','余'],
  skipper:['わたし','私','あたし','おれ','俺','おれさま','俺様','おら','余'],
  zorori:['ぼく','僕','わたし','私','あたし','おら','余'],
  ishishi:['ぼく','僕','わたし','私','あたし','おれ','俺','おれさま','俺様','余'],
  noshishi:['ぼく','僕','わたし','私','あたし','おれ','俺','おれさま','俺様','余']
};
const roster=[
  {id:'king',name:'王さま',aliases:['王さま','王様'],related:['cat'],
    actor:{x:-22,z:17,scale:1.2,roamRadius:5,walkSpeed:1.1},
    voice:{rate:1.34,pitch:.88},mode:'ai',
    goodbye:'続きはまた今度だ。達者でな！'},
  {id:'cat',name:'ねこ',aliases:['ねこ'],related:['king'],
    actor:{x:-49,z:23,scale:.7,roamRadius:5,walkSpeed:1.35},mode:'silent',
    outputMode:'action-writing'},
  {id:'kiki',name:'キキ',aliases:['キキ'],related:['jiji'],
    actor:{x:24,z:9,scale:1,roamRadius:5,walkSpeed:1.3},
    voice:{rate:1.48,pitch:1.13},mode:'ai',
    goodbye:'じゃあ、また森で会おうね！'},
  {id:'jiji',name:'ジジ',aliases:['ジジ'],related:['kiki'],
    actor:{x:29,z:13,scale:.5,roamRadius:3.8,walkSpeed:1.65},
    voice:{rate:1.42,pitch:.98},mode:'ai',
    goodbye:'またね。気をつけて歩くんだよ。'},
  {id:'skipper',name:'スキッパー',aliases:['スキッパー'],related:['twins'],
    actor:{x:41,z:-10,scale:.8,roamRadius:6,walkSpeed:1.15},
    voice:{rate:1.38,pitch:.93},mode:'ai',
    goodbye:'またいっしょに探検しよう！'},
  {id:'twins',name:'ふたご',aliases:['ふたご','双子'],related:['skipper'],
    actor:{x:52,z:30,scale:.8,roamRadius:4.5,walkSpeed:1.2,groupId:'twins'},
    additionalActors:[{id:'twins_second',dialogueId:'twins',spriteId:'twins',
      name:'ふたご',groupId:'twins',x:56,z:33,scale:.8,roamRadius:4.5,walkSpeed:1.2}],
    voiceId:'twins_first',voice:{rate:1.45,pitch:1.16},
    voiceLabel:'ふたご（2人共通）',mode:'twins'},
  {id:'zorori',name:'ゾロリ',aliases:['ゾロリ'],related:['ishishi','noshishi'],
    actor:{x:-72,z:-8,scale:1.2,roamRadius:7,walkSpeed:1.35},
    voice:{rate:1.52,pitch:.91},mode:'ai',
    goodbye:'次はもっと面白い話をしてやるぜ！'},
  {id:'ishishi',name:'イシシ',aliases:['イシシ'],related:['zorori','noshishi'],
    actor:{x:61,z:60,scale:.8,roamRadius:4,walkSpeed:1.2},
    voice:{rate:1.48,pitch:1.08},voiceLabel:'イシシ・ノシシ（共通）',
    mode:'ai',
    goodbye:'じゃあな！また遊ぼうぜ！'},
  {id:'noshishi',name:'ノシシ',aliases:['ノシシ'],related:['zorori','ishishi'],
    actor:{x:66,z:62,scale:.8,roamRadius:4,walkSpeed:1.2},
    voiceId:'ishishi',mode:'ai',
    goodbye:'またね。のんびり待ってるよ。'},
  {id:'hachibee',name:'ハチベエ',aliases:['ハチベエ'],related:['hakase','mochan'],
    actor:{x:-28,z:41,scale:.77,roamRadius:4,walkSpeed:1.5},
    sprite:'optional',voice:{rate:1.55,pitch:1.12},mode:'ai',
    goodbye:'じゃあな！　おれ、もう少し森を見てくるぜ。'},
  {id:'hakase',name:'ハカセ',aliases:['ハカセ'],related:['hachibee','mochan'],
    actor:{x:-33,z:43,scale:.85,roamRadius:3.5,walkSpeed:1.15},
    sprite:'optional',voice:{rate:1.41,pitch:1.02},mode:'ai',
    goodbye:'またね。次は別の手がかりも見つかるといいな。'},
  {id:'mochan',name:'モーちゃん',aliases:['モーちゃん'],related:['hachibee','hakase'],
    actor:{x:-37,z:47,scale:1.03,roamRadius:3,walkSpeed:.88},
    sprite:'optional',voice:{rate:1.32,pitch:.92},mode:'ai',
    goodbye:'またね。ぼく、ここでもう少し休んでいくよ。'}
];

// When the set of NPC identities/modes/sprite obligations changes, invalidate
// private browser asset/persona caches once. No household data enters this hash.
const rosterIdentity=roster.map(item=>[
  item.id,item.mode,item.sprite||'required'].join(':')).join('|');
let rosterHash=2166136261;
for(const char of rosterIdentity)rosterHash=Math.imul(rosterHash^char.charCodeAt(0),16777619);
export const FOREST_ROSTER_REVISION=(rosterHash>>>0).toString(36);

export const FOREST_CHARACTER_REGISTRY=Object.freeze(roster.map(item=>Object.freeze(item)));
export const FOREST_CHARACTER_IDS=Object.freeze(roster.map(item=>item.id));
export const FOREST_AI_SPEAKER_IDS=Object.freeze(roster.filter(item=>item.mode==='ai')
  .map(item=>item.id));
// Special output controls presentation only. Every generated NPC's personality
// comes from the SAME owner-reviewed private Sheets, including non-speaking ones.
export const FOREST_ACTION_WRITING_IDS=Object.freeze(roster.filter(item=>
  item.outputMode==='action-writing').map(item=>item.id));
export const FOREST_AI_GENERATION_IDS=Object.freeze(roster.filter(item=>
  item.mode==='ai'||item.mode==='twins'||item.outputMode==='action-writing').map(item=>item.id));
export const FOREST_MULTI_SPEAKER_IDS=Object.freeze(roster.filter(item=>item.mode==='twins').map(item=>item.id));
export const FOREST_CHARACTER_ROW_LIMIT=100;
export const FOREST_ACTORS=Object.freeze(roster.flatMap(item=>[
  {id:item.id,name:item.name,...item.actor,
    ...(item.sprite==='optional'?{requiresSprite:true}:{} )},
  ...(item.additionalActors||[])
]));
export const FOREST_REQUIRED_SPRITE_NAMES=Object.freeze([
  ...roster.filter(item=>item.sprite!=='optional').map(item=>item.id),
  'player_cat','player_rabbit'
]);
export const FOREST_OPTIONAL_SPRITE_NAMES=Object.freeze(
  roster.filter(item=>item.sprite==='optional').map(item=>item.id));
export const FOREST_ACTOR_NAMES=Object.freeze(Object.fromEntries(
  roster.map(item=>[item.id,[item.id,...(item.aliases||[])]])));
export const FOREST_RELATIONS=Object.freeze(Object.fromEntries(
  roster.filter(item=>item.related?.length).map(item=>[item.id,[...item.related]])));
export const FOREST_SELF_NAMES=Object.freeze(Object.fromEntries(
  roster.filter(item=>item.mode==='ai').map(item=>[item.id,item.name])));
export const FOREST_GOODBYES=Object.freeze(Object.fromEntries(
  roster.filter(item=>item.goodbye).map(item=>[item.id,item.goodbye])));
export const FOREST_WRONG_FIRST_PERSON=Object.freeze(FIRST_PERSON);

// Voice presets share a key for intentionally identical voices, such as
// Ishishi/Noshishi and both twins. Cat has no voice.
export const FOREST_VOICE_ALIASES=Object.freeze(Object.fromEntries([
  ...roster.filter(item=>item.voiceId&&item.voiceId!==item.id)
    .map(item=>[item.id,item.voiceId]),
  ...roster.flatMap(item=>(item.additionalActors||[])
    .map(actor=>[actor.id,item.voiceId||item.id]))
]));
export const FOREST_DEFAULT_VOICES=Object.freeze(Object.fromEntries(
  roster.filter(item=>item.voice).map(item=>[
    item.voiceId||item.id,{...item.voice,volume:1,voiceURI:''}
  ])));
export const FOREST_VOICE_CHARACTERS=Object.freeze([
  ...roster.filter(item=>item.mode==='ai'&&item.voice&&
    !item.voiceId).map(item=>({id:item.id,name:item.voiceLabel||item.name})),
  ...roster.filter(item=>item.mode==='twins'&&item.voice)
    .map(item=>({id:item.voiceId||item.id,name:item.voiceLabel||item.name}))
]);

// Version the browser/Worker input contract separately from roster membership.
export const FOREST_DISPLAY_NAMES=Object.freeze(Object.fromEntries(
  roster.map(({id,name})=>[id,name])));
export function canonicalForestMention(text,speakers=[]){
  // This one observed misspelling is a whole katakana token. Saved names
  // take precedence, including names that happen to contain that token.
  if(typeof text!=='string'||(Array.isArray(speakers)&&speakers.some(speaker=>speaker?.name?.includes?.('ハチビー'))))return text;
  return text.replace(/(?<![ァ-ヿー])ハチビー(?![ァ-ヿー])/gu,FOREST_DISPLAY_NAMES.hachibee);
}

export const FOREST_DIALOGUE_PROTOCOL='scene-dialogue-v26-profile2';

export function forestMemoryBelongsToCharacter(memory,characterId){
  const names=FOREST_ACTOR_NAMES[characterId]||[];
  return String(memory?.characters||'').split(/[\s,，、|;；]+/u)
    .some(name=>names.includes(name));
}
