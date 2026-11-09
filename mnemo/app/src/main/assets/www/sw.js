/*
 * Service worker веб-версии: приложение целиком офлайновое, поэтому оболочка
 * кэшируется при установке. Стратегия — «сначала сеть, при её отсутствии кэш»:
 * так обновления подхватываются сразу, а без интернета всё продолжает работать.
 * Внутри APK service worker не регистрируется (страница открыта с file://).
 */
const CACHE = 'mnemo-v10';
const PHOTOS = 'mnemo-photos';
const SHELL = ['./', 'index.html', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

// Всё, что подключает index.html (скрипты со словарями, стили), кэшируется
// при установке — список берётся из самой страницы, чтобы не вести его вручную.
async function precache() {
  const cache = await caches.open(CACHE);
  await cache.addAll(SHELL);
  const html = await (await fetch('index.html', { cache: 'no-store' })).text();
  const refs = [...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map(m => m[1]);
  await cache.addAll([...new Set(refs)]);
}

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(precache().catch(() => {}));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== CACHE && n !== PHOTOS).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  // Фото городов (Википедия, Openverse, свои ссылки): один раз скачали — дальше показываем из кэша, в том числе без сети.
  if (request.method === 'GET' && request.destination === 'image' && new URL(request.url).origin !== self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(PHOTOS);
      const hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone());
      return response;
    })());
    return;
  }
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response && response.ok) {
        const cache = await caches.open(CACHE);
        cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const shell = await caches.match('index.html');
        if (shell) return shell;
      }
      throw error;
    }
  })());
});
