const CACHE = 'groovelab-v1';
const PRECACHE = ['/', '/manifest.json', '/icon.svg'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)));
});

self.addEventListener('activate', e => {
  e.waitUntil(Promise.all([
    clients.claim(),
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
  ]));
});

self.addEventListener('fetch', e => {
  if (e.request.url.startsWith(self.location.origin)) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
  }
});

self.addEventListener('push', e => {
  let data = { title: 'Groove Lab', body: '' };
  try { data = e.data ? JSON.parse(e.data.text()) : data; } catch {}
  const opts = {
    body: data.body || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    vibrate: [200, 100, 200],
    data: { url: '/' },
    requireInteraction: true
  };
  e.waitUntil(self.registration.showNotification(data.title || 'Groove Lab', opts));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clis => {
    for (const c of clis) { if (c.url.startsWith(self.location.origin)) return c.focus(); }
    return clients.openWindow(url);
  }));
});