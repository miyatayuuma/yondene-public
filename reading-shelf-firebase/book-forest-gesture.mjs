// Validated writing payloads for silent NPCs. The model may propose a mark,
// but the client always controls its surface and actual glyphs.
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

export function validateForestGestureMark(raw){
  if(raw===null||raw===undefined)return null;
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||
    !FOREST_GESTURE_SURFACES.includes(raw.surface)||
    typeof raw.word!=='string'||!validForestWrittenGlyphs(raw.word))return undefined;
  return {surface:raw.surface,word:raw.word};
}

export function validateForestGestureText(raw){
  if(typeof raw!=='string')return false;
  const text=raw.trim();
  return text.length>=8&&text.length<=80&&/^（ねこ[はがのも、][^（）\n\r]+）$/u.test(text)&&
    !FORBIDDEN_SPEECH.test(text)&&!/[{}<>]/u.test(text);
}
