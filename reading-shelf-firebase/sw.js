// PWA installs without caching application HTML/JS. Mixing old modules with a
// new document caused a null DOM reference after the family-social release.
// Book data, Google auth and Firebase calls are ALWAYS network handled.
const CACHE_NAME='yondene-static-artwork-v4';
const ARTWORK=['/manifest.webmanifest','/icon.svg','/icon-192.png','/icon-512.png'];
const ARTWORK_PATHS=new Set(ARTWORK);
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(ARTWORK)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('yondene-')&&k!==CACHE_NAME).map(k=>caches.delete(k)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  // Never cache or serve fallbacks for HTML, JS, CSS or Firebase sessions.
  if(url.origin!==self.location.origin||!ARTWORK_PATHS.has(url.pathname))return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){
      const copy=response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy)));
    }
    return response;
  }).catch(()=>caches.match(event.request)));
});
