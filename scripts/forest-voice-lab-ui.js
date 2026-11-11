// Runs only in forest-voice-lab.html. No Firebase imports or network calls.
const $=id=>document.getElementById(id);
const engine=createForestVoiceEngine();
const storageKey='yondene-forest-voice-lab-v1';
let saved={};
try{
  const raw=JSON.parse(localStorage.getItem(storageKey)||'{}');
  if(raw&&typeof raw==='object'&&!Array.isArray(raw))saved=raw;
}catch{}
const allowed=new Set(FOREST_VOICE_CHARACTERS.map(item=>item.id));
const profiles={};
for(const id of allowed){
  if(saved[id]&&typeof saved[id]==='object')profiles[id]=forestVoiceProfile(id,saved);
}
const characterSelect=$('character');
for(const character of FOREST_VOICE_CHARACTERS){
  const option=document.createElement('option');option.value=character.id;option.textContent=character.name;
  characterSelect.append(option);
}
characterSelect.value='kiki';
let activeId=characterSelect.value;
let candidate=forestVoiceProfile(activeId,profiles);
let playbackSequence=0;

function status(message){$('status').textContent=message}
function accepted(){return forestVoiceProfile(activeId,profiles)}
function describeVoice(uri){
  const voice=engine.japaneseVoices().find(item=>item.voiceURI===uri);
  return voice?`${voice.name}（${voice.lang}）`:'端末の標準日本語音声';
}
function refreshVoices(){
  const select=$('voice'),previous=candidate.voiceURI;
  select.replaceChildren();
  const option=document.createElement('option');option.value='';option.textContent='標準の日本語音声';select.append(option);
  for(const voice of engine.japaneseVoices()){
    const item=document.createElement('option');item.value=voice.voiceURI;
    item.textContent=`${voice.name} (${voice.lang})${voice.localService?' · 端末内':''}`;
    select.append(item);
  }
  select.value=[...select.options].some(item=>item.value===previous)?previous:'';
  if(select.value!==previous)candidate.voiceURI=select.value;
  renderBaseline();
}
function renderBaseline(){
  const profile=accepted();
  $('baseline').textContent=`音声：${describeVoice(profile.voiceURI)}\n速さ ${profile.rate.toFixed(2)}／高さ ${profile.pitch.toFixed(2)}／音量 ${profile.volume.toFixed(2)}`;
  $('baseline').style.whiteSpace='pre-line';
}
function renderCandidate(){
  for(const key of ['rate','pitch','volume']){
    $(key).value=String(candidate[key]);
    $(key+'Value').textContent=candidate[key].toFixed(2);
  }
  refreshVoices();
}
function selectCharacter(){
  stopPlayback(false);
  activeId=characterSelect.value;
  candidate=accepted();
  renderCandidate();
  status(`${FOREST_VOICE_CHARACTERS.find(item=>item.id===activeId)?.name}の声を比較できます。`);
}
function stopPlayback(showStatus=true){
  playbackSequence++;
  engine.stop();
  if(showStatus)status('読み上げを停止しました。');
}
async function play(which){
  const text=$('line').value.trim();
  if(!text){status('読み上げるセリフを入力してください。');return}
  if(!engine.supported()){status('このブラウザでは音声合成が利用できません。');return}
  const sequence=++playbackSequence;
  const profile=which==='A'?accepted():normalizeForestVoiceProfile(candidate);
  status(`${which} の音声を準備しています…`);
  const result=await engine.speak({text,profile,onStart:()=>{
    if(sequence===playbackSequence)status(`${which} を読み上げています。タップで別の声に切り替えられます。`);
  }});
  if(sequence!==playbackSequence)return;
  if(result.status==='finished')status(`${which} の読み上げが終わりました。`);
  else if(result.status==='error')status('音声の再生に失敗しました。端末の日本語読み上げ設定をご確認ください。');
  else if(result.status==='unsupported')status('このブラウザでは音声合成が利用できません。');
}
function persist(){
  try{localStorage.setItem(storageKey,JSON.stringify(profiles));return true}
  catch{return false}
}
characterSelect.addEventListener('change',selectCharacter);
for(const key of ['rate','pitch','volume']){
  $(key).addEventListener('input',()=>{
    candidate[key]=Number($(key).value);
    $(key+'Value').textContent=candidate[key].toFixed(2);
  });
}
$('voice').addEventListener('change',()=>{candidate.voiceURI=$('voice').value});
$('playA').addEventListener('click',()=>play('A'));
$('playB').addEventListener('click',()=>play('B'));
$('stop').addEventListener('click',()=>stopPlayback());
$('restoreB').addEventListener('click',()=>{
  stopPlayback(false);candidate=accepted();renderCandidate();status('Bを現在の基準Aに戻しました。');
});
$('saveB').addEventListener('click',()=>{
  stopPlayback(false);profiles[activeId]=normalizeForestVoiceProfile(candidate);renderBaseline();
  status(persist()?'Bをこの端末の基準Aに保存しました。':'Bを基準Aに採用しましたが、端末内への永続保存には失敗しました。');
});
$('resetCharacter').addEventListener('click',()=>{
  stopPlayback(false);delete profiles[activeId];candidate=accepted();renderCandidate();
  status(persist()?'このキャラを初期設定へ戻しました。':'このキャラを初期設定へ戻しました（永続保存不可）。');
});
$('exportSettings').addEventListener('click',()=>{
  const results={version:1,profiles:{}};
  for(const {id} of FOREST_VOICE_CHARACTERS)results.profiles[id]=forestVoiceProfile(id,profiles);
  $('exportArea').value=JSON.stringify(results,null,2);
  $('exportArea').hidden=false;
  status('下のJSONをコピーして、採用した声の設定として共有できます。');
});
window.addEventListener('pagehide',()=>stopPlayback(false));
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopPlayback(false)});
if(globalThis.speechSynthesis?.addEventListener){
  globalThis.speechSynthesis.addEventListener('voiceschanged',refreshVoices);
}
renderCandidate();
status(engine.supported()
  ?`準備できました。日本語音声 ${engine.japaneseVoices().length} 種類。AとBを押して聞き比べてください。`
  :'このブラウザでは音声合成が利用できません。');
