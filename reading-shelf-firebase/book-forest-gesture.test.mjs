import test from 'node:test';
import assert from 'node:assert/strict';
import {validateForestGestureMark,validateForestGestureText,validateForestWrittenTurn,FOREST_GRADE_ONE_KANJI} from './book-forest-gesture.mjs';

test('written marks accept hiragana and all 80 grade-one kanji, but never higher grades',()=>{
  assert.equal(FOREST_GRADE_ONE_KANJI.length,80);
  assert.equal(new Set([...FOREST_GRADE_ONE_KANJI]).size,80);
  for(const word of ['こっち','またね','おはよう','おーい','木','王さま、雨がふりそう。','森へいこう！']){
    assert.deepEqual(validateForestGestureMark({surface:'ground',word}),{surface:'ground',word});
  }
  for(const word of ['Hello','猫','読','道','前','カタカナ','１２３','', 'あ'.repeat(49),'あ\nい','おうさま「おかえり」','！']){
    assert.equal(validateForestGestureMark({surface:'ground',word}),undefined,word);
  }
  assert.equal(validateForestGestureMark({surface:'lake',word:'こっち'}),undefined);
  assert.equal(validateForestGestureMark(null),null);
  assert.equal(validateForestGestureMark({surface:'leaf',word:'またね'}).word,'またね');
  assert.equal(validateForestGestureMark({surface:'note',word:'木の 上を　見て。'}).word,'木の上を見て。');
  const note='おうさま、いそがなくていいよ。ひとつずつやればだいじょうぶ！';
  assert.deepEqual(validateForestGestureMark({surface:'note',word:note}),
    {surface:'note',word:note});
  assert.equal(validateForestGestureMark({surface:'ground',word:'こんにちは！'}).word,'こんにちは！');
  assert.equal(validateForestGestureText('（ねこはまえあしでじめんをなぞった。）'),true);
  for(const value of ['こんにちは！','（ねこは「はい」としゃべった。）',
    '（ねこは声を出して話しかけた。）','（ねこは言う。）',
    '（ねこはあるく）<script>','（あ）']){
    assert.equal(validateForestGestureText(value),false,value);
  }
});

test('nonverbal cat narration accepts varied subjects and omitted subjects, but never speech or inner voice',()=>{
  const natural=[
    '（紙の上に道順を書いて、王さまに差し出した。）',
    '（小川のそばで立ち止まり、流れる葉をじっと見つめる。）',
    '（王さまの落とした鍵を拾い、手の届く場所に置いた。）',
    '（朝日が差す中、ねこは窓を開けて空気を入れ替えた。）',
    '（ねこは小さな紙に道順を書き、机の上へ置いた。）'
  ];
  for(const text of natural)assert.equal(validateForestGestureText(text),true,text);
  const invalid=[
    '（こんにちは！）',
    '（ねこは心の中で王さまに返事をした。）',
    '（困ったな、と心の中で思った。）',
    '（ねこは王さまに向かっておはようと言った。）',
    '（足を止めて「こっちだよ」と呼びかけた。）',
    '（ねこは頭の中で答えをつぶやいた。）',
    '（道の上に（ひみつ）の印を残した。）',
    '（紙の上に道順を書き、机に置いた。)<script>',
    '（紙の上に道順を\n書いて差し出した。）',
    '（紙の上に道順を書いて差し出した。）'.repeat(4)
  ];
  for(const text of invalid)assert.equal(validateForestGestureText(text),false,text);
  assert.equal(validateForestGestureMark(null),null,'writing stays optional');
});

test('writing is paired with visible dialogue and shares one length budget',()=>{
  const action='（ねこは紙に書いて、こちらへ見せた。）';
  const mark={surface:'note',word:'王さま、きょうはどこへいくの？'};
  assert.deepEqual(validateForestWrittenTurn(action,mark),{text:action,mark});
  assert.equal(validateForestWrittenTurn(action,null),null);
  assert.deepEqual(validateForestWrittenTurn('(ねこは紙に書いて、こちらへ見せた。)',mark),{text:action,mark});
  assert.equal(validateForestWrittenTurn('(心の中で王さまに返事をした。)',null),null);
  assert.equal(validateForestWrittenTurn('（ねこは葉っぱにちいさくかいた。）',null),null);
  const resting='（ねこは王さまのとなりにすわった。）';
  assert.deepEqual(validateForestWrittenTurn(resting,null),{text:resting,mark:null});
  assert.equal(validateForestWrittenTurn(resting,mark),null);
  assert.equal(validateForestWrittenTurn('（'+ 'あ'.repeat(64)+'と書いた。）',mark),null);
});
