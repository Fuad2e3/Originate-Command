/* =========================================================================
   sw.js — Service Worker for Originate Command PWA
   Enables standalone app installation on PC & Mobile (Chrome, Edge, Safari, Android)
   Location: assets/pwa/sw.js
   ========================================================================= */

const CACHE_NAME = 'oc-pwa-cache-v2.11.66';
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
