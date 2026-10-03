/**
 * Which modes can be played with the verified data (and why not, if not).
 * The start screen uses this so it never offers a mode that can't work.
 */
import type { GameContext } from './context';
import { distinctVehicles } from './deck';
import { DAILY_ROUNDS, MODES, type Filters, type ModeId } from './modes';
import { availableThemes, dailyPool, detailPhotos, fullPhotos, poolFor } from './pool';
import type { Difficulty } from './scoring';

export interface Availability {
  ok: boolean;
  reason?: string;
}

export const MIN_DETAIL_VEHICLES = 3;

export function modeAvailability(ctx: GameContext, mode: ModeId, practiceCount: number): Availability {
  const cars = distinctVehicles(fullPhotos(ctx.ds));
  if (!cars && mode !== 'detail') return { ok: false, reason: 'No verified photos yet' };
  switch (mode) {
    case 'daily':
      return distinctVehicles(dailyPool(ctx.ds)) >= DAILY_ROUNDS
        ? { ok: true }
        : { ok: false, reason: `Needs ${DAILY_ROUNDS} verified cars` };
    case 'theme':
      return availableThemes(ctx.ds).length ? { ok: true } : { ok: false, reason: 'Needs more verified cars per theme' };
    case 'detail':
      return distinctVehicles(detailPhotos(ctx.ds)) >= MIN_DETAIL_VEHICLES
        ? { ok: true }
        : { ok: false, reason: 'Needs verified detail crops' };
    case 'practice':
      return practiceCount ? { ok: true } : { ok: false, reason: 'Miss a car first — it will appear here' };
    case 'timeattack':
    case 'survival':
      return cars >= 2 ? { ok: true } : { ok: false, reason: 'Needs at least 2 verified cars' };
    default:
      return { ok: true };
  }
}

/** Number of distinct cars a setup would draw from (0 = cannot start). */
export function setupPoolSize(
  ctx: GameContext,
  mode: ModeId,
  difficulty: Difficulty,
  filters: Filters,
  themeId: string | undefined,
  practiceVehicles: string[],
): number {
  if (!MODES[mode].difficulties.includes(difficulty)) return 0;
  return distinctVehicles(poolFor(ctx.ds, { mode, difficulty, filters, themeId, hintsEnabled: true }, practiceVehicles));
}

/** Settings and categories that actually occur in the verified photos, with car counts. */
export function filterOptions(ctx: GameContext) {
  const full = fullPhotos(ctx.ds);
  const settings = (['street', 'studio', 'other'] as const)
    .map((s) => ({ value: s, cars: distinctVehicles(full.filter((p) => p.setting === s)) }))
    .filter((s) => s.cars > 0);
  const counts = new Map<string, Set<string>>();
  for (const p of full) {
    for (const c of ctx.ds.vehicleById.get(p.vehicleId)!.categories) {
      if (!counts.has(c)) counts.set(c, new Set());
      counts.get(c)!.add(p.vehicleId);
    }
  }
  const categories = [...counts.entries()]
    .map(([value, set]) => ({ value, cars: set.size }))
    .sort((a, b) => b.cars - a.cars || a.value.localeCompare(b.value));
  return { settings, categories };
}
