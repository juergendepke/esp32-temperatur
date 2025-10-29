const CACHE_NAME = 'sensordashboard-v1.1.0';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/deviceManager.js',
  '/manifest.json'
];

self.addEventListener('install', event => {
  console.log('Service Worker installiert');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
