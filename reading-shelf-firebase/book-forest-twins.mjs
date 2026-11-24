// All character-specific names and dialogue are supplied by the PRIVATE sheet.
// This public module implements only the two-speaker conversation protocol.
const ID=/^[A-Za-z0-9_-]{1,100}$/u;
const NAME=/^[^「」『』<>\r\n{}]{1,12}$/u;

// The model addresses speaker slots. The UI assigns the saved names.
export function validateTwinTurns(turns){
  if(!Array.isArray(turns)||turns.length!==2)return null;
  const lines=turns.map(turn=>({speakerSlot:turn?.speakerSlot,text:typeof turn?.text==='string'?turn.text.trim():''}));
  if(lines.some(line=>![1,2].includes(line.speakerSlot)||typeof line.text!=='string'||
    line.text.length<2||line.text.length>90||/[「」『』{}<>\r\n]/u.test(line.text))||
    lines[0].speakerSlot===lines[1].speakerSlot||lines[0].text===lines[1].text)return null;
  return lines;
}

export function twinDialogueFrame(line,names,{next,choices=[],closing=false}={}){
  const nameFor=slot=>slot===1?names.firstName:names.secondName;
  return {mode:'twins',speakerSlot:line.speakerSlot,speakerName:nameFor(line.speakerSlot),
    text:line.text,choices:next?[]:choices,conversationComplete:closing&&!next,
    ...(next?{autoNext:true,autoDelayMs:Math.min(5500,2900+line.text.length*65),
      nextSpeakerSlot:next.speakerSlot,nextSpeakerName:nameFor(next.speakerSlot)}:{})};
}
const allowedName=value=>typeof value==='string'&&value===value.trim()&&NAME.test(value);

export function validateTwinNamePairs(pairs){
  if(!Array.isArray(pairs))return [];
  const ids=new Set();
  return pairs.slice(0,20).filter(pair=>{
    if(pair?.schemaVersion!==1||pair.approval!=='approved'||!ID.test(pair.id)||
      !allowedName(pair.firstName)||!allowedName(pair.secondName)||
      pair.firstName===pair.secondName||ids.has(pair.id))return false;
    ids.add(pair.id);return true;
  });
}
