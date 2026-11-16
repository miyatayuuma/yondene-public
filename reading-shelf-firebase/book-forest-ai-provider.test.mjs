import test from 'node:test';
import assert from 'node:assert/strict';
import {createForestAIGenerator} from './book-forest-ai-provider.mjs';

test('Firebase AI Logic generator configures App Check, JSON response and bounded output',async()=>{
  const seen={},firebaseApp={name:'sample'};
  const generate=await createForestAIGenerator({firebaseApp,siteKey:'public-enterprise-site-key-1234',
    loadAppCheck:async()=>({ReCaptchaEnterpriseProvider:class{constructor(key){seen.siteKey=key}},
      initializeAppCheck(app,opts){seen.app=app;seen.appCheck=opts}}),
    loadAI:async()=>({GoogleAIBackend:class{},getAI(app,opts){seen.aiApp=app;seen.backend=opts.backend;return {sample:true}},
      getGenerativeModel(ai,config){seen.ai=ai;seen.config=config;return {
        async generateContent(prompt){seen.prompt=JSON.parse(prompt);return {response:{text:()=>
          JSON.stringify({choices:['なにをする？','どこに行く？']})}}}
      }}})});
  const result=await generate({task:'架空のテスト'});
  assert.deepEqual(result.choices,['なにをする？','どこに行く？']);
  assert.equal(seen.app,firebaseApp);
  assert.equal(seen.siteKey,'public-enterprise-site-key-1234');
  assert.equal(seen.appCheck.isTokenAutoRefreshEnabled,true);
  assert.equal(seen.config.model,'gemini-3.8-flash');
  assert.equal(seen.config.generationConfig.responseMimeType,'application/json');
  assert.ok(seen.config.generationConfig.maxOutputTokens<=500);
  assert.equal(seen.prompt.task,'架空のテスト');
});

test('provider refuses to start without registered App Check site key',async()=>{
  await assert.rejects(()=>createForestAIGenerator({firebaseApp:{},siteKey:''}),/App Check/);
});
