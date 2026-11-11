// Small, character-specific happenings in the forest, not new canonical book facts.
// A scene rotates each day in Japan, while chosen buttons provide short-lived
// continuity between related NPCs. No child reflections or book IDs are stored.
const SCENES={
  king:[
    ['こみち','ねこが選びそうな小道を、余も先回りして見つけたい','得意げだが、ねこの判断を頼りにしている'],
    ['おちば','落ち葉を見て、王冠より立派な飾りを思いつく','威厳を保とうとして少し浮かれる'],
    ['いっぷく','森の散歩にも休み時間がいると言い張る','ねこと一緒なら何でも楽しい'],
    ['しごと','森の道案内を王さまの仕事にできないか考える','大仕事のように言うが不慣れ'],
    ['あいさつ','すれ違う相手への立派なあいさつを考えている','見栄を張りながら親切'],
    ['ひみつ','ねこが黙って見つめているものが気になる','知ったかぶりのあとで素直に聞く']
  ],
  kiki:[
    ['まがりかど','いつもと違う道を選ぶと何が見えるか気になる','軽やかで好奇心旺盛、言葉は気取らない'],
    ['かぜ','ほうきに乗るときの風と、歩くときの風を比べている','自分の経験から話す'],
    ['ひとやすみ','急がない配達も悪くないかもしれないと思う','働き者だが少し休みたい'],
    ['とどけもの','誰に何を届けたら喜ぶか想像している','相手を気にかけるが説教しない'],
    ['ジジ','ジジが先に見つけそうなものを探している','親しい相棒との気安い距離'],
    ['まよい','小道の分かれ目で少し迷っている','決める前に考えることもある']
  ],
  jiji:[
    ['あしおと','遠くの足音を聞いて誰が来たか考える','短く観察して軽口を添える'],
    ['ひなた','日なたと木陰のどちらで休むか迷っている','猫らしく実利的でゆったり'],
    ['キキ','キキが急いでいないか少し気にしている','心配は冗談に紛らせる'],
    ['におい','風が運んできた匂いの正体を探っている','先に気づいたことを得意げに言う'],
    ['かくれみち','誰も見ない細い道を知っていそうな顔をする','全部は説明しない'],
    ['ねむけ','眠るにはまだ早いと言い訳している','小さな皮肉と眠そうな間']
  ],
  skipper:[
    ['はっぱ','形の違う葉っぱを静かに見比べている','無理に盛り上げず、見たことだけ言う'],
    ['おと','風が止んだあとの森の音を聞いている','短い言葉と沈黙を許す'],
    ['きのみ','木の実が落ちた場所を覚えておきたい','慎重な好奇心'],
    ['あしあと','地面の小さな跡が気になる','決めつけず、確かめてみる'],
    ['こかげ','木陰で見逃していた景色に気づく','観察が先で感想は少ない'],
    ['ふたご','ふたごがさっきどこへ行ったか少し気にしている','親しみはあるが話しすぎない']
  ],
  zorori:[
    ['さくせん','森で誰も考えないような大作戦をひらめいたつもり','自信満々だがちょっと抜けている'],
    ['しかけ','落ち葉を使ってびっくりする仕掛けを考える','悪だくみは無害で大げさ'],
    ['めいろ','森の道を迷路に変えたら面白いと考える','自慢したくてうずうず'],
    ['おたから','普通の小石を大発見のように扱う','おれさま流の芝居がかった調子'],
    ['イシシ','イシシに見せたい作戦を思いつく','相棒をからかうが見捨てない'],
    ['ノシシ','ノシシがびっくりしそうな仕掛けを考える','勢いが先で結果はまだわからない']
  ],
  ishishi:[
    ['おやつ','木陰で食べるおやつを真剣に選ぶ','食いしん坊で正直'],
    ['メロンパン','メロンパンみたいな形のものを探す','思いつくとすぐ口にする'],
    ['ノシシ','ノシシの分もおやつを残しておこうと考える','兄らしく気にかける'],
    ['せんせ','ゾロリせんせの作戦にわくわくしている','期待が先に走る'],
    ['きのみ','木の実を拾って食べられるか気になる','うっかりしても愛嬌がある'],
    ['かけっこ','おやつをめぐって走り出しそう','元気で単純、深い教訓は言わない']
  ],
  noshishi:[
    ['おにぎり','森でおにぎりを食べるならどこがいいか考える','のんびりしているが好奇心は強い'],
    ['イシシ','イシシが何を見つけたか気になっている','弟らしく頼りにもからかいもする'],
    ['せんせ','ゾロリせんせは今度どんなことを思いつくか考える','せんせへの信頼が素直に出る'],
    ['こいし','形の変わった小石を拾って見せたい','子どものように目が輝く'],
    ['みちくさ','寄り道の途中で面白いものを探す','ちょっとゆっくりした調子'],
    ['はらぺこ','おなかが鳴って、何の音か少しごまかす','食べ物好きだがイシシの真似ではない']
  ]
};
const RELATIONS={king:['cat'],cat:['king'],kiki:['jiji'],jiji:['kiki'],
  skipper:['twins'],twins:['skipper'],zorori:['ishishi','noshishi'],
  ishishi:['zorori','noshishi'],noshishi:['zorori','ishishi']};
const MOMENTS=[
  ['みち','森の道を歩く途中、ふと立ち止まった'],
  ['こかげ','木陰でちょっと寄り道をしている'],
  ['おと','森のかすかな音に耳をすませている'],
  ['わかれみち','道の分かれ目で一息ついている']
];
const DAY_MS=86400000;
const dayJapan=timestamp=>new Date(timestamp+9*3600000).toISOString().slice(0,10);
const clean=value=>String(value??'').trim().replace(/\s+/gu,' ').slice(0,32);
function read(storage,key){try{return JSON.parse(storage?.getItem?.(key)||'null')||{}}catch{return {}}}
function write(storage,key,value){try{storage?.setItem?.(key,JSON.stringify(value))}catch{}}

export function forestDailyScene(characterId,now=Date.now()){
  const scenes=SCENES[characterId];
  if(!scenes)return null;
  const dayNumber=Math.floor((now+9*3600000)/DAY_MS);
  // A step of one guarantees tomorrow's subject differs from today's.
  const offset=Object.keys(SCENES).indexOf(characterId)*3;
  const turn=dayNumber+offset;
  const [id,focus,tone]=scenes[turn%scenes.length];
  const [momentId,moment]=MOMENTS[Math.floor(turn/scenes.length)%MOMENTS.length];
  return {id:id+'-'+momentId,focus,tone,moment,day:dayJapan(now)};
}

export function createForestDailyContextSession({storage=null,
  storageKey='forest-daily-context-v1',now=()=>Date.now()}={}){
  function current(){
    const day=dayJapan(now()),previous=read(storage,storageKey);
    return previous.day===day&&Array.isArray(previous.events)?previous:
      {version:1,day,events:[],visits:{}};
  }
  function save(state){write(storage,storageKey,state)}
  return {
    visit(characterId){
      const state=current(),scene=forestDailyScene(characterId,now());
      const earlier=state.events.slice().reverse();
      const connected=earlier.find(event=>
        event.npc!==characterId&&(RELATIONS[characterId]||[]).includes(event.npc));
      const last=earlier.find(event=>event.npc!==characterId);
      const visitsToday=(Number(state.visits[characterId])||0)+1;
      state.visits[characterId]=visitsToday;
      state.events.push({npc:characterId,kind:'visit'});
      state.events=state.events.slice(-24);
      save(state);
      return {scene,visitsToday,metNpcCount:Object.keys(state.visits).length,
        previousNpc:last?.npc||'',
        relatedEncounter:connected?{
          npc:connected.npc,selectedLabel:clean(connected.kind==='choice'?connected.label:''),
          scene:forestDailyScene(connected.npc,now())?.id||''}:null};
    },
    selected(characterId,label){
      if(!RELATIONS[characterId]||!clean(label))return;
      const state=current();
      state.events.push({npc:characterId,kind:'choice',label:clean(label)});
      state.events=state.events.slice(-24);
      save(state);
    },
    getState(){return current()}
  };
}
