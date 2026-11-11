import test from 'node:test';
import assert from 'node:assert/strict';
import {FOREST_VOICE_CHARACTERS,FOREST_DEFAULT_VOICES,normalizeForestVoiceProfile,
  forestVoiceProfile,forestSpeechText,createForestVoiceEngine} from './book-forest-voice.mjs';

class FakeUtterance{
  constructor(text){this.text=text}
}
function fakeSpeech(){
  const voices=[{name:'Japanese',lang:'ja-JP',voiceURI:'ja-local'},
    {name:'English',lang:'en-US',voiceURI:'en-local'}];
  const synth={calls:[],cancelCount:0,getVoices:()=>voices,
    speak(u){this.calls.push(u)},cancel(){this.cancelCount++}};
  return {synth,voices};
}

test('all speaking characters have independently adjustable profiles',()=>{
  assert.equal(FOREST_VOICE_CHARACTERS.length,9);
  assert.equal(new Set(FOREST_VOICE_CHARACTERS.map(c=>c.id)).size,9);
  for(const {id} of FOREST_VOICE_CHARACTERS){
    assert.ok(FOREST_DEFAULT_VOICES[id]);
    const profile=forestVoiceProfile(id);
    assert.ok(profile.rate>=.7&&profile.rate<=1.6);
    assert.ok(profile.pitch>=.6&&profile.pitch<=1.4);
  }
  assert.notDeepEqual(forestVoiceProfile('twins_first'),forestVoiceProfile('twins_second'));
});

test('normalization constrains all values and ignores unsafe data types',()=>{
  assert.deepEqual(normalizeForestVoiceProfile({rate:10,pitch:-3,volume:99,voiceURI:123}),
    {rate:1.6,pitch:.6,volume:1,voiceURI:''});
  assert.equal(normalizeForestVoiceProfile({rate:'bad',pitch:null}).rate,1.2);
  assert.equal(normalizeForestVoiceProfile({rate:'bad',pitch:null}).pitch,1);
  assert.equal(forestVoiceProfile('king',{king:{rate:.8}}).rate,.8);
});

test('only known proper names receive reading substitutions',()=>{
  assert.equal(forestSpeechText('アケビとスグリは王さまに会った。'),
    'あけびとすぐりはおうさまに会った。');
  assert.equal(forestSpeechText('橋をわたった。'),'橋をわたった。');
});

test('engine uses Japanese voice, chosen speed and pitch, and ends cleanly',async()=>{
  const {synth}=fakeSpeech();
  const voice=createForestVoiceEngine({synth,Utterance:FakeUtterance});
  assert.equal(voice.supported(),true);
  assert.equal(voice.japaneseVoices().length,1);
  let started=0;
  const done=voice.speak({text:'王さま',profile:{rate:1.25,pitch:.9,volume:.8,voiceURI:'ja-local'},onStart:()=>started++});
  assert.equal(synth.cancelCount,0,'first playback should not cancel audio prematurely');
  const utterance=synth.calls[0];
  assert.equal(utterance.text,'おうさま');
  assert.equal(utterance.lang,'ja-JP');
  assert.equal(utterance.rate,1.25);
  assert.equal(utterance.pitch,.9);
  assert.equal(utterance.volume,.8);
  assert.equal(utterance.voice.voiceURI,'ja-local');
  utterance.onstart();utterance.onend();
  assert.equal(started,1);
  assert.deepEqual(await done,{status:'finished'});
  assert.equal(voice.isSpeaking(),false);
});

test('stop cancels ongoing speech; stale events cannot complete the next utterance',async()=>{
  const {synth}=fakeSpeech();
  const voice=createForestVoiceEngine({synth,Utterance:FakeUtterance});
  const first=voice.speak({text:'一つ目'});
  const old=synth.calls[0];
  const second=voice.speak({text:'二つ目'});
  assert.deepEqual(await first,{status:'cancelled'});
  assert.equal(synth.cancelCount,1);
  old.onend();
  assert.equal(voice.isSpeaking(),true);
  voice.stop();
  assert.deepEqual(await second,{status:'cancelled'});
  assert.equal(voice.isSpeaking(),false);
});

test('unsupported browsers and empty text fail without throwing',async()=>{
  const voice=createForestVoiceEngine({synth:null,Utterance:null});
  assert.equal(voice.supported(),false);
  assert.deepEqual(await voice.speak({text:'こんにちは'}),{status:'unsupported'});
  const {synth}=fakeSpeech();
  const another=createForestVoiceEngine({synth,Utterance:FakeUtterance});
  assert.deepEqual(await another.speak({text:'  '}),{status:'empty'});
  assert.equal(synth.calls.length,0);
});
