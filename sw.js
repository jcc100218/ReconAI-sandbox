// ══════════════════════════════════════════════════════════════════
// ReconAI Service Worker — Offline caching + app shell
// Strategy: Cache-first for static assets, network-first for API calls
// ══════════════════════════════════════════════════════════════════

const CACHE_NAME = 'reconai-v1';
const APP_SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/sleeper-api.js',
  './js/ai-chat.js',
  './js/ui.js',
  'shared/constants.js',
  'shared/dhq-engine.js',
  'shared/supabase-client.js',
  './manifest.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
];

// Fonts to cache on first load
const FONT_ORIGINS = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
];

// API origins — always network-first, never cache stale data
const API_ORIGINS = [
  'https://api.sleeper.app',
  'https://api.sleeper.com',
  'https://api.fantasycalc.com',
  'https://cdn.jsdelivr.net',
  'https://sxshiqyxhhifvtfqawbq.supabase.co',
];

// ── Install: pre-cache app shell ────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ──────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: routing strategy ─────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // API calls: network-first with no cache fallback
  // Fantasy data must always be fresh
  if (API_ORIGINS.some(origin => url.href.startsWith(origin))) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // If offline and it's the Sleeper players DB, try cache
        if (url.pathname.includes('/players/nfl')) {
          return caches.match(event.request);
        }
        return new Response(JSON.stringify({ error: 'offline' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Fonts: cache-first (they never change)
  if (FONT_ORIGINS.some(origin => url.href.startsWith(origin))) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Player images: cache-first with network fallback
  if (url.href.includes('sleepercdn.com')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => new Response('', { status: 404 }));
      })
    );
    return;
  }

  // App shell: stale-while-revalidate
  // Serve cached version immediately, update cache in background
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
