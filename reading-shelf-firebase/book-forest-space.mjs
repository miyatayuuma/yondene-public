// Scene placements register oriented boxes in a small broad-phase grid.
// Vertical bounds allow a camera above a fence or below a canopy.
export function createObstacleField() {
  const cells=new Map(), cellSize=12;
  const key=(x,z)=>Math.floor(x/cellSize)+','+Math.floor(z/cellSize);
  function add({x,z,width,depth,angle=0,bottom,top,canopy=false}) {
    const c=Math.cos(angle),s=Math.sin(angle),w=width/2,d=depth/2;
    const extent=Math.hypot(w,d)+2,box={x,z,c,s,w,d,bottom,top,canopy};
    for(let i=Math.floor((x-extent)/cellSize);i<=Math.floor((x+extent)/cellSize);i++)
      for(let j=Math.floor((z-extent)/cellSize);j<=Math.floor((z+extent)/cellSize);j++){
        const id=i+','+j;
        if(!cells.has(id))cells.set(id,[]);
        cells.get(id).push(box);
      }
  }
  function blocked(x,z,radius,y=null) {
    return (cells.get(key(x,z))||[]).some(b=>{
      if(y===null?b.canopy:y+radius<b.bottom||y-radius>b.top)return false;
      const dx=x-b.x,dz=z-b.z;
      const u=Math.max(0,Math.abs(dx*b.c-dz*b.s)-b.w);
      const v=Math.max(0,Math.abs(dx*b.s+dz*b.c)-b.d);
      return u*u+v*v<=radius*radius;
    });
  }
  return {add,blocked};
}
