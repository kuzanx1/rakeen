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

const CACHE_NAME = 'rakeen-pos-shell-v6';
const SHELL_URLS = [
  '/pos',
  // محرّك الطباعة المشترك مع التطبيق — يُحمّل قبل ملفّ الكاشير
  // ولا تُطبع فاتورة بدونه، فهو من القشرة لا من الطلب.
  '/pos/receipt-engine.js',
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
  // والرابط يحمل بصمةَ بناءٍ الآن (`?b=...`)، فتُقارَن المسارات وحدها
  // -- والذاكرة تُفهرس بالرابط كاملاً، فبناءٌ جديد = طلبٌ جديد يُجلب
  // من الشبكة ويُخزَّن، بلا أن يمسح أحدٌ شيئاً.
  if (!SHELL_URLS.includes(url.pathname)) return;

  /**
   * والوثيقة من الشبكة أولاً، لا من الذاكرة.
   *
   * صفحةُ /pos تحمل أسماءَ ملفّات التنسيق والحزم -- وأسماؤها تتغيّر مع
   * كل بناء. فوثيقةٌ قديمة تُقدَّم من الذاكرة تشير إلى تنسيقٍ قديم،
   * فينزل السكربت الجديد (رابطُه يحمل بصمة البناء) على تنسيقٍ لا يعرف
   * أصنافه -- فتخرج الشاشة نصوصاً متراكمة بلا شكل.
   *
   * وهي صفحةٌ صغيرة تُطلب مرّةً عند الإقلاع، فثمنُ الشبكة فيها زهيد.
   * والذاكرة تبقى احتياطاً: بلا شبكةٍ يفتح الكاشير كما كان.
   */
  if (url.pathname === '/pos') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then((c) => c.put(event.request, copy)));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((c) => c || Response.error()))
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cached) => {
        const networkFetch = fetch(event.request)
          .then((response) => {
            if (response.ok) {
              /**
               * وحين تختلف النسخة، يُقال -- لا يُسكت عنها.
               *
               * "تحديثٌ يصل في الإطلاقة القادمة" مقبولٌ في موقع، وخطرٌ
               * في جهازٍ يحسب فلوساً: الكاشير يظلّ يشغّل كوداً قديماً
               * جلسةً كاملة، ويجرّب إصلاحاً نُشر ولم يصله، فيُقال
               * "ما زبط" وهو لم يُجرَّب أصلاً. (وقع هذا فعلاً.)
               *
               * فتُقارن البصمة، وتُبلَّغ الصفحة، وهي تقرّر متى تُطبّق
               * -- لا في منتصف طلب.
               */
              const stamp = (r) => r && (r.headers.get('etag') || r.headers.get('last-modified') || r.headers.get('content-length'));
              if (cached && stamp(cached) && stamp(response) !== stamp(cached)) {
                self.clients.matchAll({ type: 'window' }).then((list) =>
                  list.forEach((c) => c.postMessage({ type: 'rk-shell-updated', path: url.pathname }))
                );
              }
              cache.put(event.request, response.clone());
            }
            return response;
          })
          .catch(() => cached);
        /**
         * والتحديث الخلفي يُمدَّد عمرُه، وإلا لم يقع أبداً.
         *
         * respondWith يُنهي عمر العامل بمجرّد أن يُردّ الجواب. فإن
         * أُعيد المخزَّن وتُرك جلبُ الشبكة معلّقاً بلا waitUntil، قتله
         * المتصفّح قبل أن يكتب النسخة الجديدة -- فتبقى الذاكرة قديمة
         * مهما أُعيد التحميل، ويشتغل الكاشير على كودٍ نُشر قبل ساعات
         * أو أيام بلا أن يعرف أحد.
         *
         * (وهي علّةُ ctx.waitUntil نفسها التي قتلت مكنسة البطاقات:
         * وعدٌ لا يُعلَن عنه يُقتل في منتصفه، ولا خطأ يُرفع.)
         */
        event.waitUntil(networkFetch.catch(() => {}));
        return cached || networkFetch;
      })
    )
  );
});
