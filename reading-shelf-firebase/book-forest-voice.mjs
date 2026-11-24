import {FOREST_VOICE_CHARACTERS,FOREST_VOICE_ALIASES,
  FOREST_DEFAULT_VOICES} from './forest-character-registry.mjs';
export {FOREST_VOICE_CHARACTERS,FOREST_VOICE_ALIASES,FOREST_DEFAULT_VOICES};
// Browser speech synthesis only. This module never calls an LLM or a speech API.
// The same registry supplies the forest UI and the voice preview presets.

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
