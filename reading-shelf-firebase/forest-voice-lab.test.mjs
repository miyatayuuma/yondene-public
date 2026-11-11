import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const file=relative=>fileURLToPath(new URL(relative,import.meta.url));
const html=readFileSync(file('./forest-voice-lab.html'),'utf8');
const source=readFileSync(file('./book-forest-voice.mjs'),'utf8').replace(/^export /gm,'');
const ui=readFileSync(file('../scripts/forest-voice-lab-ui.js'),'utf8');
const template=readFileSync(file('../scripts/forest-voice-lab.template.html'),'utf8');

test('the standalone lab is generated from the actual engine and UI source',()=>{
  assert.equal(html,template.replace('/* FOREST_VOICE_ENGINE */',source).replace('/* FOREST_VOICE_LAB_UI */',ui));
  assert.match(html,/<title>本の森｜声の実験室<\/title>/);
});

test('the lab runs offline without Firebase, external assets or AI API calls',()=>{
  assert.doesNotMatch(html,/<script\s+[^>]*src=/i);
  assert.doesNotMatch(html,/<link\s+[^>]*href=/i);
  assert.doesNotMatch(html,/\bfetch\s*\(|XMLHttpRequest|firebase\.app|cloudfunctions\.net/);
  for(const id of ['character','line','voice','rate','pitch','volume','playA','playB','stop','saveB','exportSettings']){
    assert.match(html,new RegExp(`id="${id}"`));
  }
});
