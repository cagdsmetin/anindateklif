/* Anında Teklif — Web Push service worker.
   Sunucu (pywebpush) şu JSON'u gönderir: { title, body, link, id, badge }. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: 'Anında Teklif', body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'Anında Teklif';
  const options = {
    body: data.body || '',
    icon: '/notif-icon.png',
    badge: '/favicon.ico',
    tag: data.id || undefined,
    data: { link: data.link || '/', id: data.id || '' },
  };
  event.waitUntil((async () => {
    await self.registration.showNotification(title, options);
    if (self.navigator && self.navigator.setAppBadge && data.badge) {
      try { await self.navigator.setAppBadge(data.badge); } catch (e) { /* desteklenmiyor */ }
    }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  const id = (event.notification.data && event.notification.data.id) || '';
  const url = new URL(link + (id ? (link.includes('?') ? '&' : '?') + 'nid=' + encodeURIComponent(id) : ''), self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.location.origin) && 'focus' in c) {
        await c.focus();
        if ('navigate' in c) { try { await c.navigate(url); } catch (e) { /* farklı origin */ } }
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
