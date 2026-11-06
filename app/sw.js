/* Офлайн-кэш: приложение работает без интернета после первого открытия */
const CACHE = 'egequest-v6';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/markup.js?v=6', 'js/app.js?v=6', 'js/task1.js?v=6', 'js/task17.js?v=6', 'css/style.css?v=6',
  'assets/algorithm17.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Сначала сеть (чтобы обновления приходили сразу), при отсутствии сети — кэш
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
