// Rewrite only known CDN image sizing patterns. Preserve the original URL as a failure fallback.
const HOSTS=new Set(['shop.douwakan.co.jp','store.fukuinkan.co.jp']);
export function shelfThumbnailUrl(src){
  if(typeof src!=='string')return src;
  try{
    const url=new URL(src);
    if(url.protocol!=='https:')return src;
    if(url.hostname==='m.media-amazon.com'){
      // Amazon CDN: _AC_UF1000,1000_QL80_ -> _AC_UF320,320_QL75_.
      // Restrict this to a recognised product-cover filename; never rewrite arbitrary paths.
      if(!/^\/images\/I\/[^/]+\._AC_UF\d+,\d+_QL\d+(?:_FMwebp)?_\.(?:jpg|jpeg|png)$/i.test(url.pathname))return src;
      url.pathname=url.pathname.replace(/_AC_UF\d+,\d+_QL\d+/i,'_AC_UF320,320_QL75');
      return url.toString();
    }
    if(!HOSTS.has(url.hostname))return src;
    if(!/\/cdn\/shop\/files\/.+\.(?:jpe?g|png|webp)$/i.test(url.pathname))return src;
    const width=url.searchParams.get('width');
    if(!/^\d+$/.test(width||'')||Number(width)<=320)return src;
    url.searchParams.set('width','320');
    return url.toString();
  }catch{return src}
}

export const safeCover=url=>/^(https:\/\/|data:image\/(jpeg|png|webp);base64,)/i.test(String(url||''))?String(url):'';
