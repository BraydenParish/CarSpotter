/**
 * Achievements. Each one declares whether the current verified data set can
 * support it, so the game never advertises an achievement that can't be earned.
 */
import type { GameContext } from './context';
import type { RunState } from './engine';
import { summarize } from './engine';
import { distinctVehicles } from './deck';
import { isExpertEligible } from './expert';
import { DAILY_ROUNDS, SESSION_ROUNDS } from './modes';
import { availableThemes, detailPhotos, fullPhotos } from './pool';
import type { Profile } from './progress';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Can this be earned with the current data? */
  available: (ctx: GameContext) => boolean;
  /** Checked after every round and at run end. `run` is the run in progress (if any). */
  earned: (p: Profile, ctx: GameContext, run: RunState | null) => boolean;
}

const totalCorrect = (p: Profile) =>
  p.stats.byDifficulty.normal.correct + p.stats.byDifficulty.hard.correct + p.stats.byDifficulty.expert.correct;
const bestStreak = (p: Profile) => Math.max(...Object.values(p.stats.bestStreak));
const garageSize = (p: Profile) => Object.keys(p.garage).length;
const vehicleCount = (ctx: GameContext) => distinctVehicles(fullPhotos(ctx.ds));
const finished = (run: RunState | null) => !!run && run.phase === 'finished' && run.endReason !== 'quit';
const runCorrect = (run: RunState | null) => (run ? run.results.filter((r) => r.outcome === 'correct').length : 0);
const always = () => true;

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first-spot',
    name: 'First Spot',
    description: 'Identify your first car.',
    icon: '🔍',
    available: (ctx) => vehicleCount(ctx) > 0,
    earned: (p) => totalCorrect(p) >= 1,
  },
  {
    id: 'streak-5',
    name: 'On a Roll',
    description: 'Get 5 correct in a row.',
    icon: '🔥',
    available: (ctx) => vehicleCount(ctx) >= 5,
    earned: (p) => bestStreak(p) >= 5,
  },
  {
    id: 'streak-10',
    name: 'Unstoppable',
    description: 'Get 10 correct in a row.',
    icon: '⚡',
    available: (ctx) => vehicleCount(ctx) >= 5,
    earned: (p) => bestStreak(p) >= 10,
  },
  {
    id: 'streak-25',
    name: 'Photographic Memory',
    description: 'Get 25 correct in a row.',
    icon: '🧠',
    available: (ctx) => vehicleCount(ctx) >= 5,
    earned: (p) => bestStreak(p) >= 25,
  },
  {
    id: 'perfect-session',
    name: 'Perfect Ten',
    description: `Finish a ${SESSION_ROUNDS}-round session without a miss.`,
    icon: '🏁',
    available: (ctx) => vehicleCount(ctx) >= SESSION_ROUNDS,
    earned: (_p, _c, run) =>
      finished(run) && run!.config.mode === 'session' && run!.results.length >= SESSION_ROUNDS && summarize(run!).perfect,
  },
  {
    id: 'clean-sweep',
    name: 'No Help Needed',
    description: 'Finish a perfect 10-round session on Hard or Expert without hints.',
    icon: '🎯',
    available: (ctx) => vehicleCount(ctx) >= SESSION_ROUNDS,
    earned: (_p, _c, run) =>
      finished(run) &&
      run!.config.mode === 'session' &&
      run!.config.difficulty !== 'normal' &&
      run!.results.length >= SESSION_ROUNDS &&
      summarize(run!).perfect &&
      !run!.assisted,
  },
  {
    id: 'typist',
    name: 'Fluent',
    description: 'Identify 25 cars on Hard or Expert.',
    icon: '⌨️',
    available: (ctx) => vehicleCount(ctx) > 0,
    earned: (p) => p.stats.byDifficulty.hard.correct + p.stats.byDifficulty.expert.correct >= 25,
  },
  {
    id: 'expert-first',
    name: 'Connoisseur',
    description: 'Get a fully correct Expert answer.',
    icon: '🎩',
    available: (ctx) => ctx.ds.photos.some((ph) => isExpertEligible(ph, ctx.ds.vehicleById.get(ph.vehicleId)!)),
    earned: (p) => p.stats.byDifficulty.expert.correct >= 1,
  },
  {
    id: 'expert-exact',
    name: 'Year Perfect',
    description: 'Name an exact model year in Expert.',
    icon: '📅',
    available: (ctx) =>
      ctx.ds.photos.some(
        (ph) => ph.supports.year && ph.modelYear.from === ph.modelYear.to && isExpertEligible(ph, ctx.ds.vehicleById.get(ph.vehicleId)!),
      ),
    earned: (p) => p.stats.exactYears >= 1,
  },
  {
    id: 'century',
    name: 'Century',
    description: 'Identify 100 cars in total.',
    icon: '💯',
    available: (ctx) => vehicleCount(ctx) > 0,
    earned: (p) => totalCorrect(p) >= 100,
  },
  {
    id: 'garage-10',
    name: 'Collector',
    description: 'Add 10 different cars to your garage.',
    icon: '🚗',
    available: (ctx) => vehicleCount(ctx) >= 10,
    earned: (p) => garageSize(p) >= 10,
  },
  {
    id: 'garage-full',
    name: 'Full Garage',
    description: 'Identify every car in the collection at least once.',
    icon: '🏆',
    available: (ctx) => vehicleCount(ctx) >= 2,
    earned: (p, ctx) => {
      const ids = new Set(fullPhotos(ctx.ds).map((ph) => ph.vehicleId));
      return ids.size > 0 && [...ids].every((id) => p.garage[id]);
    },
  },
  {
    id: 'garage-expert',
    name: 'Encyclopaedic',
    description: 'Identify 10 different cars on Expert.',
    icon: '📚',
    available: (ctx) =>
      distinctVehicles(ctx.ds.photos.filter((ph) => isExpertEligible(ph, ctx.ds.vehicleById.get(ph.vehicleId)!))) >= 10,
    earned: (p) => Object.values(p.garage).filter((g) => g.best === 'expert').length >= 10,
  },
  {
    id: 'globetrotter',
    name: 'Globetrotter',
    description: 'Identify cars from 5 different countries.',
    icon: '🌍',
    available: (ctx) => new Set(fullPhotos(ctx.ds).map((ph) => ctx.ds.vehicleById.get(ph.vehicleId)!.country)).size >= 5,
    earned: (p) => p.stats.countries.length >= 5,
  },
  {
    id: 'time-traveller',
    name: 'Time Traveller',
    description: 'Identify cars from 5 different decades.',
    icon: '⏳',
    available: (ctx) => new Set(fullPhotos(ctx.ds).map((ph) => Math.floor(ph.modelYear.from / 10))).size >= 5,
    earned: (p) => p.stats.decades.length >= 5,
  },
  {
    id: 'time-attack-10',
    name: 'Quick Draw',
    description: 'Get 10 correct in a single Time Attack.',
    icon: '⏱️',
    available: (ctx) => vehicleCount(ctx) >= 2,
    earned: (_p, _c, run) => !!run && run.config.mode === 'timeattack' && runCorrect(run) >= 10,
  },
  {
    id: 'time-attack-20',
    name: 'Speed Demon',
    description: 'Get 20 correct in a single Time Attack.',
    icon: '🏎️',
    available: (ctx) => vehicleCount(ctx) >= 2,
    earned: (_p, _c, run) => !!run && run.config.mode === 'timeattack' && runCorrect(run) >= 20,
  },
  {
    id: 'survivor-15',
    name: 'Survivor',
    description: 'Reach 15 correct in a single Survival run.',
    icon: '❤️',
    available: (ctx) => vehicleCount(ctx) >= 2,
    earned: (_p, _c, run) => !!run && run.config.mode === 'survival' && runCorrect(run) >= 15,
  },
  {
    id: 'daily-first',
    name: 'Daily Driver',
    description: 'Complete a Daily Challenge.',
    icon: '📆',
    available: (ctx) => vehicleCount(ctx) >= DAILY_ROUNDS,
    earned: (p) => Object.keys(p.daily).length >= 1,
  },
  {
    id: 'daily-streak-3',
    name: 'Commuter',
    description: 'Play the Daily Challenge 3 days in a row.',
    icon: '🗓️',
    available: (ctx) => vehicleCount(ctx) >= DAILY_ROUNDS,
    earned: (p) => p.dailyStreak.best >= 3,
  },
  {
    id: 'daily-streak-7',
    name: 'Daily Habit',
    description: 'Play the Daily Challenge 7 days in a row.',
    icon: '📅',
    available: (ctx) => vehicleCount(ctx) >= DAILY_ROUNDS,
    earned: (p) => p.dailyStreak.best >= 7,
  },
  {
    id: 'theme-perfect',
    name: 'Specialist',
    description: 'Finish a Themed Challenge without a miss.',
    icon: '🎨',
    available: (ctx) => availableThemes(ctx.ds).length > 0,
    earned: (_p, _c, run) => finished(run) && run!.config.mode === 'theme' && summarize(run!).perfect,
  },
  {
    id: 'detail-eye',
    name: 'Eye for Detail',
    description: 'Identify 5 cars from close-up details.',
    icon: '🔦',
    available: (ctx) => distinctVehicles(detailPhotos(ctx.ds)) >= 2,
    earned: (p) => p.stats.detailCorrect >= 5,
  },
  {
    id: 'practice-clear',
    name: 'Lesson Learned',
    description: 'Clear a car from your practice list.',
    icon: '✅',
    available: (ctx) => vehicleCount(ctx) > 0,
    earned: (p) => p.stats.practiceCleared >= 1,
  },
  {
    id: 'level-5',
    name: 'Gearhead',
    description: 'Reach level 5.',
    icon: '⚙️',
    available: always,
    earned: (p) => p.xp >= 150 * 5 * 4,
  },
];

export function availableAchievements(ctx: GameContext): Achievement[] {
  return ACHIEVEMENTS.filter((a) => a.available(ctx));
}

/** Newly earned achievements (not yet in the profile), with the profile updated. */
export function checkAchievements(
  p: Profile,
  ctx: GameContext,
  run: RunState | null,
  now: Date = new Date(),
): { profile: Profile; unlocked: Achievement[] } {
  const unlocked = availableAchievements(ctx).filter((a) => !p.achievements[a.id] && a.earned(p, ctx, run));
  if (!unlocked.length) return { profile: p, unlocked };
  const achievements = { ...p.achievements };
  for (const a of unlocked) achievements[a.id] = now.toISOString();
  return { profile: { ...p, achievements }, unlocked };
}
