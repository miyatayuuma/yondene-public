// Synthetic tests only. Never import this adapter from application code.
import {parseForestCharacterProfiles,FOREST_PROFILE_FIELDS,FOREST_PROFILE_HEADERS} from './book-forest-character-profiles.mjs';
export function profileFixture(fields={}){
  const p={id:'jiji',summary:'架空の観察好きな相棒',cadence:'短く話す',
    firstPerson:'ぼく（試験用仮案、本文未照合）',avoid:'押しつけない',...fields};
  return parseForestCharacterProfiles([FOREST_PROFILE_HEADERS,...Object.entries(FOREST_PROFILE_FIELDS)
    .filter(([key])=>p[key]).map(([key,label])=>[p.id,label,p[key],'編集解釈','',
      '合成テスト専用','暫定採用','test-v2'])])[0];
}
export function legacyFixture(people,voices){
  const get=(rows,row,label)=>row[rows[0].indexOf(label)]||'';
  const rows=[FOREST_PROFILE_HEADERS];
  const labels={summary:'人物像の要約',values:'大切にすること',motivation:'望み・動機',
    relationships:'関係性',behavior:'普段の行動',reactions:'状況への反応',firstPerson:'一人称',
    address:'相手の呼び方',cadence:'基本口調・テンポ',endings:'語尾（使用条件）',
    habits:'口癖と使用頻度',expression:'言い回しの特徴',emotion:'感情による変化',avoid:'避ける表現・NG'};
  for(const person of people.slice(1)){
    const voice=voices.slice(1).find(v=>v[0]===person[0]);if(!voice)continue;
    for(const [key,label] of Object.entries(FOREST_PROFILE_FIELDS)){
      const source=Object.keys(labels).indexOf(key)<6?people:voices;
      const text=get(source,source===people?person:voice,labels[key]);
      if(text)rows.push([person[0],label,text,'編集解釈','','合成テスト専用','暫定採用','test-v2']);
    }
  }
  return rows;
}
