// Shared high-confidence action guard. This is not a semantic safety classifier.
// Apply to the Worker result AND the final browser result, including choices.
// A kana noun needs a following word boundary or particle. A bare
// substring would read 「ときのこと」 as a reference to a mushroom.
const forageFood=/(?:木の実|きのみ|きのこ(?=$|[がはをもにので、。！？!?\s」』）"\]}])|キノコ|茸|赤い実|青い実|(?:木|枝).{0,20}実|(?<![現事真確誠着充])実[がを])/u;
const vegetation=/(?:植物|しょくぶつ|草|葉|はっぱ|おちば)/u;
const refersToPlant=text=>forageFood.test(text)||vegetation.test(text);
const unknown=/(?:知らない|しらない|未知|見たこと(?:が)?ない|名前.{0,8}(?:わから|不明)|正体.{0,8}(?:わから|不明)|何の|なんの|未確認|拾った|ひろった|見つけた|みつけた|道ばた)/u;
const consumption=/(?:食べ|たべ|味見|あじみ|口に|ひと[口くち]|おいし|美味|うまそう|食用)/u;
const reassurance=/(?:安全|だいじょうぶ|大丈夫)/u;
const directProhibition=/(?:食べ|たべ|口に[ 　]*し|(?:味見|あじみ)[ 　]*し)[ 　]*ては[ 　]*(?:だめ|ダメ|い(?:け(?:ない|ません|ぬ)|かん)|なら(?:ない|ぬ|ん))/u;
const advisesAgainst=/(?:食べ|たべ|口に[ 　]*す|(?:味見|あじみ)[ 　]*す)るのは[、 　]*[^、。]{0,10}(?:勧め|すすめ)(?:でき(?:ない|ぬ|ん|ません)|ない)/u;
const refusal=/(?:食べ|たべ)(?:ないで|ない(?:ほう|方)が(?:いい|よい|安全)|ちゃ(?:だめ|ダメ)|るの(?:は|を)やめ|ずに|ません)|(?:味見|あじみ)(?:しない|はしない)|(?:食べ|たべ)ない$/u;
const uncertainEdibility=/(?:(?:食べ|たべ)(?:られる(?:もの)?か|て(?:いい|よい)か|られるとは)|(?:安全|大丈夫|だいじょうぶ)(?:だ)?(?:か|とは)).{0,16}(?:わから|分から|知ら|不明|限ら|かぎら|言え|いえ)/u;
const healthWarning=/(?:食べ|たべ)(?:るの|ること|たら|ると).{0,16}(?:危な|危険|だめ|ダメ|(?:具合|ぐあい|気分|きぶん)が(?:悪|わる)く)/u;
const writingSurface=/(?:落ち葉|葉っぱ|はっぱ|おちば|葉)(?=(?:のうら|の裏|の上)?に[^。！？）」\x22]{0,24}(?:書[いきく]|か[いきく]))/gu;
const generalFoodSearch=/^(?:おいしい|美味しい)(?:もの|物)を[、 ]*(?:さが|探)そ(?:う|っか)[？?]?$/u;
const knownFood=/(?:パン|ぱん|おにぎり|弁当|べんとう|サンドイッチ|おやつ|クッキー|ケーキ|スープ)/u;
function isRefusal(clause){
  const phrase=clause.replace(/、/gu,'');
  return directProhibition.test(phrase)||advisesAgainst.test(phrase)||refusal.test(phrase)||
    uncertainEdibility.test(phrase)||healthWarning.test(phrase);
}
export function unsafeForestForaging(output,context={}){
  const background=JSON.stringify({situation:context.situation,topic:context.topic,
    scene:context.today?.scene,recentTurns:context.recentTurns,chosenLabel:context.chosenLabel});
  const utterances=Array.isArray(output?.turns)?output.turns.map(turn=>turn?.text):[];
  const subject=(background+' '+[output?.text,...utterances].join(' ')).replace(/[ 　]/gu,'');
  // A wild plant is unverified by default. The model need not say
  // 'unknown' for its invented fruit to be unsafe to taste.
  const wild=/(?:本の森|森の|林|野生|道ばた|拾|ひろ|生え|なっている)/u;
  const riskyBackground=refersToPlant(subject)&&(unknown.test(subject)||wild.test(subject));
  const edibilityContext=riskyBackground&&(unknown.test(subject)||consumption.test(subject)||forageFood.test(subject));
  const lines=[output?.text,...utterances,...(Array.isArray(output?.choices)?
    output.choices.flatMap(x=>typeof x==='string'?[x]:[x?.label,x?.outcome]):[])];
  return lines.some(line=>typeof line==='string'&&line.replace(/[ 　]/gu,'')
    .split(/[。！!\n]|(?:けれども?|けど|、でも)、*/u).some(clause=>{
    if(!(consumption.test(clause)||edibilityContext&&reassurance.test(clause)))return false;
    if(knownFood.test(clause)&&!refersToPlant(clause))return false;
    if(generalFoodSearch.test(clause.trim())&&!refersToPlant(subject.replace(writingSurface,'')))return false;
    if(!(riskyBackground||(refersToPlant(clause)&&(unknown.test(clause)||wild.test(clause)))))return false;
    if(!isRefusal(clause))return true;
    // A refusal in the first phrase must not mask a later invitation to taste.
    const phrases=clause.split('、');
    return phrases.some((phrase,index)=>{
      const next=phrases[index+1]||'';
      return consumption.test(phrase)&&!isRefusal(phrase)&&
        (consumption.test(next)||!isRefusal(phrase+next));
    });
  }));
}
