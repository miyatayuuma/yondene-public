// Browser speech synthesis only. This module never calls an LLM or a speech API.
// The forest UI does not import it yet: first calibrate voices on real devices.

export const FOREST_VOICE_CHARACTERS=Object.freeze([
  {id:'king',name:'王さま'},
  {id:'kiki',name:'キキ'},
  {id:'jiji',name:'ジジ'},
  {id:'skipper',name:'スキッパー'},
  {id:'zorori',name:'ゾロリ'},
  {id:'ishishi',name:'イシシ・ノシシ（共通）'},
  {id:'hachibee',name:'ハチベエ'},
  {id:'hakase',name:'ハカセ'},
  {id:'mochan',name:'モーちゃん'}, 
  // The twins' names rotate; both speakers use the same voice profile.
  {id:'twins_first',name:'ふたご（2人共通）'}
]);

export const FOREST_VOICE_ALIASES=Object.freeze({
  noshishi:'ishishi',twins:'twins_first',twins_second:'twins_first'
});

export const FOREST_DEFAULT_VOICES=Object.freeze({
  king:{rate:1.34,pitch:.88,volume:1,voiceURI:''},
  kiki:{rate:1.48,pitch:1.13,volume:1,voiceURI:''},
  jiji:{rate:1.42,pitch:.98,volume:1,voiceURI:''},
  skipper:{rate:1.38,pitch:.93,volume:1,voiceURI:''},
  zorori:{rate:1.52,pitch:.91,volume:1,voiceURI:''},
  ishishi:{rate:1.48,pitch:1.08,volume:1,voiceURI:''},
  hachibee:{rate:1.55,pitch:1.12,volume:1,voiceURI:''},
  hakase:{rate:1.41,pitch:1.02,volume:1,voiceURI:''},
  mochan:{rate:1.29,pitch:.92,volume:1,voiceURI:''},
  twins_first:{rate:1.45,pitch:1.16,volume:1,voiceURI:''}
});

const DEFAULT_PROFILE=Object.freeze({rate:1.4,pitch:1,volume:1,voiceURI:''});
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const bounded=(value,fallback,min,max)=>Number.isFinite(Number(value))&&value!==''&&value!==null
  ?clamp(Number(value),min,max):fallback;

export function normalizeForestVoiceProfile(input={},fallback=DEFAULT_PROFILE){
  const profile=input&&typeof input==='object'?input:{};
  return {
    rate:bounded(profile.rate,fallback.rate,.7,2),
    pitch:bounded(profile.pitch,fallback.pitch,.6,1.4),
    volume:bounded(profile.volume,fallback.volume,0,1),
    voiceURI:typeof profile.voiceURI==='string'?profile.voiceURI.slice(0,180):fallback.voiceURI
  };
}

export function forestVoiceProfile(characterId,overrides={}){
  const speakerId=FOREST_VOICE_ALIASES[characterId]||characterId;
  const base=FOREST_DEFAULT_VOICES[speakerId];
  // Cat has no speech. Unknown IDs must not receive an accidental default voice.
  if(!base)return null;
  return normalizeForestVoiceProfile(overrides?.[speakerId]||base,base);
}

// Explicitly fix names whose pronunciation varies between engines. Do not
// rewrite normal Japanese text or generate unreliable whole-text furigana.
const READINGS=Object.freeze({
  '王さま':'おうさま',
  'アケビ':'あけび',
  'スグリ':'すぐり',
  'イシシ':'いしし',
  'ノシシ':'のしし',
  'ゾロリ':'ぞろり',
  'ハチベエ':'はちべえ',
  'ハカセ':'はかせ',
  'モーちゃん':'もーちゃん'
});
export function forestSpeechText(text){
  let spoken=String(text??'');
  for(const [display,reading] of Object.entries(READINGS))spoken=spoken.replaceAll(display,reading);
  return spoken;
}

export function createForestVoiceEngine({synth=globalThis.speechSynthesis,Utterance=globalThis.SpeechSynthesisUtterance}={}){
  let current=null;
  const supported=()=>Boolean(synth&&typeof synth.speak==='function'&&typeof synth.cancel==='function'&&typeof Utterance==='function');
  const japaneseVoices=()=>{
    if(!synth||typeof synth.getVoices!=='function')return [];
    try{return synth.getVoices().filter(v=>String(v.lang||'').toLowerCase().startsWith('ja'))}
    catch{return []}
  };
  function stop(){
    const previous=current;current=null;
    if(previous)previous.resolve({status:'cancelled'});
    // Avoid an unnecessary cancel immediately before the first Android utterance.
    if((previous||synth?.speaking||synth?.pending)&&typeof synth?.cancel==='function'){
      try{synth.cancel()}catch{}
    }
    return Boolean(previous);
  }
  function speak({characterId,text,profile,onStart=()=>{}}={}){
    stop();
    const base=forestVoiceProfile(characterId);
    if(!base)return Promise.resolve({status:'forbidden'});
    if(!supported())return Promise.resolve({status:'unsupported'});
    if(!String(text??'').trim())return Promise.resolve({status:'empty'});
    const selected=normalizeForestVoiceProfile(profile??base,base);
    let utterance;
    try{utterance=new Utterance(forestSpeechText(text))}catch(error){return Promise.resolve({status:'error',error:String(error)})}
    utterance.lang='ja-JP';
    utterance.rate=selected.rate;
    utterance.pitch=selected.pitch;
    utterance.volume=selected.volume;
    const voices=japaneseVoices();
    utterance.voice=voices.find(voice=>voice.voiceURI===selected.voiceURI)||voices[0]||null;
    return new Promise(resolve=>{
      const entry={resolve};current=entry;
      const finish=result=>{
        if(current!==entry)return;
        current=null;resolve(result);
      };
      utterance.onstart=()=>{if(current===entry)onStart()};
      utterance.onend=()=>finish({status:'finished'});
      utterance.onerror=event=>finish({status:'error',error:String(event?.error||'unknown')});
      try{synth.speak(utterance)}catch(error){finish({status:'error',error:String(error)})}
    });
  }
  return {supported,japaneseVoices,speak,stop,isSpeaking:()=>Boolean(current)};
}
