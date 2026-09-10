/* =========================================================================
   sw.js — Service Worker for Originate Command PWA
   Enables standalone app installation on PC & Mobile (Chrome, Edge, Safari, Android)
   Location: assets/pwa/sw.js
   ========================================================================= */

const CACHE_NAME = 'oc-pwa-cache-v2.11.79';
const ASSETS_TO_CACHE = [
  '../../',
  '../../index.html',
  './manifest.json',
  '../icons/icon-192.png',
  '../icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

/* ---- Background Web Push Notification Handler (OM SRS 001 9.1) ---------- */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: 'ORIGINATE MARKETING', body: event.data ? event.data.text() : 'New Notification' };
  }
  const title = data.title || 'ORIGINATE MARKETING';
  const options = {
    body: data.body || 'New operational alert received',
    icon: '../icons/icon-192.png',
    badge: '../icons/favicon.png',
    tag: data.tag || ('oc-alert-' + Date.now()),
    data: data,
    vibrate: [100, 50, 100]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

/* ---- Notification Click Focus & Navigation Handler ----------------------- */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('../../index.html');
      }
    })
  );
});

