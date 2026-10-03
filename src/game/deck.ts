/**
 * Repeat prevention. Cars (vehicles, not just photos) are drawn without
 * replacement: no vehicle repeats until every vehicle in the eligible pool has
 * been shown. Within a vehicle, the least-recently-seen photo is used.
 * The state is persisted so a new session continues the cycle.
 */
import type { Photo } from '../data/types';
import { pick, type Rng } from './rng';

export interface SeenState {
  /** Vehicle ids shown in the current cycle. */
  cycle: string[];
  /** photo id → counter value when last shown */
  photoLast: Record<string, number>;
  counter: number;
  lastVehicle: string | null;
}

export const emptySeen = (): SeenState => ({ cycle: [], photoLast: {}, counter: 0, lastVehicle: null });

export interface DrawOptions {
  /** Vehicles already used in this run (never repeated while alternatives remain). */
  runUsed?: Set<string>;
  /** Photos that must not be drawn (e.g. failed to load). */
  excludePhotos?: Set<string>;
}

export interface DrawResult {
  photo: Photo;
  seen: SeenState;
  /** True when the run has used every vehicle and had to repeat one. */
  repeated: boolean;
}

export function drawPhoto(pool: Photo[], seen: SeenState, rng: Rng, opts: DrawOptions = {}): DrawResult | null {
  const usable = pool.filter((p) => !opts.excludePhotos?.has(p.id));
  if (!usable.length) return null;
  const byVehicle = new Map<string, Photo[]>();
  for (const p of usable) {
    const list = byVehicle.get(p.vehicleId) ?? [];
    list.push(p);
    byVehicle.set(p.vehicleId, list);
  }
  const vehicles = [...byVehicle.keys()].sort();
  const runUsed = opts.runUsed ?? new Set<string>();
  const cycle = new Set(seen.cycle);
  let repeated = false;

  let candidates = vehicles.filter((v) => !cycle.has(v) && !runUsed.has(v));
  if (!candidates.length) {
    // Cycle exhausted for this pool: start a new cycle for these vehicles.
    for (const v of vehicles) cycle.delete(v);
    candidates = vehicles.filter((v) => !runUsed.has(v) && v !== seen.lastVehicle);
    if (!candidates.length) candidates = vehicles.filter((v) => !runUsed.has(v));
  }
  if (!candidates.length) {
    // The run itself has used every vehicle (endless modes): allow repeats, but not back-to-back.
    repeated = true;
    candidates = vehicles.length > 1 ? vehicles.filter((v) => v !== seen.lastVehicle) : vehicles;
  }
  const vehicleId = pick(candidates, rng);
  const photos = byVehicle.get(vehicleId)!;
  const oldest = Math.min(...photos.map((p) => seen.photoLast[p.id] ?? -1));
  const photo = pick(
    photos.filter((p) => (seen.photoLast[p.id] ?? -1) === oldest),
    rng,
  );
  cycle.add(vehicleId);
  const counter = seen.counter + 1;
  return {
    photo,
    repeated,
    seen: {
      cycle: [...cycle],
      photoLast: { ...seen.photoLast, [photo.id]: counter },
      counter,
      lastVehicle: vehicleId,
    },
  };
}

/** Number of distinct vehicles in a pool. */
export function distinctVehicles(pool: Photo[]): number {
  return new Set(pool.map((p) => p.vehicleId)).size;
}
