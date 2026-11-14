import test from 'node:test';
import assert from 'node:assert/strict';
import {FOREST_VOICE_CHARACTERS,FOREST_DEFAULT_VOICES,FOREST_VOICE_ALIASES,normalizeForestVoiceProfile,
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

test('ten voice profiles cover thirteen forest actors, with silent cat and shared pairs',()=>{
  assert.equal(FOREST_VOICE_CHARACTERS.length,10);
  assert.equal(new Set(FOREST_VOICE_CHARACTERS.map(c=>c.id)).size,10);
  for(const {id} of FOREST_VOICE_CHARACTERS){
    assert.ok(FOREST_DEFAULT_VOICES[id]);
    const profile=forestVoiceProfile(id);
    assert.ok(profile.rate>=1.3&&profile.rate<=2);
    assert.ok(profile.pitch>=.6&&profile.pitch<=1.4);
  }
  assert.equal(FOREST_VOICE_ALIASES.noshishi,'ishishi');
  assert.deepEqual(forestVoiceProfile('ishishi'),forestVoiceProfile('noshishi'));
  assert.deepEqual(forestVoiceProfile('twins_first'),forestVoiceProfile('twins_second'));
  assert.deepEqual(forestVoiceProfile('twins'),forestVoiceProfile('twins_first'));
  for(const id of ['hachibee','hakase','mochan'])assert.ok(forestVoiceProfile(id));
  assert.equal(forestVoiceProfile('cat'),null);
  assert.equal(forestVoiceProfile('unknown'),null);
  const custom={ishishi:{rate:1.85,pitch:.72},twins_first:{rate:1.65,pitch:.8}};
  assert.deepEqual(forestVoiceProfile('noshishi',custom),forestVoiceProfile('ishishi',custom));
  assert.deepEqual(forestVoiceProfile('twins_second',custom),forestVoiceProfile('twins_first',custom));
});

test('normalization constrains all values and ignores unsafe data types',()=>{
  assert.deepEqual(normalizeForestVoiceProfile({rate:10,pitch:-3,volume:99,voiceURI:123}),
    {rate:2,pitch:.6,volume:1,voiceURI:''});
  assert.equal(normalizeForestVoiceProfile({rate:'bad',pitch:null}).rate,1.4);
  assert.equal(normalizeForestVoiceProfile({rate:'bad',pitch:null}).pitch,1);
  assert.equal(forestVoiceProfile('king',{king:{rate:.8}}).rate,.8);
});

test('only known proper names receive reading substitutions',()=>{
  assert.equal(forestSpeechText('アケビとスグリは王さまに会った。'),
    'あけびとすぐりはおうさまに会った。');
  assert.equal(forestSpeechText('ハチベエ、ハカセ、モーちゃん'),
    'はちべえ、はかせ、もーちゃん');
  assert.equal(forestSpeechText('橋をわたった。'),'橋をわたった。');
});

test('engine uses Japanese voice, chosen speed and pitch, and ends cleanly',async()=>{
  const {synth}=fakeSpeech();
  const voice=createForestVoiceEngine({synth,Utterance:FakeUtterance});
  assert.equal(voice.supported(),true);
  assert.equal(voice.japaneseVoices().length,1);
  let started=0;
  const done=voice.speak({characterId:'king',text:'王さま',profile:{rate:1.45,pitch:.9,volume:.8,voiceURI:'ja-local'},onStart:()=>started++});
  assert.equal(synth.cancelCount,0,'first playback should not cancel audio prematurely');
  const utterance=synth.calls[0];
  assert.equal(utterance.text,'おうさま');
  assert.equal(utterance.lang,'ja-JP');
  assert.equal(utterance.rate,1.45);
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
  const first=voice.speak({characterId:'twins_first',text:'一つ目'});
  const old=synth.calls[0];
  const second=voice.speak({characterId:'twins_second',text:'二つ目'});
  assert.deepEqual(await first,{status:'cancelled'});
  assert.equal(synth.cancelCount,1);
  old.onend();
  assert.equal(voice.isSpeaking(),true);
  voice.stop();
  assert.deepEqual(await second,{status:'cancelled'});
  assert.equal(voice.isSpeaking(),false);
});

test('cat and unknown characters can never start speech, even with explicit text and settings',async()=>{
  const {synth}=fakeSpeech();
  const engine=createForestVoiceEngine({synth,Utterance:FakeUtterance});
  assert.deepEqual(await engine.speak({characterId:'cat',text:'にゃあ',profile:{rate:1.8}}),{status:'forbidden'});
  assert.deepEqual(await engine.speak({characterId:'unknown',text:'こんにちは'}),{status:'forbidden'});
  assert.deepEqual(await engine.speak({text:'こんにちは'}),{status:'forbidden'});
  assert.equal(synth.calls.length,0);
});

test('unsupported browsers and empty text fail without throwing',async()=>{
  const voice=createForestVoiceEngine({synth:null,Utterance:null});
  assert.equal(voice.supported(),false);
  assert.deepEqual(await voice.speak({characterId:'king',text:'こんにちは'}),{status:'unsupported'});
  const {synth}=fakeSpeech();
  const another=createForestVoiceEngine({synth,Utterance:FakeUtterance});
  assert.deepEqual(await another.speak({characterId:'king',text:'  '}),{status:'empty'});
  assert.equal(synth.calls.length,0);
});
