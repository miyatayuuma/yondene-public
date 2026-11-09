import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GLTFLoader} from './vendor/three/GLTFLoader.js';
import {createForestScene} from './book-forest-scene.mjs';
import {START,CHARACTERS,isWalkable} from './book-forest-world.mjs';
import {createForestNpcMotion} from './book-forest-npc.mjs';

test('actual GLB assets build and all representative months update without WebGL',async()=>{
  // Geometry, asset parsing and scene construction are real; the renderer and
  // image decoding are substitutes. This is not a visual or GPU acceptance test.
  globalThis.self=globalThis;globalThis.devicePixelRatio=1;
  globalThis.createImageBitmap=async()=>({width:2,height:2,close(){}});
  const names=['tree-oak','tree-detailed','tree-default','tree-pinedefaulta','plant-bushdetailed','grass-large','grass','flower-reda','flower-yellowa','flower-purplea','rock-largea','rock-largeb','stump-old','log-large','mushroom-redgroup','fence-simple','house','hall'];
  const loader=new GLTFLoader(),assets={};
  for(const name of names){
    const path=`./forest-assets/${name==='house'||name==='hall'?'':'nature/'}${name}.glb`;
    const bytes=await readFile(new URL(path,import.meta.url));
    const data=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
    const gltf=await new Promise((resolve,reject)=>loader.parse(data,'',resolve,reject));assets[name]=gltf.scene;
  }
  const renderer={setPixelRatio(){},dispose(){this.disposed=true}};
  const world=await createForestScene({},4,{load:async()=>assets,makeRenderer:()=>renderer});
  let instanced=0,trees=0;world.scene.traverse(obj=>{if(obj.isInstancedMesh){instanced++;trees+=obj.count}});
  assert.ok(instanced>=15);assert.ok(trees>1000);
  for(const month of [1,4,7,10,12]){world.setMonth(month);world.animate(3.1)}
  assert.ok(world.treeObstacles.length>100);
  const queue=[[START.x,START.z]],seen=new Set([queue[0].join(',')]);
  for(let i=0;i<queue.length;i++){
    const [x,z]=queue[i];for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx,nz=z+dz,key=nx+','+nz;
      if(!seen.has(key)&&isWalkable(nx,nz)&&!world.treeObstacles.some(t=>Math.hypot(nx-t.x,nz-t.z)<t.r)){
        seen.add(key);queue.push([nx,nz]);
      }
    }
  }
  for(const c of CHARACTERS)assert.ok(queue.some(([x,z])=>Math.hypot(x-c.x,z-c.z)<6),c.id);
  const canWalk=(x,z)=>isWalkable(x,z)&&!world.treeObstacles.some(t=>Math.hypot(x-t.x,z-t.z)<t.r);
  const actors=CHARACTERS.map(c=>({...c,moving:false})),motion=createForestNpcMotion(actors,canWalk),moving=new Set();
  for(let i=0;i<1600;i++){
    motion.step(.05,{playerX:START.x,playerZ:START.z});
    for(const actor of actors)if(actor.moving)moving.add(actor.id);
  }
  for(const actor of actors){
    assert.ok(moving.has(actor.id),`${actor.id} should be able to roam around real tree obstacles`);
    assert.ok(canWalk(actor.x,actor.z),`${actor.id} should not end up inside a tree`);
  }
  world.dispose();assert.equal(renderer.disposed,true);
});
