// Service Worker Kado — stratégies de cache
// - /api/vouchers/me → NetworkFirst (cache 24h)
// - QR codes des bons actifs → CacheFirst
// - Assets statiques → CacheFirst

const CACHE_VERSION = 'kado-v1';
const API_CACHE = 'kado-api-v1';

// Assets statiques à précacher
const STATIC_ASSETS = [
  '/',
  '/app/wallet',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_VERSION && k !== API_CACHE)
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // NetworkFirst : /api/vouchers/me avec fallback cache 24h
  if (url.pathname.includes('/api/v1/vouchers/me')) {
    event.respondWith(networkFirst(request, API_CACHE, 24 * 60 * 60));
    return;
  }

  // CacheFirst : QR codes des bons actifs (/api/vouchers/[id])
  if (url.pathname.match(/\/api\/v1\/vouchers\/[^/]+$/) && request.method === 'GET') {
    event.respondWith(cacheFirst(request, API_CACHE));
    return;
  }

  // CacheFirst : assets statiques (_next/static)
  if (url.pathname.startsWith('/_next/static')) {
    event.respondWith(cacheFirst(request, CACHE_VERSION));
    return;
  }
});

async function networkFirst(request, cacheName, maxAgeSeconds) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(cacheName);
    const cloned = response.clone();
    // Ajouter header d'expiration personnalisé
    cache.put(request, cloned);
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'Hors ligne' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  const cache = await caches.open(cacheName);
  cache.put(request, response.clone());
  return response;
}
