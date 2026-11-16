import test from 'node:test';
import assert from 'node:assert/strict';
import {parseForestThoughtSeeds,availableForestThoughtSeeds,selectForestThoughtSeed,
  createForestThoughtSession,forestThoughtPrompt} from './book-forest-thought-seeds.mjs';

const header=['種ID','書籍ID','書名','物語記憶ID','感想ID（任意）','原作の事実（承認済み要約）',
  '感想からの着眼点（解釈）','思考の問い','対立する見方','テーマタグ',
  'キャラごとの視点ヒント','ネタバレ度','利用状態','原作出典URL','編集・照合メモ',
  '選抜回数','実表示回数','台帳作成日'];
const row=(id,bookId,memoryId,status='使用可',usage=0)=>
  [id,bookId,'テストの本',memoryId,'','庭に花を植えた','','一人でやるか、手伝ってもらうか？',
    '自力と協力','友情','工夫すること',1,status,'https://example.org/source','',usage,usage,''];
const seeds=parseForestThoughtSeeds([header,row('s1','book-1','mem-1'),
  row('s2','book-2','mem-2'),row('s3','book-1','mem-3','感想要確認')]);
const catalog=[1,2].map(n=>({schemaVersion:1,id:`mem-${n}`,bookId:`book-${n}`,
  text:'庭に花を植えた',spoilerLevel:1,evidenceStatus:'approved',confidence:'high',
  sourceUrl:'https://example.org/source'}));
const books=[1,2].map(n=>({id:`book-${n}`,status:'read'}));
const storage=()=>{const map=new Map();return {
  getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),map};};

test('only usable sourced seeds parse; unverifiable/unread books are revoked',()=>{
  assert.deepEqual(seeds.map(item=>item.id),['s1','s2']);
  assert.deepEqual(availableForestThoughtSeeds({books,catalog,seeds}).map(x=>x.id),['s1','s2']);
  assert.deepEqual(availableForestThoughtSeeds({books:[{id:'book-1',status:'read'},
    {id:'book-2',status:'unread'}],catalog,seeds}).map(x=>x.id),['s1']);
  assert.equal(availableForestThoughtSeeds({books,catalog:[],seeds}).length,0);
  assert.equal(parseForestThoughtSeeds([['wrong','header']]).length,0);
});

test('one stable Japanese-day theme for any order of NPCs; recent topics rotate',()=>{
  const first=selectForestThoughtSeed({books,catalog,seeds,now:Date.UTC(2026,10,10,13)});
  const same=selectForestThoughtSeed({books,catalog,seeds,now:Date.UTC(2026,10,10,14),
    state:{day:first.day,seedId:first.seed.id},characterId:'jiji'});
  assert.equal(first.seed.id,same.seed.id);
  assert.equal(first.day,'2026-11-10');
  const next=selectForestThoughtSeed({books,catalog,seeds,now:Date.UTC(2026,10,11,13),
    state:{recent:[first.seed.id]}});
  assert.notEqual(next.seed.id,first.seed.id);
});

test('daily theme visits are bounded and log selection separately from display',()=>{
  const local=storage(),clock=()=>Date.UTC(2026,10,10,13);
  const session=createForestThoughtSession({storage:local,now:clock});
  const first=session.choose({books,catalog,seeds,characterId:'kiki'});
  assert.equal(first.visit,1);
  assert.equal(session.events().length,0);
  session.selected(first,'kiki');
  assert.equal(session.events().length,1);
  session.displayed(first,'kiki');session.displayed(first,'kiki');
  assert.equal(session.events().length,2,'render callbacks are idempotent');
  const second=session.choose({books,catalog,seeds,characterId:'jiji'});
  assert.equal(second.seed.id,first.seed.id);
  assert.equal(second.previousNpc,'kiki');
  assert.equal(second.visit,1);
  assert.deepEqual(forestThoughtPrompt(first,'kiki'),forestThoughtPrompt(second,'jiji'),
    'the private fact stays neutral; the separate NPC profile determines the voice');
  session.choose({books,catalog,seeds,characterId:'kiki'});
  assert.equal(session.choose({books,catalog,seeds,characterId:'kiki'}).allowGeneration,false);
});

test('no book IDs, remarks, or reader data are included in the LLM topic',()=>{
  const result=selectForestThoughtSeed({books,catalog,seeds});
  const prompt=forestThoughtPrompt(result,'kiki');
  assert.ok(prompt.fact.includes('庭に花'));
  assert.equal(prompt.question,undefined);
  assert.equal(prompt.philosophy,undefined);
  assert.equal(JSON.stringify(prompt).includes('book-1'),false);
  assert.equal(JSON.stringify(prompt).includes('mem-1'),false);
  assert.equal(JSON.stringify(prompt).includes('s1'),false);
});
