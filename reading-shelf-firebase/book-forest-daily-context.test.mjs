import test from 'node:test';
import assert from 'node:assert/strict';
import {forestDailyScene,createForestDailyContextSession} from './book-forest-daily-context.mjs';

function storage(){
  const values=new Map();
  return {getItem:key=>values.get(key)||null,
    setItem:(key,value)=>values.set(key,value),values};
}

test('every character has a different context, which rotates predictably the next day',()=>{
  const today=Date.UTC(2026,10,11,13);
  for(const npc of ['king','kiki','jiji','skipper','zorori','ishishi','noshishi']){
    const a=forestDailyScene(npc,today),b=forestDailyScene(npc,today+86400000);
    assert.ok(a.focus&&a.tone);
    assert.notEqual(a.id,b.id,`${npc} must have new subject tomorrow`);
    assert.notEqual(a.id,forestDailyScene(npc,today+6*86400000).id,
      `${npc} must also have a different scene atmosphere next week`);
    assert.deepEqual(forestDailyScene(npc,today),a);
  }
  assert.notEqual(forestDailyScene('kiki',today).focus,forestDailyScene('jiji',today).focus);
  assert.equal(forestDailyScene('cat',today),null,'cat never generates human dialogue');
});

test('meeting a related NPC after selecting a response carries only that game choice',()=>{
  const local=storage(),time=Date.UTC(2026,10,11,13);
  const scenes=createForestDailyContextSession({storage:local,now:()=>time});
  const kiki=scenes.visit('kiki');
  assert.equal(kiki.relatedEncounter,null);
  scenes.selected('kiki','ジジと話してみる');
  const jiji=scenes.visit('jiji');
  assert.equal(jiji.previousNpc,'kiki');
  assert.deepEqual(jiji.relatedEncounter,{npc:'kiki',
    selectedLabel:'ジジと話してみる',scene:kiki.scene.id});
  const zorori=scenes.visit('zorori');
  assert.equal(zorori.relatedEncounter,null,'unrelated conversation is not invented');
  assert.equal(zorori.metNpcCount,3);
  const json=local.getItem('forest-daily-context-v1');
  assert.equal(json.includes('ジジと話してみる'),true);
  assert.equal(json.includes('bookId'),false);
  assert.equal(json.includes('childReflection'),false);
});

test('daily encounter continuity resets on the Japanese calendar day',()=>{
  const local=storage();let timestamp=Date.UTC(2026,10,11,14);
  const scenes=createForestDailyContextSession({storage:local,now:()=>timestamp});
  scenes.visit('zorori');scenes.selected('zorori','これがいい');
  const sameDay=scenes.visit('ishishi');
  assert.equal(sameDay.relatedEncounter.selectedLabel,'これがいい');
  timestamp+=86400000;
  const followingDay=scenes.visit('ishishi');
  assert.equal(followingDay.visitsToday,1);
  assert.equal(followingDay.relatedEncounter,null);
  assert.notEqual(followingDay.scene.id,sameDay.scene.id);
});
