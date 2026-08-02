// Minimal service worker — presence with a fetch handler makes the site installable (PWA).
// Network-first: the owner panel always shows fresh data; falls back to cache only when offline.
const CACHE = 'pro-owner-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        try {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        } catch {}
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
