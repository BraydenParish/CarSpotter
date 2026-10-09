/* CarSpotter service worker: offline play for an installed or returning visitor.
 * - Page navigations: network first, falling back to the cached app shell.
 * - Hashed build assets (assets/*): cache first (file names change when content does).
 * - Photos (photos/*): cache first, filled as photos are shown or when the player
 *   chooses "Save photos for offline" in Settings.
 * Only same-origin GET requests are handled. */
const SHELL = 'carspotter-shell-v1';
const ASSETS = 'carspotter-assets-v1';
const PHOTOS = 'carspotter-photos-v1';
const KEEP = [SHELL, ASSETS, PHOTOS];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './favicon.svg']).catch(() => undefined)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

async function cacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function networkFirstPage(request) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put('./index.html', res.clone());
    return res;
  } catch {
    return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(networkFirstPage(req));
  } else if (url.pathname.includes('/assets/')) {
    event.respondWith(cacheFirst(ASSETS, req));
  } else if (url.pathname.includes('/photos/')) {
    event.respondWith(cacheFirst(PHOTOS, req));
  }
});
