import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {START,CHARACTERS,MONTHS,monthInJapan,isWalkable,bridgeAt,heightAt,riverX,WATER_LEVEL,POND,BRIDGE_Z,HOUSES} from './book-forest-world.mjs';

test('Japan calendar drives twelve distinct seasonal profiles across a UTC month boundary',()=>{
  assert.equal(monthInJapan(new Date('2026-01-31T14:59:59Z')),1);
  assert.equal(monthInJapan(new Date('2026-01-31T15:00:00Z')),2);
  assert.equal(MONTHS.length,13);
  assert.equal(new Set(MONTHS.slice(1).map(x=>JSON.stringify(x))).size,12);
  assert.ok(MONTHS[1].snow>MONTHS[4].snow);
  assert.ok(MONTHS[4].flower>MONTHS[1].flower);
  assert.ok(MONTHS[7].leafScale>MONTHS[1].leafScale);
});

test('stream and pond beds remain below water, and bridge ends meet the banks',()=>{
  assert.ok(heightAt(POND.x,POND.z)<WATER_LEVEL);
  for(const z of BRIDGE_Z){
    const x=riverX(z);assert.ok(heightAt(x,z)<WATER_LEVEL);assert.ok(bridgeAt(x,z)>WATER_LEVEL);
    for(const dx of [-10.19,10.19])assert.ok(Math.abs(bridgeAt(x+dx,z)-heightAt(x+dx,z))<.03);
    assert.equal(isWalkable(x,z),true);
    assert.equal(isWalkable(x,z+10),false);
  }
});

test('the terrain beneath each house footprint has a stable foundation',()=>{
  for(const house of HOUSES){
    const width=(house.type==='hall'?.59:.40)*house.scale;
    const depth=(house.type==='hall'?.67:.46)*house.scale;
    const c=Math.cos(house.rotation),s=Math.sin(house.rotation),base=heightAt(house.x,house.z);
    for(const x of [-width,width])for(const z of [-depth,depth]){
      assert.ok(Math.abs(heightAt(house.x+c*x+s*z,house.z-s*x+c*z)-base)<.03,`${house.x},${house.z}`);
    }
  }
});

test('each character and both banks can be reached from the start on the navigation grid',()=>{
  const queue=[[Math.round(START.x),Math.round(START.z)]],seen=new Set([queue[0].join(',')]);
  for(let i=0;i<queue.length;i++){
    const [x,z]=queue[i];
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx,nz=z+dz,key=nx+','+nz;
      if(!seen.has(key)&&isWalkable(nx,nz)){seen.add(key);queue.push([nx,nz])}
    }
  }
  assert.equal(new Set(CHARACTERS.map(c=>c.id)).size,10);
  for(const c of CHARACTERS)assert.ok(queue.some(([x,z])=>Math.hypot(x-c.x,z-c.z)<6),c.id);
});

test('local 3D assets are self-contained GLBs and exclude external file references',()=>{
  for(const name of ['house.glb','hall.glb','nature/tree-oak.glb','nature/plant-bushdetailed.glb']){
    const bytes=readFileSync(new URL('./forest-assets/'+name,import.meta.url));
    assert.equal(bytes.toString('ascii',0,4),'glTF');
    const len=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+len).toString());
    assert.ok((gltf.images||[]).every(image=>!image.uri),name);
    assert.ok((gltf.buffers||[]).every(buffer=>!buffer.uri),name);
  }
});
