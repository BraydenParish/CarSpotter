/**
 * Loads the curated manifest. Only photos whose review status is "approved"
 * (and whose vehicle exists) ever reach gameplay; see makeDataset().
 */
import type { Photo, Vehicle } from './types';
import vehiclesJson from './vehicles.json';
import { EXTRA_MODEL_NAMES, LEXICON, MAKE_ALIASES } from './lexicon';
import { buildNameIndex } from '../game/matching';
import { makeDataset } from '../game/pool';
import type { GameContext } from '../game/context';

export const VEHICLES = vehiclesJson as unknown as Vehicle[];
/** The curated photo manifest. Loaded on demand so it ships as its own cached chunk, not in the app bundle. */
export async function loadPhotos(): Promise<Photo[]> {
  return (await import('./photos.json')).default as unknown as Photo[];
}

export function createContext(vehicles: Vehicle[] = VEHICLES, photos: Photo[] = []): GameContext {
  const ds = makeDataset(vehicles, photos);
  const lexiconMakes = [...new Set(LEXICON.map((c) => c.make))];
  const modelNames = [...LEXICON.map((c) => c.model), ...EXTRA_MODEL_NAMES];
  const index = buildNameIndex(MAKE_ALIASES, lexiconMakes, modelNames, vehicles);
  return { ds, index, lexicon: LEXICON, makeAliases: MAKE_ALIASES };
}
