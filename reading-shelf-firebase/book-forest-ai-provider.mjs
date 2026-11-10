// Firebase AI Logic: Spark / Gemini Developer API only. No API key is embedded
// here; App Check must be registered and enforced before enabling this feature.
const CDN='https://www.gstatic.com/firebasejs/13.0.0/';

export async function createForestAIGenerator({firebaseApp,siteKey,modelId='gemini-3.8-flash',
  loadAppCheck=()=>import(CDN+'firebase-app-check.js'),
  loadAI=()=>import(CDN+'firebase-ai.js')}={}){
  if(!firebaseApp||typeof siteKey!=='string'||siteKey.length<20||
    !/^gemini-[a-z0-9.-]+$/u.test(modelId))throw Error('Firebase AI Logic と App Check の設定が必要です');
  const [{initializeAppCheck,ReCaptchaEnterpriseProvider},
    {getAI,getGenerativeModel,GoogleAIBackend}]=await Promise.all([loadAppCheck(),loadAI()]);
  initializeAppCheck(firebaseApp,{provider:new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled:true});
  const ai=getAI(firebaseApp,{backend:new GoogleAIBackend()});
  const model=getGenerativeModel(ai,{model:modelId,generationConfig:{
    responseMimeType:'application/json',maxOutputTokens:480,temperature:.75}});
  return async prompt=>{
    const result=await model.generateContent(JSON.stringify(prompt));
    const text=result?.response?.text?.();
    if(typeof text!=='string'||text.length>3000)throw Error('Invalid AI response');
    return JSON.parse(text);
  };
}
