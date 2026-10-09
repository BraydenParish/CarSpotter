/**
 * Player profile: settings, statistics, personal bests, garage, mistakes and
 * daily results. Pure update functions; persistence lives in lib/storage.
 */
import type { Category } from '../data/types';
import type { GameContext } from './context';
import { emptySeen, type SeenState } from './deck';
import type { RoundResult, RunState } from './engine';
import { summarize } from './engine';
import { bestKey, DEFAULT_FILTERS, MODES, type Filters, type ModeId } from './modes';
import type { Difficulty } from './scoring';

export type AutoAdvance = 0 | 1500 | 3000;
export type MotionPref = 'system' | 'reduce' | 'full';

export interface Settings {
  sound: boolean;
  haptics: boolean;
  autoAdvance: AutoAdvance;
  hints: boolean;
  motion: MotionPref;
}

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  haptics: true,
  autoAdvance: 0,
  hints: true,
  motion: 'system',
};

export interface LastSetup {
  mode: ModeId;
  difficulty: Difficulty;
  filters: Filters;
  themeId?: string;
}

export interface Tally {
  answered: number;
  correct: number;
  skipped: number;
  points: number;
}

export interface BestRecord {
  score: number;
  correct: number;
  answered: number;
  date: string;
}

export interface GarageEntry {
  firstAt: string;
  count: number;
  /** Hardest difficulty at which this car was fully identified. */
  best: Difficulty;
  photos: string[];
}

export interface MistakeEntry {
  misses: number;
  lastAt: string;
  practiceCorrect: number;
}

export interface DailyRecord {
  score: number;
  correct: number;
  rounds: number;
  marks: string;
}

export interface RunRecord {
  date: string;
  mode: ModeId;
  themeId?: string;
  difficulty: Difficulty;
  score: number;
  correct: number;
  answered: number;
  bestStreak: number;
  assisted: boolean;
}

export interface Profile {
  version: 1;
  createdAt: string;
  introSeen: boolean;
  settings: Settings;
  lastSetup: LastSetup;
  seen: SeenState;
  stats: {
    byDifficulty: Record<Difficulty, Tally>;
    bestStreak: Record<Difficulty, number>;
    byCategory: Partial<Record<Category, { answered: number; correct: number }>>;
    countries: string[];
    decades: number[];
    hintsUsed: number;
    runs: number;
    exactYears: number;
    practiceCleared: number;
    detailCorrect: number;
  };
  xp: number;
  bests: Record<string, BestRecord>;
  garage: Record<string, GarageEntry>;
  mistakes: Record<string, MistakeEntry>;
  achievements: Record<string, string>;
  daily: Record<string, DailyRecord>;
  dailyStreak: { current: number; best: number; lastDate: string | null };
  history: RunRecord[];
}

const emptyTally = (): Tally => ({ answered: 0, correct: 0, skipped: 0, points: 0 });

export function newProfile(now: Date = new Date()): Profile {
  return {
    version: 1,
    createdAt: now.toISOString(),
    introSeen: false,
    settings: { ...DEFAULT_SETTINGS },
    lastSetup: { mode: 'session', difficulty: 'normal', filters: DEFAULT_FILTERS },
    seen: emptySeen(),
    stats: {
      byDifficulty: { normal: emptyTally(), hard: emptyTally(), expert: emptyTally() },
      bestStreak: { normal: 0, hard: 0, expert: 0 },
      byCategory: {},
      countries: [],
      decades: [],
      hintsUsed: 0,
      runs: 0,
      exactYears: 0,
      practiceCleared: 0,
      detailCorrect: 0,
    },
    xp: 0,
    bests: {},
    garage: {},
    mistakes: {},
    achievements: {},
    daily: {},
    dailyStreak: { current: 0, best: 0, lastDate: null },
    history: [],
  };
}

/** Merge a stored (possibly older or partial) profile over defaults. */
export function hydrateProfile(raw: unknown): Profile {
  const base = newProfile();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<Profile>;
  return {
    ...base,
    ...r,
    version: 1,
    settings: { ...base.settings, ...(r.settings ?? {}) },
    lastSetup: { ...base.lastSetup, ...(r.lastSetup ?? {}), filters: { ...DEFAULT_FILTERS, ...(r.lastSetup?.filters ?? {}) } },
    seen: { ...base.seen, ...(r.seen ?? {}) },
    stats: {
      ...base.stats,
      ...(r.stats ?? {}),
      byDifficulty: { ...base.stats.byDifficulty, ...(r.stats?.byDifficulty ?? {}) },
      bestStreak: { ...base.stats.bestStreak, ...(r.stats?.bestStreak ?? {}) },
    },
    dailyStreak: { ...base.dailyStreak, ...(r.dailyStreak ?? {}) },
  };
}

const DIFF_RANK: Record<Difficulty, number> = { normal: 0, hard: 1, expert: 2 };

/* ------------------------------------------------------------------ */
/* Levels                                                              */
/* ------------------------------------------------------------------ */

export const LEVEL_TITLES = [
  'Learner',
  'Spotter',
  'Enthusiast',
  'Petrolhead',
  'Gearhead',
  'Car Buff',
  'Concours Judge',
  'Motoring Oracle',
  'Legend',
];

/** XP needed to reach level n (1-based): 0, 300, 900, 1800, … (150·n·(n−1)). */
export function xpForLevel(level: number): number {
  return 150 * level * (level - 1);
}

export function levelInfo(xp: number) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const floor = xpForLevel(level);
  const ceil = xpForLevel(level + 1);
  return {
    level,
    title: LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)],
    into: xp - floor,
    span: ceil - floor,
    progress: (xp - floor) / (ceil - floor),
  };
}

/* ------------------------------------------------------------------ */
/* Per-round updates (applied immediately so quitting keeps progress)  */
/* ------------------------------------------------------------------ */

export function applyRound(p: Profile, ctx: GameContext, run: RunState, round: RoundResult, now: Date = new Date()): Profile {
  const config = run.config;
  const vehicle = ctx.ds.vehicleById.get(round.vehicleId);
  const photo = ctx.ds.photos.find((ph) => ph.id === round.photoId);
  // Party answers belong to whoever held the phone, not the profile owner.
  if (!vehicle || config.mode === 'party') return p;
  const iso = now.toISOString();
  const practice = config.mode === 'practice';
  const correct = round.outcome === 'correct';
  const next: Profile = { ...p, seen: run.seen };

  // Garage: every fully correct identification (any mode).
  if (correct) {
    const g = p.garage[vehicle.id];
    next.garage = {
      ...p.garage,
      [vehicle.id]: g
        ? {
            ...g,
            count: g.count + 1,
            best: DIFF_RANK[config.difficulty] > DIFF_RANK[g.best] ? config.difficulty : g.best,
            photos: g.photos.includes(round.photoId) ? g.photos : [...g.photos, round.photoId],
          }
        : { firstAt: iso, count: 1, best: config.difficulty, photos: [round.photoId] },
    };
  }

  // Mistakes / practice list.
  const m = p.mistakes[vehicle.id];
  if (practice) {
    if (m) {
      const mistakes = { ...p.mistakes };
      if (correct) {
        if (m.practiceCorrect + 1 >= 2) {
          delete mistakes[vehicle.id];
          next.stats = { ...(next.stats ?? p.stats), practiceCleared: p.stats.practiceCleared + 1 };
        } else mistakes[vehicle.id] = { ...m, practiceCorrect: m.practiceCorrect + 1 };
      } else mistakes[vehicle.id] = { ...m, practiceCorrect: 0, lastAt: iso };
      next.mistakes = mistakes;
    }
    return next;
  }
  if (!correct) {
    next.mistakes = { ...p.mistakes, [vehicle.id]: { misses: (m?.misses ?? 0) + 1, lastAt: iso, practiceCorrect: 0 } };
  }

  // Main statistics (not affected by practice).
  const d = config.difficulty;
  const t = p.stats.byDifficulty[d];
  const byCategory = { ...p.stats.byCategory };
  for (const c of vehicle.categories) {
    const cur = byCategory[c] ?? { answered: 0, correct: 0 };
    byCategory[c] = { answered: cur.answered + 1, correct: cur.correct + (correct ? 1 : 0) };
  }
  const exact =
    correct && round.expertField === 'year' && photo && photo.modelYear.from === photo.modelYear.to ? 1 : 0;
  const decade = photo ? Math.floor(photo.modelYear.from / 10) * 10 : null;
  next.stats = {
    ...p.stats,
    byDifficulty: {
      ...p.stats.byDifficulty,
      [d]: {
        answered: t.answered + 1,
        correct: t.correct + (correct ? 1 : 0),
        skipped: t.skipped + (round.outcome === 'skipped' ? 1 : 0),
        points: t.points + round.points,
      },
    },
    bestStreak: { ...p.stats.bestStreak, [d]: Math.max(p.stats.bestStreak[d], round.streakAfter) },
    byCategory,
    countries: correct && !p.stats.countries.includes(vehicle.country) ? [...p.stats.countries, vehicle.country] : p.stats.countries,
    decades: correct && decade !== null && !p.stats.decades.includes(decade) ? [...p.stats.decades, decade] : p.stats.decades,
    hintsUsed: p.stats.hintsUsed + round.hintsUsed,
    exactYears: p.stats.exactYears + exact,
    detailCorrect: p.stats.detailCorrect + (correct && config.mode === 'detail' ? 1 : 0),
  };
  next.xp = p.xp + round.points;
  return next;
}

/* ------------------------------------------------------------------ */
/* End-of-run updates                                                  */
/* ------------------------------------------------------------------ */

export interface RunOutcome {
  profile: Profile;
  key: string | null;
  previousBest: BestRecord | null;
  newBest: boolean;
}

export function outcomeMarks(run: RunState): string {
  return run.results
    .map((r) => (r.outcome === 'correct' ? 'C' : r.outcome === 'partial' ? 'P' : r.outcome === 'skipped' ? 'S' : 'W'))
    .join('');
}

function prevDay(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function dailyRecordKey(dateKey: string, difficulty: Difficulty): string {
  return `${dateKey}|${difficulty}`;
}

export function applyRunEnd(p: Profile, run: RunState, now: Date = new Date()): RunOutcome {
  const config = run.config;
  const sum = summarize(run);
  const iso = now.toISOString();
  let profile: Profile = { ...p, seen: run.seen };
  // Party games are shared between players, so they never touch the owner's stats or bests.
  if (!sum.answered || config.mode === 'party') return { profile, key: null, previousBest: null, newBest: false };

  if (config.mode !== 'practice') {
    profile.stats = { ...profile.stats, runs: profile.stats.runs + 1 };
    const record: RunRecord = {
      date: iso,
      mode: config.mode,
      themeId: config.themeId,
      difficulty: config.difficulty,
      score: sum.score,
      correct: sum.correct,
      answered: sum.answered,
      bestStreak: sum.bestStreak,
      assisted: sum.assisted,
    };
    profile.history = [record, ...p.history].slice(0, 30);
  }

  // Daily: one scored attempt per day and difficulty.
  if (config.mode === 'daily' && config.dailyKey) {
    const k = dailyRecordKey(config.dailyKey, config.difficulty);
    if (!p.daily[k]) {
      profile.daily = { ...p.daily, [k]: { score: sum.score, correct: sum.correct, rounds: sum.answered, marks: outcomeMarks(run) } };
      const s = p.dailyStreak;
      if (s.lastDate !== config.dailyKey) {
        const current = s.lastDate === prevDay(config.dailyKey) ? s.current + 1 : 1;
        profile.dailyStreak = { current, best: Math.max(s.best, current), lastDate: config.dailyKey };
      }
    }
  }

  // Personal bests (ranked modes, completed or ended naturally; quitting doesn't count).
  if (!MODES[config.mode].ranked || run.endReason === 'quit') return { profile, key: null, previousBest: null, newBest: false };
  const key = bestKey(config, sum.assisted);
  const previousBest = p.bests[key] ?? null;
  const newBest = !previousBest || sum.score > previousBest.score;
  if (newBest) {
    profile.bests = { ...p.bests, [key]: { score: sum.score, correct: sum.correct, answered: sum.answered, date: iso } };
  }
  return { profile, key, previousBest, newBest: newBest && sum.score > 0 };
}

/** Vehicles currently on the practice list, most-missed first. */
export function practiceList(p: Profile, ctx: GameContext): string[] {
  return Object.entries(p.mistakes)
    .filter(([id]) => ctx.ds.photos.some((ph) => ph.vehicleId === id && ph.kind === 'full'))
    .sort((a, b) => b[1].misses - a[1].misses || b[1].lastAt.localeCompare(a[1].lastAt))
    .map(([id]) => id);
}
