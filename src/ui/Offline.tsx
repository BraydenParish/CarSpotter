import { useEffect, useMemo, useRef, useState } from 'react';
import { canInstall, clearOfflinePhotos, countCached, isStandalone, offlineSupported, onInstallChange, promptInstall, saveForOffline } from '../lib/offline';
import { useStore } from './store';

/** Settings card: install the app and keep every verified photo for offline play. */
export function OfflineCard() {
  const { ctx, fixtures, pushToast } = useStore();
  const urls = useMemo(() => [...new Set(ctx.ds.photos.map((p) => p.image))], [ctx]);
  const [cached, setCached] = useState<number | null>(null);
  const [progress, setProgress] = useState<{ done: number; bytes: number } | null>(null);
  const [installable, setInstallable] = useState(canInstall());
  const abort = useRef<AbortController | null>(null);
  const supported = offlineSupported() && !fixtures;

  useEffect(() => onInstallChange(() => setInstallable(canInstall())), []);
  useEffect(() => {
    if (!supported) return;
    let live = true;
    void countCached(urls).then((n) => live && setCached(n));
    return () => {
      live = false;
      abort.current?.abort();
    };
  }, [supported, urls]);

  const save = async () => {
    const ctl = new AbortController();
    abort.current = ctl;
    setProgress({ done: 0, bytes: 0 });
    const failed = await saveForOffline(urls, (done, _t, bytes) => setProgress({ done, bytes }), ctl.signal);
    setProgress(null);
    setCached(await countCached(urls));
    if (!ctl.signal.aborted) {
      pushToast(failed ? { icon: '⚠️', title: `${failed} photo${failed > 1 ? 's' : ''} couldn’t be saved`, body: 'Try again when your connection is better.' } : { icon: '📦', title: 'Ready for offline play' });
    }
  };
  const clear = async () => {
    await clearOfflinePhotos();
    setCached(0);
    pushToast({ icon: '🧹', title: 'Offline photos removed' });
  };

  if (!supported && !installable) return null;
  const all = cached !== null && cached >= urls.length;

  return (
    <>
      <h2 className="label mb-2 mt-8">Offline play</h2>
      <div className="card space-y-3 p-4">
        {installable && !isStandalone() && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-soft">Install CarSpotter as an app for a full-screen game on your home screen.</p>
            <button type="button" className="btn btn-primary" onClick={() => void promptInstall()}>
              Install app
            </button>
          </div>
        )}
        {supported && (
          <>
            <p className="text-sm text-soft">
              Photos you play are kept for next time. Save all {urls.length} now (about {Math.round((urls.length * 0.28))} MB) to play anywhere without a connection.
            </p>
            <p className="text-sm text-muted" aria-live="polite">
              {progress
                ? `Saving… ${progress.done} of ${urls.length} (${(progress.bytes / 1e6).toFixed(1)} MB)`
                : cached === null
                  ? 'Checking saved photos…'
                  : `${cached} of ${urls.length} photos saved on this device.`}
            </p>
            {progress && (
              <div className="h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Saving photos" aria-valuemin={0} aria-valuemax={urls.length} aria-valuenow={progress.done}>
                <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${(progress.done / urls.length) * 100}%` }} />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {progress ? (
                <button type="button" className="btn btn-ghost" onClick={() => abort.current?.abort()}>
                  Stop
                </button>
              ) : (
                <button type="button" className="btn btn-ghost" onClick={() => void save()} disabled={all}>
                  {all ? 'All photos saved' : 'Save photos for offline'}
                </button>
              )}
              {!progress && !!cached && (
                <button type="button" className="btn btn-ghost" onClick={() => void clear()}>
                  Remove saved photos
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
