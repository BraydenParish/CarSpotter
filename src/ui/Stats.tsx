import { MODES, THEMES, type ModeId } from '../game/modes';
import { dailyRecordKey, levelInfo, toughestCars, topConfusions } from '../game/progress';
import type { Difficulty } from '../game/scoring';
import { EmptyState, PageHeader, Stat, pct } from './components';
import { CATEGORY_LABEL, DIFF_LABEL } from './Home';
import { useStore } from './store';
import type { Route } from './router';

function describeBestKey(key: string) {
  const [scope, diff, assist, filtered] = key.split('|');
  const themeName = scope.startsWith('theme:') ? THEMES.find((t) => t.id === scope.slice(6))?.name : null;
  const name = themeName ? `Theme · ${themeName}` : (MODES[scope as ModeId]?.name ?? scope);
  return { name, diff: DIFF_LABEL[diff as Difficulty] ?? diff, assisted: assist === 'hints', filtered: !!filtered };
}

export function Stats({ go }: { go: (r: Route) => void }) {
  const { profile, ctx } = useStore();
  const tough = toughestCars(profile, ctx);
  const mixups = topConfusions(profile, ctx);
  const diffs = ['normal', 'hard', 'expert'] as Difficulty[];
  const totals = diffs.reduce(
    (a, d) => {
      const t = profile.stats.byDifficulty[d];
      return { answered: a.answered + t.answered, correct: a.correct + t.correct, skipped: a.skipped + t.skipped, points: a.points + t.points };
    },
    { answered: 0, correct: 0, skipped: 0, points: 0 },
  );
  const lvl = levelInfo(profile.xp);
  const cats = Object.entries(profile.stats.byCategory)
    .filter(([, v]) => v && v.answered > 0)
    .sort((a, b) => b[1]!.answered - a[1]!.answered);
  const bests = Object.entries(profile.bests).sort((a, b) => b[1].score - a[1].score);
  const dailies = Object.entries(profile.daily)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 7);

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-6 sm:px-6">
      <PageHeader title="Statistics" subtitle="Everything is stored on this device only." onBack={() => go('home')} />
      {totals.answered === 0 && profile.history.length === 0 ? (
        <EmptyState
          icon="chart"
          title="No stats yet"
          action={
            <button type="button" className="btn btn-primary" onClick={() => go('home')}>
              Play a round
            </button>
          }
        >
          Answer a few cars and your accuracy, streaks and personal bests will show up here. Practice rounds don’t count toward these.
        </EmptyState>
      ) : (
        <>
          <div className="card p-5">
            <div className="flex items-center gap-4">
              <div className="grid h-16 w-16 place-items-center rounded-2xl border border-accent/60 bg-accent/10 font-display text-3xl font-extrabold text-accent">{lvl.level}</div>
              <div className="flex-1">
                <div className="font-display text-xl font-bold">{lvl.title}</div>
                <div className="text-sm text-muted tabular">
                  {profile.xp.toLocaleString('en-US')} XP · {lvl.span - lvl.into} to level {lvl.level + 1}
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Level progress" aria-valuemin={0} aria-valuemax={lvl.span} aria-valuenow={lvl.into}>
                  <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(lvl.progress * 100)}%` }} />
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted">XP equals points scored in every mode except Practice.</p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Answered" value={totals.answered} sub={`${totals.skipped} skipped`} />
            <Stat label="Accuracy" value={totals.answered ? pct(totals.correct / totals.answered) : '—'} sub={`${totals.correct} fully correct`} />
            <Stat label="Best streak" value={Math.max(...Object.values(profile.stats.bestStreak))} />
            <Stat label="Runs played" value={profile.stats.runs} sub={`${profile.stats.hintsUsed} hints used`} />
          </div>

          <h2 className="label mb-2 mt-8">By difficulty</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {diffs.map((d) => {
              const t = profile.stats.byDifficulty[d];
              return (
                <div key={d} className="card p-4">
                  <div className="font-display text-lg font-bold">{DIFF_LABEL[d]}</div>
                  <div className="mt-1 text-3xl font-extrabold tabular">{t.answered ? pct(t.correct / t.answered) : '—'}</div>
                  <div className="text-sm text-muted tabular">
                    {t.correct}/{t.answered} correct · streak {profile.stats.bestStreak[d]} · {t.points.toLocaleString('en-US')} pts
                  </div>
                </div>
              );
            })}
          </div>

          {cats.length > 0 && (
            <>
              <h2 className="label mb-2 mt-8">Accuracy by category</h2>
              <div className="card divide-y divide-line">
                {cats.map(([c, v]) => (
                  <div key={c} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-24 shrink-0 text-sm font-semibold">{CATEGORY_LABEL[c] ?? c}</div>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-line" role="img" aria-label={`${pct(v!.correct / v!.answered)} correct`}>
                      <div className="h-full rounded-full bg-accent" style={{ width: pct(v!.correct / v!.answered) }} />
                    </div>
                    <div className="w-24 text-right text-sm text-muted tabular">
                      {pct(v!.correct / v!.answered)} · {v!.answered}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {(tough.length > 0 || mixups.length > 0) && (
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {tough.length > 0 && (
                <section aria-labelledby="tough-h">
                  <h2 id="tough-h" className="label mb-2">
                    Toughest cars
                  </h2>
                  <ul className="card divide-y divide-line">
                    {tough.map((r) => (
                      <li key={r.vehicle.id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <span className="font-semibold">
                          {r.vehicle.make} {r.vehicle.model}
                        </span>
                        <span className="text-sm text-muted tabular">
                          {r.correct}/{r.answered} · {pct(r.accuracy)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {mixups.length > 0 && (
                <section aria-labelledby="mix-h">
                  <h2 id="mix-h" className="label mb-2">
                    Cars you mix up
                  </h2>
                  <ul className="card divide-y divide-line">
                    {mixups.map((m) => (
                      <li key={`${m.vehicle.id}|${m.other}`} className="px-4 py-3">
                        <div className="font-semibold">
                          {m.vehicle.make} {m.vehicle.model}
                        </div>
                        <div className="text-sm text-muted">
                          taken for {m.other} ×{m.times}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}

          <h2 className="label mb-2 mt-8">Personal bests</h2>
          {bests.length === 0 ? (
            <p className="text-soft">Finish a ranked run (10-Round Session, Time Attack, Survival, Daily, Theme or Detail) to set a best. Bests are kept separately per mode, difficulty and whether hints were used.</p>
          ) : (
            <div className="card divide-y divide-line">
              {bests.map(([key, b]) => {
                const d = describeBestKey(key);
                return (
                  <div key={key} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <div className="font-semibold">{d.name}</div>
                      <div className="text-xs text-muted">
                        {d.diff} · {d.assisted ? 'with hints' : 'no hints'}
                        {d.filtered ? ' · filtered' : ''} · {new Date(b.date).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-display text-xl font-extrabold tabular">{b.score.toLocaleString('en-US')}</div>
                      <div className="text-xs text-muted tabular">
                        {b.correct}/{b.answered}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {dailies.length > 0 && (
            <>
              <h2 className="label mb-2 mt-8">Daily challenge</h2>
              <p className="mb-2 text-sm text-muted">
                Streak {profile.dailyStreak.current} · best {profile.dailyStreak.best}
              </p>
              <div className="card divide-y divide-line">
                {dailies.map(([key, r]) => {
                  const [date, d] = key.split('|');
                  const marks = { C: '🟩', P: '🟨', W: '🟥', S: '⬛' } as Record<string, string>;
                  void dailyRecordKey;
                  return (
                    <div key={key} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div>
                        <div className="font-semibold tabular">{date}</div>
                        <div className="text-xs text-muted">{DIFF_LABEL[d as Difficulty]}</div>
                      </div>
                      <div className="text-right">
                        <div aria-label={`${r.correct} of ${r.rounds} correct`}>{[...r.marks].map((m) => marks[m]).join('')}</div>
                        <div className="text-xs text-muted tabular">{r.score.toLocaleString('en-US')} pts</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {profile.history.length > 0 && (
            <>
              <h2 className="label mb-2 mt-8">Recent runs</h2>
              <div className="card divide-y divide-line">
                {profile.history.slice(0, 10).map((h, i) => (
                  <div key={`${h.date}-${i}`} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <div className="font-semibold">{h.mode === 'theme' ? (THEMES.find((t) => t.id === h.themeId)?.name ?? 'Theme') : MODES[h.mode].name}</div>
                      <div className="text-xs text-muted">
                        {DIFF_LABEL[h.difficulty]}
                        {h.assisted ? ' · hints' : ''} · {new Date(h.date).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right tabular">
                      <div className="font-bold">{h.score.toLocaleString('en-US')}</div>
                      <div className="text-xs text-muted">
                        {h.correct}/{h.answered}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
