import type { LexiconCar } from '../data/lexicon';
import type { NameIndex } from './matching';
import type { Dataset } from './pool';

/** Everything the pure game logic needs about the data set. */
export interface GameContext {
  ds: Dataset;
  index: NameIndex;
  lexicon: LexiconCar[];
  makeAliases: Record<string, string[]>;
}
