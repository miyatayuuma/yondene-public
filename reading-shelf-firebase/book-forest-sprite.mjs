// The median opaque column locates the torso even with an off-centre prop.
// Only substantial rows under the torso are candidates for the sole.
export function inspectPose(pixels,size) {
  const columns=new Uint32Array(size);
  let count=0,top=size;
  const opaque=(x,y)=>pixels[4*(y*size+x)+3]>=112;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(opaque(x,y)){
    columns[x]++;count++;top=Math.min(top,y);
  }
  if(!count)return {x:.5,foot:1,top:0};
  let center=0,sum=columns[0];
  while(sum<count/2)sum+=columns[++center];
  const half=Math.max(2,Math.round(Math.sqrt(count)*.38));
  let foot=top;
  for(let y=top;y<size;y++){
    let row=0;
    for(let x=Math.max(0,center-half);x<=Math.min(size-1,center+half);x++)if(opaque(x,y))row++;
    if(row>=Math.max(1,Math.round(half*.14)))foot=y;
  }
  return {x:(center+.5)/size,foot:(foot+1)/size,top:top/size};
}

// A single pixels-to-world scale across the cycle. Optional normalized anchors
// apply to all four poses unless a frame override is supplied.
export function spriteLayout(poses,profile={}) {
  const frames=poses.map((pose,i)=>{
    const frame={...pose};
    for(const adjustment of [profile?.anchor,profile?.frames?.[i]]){
      for(const key of ['x','foot','top']){
        const value=adjustment?.[key];
        if(Number.isFinite(value)&&value>=0&&value<=1)frame[key]=value;
      }
    }
    return frame.foot>frame.top?frame:pose;
  });
  const span=Math.max(.1,...frames.map(p=>p.foot-p.top));
  return {span,frames};
}
