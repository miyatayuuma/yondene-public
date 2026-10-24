// Only rewrite known Shopify CDN width parameters. Keep the original URL for fallback.
const HOSTS=new Set(['shop.douwakan.co.jp','store.fukuinkan.co.jp']);
export function shelfThumbnailUrl(src){
  if(typeof src!=='string')return src;
  try{
    const url=new URL(src);
    if(url.protocol!=='https:'||!HOSTS.has(url.hostname))return src;
    if(!/\/cdn\/shop\/files\/.+\.(?:jpe?g|png|webp)$/i.test(url.pathname))return src;
    const width=url.searchParams.get('width');
    if(!/^\d+$/.test(width||'')||Number(width)<=320)return src;
    url.searchParams.set('width','320');
    return url.toString();
  }catch{return src}
}
