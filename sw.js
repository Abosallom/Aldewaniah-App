/* Aldewaniah App — service worker (offline shell cache) */
const CACHE = 'aldewaniah-v2';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/i18n.js',
  './js/store.js',
  './js/content.js',
  './js/app.js',
  './js/modules/home.js',
  './js/modules/tournaments.js',
  './js/modules/gallery.js',
  './js/modules/contact.js',
  './manifest.json',
  './assets/icon.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) =>
      cached || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => cached)
    )
  );
});
