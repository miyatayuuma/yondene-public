import test from 'node:test';
import assert from 'node:assert/strict';
import {validateForestWrittenTurn,FOREST_WRITTEN_TURN_LIMIT} from './book-forest-gesture.mjs';

test('written dialogue preserves Japanese text and its layout budget',()=>{
  const text='キキ、ジジ、ゾロリ、ハチベエ。 みんなで 木の下に すわったら、王さままで きたとおもって、ぼくはびっくりしたよ。';
  assert.ok(text.length>48);
  for(const line of [text,'お城のことは覚えているよ。','紙に書いた地図を覚えているよ。','東京都','あ'.repeat(FOREST_WRITTEN_TURN_LIMIT)]){
    assert.deepEqual(validateForestWrittenTurn(line,'written'),{text:line,delivery:'written'});
  }
  for(const line of ['Hello','１２３','', '　！？','<城>','あ'.repeat(66),'あ'.repeat(101)]){
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
  assert.deepEqual(validateForestWrittenTurn('（葉っぱに字を書く）\n完成したよ。','written'),
    {text:'完成したよ。',delivery:'written'});
});


test('silent delivery rejects explicit speech, inner monologue and writing-only narration',()=>{
  for(const text of ['猫は地面に文字を書いた。','地面に文字を書いた。','猫は声に出して答えた。',
    '猫は心の中で思った。','（猫はお城の名前を書いた。）','文字を書いた。']){
    assert.equal(validateForestWrittenTurn(text,'written'),null,text);
  }
});
