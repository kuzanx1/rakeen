// Service worker for the dashboard PWA. Two jobs:
// 1. Cache the app shell (network-first — see pos-sw.js for why this isn't
//    cache-first: a stale shell can silently keep serving old JS forever).
// 2. Handle push notifications (owner alerts — low stock, new order,
//    refund/cancel, sales target) and open the dashboard when tapped.

/**
 * اسمُ المخزن يحمل رقمَ إصدار.
 *
 * activate يحذف كل مخزنٍ لا يوافق هذا الاسم. فرفعُ الرقم يمسح القديم
 * كلَّه مرّةً واحدة -- وهو المخرج الوحيد حين تعلَق نسخةٌ قديمة في
 * جهاز، ويبقى صاحبه يرى شاشةً غير التي نُشرت ولا شيء يقول له لماذا.
 */
const CACHE_NAME = 'rakeen-dashboard-shell-v2';
/**
 * والجافاسكربت خرج من قائمة التخزين المسبق.
 *
 * كان يُخزَّن عند التثبيت -- لقطةٌ تُؤخذ مرّةً وتبقى. والاستراتيجية
 * "شبكةٌ أولاً" تحميه في الأحوال العادية، لكن أيَّ تعثّرٍ لحظي في
 * الشبكة يُرجع اللقطة القديمة، فتعمل اللوحة بنسخةٍ من الأمس بلا
 * علامةٍ ظاهرة -- وهو أخطر من ألّا تعمل.
 *
 * والقشرة تكفي للعمل بلا شبكة: صفحةُ /dashboard والأيقونة والبيان.
 */
const SHELL_URLS = [
  '/dashboard',
  '/dashboard-manifest.json',
  '/pos-icon.svg',
];

// ويبقى الجافاسكربت مارّاً بالشبكة دائماً -- لا يُخزَّن ولا يُقدَّم منه.
const NEVER_CACHE = ['/dashboard/rakeen-dashboard.js'];

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
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (NEVER_CACHE.includes(url.pathname)) return;   // إلى الشبكة مباشرة
  // والرابط يحمل بصمةَ بناءٍ الآن (`?b=...`)، فتُقارَن المسارات وحدها
  // -- والذاكرة تُفهرس بالرابط كاملاً، فبناءٌ جديد = طلبٌ جديد يُجلب
  // من الشبكة ويُخزَّن، بلا أن يمسح أحدٌ شيئاً.
  if (!SHELL_URLS.includes(url.pathname)) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* ignore malformed payloads */ }
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title || 'ركين', {
        body: data.body || '',
        icon: data.icon || '/pos-icon.svg',
        badge: data.icon || '/pos-icon.svg',
        dir: 'rtl',
        data: { url: data.url || '/dashboard' },
      }),
      // Browsers no longer support a custom `sound` on Notification options,
      // so a branded sound is only possible while a dashboard tab is open —
      // relay the push to any open client so it can play one itself.
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        clientList.forEach((client) => client.postMessage({ type: 'rakeen-push-received' }));
      }),
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data.url || '/dashboard'));
});
