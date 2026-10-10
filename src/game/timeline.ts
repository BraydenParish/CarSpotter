/**
 * "Which came first?" — two verified photos side by side; tap the car whose
 * model was introduced first (the start of the vehicle's documented
 * production years). Three lives; the gap between the two cars shrinks as the
 * streak grows, so it starts easy and gets hard.
 */
import type { Photo, Vehicle } from '../data/types';
import type { GameContext } from './context';

export const TIMELINE = {
  lives: 3,
  /** Minimum gap in introduction years, by number of correct answers so far. */
  gaps: [
    { from: 0, gap: 15 },
    { from: 4, gap: 10 },
    { from: 8, gap: 6 },
    { from: 14, gap: 3 },
  ],
  /** Cars seen in the last N duels are not reused while others are available. */
  recentWindow: 8,
};

export interface DuelSide {
  vehicle: Vehicle;
  photo: Photo;
}

export interface Duel {
  left: DuelSide;
  right: DuelSide;
  /** 'left' or 'right': the car introduced first. */
  older: 'left' | 'right';
  gap: number;
}

export interface TimelineState {
  duel: Duel | null;
  lives: number;
  correct: number;
  answered: number;
  /** Vehicle ids used recently. */
  recent: string[];
  over: boolean;
  last: { picked: 'left' | 'right'; right: boolean } | null;
}

export function minGap(correct: number): number {
  let g = TIMELINE.gaps[0].gap;
  for (const step of TIMELINE.gaps) if (correct >= step.from) g = step.gap;
  return g;
}

/** Vehicles that have at least one approved full photo, each with its photos. */
export function timelinePool(ctx: GameContext): { vehicle: Vehicle; photos: Photo[] }[] {
  const byVehicle = new Map<string, Photo[]>();
  for (const p of ctx.ds.photos) {
    if (p.kind !== 'full' || p.review.status !== 'approved') continue;
    const list = byVehicle.get(p.vehicleId) ?? [];
    list.push(p);
    byVehicle.set(p.vehicleId, list);
  }
  return ctx.ds.vehicles.filter((v) => byVehicle.has(v.id)).map((v) => ({ vehicle: v, photos: byVehicle.get(v.id)! }));
}

/** Enough cars for a fair game: at least two introduced `gap` years apart. */
export function timelineAvailable(ctx: GameContext): boolean {
  const years = timelinePool(ctx).map((x) => x.vehicle.years[0]);
  return years.length >= 4 && Math.max(...years) - Math.min(...years) >= TIMELINE.gaps[0].gap;
}

const pick = <T,>(xs: T[], rng: () => number): T => xs[Math.floor(rng() * xs.length)];

/**
 * A new duel whose two cars were introduced at least `minGap(correct)` years
 * apart (relaxed step by step if the pool cannot satisfy it), avoiding recent cars.
 */
export function makeDuel(ctx: GameContext, correct: number, recent: string[], rng: () => number): Duel | null {
  const pool = timelinePool(ctx);
  if (pool.length < 2) return null;
  const fresh = pool.filter((x) => !recent.includes(x.vehicle.id));
  const source = fresh.length >= 2 ? fresh : pool;
  for (let gap = minGap(correct); gap >= 1; gap = gap > 3 ? gap - 3 : gap - 1) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const a = pick(source, rng);
      const partners = pool.filter(
        (x) => x.vehicle.id !== a.vehicle.id && !recent.includes(x.vehicle.id) && Math.abs(x.vehicle.years[0] - a.vehicle.years[0]) >= gap,
      );
      if (!partners.length) continue;
      const b = pick(partners, rng);
      const [left, right] = rng() < 0.5 ? [a, b] : [b, a];
      return {
        left: { vehicle: left.vehicle, photo: pick(left.photos, rng) },
        right: { vehicle: right.vehicle, photo: pick(right.photos, rng) },
        older: left.vehicle.years[0] < right.vehicle.years[0] ? 'left' : 'right',
        gap: Math.abs(left.vehicle.years[0] - right.vehicle.years[0]),
      };
    }
  }
  return null;
}

export function startTimeline(ctx: GameContext, rng: () => number): TimelineState {
  const duel = makeDuel(ctx, 0, [], rng);
  return { duel, lives: TIMELINE.lives, correct: 0, answered: 0, recent: duel ? [duel.left.vehicle.id, duel.right.vehicle.id] : [], over: !duel, last: null };
}

export function answerTimeline(s: TimelineState, picked: 'left' | 'right'): TimelineState {
  if (!s.duel || s.over || s.last) return s;
  const right = picked === s.duel.older;
  const lives = right ? s.lives : s.lives - 1;
  return { ...s, lives, correct: s.correct + (right ? 1 : 0), answered: s.answered + 1, over: lives <= 0, last: { picked, right } };
}

export function nextTimeline(ctx: GameContext, s: TimelineState, rng: () => number): TimelineState {
  if (s.over) return s;
  const duel = makeDuel(ctx, s.correct, s.recent, rng);
  if (!duel) return { ...s, over: true };
  const recent = [...s.recent, duel.left.vehicle.id, duel.right.vehicle.id].slice(-TIMELINE.recentWindow);
  return { ...s, duel, recent, last: null };
}
