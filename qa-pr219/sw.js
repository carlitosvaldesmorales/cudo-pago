const CACHE_NAME='cudo-qa-pr219-mobile-shell-v1';
const SCOPE='/qa-pr219/';
const OFFLINE_URL=`${SCOPE}offline.html`;
const PRECACHE=[
  OFFLINE_URL,
  `${SCOPE}manifest.webmanifest`,
  `${SCOPE}shared/pwa.js`,
  `${SCOPE}icons/icon-192.png`,
  `${SCOPE}icons/icon-512.png`,
  `${SCOPE}icons/apple-touch-icon.png`
];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache=>cache.addAll(PRECACHE))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key.startsWith('cudo-qa-pr219-mobile-shell-')&&key!==CACHE_NAME).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET') return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin||!url.pathname.startsWith(SCOPE)) return;

  // Los datos del club deben permanecer online-first para no mostrar resultados o estados obsoletos.
  if(url.pathname.startsWith(`${SCOPE}data/`)) return;

  if(request.mode==='navigate'){
    event.respondWith(fetch(request).catch(()=>caches.match(OFFLINE_URL)));
    return;
  }

  if(PRECACHE.includes(url.pathname)){
    event.respondWith(fetch(request).catch(()=>caches.match(request)));
  }
});
