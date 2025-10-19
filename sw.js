// Einfacher Service Worker
self.addEventListener('install', function(event) {
  console.log('PWA installiert');
});

self.addEventListener('fetch', function(event) {
  // Einfache Offline-Funktion
  event.respondWith(fetch(event.request));
});
