// Shared high-confidence action guard. This is not a semantic safety classifier.
// Apply to the Worker result AND the final browser result, including choices.
const plant=/(?:木の実|きのみ|きのこ|キノコ|茸|植物|草|葉|赤い実|青い実)/u;
const unknown=/(?:知らない|しらない|未知|見たこと(?:が)?ない|名前.{0,8}(?:わから|不明)|正体.{0,8}(?:わから|不明)|何の|なんの|未確認|拾った|ひろった|見つけた|みつけた|道ばた)/u;
const consumption=/(?:食べ|たべ|味見|あじみ|口に|ひと[口くち]|おいし|美味|うまそう|食用|安全|だいじょうぶ|大丈夫)/u;
const refusal=/(?:食べ|たべ)(?:ないで|ちゃ(?:だめ|ダメ)|ては(?:だめ|いけ)|るの(?:は|を)やめ|ずに|ません)|(?:味見|あじみ)(?:しない|はしない)|(?:食べ|たべ)(?:られるか|ていいか|てよいか|られるとは).{0,16}(?:わから|知ら|不明|限ら|かぎら)|(?:食べ|たべ)ない$|(?:安全|大丈夫|だいじょうぶ).{0,4}(?:とは|か).{0,8}(?:わから|言え|いえ)/u;
const knownFood=/(?:パン|ぱん|おにぎり|弁当|べんとう|サンドイッチ|おやつ|クッキー|ケーキ|スープ)/u;
export function unsafeForestForaging(output,context={}){
  const background=JSON.stringify({situation:context.situation,topic:context.topic,
    scene:context.today?.scene,recentTurns:context.recentTurns,chosenLabel:context.chosenLabel});
  const subject=background+' '+String(output?.text||'');
  const riskyBackground=plant.test(subject)&&unknown.test(subject);
  const lines=[output?.text,output?.mark?.word,...(Array.isArray(output?.choices)?
    output.choices.map(x=>typeof x==='string'?x:x?.label):[])];
  return lines.some(line=>typeof line==='string'&&line.split(/[。！!\n]/u).some(clause=>{
    if(!consumption.test(clause)||refusal.test(clause))return false;
    if(knownFood.test(clause)&&!plant.test(clause))return false;
    return riskyBackground||(plant.test(clause)&&unknown.test(clause));
  }));
}
