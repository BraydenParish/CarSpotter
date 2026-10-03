import { useMemo, useState } from 'react';
import type { Vehicle } from '../data/types';
import { formatYearRange } from '../game/matching';
import { practiceList } from '../game/progress';
import { EmptyState, Icon, Modal, PageHeader } from './components';
import { PhotoCredit } from './Credit';
import { CATEGORY_LABEL, DIFF_LABEL } from './Home';
import type { Route } from './router';
import { useStore } from './store';

export function Garage({ go }: { go: (r: Route) => void }) {
  const { ctx, profile } = useStore();
  const [open, setOpen] = useState<Vehicle | null>(null);
  const vehicles = useMemo(() => {
    const withPhotos = new Set(ctx.ds.photos.filter((p) => p.kind === 'full').map((p) => p.vehicleId));
    return ctx.ds.vehicles.filter((v) => withPhotos.has(v.id)).sort((a, b) => `${a.make} ${a.model}`.localeCompare(`${b.make} ${b.model}`));
  }, [ctx]);
  const owned = vehicles.filter((v) => profile.garage[v.id]);
  const toPractice = new Set(practiceList(profile, ctx));

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6">
      <PageHeader title="Your garage" subtitle={vehicles.length ? `${owned.length} of ${vehicles.length} cars identified` : 'Cars you identify are parked here.'} onBack={() => go('home')} />
      {vehicles.length === 0 ? (
        <EmptyState icon="garage" title="The garage is empty">
          There are no verified photos yet, so there are no cars to collect.
        </EmptyState>
      ) : (
        <>
          <div className="mb-4 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Garage completion" aria-valuemin={0} aria-valuemax={vehicles.length} aria-valuenow={owned.length}>
            <div className="h-full rounded-full bg-accent" style={{ width: `${(owned.length / vehicles.length) * 100}%` }} />
          </div>
          {owned.length === 0 && <p className="mb-4 text-soft">Identify a car with a fully correct answer to add it. Locked cards stay mysterious until you do.</p>}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {vehicles.map((v) => {
              const g = profile.garage[v.id];
              const photo = g ? ctx.ds.photos.find((p) => p.id === g.photos[0]) : null;
              return (
                <li key={v.id}>
                  {g && photo ? (
                    <button type="button" onClick={() => setOpen(v)} className="card group block w-full overflow-hidden text-left transition-colors hover:border-accent/60">
                      <img src={photo.imageSmall} alt="" loading="lazy" className="aspect-[3/2] w-full object-cover" />
                      <div className="p-3">
                        <div className="truncate font-semibold">
                          {v.make} {v.model}
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted">
                          <span>
                            {v.years[0]}–{v.years[1]}
                          </span>
                          <span className="tabular">×{g.count} · {DIFF_LABEL[g.best]}</span>
                        </div>
                      </div>
                    </button>
                  ) : (
                    <div className="card relative grid aspect-[3/2.6] place-items-center overflow-hidden border-dashed bg-surface/50 text-center" aria-label="Locked car">
                      <div className="flex flex-col items-center gap-1 text-muted">
                        <Icon name="lock" size={22} />
                        <span className="text-sm">Not identified yet</span>
                        {toPractice.has(v.id) && <span className="rounded-full bg-bad/15 px-2 py-0.5 text-xs text-bad">In practice list</span>}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `${open.make} ${open.model}` : 'Car'} wide>
        {open && <GarageDetail v={open} onClose={() => setOpen(null)} />}
      </Modal>
    </div>
  );
}

function GarageDetail({ v, onClose }: { v: Vehicle; onClose: () => void }) {
  const { ctx, profile } = useStore();
  const g = profile.garage[v.id]!;
  const photos = ctx.ds.photos.filter((p) => g.photos.includes(p.id));
  const first = photos[0];
  return (
    <div className="max-h-[88dvh] overflow-y-auto p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-extrabold">
            {v.make} {v.model}
          </h2>
          <p className="text-sm text-muted">
            {v.generation ? `${v.generation.name} · ` : ''}
            {v.years[0]}–{v.years[1]} · {v.country} · {v.bodyStyle}
          </p>
        </div>
        <button type="button" className="btn btn-ghost h-11 w-11 shrink-0 p-0" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
      </div>
      {first && <img src={first.image} alt={`${formatYearRange(first.modelYear.from, first.modelYear.to)} ${v.make} ${v.model}`} className="mt-3 max-h-[46dvh] w-full rounded-2xl bg-black object-contain" />}
      <div className="mt-3 flex flex-wrap gap-2">
        {v.categories.map((c) => (
          <span key={c} className="chip !min-h-8 text-xs">
            {CATEGORY_LABEL[c] ?? c}
          </span>
        ))}
      </div>
      <p className="mt-3 text-sm text-soft">
        Identified {g.count} time{g.count > 1 ? 's' : ''} · first on {new Date(g.firstAt).toLocaleDateString()} · best difficulty {DIFF_LABEL[g.best]}.
      </p>
      {v.tip && (
        <div className="mt-3 rounded-2xl bg-raised p-3.5">
          <div className="label !text-accent">Spotting tip</div>
          <p className="mt-1 text-soft">{v.tip}</p>
        </div>
      )}
      <div className="mt-3 space-y-2">
        {photos.map((p) => (
          <PhotoCredit key={p.id} photo={p} />
        ))}
        <a href={v.referenceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-soft underline underline-offset-2">
          Reference <Icon name="external" size={13} />
        </a>
      </div>
    </div>
  );
}
