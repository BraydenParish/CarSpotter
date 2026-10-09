/**
 * Game modes and themed challenges. Each mode has its own rules, length and
 * scoring context; personal bests are kept separately per mode, difficulty
 * and assistance (hints used or not).
 */
import type { Category, Setting } from '../data/types';
import type { Difficulty } from './scoring';

export type ModeId =
  | 'classic'
  | 'session'
  | 'timeattack'
  | 'survival'
  | 'daily'
  | 'theme'
  | 'detail'
  | 'practice'
  | 'party';

export interface ModeInfo {
  id: ModeId;
  name: string;
  tagline: string;
  rules: string[];
  /** Fixed number of rounds, or null for open-ended / timed / lives. */
  rounds: number | null;
  timed: boolean;
  lives: number | null;
  /** Whether personal bests are tracked for this mode. */
  ranked: boolean;
  /** Whether the start screen's photo filters apply. */
  usesFilters: boolean;
  difficulties: Difficulty[];
}

export const TIME_ATTACK = {
  startMs: 60_000,
  correctBonusMs: 3_000,
  wrongPenaltyMs: 3_000,
  skipPenaltyMs: 3_000,
  maxMs: 99_000,
};

export const SURVIVAL = { lives: 3, lifeEvery: 5 };

export const DAILY_ROUNDS = 5;
export const SESSION_ROUNDS = 10;
export const DETAIL_ROUNDS = 8;
export const PRACTICE_ROUNDS = 10;
export const PARTY = { minPlayers: 2, maxPlayers: 4, roundsEach: 5 };

export const MODES: Record<ModeId, ModeInfo> = {
  classic: {
    id: 'classic',
    name: 'Free Play',
    tagline: 'Relaxed, endless, no clock.',
    rules: [
      'Photos keep coming until you stop.',
      'Cars don’t repeat until you’ve seen every car in your filters.',
      'Your stats and garage update as you play.',
    ],
    rounds: null,
    timed: false,
    lives: null,
    ranked: false,
    usesFilters: true,
    difficulties: ['normal', 'hard', 'expert'],
  },
  session: {
    id: 'session',
    name: '10-Round Session',
    tagline: 'Ten cars. One score.',
    rules: [
      'Ten different cars (fewer if your filters allow fewer).',
      'Points: Normal 100 · Hard 200 · Expert 300 per car, plus streak bonus.',
      'Your best score is saved per difficulty.',
    ],
    rounds: SESSION_ROUNDS,
    timed: false,
    lives: null,
    ranked: true,
    usesFilters: true,
    difficulties: ['normal', 'hard', 'expert'],
  },
  timeattack: {
    id: 'timeattack',
    name: 'Time Attack',
    tagline: '60 seconds. Go fast.',
    rules: [
      'Start with 60 seconds on the clock.',
      'Correct: +3 s. Wrong or skip: −3 s.',
      'Answer within 3 s for up to +50% speed bonus.',
      'The clock pauses while a photo loads and during the reveal.',
    ],
    rounds: null,
    timed: true,
    lives: null,
    ranked: true,
    usesFilters: true,
    difficulties: ['normal', 'hard'],
  },
  survival: {
    id: 'survival',
    name: 'Survival',
    tagline: 'Three lives. How far can you go?',
    rules: [
      'You have 3 lives. A wrong answer or skip costs one.',
      'Every 5 correct in a row earns a life back (max 3).',
      'The run ends when you’re out of lives.',
    ],
    rounds: null,
    timed: false,
    lives: SURVIVAL.lives,
    ranked: true,
    usesFilters: true,
    difficulties: ['normal', 'hard', 'expert'],
  },
  daily: {
    id: 'daily',
    name: 'Daily Challenge',
    tagline: 'Same five cars for everyone today.',
    rules: [
      'Five cars, the same for every player on the same day.',
      'Resets at 00:00 UTC.',
      'One scored attempt per difficulty per day. Leaving early still counts as your attempt.',
      'Share your result without spoilers.',
    ],
    rounds: DAILY_ROUNDS,
    timed: false,
    lives: null,
    ranked: true,
    usesFilters: false,
    difficulties: ['normal', 'hard', 'expert'],
  },
  theme: {
    id: 'theme',
    name: 'Themed Challenge',
    tagline: 'A focused run through one corner of car culture.',
    rules: [
      'Up to ten cars from one theme.',
      'Same scoring as a session; bests saved per theme.',
    ],
    rounds: SESSION_ROUNDS,
    timed: false,
    lives: null,
    ranked: true,
    usesFilters: false,
    difficulties: ['normal', 'hard', 'expert'],
  },
  detail: {
    id: 'detail',
    name: 'Detail Challenge',
    tagline: 'Headlights, taillights, cabins. Name the car.',
    rules: [
      'Close-up crops and detail photos, never badges.',
      'Identify the make and model from the detail alone.',
      'Eight rounds (or as many details as are verified).',
    ],
    rounds: DETAIL_ROUNDS,
    timed: false,
    lives: null,
    ranked: true,
    usesFilters: false,
    difficulties: ['normal', 'hard'],
  },
  practice: {
    id: 'practice',
    name: 'Practice',
    tagline: 'Revisit the cars you missed.',
    rules: [
      'Only cars you’ve missed or skipped.',
      'Get a car right twice in practice to clear it from the list.',
      'Practice doesn’t affect your bests or main stats.',
    ],
    rounds: PRACTICE_ROUNDS,
    timed: false,
    lives: null,
    ranked: false,
    usesFilters: false,
    difficulties: ['normal', 'hard', 'expert'],
  },
  party: {
    id: 'party',
    name: 'Party (pass & play)',
    tagline: '2–4 players, one phone. Take turns.',
    rules: [
      'Each player gets five cars, taking turns on the same device.',
      'Every player answers a different car; nobody sees the same photo twice.',
      'Streak bonuses are per player. Highest score wins.',
      'Party games don’t change your own stats, garage or bests.',
    ],
    rounds: PARTY.roundsEach,
    timed: false,
    lives: null,
    ranked: false,
    usesFilters: true,
    difficulties: ['normal', 'hard', 'expert'],
  },
};

export interface Theme {
  id: string;
  name: string;
  description: string;
  category: Category;
}

/** Themes map to dataset categories; a theme is offered only if enough verified cars carry its tag. */
export const THEMES: Theme[] = [
  { id: 'everyday', name: 'Everyday Street', description: 'Cars you pass on the school run.', category: 'everyday' },
  { id: 'classic', name: 'Classics', description: 'Chrome, curves and carburettors.', category: 'classic' },
  { id: 'jdm', name: 'JDM Legends', description: 'Japan’s finest from the golden era and beyond.', category: 'jdm' },
  { id: 'muscle', name: 'Muscle', description: 'Big American V8 energy.', category: 'muscle' },
  { id: 'supercar', name: 'Supercars', description: 'Posters on bedroom walls.', category: 'supercar' },
  { id: 'european', name: 'European', description: 'From Paris to Zwickau.', category: 'european' },
  { id: 'offroad', name: 'Off-Road', description: 'Built for the rough stuff.', category: 'offroad' },
];

export const MIN_THEME_VEHICLES = 4;

export interface Filters {
  setting: 'all' | Setting;
  /** Empty = all categories. */
  categories: Category[];
}

export const DEFAULT_FILTERS: Filters = { setting: 'all', categories: [] };

export interface RunConfig {
  mode: ModeId;
  difficulty: Difficulty;
  filters: Filters;
  themeId?: string;
  /** Daily date key (YYYY-MM-DD, UTC). */
  dailyKey?: string;
  hintsEnabled: boolean;
  /** Party mode: player names in turn order (2–4). */
  players?: string[];
}

/** Personal-best key: separate per mode, theme, difficulty and assistance. */
export function bestKey(config: Pick<RunConfig, 'mode' | 'difficulty' | 'themeId' | 'filters'>, assisted: boolean): string {
  const scope = config.mode === 'theme' ? `theme:${config.themeId}` : config.mode;
  const filtered = MODES[config.mode].usesFilters && (config.filters.setting !== 'all' || config.filters.categories.length > 0);
  return `${scope}|${config.difficulty}|${assisted ? 'hints' : 'clean'}${filtered ? '|filtered' : ''}`;
}
