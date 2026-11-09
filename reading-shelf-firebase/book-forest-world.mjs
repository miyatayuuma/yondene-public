// Landscape data and navigation are independent of reading records and dialogue.
export const WORLD_LIMIT=103;
export const WATER_LEVEL=0.25;
export const BRIDGE_Z=[6,-54];
export const POND={x:-62,z:-44,r:13};
export const PATHS=[
  [[-48,32],[-30,24],[-20,14],[-12,6],[0,6],[14,6],[26,6],[40,13],[54,26],[64,45],[69,65]],
  [[-48,32],[-64,21],[-74,4],[-78,-19],[-79,-42],[-70,-62],[-46,-68],[-24,-64],[-7,-54],[8,-54],[24,-54],[39,-42],[43,-20],[40,13]],
  [[-30,24],[-28,10],[-26,-1]],
  [[-64,21],[-69,-3],[-77,-19]],
  [[54,26],[40,37],[43,54],[56,64],[69,65]],
  [[-79,-42],[-70,-36],[-64,-29]]
];
export const HOUSES=[
  {x:-27,z:-9,type:'house',scale:12,rotation:.35},
  {x:-46,z:37,type:'house',scale:10,rotation:-.55},
  {x:38,z:20,type:'house',scale:12,rotation:2.8},
  {x:45,z:-22,type:'house',scale:11,rotation:2.25},
  {x:69,z:72,type:'hall',scale:8,rotation:2.9}
];
export const CHARACTERS=[
  // Size is relative to the existing 6.8-unit NPC sprite baseline.
  // Home positions also define each character's small, familiar roaming area.
  {id:'king',name:'王さま',x:-22,z:17,scale:1.2,roamRadius:5,walkSpeed:1.1},
  {id:'cat',name:'ねこ',x:-49,z:23,scale:.7,roamRadius:5,walkSpeed:1.35},
  {id:'kiki',name:'キキ',x:24,z:9,scale:1,roamRadius:5,walkSpeed:1.3},
  {id:'jiji',name:'ジジ',x:29,z:13,scale:.5,roamRadius:3.8,walkSpeed:1.65},
  {id:'skipper',name:'スキッパー',x:41,z:-10,scale:.8,roamRadius:6,walkSpeed:1.15},
  {id:'twins',name:'ふたご',x:52,z:30,scale:.8,roamRadius:4.5,walkSpeed:1.2},
  // Both twins use the same private Drive sprite and the same dialogue identity.
  {id:'twins_second',dialogueId:'twins',spriteId:'twins',name:'ふたご',x:56,z:33,scale:.8,roamRadius:4.5,walkSpeed:1.2},
  {id:'zorori',name:'ゾロリ',x:-72,z:-8,scale:1.2,roamRadius:7,walkSpeed:1.35},
  {id:'ishishi',name:'イシシ',x:61,z:60,scale:.8,roamRadius:4,walkSpeed:1.2},
  {id:'noshishi',name:'ノシシ',x:66,z:62,scale:.8,roamRadius:4,walkSpeed:1.2}
];
export const START={x:-22,z:27,yaw:.15};
export const riverX=z=>5+4*Math.sin(z*.038)+1.4*Math.sin(z*.09);
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const smooth=(a,b,n)=>{const t=clamp((n-a)/(b-a),0,1);return t*t*(3-2*t)};
function naturalHeightAt(x,z){
  const roll=.6*Math.sin(x*.052+z*.025)*Math.cos(z*.047)+.35*Math.sin(z*.07-x*.02);
  const hill=10*smooth(40,97,Math.hypot(x-53,z-57))*(x<0?.16:.22)+
    9*Math.exp(-((x-69)**2+(z-65)**2)/1250)+
    5*smooth(68,108,Math.hypot(x,z));
  const base=1.55+roll+hill;
  const bank=(distance)=>distance<0
    ? WATER_LEVEL-1.5*smooth(0,3,-distance)
    : WATER_LEVEL+(base-WATER_LEVEL)*smooth(0,6,distance);
  // Both shores meet the water at the surface and the beds stay below it.
  const river=bank(Math.abs(x-riverX(z))-4.15);
  const pond=bank(Math.hypot(x-POND.x,z-POND.z)-POND.r);
  return Math.min(base,river,pond);
}
const houseLevels=HOUSES.map(h=>naturalHeightAt(h.x,h.z));
export function heightAt(x,z){
  let height=naturalHeightAt(x,z);
  HOUSES.forEach((house,index)=>{
    const distance=Math.hypot(x-house.x,z-house.z);
    if(distance<13){
      const blend=1-smooth(8.5,13,distance);
      height+=(houseLevels[index]-height)*blend;
    }
  });
  return height;
}
export function bridgeAt(x,z){
  for(const bz of BRIDGE_Z){
    const center=riverX(bz),dx=x-center;
    if(Math.abs(z-bz)<3.15&&Math.abs(dx)<10.2){
      const t=clamp((dx+10.2)/20.4,0,1);
      const left=heightAt(center-10.2,bz),right=heightAt(center+10.2,bz);
      return left*(1-t)+right*t+.35*Math.sin(Math.PI*t);
    }
  }
  return null;
}
export function walkHeight(x,z){return bridgeAt(x,z)??heightAt(x,z)}
export function isWalkable(x,z){
  if(Math.abs(x)>WORLD_LIMIT-4||Math.abs(z)>WORLD_LIMIT-4)return false;
  if(Math.hypot(x-POND.x,z-POND.z)<POND.r+.3)return false;
  if(Math.abs(x-riverX(z))<4.2&&bridgeAt(x,z)===null)return false;
  if(HOUSES.some(h=>{
    const dx=x-h.x,dz=z-h.z,c=Math.cos(h.rotation),s=Math.sin(h.rotation);
    const lx=c*dx-s*dz,lz=s*dx+c*dz,margin=.65;
    const bounds=h.type==='hall'?[-.595,.577,-.703,.630]:[-.396,.396,-.469,.385];
    return lx>bounds[0]*h.scale-margin&&lx<bounds[1]*h.scale+margin&&
      lz>bounds[2]*h.scale-margin&&lz<bounds[3]*h.scale+margin;
  }))return false;
  return true;
}
export function monthInJapan(date=new Date()){
  return Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',month:'numeric'}).format(date));
}
// Tuned as a palette, density and coverage profile for each calendar month.
export const MONTHS=[
 null,
 {sky:0xc7dce2,fog:0xc9dadd,ground:0xa3aa8c,leaf:[0x869c83,0x9ca891,0x7f957c],flower:0.03,leafScale:.18,snow:.62,sun:0xffe9ce,water:0x779f9e},
 {sky:0xd0e2e2,fog:0xc7d9d2,ground:0xa7b392,leaf:[0x8ca481,0xa8b18d,0x899c7d],flower:.10,leafScale:.28,snow:.30,sun:0xffe9cb,water:0x80aaa7},
 {sky:0xc5e1df,fog:0xc4d9ce,ground:0x9ab989,leaf:[0xa3bc8a,0xb3c69a,0x8ba77e],flower:.34,leafScale:.52,snow:0,sun:0xffe9ca,water:0x78aaa4},
 {sky:0xc4e4df,fog:0xc4ded0,ground:0x91ba83,leaf:[0xa4ca8d,0xc1d5a0,0x83b185],flower:.74,leafScale:.8,snow:0,sun:0xffedce,water:0x75b5ac},
 {sky:0xbde1d9,fog:0xc0dacb,ground:0x86b47c,leaf:[0x8cbd7d,0xa1ca8c,0x75a979],flower:1,leafScale:1,snow:0,sun:0xffedcd,water:0x70b1a9},
 {sky:0xb7d4d0,fog:0xaac9bd,ground:0x7eaa78,leaf:[0x6fa679,0x85b783,0x6b9e72],flower:.65,leafScale:1.04,snow:0,sun:0xf2e8cd,water:0x6caaa4},
 {sky:0xb0d9e2,fog:0xb7d7d0,ground:0x84ad74,leaf:[0x6eaa73,0x91be7d,0x669c70],flower:.52,leafScale:1.04,snow:0,sun:0xffedc3,water:0x6fb4b1},
 {sky:0xb6dce4,fog:0xc2dad2,ground:0x8daf75,leaf:[0x70a571,0x8ab67a,0x61996d],flower:.55,leafScale:1.02,snow:0,sun:0xffe8bb,water:0x71b8bb},
 {sky:0xc6ddda,fog:0xc7d9cd,ground:0x98ac79,leaf:[0x8aab72,0xa7b779,0x739b6b],flower:.34,leafScale:1,snow:0,sun:0xffe6ba,water:0x7aada8},
 {sky:0xd7ddd1,fog:0xd2d1bb,ground:0xb1a979,leaf:[0xc19a60,0xb9ad68,0x93a36b],flower:.22,leafScale:.91,snow:0,sun:0xffdeb1,water:0x83aaa4},
 {sky:0xe1d8c8,fog:0xd5cbb7,ground:0xb19c72,leaf:[0xba7e55,0xd0a263,0xa6965d],flower:.08,leafScale:.68,snow:0,sun:0xffdcac,water:0x8aa8a3},
 {sky:0xcbdde0,fog:0xc9d7d2,ground:0xa8ac91,leaf:[0x929d82,0xa2ab91,0x899b80],flower:.03,leafScale:.22,snow:.15,sun:0xffe4ca,water:0x82a6a6}
];
