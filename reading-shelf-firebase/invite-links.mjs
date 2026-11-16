// The one-use secret is stored in a URL fragment, not query or referrer.
const FAMILY=/^[A-Za-z0-9]{8,60}$/;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
export function newInviteToken(random=count=>crypto.getRandomValues(new Uint8Array(count))){
  const bytes=random(32);
  if(!(bytes instanceof Uint8Array)||bytes.length!==32)throw Error('Secure 256-bit randomness required');
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export function parseInviteHash(hash){
  const value=new URLSearchParams(String(hash||'').replace(/^#/,'')).get('invite')||'';
  const index=value.indexOf('.');
  if(index<0)return null;
  const familyId=value.slice(0,index),token=value.slice(index+1);
  return FAMILY.test(familyId)&&TOKEN.test(token)?{familyId,token}:null;
}
export function oneTimeInviteUrl(href,familyId,token){
  if(!FAMILY.test(familyId)||!TOKEN.test(token))throw Error('Invalid invitation identifier');
  const url=new URL(href);
  url.search='';
  url.hash=new URLSearchParams({invite:familyId+'.'+token}).toString();
  return url.toString();
}
