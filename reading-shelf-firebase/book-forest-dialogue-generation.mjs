// Offline authoring contract for LLM-generated forest lines. This module has
// no network calls, credentials, family data, or production write privileges.
// Generated drafts must be reviewed before the private Sheet marks them approved.
const VOICES=new Set(['king','cat','kiki','jiji','skipper','twins','zorori','ishishi','noshishi']);
const SELF_NAMES={king:'王さま',kiki:'キキ',jiji:'ジジ',skipper:'スキッパー',
  zorori:'ゾロリ',ishishi:'イシシ',noshishi:'ノシシ'};
const normalize=value=>typeof value==='string'?value.trim().replace(/\s+/gu,' '):'';
const plausibleId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/u.test(value);

/** Build a small, source-scoped authoring task; book status is checked at play time. */
export function buildForestDialogueGenerationTask({memory,character}={}){
  if(!VOICES.has(character?.id)||!plausibleId(memory?.id)||!plausibleId(memory?.bookId)||
    !normalize(memory?.text)||!/^https:\/\/[^\s]+$/u.test(memory?.sourceUrl||'')||
    memory?.evidenceStatus!=='approved'||!['high','medium'].includes(memory?.confidence)){
    throw Error('承認済みの物語記憶とキャラクター設定が必要です');
  }
  if(!normalize(character?.profile)||!normalize(character?.speechRules))
    throw Error('人物像と話し方の根拠が必要です');
  const participates=String(memory.characters||'').split(/[\s,，、|]+/u).includes(character.id);
  const prompt={
    task:'本の森で一人の登場人物が子どもに話しかける、短い独自の日本語発話を一つ作る',
    character:{id:character.id,name:character.name||'',profile:character.profile,
      speechRules:character.speechRules,limitations:character.limitations||''},
    fact:{memoryId:memory.id,sourceText:memory.text,sourceUrl:memory.sourceUrl,
      relation:participates?'人物に関係する出来事（直接体験したかは別途確認）':'別作品の出来事'},
    requirements:[
      '情報源の文は台詞ではなく第三者による事実メモ。丸写しや機械的な人称置換をしない',
      '本人が体験したと確認できないことを自分の経験として語らない',
      '説明文やあらすじではなく、感情・発見・疑問・身振りのある短い交流にする',
      '原作にない出来事を既成事実として付け足さない。未確認情報には触れない',
      '子どもの感想・読書中の行動を見聞きしたことにしない',
      '引用・作品固有の原文台詞を再現せず、独自の表現にする',
      '相手は小学校低学年。短く、次の反応を誘う余地を残す',
      character.id==='cat'?'ねこは人間の言葉を話さない。全体を丸括弧の動作描写にする':'キャラクター本人の視点で話す'
    ],
    output:{format:'JSON',keys:['text'],maxCharacters:170}
  };
  return prompt;
}

/** Hard checks are deterministic; semantic fidelity still needs editorial review. */
export function auditForestDialogueCandidate({memory,characterId,text}={}){
  const errors=[],reviewFlags=[];
  const line=normalize(text);
  if(!VOICES.has(characterId))errors.push('unknown-character');
  if(!plausibleId(memory?.id)||!plausibleId(memory?.bookId)||
    memory?.evidenceStatus!=='approved')errors.push('missing-approved-source');
  if(line.length<8||line.length>170)errors.push('length');
  if(/[{}<>]/u.test(line))errors.push('template-or-markup');
  if(normalize(memory?.text)===line||
    (normalize(memory?.text).length>20&&line.includes(normalize(memory.text)))){
    errors.push('copied-synopsis');
  }
  const name=SELF_NAMES[characterId];
  if(name&&(line.startsWith(name+'は')||line.startsWith(name+'が')))
    errors.push('third-person-self-narration');
  if(characterId==='cat'&&(!/^（.*）$/u.test(line)||/[「」]/u.test(line)))
    errors.push('cat-speaks');
  if(/^(?:この本は|この物語は|この作品は|その本のあらすじは)/u.test(line))
    reviewFlags.push('expository-opening');
  reviewFlags.push('verify-factual-fidelity','verify-character-voice');
  return {eligibleForEditorialReview:errors.length===0,errors,reviewFlags};
}

/** Never set approval to approved automatically, even if all checks pass. */
export function forestDialogueDraftSheetRow({memory,characterId,text,choices=[]}={}){
  const audit=auditForestDialogueCandidate({memory,characterId,text});
  if(!audit.eligibleForEditorialReview)throw Error(audit.errors.join(','));
  if(!Array.isArray(choices)||choices.length>3)throw Error('invalid choices');
  return [1,'draft-'+characterId+'-'+memory.id,characterId,'story',memory.bookId,
    memory.id,'',normalize(text),JSON.stringify(choices),'draft'];
}
