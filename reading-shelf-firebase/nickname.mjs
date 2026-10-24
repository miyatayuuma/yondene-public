export function normalizeNickname(value){
  const nickname=String(value??'').trim();
  if(nickname.length<2||nickname.length>20||/[\r\n\t]/.test(nickname))throw Error('ニックネームは2〜20文字で入力してください');
  return nickname;
}
export function visibleFamilyName(uid,profiles){
  const row=profiles.find(p=>p.uid===uid);
  return row?.nickname||'家族';
}
