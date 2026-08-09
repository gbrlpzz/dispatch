/* Dispatch service worker — app-shell caching for offline use.
   The feed data itself lives in IndexedDB on the device, so the
   whole calendar keeps working offline; only live refreshes need
   the network. */
'use strict';

const VERSION = 'dispatch-v11';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-64.png',
  './icons/favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never intercept cross-origin requests (feed fetching, images, oEmbed).
  if (url.origin !== self.location.origin) return;

  // App shell: cache-first, then network.
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetched = fetch(req)
        .then((res) => {
          if (res && res.ok && req.mode === 'navigate') {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put('./index.html', copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});
