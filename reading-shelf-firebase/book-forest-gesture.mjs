// Written dialogue and silent gestures use the same text field.
export const FOREST_WRITTEN_TURN_LIMIT=65;
const WRITTEN_LAYOUT_LIMIT=100;
// 学習指導要領の学年別漢字配当表（第一学年・80字）。
const FIRST_GRADE_KANJI='一右雨円王音下火花貝学気九休玉金空月犬見五口校左三山子四糸字耳七車手十出女小上森人水正生青夕石赤千川先早草足村大男竹中虫町天田土二日入年白八百文木本名目立力林六';
const WRITTEN_LETTER=new RegExp('^[ぁ-ゖ'+FIRST_GRADE_KANJI+']$','u');
const WRITTEN_PUNCTUATION=new Set('ー・、。！？「」『』!? 　');
function validWrittenText(value){
  return value.length<=WRITTEN_LAYOUT_LIMIT&&
    value.replace(/[ 　]/gu,'').length<=FOREST_WRITTEN_TURN_LIMIT&&
    [...value].some(char=>WRITTEN_LETTER.test(char))&&
    [...value].every(char=>WRITTEN_LETTER.test(char)||WRITTEN_PUNCTUATION.has(char));
}
const SPEECH_ACTION=/しゃべ|喋|話しかけ|話し(?:た|て|出)|話す|言っ|言う|声を出|声に出|ささや|囁|つぶや|呟|よびかけ|呼びかけ|といった/u;
// Describing an action must not smuggle an inner monologue into the narration.
// These checks concern *speech* and *inner voice*, not which noun starts a sentence.
const INNER_VOICE=/心の(?:中|声)|頭の中|胸の内|内心|ひそかに(?:思|考)|と(?:思った|思う|思い|考えた|考える)/iu;
// Bare greetings are spoken utterances, even when written inside parentheses.
// Do not classify a short *action* as speech just because it has no explicit cat subject.
const BARE_GREETING=/^（(?:こんにちは|こんばんは|おはよう(?:ございます)?|ありがとう(?:ございます)?|さようなら|おやすみ(?:なさい)?|どうも|はい|いいえ|おーい|ごめん(?:なさい)?)[！!？?。、]*）$/u;
const WRITING_ACTION=/書(?:い|き|く|け|こ)|か(?:い|き|く)[^。]{0,8}(?:見せ|みせ|差し出|さしだ)|(?:紙|地面|落ち葉|葉っぱ|はっぱ|おちば|字|文字)に[^。]{0,12}か(?:いた|き|く)|(?:地面|じめん)をなぞ|(?:もじ|文字|めも|メモ)を(?:かく|かいた|かいて|かき)/u;
const WRITING_ONLY_END=/(?:書(?:いた|く|きました)|か(?:いた|く|きました)|(?:見せ|みせ|差し出し|さしだし)(?:た|ます))(?:よ|ね)?[。！!]*$/u;
const WRITTEN_STAGE_DIRECTION=/^(?:[（(]|(?:ねこは)?(?:.*[、])?(?:もじ|文字|めも|メモ)を(?:かく|かいた|書く|書いた)(?:[。！!]|$))/u;
const CAT_NARRATION=/^(?:ねこ|ネコ|猫)[はが]/u;
const WRITING_SURFACE=/^(?:紙|地面|じめん|落ち葉|葉っぱ|はっぱ|おちば|字|文字)[にを]/u;
const PARENTHETICAL_ACTION=/^（[^（）\n\r]+）$/u;

function validGesture(text){
  return text.length<=FOREST_WRITTEN_TURN_LIMIT&&PARENTHETICAL_ACTION.test(text)&&
    !SPEECH_ACTION.test(text)&&!INNER_VOICE.test(text)&&!BARE_GREETING.test(text)&&!/[「」『』{}<>]/u.test(text);
}

export function validateForestWrittenTurn(rawText,delivery){
  if(typeof rawText!=='string')return null;
  const text=rawText.normalize('NFC').trim();
  if(delivery==='written'){
    // Gemma sometimes prefixes a written reply with an extra silent stage direction.
    const annotated=/^(?:（([^（）\r\n]+)）|\(([^()\r\n]+)\))[ 　]*\r?\n([\s\S]+)$/u.exec(text);
    const message=annotated&&validGesture('（'+(annotated[1]??annotated[2])+'）')?annotated[3].trim():text;
    const body=message.replace(/[ 　]*\r?\n[\r\n 　]*/gu,' ');
    const compact=body.replace(/[ 　]/gu,'');
    const narration=CAT_NARRATION.test(compact);
    const writingOnly=(narration||WRITING_SURFACE.test(compact))&&
      WRITING_ONLY_END.test(compact)&&WRITING_ACTION.test(compact);
    if(WRITTEN_STAGE_DIRECTION.test(compact)||writingOnly||
      narration&&(SPEECH_ACTION.test(compact)||INNER_VOICE.test(compact)))
      return null;
    if(validWrittenText(body))return {text:body,delivery};
  }
  if(delivery==='gesture'){
    const action=text.replace(/^\(([^()（）\r\n]+)\)$/u,'（$1）');
    if(validGesture(action)&&!WRITING_ACTION.test(action.replace(/[ 　]/gu,'')))return {text:action,delivery};
  }
  return null;
}
