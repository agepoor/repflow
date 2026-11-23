/* Offline cache: every file in FILES is cached on install; requests go to the network first and fall back to the cache.
   build.sh replaces the -dev in the cache name with the commit, so each deploy changes this file: the browser then installs the
   new worker, which caches the new files and drops the old cache. */
const CACHE = 'pacer-live-dev';
const FILES = [
  './',
  'index.html',
  'privacy.html',
  'tokens.css',
  'styles.css',
  'cloud.js',
  'core/engine.js',
  'core/merge.js',
  'core/move.js',
  'core/routine.js',
  'core/schedule.js',
  'core/steps.js',
  'core/time.js',
  'core/voice.js',
  'core/windows.js',
  'ui/actions.js',
  'ui/editor.js',
  'ui/history.js',
  'ui/html.js',
  'ui/main.js',
  'ui/move.js',
  'ui/runner.js',
  'ui/settings.js',
  'ui/sound.js',
  'ui/storage.js',
  'ui/sync.js',
  'ui/views.js',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png',
  'icon.svg',
  'saira.woff2',
  'saira-italic.woff2',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});
// clears every older cache, including v1 (repflow-*) and the retired v2 preview (pacer-v2-*)
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((n) => n !== CACHE).map((n) => caches.delete(n)))));
  self.clients.claim();
});
// Network first (so updates arrive), fall back to cache when offline
// plus the sign-in/sync library, so a signed-in device also starts offline (changes sync when back online).
// Firebase's sign-in pages (/__/auth/…) are left alone: they only work online and must never come from the cache.
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (
    e.request.method !== 'GET' ||
    u.pathname.startsWith('/__/') ||
    (u.origin !== location.origin && !u.href.startsWith('https://www.gstatic.com/firebasejs/'))
  )
    return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const c = r.clone();
        caches.open(CACHE).then((x) => x.put(e.request, c));
        return r;
      })
      .catch(() => caches.open(CACHE).then((x) => x.match(e.request, { ignoreSearch: true }))),
  );
});
