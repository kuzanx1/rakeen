// Minimal hand-rolled service worker for the POS route (no workbox/next-pwa —
// consistent with the rest of this project being dependency-free vanilla JS).
// Caches the app shell (the /pos document + its script/style) so a hard
// reload with the network off still loads the UI; Supabase calls are left
// untouched (network-only) — offline order capture is handled by the app's
// own IndexedDB queue (rakeen-pos.js), not by intercepting API calls here.
//
// Stale-while-revalidate (not pure network-first, not pure cache-first):
// this app ships frequent fixes, and a cache-first shell means a tablet can
// silently run stale JS indefinitely — a real incident (loyalty push
// notifications shipped but never reached already-installed devices) is why
// this doesn't just serve the cache forever. But a strict network-first
// (the previous approach) meant every single launch — including an installed
// PWA opening fresh — paid a full network round-trip before anything painted,
// which is brutal on slow/flaky hardware (old POS terminals). Serving the
// cached shell immediately while refreshing it in the background gets both:
// instant paint now, next-launch freshness automatically (no CACHE_NAME bump
// required for updates to propagate). Bump CACHE_NAME only when SHELL_URLS
// itself changes.

const CACHE_NAME = 'rakeen-pos-shell-v3';
const SHELL_URLS = [
  '/pos',
  '/pos/rakeen-pos.js',
  '/pos-manifest.json',
  '/pos-icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // only handle same-origin GETs for the app shell itself — everything else
  // (Supabase REST/RPC calls, Next.js internals, other routes) passes through untouched
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (!SHELL_URLS.includes(url.pathname)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cached) => {
        const networkFetch = fetch(event.request)
          .then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    )
  );
});
