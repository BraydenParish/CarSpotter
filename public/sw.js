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

// Registration happens after the first page load, so the hashed scripts and styles the page already
// fetched never passed through this worker. Find them from the built index.html (and the chunks it
// imports) and cache them now, so a first visit followed by going offline can still start the app.
async function precacheAssets() {
  const assets = await caches.open(ASSETS);
  const seen = new Set();
  const queue = [];
  const enqueue = (text, base, pattern) => {
    for (const m of text.matchAll(pattern)) {
      const url = new URL(m[0], base).href;
      if (!seen.has(url)) {
        seen.add(url);
        queue.push(url);
      }
    }
  };
  const indexUrl = new URL('./', self.location.href).href;
  enqueue(await (await fetch(indexUrl, { cache: 'reload' })).text(), indexUrl, /assets\/[\w.-]+\.(?:js|css)/g);
  // Chunks import each other (and the lazy photo list) by name: follow them a few levels down.
  for (let i = 0; i < queue.length && i < 40; i++) {
    const res = await fetch(queue[i]);
    if (!res.ok) continue;
    await assets.put(queue[i], res.clone());
    // Built chunks name their siblings relatively ("./photos-abc123.js").
    if (queue[i].endsWith('.js')) enqueue(await res.text(), queue[i], /\.\/[\w-]+\.(?:js|css)/g);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(SHELL).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './favicon.svg'])),
      precacheAssets(),
    ]).catch(() => undefined),
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
