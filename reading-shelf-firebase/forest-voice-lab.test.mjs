import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {renderForestVoiceLab} from '../scripts/forest-voice-lab-source.mjs';

const file=relative=>fileURLToPath(new URL(relative,import.meta.url));
const html=readFileSync(file('./forest-voice-lab.html'),'utf8');
const registry=readFileSync(file('./forest-character-registry.mjs'),'utf8');
const source=readFileSync(file('./book-forest-voice.mjs'),'utf8');
const ui=readFileSync(file('../scripts/forest-voice-lab-ui.js'),'utf8');
const template=readFileSync(file('../scripts/forest-voice-lab.template.html'),'utf8');

test('the standalone lab is generated from the same character registry and engine',()=>{
  assert.equal(html,renderForestVoiceLab(template,registry,source,ui));
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
