import type { GameContext } from '../game/context';
import { createContext, loadPhotos, VEHICLES } from './dataset';

/**
 * Builds the game context. The synthetic test fixtures are available ONLY on the
 * dev server with `?fixtures` in the URL; `import.meta.env.DEV` is a compile-time
 * constant, so production builds drop the fixture module entirely.
 */
export async function bootContext(): Promise<{ ctx: GameContext; fixtures: boolean }> {
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('fixtures')) {
    const { fixturePhotos, fixtureDetails } = await import('../dev/fixtures');
    return { ctx: createContext(VEHICLES, [...fixturePhotos(VEHICLES), ...fixtureDetails(VEHICLES)]), fixtures: true };
  }
  return { ctx: createContext(VEHICLES, await loadPhotos()), fixtures: false };
}
