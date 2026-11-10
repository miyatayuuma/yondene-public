import {CHARACTERS,START,isWalkable,walkHeight,heightAt,monthInJapan,MONTHS} from './book-forest-world.mjs';
import {createForestNpcMotion} from './book-forest-npc.mjs';

const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
function el(tag,klass,text){const node=document.createElement(tag);if(klass)node.className=klass;if(text!==undefined)node.textContent=text;return node}
export function getForestAvatar(familyId){try{const value=JSON.parse(localStorage.getItem('yondene-book-forest-prefs:'+familyId)||'null');return ['player_cat','player_rabbit'].includes(value?.avatar)?value.avatar:'player_cat'}catch{return 'player_cat'}}
export function setForestAvatar(familyId,avatar){if(!['player_cat','player_rabbit'].includes(avatar))return;try{localStorage.setItem('yondene-book-forest-prefs:'+familyId,JSON.stringify({avatar}))}catch{}}

// The adapter has no access to shelf data. A future engine may return
// {text, choices:[{id,label}]} and handle select/end independently of Three.js.
const defaultDialogue={
  start:()=>({text:'こんにちは。いっしょに、森の景色を楽しもう。',choices:[]}),
  end:()=>{}
};
export function mountBookForest({familyId,privateSprites=null,onClose=()=>{},dialogue=defaultDialogue,debug=null}={}){
  const images=privateSprites?.images||{};
  let avatar=debug?.avatar||getForestAvatar(familyId),disposed=false,animationId=0,cleanupWorld=()=>{},resizeObserver=null;
  let joystickX=0,joystickY=0,stickPointer=null,lookPointer=null,chatOpen=false,chatSession=0,activeCharacter=null;
  let autoDialogueTimer=null,dialogueRender=0,currentDialogue=null;
  const keys=new Set();
  const layer=el('section','bookForest');layer.setAttribute('role','dialog');layer.setAttribute('aria-modal','true');layer.setAttribute('aria-label','本の森');layer.tabIndex=-1;
  const canvas=el('canvas','bookForestCanvas');canvas.setAttribute('aria-label','本の森の3Dフィールド');
  const vignette=el('div','bookForestVignette');
  const close=el('button','bookForestClose','‹ もどる');close.type='button';
  const bottom=el('div','bookForestBottom');
  const joystick=el('div','bookForestJoystick');joystick.setAttribute('aria-label','移動用スティック');
  const nub=el('div','bookForestNub');joystick.append(nub);
  const chatButton=el('button','bookForestChat','はなす');chatButton.type='button';chatButton.hidden=true;
  bottom.append(joystick,chatButton);
  const chat=el('section','bookForestConversation');chat.hidden=true;chat.setAttribute('aria-live','polite');
  const speaker=el('strong','bookForestSpeaker'),message=el('p','bookForestMessage'),replies=el('div','bookForestReplies');
  const twinHistory=el('div','bookForestTwinHistory');twinHistory.hidden=true;
  const twinWaiting=el('div','bookForestTwinWaiting');twinWaiting.hidden=true;
  twinWaiting.setAttribute('role','status');twinWaiting.setAttribute('aria-label','少し待つとふたごのおしゃべりが続きます');
  for(let i=0;i<3;i++){const dot=el('span','');dot.setAttribute('aria-hidden','true');twinWaiting.append(dot)}
  const dismiss=el('button','bookForestDismiss','とじる');dismiss.type='button';chat.append(speaker,message,twinHistory,twinWaiting,replies,dismiss);
  const loading=el('div','bookForestLoading','森を準備しています…');
  layer.append(canvas,vignette,close,bottom,chat,loading);document.body.append(layer);document.body.classList.add('bookForestOpen');layer.focus({preventScroll:true});
  function stopInput(){keys.clear();joystickX=0;joystickY=0;stickPointer=null;lookPointer=null;nub.style.transform='translate(0,0)'}
  function cancelAutoDialogue(){clearTimeout(autoDialogueTimer);autoDialogueTimer=null;dialogueRender++;twinWaiting.hidden=true}
  function scheduleAutoDialogue(result,identity,session){
    if(result?.mode!=='twins'||result.autoNext!==true||typeof dialogue?.advance!=='function'||document.hidden)return;
    const renderId=dialogueRender;
    twinWaiting.hidden=false;
    autoDialogueTimer=setTimeout(async()=>{
      if(!chatOpen||disposed||chatSession!==session||renderId!==dialogueRender||document.hidden)return;
      try{
        const next=await dialogue.advance(identity);
        if(chatOpen&&!disposed&&chatSession===session&&renderId===dialogueRender&&next)
          renderDialogue(next,identity,session);
      }catch(error){console.warn('Forest twin conversation advance failed',error)}
    },Math.max(2800,Math.min(14000,Number(result.autoDelayMs)||4600)));
  }
  function endDialogue(){
    if(!chatOpen)return;
    const previous=activeCharacter;chatSession++;cancelAutoDialogue();currentDialogue=null;
    chatOpen=false;activeCharacter=null;chat.hidden=true;
    try{dialogue?.end?.({characterId:previous?.dialogueId||previous?.id,displayName:previous?.name})}catch(error){console.warn('Forest dialogue end failed',error)}
  }
  function dispose(){
    if(disposed)return;disposed=true;endDialogue();cancelAnimationFrame(animationId);stopInput();cleanupWorld();resizeObserver?.disconnect();
    document.removeEventListener('keydown',onKeyDown);document.removeEventListener('keyup',onKeyUp);document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('blur',onBlur);
    document.body.classList.remove('bookForestOpen');layer.remove();
  }
  close.onclick=()=>{dispose();onClose()};dismiss.onclick=endDialogue;
  const onKeyDown=event=>{
    if(event.code==='Escape'){event.preventDefault();if(chatOpen)endDialogue();else close.click();return}
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(event.code))event.preventDefault();
    if(chatOpen)return;
    if((event.code==='Space'||event.code==='Enter')&&!event.repeat){if(!chatButton.hidden)chatButton.click();return}
    keys.add(event.code);
  };
  const onKeyUp=event=>keys.delete(event.code),onVisibility=()=>{
    if(document.hidden){stopInput();cancelAutoDialogue()}
    else if(chatOpen&&currentDialogue)scheduleAutoDialogue(...currentDialogue);
  },onBlur=()=>stopInput();
  document.addEventListener('keydown',onKeyDown);document.addEventListener('keyup',onKeyUp);document.addEventListener('visibilitychange',onVisibility);window.addEventListener('blur',onBlur);
  async function showDialogue(character){
    if(chatOpen||disposed)return;
    stopInput();cancelAutoDialogue();currentDialogue=null;chatOpen=true;chat.hidden=false;activeCharacter=character;
    speaker.textContent=character.name;message.hidden=false;message.textContent='…';twinHistory.hidden=true;twinWaiting.hidden=true;
    twinHistory.replaceChildren();replies.replaceChildren();
    const session=++chatSession,identity={characterId:character.dialogueId||character.id,displayName:character.name};
    try{
      const result=await (dialogue?.start||defaultDialogue.start)(identity);
      if(!chatOpen||session!==chatSession||disposed)return;
      renderDialogue(result,identity,session);
    }catch(error){if(chatOpen&&session===chatSession){message.textContent='また あとで はなそうね。';console.warn('Forest dialogue failed',error)}}
  }
  function renderDialogue(result,identity,session){
    cancelAutoDialogue();currentDialogue=[result,identity,session];
    if(result?.mode==='twins'){
      speaker.textContent='ふたご';message.hidden=true;twinHistory.hidden=false;
      const turn=el('div','bookForestTwinTurn');turn.dataset.speaker=String(result.speakerSlot??0);
      turn.append(el('strong','bookForestTwinName',result.speakerName||'ふたご'),
        el('p','bookForestTwinText',typeof result.text==='string'?result.text:''));
      twinHistory.append(turn);
      while(twinHistory.children.length>4)twinHistory.firstChild.remove();
      chat.scrollTop=chat.scrollHeight;
    }else{
      speaker.textContent=activeCharacter?.name||identity.displayName;
      twinHistory.hidden=true;twinHistory.replaceChildren();message.hidden=false;
      message.textContent=typeof result?.text==='string'?result.text:'';chat.scrollTop=0;
    }
    replies.replaceChildren();
    let choosing=false;
    for(const choice of Array.isArray(result?.choices)?result.choices:[]){
      if(typeof choice?.label!=='string')continue;
      const button=el('button','',choice.label);button.type='button';
      button.onclick=async()=>{
        if(choosing)return;
        choosing=true;cancelAutoDialogue();
        for(const item of replies.children)item.disabled=true;
        try{
        const next=await dialogue?.select?.({...identity,choiceId:choice.id});
        if(chatOpen&&session===chatSession&&next)renderDialogue(next,identity,session);
        else if(chatOpen&&session===chatSession){choosing=false;for(const item of replies.children)item.disabled=false;
          scheduleAutoDialogue(result,identity,session)}
      }catch(error){
        console.warn('Forest dialogue choice failed',error);
        if(chatOpen&&session===chatSession){choosing=false;for(const item of replies.children)item.disabled=false;
          scheduleAutoDialogue(result,identity,session)}
      }};replies.append(button);
    }
    scheduleAutoDialogue(result,identity,session);
  }
  async function buildWorld(){
    let world;
    try{
      const create=debug?.createScene||(await import('./book-forest-scene.mjs')).createForestScene;
      world=await create(canvas,MONTHS[debug?.month]?debug.month:monthInJapan());
    }catch(error){if(!disposed){loading.textContent='森を読み込めませんでした。通信を確認して、もう一度お試しください。';console.error('Forest initialization failed',error)}return}
    if(disposed){world.dispose();return}
    const {THREE,renderer,scene,camera,treeObstacles}=world;
    const animated=[];
    function spriteFor(id,height=7){
      const image=images[id],group=new THREE.Group();
      const shadowCanvas=document.createElement('canvas');shadowCanvas.width=64;shadowCanvas.height=64;
      const shadowCtx=shadowCanvas.getContext('2d'),gradient=shadowCtx.createRadialGradient(32,32,1,32,32,31);
      gradient.addColorStop(0,'rgba(31,47,32,.42)');gradient.addColorStop(1,'rgba(31,47,32,0)');shadowCtx.fillStyle=gradient;shadowCtx.fillRect(0,0,64,64);
      const shadowTex=new THREE.CanvasTexture(shadowCanvas),shadow=new THREE.Mesh(new THREE.PlaneGeometry(5,3),new THREE.MeshBasicMaterial({map:shadowTex,transparent:true,depthWrite:false,opacity:.7}));
      shadow.rotation.x=-Math.PI/2;shadow.position.y=.08;shadow.scale.setScalar(height/7);group.add(shadow);
      if(image){
        // Keep the original high-resolution PNG in private Drive. A smaller
        // GPU texture is sufficient at the sprite's on-screen size on phones.
        const sourceFrameSize=image.width/2;
        const displayFrameSize=Math.min(sourceFrameSize,256);
        const frame=document.createElement('canvas');frame.width=displayFrameSize;frame.height=displayFrameSize;
        const ctx=frame.getContext('2d');ctx.imageSmoothingEnabled=false;
        const texture=new THREE.CanvasTexture(frame);texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;
        const material=new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false});
        const sprite=new THREE.Sprite(material);sprite.center.set(.5,0);sprite.position.y=.13;sprite.scale.set(height,height,1);group.add(sprite);
        const entry={ctx,texture,image,current:-1};animated.push(entry);
        function frameAt(i){if(entry.current===i)return;entry.current=i;ctx.clearRect(0,0,displayFrameSize,displayFrameSize);ctx.drawImage(image,(i%2)*sourceFrameSize,Math.floor(i/2)*sourceFrameSize,sourceFrameSize,sourceFrameSize,0,0,displayFrameSize,displayFrameSize);texture.needsUpdate=true}
        frameAt(0);return {group,frameAt};
      }
      // Neutral placeholder is used only if the caller has no authorized sprite.
      const fallback=new THREE.Mesh(new THREE.CapsuleGeometry(.8,1.8,3,8),new THREE.MeshStandardMaterial({color:0xd7c19b}));fallback.position.y=1.8;group.add(fallback);
      return {group,frameAt:()=>{}};
    }
    const player=spriteFor(avatar,7.2);scene.add(player.group);
    const npcs=CHARACTERS.map(info=>{const model=spriteFor(info.spriteId||info.id,6.8*info.scale);model.group.position.set(info.x,walkHeight(info.x,info.z),info.z);scene.add(model.group);return {...info,model,moving:false}});
    let playerX=START.x,playerZ=START.z,yaw=START.yaw,targetYaw=yaw,pitch=.53,targetPitch=pitch,clock=0,last=performance.now(),frames=0,frameTime=0,lastPerf=last,checkMonth=0;
    const canWalk=(x,z)=>isWalkable(x,z)&&!treeObstacles.some(t=>Math.hypot(x-t.x,z-t.z)<t.r);
    const npcMotion=createForestNpcMotion(npcs,canWalk);
    const nearby=()=>{
      let candidate=null,distance=7.2;
      for(const npc of npcs){const d=Math.hypot(playerX-npc.x,playerZ-npc.z);if(d<distance){candidate=npc;distance=d}}
      return candidate;
    };
    chatButton.onclick=()=>{const npc=nearby();if(npc)void showDialogue(npc)};
    function updateStick(event){
      const r=joystick.getBoundingClientRect(),dx=(event.clientX-r.left-r.width/2)/(r.width*.34),dy=(event.clientY-r.top-r.height/2)/(r.height*.34),m=Math.max(1,Math.hypot(dx,dy));
      joystickX=dx/m;joystickY=dy/m;nub.style.transform=`translate(${joystickX*27}px,${joystickY*27}px)`;
    }
    joystick.addEventListener('pointerdown',event=>{if(chatOpen)return;event.preventDefault();stickPointer=event.pointerId;joystick.setPointerCapture(event.pointerId);updateStick(event)});
    joystick.addEventListener('pointermove',event=>{if(event.pointerId===stickPointer)updateStick(event)});
    const release=event=>{if(event.pointerId===stickPointer){stickPointer=null;joystickX=joystickY=0;nub.style.transform='translate(0,0)'}};
    joystick.addEventListener('pointerup',release);joystick.addEventListener('pointercancel',release);joystick.addEventListener('lostpointercapture',release);
    canvas.addEventListener('pointerdown',event=>{if(chatOpen||event.pointerType==='mouse'&&event.button!==0)return;lookPointer={id:event.pointerId,x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId)});
    canvas.addEventListener('pointermove',event=>{
      if(!lookPointer||event.pointerId!==lookPointer.id)return;
      targetYaw-=clamp(event.clientX-lookPointer.x,-40,40)*.0065;
      targetPitch=clamp(targetPitch+clamp(event.clientY-lookPointer.y,-40,40)*.0035,.28,.9);
      lookPointer.x=event.clientX;lookPointer.y=event.clientY;
    });
    const finishLook=event=>{if(lookPointer?.id===event.pointerId)lookPointer=null};
    canvas.addEventListener('pointerup',finishLook);canvas.addEventListener('pointercancel',finishLook);canvas.addEventListener('lostpointercapture',finishLook);
    function resize(){const w=layer.clientWidth,h=layer.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}
    resizeObserver=new ResizeObserver(resize);resizeObserver.observe(layer);resize();
    function moveCamera(dt,immediate=false){
      yaw+=(targetYaw-yaw)*Math.min(1,dt*9);pitch+=(targetPitch-pitch)*Math.min(1,dt*8);
      const py=player.group.position.y,dist=19,desired=new THREE.Vector3(playerX-Math.sin(yaw)*dist,py+5+Math.sin(pitch)*16,playerZ+Math.cos(yaw)*dist);
      // Keep the camera above terrain between the player and the desired position.
      for(let i=1;i<=8;i++){
        const t=i/8,x=playerX+(desired.x-playerX)*t,z=playerZ+(desired.z-playerZ)*t;
        desired.y=Math.max(desired.y,py+3+(heightAt(x,z)+1.4-(py+3))/t);
      }
      camera.position.lerp(desired,immediate?1:Math.min(1,dt*6));
      camera.lookAt(playerX+Math.sin(yaw)*3,py+3.5,playerZ-Math.cos(yaw)*3);
    }
    player.group.position.set(playerX,walkHeight(playerX,playerZ),playerZ);moveCamera(1,true);
    function tick(now){
      if(disposed)return;
      const dt=Math.min(Math.max((now-last)/1000,0),.05);last=now;
      if(!document.hidden){
        const forward=chatOpen?0:(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-joystickY;
        const right=chatOpen?0:(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+joystickX;
        if(!chatOpen){if(keys.has('KeyQ'))targetYaw+=dt*1.25;if(keys.has('KeyE'))targetYaw-=dt*1.25}
        const length=Math.hypot(forward,right),f=length?forward/length:0,r=length?right/length:0,speed=9.2*Math.min(1,length);
        const dx=(Math.sin(yaw)*f+Math.cos(yaw)*r)*speed*dt,dz=(-Math.cos(yaw)*f+Math.sin(yaw)*r)*speed*dt;
        const oldX=playerX,oldZ=playerZ;
        if(canWalk(playerX+dx,playerZ))playerX+=dx;
        if(canWalk(playerX,playerZ+dz))playerZ+=dz;
        const moving=Math.hypot(playerX-oldX,playerZ-oldZ)>.001;
        player.group.position.set(playerX,walkHeight(playerX,playerZ),playerZ);
        player.frameAt(moving?Math.floor(now/250)%4:0);
        npcMotion.step(dt,{playerX,playerZ,activeId:chatOpen?activeCharacter?.id:null});
        for(const npc of npcs){
          npc.model.group.position.set(npc.x,walkHeight(npc.x,npc.z),npc.z);
          npc.model.frameAt(npc.moving?Math.floor(now/250)%4:0);
        }
        moveCamera(dt);world.animate(clock);
        chatButton.hidden=chatOpen||!nearby();
        renderer.render(scene,camera);
        frames++;frameTime+=dt;
        if(now-lastPerf>6000){
          const fps=frames/Math.max(.001,frameTime);
          if(fps<25&&renderer.getPixelRatio()>.95){renderer.setPixelRatio(Math.max(.9,renderer.getPixelRatio()-.2));resize()}
          frames=0;frameTime=0;lastPerf=now;
        }
        if(!debug?.month&&now-checkMonth>60000){const current=monthInJapan();if(current!==lastMonth){lastMonth=current;world.setMonth(current)}checkMonth=now}
      }
      clock+=dt;animationId=requestAnimationFrame(tick);
    }
    let lastMonth=debug?.month||monthInJapan();
    cleanupWorld=()=>{animated.forEach(e=>e.texture.dispose());world.dispose()};
    if(debug?.onReady)debug.onReady({
      setView({x,z,yaw:angle=0,pitch:vertical=.53}){playerX=x;playerZ=z;yaw=targetYaw=angle;pitch=targetPitch=vertical;player.group.position.set(x,walkHeight(x,z),z);moveCamera(1,true)},
      setMonth(month){if(MONTHS[month])world.setMonth(month)},
      getState(){return {x:playerX,z:playerZ,chatOpen,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,pixelRatio:renderer.getPixelRatio(),nearby:nearby()?.id||null,
        npcs:npcs.map(({id,x,z,moving})=>({id,x,z,moving}))}},
      characters:npcs.map(({id,name,x,z,scale,spriteId,dialogueId})=>({id,name,x,z,scale,spriteId:spriteId||id,dialogueId:dialogueId||id}))
    });
    loading.remove();animationId=requestAnimationFrame(tick);
  }
  void buildWorld();
  return dispose;
}
