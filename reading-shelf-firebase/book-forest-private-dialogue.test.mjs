import test from 'node:test';
import assert from 'node:assert/strict';
import {loadPrivateForestDialogue,parseForestDialogueRows,parseTwinNameRows,parseTwinSceneRows} from './book-forest-private-dialogue.mjs';
import {saveCachedForestDialogue,loadCachedForestDialogue,clearCachedForestDialogue} from './book-forest-dialogue-cache.mjs';
import {parseForestCharacterProfiles} from './book-forest-character-profiles.mjs';

const headers=['schemaVersion','cueId','npcId','kind','bookId','memoryId','fromNpc','text','choicesJson','approval'];
const values=[headers,[1,'test-meet','king','meet','','','','こんにちは','', 'approved'],
  [1,'test-review','cat','story','','mem-1','','（ねこは庭の絵を描き、前足で水を示す。）','', 'approved'],
  [1,'test-rejected','king','meet','','','','未承認です','', 'draft']];
const fact=[['schemaVersion','memoryId','bookId','bookTitle','text','tags','characters','spoilerLevel','evidenceStatus','confidence','sourceUrl'],
  [1,'mem-1','test-book','架空の本','友だちが庭に水をまいた','庭','king',1,'approved','high','https://example.org/book']];
const twinNames=[['schemaVersion','pairId','firstName','secondName','approval'],
  [1,'pair-a','テストA','テストB','approved']];
const twinTalk=[['schemaVersion','sceneId','sequence','speakerSlot','text','bookId','memoryId','choicesJson','approval'],
  [1,'intro',1,0,'あ、だれか来た！','','','','approved'],
  [1,'intro',2,1,'わたしは{firstName}。','','','','approved'],
  [1,'intro',3,2,'わたしは{secondName}！','','','','approved'],
  [1,'field',1,1,'あの葉っぱ！','','','','approved'],
  [1,'field',2,2,'すごいね。','','','','approved'],
  [1,'field',3,1,'ほんとだ。','','','','approved']];
const seeds=[['種ID','書籍ID','書名','物語記憶ID','感想ID（任意）','原作の事実（承認済み要約）',
  '感想からの着眼点（解釈）','思考の問い','対立する見方','テーマタグ',
  'キャラごとの視点ヒント','ネタバレ度','利用状態','原作出典URL','編集・照合メモ',
  '選抜回数','実表示回数','台帳作成日'],
  ['seed-test-1','test-book','架空の本','mem-1','','庭に水をまいた','','水を分けるってどういうこと？',
    'ひとりじめする／分け合う','友情','相手を思う',1,'使用可','https://example.org/book','',0,0,'2026-11-10']];
const characters=[['NPC ID','表示名','登場作品・シリーズ','人物像の要約','大切にすること',
  '望み・動機','関係性','普段の行動','状況への反応','原作確認','設定版','作業メモ'],
  ['jiji','ジジ','架空の本','目をよく配る相棒','仲間','助けたい','キキ','周りを見る',
    '必要なときだけ忠告','確認済','test','']];
const speech=[['NPC／会話ID','一人称','相手の呼び方','基本口調・テンポ','語尾（使用条件）',
  '口癖と使用頻度','言い回しの特徴','感情による変化','避ける表現・NG','根拠資料ID','監修状態'],
  ['jiji','ぼく','キキ','観察して短く話す','固定しない','口癖はなし',
    '短い比喩','必要な時は真剣','やさしい相談員にならない','test','検証中']];
const packageData={catalog:[{schemaVersion:1,id:'mem-1',bookId:'test-book',bookTitle:'架空の本',
  text:'友だちが庭に水をまいた',tags:'庭',characters:'king',spoilerLevel:1,
  evidenceStatus:'approved',confidence:'high',sourceUrl:'https://example.org/book'}],
  cues:parseForestDialogueRows(values),twinNames:parseTwinNameRows(twinNames),
  twinScenes:parseTwinSceneRows(twinTalk),thoughtSeeds:[],
  characterProfiles:parseForestCharacterProfiles(characters,speech)};

test('only approved, valid authored dialogue lines load from the private sheet',()=>{
  assert.deepEqual(packageData.cues.map(x=>x.id),['test-meet','test-review']);
  assert.equal(parseForestDialogueRows([['x','y'],[1,2]]).length,0);
  assert.equal(packageData.twinNames.length,1);
  assert.equal(packageData.twinScenes.length,2);
});

test('Drive lookup and Google Sheets batchGet are owner-authorized, bounded, and do not disclose IDs in source',async()=>{
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    const data=calls.length===1?{files:[{name:'よんでね｜本の森 キャラクター設定・セリフ台帳',
      mimeType:'application/vnd.google-apps.spreadsheet',id:'x'.repeat(40)}]}:
      {valueRanges:[{values:fact},{values},{values:twinNames},{values:twinTalk},{values:seeds},
        {values:characters},{values:speech}]};
    return {ok:true,text:async()=>JSON.stringify(data)};
  };
  const result=await loadPrivateForestDialogue('test-token',{fetchImpl});
  assert.equal(result.catalog.length,1);
  assert.equal(result.cues.length,2);
  assert.equal(result.twinNames.length,1);
  assert.equal(result.twinScenes.length,2);
  assert.equal(result.thoughtSeeds.length,1);
  assert.equal(result.characterProfiles[0].firstPerson,'ぼく');
  assert.match(calls[0].url,/drive\/v3\/files/);
  assert.match(calls[1].url,/sheets\.googleapis\.com\/v4\/spreadsheets/);
  assert.equal(calls[1].options.headers.Authorization,'Bearer test-token');
  assert.ok(!calls[0].url.includes('test-book'));
});

test('private conversation cache uses owner scope and clears on command',async()=>{
  const collections=new Map();
  const storage={
    keys:async()=>[...collections.keys()],
    open:async name=>{
      if(!collections.has(name))collections.set(name,new Map());
      return {put:async(k,v)=>collections.get(name).set(k,v),
        match:async k=>collections.get(name).get(k)};
    },
    delete:async name=>collections.delete(name)
  };
  assert.equal(await loadCachedForestDialogue({uid:'user-1',familyId:'family-1',cacheStorage:storage}),null);
  await saveCachedForestDialogue({uid:'user-1',familyId:'family-1',packageData,cacheStorage:storage});
  const recovered=await loadCachedForestDialogue({uid:'user-1',familyId:'family-1',cacheStorage:storage});
  assert.equal(recovered.catalog[0].id,'mem-1');
  assert.equal(recovered.twinScenes[0].id,'intro');
  assert.deepEqual(recovered.thoughtSeeds,[]);
  assert.equal(recovered.characterProfiles[0].id,'jiji');
  assert.equal(await loadCachedForestDialogue({uid:'user-2',familyId:'family-1',cacheStorage:storage}),null);
  await clearCachedForestDialogue({uid:'user-1',familyId:'family-1',cacheStorage:storage});
  assert.equal(await loadCachedForestDialogue({uid:'user-1',familyId:'family-1',cacheStorage:storage}),null);
});

test('ambiguous or missing private sheet never uses a guessed ID',async()=>{
  const fakeFetch=async()=>({ok:true,text:async()=>JSON.stringify({files:[]})});
  await assert.rejects(loadPrivateForestDialogue('token',{fetchImpl:fakeFetch}),/一意に特定/);
});
