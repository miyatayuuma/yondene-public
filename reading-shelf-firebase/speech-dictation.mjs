// Optional browser speech-to-text. Never stores or uploads an audio file.
export function attachSpeechInput({input,help,container}){
  const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Speech){
    help.textContent+=' マイク入力はキーボードの音声入力をご利用ください。';
    return ()=>{};
  }
  const button=document.createElement('button');button.type='button';
  button.className='voiceInputButton';button.textContent='マイクで文字入力';
  container.insertBefore(button,help);
  let session=null;
  button.onclick=()=>{
    if(session){session.stop();return}
    const recognizer=new Speech(),before=input.value.trim();
    recognizer.lang='ja-JP';recognizer.interimResults=true;recognizer.continuous=false;
    recognizer.onresult=event=>{
      let transcript='';
      for(let i=0;i<event.results.length;i++)transcript+=event.results[i][0]?.transcript||'';
      input.value=before+(before&&transcript?' ':'')+transcript;
    };
    recognizer.onerror=()=>{help.textContent='音声認識に失敗しました。キーボードで修正できます。'};
    recognizer.onend=()=>{session=null;button.textContent='マイクで文字入力'};
    try{recognizer.start();session=recognizer;button.textContent='音声入力を停止'}
    catch{help.textContent='このブラウザでは音声入力を開始できません。'}
  };
  help.textContent+=' 音声認識はブラウザ提供元のサービスを使用する場合があります。結果を確認してから記録してください。録音は保存しません。';
  return ()=>{session?.abort();button.onclick=null};
}
