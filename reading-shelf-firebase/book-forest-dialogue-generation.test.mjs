import test from 'node:test';
import assert from 'node:assert/strict';
import {buildForestDialogueGenerationTask,auditForestDialogueCandidate,
  forestDialogueDraftSheetRow} from './book-forest-dialogue-generation.mjs';

const memory={id:'event-1',bookId:'fiction-book',text:'主人公は大きな舟を作った。',
  characters:'king',evidenceStatus:'approved',confidence:'high',
  sourceUrl:'https://example.org/fiction'};
const character={id:'king',name:'王さま',profile:'失敗を恐れず生活を学ぶ。',
  speechRules:'気取った言葉と素直な驚き。'};

test('generation task separates evidence from voice and never invents reader data',()=>{
  const task=buildForestDialogueGenerationTask({memory,character});
  assert.equal(task.fact.memoryId,'event-1');
  assert.match(task.fact.relation,/直接体験したかは別途確認/);
  assert.ok(task.requirements.some(x=>x.includes('丸写し')));
  assert.ok(!JSON.stringify(task).includes('childReflections'));
  assert.throws(()=>buildForestDialogueGenerationTask({memory:{...memory,evidenceStatus:'draft'},character}));
});

test('draft candidates reject synopsis interpolation and third-person self-reference',()=>{
  assert.deepEqual(auditForestDialogueCandidate({memory,characterId:'king',text:'王さまは舟を作った。'}).errors,
    ['third-person-self-narration']);
  assert.ok(auditForestDialogueCandidate({memory,characterId:'king',text:memory.text})
    .errors.includes('copied-synopsis'));
  assert.ok(auditForestDialogueCandidate({memory,characterId:'king',text:'{memory}'}).errors
    .includes('template-or-markup'));
});

test('cat action-only rule and draft-only storage gate',()=>{
  const catTask=buildForestDialogueGenerationTask({memory,character:{...character,id:'cat'}});
  assert.ok(catTask.requirements.some(x=>x.includes('話さない')));
  assert.ok(auditForestDialogueCandidate({memory,characterId:'cat',text:'こんにちは、ぼくはねこ。'})
    .errors.includes('cat-speaks'));
  const text='（ねこは舟を描き、前足でそっと押してみせた。）';
  const row=forestDialogueDraftSheetRow({memory,characterId:'cat',text});
  assert.equal(row[3],'story');
  assert.equal(row[5],'event-1');
  assert.equal(row[9],'draft');
});
