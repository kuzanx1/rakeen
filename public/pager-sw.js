// عامل خدمة بيجر ركين -- نطاقه /p/ وحده، فلا يزاحم عامل بطاقة الولاء.
// عمله الوحيد: إشعارُ «طلبك جاهز» والجوال مقفول، وفتحُ صفحة الطلب عند لمسه.
// ولا تخزين: صفحة البيجر لا تُعرض من نسخة قديمة أبداً.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { /* حمولة تالفة */ }
  const urgent = data.urgent !== false;
  // «استُلم»: يستبدل إشعار «جاهز» بصمت -- بلا صوت ولا هزّ.
  const quiet = data.quiet === true;
  event.waitUntil((async () => {
    await self.registration.showNotification(data.title || 'ركين', {
      body: data.body || 'طلبك جاهز',
      icon: data.icon || '/pos-icon-192.png',
      badge: '/pos-icon-192.png',
      dir: 'rtl',
      lang: 'ar',
      tag: data.tag || 'pager',
      // نفسُ الوسم مع renotify: الرنّةُ الثانية ترنّ ولا تتكدّس.
      renotify: !quiet,
      silent: quiet,
      requireInteraction: urgent && !quiet,
      vibrate: quiet ? [] : urgent ? [500, 200, 500, 200, 900] : [200],
      data: { url: data.url || '/' },
    });
    // الصفحةُ مفتوحة؟ تُخبَر لترنّ بصوتها هي أيضاً.
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    list.forEach((c) => c.postMessage({ type: 'pager-push', data }));
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if (c.url.indexOf(url) !== -1 && 'focus' in c) return c.focus();
    }
    return self.clients.openWindow(url);
  })());
});
