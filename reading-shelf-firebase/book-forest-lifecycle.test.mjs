import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from './vendor/three/three.module.js';
import {mountBookForest} from './book-forest.mjs';

class Element {
  constructor(tag){this.tagName=tag;this.children=[];this.style={};this.attributes={};this.dataset={};this.listeners={};this.className='';this.hidden=false;this.clientWidth=412;this.clientHeight=915;this.textContent='';}
  append(...nodes){this.children.push(...nodes)} replaceChildren(...nodes){this.children=nodes}
  remove(){this.removed=true} setAttribute(k,v){this.attributes[k]=v} focus(){} setPointerCapture(){}
  addEventListener(k,fn){(this.listeners[k]??=[]).push(fn)}
  getBoundingClientRect(){return {left:0,top:0,width:112,height:112}}
  getContext(){return {imageSmoothingEnabled:false,clearRect(){},drawImage(){draws++},fillRect(){},createRadialGradient(){return {addColorStop(){}}}}}
  click(){this.onclick?.({})}
}
let draws=0,callbacks=new Map(),id=0;
function environment(){
  const listeners={},windowListeners={};callbacks=new Map();id=0;draws=0;
  const document={body:new Element('body'),hidden:false,createElement:tag=>new Element(tag),
    addEventListener(k,fn){(listeners[k]??=[]).push(fn)},removeEventListener(k,fn){listeners[k]=(listeners[k]||[]).filter(f=>f!==fn)}};
  document.body.classList={add(){},remove(){}};
  globalThis.document=document;globalThis.window={devicePixelRatio:1,addEventListener(k,fn){(windowListeners[k]??=[]).push(fn)},removeEventListener(k,fn){windowListeners[k]=(windowListeners[k]||[]).filter(f=>f!==fn)}};
  globalThis.devicePixelRatio=1;globalThis.localStorage={getItem(){return null},setItem(){}};
  globalThis.ResizeObserver=class {observe(){} disconnect(){}};
  globalThis.requestAnimationFrame=cb=>{const key=++id;callbacks.set(key,cb);return key};globalThis.cancelAnimationFrame=key=>callbacks.delete(key);
  return {document,listeners,windowListeners,send(type,code){for(const fn of listeners[type]||[])fn({code,preventDefault(){},repeat:false})},
    tick(now){const [key,fn]=callbacks.entries().next().value;callbacks.delete(key);fn(now)}};
}
function find(el,klass){if(el.className===klass)return el;for(const child of el.children||[]){const hit=find(child,klass);if(hit)return hit}}
function fakeWorld(){
  const renderer={info:{render:{calls:1,triangles:10}},setSize(){},setPixelRatio(v){this.ratio=v},getPixelRatio(){return this.ratio||1},render(){},dispose(){this.disposed=true}};
  return {THREE,renderer,scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),treeObstacles:[],animate(){},setMonth(){},dispose(){renderer.dispose()}};
}
const images=Object.fromEntries(['king','cat','kiki','jiji','skipper','twins','zorori','ishishi','noshishi','player_cat'].map(id=>[id,{}]));

test('idle sprites stop; talking freezes movement and notifies the independent adapter',async()=>{
  const env=environment(),world=fakeWorld(),events=[];let api;
  const ready=new Promise(resolve=>{
    mountBookForest({familyId:'test',privateSprites:{images},dialogue:{start(info){events.push(['start',info]);return {text:'こんにちは',choices:[]}},end(info){events.push(['end',info])}},
      debug:{avatar:'player_cat',month:4,createScene:async()=>world,onReady(value){api=value;resolve()}}});
  });
  await ready;let now=performance.now()+50;env.tick(now);
  const idleDraws=draws;env.tick(now+=500);assert.equal(draws,idleDraws,'stationary actors should not advance frames');
  api.setView({x:-22,z:17,yaw:0});env.tick(now+=300);
  const chatButton=find(env.document.body,'bookForestChat');assert.equal(chatButton.hidden,false);
  chatButton.click();await Promise.resolve();assert.equal(api.getState().chatOpen,true);
  assert.deepEqual(events[0],['start',{characterId:'king',displayName:'王さま'}]);
  const before=api.getState();env.send('keydown','KeyW');env.tick(now+=300);const during=api.getState();
  assert.equal(during.x,before.x);assert.equal(during.z,before.z);
  find(env.document.body,'bookForestDismiss').click();assert.deepEqual(events[1],['end',{characterId:'king',displayName:'王さま'}]);
  env.send('keydown','KeyW');env.tick(now+=350);assert.notEqual(api.getState().z,before.z);
  assert.ok(draws>idleDraws,'walking advances only the player sprite');
  find(env.document.body,'bookForestClose').click();
  assert.equal(world.renderer.disposed,true);assert.equal(callbacks.size,0);
  assert.equal((env.listeners.keydown||[]).length,0);assert.equal((env.windowListeners.blur||[]).length,0);
});

test('a scene that finishes loading after exit is disposed and never starts a loop',async()=>{
  const env=environment(),world=fakeWorld();let finish;
  const pending=new Promise(resolve=>finish=resolve);
  const dispose=mountBookForest({familyId:'test',debug:{avatar:'player_cat',createScene:()=>pending}});
  dispose();finish(world);await Promise.resolve();await Promise.resolve();
  assert.equal(world.renderer.disposed,true);assert.equal(callbacks.size,0);
});

test('each twin is separately approachable with the same private sprite and dialogue context',async()=>{
  const env=environment(),events=[];let api;
  const ready=new Promise(resolve=>{
    mountBookForest({familyId:'twins-test',privateSprites:{images},dialogue:{start(info){events.push(info);return {text:'やあ',choices:[]}}},
      debug:{avatar:'player_cat',month:4,createScene:async()=>fakeWorld(),onReady(value){api=value;resolve()}}});
  });
  await ready;
  assert.equal(api.characters.length,10);
  const first=api.characters.find(c=>c.id==='twins'),second=api.characters.find(c=>c.id==='twins_second');
  assert.equal(first.spriteId,'twins');assert.equal(second.spriteId,'twins');
  assert.equal(first.scale,.8);assert.equal(second.scale,.8);
  api.setView({x:second.x,z:second.z});
  let now=performance.now()+50;env.tick(now);
  assert.equal(api.getState().nearby,'twins_second');
  const button=find(env.document.body,'bookForestChat');assert.equal(button.hidden,false);
  button.click();await Promise.resolve();
  assert.deepEqual(events[0],{characterId:'twins',displayName:'ふたご'});
  const before=api.getState().npcs.find(c=>c.id==='twins_second');
  for(let i=0;i<200;i++)env.tick(now+=50);
  const after=api.getState().npcs.find(c=>c.id==='twins_second');
  assert.deepEqual([after.x,after.z],[before.x,before.z],'talking sibling stays put');
  find(env.document.body,'bookForestClose').click();
});

test('twin conversation displays alternating names, autoplays, pauses in background, and stops on close',async()=>{
  const originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout;
  const timers=new Map();let timerId=0,closeForest=()=>{};
  globalThis.setTimeout=(fn)=>{const id=++timerId;timers.set(id,fn);return id};
  globalThis.clearTimeout=id=>timers.delete(id);
  try{
    const env=environment();let api,turn=0;
    const ready=new Promise(resolve=>{
      closeForest=mountBookForest({familyId:'twins-voice',privateSprites:{images},
        dialogue:{start:()=>({mode:'twins',speakerName:'ふたご',speakerSlot:0,
          text:'だれか来た！',autoNext:true,autoDelayMs:3500,choices:[]}),
          advance:()=>({mode:'twins',speakerName:++turn%2?'テストA':'テストB',
            speakerSlot:turn%2?1:2,text:'おしゃべりしよう。',autoNext:true,
            autoDelayMs:3500,choices:[]}),end(){}},
        debug:{avatar:'player_cat',month:4,createScene:async()=>fakeWorld(),
          onReady(value){api=value;resolve()}}});
    });
    await ready;api.setView({x:56,z:33});env.tick(performance.now()+100);
    find(env.document.body,'bookForestChat').click();await Promise.resolve();
    const history=find(env.document.body,'bookForestTwinHistory');
    const waiting=find(env.document.body,'bookForestTwinWaiting');
    assert.equal(history.children[0].children[0].textContent,'ふたご');
    assert.equal(waiting.hidden,false,'animated dots indicate more twin dialogue is coming');
    assert.equal(waiting.children.length,3);
    assert.equal(timers.size,1);
    const callback=[...timers.values()][0];await callback();
    assert.equal(history.children.length,2);
    assert.equal(history.children[1].children[0].textContent,'テストA');
    assert.equal(timers.size,1);
    env.document.hidden=true;
    for(const fn of env.listeners.visibilitychange||[])fn();
    assert.equal(timers.size,0,'background conversation must pause');
    assert.equal(waiting.hidden,true,'background pause hides the waiting indicator');
    env.document.hidden=false;
    for(const fn of env.listeners.visibilitychange||[])fn();
    assert.equal(timers.size,1,'foreground conversation can resume');
    assert.equal(waiting.hidden,false);
    find(env.document.body,'bookForestDismiss').click();
    assert.equal(timers.size,0,'closing the conversation cancels speech timers');
    assert.equal(waiting.hidden,true,'closing the conversation hides the waiting indicator');
  }finally{closeForest();globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear}
});
