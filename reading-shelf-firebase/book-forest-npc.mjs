// NPC walking is intentionally independent of renderer, dialogue and reading data.
// A deterministic generator keeps each actor's wandering reproducible in tests.
function seededRandom(id){
  let seed=2166136261;
  for(const c of id){seed^=c.charCodeAt(0);seed=Math.imul(seed,16777619)}
  return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
}

const distance=(ax,az,bx,bz)=>Math.hypot(ax-bx,az-bz);

function unobstructed(ax,az,bx,bz,canWalk){
  const length=distance(ax,az,bx,bz);
  const steps=Math.max(1,Math.ceil(length/.65));
  for(let i=0;i<=steps;i++){
    const t=i/steps;
    if(!canWalk(ax+(bx-ax)*t,az+(bz-az)*t))return false;
  }
  return true;
}

/** Mutates only each actor's x/z/moving fields, preserving its home and identity. */
export function createForestNpcMotion(actors,canWalk){
  const states=actors.map(actor=>{
    const random=seededRandom(actor.id);
    return {actor,random,homeX:actor.x,homeZ:actor.z,
      radius:actor.roamRadius??5,speed:actor.walkSpeed??1.2,
      goal:null,rest:1.4+random()*4.2};
  });
  const grouped=new Map(),followers=new Set(),partners=new Map();
  for(const state of states){
    if(!state.actor.groupId)continue;
    if(!grouped.has(state.actor.groupId))grouped.set(state.actor.groupId,[]);
    grouped.get(state.actor.groupId).push(state);
  }
  for(const group of grouped.values()){
    if(group.length!==2)continue;
    const [leader,follower]=group;
    followers.add(follower);
    partners.set(leader,{follower,offsetX:follower.actor.x-leader.actor.x,
      offsetZ:follower.actor.z-leader.actor.z});
  }

  function freeOfOtherActors(state,nx,nz,margin=1.9){
    const pair=partners.get(state),fx=nx+(pair?.offsetX||0),fz=nz+(pair?.offsetZ||0);
    return !states.some(other=>other!==state&&other!==pair?.follower&&
      (distance(nx,nz,other.actor.x,other.actor.z)<margin||pair&&
       distance(fx,fz,other.actor.x,other.actor.z)<margin));
  }

  function chooseGoal(state){
    const {actor,random,homeX,homeZ,radius}=state;
    const pair=partners.get(state);
    for(let attempt=0;attempt<18;attempt++){
      const direction=random()*Math.PI*2;
      const length=radius*Math.sqrt(random());
      const x=homeX+Math.cos(direction)*length,z=homeZ+Math.sin(direction)*length;
      if(distance(actor.x,actor.z,x,z)<1.8)continue;
      if(!freeOfOtherActors(state,x,z,2.3))continue;
      if(unobstructed(actor.x,actor.z,x,z,canWalk)&&(!pair||
        unobstructed(pair.follower.actor.x,pair.follower.actor.z,
          x+pair.offsetX,z+pair.offsetZ,canWalk)))return {x,z};
    }
    return null;
  }

  /** The approached NPC waits for a conversation; other NPCs keep living. */
  function step(dt,{playerX,playerZ,activeId=null}={}){
    if(!(dt>0))return;
    const elapsed=Math.min(dt,.1);
    for(const state of states){
      const {actor,random}=state;
      if(followers.has(state))continue;
      const pair=partners.get(state),partner=pair?.follower.actor;
      actor.moving=false;
      if(partner)partner.moving=false;
      if(actor.id===activeId||partner?.id===activeId||
        distance(actor.x,actor.z,playerX,playerZ)<6.5||partner&&
        distance(partner.x,partner.z,playerX,playerZ)<6.5){
        // Prevent an NPC walking away when the talk button becomes available.
        state.goal=null;state.rest=Math.max(state.rest,1.5);
        continue;
      }
      if(state.rest>0){state.rest-=elapsed;continue}
      if(!state.goal){
        state.goal=chooseGoal(state);
        if(!state.goal){state.rest=1.5+random()*2.5;continue}
      }
      const {x,z}=state.goal;
      const left=distance(actor.x,actor.z,x,z);
      if(left<.12){state.goal=null;state.rest=2+random()*5;continue}
      const amount=Math.min(left,state.speed*elapsed),nx=actor.x+(x-actor.x)/left*amount,nz=actor.z+(z-actor.z)/left*amount;
      if(!canWalk(nx,nz)||pair&&!canWalk(nx+pair.offsetX,nz+pair.offsetZ)||
        !freeOfOtherActors(state,nx,nz)){
        state.goal=null;state.rest=1+random()*2;continue;
      }
      actor.x=nx;actor.z=nz;actor.moving=true;
      if(partner){partner.x=nx+pair.offsetX;partner.z=nz+pair.offsetZ;partner.moving=true}
      if(amount>=left-.001){state.goal=null;state.rest=2+random()*5}
    }
  }

  return {step};
}
