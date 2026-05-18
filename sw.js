const CACHE = 'flow-v2';
const URLS = [
  '/flow-tasks/',
  '/flow-tasks/index.html',
  '/flow-tasks/manifest.json',
  '/flow-tasks/icon-192.png',
  '/flow-tasks/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x))))
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).catch(() => r))
  );
});

// ===== PUSH NOTIFICATIONS =====
self.addEventListener('push', e => {
  if (!e.data) return;
  try {
    const data = e.data.json();
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/flow-tasks/icon-192.png',
      badge: '/flow-tasks/icon-192.png',
      vibrate: [200, 100, 200],
      requireInteraction: true
    });
  } catch(e) {}
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('/flow-tasks/'));
});
