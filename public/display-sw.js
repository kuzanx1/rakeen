/**
 * عامل خدمة شاشة العميل.
 *
 * وجوده شرطُ التثبيت لا خيارٌ فيه: بلا عامل خدمة لا تُعرض "أضف إلى
 * الشاشة الرئيسية" على أندرويد، ولا تُعامَل الصفحة تطبيقاً. والتثبيت
 * هو ما يوقف حذف iOS للتخزين بعد سبعة أيام -- وهو ما يفقد الشاشة
 * اقترانها بعد كل إجازة.
 *
 * ولا يخزّن المنيو: الأسعار والأصناف تتغيّر في اليوم مرات، وشاشةٌ
 * تعرض سعراً قديماً أسوأ من شاشةٍ لا تعرض شيئاً. فالشبكة أولاً دائماً،
 * والمخزَّن لا يُستعمل إلا حين تنقطع تماماً -- خيرٌ من صفحة خطأ في وجه
 * زبون واقف.
 */
const CACHE = 'rakeen-display-v1';
const SHELL = ['/order/rakeen-order.js', '/display/rakeen-display.js'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // لا يُلمس ما ليس من أصلنا، ولا نداءات البيانات: تخزينُ ردٍّ من
  // Supabase يعني رصيداً قديماً أو باركوداً ميتاً.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req)),
  );
});
