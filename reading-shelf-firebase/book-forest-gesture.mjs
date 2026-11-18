// Validated narration and writing for silent NPCs. Both appear in the dialogue.
export const FOREST_GESTURE_SURFACES=Object.freeze(['ground','leaf','note']);
// MEXT's grade-one 80 kanji: https://www.mext.go.jp/a_menu/shotou/new-cs/news/080216/002.pdf
// The glyph policy is for the physical mark, NOT for the NPC's intelligence
// or the parenthetical narration, which can use ordinary Japanese.
export const FOREST_GRADE_ONE_KANJI=
  '一右雨円王音下火花貝学気九休玉金空月犬見'+
  '五口校左三山子四糸字耳七車手十出女小上森'+
  '人水正生青夕石赤千川先早草足村大男竹中虫'+
  '町天田土二日入年白八百文木本名目立力林六';
const GRADE_ONE_SET=new Set([...FOREST_GRADE_ONE_KANJI]);
const ALLOWED_KANA=/^[ぁ-ゖー、。！？]$/u;
export function validForestWrittenGlyphs(value){
  return typeof value==='string'&&value.length>=1&&value.length<=48&&
    [...value].every(char=>ALLOWED_KANA.test(char)||GRADE_ONE_SET.has(char))&&
    /[ぁ-ゖ]|[一-龯]/u.test(value);
}
const FORBIDDEN_SPEECH=/[「」『』]|しゃべ|おしゃべり|話し|話す|話しかけ|言っ|言う|声を出|ささや|つぶや|よびかけ|呼びかけ/iu;
// Describing an action must not smuggle an inner monologue into the narration.
// These checks concern *speech* and *inner voice*, not which noun starts a sentence.
const INNER_VOICE=/心の(?:中|声)|頭の中|胸の内|内心|ひそかに(?:思|考)|と(?:思った|思う|思い|考えた|考える)/iu;
// Bare greetings are spoken utterances, even when written inside parentheses.
// Do not classify a short *action* as speech just because it has no explicit cat subject.
const BARE_GREETING=/^（(?:こんにちは|こんばんは|おはよう(?:ございます)?|ありがとう(?:ございます)?|さようなら|おやすみ(?:なさい)?|どうも|はい|いいえ|おーい|ごめん(?:なさい)?)[！!？?。、]*）$/u;
export const FOREST_WRITTEN_TURN_LIMIT=80;
const WRITING_ACTION=/書(?:い|き|く|け|こ)|か(?:い|き|く)[^。]{0,8}(?:見せ|みせ|差し出|さしだ)|(?:紙|地面|落ち葉|葉っぱ|はっぱ|おちば|字|文字)に[^。]{0,12}か(?:いた|き)|(?:地面|じめん)をなぞ/u;
const PARENTHETICAL_ACTION=/^（[^（）\n\r]+）$/u;

export function validateForestGestureMark(raw){
  if(raw===null||raw===undefined)return null;
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||
    !FOREST_GESTURE_SURFACES.includes(raw.surface)||
    typeof raw.word!=='string'||raw.word.length>96)return undefined;
  // Gemma may insert visual word separators. Preserve all lexical glyphs
  // and apply the original character policy to what will actually render.
  const word=raw.word.replace(/[ 　]/gu,'');
  if(!validForestWrittenGlyphs(word))return undefined;
  return {surface:raw.surface,word};
}

export function validateForestGestureText(raw){
  if(typeof raw!=='string')return false;
  const text=raw.trim();
  return text.length>=8&&text.length<=FOREST_WRITTEN_TURN_LIMIT&&PARENTHETICAL_ACTION.test(text)&&
    !FORBIDDEN_SPEECH.test(text)&&!INNER_VOICE.test(text)&&!BARE_GREETING.test(text)&&
    !/[{}<>]/u.test(text);
}

export function validateForestWrittenTurn(rawText,rawMark){
  if(typeof rawText!=='string')return null;
  const text=rawText.trim().replace(/^\(([^()（）\r\n]+)\)$/u,'（$1）');
  if(!validateForestGestureText(text))return null;
  const mark=validateForestGestureMark(rawMark);
  if(mark===undefined||(!mark&&WRITING_ACTION.test(text))||
    text.length+(mark?.word.length||0)>FOREST_WRITTEN_TURN_LIMIT)return null;
  return {text,mark};
}
