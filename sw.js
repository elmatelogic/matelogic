const CACHE_NAME = 'matelogic-v2';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Només cachegem fitxers locals crítics per garantir la instal·lació
      return cache.addAll([
        './',
        './index.html',
        './manifest.json'
      ]).catch((err) => console.warn('Cache local parcial:', err));
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) return caches.delete(k);
        })
      );
    }).then(() => clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Ignora les peticions a l'API del Worker perquè sempre siguin fresques
  if (e.request.url.includes('/api/')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => {
      return cached || fetch(e.request);
    })
  );
});
