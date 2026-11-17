import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from './vendor/three/three.module.js';
import {validateForestGestureMark,validateForestGestureText,FOREST_GRADE_ONE_KANJI} from './book-forest-gesture.mjs';
import {createForestCatWriting} from './book-forest-cat-writing.mjs';

test('written marks accept hiragana and all 80 grade-one kanji, but never higher grades',()=>{
  assert.equal(FOREST_GRADE_ONE_KANJI.length,80);
  assert.equal(new Set([...FOREST_GRADE_ONE_KANJI]).size,80);
  for(const word of ['こっち','またね','おはよう','おーい','木','王さま、雨がふりそう。','森へいこう！']){
    assert.deepEqual(validateForestGestureMark({surface:'ground',word}),{surface:'ground',word});
  }
  for(const word of ['Hello','猫','読','道','前','カタカナ','１２３','', 'あ'.repeat(49),'あ い','おうさま「おかえり」','！']){
    assert.equal(validateForestGestureMark({surface:'ground',word}),undefined,word);
  }
  assert.equal(validateForestGestureMark({surface:'lake',word:'こっち'}),undefined);
  assert.equal(validateForestGestureMark(null),null);
  assert.equal(validateForestGestureMark({surface:'leaf',word:'またね'}).word,'またね');
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

test('generated marks appear on ground or leaf, never arbitrary HTML, and dispose cleanly',()=>{
  const painted=[];
  const canvas=()=>({width:0,height:0,getContext:()=>({
    clearRect(){},fillRect(){},beginPath(){},ellipse(){},fill(){},stroke(){},
    moveTo(){},lineTo(){},fillText(word){painted.push(word)}
  })});
  const scene=new THREE.Scene();
  const writing=createForestCatWriting({THREE,scene,walkHeight:()=>1,createCanvas:canvas});
  assert.equal(writing.show({surface:'ground',word:'こっち'},{x:2,z:4}),true);
  assert.equal(painted[0],'こっち');
  assert.equal(scene.children.length,1);
  assert.equal(scene.children[0].name,'forest-cat-writing');
  assert.ok(Math.abs(scene.children[0].position.y-1.17)<.001);
  const old=scene.children[0];
  assert.equal(writing.show({surface:'leaf',word:'またね'},{x:3,z:5}),true);
  assert.ok(!scene.children.includes(old),'old mark is removed before writing again');
  assert.equal(painted[1],'またね');
  const message='おうさま、むこうのはしはすべるよ。みぎからまわろう。';
  assert.equal(writing.show({surface:'note',word:message},{x:2,z:4}),true);
  assert.deepEqual(painted.slice(2).join(''),message,'the legible message is wrapped without losing a character');
  assert.ok(painted.slice(2).length>=2,'meaningful notes use multiple lines');
  assert.equal(writing.show({surface:'ground',word:'abc'},{x:2,z:4}),false);
  assert.equal(scene.children.length,0,'invalid writing is never shown');
  writing.dispose();
  assert.equal(scene.children.length,0);
});
