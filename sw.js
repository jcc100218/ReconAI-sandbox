// Kill switch — this SW unregisters itself and clears all caches.
// Deploy this to force all users onto a clean, no-SW state.
// Re-enable a real SW later when caching strategy is stable.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => clients.forEach(c => c.postMessage({ type: 'SW_KILLED' })))
  );
});
