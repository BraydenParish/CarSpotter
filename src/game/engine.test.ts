import { describe, expect, it } from 'vitest';
import { createContext, VEHICLES } from '../data/dataset';
import { fixturePhotos } from '../dev/fixtures';
import { checkAchievements } from './achievements';
import {
  createRun,
  next,
  photoFailed,
  photoLoaded,
  remainingMs,
  skip,
  submitChoice,
  submitTyped,
  summarize,
  tick,
  useHint,
  partyStandings,
  type RunState,
} from './engine';
import { DEFAULT_FILTERS, type RunConfig } from './modes';
import { applyRound, applyRunEnd, collections, hydrateProfile, inCollection, newProfile, practiceList, toughestCars, topConfusions } from './progress';
import { mulberry32 } from './rng';
import { shareText } from './share';

const ctx = createContext(VEHICLES, fixturePhotos(VEHICLES));
const rng = mulberry32(42);
const cfg = (over: Partial<RunConfig> = {}): RunConfig => ({
  mode: 'session',
  difficulty: 'normal',
  filters: DEFAULT_FILTERS,
  hintsEnabled: true,
  ...over,
});

function start(over: Partial<RunConfig> = {}, practiceVehicles?: string[]): RunState {
  const r = createRun(ctx, cfg(over), { now: 0, rng, practiceVehicles });
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

const correctKey = (s: RunState) => s.question!.choices!.find((c) => c.correct)!.key;
const wrongKey = (s: RunState) => s.question!.choices!.find((c) => !c.correct)!.key;
const answerTyped = (s: RunState) => ({ make: s.question!.vehicle.make, model: s.question!.vehicle.model });

describe('run engine', () => {
  it('plays a 10-round session with no repeated cars', () => {
    let s = start();
    expect(s.totalRounds).toBe(10);
    const vehicles: string[] = [];
    let t = 0;
    while (s.phase !== 'finished') {
      s = photoLoaded(s, (t += 100));
      vehicles.push(s.question!.vehicle.id);
      s = submitChoice(s, correctKey(s), (t += 1000));
      expect(s.phase).toBe('reveal');
      s = next(ctx, s, rng);
    }
    expect(vehicles).toHaveLength(10);
    expect(new Set(vehicles).size).toBe(10);
    expect(s.endReason).toBe('complete');
    const sum = summarize(s);
    expect(sum.correct).toBe(10);
    expect(sum.perfect).toBe(true);
    expect(sum.bestStreak).toBe(10);
  });

  it('pre-draws a different car for preloading', () => {
    const s = start();
    expect(s.upcoming).not.toBeNull();
    expect(s.upcoming!.vehicle.id).not.toBe(s.question!.vehicle.id);
  });

  it('ignores double submissions and answers before the photo loads', () => {
    let s = start();
    expect(submitChoice(s, correctKey(s), 10)).toBe(s); // still loading
    s = photoLoaded(s, 0);
    const key = correctKey(s);
    s = submitChoice(s, key, 500);
    const again = submitChoice(s, key, 600);
    expect(again).toBe(s);
    expect(skip(s, 700)).toBe(s);
    expect(s.results).toHaveLength(1);
  });

  it('skipping reveals the answer, scores zero and ends the streak', () => {
    let s = photoLoaded(start(), 0);
    s = submitChoice(s, correctKey(s), 100);
    s = photoLoaded(next(ctx, s, rng), 200);
    s = skip(s, 300);
    expect(s.results[1]).toMatchObject({ outcome: 'skipped', points: 0, streakAfter: 0 });
    expect(s.streak).toBe(0);
    expect(s.bestStreak).toBe(1);
  });

  it('replaces a failed photo without scoring it', () => {
    let s = start();
    const failed = s.question!.photo.id;
    s = photoFailed(ctx, s, rng, 0);
    expect(s.results).toHaveLength(0);
    expect(s.question!.n).toBe(1);
    expect(s.question!.photo.id).not.toBe(failed);
    expect(s.failedPhotos).toContain(failed);
    expect(s.phase).toBe('loading');
  });

  it('ends gracefully when every photo fails', () => {
    let s = start({ filters: { setting: 'studio', categories: [] } });
    for (let i = 0; i < 20 && s.phase !== 'finished'; i++) s = photoFailed(ctx, s, rng, 0);
    expect(s.phase).toBe('finished');
    expect(s.endReason).toBe('exhausted');
    expect(s.results).toHaveLength(0);
  });

  it('shortens sessions for small filtered pools', () => {
    const s = start({ filters: { setting: 'studio', categories: [] } });
    const studioCars = new Set(ctx.ds.photos.filter((p) => p.setting === 'studio').map((p) => p.vehicleId)).size;
    expect(s.totalRounds).toBe(studioCars);
    expect(studioCars).toBeLessThan(10);
  });

  it('reports an empty pool instead of starting', () => {
    const tiny = createContext(VEHICLES, fixturePhotos(VEHICLES).filter((p) => p.vehicleId === 'vw-beetle'));
    const r = createRun(tiny, cfg({ difficulty: 'expert' }), { now: 0, rng });
    expect(r).toEqual({ ok: false, reason: 'empty-pool' });
    expect(createRun(ctx, cfg({ mode: 'practice' }), { now: 0, rng, practiceVehicles: [] })).toEqual({ ok: false, reason: 'no-practice' });
  });

  it('hints lower the score and mark the run as assisted', () => {
    let s = photoLoaded(start(), 0);
    s = useHint(useHint(s));
    expect(s.hintsUsed).toBe(2);
    s = submitChoice(s, correctKey(s), 100);
    expect(s.results[0].points).toBe(50);
    expect(s.assisted).toBe(true);
    let off = photoLoaded(start({ hintsEnabled: false }), 0);
    off = useHint(off);
    expect(off.hintsUsed).toBe(0);
  });

  it('checks typed answers on Hard with partial credit', () => {
    let s = photoLoaded(start({ difficulty: 'hard' }), 0);
    s = submitTyped(ctx, s, { make: s.question!.vehicle.make, model: 'Definitely Not' }, 100);
    expect(s.results[0].outcome).toBe('partial');
    expect(s.results[0].points).toBe(80);
    expect(s.streak).toBe(0);
    s = photoLoaded(next(ctx, s, rng), 200);
    s = submitTyped(ctx, s, answerTyped(s), 300);
    expect(s.results[1].outcome).toBe('correct');
  });

  it('Expert runs only use eligible photos and ask a specific field', () => {
    let s = start({ difficulty: 'expert', mode: 'classic' });
    for (let i = 0; i < 15; i++) {
      expect(s.question!.expertField).not.toBeNull();
      s = photoLoaded(s, 0);
      s = skip(s, 1);
      s = next(ctx, s, rng);
    }
  });

  it('Survival ends when lives run out and restores a life every 5 in a row', () => {
    let s = start({ mode: 'survival', difficulty: 'normal' });
    expect(s.lives).toBe(3);
    s = photoLoaded(s, 0);
    s = submitChoice(s, wrongKey(s), 1);
    expect(s.lives).toBe(2);
    for (let i = 0; i < 5; i++) {
      s = photoLoaded(next(ctx, s, rng), 0);
      s = submitChoice(s, correctKey(s), 1);
    }
    expect(s.lives).toBe(3);
    expect(s.results.at(-1)!.lifeDelta).toBe(1);
    for (let i = 0; i < 3; i++) {
      s = photoLoaded(next(ctx, s, rng), 0);
      s = skip(s, 1);
    }
    expect(s.lives).toBe(0);
    s = next(ctx, s, rng);
    expect(s.phase).toBe('finished');
    expect(s.endReason).toBe('lives');
  });

  it('Time Attack runs a clock that pauses while loading and during the reveal', () => {
    let s = start({ mode: 'timeattack' });
    expect(remainingMs(s, 5000)).toBe(60_000); // loading: paused
    s = photoLoaded(s, 1000);
    expect(remainingMs(s, 3000)).toBe(58_000);
    s = submitChoice(s, correctKey(s), 3000);
    expect(remainingMs(s, 99_999)).toBe(61_000); // +3 s, paused in reveal
    expect(s.results[0].breakdown!.speedBonus).toBe(0.5);
    s = photoLoaded(next(ctx, s, rng), 10_000);
    s = tick(s, 10_000 + 61_000);
    expect(s.phase).toBe('finished');
    expect(s.endReason).toBe('time');
  });

  it('Daily challenge plays the same five cars for a date', () => {
    const play = () => {
      let s = start({ mode: 'daily', dailyKey: '2026-10-03' });
      const ids: string[] = [];
      while (s.phase !== 'finished') {
        s = photoLoaded(s, 0);
        ids.push(s.question!.photo.id);
        s = next(ctx, skip(s, 1), mulberry32(Math.random() * 1e9));
      }
      return ids;
    };
    const a = play();
    expect(a).toHaveLength(5);
    expect(play()).toEqual(a);
  });

  it('Practice uses only the listed cars', () => {
    const list = ['mazda-mx5-na', 'ferrari-f40'];
    const s = start({ mode: 'practice' }, list);
    expect(s.totalRounds).toBe(2);
    expect(s.pool.every((p) => list.includes(p.vehicleId))).toBe(true);
  });
});

describe('progress, garage and practice list', () => {
  it('adds correct answers to the garage and misses to the practice list', () => {
    let p = newProfile();
    let s = photoLoaded(start(), 0);
    s = submitChoice(s, correctKey(s), 100);
    p = applyRound(p, ctx, s, s.results[0]);
    const first = s.results[0].vehicleId;
    expect(p.garage[first].count).toBe(1);
    expect(p.xp).toBe(100);
    s = photoLoaded(next(ctx, s, rng), 0);
    s = submitChoice(s, wrongKey(s), 100);
    p = applyRound(p, ctx, s, s.results[1]);
    expect(practiceList(p, ctx)).toEqual([s.results[1].vehicleId]);
    expect(p.stats.byDifficulty.normal).toMatchObject({ answered: 2, correct: 1 });
  });

  it('clears a car from practice after two correct practice answers, without touching main stats', () => {
    let p = newProfile();
    p.mistakes = { 'mazda-mx5-na': { misses: 1, lastAt: '2026-01-01', practiceCorrect: 0 } };
    for (let i = 0; i < 2; i++) {
      let s = photoLoaded(start({ mode: 'practice' }, ['mazda-mx5-na']), 0);
      s = submitChoice(s, correctKey(s), 10);
      p = applyRound(p, ctx, s, s.results[0]);
    }
    expect(p.mistakes['mazda-mx5-na']).toBeUndefined();
    expect(p.stats.practiceCleared).toBe(1);
    expect(p.stats.byDifficulty.normal.answered).toBe(0);
    expect(p.xp).toBe(0);
  });

  it('records personal bests separately and flags new bests', () => {
    let p = newProfile();
    let s = photoLoaded(start(), 0);
    s = submitChoice(s, correctKey(s), 10);
    s = { ...s, phase: 'finished', endReason: 'complete' };
    const out = applyRunEnd(p, s);
    expect(out.newBest).toBe(true);
    p = out.profile;
    expect(Object.keys(p.bests)).toEqual(['session|normal|clean']);
    const again = applyRunEnd(p, s);
    expect(again.newBest).toBe(false);
    const quitRun = applyRunEnd(newProfile(), { ...s, endReason: 'quit' });
    expect(quitRun.key).toBeNull();
  });

  it('records one scored daily attempt and a daily streak', () => {
    let p = newProfile();
    const finish = (key: string) => {
      let s = photoLoaded(start({ mode: 'daily', dailyKey: key }), 0);
      s = submitChoice(s, correctKey(s), 10);
      return { ...s, phase: 'finished' as const, endReason: 'complete' as const };
    };
    p = applyRunEnd(p, finish('2026-10-01')).profile;
    p = applyRunEnd(p, finish('2026-10-02')).profile;
    const before = p.daily['2026-10-02|normal'];
    p = applyRunEnd(p, finish('2026-10-02')).profile;
    expect(p.daily['2026-10-02|normal']).toBe(before);
    expect(p.dailyStreak).toMatchObject({ current: 2, best: 2, lastDate: '2026-10-02' });
  });

  it('unlocks achievements once', () => {
    let p = newProfile();
    let s = photoLoaded(start(), 0);
    s = submitChoice(s, correctKey(s), 10);
    p = applyRound(p, ctx, s, s.results[0]);
    const a = checkAchievements(p, ctx, s);
    expect(a.unlocked.map((x) => x.id)).toContain('first-spot');
    expect(checkAchievements(a.profile, ctx, s).unlocked).toEqual([]);
  });
});

describe('sharing', () => {
  it('produces spoiler-free text', () => {
    let s = start({ mode: 'daily', dailyKey: '2026-10-03' });
    const names: string[] = [];
    while (s.phase !== 'finished') {
      s = photoLoaded(s, 0);
      names.push(s.question!.vehicle.make, s.question!.vehicle.model);
      s = next(ctx, submitChoice(s, correctKey(s), 1), rng);
    }
    const text = shareText(s, 'https://example.test/');
    expect(text).toContain('CarSpotter Daily 2026-10-03');
    expect(text).toContain('🟩🟩🟩🟩🟩');
    for (const n of names) expect(text.toLowerCase()).not.toContain(` ${n.toLowerCase()} `);
  });
});

describe('party (pass & play)', () => {
  it('rotates turns, keeps per-player streaks and ranks the players', () => {
    let s = start({ mode: 'party', players: ['Ana', 'Ben', 'Cy'] });
    expect(s.totalRounds).toBe(15);
    let t = 0;
    const vehicles: string[] = [];
    while (s.phase !== 'finished') {
      s = photoLoaded(s, (t += 100));
      vehicles.push(s.question!.vehicle.id);
      const player = (s.question!.n - 1) % 3;
      // Ana always right, Ben always wrong, Cy right only on odd turns of hers.
      const right = player === 0 || (player === 2 && s.question!.n % 2 === 1);
      s = submitChoice(s, right ? correctKey(s) : wrongKey(s), (t += 1000));
      expect(s.results.at(-1)!.player).toBe(player);
      s = next(ctx, s, rng);
    }
    expect(new Set(vehicles).size).toBe(15);
    // Ana's streak runs over her own five turns despite Ben's misses in between.
    expect(s.results.filter((r) => r.player === 0).map((r) => r.streakAfter)).toEqual([1, 2, 3, 4, 5]);
    const table = partyStandings(s);
    expect(table.map((r) => r.name)).toEqual(['Ana', 'Cy', 'Ben']);
    expect(table[0]).toMatchObject({ rank: 1, correct: 5, answered: 5 });
    expect(table[2]).toMatchObject({ score: 0, correct: 0 });
    expect(table.reduce((t2, r) => t2 + r.score, 0)).toBe(s.score);
  });

  it('gives everyone the same number of turns when cars are scarce', () => {
    const r = createRun(ctx, cfg({ mode: 'party', players: ['A', 'B', 'C', 'D'], filters: { setting: 'all', categories: ['supercar'] } }), { now: 0, rng });
    if (!r.ok) return; // fixture set may have too few supercars for four players
    expect(r.state.totalRounds! % 4).toBe(0);
  });

  it('never changes the owner’s stats, garage or bests', () => {
    let s = start({ mode: 'party', players: ['A', 'B'] });
    let p = newProfile();
    let t = 0;
    while (s.phase !== 'finished') {
      s = photoLoaded(s, (t += 100));
      s = submitChoice(s, correctKey(s), (t += 500));
      p = applyRound(p, ctx, s, s.results.at(-1)!);
      s = next(ctx, s, rng);
    }
    const out = applyRunEnd(p, s);
    expect(out.profile.stats).toEqual(newProfile().stats);
    expect(out.profile.garage).toEqual({});
    expect(out.profile.bests).toEqual({});
    expect(out.newBest).toBe(false);
  });
});

describe('learning feedback', () => {
  it('records each car’s record and what it was mistaken for', () => {
    let s = start();
    let p = newProfile();
    s = photoLoaded(s, 10);
    const v = s.question!.vehicle;
    const wrong = s.question!.choices!.find((c) => !c.correct)!;
    s = submitChoice(s, wrong.key, 500);
    p = applyRound(p, ctx, s, s.results.at(-1)!);
    expect(p.carStats[v.id]).toEqual({ answered: 1, correct: 0 });
    expect(p.confusions[v.id]).toEqual({ [wrong.label]: 1 });
    expect(topConfusions(p, ctx)[0]).toMatchObject({ other: wrong.label, times: 1 });
    // A second, correct attempt on the same car.
    const r2 = { ...s.results.at(-1)!, outcome: 'correct' as const, fields: { choice: { correct: true, kind: 'exact' as const, input: `${v.make} ${v.model}`, expected: '' } } };
    p = applyRound(p, ctx, s, r2);
    expect(p.carStats[v.id]).toEqual({ answered: 2, correct: 1 });
    expect(toughestCars(p, ctx)[0]).toMatchObject({ answered: 2, correct: 1 });
  });

  it('records a typed answer only when it names another known car', () => {
    let s = start({ difficulty: 'hard' });
    let p = newProfile();
    s = photoLoaded(s, 10);
    const v = s.question!.vehicle;
    const other = VEHICLES.find((x) => x.id !== v.id && x.make !== v.make)!;
    s = submitTyped(ctx, s, { make: other.make, model: other.model }, 500);
    p = applyRound(p, ctx, s, s.results.at(-1)!);
    expect(p.confusions[v.id]).toEqual({ [`${other.make} ${other.model}`]: 1 });
    let s2 = start({ difficulty: 'hard' });
    s2 = photoLoaded(s2, 10);
    s2 = submitTyped(ctx, s2, { make: 'Banana', model: 'Rocket' }, 500);
    const p2 = applyRound(newProfile(), ctx, s2, s2.results.at(-1)!);
    expect(p2.confusions).toEqual({});
  });

  it('loads older saved profiles without the new fields', () => {
    const old = { ...newProfile() } as Record<string, unknown>;
    delete old.carStats;
    delete old.confusions;
    const p = hydrateProfile(JSON.parse(JSON.stringify(old)));
    expect(p.carStats).toEqual({});
    expect(p.confusions).toEqual({});
  });
});

describe('focus mode', () => {
  it('pays more for answering while the photo is still blurred', () => {
    let s = start({ mode: 'focus' });
    expect(s.totalRounds).toBe(10);
    s = photoLoaded(s, 0);
    s = submitChoice(s, correctKey(s), 0);
    const early = s.results.at(-1)!;
    expect(early.points).toBe(100);
    s = next(ctx, s, rng);
    s = photoLoaded(s, 1000);
    s = submitChoice(s, correctKey(s), 1000 + 6000);
    const mid = s.results.at(-1)!;
    // Half-way through the focus: 65% of the points, plus the 10% streak bonus.
    expect(mid.breakdown!.focusMultiplier).toBeCloseTo(0.65, 5);
    expect(mid.points).toBe(Math.round(100 * 0.65 * 1.1));
    s = next(ctx, s, rng);
    s = photoLoaded(s, 20_000);
    s = submitChoice(s, correctKey(s), 60_000);
    expect(s.results.at(-1)!.breakdown!.focusMultiplier).toBeCloseTo(0.3, 5);
  });
});

describe('garage collections', () => {
  it('counts identified cars per category and per country', () => {
    const vs = VEHICLES.slice(0, 12);
    const garage = Object.fromEntries(vs.slice(0, 3).map((v) => [v.id, { count: 1, best: 'normal' as const, photos: [], firstAt: '' }])) as never;
    const groups = collections(vs, garage);
    for (const g of groups) {
      const members = vs.filter((v) => inCollection(v, g.key));
      expect(g.total).toBe(members.length);
      expect(g.have).toBe(members.filter((v) => vs.slice(0, 3).includes(v)).length);
    }
    expect(groups.filter((g) => g.kind === 'country').reduce((n, g) => n + g.total, 0)).toBe(vs.length);
    expect(groups[0].kind).toBe('category');
  });
});

describe('importing a damaged progress file', () => {
  it('replaces wrongly typed collections with empty ones instead of keeping them', () => {
    const p = hydrateProfile({ version: 1, garage: null, mistakes: 5, daily: [], history: 'x', xp: 'lots', stats: { countries: null }, timeline: { best: 'a' } });
    expect(p.garage).toEqual({});
    expect(p.mistakes).toEqual({});
    expect(p.daily).toEqual({});
    expect(p.history).toEqual([]);
    expect(p.xp).toBe(0);
    expect(p.stats.countries).toEqual([]);
    expect(p.stats.decades).toEqual([]);
    expect(p.timeline.best).toBe(0);
    expect(() => Object.keys(p.garage)).not.toThrow();
  });

  it('keeps well-formed data', () => {
    const base = newProfile();
    const p = hydrateProfile({ ...base, xp: 450, garage: { a: { count: 2 } } });
    expect(p.xp).toBe(450);
    expect(Object.keys(p.garage)).toEqual(['a']);
  });
});
