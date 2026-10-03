import { useRef, useState } from 'react';
import { ACHIEVEMENTS } from '../game/achievements';
import { distinctVehicles } from '../game/deck';
import { fullPhotos, detailPhotos } from '../game/pool';
import { MODES, SURVIVAL, TIME_ATTACK } from '../game/modes';
import { BASE_POINTS, FIELD_WEIGHTS, HINT_MULTIPLIERS } from '../game/scoring';
import { hydrateProfile, type AutoAdvance, type MotionPref } from '../game/progress';
import { EmptyState, Icon, Modal, PageHeader, Segmented, Toggle } from './components';
import { PhotoCredit } from './Credit';
import type { Route } from './router';
import { useStore } from './store';
import { storageKey } from '../lib/storage';

/* ------------------------------------------------------------------ */
/* Awards                                                              */
/* ------------------------------------------------------------------ */

export function Awards({ go }: { go: (r: Route) => void }) {
  const { ctx, profile } = useStore();
  const avail = ACHIEVEMENTS.filter((a) => a.available(ctx));
  const hidden = ACHIEVEMENTS.length - avail.length;
  const done = avail.filter((a) => profile.achievements[a.id]).length;
  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-6 sm:px-6">
      <PageHeader title="Achievements" subtitle={`${done} of ${avail.length} unlocked`} onBack={() => go('home')} />
      <ul className="grid gap-3 sm:grid-cols-2">
        {avail.map((a) => {
          const at = profile.achievements[a.id];
          return (
            <li key={a.id} className={`card flex items-center gap-4 p-4 ${at ? 'border-accent/40' : 'opacity-70'}`}>
              <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-3xl ${at ? 'bg-accent/15' : 'bg-raised grayscale'}`} aria-hidden="true">
                {a.icon}
              </span>
              <div>
                <div className="font-display font-bold">
                  {a.name} {at && <span className="sr-only">(unlocked)</span>}
                </div>
                <div className="text-sm text-soft">{a.description}</div>
                <div className="text-xs text-muted">{at ? `Unlocked ${new Date(at).toLocaleDateString()}` : 'Locked'}</div>
              </div>
            </li>
          );
        })}
      </ul>
      {hidden > 0 && (
        <p className="mt-4 text-sm text-muted">
          {hidden} more achievement{hidden > 1 ? 's' : ''} will appear when the verified photo collection is large enough to support {hidden > 1 ? 'them' : 'it'} fairly.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Credits                                                             */
/* ------------------------------------------------------------------ */

export function Credits({ go }: { go: (r: Route) => void }) {
  const { ctx, fixtures } = useStore();
  const photos = [...ctx.ds.photos].sort((a, b) => a.id.localeCompare(b.id));
  const cars = distinctVehicles(fullPhotos(ctx.ds));
  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-6 sm:px-6">
      <PageHeader title="Photo credits" subtitle="Every photograph, its author and its license." onBack={() => go('home')} />
      <div className="card p-4 text-sm text-soft">
        <p>
          CarSpotter uses only photographs from Wikimedia Commons that carry a free license allowing reuse and modification (CC BY, CC BY-SA, CC0 or public domain). Each photo was checked by hand
          against its Commons file page and a second reference before it was approved. Non-commercial and no-derivatives licenses are never used. Images are resized and re-encoded; detail
          challenges use crops, noted on each credit. Licenses: <a className="underline" href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>,{' '}
          <a className="underline" href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>,{' '}
          <a className="underline" href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noopener noreferrer">CC0</a>.
        </p>
        <p className="mt-2 text-muted">
          {photos.length} approved photo{photos.length === 1 ? '' : 's'} · {cars} car{cars === 1 ? '' : 's'} · {detailPhotos(ctx.ds).length} detail crop{detailPhotos(ctx.ds).length === 1 ? '' : 's'}.
        </p>
      </div>
      {fixtures && (
        <p className="mt-3 rounded-2xl border border-warn/50 bg-warn/10 px-4 py-3 text-sm text-warn">Fixture mode: these entries are generated placeholders, not photographs.</p>
      )}
      {photos.length === 0 ? (
        <div className="mt-4">
          <EmptyState icon="camera" title="No photos approved yet">
            When photos are added, each one is listed here with full attribution. See the README for how maintainers add and review them.
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {photos.map((p) => {
            const v = ctx.ds.vehicleById.get(p.vehicleId)!;
            return (
              <li key={p.id} className="card flex gap-3 p-3">
                <img src={p.imageSmall} alt="" loading="lazy" className="h-20 w-28 shrink-0 rounded-xl bg-black object-cover" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold">
                    {v.make} {v.model} <span className="font-normal text-muted">· {p.setting}{p.kind === 'detail' ? ` · ${p.detailPart} crop` : ''}</span>
                  </div>
                  <PhotoCredit photo={p} className="mt-1" />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export function SettingsPage({ go }: { go: (r: Route) => void }) {
  const { settings, setSettings, profile, resetProgress, update, fixtures, storageOk, pushToast } = useStore();
  const [confirm, setConfirm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportData = () => {
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `carspotter-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const importData = async (file: File | undefined) => {
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      if (!json || typeof json !== 'object' || json.version !== 1) throw new Error('not a CarSpotter file');
      update(() => hydrateProfile(json));
      pushToast({ icon: '📥', title: 'Progress imported' });
    } catch {
      pushToast({ icon: '⚠️', title: 'Couldn’t import that file', body: 'It doesn’t look like a CarSpotter progress export.' });
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-6 sm:px-6">
      <PageHeader title="Settings" onBack={() => go('home')} />
      <div className="card divide-y divide-line px-4">
        <Toggle label="Sound effects" description="Short synthesized cues for right, wrong and streaks." checked={settings.sound} onChange={(sound) => setSettings({ sound })} />
        <Toggle label="Haptics" description="Vibrate on answers (phones that support it)." checked={settings.haptics} onChange={(haptics) => setSettings({ haptics })} />
        <Toggle label="Hints available" description="Show the hint button. Hinted runs keep separate best scores." checked={settings.hints} onChange={(hints) => setSettings({ hints })} />
        <div className="py-3">
          <div className="font-semibold">Auto-advance</div>
          <div className="mb-2 text-sm text-muted">Move to the next car automatically after the reveal. Wrong answers stay up a little longer so you can read the tip.</div>
          <Segmented<AutoAdvance>
            label="Auto-advance"
            value={settings.autoAdvance}
            onChange={(autoAdvance) => setSettings({ autoAdvance })}
            options={[
              { value: 0, label: 'Off' },
              { value: 1500, label: 'Fast (1.5 s)' },
              { value: 3000, label: 'Relaxed (3 s)' },
            ]}
          />
        </div>
        <div className="py-3">
          <div className="font-semibold">Motion</div>
          <div className="mb-2 text-sm text-muted">Animations for answers and streaks. “System” follows your device’s reduce-motion setting.</div>
          <Segmented<MotionPref>
            label="Motion"
            value={settings.motion}
            onChange={(motion) => setSettings({ motion })}
            options={[
              { value: 'system', label: 'System' },
              { value: 'full', label: 'Full' },
              { value: 'reduce', label: 'Reduced' },
            ]}
          />
        </div>
      </div>

      <h2 className="label mb-2 mt-8">Your data</h2>
      <div className="card space-y-3 p-4">
        <p className="text-sm text-soft">
          Progress is stored only in this browser (<code className="text-muted">{storageKey(fixtures)}</code>). Clearing site data erases it, so export a backup if you care about your streaks.
        </p>
        {!storageOk && <p className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">This browser is blocking storage: progress will be lost when you close the tab.</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost" onClick={exportData}>
            Export progress
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
            Import progress
          </button>
          <input ref={fileRef} type="file" accept="application/json" className="sr-only" tabIndex={-1} aria-label="Import progress file" onChange={(e) => { void importData(e.target.files?.[0]); e.target.value = ''; }} />
          <button type="button" className="btn btn-ghost text-bad" onClick={() => setConfirm(true)}>
            Reset progress
          </button>
        </div>
      </div>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Reset progress">
        <div className="p-6">
          <h2 className="font-display text-xl font-bold">Reset all progress?</h2>
          <p className="mt-2 text-soft">Stats, personal bests, garage, achievements and the practice list will be erased. Settings are kept. This can’t be undone.</p>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <button type="button" className="btn btn-ghost" onClick={() => setConfirm(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn bg-bad text-ink"
              onClick={() => {
                resetProgress();
                setConfirm(false);
                pushToast({ icon: '🧹', title: 'Progress reset' });
              }}
            >
              Erase everything
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* How to play + first-run intro                                       */
/* ------------------------------------------------------------------ */

export function HowToPlay({ go }: { go: (r: Route) => void }) {
  const hintPct = HINT_MULTIPLIERS.map((m) => `${Math.round(m * 100)}%`).join(' → ');
  const w = FIELD_WEIGHTS;
  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6">
      <PageHeader title="How to play" onBack={() => go('home')} />
      <div className="space-y-4">
        <section className="card p-5">
          <h2 className="font-display text-xl font-bold">The loop</h2>
          <p className="mt-1 text-soft">A real photograph appears. Identify the car, see the answer with a spotting tip, then move on. Every photo is a verified image of a real car with a documented identity and license.</p>
        </section>
        <section className="card p-5">
          <h2 className="font-display text-xl font-bold">Difficulty</h2>
          <ul className="mt-2 space-y-2 text-soft">
            <li><strong className="text-text">Normal · {BASE_POINTS.normal} pts</strong> — four choices (similar era and body style; exactly one is right).</li>
            <li><strong className="text-text">Hard · {BASE_POINTS.hard} pts</strong> — type make and model. Capitalisation, punctuation and common nicknames (VW, Miata, Chevy) are fine; small typos are forgiven, but a different real model never is. Partial credit: make {w.hard.make * 100}%, model {w.hard.model * 100}%.</li>
            <li><strong className="text-text">Expert · {BASE_POINTS.expert} pts</strong> — also name the model year or generation. The question tells you which <em>before</em> you answer. An exact year is only required when details in the photo pin it down; otherwise any year in the documented look-alike range counts. Fields: make {w.expert.make * 100}%, model {w.expert.model * 100}%, year/generation {w.expert.detail * 100}%.</li>
          </ul>
        </section>
        <section className="card p-5">
          <h2 className="font-display text-xl font-bold">Scoring</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-soft">
            <li>Hints (country → era → make) cut the points available: {hintPct}.</li>
            <li>Each consecutive correct answer adds +10% (max +50%).</li>
            <li>Time Attack adds up to +50% for answers within 3 s, fading to 0 at 10 s.</li>
            <li>Only a fully correct answer counts as correct and extends your streak. Skipping reveals the answer and ends the streak.</li>
            <li>Best scores are tracked separately per mode, difficulty, filters, and whether you used hints.</li>
          </ul>
        </section>
        <section className="card p-5">
          <h2 className="font-display text-xl font-bold">Modes</h2>
          <dl className="mt-2 space-y-3">
            {(Object.keys(MODES) as (keyof typeof MODES)[]).map((m) => (
              <div key={m}>
                <dt className="font-semibold">{MODES[m].name}</dt>
                <dd className="text-sm text-soft">
                  {MODES[m].tagline} {MODES[m].rules.join(' ')}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted">
            Time Attack: {TIME_ATTACK.startMs / 1000}s start, ±{TIME_ATTACK.correctBonusMs / 1000}s. Survival: {SURVIVAL.lives} lives, +1 life per {SURVIVAL.lifeEvery} in a row.
          </p>
        </section>
        <section className="card p-5">
          <h2 className="font-display text-xl font-bold">Keyboard</h2>
          <p className="mt-1 text-soft">1–4 pick an answer (Normal) · Enter submits typed answers · Enter or → goes to the next car.</p>
        </section>
      </div>
    </div>
  );
}

const INTRO = [
  { icon: 'camera', title: 'Name that car', body: 'You’ll see real photos of real cars. Pick or type the make and model — the answer reveal always comes with a tip for next time.' },
  { icon: 'target', title: 'Your difficulty, your rules', body: 'Normal gives four choices. Hard asks you to type. Expert adds the model year or generation, and always tells you what it needs first.' },
  { icon: 'flame', title: 'Build streaks, fill the garage', body: 'Try the Daily Challenge, race the clock, or survive on three lives. Cars you identify go in your garage; missed ones come back in Practice.' },
];

export function IntroModal({ open, onDone }: { open: boolean; onDone: () => void }) {
  const [i, setI] = useState(0);
  const step = INTRO[i];
  return (
    <Modal open={open} onClose={onDone} title="Welcome to CarSpotter">
      <div className="p-6 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-accent/15 text-accent">
          <Icon name={step.icon} size={32} />
        </div>
        <h2 className="mt-4 font-display text-2xl font-extrabold">{step.title}</h2>
        <p className="mt-2 text-soft">{step.body}</p>
        <div className="mt-4 flex justify-center gap-1.5" aria-hidden="true">
          {INTRO.map((_, n) => (
            <span key={n} className={`h-1.5 w-6 rounded-full ${n === i ? 'bg-accent' : 'bg-line'}`} />
          ))}
        </div>
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <button type="button" className="btn btn-ghost" onClick={onDone}>
            Skip intro
          </button>
          <button type="button" className="btn btn-primary" onClick={() => (i < INTRO.length - 1 ? setI(i + 1) : onDone())} data-autofocus>
            {i < INTRO.length - 1 ? 'Next' : 'Let’s play'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
