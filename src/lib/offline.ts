/**
 * Offline play: service-worker registration, "Save photos for offline", and
 * the browser's install prompt. Everything here degrades to a no-op when the
 * browser lacks the API (or in dev, where no service worker is registered).
 */

/** Must match PHOTOS in public/sw.js. */
export const PHOTO_CACHE = 'carspotter-photos-v1';

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const register = () => navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  // main.tsx awaits the dataset first, so the load event may already have fired.
  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', () => void register(), { once: true });
}

export function offlineSupported(): boolean {
  return typeof window !== 'undefined' && 'caches' in window;
}

/** How many of these URLs are already in the photo cache. */
export async function countCached(urls: string[]): Promise<number> {
  if (!offlineSupported()) return 0;
  const cache = await caches.open(PHOTO_CACHE);
  let n = 0;
  for (const u of urls) if (await cache.match(new URL(u, location.href).href)) n++;
  return n;
}

/**
 * Download every URL into the photo cache (skipping ones already there).
 * Reports progress; stops early if `signal` is aborted. Returns how many failed.
 */
export async function saveForOffline(
  urls: string[],
  onProgress: (done: number, total: number, bytes: number) => void,
  signal?: AbortSignal,
): Promise<number> {
  const cache = await caches.open(PHOTO_CACHE);
  let done = 0;
  let bytes = 0;
  let failed = 0;
  for (const u of urls) {
    if (signal?.aborted) break;
    const href = new URL(u, location.href).href;
    if (!(await cache.match(href))) {
      try {
        const res = await fetch(href, { signal });
        if (!res.ok) throw new Error(String(res.status));
        bytes += (await res.clone().arrayBuffer()).byteLength;
        await cache.put(href, res);
      } catch {
        if (signal?.aborted) break;
        failed++;
      }
    }
    done++;
    onProgress(done, urls.length, bytes);
  }
  return failed;
}

export async function clearOfflinePhotos(): Promise<void> {
  if (offlineSupported()) await caches.delete(PHOTO_CACHE);
}

/* --- Install prompt (Chromium browsers fire beforeinstallprompt) --------- */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

export function canInstall(): boolean {
  return !!deferred;
}

export function onInstallChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  await e.prompt();
  const { outcome } = await e.userChoice;
  listeners.forEach((l) => l());
  return outcome === 'accepted';
}

export function isStandalone(): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
}
