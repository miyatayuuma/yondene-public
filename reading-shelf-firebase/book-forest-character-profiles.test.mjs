import test from 'node:test';
import assert from 'node:assert/strict';
import {parseForestCharacterProfiles,validForestCharacterProfiles,
  forestCharacterVoiceGuide} from './book-forest-character-profiles.mjs';

const people=[['NPC ID','人物像の要約','大切にすること','望み・動機','関係性','普段の行動',
  '状況への反応','原作確認'],
  ['jiji','黒猫の相棒','仲間を守る','身近なものを観察','キキ','荷物を見る','軽く冗談を言う','確認済'],
  ['unknown','未知の人','', '', '', '', '', '確認済']];
const voices=[['NPC／会話ID','一人称','相手の呼び方','基本口調・テンポ',
  '語尾（使用条件）','口癖と使用頻度','言い回しの特徴','感情による変化',
  '避ける表現・NG','監修状態'],
  ['jiji','ぼく','キキ','短い観察の言葉','機械的な猫語なし','繰り返さない',
    'ときに皮肉','心配を隠す','相談員のように話さない','検証中']];

test('private settings join by stable character ID and never expose unsupported identities',()=>{
  const profiles=parseForestCharacterProfiles(people,voices);
  assert.equal(profiles.length,1);
  const guide=forestCharacterVoiceGuide(profiles[0]);
  assert.match(guide,/一人称:ぼく/);
  assert.match(guide,/関係性:キキ/);
  assert.match(guide,/禁止・注意:相談員のように話さない/);
  assert.doesNotMatch(guide,/原作文/);
  assert.equal(validForestCharacterProfiles(profiles).length,1);
  assert.match(forestCharacterVoiceGuide({...profiles[0],firstPerson:'ぼく（第5巻で確認）'}),/一人称:ぼく\n/);
});

test('Zukkoke friends remain three independent private character profiles',()=>{
  const ids=['hachibee','hakase','mochan'];
  const characterRows=ids.map(id=>[id,id+'の人物像','大切なこと','願い','友だち',
    '行動','反応','確認済']);
  const speechRows=ids.map(id=>[id,'ぼく（仮案）','友だち','それぞれ違う声',
    '語尾未照合','頻度低め','短い言葉','戸惑い','同一口調にしない','検証中']);
  const profiles=parseForestCharacterProfiles([people[0],...characterRows],
    [voices[0],...speechRows]);
  assert.deepEqual(profiles.map(p=>p.id),ids);
  assert.equal(validForestCharacterProfiles(profiles).length,3);
});

test('missing sheet columns, unverified identities, malformed or oversized profiles fail closed',()=>{
  assert.deepEqual(parseForestCharacterProfiles([['違うヘッダー']],voices),[]);
  assert.deepEqual(parseForestCharacterProfiles(people,[['誤ったヘッダー']]),[]);
  assert.deepEqual(parseForestCharacterProfiles(people.map((row,i)=>i===1?
    [...row.slice(0,-1),'未確認']:row),voices),[]);
  const oversized={...parseForestCharacterProfiles(people,voices)[0],avoid:'x'.repeat(261)};
  assert.deepEqual(validForestCharacterProfiles([oversized]),[]);
  assert.equal(forestCharacterVoiceGuide(oversized),'');
});
