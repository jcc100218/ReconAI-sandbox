// ══════════════════════════════════════════════════════════════════
// ReconAI Service Worker — Offline caching + auto-update
// Strategy: Stale-while-revalidate for app shell (fast loads)
//           Network-first for API data (always fresh)
//           Auto-reload prompt when new version is deployed
// ══════════════════════════════════════════════════════════════════

// CACHE VERSION — bump this on every deploy, or use CI to inject a hash.
// When this changes, the SW re-installs, wipes old caches, and tells
// the page to refresh. Users get the new code within seconds.
const CACHE_NAME = 'reconai-v4';

const APP_SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/sleeper-api.js',
  './js/ai-chat.js',
  './js/ui.js',
  './js/trade-calc.js',
  'shared/constants.js',
  'shared/dhq-engine.js',
  'shared/team-assess.js',
  'shared/analytics-engine.js',
  'shared/ai-dispatch.js',
  'shared/player-modal.js',
  'shared/league-memory.js',
  'shared/supabase-client.js',
  './manifest.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
];

const FONT_ORIGINS = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
];

const API_ORIGINS = [
  'https://api.sleeper.app',
  'https://api.sleeper.com',
  'https://api.fantasycalc.com',
  'https://cdn.jsdelivr.net',
  'https://sxshiqyxhhifvtfqawbq.supabase.co',
];

// ── Install: pre-cache app shell, skip waiting immediately ─────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()) // activate immediately, don't wait for tabs to close
  );
});

// ── Activate: wipe ALL old caches, claim all clients, notify page ─
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
    .then(() => self.clients.claim()) // take control of all open tabs
    .then(() => {
      // Tell all open pages that a new version is active
      self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME }));
      });
    })
  );
});

// ── Push notifications ─────────────────────────────────────────
self.addEventListener('push', event => {
  const data = event.data?.json() || { title: 'ReconAI', body: 'New dynasty intel available' };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './icons/icon-192.svg',
      badge: './icons/icon-192.svg',
      data: data.url || './',
      actions: data.actions || [],
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data || './'));
});

// ── Fetch: routing strategy ────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') return;

  // API calls: network-only (fantasy data must always be fresh)
  if (API_ORIGINS.some(origin => url.href.startsWith(origin))) {
    event.respondWith(
      fetch(event.request).catch(() => {
        if (url.pathname.includes('/players/nfl')) return caches.match(event.request);
        return new Response(JSON.stringify({ error: 'offline' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Fonts: cache-first (immutable)
  if (FONT_ORIGINS.some(origin => url.href.startsWith(origin))) {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(response => {
          if (response.ok) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, cloned));
          }
          return response;
        })
      )
    );
    return;
  }

  // Player images: cache-first with network fallback
  if (url.href.includes('sleepercdn.com')) {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(response => {
          if (response.ok) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, cloned));
          }
          return response;
        }).catch(() => new Response('', { status: 404 }))
      )
    );
    return;
  }

  // App shell: network-first with cache fallback
  // This ensures users always get the latest JS/CSS/HTML on every load.
  // Falls back to cache only if offline.
  event.respondWith(
    fetch(event.request).then(response => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
      }
      return response;
    }).catch(() => caches.match(event.request))
  );
});
