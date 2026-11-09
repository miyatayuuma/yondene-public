import {forestGrowth,characterReadingContext} from './book-forest-progress.mjs';

// A private, owner-launched scene. All geometry, characters and dialogue are
// original; no book text, copyrighted character assets or personal records ship.
const THREE_URL='https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';
const WORLD=154;
const WATER=1.3;
const STAGE_NAMES=['はじまりの草原','小川の橋','谷の小さな村','実りの森','星を見る丘'];
let threeModule;
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
const smooth=(a,b,n)=>{const t=clamp((n-a)/(b-a),0,1);return t*t*(3-2*t)};
const riverX=z=>12+10*Math.sin(z*.029)+4*Math.sin(z*.069);
const pondDistance=(x,z)=>Math.hypot(x+63,z+69);
function heightAt(x,z){
  const rx=Math.abs(x-riverX(z));
  const rise=20*smooth(53,148,Math.abs(x))+11*smooth(65,150,Math.abs(z));
  const rolls=1.7*Math.sin(x*.035+z*.016)*Math.sin(z*.038)+1.2*Math.cos(x*.047-z*.021);
  const riverBed=3.6*Math.exp(-Math.pow(rx/7,4));
  const pondBed=3.6*(1-smooth(20,29,pondDistance(x,z)));
  return 2.75+rise+rolls-riverBed-pondBed;
}
function allowed(x,z,bridgeOpen){
  if(Math.abs(x)>WORLD-9||Math.abs(z)>WORLD-9)return false;
  if(pondDistance(x,z)<25)return false;
  if(Math.abs(x-riverX(z))<6.1){
    if(!(bridgeOpen&&Math.abs(z)<3.25&&x>-5&&x<35))return false;
  }
  return true;
}
function randomGenerator(seed=1357911){
  let value=seed>>>0;
  return ()=>{value=(1664525*value+1013904223)>>>0;return value/4294967296};
}
function el(tag,klass,text){
  const node=document.createElement(tag);
  if(klass)node.className=klass;
  if(text!==undefined)node.textContent=text;
  return node;
}
function saveChoice(key,value){
  try{localStorage.setItem(key,JSON.stringify(value))}catch{}
}
function loadChoice(key){
  try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}
}

export function mountBookForest({familyId,books=[],ratings=new Map(),reflectedBookIds=new Set(),privateSprites=null,onClose=()=>{}}){
  const growth=forestGrowth({books,ratings,reflectedBookIds});
  const readContext=characterReadingContext(books);
  const spriteImages=privateSprites?.images||{};
  const saveKey='yondene-book-forest-prefs:'+familyId;
  const previous=loadChoice(saveKey)||{};
  let season=['spring','summer','autumn','dusk'].includes(previous.season)?previous.season:'spring';
  let planting=['flower','orchard'].includes(previous.planting)?previous.planting:'flower';
  let avatar=['player_cat','player_rabbit'].includes(previous.avatar)?previous.avatar:'player_cat';
  let stage=growth.stage,preview=false,disposed=false,animationId=0,resizeObserver=null,cleanupWorld=()=>{};
  const keys=new Set();
  const layer=el('section','bookForest');
  layer.setAttribute('role','dialog');
  layer.setAttribute('aria-modal','true');
  layer.setAttribute('aria-label','本の森');
  layer.tabIndex=-1;
  const canvas=el('canvas','bookForestCanvas');
  canvas.setAttribute('aria-label','本の森の3Dフィールド');
  const vignette=el('div','bookForestVignette');
  const top=el('header','bookForestTop');
  const titles=el('div','bookForestBrand');
  titles.append(el('span','bookForestEyebrow','YONDENE · STORY GARDEN'),el('h2','','本の森'));
  const close=el('button','bookForestClose','本棚に戻る');
  close.type='button';
  top.append(titles,close);
  const status=el('div','bookForestStatus');
  const stageTitle=el('span','bookForestStage',STAGE_NAMES[stage]);
  const seeds=el('span','bookForestSeeds');
  const hint=el('span','bookForestHint');
  const growthText=()=>{
    stageTitle.textContent=STAGE_NAMES[stage]+(preview?' · おためし':'');
    seeds.textContent='📖 '+growth.readCount+'さつ · ★ '+growth.ratedCount+' · 🌱 '+growth.seeds+'つぶ';
    hint.textContent=growth.nextThreshold===null?'すべての景色が育ちました':`あと${Math.max(0,growth.nextThreshold-growth.seeds)}つぶで次の景色`;
  };
  growthText();
  status.append(stageTitle,seeds,hint);
  const settings=el('div','bookForestControls');
  const seasonWrap=el('label','bookForestChoice');
  seasonWrap.append(el('span','','空の色'));
  const seasonSelect=el('select');
  seasonSelect.setAttribute('aria-label','空の色');
  [['spring','春の光'],['summer','夏の緑'],['autumn','秋の森'],['dusk','夕暮れ']].forEach(([v,t])=>{const option=el('option','',t);option.value=v;seasonSelect.append(option)});
  seasonSelect.value=season;
  seasonWrap.append(seasonSelect);
  const plantWrap=el('label','bookForestChoice');
  plantWrap.append(el('span','','庭づくり'));
  const plantingSelect=el('select');
  [['flower','花の小道'],['orchard','木の実の庭']].forEach(([v,t])=>{const option=el('option','',t);option.value=v;plantingSelect.append(option)});
  plantingSelect.value=planting;
  plantWrap.append(plantingSelect);
  const avatarWrap=el('label','bookForestChoice');
  avatarWrap.append(el('span','','主人公'));
  const avatarSelect=el('select');
  avatarSelect.setAttribute('aria-label','主人公を選ぶ');
  [['player_cat','ねこ'],['player_rabbit','うさぎ']].forEach(([value,label])=>{
    const option=el('option','',label);option.value=value;avatarSelect.append(option);
  });
  avatarSelect.value=avatar;avatarWrap.append(avatarSelect);
  const previewWrap=el('label','bookForestChoice bookForestPreview');
  previewWrap.append(el('span','','成長をためす'));
  const previewSelect=el('select');
  STAGE_NAMES.forEach((name,index)=>{const option=el('option','',`${index+1} · ${name}`);option.value=String(index);previewSelect.append(option)});
  previewSelect.value=String(stage);previewWrap.append(previewSelect);
  const resetPreview=el('button','bookForestReset','本の記録に戻す');
  resetPreview.hidden=true;
  settings.append(seasonWrap,plantWrap,avatarWrap,previewWrap,resetPreview);
  const bottom=el('div','bookForestBottom');
  const joystick=el('div','bookForestJoystick');
  joystick.setAttribute('aria-label','移動用スティック');
  const nub=el('div','bookForestNub');joystick.append(nub);
  const instruction=el('div','bookForestInstruction','スティックで歩く · 画面をなぞって向きを変える');
  const chatButton=el('button','bookForestChat','おはなし');
  chatButton.hidden=true;
  bottom.append(joystick,instruction,chatButton);
  const chat=el('section','bookForestConversation');
  chat.hidden=true;
  const speaker=el('strong','bookForestSpeaker');
  const message=el('p','bookForestMessage');
  const replies=el('div','bookForestReplies');
  const dismiss=el('button','bookForestDismiss','とじる');
  chat.append(speaker,message,replies,dismiss);
  const loading=el('div','bookForestLoading','森をつくっています…');
  layer.append(canvas,vignette,top,status,settings,bottom,chat,loading);
  document.body.append(layer);
  document.body.classList.add('bookForestOpen');
  layer.focus({preventScroll:true});

  function dispose(){
    if(disposed)return;
    disposed=true;cancelAnimationFrame(animationId);
    cleanupWorld();
    resizeObserver?.disconnect();
    document.removeEventListener('keydown',onKeyDown);
    document.removeEventListener('keyup',onKeyUp);
    document.removeEventListener('visibilitychange',onVisibility);
    document.body.classList.remove('bookForestOpen');
    layer.remove();
  }
  close.onclick=()=>{dispose();onClose()};
  const onKeyDown=event=>{
    if(event.code==='Escape'){event.preventDefault();if(!chat.hidden)chat.hidden=true;else close.click();return}
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(event.code))event.preventDefault();
    keys.add(event.code);
  };
  const onKeyUp=event=>keys.delete(event.code);
  const onVisibility=()=>{if(document.hidden)keys.clear()};
  document.addEventListener('keydown',onKeyDown);
  document.addEventListener('keyup',onKeyUp);
  document.addEventListener('visibilitychange',onVisibility);
  dismiss.onclick=()=>{chat.hidden=true};
  const persist=()=>saveChoice(saveKey,{season,planting,avatar});

  async function buildWorld(){
    let THREE;
    try{
      threeModule ||= import(THREE_URL);
      THREE=await threeModule;
    }catch{
      loading.textContent='3Dの読み込みに失敗しました。通信を確認して、もう一度お試しください。';
      return;
    }
    if(disposed)return;
    const rand=randomGenerator();
    let renderer;
    try{
      renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'default'});
    }catch{
      loading.textContent='この端末では3Dを表示できません。WebGLを有効にしてください。';return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.28;
    renderer.shadowMap.enabled=false;
    const scene=new THREE.Scene();
    scene.fog=new THREE.Fog(0xb6ded6,85,270);
    const camera=new THREE.PerspectiveCamera(60,1,.1,360);
    const hemi=new THREE.HemisphereLight(0xcdeeff,0x62764a,2.25);scene.add(hemi);
    const sunlight=new THREE.DirectionalLight(0xffedd0,2.25);
    sunlight.position.set(-55,110,-40);scene.add(sunlight);
    const material=(color,roughness=.82)=>new THREE.MeshStandardMaterial({color,roughness,metalness:0});
    const mat={
      trunk:material(0x79563e),wood:material(0xa87c58),woodDark:material(0x70503a),
      brick:material(0xe9cfaa),cream:material(0xfff1d8),red:material(0xce765e),
      paleBlue:material(0xb1d7d4),roof:material(0xb95743),roofBlue:material(0x667b96),
      soil:material(0xcba876),stone:material(0xaab0a2),glass:material(0xffe7a2),
      cloth:material(0xc47665),skin:material(0xf8d7b0),eyes:material(0x313e41),
      sign:material(0x7a5841),leaf:material(0x83ae76),leaf2:material(0xa0c18a)
    };
    const animatedSprites=[];
    function addPixelSprite(parent,image,height=8.6){
      if(!image)return null;
      const frame=document.createElement('canvas');frame.width=64;frame.height=64;
      const ctx=frame.getContext('2d',{alpha:true});
      if(!ctx)return null;
      ctx.imageSmoothingEnabled=false;
      const texture=new THREE.CanvasTexture(frame);
      texture.colorSpace=THREE.SRGBColorSpace;
      texture.magFilter=THREE.NearestFilter;
      texture.minFilter=THREE.NearestFilter;
      texture.generateMipmaps=false;
      const material=new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false});
      const sprite=new THREE.Sprite(material);
      sprite.center.set(.5,0);
      sprite.position.y=.18;
      sprite.scale.set(height,height,1);
      parent.add(sprite);
      const animated={sprite,image,ctx,texture};
      animatedSprites.push(animated);
      return sprite;
    }
    function showPixelFrame(frameIndex){
      for(const entry of animatedSprites){
        entry.ctx.clearRect(0,0,64,64);
        entry.ctx.drawImage(entry.image,(frameIndex%2)*64,Math.floor(frameIndex/2)*64,64,64,0,0,64,64);
        entry.texture.needsUpdate=true;
      }
    }
    const box=(w,h,d,m,x,y,z,parent=scene)=>{
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);
      mesh.position.set(x,y,z);parent.add(mesh);return mesh;
    };
    const sphere=(r,m,x,y,z,parent=scene,sx=1,sy=1,sz=1)=>{
      const mesh=new THREE.Mesh(new THREE.SphereGeometry(r,10,8),m);
      mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);parent.add(mesh);return mesh;
    };
    const cone=(r,h,m,x,y,z,parent=scene,n=7)=>{
      const mesh=new THREE.Mesh(new THREE.ConeGeometry(r,h,n),m);
      mesh.position.set(x,y,z);parent.add(mesh);return mesh;
    };
    const cylinder=(r,h,m,x,y,z,parent=scene,r2=r,n=9)=>{
      const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r2,r,h,n),m);
      mesh.position.set(x,y,z);parent.add(mesh);return mesh;
    };
    function line(from,to,radius,m,parent=scene){
      const p=new THREE.Vector3(...from),q=new THREE.Vector3(...to),diff=q.clone().sub(p);
      const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,diff.length(),7),m);
      mesh.position.copy(p.add(q).multiplyScalar(.5));
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),diff.normalize());
      parent.add(mesh);return mesh;
    }

    // Continuous hand-shaped elevation: forested ridges, a low valley and a
    // physically lowered winding stream. No dependency on the old real map.
    const ground=new THREE.PlaneGeometry(WORLD*2,WORLD*2,154,154);
    ground.rotateX(-Math.PI/2);
    const pos=ground.attributes.position;
    const colors=new Float32Array(pos.count*3);
    const base=new THREE.Color();
    for(let i=0;i<pos.count;i++){
      const x=pos.getX(i),z=pos.getZ(i),h=heightAt(x,z);
      pos.setY(i,h);
      const river=Math.abs(x-riverX(z))<9,pond=pondDistance(x,z)<29;
      base.setHSL(.29-(h>17?.025:0),.32+(river||pond?.07:0),.42+(h/60)*.12);
      if(river||pond)base.lerp(new THREE.Color(0xbcae79),.32);
      colors[i*3]=base.r;colors[i*3+1]=base.g;colors[i*3+2]=base.b;
    }
    ground.setAttribute('color',new THREE.BufferAttribute(colors,3));
    ground.computeVertexNormals();
    scene.add(new THREE.Mesh(ground,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1})));
    const waterMat=new THREE.MeshStandardMaterial({color:0x6cbdc9,roughness:.23,metalness:.03,
      transparent:true,opacity:.87,side:THREE.DoubleSide});
    const waterVertices=[],waterIndices=[];
    for(let i=0;i<=112;i++){
      const z=-WORLD+i*WORLD*2/112,x=riverX(z);
      waterVertices.push(x-5.7,WATER,z,x+5.7,WATER,z);
      if(i<112){const a=i*2;waterIndices.push(a,a+2,a+1,a+1,a+2,a+3)}
    }
    const river=new THREE.BufferGeometry();
    river.setAttribute('position',new THREE.Float32BufferAttribute(waterVertices,3));
    river.setIndex(waterIndices);river.computeVertexNormals();
    scene.add(new THREE.Mesh(river,waterMat));
    const pond=new THREE.Mesh(new THREE.CircleGeometry(24,64),waterMat);
    pond.rotation.x=-Math.PI/2;pond.position.set(-63,WATER+.035,-69);scene.add(pond);
    const pondRim=material(0xd9c9a1);
    for(let i=0;i<54;i++){
      const a=i/54*Math.PI*2,r=25+(rand()-.5)*1.7;
      sphere(.65+rand()*.6,pondRim,-63+Math.cos(a)*r,
        heightAt(-63+Math.cos(a)*r,-69+Math.sin(a)*r)+.3,-69+Math.sin(a)*r,scene,1,.4,.9);
    }
    function makePath(points,width=3.4){
      const linePoints=new THREE.CatmullRomCurve3(points.map(([x,z])=>new THREE.Vector3(x,0,z))).getPoints(145);
      const vertices=[],inds=[];
      for(let i=0;i<linePoints.length;i++){
        const p=linePoints[i],before=linePoints[Math.max(0,i-1)],after=linePoints[Math.min(linePoints.length-1,i+1)];
        const tangent=after.clone().sub(before).normalize(),normal=new THREE.Vector3(-tangent.z,0,tangent.x);
        for(const side of [-1,1]){
          const x=p.x+normal.x*width*.5*side,z=p.z+normal.z*width*.5*side;
          vertices.push(x,heightAt(x,z)+.13,z);
        }
        if(i<linePoints.length-1){const a=i*2;inds.push(a,a+2,a+1,a+1,a+2,a+3)}
      }
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
      geometry.setIndex(inds);geometry.computeVertexNormals();
      scene.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0xdbb98b,side:THREE.DoubleSide,roughness:1})));
    }
    makePath([[-126,54],[-97,48],[-75,31],[-44,25],[-23,12],[-5,0]]);
    makePath([[-42,27],[-40,-3],[-30,-30],[-42,-44]]);
    makePath([[32,0],[52,10],[73,22],[97,49]]);
    makePath([[44,7],[67,-15],[82,-44],[92,-78]]);
    makePath([[-75,31],[-97,-10],[-109,-54]]);

    // One forest instancing pass instead of hundreds of individual meshes.
    const treeData=[];
    for(let tries=0;tries<700&&treeData.length<226;tries++){
      const x=(rand()-.5)*WORLD*1.92,z=(rand()-.5)*WORLD*1.92;
      if(!allowed(x,z,false)||Math.abs(x)<10&&Math.abs(z)<20)continue;
      if((x+29)**2+(z-27)**2<220||(x+65)**2+(z-8)**2<220||
        (x-62)**2+(z-22)**2<265||(x-89)**2+(z+42)**2<270)continue;
      // The heart of the valley is a sunny clearing; ridges are densely wooded.
      if(rand()>.22+smooth(25,103,Math.hypot(x,z))*.63)continue;
      treeData.push({x,z,h:heightAt(x,z),size:2.7+rand()*3.8,seed:rand()});
    }
    const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.34,.5,1,6),mat.trunk,treeData.length);
    const crowns=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),mat.leaf,treeData.length);
    const crownsTop=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),mat.leaf2,treeData.length);
    const dummy=new THREE.Object3D();
    treeData.forEach((t,i)=>{
      dummy.position.set(t.x,t.h+t.size*.37,t.z);dummy.scale.set(.9,t.size*.74,.9);
      dummy.rotation.set(0,t.seed*6.28,0);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
      dummy.position.set(t.x,t.h+t.size*1.15,t.z);
      dummy.scale.set(t.size*.66,t.size*.83,t.size*.65);dummy.updateMatrix();crowns.setMatrixAt(i,dummy.matrix);
      dummy.position.set(t.x+.3,t.h+t.size*1.67,t.z-.3);
      dummy.scale.set(t.size*.5,t.size*.65,t.size*.5);dummy.updateMatrix();crownsTop.setMatrixAt(i,dummy.matrix);
    });
    trunks.instanceMatrix.needsUpdate=true;crowns.instanceMatrix.needsUpdate=true;crownsTop.instanceMatrix.needsUpdate=true;
    scene.add(trunks,crowns,crownsTop);
    const leafPalette={
      spring:[0x87b870,0xb5cf84,0x6b9e76,0xe0b9ad],
      summer:[0x528b5e,0x71a95d,0x387d65,0x8ebc6b],
      autumn:[0xc49152,0xd8a64c,0xb66c50,0x8e9a58],
      dusk:[0x6c9a85,0x9bb49b,0x709188,0xadb6a0]
    };
    function recolorTrees(){
      treeData.forEach((t,i)=>{
        const palette=leafPalette[season],index=Math.floor(t.seed*3.999);
        crowns.setColorAt(i,new THREE.Color(palette[index]));
        crownsTop.setColorAt(i,new THREE.Color(palette[(index+1)%palette.length]));
      });
      crowns.instanceColor.needsUpdate=true;crownsTop.instanceColor.needsUpdate=true;
    }

    // Small living detail is planted into the actual ground, not a flat decal.
    const stoneMesh=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),mat.stone,55);
    let stoneCount=0;
    for(let tries=0;tries<180&&stoneCount<55;tries++){
      const x=(rand()-.5)*275,z=(rand()-.5)*275;
      if(!allowed(x,z,false))continue;
      dummy.position.set(x,heightAt(x,z)+.34,z);dummy.scale.set(.55+rand()*1.4,.4+rand()*.8,.65+rand());
      dummy.rotation.set(rand()*2,rand()*5,rand());dummy.updateMatrix();
      stoneMesh.setMatrixAt(stoneCount++,dummy.matrix);
    }
    stoneMesh.count=stoneCount;stoneMesh.instanceMatrix.needsUpdate=true;scene.add(stoneMesh);
    const flowerCount=260;
    const flowerMaterial=material(0xffc4a0);
    const flowerMesh=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(.34,0),flowerMaterial,flowerCount);
    const flowerPositions=[];
    for(let i=0;i<flowerCount;i++){
      const x=(rand()-.5)*203,z=(rand()-.5)*200;
      const y=heightAt(x,z)+.44;
      flowerPositions.push({x,y,z,s:.5+rand()*.8,index:Math.floor(rand()*4)});
      dummy.position.set(x,y,z);dummy.scale.setScalar(flowerPositions[i].s);
      dummy.rotation.set(rand(),rand()*5,0);dummy.updateMatrix();
      flowerMesh.setMatrixAt(i,dummy.matrix);
    }
    flowerMesh.instanceMatrix.needsUpdate=true;scene.add(flowerMesh);
    const flowerColors=[0xffd5d2,0xfff3ae,0xf4eaf5,0xecc6a1];
    function recolorFlowers(){
      flowerPositions.forEach((f,i)=>flowerMesh.setColorAt(i,new THREE.Color(
        planting==='orchard'?0xa1c887:flowerColors[(f.index+(season==='autumn'?3:0))%4])));
      flowerMesh.instanceColor.needsUpdate=true;
      flowerMesh.visible=planting==='flower';
    }

    function house(x,z,{color=mat.cream,roof=mat.roof,scale=1,round=false}={},parent=scene){
      const group=new THREE.Group();group.position.set(x,heightAt(x,z),z);group.scale.setScalar(scale);parent.add(group);
      const foundation=material(0xb4a58b);
      cylinder(6.4,.7,foundation,0,.35,0,group,6.7,10);
      if(!round)box(10,9,9.5,color,0,5,0,group);
      if(round){
        cylinder(5.6,9,color,0,5.1,0,group,5.9,12);
        cone(8.5,7,roof,0,12.2,0,group,12);
      }else{
        const roofMesh=cone(8.9,7.8,roof,0,13.1,0,group,4);roofMesh.rotation.y=Math.PI/4;
      }
      box(2.6,4.6,.24,mat.woodDark,0,2.9,round?5.98:4.86,group);
      sphere(.22,mat.glass,.85,3.2,round?6.19:5.03,group);
      for(const side of [-1,1]){
        box(2.1,2.2,.3,mat.wood,side*3.1,6.5,round?5.13:4.86,group);
        box(1.65,1.6,.35,mat.glass,side*3.1,6.5,round?5.35:5.02,group);
        box(.16,1.6,.4,mat.woodDark,side*3.1,6.5,round?5.57:5.22,group);
      }
      cylinder(.65,7,mat.brick,-3.6,15,-2.6,group);
      return group;
    }
    const stages=[new THREE.Group(),new THREE.Group(),new THREE.Group(),new THREE.Group(),new THREE.Group()];
    stages.forEach(g=>scene.add(g));
    house(-35,27,{color:mat.cream,roof:mat.roof,round:true,scale:1.06},stages[0]);
    house(-89,-7,{color:mat.paleBlue,roof:mat.roofBlue,scale:.78},stages[0]);
    const benchX=-15,benchZ=18,benchY=heightAt(benchX,benchZ);
    box(5,.6,1.8,mat.wood,benchX,benchY+1.9,benchZ,stages[0]);
    for(const dx of [-2,2])box(.45,1.6,.45,mat.woodDark,benchX+dx,benchY+.9,benchZ,stages[0]);
    for(let i=0;i<12;i++){
      const a=i/12*Math.PI*2;
      const x=-40+Math.cos(a)*13,z=35+Math.sin(a)*13;
      sphere(.68,material(i%2?0xf8cbb1:0xfff1be),x,heightAt(x,z)+.62,z,stages[0]);
    }
    // Bridge: boards and rails are separately legible when crossed.
    const bridge=stages[1],bridgeX=riverX(0);
    for(let x=bridgeX-11;x<bridgeX+11;x+=1.25)box(1.12,.62,7.9,mat.wood,x,3.54,0,bridge);
    for(const side of [-1,1]){
      for(let x=bridgeX-11;x<bridgeX+12;x+=3.6){
        box(.42,2.4,.4,mat.woodDark,x,4.8,side*3.6,bridge);
      }
      box(23,.34,.42,mat.woodDark,bridgeX,6,side*3.6,bridge);
    }
    const lanternMat=new THREE.MeshBasicMaterial({color:0xffdea0});
    for(const x of [bridgeX-10,bridgeX+10])for(const z of [-3.8,3.8]){
      sphere(.62,lanternMat,x,6.4,z,bridge);
    }
    house(59,26,{color:mat.cream,roof:mat.roofBlue,round:true,scale:.96},stages[2]);
    house(82,-25,{color:mat.paleBlue,roof:mat.roof,scale:.9},stages[2]);
    house(49,-28,{color:mat.brick,roof:mat.roof,round:true,scale:.77},stages[2]);
    // A cluster of wooden market stalls and an arch marks the second milestone.
    for(const [x,z] of [[65,1],[67,-6]]){
      const y=heightAt(x,z);
      box(7,.45,4,mat.wood,x,y+3,z,stages[2]);
      for(const dx of [-3,3])for(const dz of [-1.5,1.5]){
        box(.3,3.3,.3,mat.woodDark,x+dx,y+1.6,z+dz,stages[2]);
      }
      const awning=cone(5,2,material(0xeab98b),x,y+5,z,stages[2],4);awning.rotation.y=Math.PI/4;
    }
    // An orchard is a deliberate contrast to wild trees and a user choice.
    const orchard=new THREE.Group();stages[3].add(orchard);
    const apples=material(0xd67a53),fruit=material(0xe5ac65);
    for(let i=0;i<19;i++){
      const x=-109+(i%5)*9,z=-75+Math.floor(i/5)*10,y=heightAt(x,z),scale=2.5+rand();
      cylinder(.65,scale*2.4,mat.trunk,x,y+scale*1.2,z,orchard);
      sphere(scale*1.8,mat.leaf,x,y+scale*2.6,z,orchard,1,.8,1);
      for(let j=0;j<3;j++)sphere(.48,fruit,x+Math.sin(i*3+j*2)*scale,y+scale*2.35+j*.4,z+Math.cos(i*2+j*3)*scale,orchard);
    }
    // A tree house, lookout and star lanterns become the final destinations.
    const treehouse=stages[3],tx=-102,tz=85,ty=heightAt(tx,tz);
    cylinder(3.1,18,mat.trunk,tx,ty+9,tz,treehouse,3.7,12);
    sphere(10,mat.leaf2,tx,ty+20,tz,treehouse,1.2,.7,1);
    box(15,1,12,mat.wood,tx,ty+14,tz,treehouse);
    box(11,7,8,mat.cream,tx,ty+18,tz,treehouse);
    cone(10,6,mat.roofBlue,tx,ty+24,tz,treehouse,5);
    for(let i=0;i<12;i++){
      const z=tz+8+i*1.3,x=tx+9-i*.4;
      box(1.5,.35,2.1,mat.wood,x,ty+13.4-i*.93,z,treehouse);
    }
    const tower=stages[4],ox=106,oz=82,oy=heightAt(ox,oz);
    cylinder(7,22,mat.cream,ox,oy+11,oz,tower,7,12);
    cylinder(8.3,1,mat.woodDark,ox,oy+22,oz,tower);
    cone(10,12,mat.roofBlue,ox,oy+29,oz,tower,9);
    for(let i=0;i<6;i++){
      const a=i/6*Math.PI*2;
      sphere(.8,lanternMat,ox+Math.cos(a)*7.7,oy+22,oz+Math.sin(a)*7.7,tower);
    }
    const telescope=material(0x5d7890);
    const glassOrb=sphere(2.6,new THREE.MeshStandardMaterial({color:0x8abce6,metalness:.18,roughness:.15}),ox,oy+23.5,oz,tower);
    glassOrb.scale.set(1,1.3,1);
    line([ox,oy+22,oz],[ox+3,oy+26,oz-3],.8,telescope,tower);
    const fireflies=[];
    for(let i=0;i<34;i++){
      const x=(rand()-.5)*200,z=(rand()-.5)*190;
      const dot=sphere(.24,new THREE.MeshBasicMaterial({color:0xffeba8}),x,heightAt(x,z)+3+rand()*4,z,scene);
      fireflies.push({mesh:dot,x,z,y:dot.position.y,phase:rand()*6.28});
    }
    function applyStage(){
      stages.forEach((group,index)=>group.visible=index<=stage);
      growthText();
    }
    function applySky(){
      const skies={
        spring:{sky:0xb9e3dd,fog:0xb9e3dd,sun:0xfff2ce,sunPower:2.25,fill:2.25},
        summer:{sky:0x9bd0ed,fog:0xb4d5d1,sun:0xffeabb,sunPower:2.6,fill:2.4},
        autumn:{sky:0xecc7a3,fog:0xd8c1ae,sun:0xffd69a,sunPower:1.85,fill:2.08},
        dusk:{sky:0x7d9cba,fog:0x8b9fad,sun:0xf4ab9a,sunPower:1.1,fill:1.35}
      };
      const config=skies[season];
      scene.background=new THREE.Color(config.sky);
      scene.fog.color.setHex(config.fog);
      sunlight.color.setHex(config.sun);sunlight.intensity=config.sunPower;
      hemi.intensity=config.fill;
      fireflies.forEach(({mesh})=>{mesh.visible=season==='dusk'});
      recolorTrees();recolorFlowers();
    }
    seasonSelect.onchange=()=>{season=seasonSelect.value;applySky();persist()};
    plantingSelect.onchange=()=>{planting=plantingSelect.value;recolorFlowers();orchard.visible=stage>=3&&planting==='orchard';persist()};
    previewSelect.onchange=()=>{
      stage=Number(previewSelect.value);preview=stage!==growth.stage;resetPreview.hidden=!preview;
      applyStage();orchard.visible=stage>=3&&planting==='orchard';
    };
    resetPreview.onclick=()=>{
      stage=growth.stage;preview=false;previewSelect.value=String(stage);resetPreview.hidden=true;
      applyStage();orchard.visible=stage>=3&&planting==='orchard';
    };
    applyStage();applySky();
    orchard.visible=stage>=3&&planting==='orchard';

    // Procedural models remain as a fallback when authorized Drive images are
    // not available. The real book characters are never bundled in this repo.
    const player=new THREE.Group();scene.add(player);
    const boot=material(0x534d4e),shirt=material(0xd27e5a),hair=material(0x684d42);
    cylinder(1.45,3.6,shirt,0,3.1,0,player,1.2,10);
    sphere(1.5,mat.skin,0,6.2,0,player);
    sphere(1.53,hair,0,7.15,.15,player,1,.42,1);
    sphere(.15,mat.eyes,-.55,6.3,-1.34,player);
    sphere(.15,mat.eyes,.55,6.3,-1.34,player);
    for(const x of [-.8,.8])box(.8,1.6,1.1,boot,x,1.1,0,player);
    const scarf=material(0xf6ce8c);
    cylinder(1.51,.55,scarf,0,4.85,0,player,1.55,12);
    const playerModels=player.children.slice();
    const playerPixelSprites=new Map();
    for(const key of ['player_cat','player_rabbit']){
      const sprite=addPixelSprite(player,spriteImages[key],9);
      if(sprite)playerPixelSprites.set(key,sprite);
    }
    function chooseAvatar(){
      const selected=playerPixelSprites.get(avatar);
      playerModels.forEach(model=>model.visible=!selected);
      for(const sprite of playerPixelSprites.values())sprite.visible=sprite===selected;
    }
    avatarSelect.onchange=()=>{avatar=avatarSelect.value;chooseAvatar();persist()};
    chooseAvatar();
    let playerX=-11,playerZ=13,camYaw=-.48,motion=0,joystickX=0,joystickY=0,lookPointer=null;
    const npcs=[];
    function npc(spriteId,name,x,z,color,lines,stageNeed=0){
      const marker=new THREE.Group();marker.position.set(x,heightAt(x,z),z);scene.add(marker);
      cylinder(1.45,3.7,material(color),0,2.9,0,marker,1.1,10);
      sphere(1.48,mat.skin,0,6.1,0,marker);
      for(const xx of [-.52,.52])sphere(.14,mat.eyes,xx,6.1,-1.34,marker);
      sphere(1.9,material(color),0,7.25,0,marker,1,.5,1);
      const glow=sphere(.43,lanternMat,0,9.8,0,marker);
      const modelParts=marker.children.slice();
      const sprite=addPixelSprite(marker,spriteImages[spriteId]);
      if(sprite)modelParts.forEach(model=>model.visible=false);
      npcs.push({name,x,z,marker,glow,lines,stageNeed});
    }
    const lastRead=readContext.at(-1)?.title;
    npc('king','王さま',-24,11,0x9a9277,[
      'この谷には、読んだ本の数だけ小さな芽が生まれるんだ。',
      lastRead?`「${lastRead}」も、森の新しい思い出になったね。`:'いろんなお話を読んだら、またここへ来てね。',
      'どんな本も、好きなところがひとつ見つかれば十分だよ。'
    ]);
    npc('cat','ねこ',-58,12,0xb9aa80,['ひなたの草の上は、いつも気持ちがいいんだ。','今日はどの本のお話をする？']);
    npc('kiki','キキ',28,10,0x8b9fc4,[
      '水の音をきいてごらん。季節を変えると谷の表情も変わるよ。',
      '対岸の家は、読んだ本が増えると少しずつ灯りがつくんだ。'
    ],1);
    npc('jiji','ジジ',34,16,0x7a778b,['橋の先も見てみようよ。','たまには立ち止まって、空を見上げよう。'],1);
    npc('skipper','スキッパー',70,-8,0xc99176,[
      '花の小道と木の実の庭、どちらが好き？ 自分で選べるよ。',
      '感想を残すと、森にはもっとたくさんの実がなるんだ。'
    ],2);
    npc('twins','ふたご',58,40,0xb99b9f,['あっちの坂道、探検した？','ふたりで同じ本を読んでも、好きな場面は違うかもね。'],2);
    npc('twins','ふたご',65,40,0xb9a8a0,['ねえ、今度はどこへ行こう？','森が育つと、知らない道が増えるんだって。'],2);
    npc('zorori','ゾロリ',-100,55,0xcfa77a,['ここからは谷がよく見えるな。','読んだ本のこと、誰かに話すのも楽しいぜ。'],3);
    npc('ishishi','イシシ',103,62,0x9c8dba,[
      '遠くまで歩いてきたね。いま見える景色も、次の本で変わるはず。',
      '読書には競争も締め切りもない。気が向いたらまた本を開こう。'
    ],4);
    npc('noshishi','ノシシ',112,64,0xa6a18a,['ここで一休みしようよ。','星が出るまで、もうちょっと待ってみたいな。'],4);
    if(animatedSprites.length)showPixelFrame(0);
    const nearest=()=>{
      let result=null,dist=Infinity;
      for(const candidate of npcs){
        if(candidate.stageNeed>stage)continue;
        const d=Math.hypot(playerX-candidate.x,playerZ-candidate.z);
        if(d<dist){dist=d;result=candidate}
      }
      return dist<12?result:null;
    };
    let activeNpc=null,turn=0;
    function showSpeech(person){
      activeNpc=person;turn=0;chat.hidden=false;drawSpeech();
    }
    function drawSpeech(){
      if(!activeNpc)return;
      speaker.textContent=activeNpc.name;
      message.textContent=activeNpc.lines[turn%activeNpc.lines.length];
      replies.replaceChildren();
      const more=el('button','','もっときく');
      more.onclick=()=>{turn++;drawSpeech()};
      const later=el('button','','またね');
      later.onclick=()=>{chat.hidden=true};
      replies.append(more,later);
    }
    chatButton.onclick=()=>{const friend=nearest();if(friend)showSpeech(friend)};

    // Touch joystick and camera drag use separate pointers, preventing the
    // browser's scrolling gesture from stealing movement on Android Chrome.
    let stickPointer=null;
    const updateStick=(event)=>{
      const r=joystick.getBoundingClientRect();
      joystickX=clamp((event.clientX-r.left-r.width/2)/(r.width*.34),-1,1);
      joystickY=clamp((event.clientY-r.top-r.height/2)/(r.height*.34),-1,1);
      nub.style.transform=`translate(${joystickX*26}px,${joystickY*26}px)`;
    };
    joystick.addEventListener('pointerdown',event=>{
      event.preventDefault();stickPointer=event.pointerId;joystick.setPointerCapture(event.pointerId);updateStick(event);
    });
    joystick.addEventListener('pointermove',event=>{if(event.pointerId===stickPointer)updateStick(event)});
    const releaseStick=event=>{if(event.pointerId===stickPointer){
      stickPointer=null;joystickX=0;joystickY=0;nub.style.transform='translate(0,0)';
    }};
    joystick.addEventListener('pointerup',releaseStick);
    joystick.addEventListener('pointercancel',releaseStick);
    canvas.addEventListener('pointerdown',event=>{
      if(event.pointerType==='mouse'&&event.button!==0)return;
      lookPointer={id:event.pointerId,x:event.clientX};
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove',event=>{
      if(!lookPointer||event.pointerId!==lookPointer.id)return;
      camYaw-=clamp(event.clientX-lookPointer.x,-55,55)*.009;
      lookPointer.x=event.clientX;
    });
    const finishLook=event=>{if(lookPointer?.id===event.pointerId)lookPointer=null};
    canvas.addEventListener('pointerup',finishLook);
    canvas.addEventListener('pointercancel',finishLook);
    const resize=()=>{
      const w=layer.clientWidth,h=layer.clientHeight;
      if(!w||!h)return;
      renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
    };
    resizeObserver=new ResizeObserver(resize);resizeObserver.observe(layer);resize();
    let last=performance.now(),clock=0,chatNearby=null,lastPixelFrame=-1;
    function tick(now){
      if(disposed)return;
      const dt=Math.min((now-last)/1000,.05);last=now;
      if(!document.hidden){
        const frame=Math.floor(now/250)%4;
        if(frame!==lastPixelFrame){showPixelFrame(frame);lastPixelFrame=frame}
        const forward=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-
          (keys.has('KeyS')||keys.has('ArrowDown')?1:0)-joystickY;
        const right=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-
          (keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+joystickX;
        if(keys.has('KeyQ'))camYaw+=dt*1.7;
        if(keys.has('KeyE'))camYaw-=dt*1.7;
        const length=Math.hypot(forward,right);
        const speed=14*Math.min(1,length),f=length?forward/length:0,r=length?right/length:0;
        const dx=(Math.sin(camYaw)*f+Math.cos(camYaw)*r)*speed*dt;
        const dz=(-Math.cos(camYaw)*f+Math.sin(camYaw)*r)*speed*dt;
        if(allowed(playerX+dx,playerZ,stage>=1))playerX+=dx;
        if(allowed(playerX,playerZ+dz,stage>=1))playerZ+=dz;
        motion+=(speed>0?dt*speed:dt*2.1);
        player.position.set(playerX,
          heightAt(playerX,playerZ)+((stage>=1&&Math.abs(playerZ)<3.2&&
            playerX>riverX(0)-11&&playerX<riverX(0)+11)?1.05:0)+
            (speed>0?Math.abs(Math.sin(motion*2))*.13:0),playerZ);
        if(speed>.2)player.rotation.y=Math.atan2(-dx,-dz);
        const target=new THREE.Vector3(playerX+Math.sin(camYaw)*29,
          player.position.y+22,playerZ+Math.cos(camYaw)*32);
        camera.position.lerp(target,Math.min(1,dt*5));
        camera.lookAt(playerX,player.position.y+5.7,playerZ);
        fireflies.forEach(({mesh,x,z,y,phase})=>{
          mesh.position.set(x+Math.sin(clock+phase)*.6,y+Math.sin(clock*1.7+phase)*.5,z);
        });
        npcs.forEach(person=>{
          person.marker.visible=person.stageNeed<=stage;
          person.glow.position.y=9.8+Math.sin(clock*2+person.x)*.45;
        });
        if(Math.floor(clock*5)%3===0){
          const next=nearest();
          if(next!==chatNearby){
            chatNearby=next;chatButton.hidden=!next;
            chatButton.textContent=next?`${next.name}と はなす`:'おはなし';
          }
        }
        renderer.render(scene,camera);
      }
      clock+=dt;animationId=requestAnimationFrame(tick);
    }
    camera.position.set(-30,27,39);
    loading.remove();
    animationId=requestAnimationFrame(tick);
    cleanupWorld=()=>{
      resizeObserver?.disconnect();
      animatedSprites.forEach(({texture})=>texture.dispose());
      scene.traverse(object=>{
        if(object.geometry)object.geometry.dispose();
        if(object.material){
          const materials=Array.isArray(object.material)?object.material:[object.material];
          materials.forEach(m=>m.dispose());
        }
      });
      renderer.dispose();
    };
  }
  void buildWorld();
  return dispose;
}
