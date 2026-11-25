/* Офлайн-кэш: приложение работает без интернета после первого открытия */
const CACHE = 'egequest-v16';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/markup.js?v=16', 'js/app.js?v=16', 'js/task1.js?v=16', 'js/kit.js?v=16', 'js/task17.js?v=16', 'js/theory16.js?v=16', 'js/theory18.js?v=16', 'js/theory19.js?v=16', 'js/zachet.js?v=16', 'js/games.js?v=16', 'js/practice-data.js?v=16', 'js/practice16.js?v=16', 'js/practice.js?v=16', 'css/style.css?v=16',
  'assets/map-forest.jpg', 'assets/map-hills.jpg', 'assets/map-lake.jpg', 'assets/map-mountains.jpg',
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
