import * as THREE from './vendor/three/three.module.js';
import {GLTFLoader} from './vendor/three/GLTFLoader.js';
import {WORLD_LIMIT,WATER_LEVEL,POND,BRIDGE_Z,PATHS,HOUSES,CHARACTERS,START,riverX,heightAt,bridgeAt,walkHeight,MONTHS} from './book-forest-world.mjs';

const TAU=Math.PI*2;
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
function random(seed=145891){let n=seed>>>0;return()=>{n=(n*1664525+1013904223)>>>0;return n/4294967296}}
function distToSegment(x,z,a,b){
  const dx=b[0]-a[0],dz=b[1]-a[1],t=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1),0,1);
  return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);
}
function pathDistance(x,z){let d=Infinity;for(const path of PATHS)for(let i=1;i<path.length;i++)d=Math.min(d,distToSegment(x,z,path[i-1],path[i]));return d}
const assetBase=new URL('./forest-assets/',import.meta.url);
const assetNames=['tree-oak','tree-detailed','tree-default','tree-pinedefaulta','plant-bushdetailed','grass-large','grass','flower-reda','flower-yellowa','flower-purplea','rock-largea','rock-largeb','stump-old','log-large','mushroom-redgroup'];
async function loadAssets(){
  const loader=new GLTFLoader();
  const names=[...assetNames,'house','hall'];
  const entries=await Promise.all(names.map(async name=>{
    const path=(name==='house'||name==='hall'?'':'nature/')+name+'.glb';
    const gltf=await loader.loadAsync(new URL(path,assetBase).href);
    gltf.scene.updateMatrixWorld(true);return [name,gltf.scene];
  }));
  return Object.fromEntries(entries);
}
export async function createForestScene(canvas,initialMonth,{load=loadAssets,makeRenderer=options=>new THREE.WebGLRenderer(options)}={}){
  const assets=await load();
  const renderer=makeRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.4));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.05;
  const scene=new THREE.Scene();
  scene.fog=new THREE.Fog(0xc4ded0,68,205);
  const camera=new THREE.PerspectiveCamera(55,1,.15,270);
  const hemi=new THREE.HemisphereLight(0xd9f1ec,0x65795a,2.05);scene.add(hemi);
  const sun=new THREE.DirectionalLight(0xffeccf,2.15);sun.position.set(-40,74,20);scene.add(sun);
  const rand=random(),temp=new THREE.Object3D(),treeObstacles=[],leafBatches=[],flowerBatches=[],grassBatches=[];
  const mat=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.92,...extra});
  const palette={wood:mat(0x78563c),leaf:mat(0xffffff),grass:mat(0x789d67),rock:mat(0xa4a99a),flower:mat(0xffffff),mushroom:mat(0xa9644d),snow:mat(0xe6ece0)};
  const ground=new THREE.PlaneGeometry(WORLD_LIMIT*2,WORLD_LIMIT*2,220,220);
  ground.rotateX(-Math.PI/2);
  const positions=ground.attributes.position,groundColors=new Float32Array(positions.count*3);
  const color=new THREE.Color(),soil=new THREE.Color(0xc4ab7d),bank=new THREE.Color(0xa69a7d);
  for(let i=0;i<positions.count;i++)positions.setY(i,heightAt(positions.getX(i),positions.getZ(i)));
  ground.setAttribute('color',new THREE.BufferAttribute(groundColors,3));ground.computeVertexNormals();
  const terrain=new THREE.Mesh(ground,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));scene.add(terrain);
  // Opaque water occupies the depth buffer like the shore and the footbridge.
  // Transparent large water planes were incorrectly sorted over NPC sprites.
  const waterMat=mat(0x75b5aa,{roughness:.38,metalness:.04,side:THREE.DoubleSide});
  const waterVerts=[],waterIndex=[];
  for(let i=0;i<=150;i++){
    const z=-WORLD_LIMIT+i*WORLD_LIMIT*2/150,x=riverX(z);
    waterVerts.push(x-4.15,WATER_LEVEL,z,x+4.15,WATER_LEVEL,z);
    if(i<150){const a=i*2;waterIndex.push(a,a+2,a+1,a+1,a+2,a+3)}
  }
  const riverGeometry=new THREE.BufferGeometry();riverGeometry.setAttribute('position',new THREE.Float32BufferAttribute(waterVerts,3));riverGeometry.setIndex(waterIndex);riverGeometry.computeVertexNormals();
  scene.add(new THREE.Mesh(riverGeometry,waterMat));
  const pond=new THREE.Mesh(new THREE.CircleGeometry(POND.r,64),waterMat);pond.rotation.x=-Math.PI/2;pond.position.set(POND.x,WATER_LEVEL+.02,POND.z);scene.add(pond);
  // Short, translucent glints move slowly over the water without a reflection pass.
  const glintMat=new THREE.MeshBasicMaterial({color:0xe3f1df,transparent:true,opacity:.38,depthWrite:false,side:THREE.DoubleSide});
  const glints=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),glintMat,44),glintData=[];
  for(let i=0;i<44;i++){
    const z=-74+rand()*148,x=riverX(z)+(rand()-.5)*6;
    glintData.push({x,z,phase:rand()*TAU,s:.6+rand()*1.5});
  }
  scene.add(glints);
  function ribbon(points,width){
    const curve=new THREE.CatmullRomCurve3(points.map(([x,z])=>new THREE.Vector3(x,0,z))),pts=curve.getPoints(150),v=[],idx=[];
    for(let i=0;i<pts.length;i++){
      const p=pts[i],a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)],dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz)||1;
      const w=width*(.93+.07*Math.sin(i*.17));
      for(const s of [-1,1]){
        const x=p.x-dz/l*w*s/2,z=p.z+dx/l*w*s/2;
        v.push(x,(bridgeAt(x,z)??heightAt(x,z))+.06,z);
      }
      if(i<pts.length-1&&bridgeAt(p.x,p.z)===null){const j=i*2;idx.push(j,j+2,j+1,j+1,j+2,j+3)}
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));geo.setIndex(idx);geo.computeVertexNormals();
    scene.add(new THREE.Mesh(geo,mat(0xb9a17b,{side:THREE.DoubleSide})));
  }
  PATHS.forEach((path,i)=>ribbon(path,i<2?3.8:2.6));
  const wood=mat(0x9b7656),woodDark=mat(0x72543e),woodLight=mat(0xbe9870),stone=mat(0xada99a);
  function beam(w,h,d,x,y,z,m=wood,parent=scene){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);parent.add(mesh);return mesh}
  // A low arched footbridge; its deck uses the same height function as the walker.
  for(const bz of BRIDGE_Z){
    const cx=riverX(bz);
    for(let i=0;i<20;i++){
      const x=cx-9.5+i,y=bridgeAt(x,bz)??heightAt(x,bz);
      beam(.93,.25,6.2,x,y-.16,bz,wood);
    }
    for(const side of [-1,1]){
      for(let i=0;i<7;i++){
        const x=cx-9+i*3,y=bridgeAt(x,bz)??heightAt(x,bz);
        beam(.22,1.65,.22,x,y+.7,bz+side*2.95,woodDark);
      }
      for(let i=0;i<6;i++){
        const x=cx-7.5+i*3,y=bridgeAt(x,bz)??heightAt(x,bz);
        const y1=bridgeAt(x-1.5,bz)??heightAt(x-1.5,bz),y2=bridgeAt(x+1.5,bz)??heightAt(x+1.5,bz);
        const rail=beam(3.05,.18,.22,x,y+1.43,bz+side*2.95,woodDark);
        rail.rotation.z=Math.atan2(y2-y1,3);
      }
    }
  }
  // Assemble and instance the artist-made GLB meshes while preserving each mesh transform.
  function instanced(name,placements,kind){
    const root=assets[name];
    root.updateMatrixWorld(true);
    root.traverse(child=>{
      if(!child.isMesh)return;
      const old=child.material?.name?.toLowerCase()||'';
      const isLeaf=/leaf|pine|green/.test(old),isWood=/bark|wood/.test(old),isStem=/leaf|green|stem|grass/.test(old);
      let m=kind==='tree'?(isLeaf?palette.leaf:palette.wood):
        kind==='flower'?(isStem||isWood?palette.grass:palette.flower):
        kind==='grass'?palette.grass:kind==='wood'?palette.wood:kind==='mushroom'?palette.mushroom:palette.rock;
      const mesh=new THREE.InstancedMesh(child.geometry,m,placements.length);
      mesh.frustumCulled=false;
      placements.forEach((p,i)=>{
        temp.position.set(p.x,p.y,p.z);temp.rotation.set(0,p.rot||0,0);temp.scale.setScalar(p.scale);temp.updateMatrix();
        mesh.setMatrixAt(i,temp.matrix.clone().multiply(child.matrixWorld));
        if(kind==='tree'&&isLeaf)mesh.setColorAt(i,new THREE.Color(0xffffff));
        if(kind==='flower'&&!isStem&&!isWood)mesh.setColorAt(i,new THREE.Color(p.color||0xfff1cf));
      });
      mesh.instanceMatrix.needsUpdate=true;scene.add(mesh);
      if(kind==='tree'&&isLeaf)leafBatches.push({mesh,placements,childMatrix:child.matrixWorld.clone(),pine:name.includes('pine')});
      if(kind==='flower')flowerBatches.push({mesh,placements,childMatrix:child.matrixWorld.clone()});
      if(kind==='grass')grassBatches.push({mesh,placements,childMatrix:child.matrixWorld.clone()});
    });
  }
  const trees={'tree-oak':[],'tree-detailed':[],'tree-default':[],'tree-pinedefaulta':[]};
  const names=Object.keys(trees);
  for(let tries=0;tries<2400&&Object.values(trees).reduce((a,b)=>a+b.length,0)<250;tries++){
    const x=(rand()-.5)*192,z=(rand()-.5)*192;
    if(Math.abs(x-riverX(z))<8||Math.hypot(x-POND.x,z-POND.z)<POND.r+5||pathDistance(x,z)<5.2)continue;
    if(HOUSES.some(h=>Math.hypot(x-h.x,z-h.z)<11))continue;
    if(CHARACTERS.some(c=>Math.hypot(x-c.x,z-c.z)<5)||Math.hypot(x-START.x,z-START.z)<7)continue;
    if(Math.hypot(x+22,z-27)<16||Math.hypot(x-69,z-65)<8)continue;
    if(rand()>.23+Math.min(.67,Math.hypot(x,z)/110))continue;
    const i=Math.floor(rand()*names.length),scale=8+rand()*7;
    trees[names[i]].push({x,z,y:heightAt(x,z)-.15,scale,rot:rand()*TAU,seed:rand()});
    treeObstacles.push({x,z,r:.85+scale*.045});
  }
  for(const [name,items] of Object.entries(trees))instanced(name,items,'tree');
  function scatter(count,condition,scaleMin,scaleSpread){
    const out=[];for(let tries=0;tries<count*8&&out.length<count;tries++){
      const x=(rand()-.5)*190,z=(rand()-.5)*190;
      if(!condition(x,z))continue;
      out.push({x,z,y:heightAt(x,z)-.03,rot:rand()*TAU,scale:scaleMin+rand()*scaleSpread,seed:rand()});
    }return out;
  }
  const onLand=(x,z)=>Math.abs(x-riverX(z))>4.8&&Math.hypot(x-POND.x,z-POND.z)>POND.r+1&&
    HOUSES.every(h=>Math.hypot(x-h.x,z-h.z)>5.5);
  const grasses=scatter(850,(x,z)=>onLand(x,z)&&pathDistance(x,z)>1.7,2.0,2.5);
  instanced('grass-large',grasses.slice(0,470),'grass');instanced('grass',grasses.slice(470),'grass');
  const bushes=scatter(125,(x,z)=>onLand(x,z)&&pathDistance(x,z)>3.4,3,3.2);instanced('plant-bushdetailed',bushes,'grass');
  const stones=scatter(110,(x,z)=>onLand(x,z)&&pathDistance(x,z)>2.6,2,3.5);instanced('rock-largea',stones.slice(0,55),'rock');instanced('rock-largeb',stones.slice(55),'rock');
  const flowers=scatter(270,(x,z)=>onLand(x,z)&&pathDistance(x,z)>2&&Math.hypot(x,z)<100,1.7,2.5);
  const flowerColors=[0xf6d9bd,0xf0d596,0xe3bfd0];
  flowers.forEach((p,i)=>p.color=flowerColors[i%3]);
  ['flower-reda','flower-yellowa','flower-purplea'].forEach((n,i)=>instanced(n,flowers.filter((_,j)=>j%3===i),'flower'));
  const forestFloor=scatter(30,(x,z)=>onLand(x,z)&&pathDistance(x,z)>3&&x< -50,2.6,3);
  instanced('stump-old',forestFloor.slice(0,10),'wood');instanced('log-large',forestFloor.slice(10,20),'wood');instanced('mushroom-redgroup',forestFloor.slice(20),'mushroom');
  // Natural rocks trace the waterline rather than sitting in a perfectly even ring.
  const shore=[];
  for(let i=0;i<72;i++){
    let x,z;
    if(i<36){const a=rand()*TAU,r=POND.r+.4+rand()*2;x=POND.x+Math.cos(a)*r;z=POND.z+Math.sin(a)*r}
    else{z=-76+rand()*150;x=riverX(z)+(rand()<.5?-1:1)*(4.4+rand()*2)}
    if(pathDistance(x,z)<2.8)continue;
    shore.push({x,z,y:heightAt(x,z)-.06,rot:rand()*TAU,scale:1.4+rand()*2.6});
  }
  instanced('rock-largea',shore,'rock');
  // Distinct posts and sloped rails. Every post touches its own ground sample;
  // a uniformly elevated instanced fence left some ends floating on hills.
  function timberRail(x1,z1,x2,z2,offset,material=wood){
    const dx=x2-x1,dz=z2-z1,len=Math.hypot(dx,dz);
    const h1=heightAt(x1,z1)+offset,h2=heightAt(x2,z2)+offset;
    const rail=beam(len+.12,.14,.18,(x1+x2)/2,(h1+h2)/2,(z1+z2)/2,material);
    rail.rotation.order='YXZ';rail.rotation.y=-Math.atan2(dz,dx);
    rail.rotation.z=Math.atan2(h2-h1,len);
  }
  function gardenFence(x1,z1,x2,z2,sections){
    const points=Array.from({length:sections+1},(_,i)=>({
      x:x1+(x2-x1)*i/sections,z:z1+(z2-z1)*i/sections}));
    for(let i=0;i<sections;i++){
      const a=points[i],b=points[i+1];
      timberRail(a.x,a.z,b.x,b.z,.49,woodLight);
      timberRail(a.x,a.z,b.x,b.z,1.09,wood);
    }
    for(const p of points){
      const y=heightAt(p.x,p.z);
      beam(.27,1.42,.27,p.x,y+.71,p.z,woodDark);
      const cap=beam(.36,.13,.36,p.x,y+1.47,p.z,woodLight);
      cap.rotation.y=Math.PI/4;
      const base=beam(.35,.16,.35,p.x,y+.055,p.z,stone);
      base.rotation.y=Math.PI/4;
    }
  }
  gardenFence(-53,42,-41,42,4);
  gardenFence(32,27,44,27,4);
  for(const h of HOUSES){
    const model=assets[h.type].clone(true);model.position.set(h.x,heightAt(h.x,h.z)-.25,h.z);model.scale.setScalar(h.scale);model.rotation.y=h.rotation;scene.add(model);
  }
  // A low-poly slatted seat with real legs on each sampled terrain corner.
  // Seats stay level, while each leg reaches the uneven forest floor.
  function bench(x,z,lookX,lookZ){
    const angle=Math.atan2(lookX-x,lookZ-z),c=Math.cos(angle),s=Math.sin(angle);
    const b=new THREE.Group();b.position.set(x,0,z);b.rotation.y=angle;scene.add(b);
    const supports=[];
    for(const lx of [-1.47,1.47])for(const lz of [-.39,.36]){
      const wx=x+c*lx+s*lz,wz=z-s*lx+c*lz;
      supports.push({lx,lz,ground:heightAt(wx,wz)});
    }
    const seatY=Math.max(...supports.map(p=>p.ground))+.83;
    for(const depth of [-.35,-.04,.27]){
      beam(3.58,.13,.26,0,seatY,depth,woodLight,b);
      beam(3.5,.035,.035,0,seatY+.075,depth-.092,wood,b);
    }
    for(const support of supports){
      const foot=support.ground+.025,h=seatY-.06-foot;
      beam(.19,h,.2,support.lx,foot+h/2,support.lz,woodDark,b);
      beam(.33,.13,.32,support.lx,foot+.035,support.lz,stone,b);
    }
    for(const lx of [-1.47,1.47]){
      const rest=beam(.17,.95,.17,lx,seatY+.42,-.5,woodDark,b);
      rest.rotation.x=-.12;
      beam(.22,.12,.85,lx,seatY+.48,-.13,woodLight,b);
    }
    for(const rise of [.3,.57,.83]){
      const plank=beam(3.52,.17,.16,0,seatY+rise,-.52-rise*.12,wood,b);
      plank.rotation.x=-.12;
    }
    beam(3.02,.14,.18,0,seatY-.36,-.22,woodDark,b);
  }
  bench(-71,-28,POND.x,POND.z);
  bench(62,68,44,43);
  bench(-15,20,5,19);
  const snowGeometry=new THREE.CircleGeometry(1,9);snowGeometry.rotateX(-Math.PI/2);
  const snowPatches=new THREE.InstancedMesh(snowGeometry,palette.snow,95),snow=[];
  for(let i=0;i<95;i++){
    const x=(rand()-.5)*185,z=(rand()-.5)*185;
    if(!onLand(x,z)||pathDistance(x,z)<2.7)continue;
    snow.push({x,z,y:heightAt(x,z)+.08,s:1+rand()*2.4,seed:rand()});
  }
  snowPatches.count=snow.length;scene.add(snowPatches);
  const leafGeometry=new THREE.PlaneGeometry(.75,.42);leafGeometry.rotateX(-Math.PI/2);
  const fallen=new THREE.InstancedMesh(leafGeometry,mat(0xc99559,{side:THREE.DoubleSide}),190),fallenData=[];
  for(let i=0;i<190;i++){
    const x=(rand()-.5)*150,z=(rand()-.5)*150;
    if(!onLand(x,z))continue;
    fallenData.push({x,z,y:heightAt(x,z)+.1,s:.5+rand(),r:rand()*TAU});
  }
  fallen.count=fallenData.length;scene.add(fallen);
  fallenData.forEach((p,i)=>{temp.position.set(p.x,p.y,p.z);temp.rotation.set(0,p.r,0);temp.scale.setScalar(p.s);temp.updateMatrix();fallen.setMatrixAt(i,temp.matrix)});
  function setMonth(month){
    const season=MONTHS[month]||MONTHS[4];
    scene.background=new THREE.Color(season.sky);scene.fog.color.setHex(season.fog);waterMat.color.setHex(season.water);
    sun.color.setHex(season.sun);sun.position.set(month<=2||month>=11?-60:-40,month<=2||month>=11?48:75,month>=9?35:15);
    hemi.intensity=month===6?1.8:2.05;
    scene.fog.near=month===6?48:68;scene.fog.far=month===6?165:205;
    palette.grass.color.setHex(season.ground).multiplyScalar(.88);
    glintMat.opacity=month===6?.24:.38;
    for(let i=0;i<positions.count;i++){
      const x=positions.getX(i),z=positions.getZ(i),y=positions.getY(i);
      color.setHex(season.ground);
      const nearWater=Math.min(Math.abs(x-riverX(z))-4,Math.abs(Math.hypot(x-POND.x,z-POND.z)-POND.r));
      if(nearWater<5)color.lerp(bank,.36*(1-clamp(nearWater/5,0,1)));
      const noise=(Math.sin(x*.29)*Math.cos(z*.21)+Math.sin(x*.09+z*.17))*.025;
      color.offsetHSL(0,0,noise+clamp((y-5)/100,-.02,.06));
      if(season.snow&&y>5)color.lerp(new THREE.Color(0xe3e9db),Math.min(.45,season.snow*(y-5)/20));
      groundColors[i*3]=color.r;groundColors[i*3+1]=color.g;groundColors[i*3+2]=color.b;
    }
    ground.attributes.color.needsUpdate=true;
    leafBatches.forEach(({mesh,placements,childMatrix,pine})=>{
      placements.forEach((p,i)=>{
        const visible=pine||p.seed<season.leafScale;
        temp.position.set(p.x,p.y,p.z);temp.rotation.set(0,p.rot,0);temp.scale.setScalar(visible?p.scale:0);temp.updateMatrix();
        mesh.setMatrixAt(i,temp.matrix.clone().multiply(childMatrix));
        mesh.setColorAt(i,new THREE.Color(season.leaf[Math.floor(p.seed*season.leaf.length)%season.leaf.length]));
      });mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;
    });
    const grassDensity=month===1||month===12?.54:month===2?.64:month===3?.77:1;
    grassBatches.forEach(({mesh,placements,childMatrix})=>{
      placements.forEach((p,i)=>{
        temp.position.set(p.x,p.y,p.z);temp.rotation.set(0,p.rot,0);temp.scale.setScalar(p.seed<grassDensity?p.scale:0);temp.updateMatrix();
        mesh.setMatrixAt(i,temp.matrix.clone().multiply(childMatrix));
      });mesh.instanceMatrix.needsUpdate=true;
    });
    flowerBatches.forEach(({mesh,placements,childMatrix})=>{
      placements.forEach((p,i)=>{
        temp.position.set(p.x,p.y,p.z);temp.rotation.set(0,p.rot,0);temp.scale.setScalar(p.seed<season.flower?p.scale:0);temp.updateMatrix();
        mesh.setMatrixAt(i,temp.matrix.clone().multiply(childMatrix));
      });mesh.instanceMatrix.needsUpdate=true;
    });
    snow.forEach((p,i)=>{temp.position.set(p.x,p.y,p.z);temp.rotation.set(0,0,0);temp.scale.setScalar(p.seed<season.snow?p.s:0);temp.updateMatrix();snowPatches.setMatrixAt(i,temp.matrix)});
    snowPatches.instanceMatrix.needsUpdate=true;fallen.visible=month===10||month===11||month===12;
  }
  setMonth(initialMonth);
  function animate(time){
    glintData.forEach((p,i)=>{
      temp.position.set(p.x+Math.sin(time*.3+p.phase)*.3,WATER_LEVEL+.035,p.z);temp.rotation.set(-Math.PI/2,0,0);
      temp.scale.set(p.s,.1,1);temp.updateMatrix();glints.setMatrixAt(i,temp.matrix);
    });glints.instanceMatrix.needsUpdate=true;
  }
  function dispose(){
    const geos=new Set(),mats=new Set(),textures=new Set();
    scene.traverse(o=>{if(o.geometry)geos.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])if(m){mats.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v)}});
    // Models which produced instanced meshes retain unused source materials and maps.
    Object.values(assets).forEach(a=>a.traverse(o=>{if(o.geometry)geos.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])if(m){mats.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v)}}));
    textures.forEach(t=>t.dispose());mats.forEach(m=>m.dispose());geos.forEach(g=>g.dispose());renderer.dispose();
  }
  return {THREE,renderer,scene,camera,treeObstacles,setMonth,animate,dispose};
}
