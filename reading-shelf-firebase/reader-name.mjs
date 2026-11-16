// Derive the reader's display name only from the bookshelf title.
export function readerNameFromShelf(title){
  const value=String(title??'').trim();
  const match=value.match(/^(.{1,20}?)の(?:ほんだな|本棚)$/u);
  return match?.[1]?.trim()||'子ども';
}
export function reflectionTitleFromShelf(title){
  return readerNameFromShelf(title)+'の感想';
}
