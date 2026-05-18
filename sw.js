const CACHE = 'flow-v2';
const URLS = ['/flow-tasks/','/flow-tasks/index.html','/flow-tasks/manifest.json','/flow-tasks/icon-192.png','/flow-tasks/icon-512.png'];
const PUSH_SERVER = 'https://flow-push.3laa337.workers.dev';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(URLS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))));
});
self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).catch(() => r)));
});

self.addEventListener('push', e => {
  e.waitUntil(handlePush(e));
});

async function handlePush(e) {
  // Get push subscription to know our endpoint
  try {
    const reg = await self.registration;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const ep = encodeURIComponent(sub.endpoint);
    const resp = await fetch(`${PUSH_SERVER}/pending?ep=${ep}`);
    const data = await resp.json();
    if (data.title) {
      await self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/flow-tasks/icon-192.png',
        badge: '/flow-tasks/icon-192.png',
        vibrate: [200, 100, 200],
        requireInteraction: true,
        tag: 'flow-reminder',
      });
    }
  } catch(e) { console.error('Push handler error:', e); }
}

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('/flow-tasks/'));
});
