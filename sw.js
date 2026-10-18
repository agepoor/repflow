const CACHE='pacer-v2-1';
const FILES=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png','apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)));self.skipWaiting();});
// Shares the origin with v1 (/repflow/): only touch this app's own caches
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(n=>n.startsWith('pacer-v2-')&&n!==CACHE).map(n=>caches.delete(n)))));self.clients.claim();});
// Network first (so updates arrive), fall back to cache when offline
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;
  e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c));return r;}).catch(()=>caches.open(CACHE).then(x=>x.match(e.request,{ignoreSearch:true}))));});
