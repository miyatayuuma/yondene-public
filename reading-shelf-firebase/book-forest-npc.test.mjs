import test from 'node:test';
import assert from 'node:assert/strict';
import {CHARACTERS,isWalkable} from './book-forest-world.mjs';
import {createForestNpcMotion} from './book-forest-npc.mjs';

test('NPCs keep their given sizes and the second twin reuses a single sprite/dialogue identity',()=>{
  assert.deepEqual(Object.fromEntries(CHARACTERS.map(c=>[c.id,c.scale])),{
    king:1.2,cat:.7,kiki:1,jiji:.5,skipper:.8,twins:.8,twins_second:.8,
    zorori:1.2,ishishi:.8,noshishi:.8
  });
  assert.equal(CHARACTERS.find(c=>c.id==='twins_second').spriteId,'twins');
  assert.equal(CHARACTERS.find(c=>c.id==='twins_second').dialogueId,'twins');
  assert.equal(CHARACTERS.length,10);
});

test('NPCs stroll, pause and stay in a small walkable home territory',()=>{
  const actors=CHARACTERS.map(c=>({...c,moving:false})),homes=actors.map(a=>({x:a.x,z:a.z}));
  const motion=createForestNpcMotion(actors,isWalkable),moved=new Set(),paused=new Set();
  for(let tick=0;tick<3600;tick++){
    motion.step(.05,{playerX:0,playerZ:0});
    for(let i=0;i<actors.length;i++){
      const a=actors[i],origin=homes[i];
      if(a.moving)moved.add(a.id);else paused.add(a.id);
      assert.ok(Math.hypot(a.x-origin.x,a.z-origin.z)<=a.roamRadius+.001,a.id+' outside home');
      assert.ok(isWalkable(a.x,a.z),a.id+' stepped into a wall or water');
    }
  }
  // Some regions contain houses or bends. All characters should still find a path.
  assert.deepEqual([...moved].sort(),actors.map(a=>a.id).sort());
  assert.deepEqual([...paused].sort(),actors.map(a=>a.id).sort());
});

test('the conversation partner and approached actors stop without freezing the whole forest',()=>{
  const actors=CHARACTERS.map(c=>({...c,moving:false}));
  const motion=createForestNpcMotion(actors,isWalkable);
  for(let i=0;i<500;i++)motion.step(.05,{playerX:100,playerZ:100});
  const king=actors.find(a=>a.id==='king'),cat=actors.find(a=>a.id==='cat');
  const kingBefore={x:king.x,z:king.z},catBefore={x:cat.x,z:cat.z};
  for(let i=0;i<500;i++)motion.step(.05,{playerX:king.x,playerZ:king.z,activeId:'king'});
  assert.deepEqual([king.x,king.z],[kingBefore.x,kingBefore.z]);
  assert.ok(Math.hypot(cat.x-catBefore.x,cat.z-catBefore.z)>0.1,'other actors remain free');
});

test('twins wander together and both stop when either twin is approached',()=>{
  const actors=CHARACTERS.map(c=>({...c,moving:false})),motion=createForestNpcMotion(actors,isWalkable);
  const first=actors.find(a=>a.id==='twins'),second=actors.find(a=>a.id==='twins_second');
  const [dx,dz]=[second.x-first.x,second.z-first.z];
  let moves=0;
  for(let i=0;i<2500;i++){
    motion.step(.05,{playerX:-90,playerZ:-90});
    assert.ok(Math.abs((second.x-first.x)-dx)<1e-8);
    assert.ok(Math.abs((second.z-first.z)-dz)<1e-8);
    assert.equal(second.moving,first.moving);
    if(first.moving)moves++;
    assert.ok(isWalkable(first.x,first.z)&&isWalkable(second.x,second.z));
  }
  assert.ok(moves>0,'twins should not become a static decoration');
  const before=[first.x,first.z,second.x,second.z];
  for(let i=0;i<200;i++)motion.step(.05,{playerX:second.x,playerZ:second.z,
    activeId:'twins_second'});
  assert.deepEqual([first.x,first.z,second.x,second.z],before);
});
