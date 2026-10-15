const CACHE_NAME = 'matelogic-v4';

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './favicon.png?v=4',
  './img/logo.png',
  './img/logo-fosc.png',
  './img/og-image.png',
  './img/favicon.png',
  './img/icon-192.png',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800;900&family=JetBrains+Mono:wght@600;700&display=swap'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        STATIC_ASSETS.map((url) =>
          fetch(new Request(url, { cache: 'reload' }))
            .then((res) => {
              if (res && (res.status === 200 || res.type === 'opaque')) {
                return cache.put(url, res);
              }
            })
            .catch(() => {})
        )
      );
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) {
            return caches.delete(k);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

function fetchWithTimeout(request, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout')), timeoutMs);
    fetch(request).then(
      (res) => {
        clearTimeout(timer);
        resolve(res);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  if (url.pathname.includes('/api/')) {
    if (req.method === 'POST') {
      e.respondWith(
        fetchWithTimeout(req, 5000).catch(() => {
          return new Response(
            JSON.stringify({
              ok: false,
              valid: false,
              msg: 'Sense connexió. Comprova la xarxa per validar'
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        })
      );
      return;
    }

    const normalizedApiUrl = url.origin + url.pathname;
    e.respondWith(
      fetchWithTimeout(req, 4000)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(normalizedApiUrl, clone);
            });
          }
          return networkRes;
        })
        .catch(() => {
          return caches.match(normalizedApiUrl).then((cachedApi) => {
            if (cachedApi) return cachedApi;
            return new Response(
              JSON.stringify({
                ok: false,
                msg: 'Sense connexió a internet'
              }),
              {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
              }
            );
          });
        })
    );
    return;
  }

  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetchWithTimeout(req, 3500)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put('./index.html', clone);
            });
          }
          return networkRes;
        })
        .catch(() => {
          return caches.match('./index.html').then((cachedHtml) => {
            return cachedHtml || caches.match('./');
          });
        })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((cachedRes) => {
      const networkFetch = fetch(req)
        .then((networkRes) => {
          if (networkRes && (networkRes.status === 200 || networkRes.type === 'opaque')) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(req, clone);
            });
          }
          return networkRes;
        })
        .catch(() => cachedRes);

      return cachedRes || networkFetch;
    })
  );
});
