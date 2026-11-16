import {unlockedStoryMemories} from './book-forest-story-memory.mjs';

// All character-specific names and dialogue are supplied by the PRIVATE sheet.
// This public module implements only the two-speaker conversation protocol.
const ID=/^[A-Za-z0-9_-]{1,100}$/u;
const NAME=/^[^「」『』<>\r\n{}]{1,12}$/u;
const MAX_LINES=160;
const acceptableText=value=>typeof value==='string'&&value.trim().length>0&&
  value.length<=180&&!/[「」<>]/u.test(value)&&
  !/\{(?!firstName\}|secondName\})[^}]*\}/u.test(value);
const allowedName=value=>typeof value==='string'&&NAME.test(value.trim());

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

function validLine(line){
  if(line?.schemaVersion!==1||line.approval!=='approved'||!ID.test(line.sceneId)||
    !Number.isInteger(line.sequence)||line.sequence<1||line.sequence>10||
    ![0,1,2].includes(line.speakerSlot)||!acceptableText(line.text))return false;
  if((line.bookId||line.memoryId)&&(!ID.test(line.bookId)||!ID.test(line.memoryId)))return false;
  if(line.choices!==undefined&&(!Array.isArray(line.choices)||line.choices.length>2||
    line.choices.some(choice=>!ID.test(choice?.id)||!acceptableText(choice?.label)||
      choice.label.length>24||![1,2].includes(choice?.speakerSlot)||
      !acceptableText(choice?.text))))return false;
  return true;
}

export function validateTwinScenes(lines){
  if(!Array.isArray(lines))return [];
  // The loader returns grouped scenes; the cache and director revalidate them.
  const source=lines.flatMap(item=>Array.isArray(item?.lines)?item.lines:[item]);
  const groups=new Map();
  for(const line of source.slice(0,MAX_LINES)){
    if(!ID.test(line?.sceneId))continue;
    if(!groups.has(line.sceneId))groups.set(line.sceneId,[]);
    groups.get(line.sceneId).push(line);
  }
  const scenes=[];
  for(const [id,rows] of groups){
    rows.sort((a,b)=>a.sequence-b.sequence);
    if(rows.length<3||rows.length>10||rows.some((line,i)=>!validLine(line)||
      line.sequence!==i+1||i!==0&&line.speakerSlot===0||
      (line.bookId||'')!==(rows[0].bookId||'')||
      (line.memoryId||'')!==(rows[0].memoryId||'')))continue;
    if(id==='intro'&&rows[0].speakerSlot!==0)continue;
    if(id!=='intro'&&rows.some(line=>line.speakerSlot===0))continue;
    scenes.push({id,bookId:rows[0].bookId||null,memoryId:rows[0].memoryId||null,
      lines:rows});
  }
  return scenes;
}

export function createTwinConversationDirector({getBooks=()=>[],getCatalog=()=>[],
  getNamePairs=()=>[],getScenes=()=>[]}={}){
  let active=null;
  async function allowedScenes(){
    const books=await getBooks(),catalog=await getCatalog();
    const memories=new Map(unlockedStoryMemories(books,catalog).map(item=>[item.id,item]));
    return validateTwinScenes(await getScenes()).filter(scene=>!scene.memoryId||
      memories.get(scene.memoryId)?.bookId===scene.bookId);
  }
  function nameFor(slot){return slot===0?'ふたご':
    slot===1?active.names.firstName:active.names.secondName}
  function render(line){
    const text=line.text.replaceAll('{firstName}',active.names.firstName)
      .replaceAll('{secondName}',active.names.secondName);
    const choices=(line.choices||[]).map(choice=>({id:choice.id,label:choice.label}));
    active.pendingChoices=line.choices||[];
    const hasNext=active.offset<active.scene.lines.length;
    return {mode:'twins',speakerName:nameFor(line.speakerSlot),speakerSlot:line.speakerSlot,text,choices,
      ...nextSpeaker(),conversationComplete:!hasNext,
      autoNext:hasNext,autoDelayMs:choices.length?11500:
        Math.min(7700,Math.max(3400,2500+text.length*90))};
  }
  function chooseEncounterScene(scenes,encounter){
    const all=scenes.filter(scene=>scene.id!=='intro');
    const ambient=all.filter(scene=>!scene.memoryId),story=all.filter(scene=>scene.memoryId);
    const preferStory=encounter%3===2;
    let pool=preferStory&&story.length?story:ambient.length?ambient:story;
    if(!pool.length)return null;
    return pool[(encounter-1)%pool.length];
  }
  function nextSpeaker(){
    const next=active.scene.lines[active.offset];
    return next?{nextSpeakerName:nameFor(next.speakerSlot),nextSpeakerSlot:next.speakerSlot}:{};
  }
  function advanceLocal(){
    if(!active)return null;
    if(active.offset>=active.scene.lines.length){
      active=null;return null;
    }
    return render(active.scene.lines[active.offset++]);
  }
  return {
    async start({encounter=0}={}){
      const names=validateTwinNamePairs(await getNamePairs());
      const scenes=await allowedScenes();
      const introduction=scenes.find(scene=>scene.id==='intro');
      if(!names.length||!introduction||scenes.length<2){active=null;return null}
      const scene=encounter===0?introduction:chooseEncounterScene(scenes,encounter);
      if(!scene){active=null;return null}
      active={names:names[encounter%names.length],scenes,scene,offset:0,pendingChoices:[]};
      return advanceLocal();
    },
    async advance(){
      if(!active)return null;
      // Recheck authorization: a book may be marked unread while the forest is open.
      active.scenes=await allowedScenes();
      if(active.scene.memoryId){
        const stillAllowed=active.scenes.some(scene=>scene.id===active.scene.id);
        if(!stillAllowed){active=null;return null}
      }
      return advanceLocal();
    },
    select({choiceId}={}){
      if(!active)return null;
      const choice=active.pendingChoices.find(item=>item.id===choiceId);
      if(!choice)return null;
      active.pendingChoices=[];
      const text=choice.text.replaceAll('{firstName}',active.names.firstName)
        .replaceAll('{secondName}',active.names.secondName);
      const hasNext=active.offset<active.scene.lines.length;
      return {mode:'twins',speakerName:nameFor(choice.speakerSlot),speakerSlot:choice.speakerSlot,text,
        ...nextSpeaker(),choices:[],conversationComplete:!hasNext,autoNext:hasNext,
        autoDelayMs:Math.min(6600,3200+text.length*80)};
    },
    end(){active=null},
    getActiveNames(){return active?{...active.names}:null}
  };
}
