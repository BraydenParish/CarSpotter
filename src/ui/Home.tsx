import { useEffect, useMemo, useState } from 'react';
import type { Category } from '../data/types';
import { filterOptions, modeAvailability, setupPoolSize } from '../game/availability';
import { distinctVehicles } from '../game/deck';
import { DAILY_ROUNDS, MODES, PARTY, THEMES, type Filters, type ModeId, type RunConfig } from '../game/modes';
import { availableThemes, dailyKey, fullPhotos, msUntilDailyReset } from '../game/pool';
import { dailyRecordKey, practiceList } from '../game/progress';
import { BASE_POINTS, type Difficulty } from '../game/scoring';
import { shareMarks } from '../game/share';
import { EmptyState, Icon, LevelBadge, Logo, Modal, Segmented, pct } from './components';
import type { Route } from './router';
import { timelineAvailable } from '../game/timeline';
import { useStore } from './store';
import { copyOrShare } from './share-util';

const MODE_ICONS: Record<ModeId, string> = {
  classic: 'infinity',
  session: 'flag',
  timeattack: 'clock',
  survival: 'heart',
  daily: 'calendar',
  theme: 'layers',
  detail: 'zoom',
  practice: 'repeat',
  party: 'users',
  focus: 'eye',
};

export const DIFF_LABEL: Record<Difficulty, string> = { normal: 'Normal', hard: 'Hard', expert: 'Expert' };
export const DIFF_DESC: Record<Difficulty, string> = {
  normal: 'Pick the make and model from four choices.',
  hard: 'Type the make and model.',
  expert: 'Type make, model and the model year or generation the photo can prove.',
};

export const CATEGORY_LABEL: Record<string, string> = {
  everyday: 'Everyday',
  classic: 'Classic',
  jdm: 'JDM',
  muscle: 'Muscle',
  supercar: 'Supercar',
  sports: 'Sports',
  european: 'European',
  american: 'American',
  electric: 'Electric',
  offroad: 'Off-road',
};

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

function formatCountdown(ms: number) {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

const NAV: { route: Route; icon: string; label: string }[] = [
  { route: 'stats', icon: 'chart', label: 'Stats' },
  { route: 'garage', icon: 'garage', label: 'Garage' },
  { route: 'awards', icon: 'trophy', label: 'Awards' },
  { route: 'how', icon: 'info', label: 'How to play' },
  { route: 'credits', icon: 'camera', label: 'Photo credits' },
  { route: 'settings', icon: 'gear', label: 'Settings' },
];

export function Home({ go, onStart }: { go: (r: Route) => void; onStart: (c: RunConfig) => void }) {
  const { ctx, profile, settings, update, fixtures, pushToast } = useStore();
  const now = useNow(30_000);
  const today = dailyKey(now);
  const practice = practiceList(profile, ctx);
  const cars = distinctVehicles(fullPhotos(ctx.ds));
  const [setupMode, setSetupMode] = useState<ModeId | null>(null);

  const garageCount = Object.keys(profile.garage).filter((id) => ctx.ds.photos.some((p) => p.vehicleId === id)).length;
  const totals = Object.values(profile.stats.byDifficulty).reduce((a, t) => ({ answered: a.answered + t.answered, correct: a.correct + t.correct }), { answered: 0, correct: 0 });
  const bestStreak = Math.max(...Object.values(profile.stats.bestStreak));
  const dailyAvail = modeAvailability(ctx, 'daily', practice.length);
  const playedToday = (['normal', 'hard', 'expert'] as Difficulty[]).filter((d) => profile.daily[dailyRecordKey(today, d)]);

  const last = profile.lastSetup;
  const quickPool = setupPoolSize(ctx, last.mode === 'daily' || last.mode === 'practice' ? 'session' : last.mode, last.difficulty, last.filters, last.themeId, practice);

  const modes: ModeId[] = ['session', 'classic', 'timeattack', 'survival', 'focus', 'theme', 'detail', 'party', 'practice'];

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-4 sm:px-6">
      <header className="flex items-center justify-between gap-3 py-2">
        <Logo />
        <div className="flex items-center gap-3">
          <LevelBadge />
        </div>
      </header>
      <nav aria-label="Main" className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {NAV.map((n) => (
          <button key={n.route} type="button" onClick={() => go(n.route)} className="chip shrink-0">
            <Icon name={n.icon} size={16} />
            {n.label}
          </button>
        ))}
      </nav>

      {fixtures && (
        <div role="note" className="mt-4 rounded-2xl border border-warn/50 bg-warn/10 px-4 py-3 text-sm text-warn">
          <strong>Fixture mode (development only).</strong> The “photos” are generated placeholder cards, not photographs. Progress is stored separately.
        </div>
      )}

      {cars === 0 ? (
        <div className="mt-6">
          <EmptyState icon="camera" title="The photo collection is being verified">
            <p>
              CarSpotter only shows real photographs whose identity, model year and reuse license have been checked. None have been approved
              in this build yet, so there is nothing fair to quiz you on.
            </p>
            <p className="mt-3 text-sm text-muted">
              Maintainers: add reviewed photos with <code className="text-soft">npm run import-photos</code> (see README → “Adding verified photos”).
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => go('how')}>
                How the game works
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => go('credits')}>
                Photo sources & licensing
              </button>
            </div>
          </EmptyState>
        </div>
      ) : (
        <>
          {/* Hero: daily challenge + quick play */}
          <section className="mt-6 grid gap-4 md:grid-cols-5">
            <div className="card relative overflow-hidden p-5 md:col-span-3">
              <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />
              <div className="flex items-center gap-2 text-accent">
                <Icon name="calendar" size={18} />
                <span className="label !text-accent">Daily Challenge</span>
              </div>
              <h2 className="mt-2 font-display text-2xl font-extrabold tracking-tight">
                {new Date(`${today}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })}
              </h2>
              <p className="mt-1 text-soft">
                {DAILY_ROUNDS} cars, the same for everyone. Resets at 00:00 UTC — in {formatCountdown(msUntilDailyReset(now))}.
              </p>
              {profile.dailyStreak.current > 0 && profile.dailyStreak.lastDate && (
                <p className="mt-1 text-sm text-muted">
                  Daily streak: <span className="font-semibold text-text">{profile.dailyStreak.current}</span> · best {profile.dailyStreak.best}
                </p>
              )}
              {dailyAvail.ok ? (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button type="button" className="btn btn-primary" onClick={() => setSetupMode('daily')}>
                    {playedToday.length ? 'Play another difficulty' : 'Play today’s challenge'}
                    <Icon name="next" size={18} />
                  </button>
                  {playedToday.map((d) => {
                    const rec = profile.daily[dailyRecordKey(today, d)];
                    return (
                      <button
                        key={d}
                        type="button"
                        className="chip"
                        onClick={async () => {
                          const res = await copyOrShare(shareMarks(today, d, rec, location.href.split('#')[0]));
                          if (res) pushToast({ icon: '📋', title: res === 'shared' ? 'Shared' : 'Result copied' });
                        }}
                      >
                        <Icon name="share" size={14} /> {DIFF_LABEL[d]} {rec.correct}/{rec.rounds}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-4 flex items-center gap-2 text-sm text-muted">
                  <Icon name="lock" size={16} /> {dailyAvail.reason}.
                </p>
              )}
            </div>

            <div className="card flex flex-col justify-between gap-4 p-5 md:col-span-2">
              <div>
                <span className="label">Quick play</span>
                <p className="mt-2 text-soft">
                  {MODES[last.mode === 'daily' || last.mode === 'practice' ? 'session' : last.mode].name} · {DIFF_LABEL[last.difficulty]}
                  {last.mode === 'theme' && last.themeId ? ` · ${THEMES.find((t) => t.id === last.themeId)?.name}` : ''}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary w-full text-lg"
                disabled={!quickPool}
                onClick={() => {
                  const mode = last.mode === 'daily' || last.mode === 'practice' ? 'session' : last.mode;
                  onStart({ mode, difficulty: last.difficulty, filters: last.filters, themeId: last.themeId, hintsEnabled: settings.hints });
                }}
              >
                Play <Icon name="next" />
              </button>
              <div className="grid grid-cols-3 gap-2 text-center text-xs text-muted">
                <div>
                  <div className="font-display text-lg font-bold text-text tabular">{totals.answered ? pct(totals.correct / totals.answered) : '—'}</div>
                  accuracy
                </div>
                <div>
                  <div className="font-display text-lg font-bold text-text tabular">{bestStreak}</div>
                  best streak
                </div>
                <div>
                  <div className="font-display text-lg font-bold text-text tabular">
                    {garageCount}/{cars}
                  </div>
                  garage
                </div>
              </div>
            </div>
          </section>

          {/* Modes */}
          <section className="mt-8" aria-labelledby="modes-h">
            <h2 id="modes-h" className="label mb-3">
              Game modes
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {modes.map((m) => {
                const info = MODES[m];
                const avail = modeAvailability(ctx, m, practice.length);
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={!avail.ok}
                    onClick={() => setSetupMode(m)}
                    className="card group flex min-h-28 items-start gap-4 p-4 text-left transition-colors hover:border-accent/50 disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-raised text-accent group-disabled:text-muted">
                      <Icon name={MODE_ICONS[m]} size={24} />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 font-display text-lg font-bold">
                        {info.name}
                        {m === 'practice' && practice.length > 0 && (
                          <span className="rounded-full bg-bad/20 px-2 py-0.5 text-xs font-bold text-bad">{practice.length}</span>
                        )}
                      </span>
                      <span className="block text-sm text-soft">{info.tagline}</span>
                      {!avail.ok && (
                        <span className="mt-1 flex items-center gap-1 text-xs text-muted">
                          <Icon name="lock" size={12} /> {avail.reason}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                disabled={!timelineAvailable(ctx)}
                onClick={() => go('timeline')}
                className="card group flex min-h-28 items-start gap-4 p-4 text-left transition-colors hover:border-accent/50 disabled:cursor-not-allowed disabled:opacity-55"
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-raised text-accent group-disabled:text-muted">
                  <Icon name="hourglass" size={24} />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2 font-display text-lg font-bold">
                    Which came first?
                    <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs font-bold text-accent">New</span>
                  </span>
                  <span className="block text-sm text-soft">Two cars, one tap: which model came out first? Three lives.</span>
                  {profile.timeline.best > 0 && <span className="mt-1 block text-xs text-muted">Best: {profile.timeline.best}</span>}
                </span>
              </button>
            </div>
          </section>
        </>
      )}

      {setupMode && (
        <SetupSheet
          mode={setupMode}
          onClose={() => setSetupMode(null)}
          onStart={(config) => {
            if (config.mode !== 'daily' && config.mode !== 'practice' && config.mode !== 'party') {
              update((p) => ({ ...p, lastSetup: { mode: config.mode, difficulty: config.difficulty, filters: config.filters, themeId: config.themeId } }));
            }
            setSetupMode(null);
            onStart(config);
          }}
        />
      )}
    </div>
  );
}

function SetupSheet({ mode, onClose, onStart }: { mode: ModeId; onClose: () => void; onStart: (c: RunConfig) => void }) {
  const { ctx, profile, settings, setSettings } = useStore();
  const info = MODES[mode];
  const practice = practiceList(profile, ctx);
  const themes = useMemo(() => availableThemes(ctx.ds), [ctx]);
  const options = useMemo(() => filterOptions(ctx), [ctx]);
  const today = dailyKey();
  const initialDiff = info.difficulties.includes(profile.lastSetup.difficulty) ? profile.lastSetup.difficulty : info.difficulties[0];
  const [difficulty, setDifficulty] = useState<Difficulty>(initialDiff);
  const [filters, setFilters] = useState<Filters>(info.usesFilters ? profile.lastSetup.filters : { setting: 'all', categories: [] });
  const [themeId, setThemeId] = useState<string | undefined>(
    mode === 'theme' ? (themes.find((t) => t.theme.id === profile.lastSetup.themeId)?.theme.id ?? themes[0]?.theme.id) : undefined,
  );

  const [players, setPlayers] = useState<string[]>(() => (mode === 'party' ? loadPartyNames() : []));
  const poolSize = setupPoolSize(ctx, mode, difficulty, filters, themeId, practice);
  const dailyDone = mode === 'daily' && !!profile.daily[dailyRecordKey(today, difficulty)];
  const partyEach = Math.min(PARTY.roundsEach, Math.floor(poolSize / Math.max(players.length, 1)));
  const rounds =
    info.rounds === null ? null : mode === 'daily' ? DAILY_ROUNDS : mode === 'party' ? partyEach * players.length : Math.min(info.rounds, poolSize);
  const startable = poolSize > 0 && !dailyDone && (mode !== 'party' || partyEach > 0);

  const toggleCategory = (c: Category) =>
    setFilters((f) => ({ ...f, categories: f.categories.includes(c) ? f.categories.filter((x) => x !== c) : [...f.categories, c] }));

  return (
    <Modal open onClose={onClose} title={`${info.name} setup`}>
      <div className="max-h-[85dvh] overflow-y-auto p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="label">{mode === 'daily' ? today : 'Mode'}</span>
            <h2 className="font-display text-2xl font-extrabold tracking-tight">{info.name}</h2>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost h-11 w-11 p-0" aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <ul className="mt-3 space-y-1.5 text-sm text-soft">
          {info.rules.map((r) => (
            <li key={r} className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              {r}
            </li>
          ))}
        </ul>

        <fieldset className="mt-5">
          <legend className="label mb-2">Difficulty</legend>
          <Segmented
            label="Difficulty"
            value={difficulty}
            onChange={setDifficulty}
            options={info.difficulties.map((d) => ({ value: d, label: `${DIFF_LABEL[d]} · ${BASE_POINTS[d]}` }))}
          />
          <p className="mt-2 text-sm text-muted">{DIFF_DESC[difficulty]}</p>
        </fieldset>

        {mode === 'theme' && (
          <fieldset className="mt-5">
            <legend className="label mb-2">Theme</legend>
            <div className="grid gap-2">
              {themes.map(({ theme, vehicles }) => (
                <button
                  key={theme.id}
                  type="button"
                  role="radio"
                  aria-checked={themeId === theme.id}
                  onClick={() => setThemeId(theme.id)}
                  className="chip !h-auto !min-h-14 !justify-between !rounded-2xl !px-4 !py-2 text-left"
                >
                  <span>
                    <span className="block font-semibold text-text">{theme.name}</span>
                    <span className="block text-xs text-muted">{theme.description}</span>
                  </span>
                  <span className="text-xs text-muted tabular">{vehicles} cars</span>
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {mode === 'party' && (
          <fieldset className="mt-5">
            <legend className="label mb-2">Players</legend>
            <ol className="space-y-2">
              {players.map((name, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-raised font-bold text-accent">{i + 1}</span>
                  <input
                    className="field"
                    value={name}
                    maxLength={16}
                    aria-label={`Player ${i + 1} name`}
                    onChange={(e) => setPlayers((ps) => ps.map((p, j) => (j === i ? e.target.value : p)))}
                    autoComplete="off"
                  />
                  {players.length > PARTY.minPlayers && (
                    <button type="button" className="btn btn-ghost h-11 w-11 shrink-0 p-0" aria-label={`Remove player ${i + 1}`} onClick={() => setPlayers((ps) => ps.filter((_, j) => j !== i))}>
                      <Icon name="close" size={18} />
                    </button>
                  )}
                </li>
              ))}
            </ol>
            {players.length < PARTY.maxPlayers && (
              <button type="button" className="btn btn-ghost mt-2" onClick={() => setPlayers((ps) => [...ps, `Player ${ps.length + 1}`])}>
                <Icon name="plus" size={18} /> Add player
              </button>
            )}
          </fieldset>
        )}

        {info.usesFilters && (
          <fieldset className="mt-5">
            <legend className="label mb-2">Photos</legend>
            <Segmented
              label="Photo setting"
              value={filters.setting}
              onChange={(setting) => setFilters((f) => ({ ...f, setting }))}
              options={[
                { value: 'all' as const, label: 'All' },
                ...options.settings.map((s) => ({ value: s.value, label: `${s.value[0].toUpperCase()}${s.value.slice(1)} · ${s.cars}` })),
              ]}
            />
            <div className="label mb-2 mt-4">Categories</div>
            <div className="flex flex-wrap gap-2">
              {options.categories.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  aria-pressed={filters.categories.includes(c.value as Category)}
                  onClick={() => toggleCategory(c.value as Category)}
                  className="chip"
                >
                  {CATEGORY_LABEL[c.value] ?? c.value} <span className="text-xs text-muted">{c.cars}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">No categories selected = all cars. Filtered runs keep separate best scores.</p>
          </fieldset>
        )}

        <div className="mt-5 rounded-2xl border border-line bg-raised/50 px-4">
          <div className="flex items-center justify-between gap-4 py-3">
            <div>
              <div className="font-semibold">Hints</div>
              <div className="text-sm text-muted">Country → era → make. Each lowers the points available; hinted runs have separate bests.</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.hints}
              aria-label="Hints"
              onClick={() => setSettings({ hints: !settings.hints })}
              className={`relative h-8 w-14 shrink-0 rounded-full border transition-colors ${settings.hints ? 'border-accent bg-accent' : 'border-line bg-raised'}`}
            >
              <span className={`absolute top-1 h-6 w-6 rounded-full shadow transition-all ${settings.hints ? 'left-7 bg-ink' : 'left-1 bg-text'}`} />
            </button>
          </div>
        </div>

        <div className="mt-5 text-sm" aria-live="polite">
          {poolSize === 0 ? (
            <p className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-bad">
              {difficulty === 'expert'
                ? 'No verified photos in this selection can fairly support an Expert question. Try Hard, or broaden the filters.'
                : 'No verified photos match this selection. Broaden the filters.'}
            </p>
          ) : dailyDone ? (
            <p className="rounded-xl border border-line bg-raised px-3 py-2 text-soft">You’ve already played today’s {DIFF_LABEL[difficulty]} challenge. Try another difficulty, or come back after 00:00 UTC.</p>
          ) : (
            <p className="text-muted">
              {poolSize} car{poolSize === 1 ? '' : 's'} in the pool
              {rounds !== null ? ` · ${rounds} round${rounds === 1 ? '' : 's'}` : ''}
              {mode === 'party' && partyEach > 0 ? ` (${partyEach} each)` : ''}
              {rounds !== null && info.rounds !== null && mode !== 'daily' && (mode === 'party' ? partyEach < info.rounds : rounds < info.rounds) ? ' (shortened to avoid repeats)' : ''}
            </p>
          )}
        </div>

        <button
          type="button"
          className="btn btn-primary mt-4 w-full text-lg"
          disabled={!startable}
          onClick={() => {
            const names = players.map((n, i) => n.trim() || `Player ${i + 1}`);
            if (mode === 'party') saveParty(names);
            onStart({
              mode,
              difficulty,
              filters,
              themeId,
              dailyKey: mode === 'daily' ? today : undefined,
              hintsEnabled: settings.hints,
              ...(mode === 'party' ? { players: names } : {}),
            });
          }}
        >
          Start <Icon name="next" />
        </button>
      </div>
    </Modal>
  );
}

const PARTY_NAMES_KEY = 'carspotter.partyNames';

/** Last party's player names (a per-device convenience; falls back to defaults). */
function loadPartyNames(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PARTY_NAMES_KEY) ?? '[]');
    if (Array.isArray(raw)) {
      const names = raw.filter((n): n is string => typeof n === 'string').slice(0, PARTY.maxPlayers);
      if (names.length >= PARTY.minPlayers) return names;
    }
  } catch {
    /* storage unavailable */
  }
  return ['Player 1', 'Player 2'];
}

function saveParty(names: string[]) {
  try {
    localStorage.setItem(PARTY_NAMES_KEY, JSON.stringify(names));
  } catch {
    /* storage unavailable */
  }
}
