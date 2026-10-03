/**
 * Eligible photo pools for each mode. Only photos with review.status ===
 * "approved" are ever used in gameplay.
 */
import type { Photo, Vehicle } from '../data/types';
import type { Difficulty } from './scoring';
import { isExpertEligible } from './expert';
import { DAILY_ROUNDS, MIN_THEME_VEHICLES, THEMES, type Filters, type RunConfig } from './modes';
import { distinctVehicles } from './deck';
import { seededRng, shuffle } from './rng';

export interface Dataset {
  vehicles: Vehicle[];
  photos: Photo[];
  vehicleById: Map<string, Vehicle>;
}

export function makeDataset(vehicles: Vehicle[], photos: Photo[]): Dataset {
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
  const approved = photos.filter((p) => p.review.status === 'approved' && vehicleById.has(p.vehicleId));
  return { vehicles, photos: approved, vehicleById };
}

export function fullPhotos(ds: Dataset): Photo[] {
  return ds.photos.filter((p) => p.kind === 'full');
}

export function detailPhotos(ds: Dataset): Photo[] {
  return ds.photos.filter((p) => p.kind === 'detail');
}

export function applyDifficulty(ds: Dataset, photos: Photo[], difficulty: Difficulty): Photo[] {
  if (difficulty !== 'expert') return photos;
  return photos.filter((p) => isExpertEligible(p, ds.vehicleById.get(p.vehicleId)!));
}

export function applyFilters(ds: Dataset, photos: Photo[], filters: Filters): Photo[] {
  return photos.filter((p) => {
    if (filters.setting !== 'all' && p.setting !== filters.setting) return false;
    if (filters.categories.length) {
      const v = ds.vehicleById.get(p.vehicleId)!;
      if (!filters.categories.some((c) => v.categories.includes(c))) return false;
    }
    return true;
  });
}

export function themePhotos(ds: Dataset, themeId: string): Photo[] {
  const theme = THEMES.find((t) => t.id === themeId);
  if (!theme) return [];
  return fullPhotos(ds).filter((p) => ds.vehicleById.get(p.vehicleId)!.categories.includes(theme.category));
}

/** Themes with enough verified cars to be playable. */
export function availableThemes(ds: Dataset) {
  return THEMES.map((t) => ({ theme: t, vehicles: distinctVehicles(themePhotos(ds, t.id)) })).filter(
    (t) => t.vehicles >= MIN_THEME_VEHICLES,
  );
}

/** Pool for a run (practice pools are built by the caller from the mistakes list). */
export function poolFor(ds: Dataset, config: RunConfig, practiceVehicles: string[] = []): Photo[] {
  let base: Photo[];
  switch (config.mode) {
    case 'detail':
      base = detailPhotos(ds);
      break;
    case 'theme':
      base = themePhotos(ds, config.themeId ?? '');
      break;
    case 'daily':
      base = dailyPool(ds);
      break;
    case 'practice': {
      const set = new Set(practiceVehicles);
      base = fullPhotos(ds).filter((p) => set.has(p.vehicleId));
      break;
    }
    default:
      base = applyFilters(ds, fullPhotos(ds), config.filters);
  }
  return applyDifficulty(ds, base, config.difficulty);
}

/* ------------------------------------------------------------------ */
/* Daily challenge                                                     */
/* ------------------------------------------------------------------ */

/** Daily key: the calendar date in UTC. The challenge resets at 00:00 UTC. */
export function dailyKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function msUntilDailyReset(now: Date = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return next - now.getTime();
}

/**
 * Daily pool: Expert-eligible full photos when there are enough distinct cars,
 * so every difficulty plays the same five cars.
 */
export function dailyPool(ds: Dataset): Photo[] {
  const full = fullPhotos(ds);
  const expert = full.filter((p) => isExpertEligible(p, ds.vehicleById.get(p.vehicleId)!));
  return distinctVehicles(expert) >= DAILY_ROUNDS ? expert : full;
}

/** Deterministic daily selection: same date + same dataset → same photos, in the same order. */
export function dailyPhotos(ds: Dataset, key: string): Photo[] {
  const pool = dailyPool(ds).slice().sort((a, b) => a.id.localeCompare(b.id));
  const rng = seededRng(`carspotter-daily:${key}`);
  const vehicles = shuffle([...new Set(pool.map((p) => p.vehicleId))].sort(), rng).slice(0, DAILY_ROUNDS);
  return vehicles.map((vid) => {
    const options = pool.filter((p) => p.vehicleId === vid);
    return options[Math.floor(rng() * options.length)];
  });
}
