import test from 'node:test';
import assert from 'node:assert/strict';
import {validateForestWrittenTurn,FOREST_GRADE_ONE_KANJI,FOREST_WRITTEN_TURN_LIMIT} from './book-forest-gesture.mjs';

test('written dialogue accepts katakana names, spaces and the 80 grade-one kanji',()=>{
  assert.equal(new Set(FOREST_GRADE_ONE_KANJI).size,80);
  const text='キキ、ジジ、ゾロリ、ハチベエ。 みんなで 木の下に すわったら、王さままで きたとおもって、ぼくはびっくりしたよ。';
  assert.ok(text.length>48);
  for(const line of [text,'王さま、雨がふりそう。','あ'.repeat(FOREST_WRITTEN_TURN_LIMIT),
    ...FOREST_GRADE_ONE_KANJI]){
    assert.deepEqual(validateForestWrittenTurn(line,'written'),{text:line,delivery:'written'});
  }
  for(const line of ['Hello','猫','読','道','１２３','', '　！？', 'あ'.repeat(66),'あ'.repeat(101)]){
    assert.equal(validateForestWrittenTurn(line,'written'),null,line);
  }
  assert.deepEqual(validateForestWrittenTurn('雨だね。\n木の下で休もう。','written'),
    {text:'雨だね。 木の下で休もう。',delivery:'written'});
});

test('gestures permit brief natural narration without speech, thoughts or writing-only narration',()=>{
  for(const text of ['（うなずく）','（王さまの落とした鍵を拾った。）','（川の向こうをじっと見つめる。）']){
    assert.deepEqual(validateForestWrittenTurn(text,'gesture'),{text,delivery:'gesture'});
  }
  assert.deepEqual(validateForestWrittenTurn('(しっぽをふった。)','gesture'),
    {text:'（しっぽをふった。）',delivery:'gesture'});
  for(const text of ['こんにちは！','（こんにちは！）','（王さまに話しかけた。）',
    '（頭の中で答えをつぶやいた。）','（しっぽをふり「はい」と答えた。）',
    '（ねこは地面に文字を書いた。）','（葉っぱにちいさくかいた。）']){
    assert.equal(validateForestWrittenTurn(text,'gesture'),null,text);
  }
  assert.equal(validateForestWrittenTurn('こっちだよ。',undefined),null);
});

test('an optional silent annotation cannot displace or weaken validation of the written reply',()=>{
  const text='おしろのことは、わすれられない おもいでだね。';
  assert.deepEqual(validateForestWrittenTurn('（はっぱに字を書く） \n '+text,'written'),{text,delivery:'written'});
  assert.equal(validateForestWrittenTurn('（「やあ」と声を出した）\n'+text,'written'),null);
  assert.equal(validateForestWrittenTurn('（葉っぱに字を書く）\n完成したよ。','written'),null);
});


test('a written reply may use a verified reading of its unsupported kanji',()=>{
  const text='お城の ことは おぼえているよ。新しい 暮らしだったね。';
  const kana='おしろの ことは おぼえているよ。あたらしい くらしだったね。';
  assert.deepEqual(validateForestWrittenTurn(text,'written',kana),{text:kana,delivery:'written'});
  assert.equal(validateForestWrittenTurn(text,'written','もう わすれたよ。'),null);
  assert.equal(validateForestWrittenTurn(text,'written','おしろの ことは わすれているよ。あたらしい くらしだったね。'),null);
  assert.equal(validateForestWrittenTurn('（はっぱに 字を 書いた）','written','ここへ おいで。'),null);
});
