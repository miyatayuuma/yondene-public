import {validateForestGestureMark} from './book-forest-gesture.mjs';

// Small, short-lived inscription near the cat. The AI never supplies HTML,
// font files, colors, coordinates or arbitrary drawing commands.
export function createForestCatWriting({THREE,scene,walkHeight,createCanvas=()=>document.createElement('canvas')}){
  let current=null;
  function clear(){
    if(!current)return;
    scene.remove(current.mesh);
    current.mesh.geometry.dispose();
    current.mesh.material.dispose();
    current.texture.dispose();
    current=null;
  }
  function show(raw,actor){
    clear();
    const mark=validateForestGestureMark(raw);
    if(!mark||!actor||!Number.isFinite(actor.x)||!Number.isFinite(actor.z))return false;
    const canvas=createCanvas();canvas.width=512;canvas.height=256;
    const ctx=canvas.getContext('2d');
    if(!ctx)return false;
    ctx.clearRect(0,0,512,256);
    if(mark.surface==='leaf'){
      ctx.fillStyle='rgba(44,91,50,.97)';
      ctx.beginPath();
      ctx.ellipse(256,129,226,106,-.12,0,Math.PI*2);
      ctx.fill();
      ctx.strokeStyle='rgba(165,207,127,.82)';
      ctx.lineWidth=3;
      ctx.beginPath();ctx.moveTo(63,174);ctx.lineTo(449,78);ctx.stroke();
      ctx.fillStyle='#fff4ca';
    }else if(mark.surface==='note'){
      // The original cat is a capable note-maker. Notes are more faithful
      // to that characterization than arbitrary single-word scratches.
      ctx.fillStyle='rgba(255,250,221,.97)';
      ctx.fillRect(27,24,458,208);
      ctx.fillStyle='#433d37';
    }else{
      ctx.fillStyle='rgba(213,188,143,.93)';
      ctx.beginPath();
      ctx.ellipse(256,130,230,105,0,0,Math.PI*2);
      ctx.fill();
      ctx.fillStyle='#684b31';
    }
    // Wrap the validated kana ourselves. The model never controls line
    // breaks, font, coordinates or canvas operations.
    const glyphs=Array.from(mark.word);
    const lineLength=14;
    const lines=[];
    for(let i=0;i<glyphs.length;i+=lineLength)
      lines.push(glyphs.slice(i,i+lineLength).join(''));
    ctx.font='bold 50px "Hiragino Maru Gothic ProN","Noto Sans JP",sans-serif';
    ctx.textAlign='center';ctx.textBaseline='middle';
    const lineHeight=50;
    const firstY=129-(lines.length-1)*lineHeight/2;
    for(let i=0;i<lines.length;i++)ctx.fillText(lines[i],256,firstY+i*lineHeight,410);
    const texture=new THREE.CanvasTexture(canvas);
    texture.colorSpace=THREE.SRGBColorSpace;
    const geometry=new THREE.PlaneGeometry(5.8,2.9);
    geometry.rotateX(-Math.PI/2);
    const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,
      depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
    const mesh=new THREE.Mesh(geometry,material);
    mesh.name='forest-cat-writing';
    const x=actor.x+2.2,z=actor.z+1.7;
    mesh.position.set(x,walkHeight(x,z)+.17,z);
    scene.add(mesh);
    current={mesh,texture};
    return true;
  }
  return {show,clear,dispose:clear};
}
