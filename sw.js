/* Dispatch service worker — app-shell caching for offline use.
   The feed data itself lives in IndexedDB on the device, so the
   whole calendar keeps working offline; only live refreshes need
   the network. */
'use strict';

const VERSION = 'dispatch-v16';
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
const SHELL_PATHS = new Set(SHELL.map((path) => new URL(path, self.location).pathname));

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

  // Check the app shell first so a desktop-installed copy sees a new deploy
  // on its next open. If offline, fall back to the last known shell. The
  // cache contains only app files; IndexedDB sources are never touched here.
  if (req.mode === 'navigate' || SHELL_PATHS.has(url.pathname)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            event.waitUntil(caches.open(VERSION).then((cache) => cache.put(req, copy)));
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(caches.match(req).then((cached) => cached || fetch(req)));
});
