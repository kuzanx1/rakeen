// Minimal service worker for the loyalty card — its only job is handling
// push notifications (points updates) and opening the card when tapped.
// No offline caching here on purpose; the card should always show a fresh
// points balance, not a stale cached one.

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* ignore malformed payloads */ }
  event.waitUntil(
    self.registration.showNotification(data.title || 'ركين', {
      body: data.body || '',
      icon: data.icon || '/pos-icon.svg',
      badge: data.icon || '/pos-icon.svg',
      dir: 'rtl',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data.url || '/'));
});
