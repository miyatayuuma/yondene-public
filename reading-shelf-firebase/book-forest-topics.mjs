import {FOREST_CHARACTER_IDS,FOREST_RELATIONS,forestMemoryBelongsToCharacter} from './forest-character-registry.mjs';
import {unlockedStoryMemories} from './book-forest-story-memory.mjs';
import {createForestReflectionSpotlightSession,forestReflectionArchiveCutoff} from './book-forest-reflection-spotlight.mjs';

const IDS=new Set(FOREST_CHARACTER_IDS);
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/u.test(value);
const count=value=>Number.isSafeInteger(value)&&value>=0?value:0;
const dayJapan=time=>new Date(time+9*3600000).toISOString().slice(0,10);
const related=(npc,other)=>(FOREST_RELATIONS[npc]||[]).includes(other);

function readState(storage,key){
  let raw;
  try{raw=JSON.parse(storage?.getItem?.(key)||'null')}catch{}
  if(raw?.version!==1)raw={};
  const relay=raw.pendingRelay;
  return {version:1,
    visits:Object.fromEntries([...IDS].map(npc=>[npc,count(raw.visits?.[npc])])),
    recentEncounters:(Array.isArray(raw.recentEncounters)?raw.recentEncounters:[])
      .filter(event=>IDS.has(event?.npc)).slice(-24).map(({npc,kind,memoryId,day})=>
        ({npc,kind,memoryId:id(memoryId)?memoryId:null,day})),
    knownRead:Array.isArray(raw.knownRead)?raw.knownRead.filter(id):[],
    freshRead:Array.isArray(raw.freshRead)?raw.freshRead.filter(id):[],
    readInitialized:raw.readInitialized===true,
    twinPairId:id(raw.twinPairId)?raw.twinPairId:null,
    pendingRelay:IDS.has(relay?.from)&&IDS.has(relay?.to)?{
      from:relay.from,to:relay.to,memoryId:id(relay.memoryId)?relay.memoryId:null,
      message:typeof relay.message==='string'?relay.message.slice(0,150):''
    }:null};
}

export function createForestTopics({storage,encounterKey,reviewKey,now,
  getBooks,getCatalog,getTwinNames,getRecentReflections,getArchivedReflections}){
  const state=readState(storage,encounterKey);
  const reviews=createForestReflectionSpotlightSession({storage,storageKey:reviewKey,now});
  function save(){
    try{storage?.setItem?.(encounterKey,JSON.stringify(state))}catch{}
  }

  async function choose(characterId,preferredMemoryId){
    const visit=state.visits[characterId];
    const day=dayJapan(now());
    const todayEvents=state.recentEncounters.filter(event=>event.day===day);
    const others=todayEvents.filter(event=>event.npc!==characterId);
    const previous=others.at(-1),connection=[...others].reverse().find(event=>related(characterId,event.npc));
    const today={visitsToday:todayEvents.filter(event=>event.npc===characterId).length+1,
      metNpcCount:new Set([...todayEvents.map(event=>event.npc),characterId]).size,
      previousNpc:previous?.npc||'',relatedEncounter:connection?{npc:connection.npc}:null};
    const [books,catalog]=await Promise.all([getBooks(),getCatalog()]);
    const readBooks=books.filter(book=>book?.status==='read'&&id(book.id));
    const bookIds=new Set(readBooks.map(book=>book.id));
    const knownRead=new Set(state.knownRead);
    const freshRead=new Set(state.freshRead.filter(bookId=>bookIds.has(bookId)));
    if(state.readInitialized){
      for(const bookId of bookIds)if(!knownRead.has(bookId))freshRead.add(bookId);
    }
    const memories=unlockedStoryMemories(books,catalog);
    const own=memories.filter(memory=>forestMemoryBelongsToCharacter(memory,characterId));
    const recent=state.recentEncounters.slice(-3);
    const rotation=Number(day.slice(-2))+todayEvents.length;
    const last=[...state.recentEncounters].reverse().find(event=>event.npc===characterId);
    const pending=state.pendingRelay?.to===characterId?state.pendingRelay:null;
    const relayMemory=memories.find(memory=>memory.id===pending?.memoryId);
    const relay=pending&&(!pending.memoryId||relayMemory)?pending:null;
    let kind=visit?'ambient':'meet',memory=null,review=null;
    if(relay){
      kind='relay';
      memory=own.find(item=>item.id===relayMemory?.id)||null;
    }else if(visit){
      memory=own.find(item=>item.id===preferredMemoryId)||
        (last?.kind==='story'?null:own
          .filter(item=>!recent.some(event=>event.memoryId===item.id))
          .map((item,index)=>({item,index,fresh:freshRead.has(item.bookId)}))
          .sort((a,b)=>Number(b.fresh)-Number(a.fresh)||
            (a.index+rotation)%own.length-(b.index+rotation)%own.length)[0]?.item);
      if(memory)kind='story';
      if(kind==='ambient'&&reviews.canReact(characterId)){
        try{
          const reflections=await getRecentReflections();
          review=reviews.choose({characterId,books,catalog,reflections});
        }catch{}
      }
      if(!review){
        try{
          const archiveBooks=reviews.archiveBooks({characterId,books,catalog,sourceMemoryId:memory?.id});
          if(archiveBooks.length){
            const reflections=await getArchivedReflections(archiveBooks.map(book=>book.id),
              forestReflectionArchiveCutoff(now()));
            review=reviews.choose({characterId,books,catalog,reflections,archiveBooks});
          }
        }catch{}
      }
      if(review){kind='review-reaction';memory=null}
    }
    const relayTo=kind==='ambient'||kind==='story'?(FOREST_RELATIONS[characterId]||[])[0]:null;
    return {characterId,kind,memory,review,relay,today,relayTo,pending,day,bookIds,freshRead,
      bookTitle:readBooks.find(book=>book.id===memory?.bookId)?.title,
      situation:{place:'本の森',presentNpcIds:characterId==='twins'?['twins','twins_second']:[characterId],
        firstEncounter:visit===0,visitNumber:visit+1,focus:kind==='ambient'?(visit%2?'character':'forest'):kind,
        ...(relay?{fromNpc:relay.from}:{}),relatedNpcIds:FOREST_RELATIONS[characterId]||[]}};
  }

  return {choose,
    async twinNames(){
      const pairs=await getTwinNames();
      return pairs.find(pair=>pair.id===state.twinPairId)||pairs[0]||null;
    },
    displayed(topic,names){
      const {characterId,kind,memory,review,pending,day,bookIds,freshRead}=topic;
      state.visits[characterId]++;
      state.readInitialized=true;
      state.knownRead=[...bookIds];
      state.freshRead=[...freshRead].filter(bookId=>kind!=='story'||memory?.bookId!==bookId);
      if(pending===state.pendingRelay)state.pendingRelay=null;
      if(names)state.twinPairId=names.id;
      state.recentEncounters=[...state.recentEncounters,{npc:characterId,kind,
        memoryId:memory?.id||null,day}].slice(-24);
      save();
      reviews.visited();
      if(review)reviews.displayed(characterId,review);
    },
    relay({from,to,memoryId,message}){
      if(!related(from,to)||typeof message!=='string'||!message.trim()||message.length>150||/[{}<>]/u.test(message))return;
      state.pendingRelay={from,to,memoryId:id(memoryId)?memoryId:null,message};
      save();
    },
    getProgress(){return {visits:{...state.visits},
      seenMemories:new Set(state.recentEncounters.map(event=>event.memoryId).filter(Boolean)).size,
      nextNpc:state.pendingRelay?.to||null}}
  };
}
