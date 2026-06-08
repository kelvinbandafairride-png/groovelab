self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => e.waitUntil(clients.claim()));

self.addEventListener('push', e => {
  let data = { title: 'Groove Lab', body: '' };
  try {
    data = e.data ? JSON.parse(e.data.text()) : data;
  } catch {}
  const opts = {
    body: data.body || '',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    vibrate: [200, 100, 200],
    data: { url: '/' }
  };
  e.waitUntil(self.registration.showNotification(data.title || 'Groove Lab', opts));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(clients.openWindow(url));
});
