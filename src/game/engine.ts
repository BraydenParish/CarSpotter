/**
 * Run engine: a pure state machine for one play-through of any mode.
 *
 *   loading ──photoLoaded──▶ question ──submit/skip──▶ reveal ──next──▶ loading … ▶ finished
 *                │                                               │
 *                └──photoFailed (replaced, never scored)          └──end conditions
 *
 * All functions return new state objects; the UI owns timers and storage.
 * Time is passed in explicitly (`now`) so the logic is deterministic in tests.
 */
import type { Photo, Vehicle } from '../data/types';
import type { GameContext } from './context';
import { drawPhoto, distinctVehicles, emptySeen, type SeenState } from './deck';
import { buildChoices, type Choice } from './distractors';
import { expertField, type ExpertField } from './expert';
import { checkChoice, checkTyped, type CheckResult, type TypedAnswer } from './check';
import type { FieldResult } from './matching';
import { MODES, PARTY, SURVIVAL, TIME_ATTACK, type RunConfig } from './modes';
import { dailyPhotos, poolFor } from './pool';
import type { Rng } from './rng';
import { MAX_HINTS, scoreRound, type ScoreBreakdown } from './scoring';

export type Phase = 'loading' | 'question' | 'reveal' | 'finished';
export type Outcome = 'correct' | 'partial' | 'wrong' | 'skipped';
export type EndReason = 'complete' | 'time' | 'lives' | 'quit' | 'exhausted';

export interface Question {
  /** 1-based round number. */
  n: number;
  photo: Photo;
  vehicle: Vehicle;
  choices: Choice[] | null;
  expertField: ExpertField | null;
}

export interface RoundResult {
  n: number;
  photoId: string;
  vehicleId: string;
  outcome: Outcome;
  points: number;
  breakdown: ScoreBreakdown | null;
  hintsUsed: number;
  answerMs: number | null;
  fields: Record<string, FieldResult> | null;
  expertField: ExpertField | null;
  streakAfter: number;
  /** Time Attack clock change (ms). */
  clockDelta: number;
  /** Survival lives change. */
  lifeDelta: number;
  /** Party mode: index of the player who answered. */
  player?: number;
}

export interface RunState {
  config: RunConfig;
  pool: Photo[];
  /** Predetermined photo order (daily challenge). */
  fixed: Photo[] | null;
  fixedCursor: number;
  /** Rounds in this run, or null for open-ended modes. */
  totalRounds: number | null;
  phase: Phase;
  question: Question | null;
  /** Next question, drawn ahead so its photo can be preloaded. */
  upcoming: Question | null;
  seen: SeenState;
  /** Deck state and daily cursor that apply once `upcoming` becomes current. */
  upcomingMeta: { seen: SeenState; fixedCursor: number } | null;
  runUsed: string[];
  failedPhotos: string[];
  hintsUsed: number;
  shownAt: number | null;
  results: RoundResult[];
  score: number;
  streak: number;
  bestStreak: number;
  lives: number | null;
  /** Time Attack: remaining ms as of the last pause. */
  clockMs: number | null;
  /** Time Attack: when the clock was last resumed (null = paused). */
  clockStartedAt: number | null;
  endReason: EndReason | null;
  /** Any hint used in this run (scores are kept separately for assisted runs). */
  assisted: boolean;
  startedAt: number;
}

export type CreateRunResult =
  | { ok: true; state: RunState }
  | { ok: false; reason: 'empty-pool' | 'no-practice' };

export interface CreateRunOptions {
  seen?: SeenState;
  practiceVehicles?: string[];
  now: number;
  rng: Rng;
}

function makeQuestion(ctx: GameContext, photo: Photo, n: number, config: RunConfig, rng: Rng): Question {
  const vehicle = ctx.ds.vehicleById.get(photo.vehicleId)!;
  return {
    n,
    photo,
    vehicle,
    choices: config.difficulty === 'normal' ? buildChoices(vehicle, ctx.ds.vehicles, ctx.lexicon, rng) : null,
    expertField: config.difficulty === 'expert' ? expertField(photo, vehicle) : null,
  };
}

interface Drawn {
  question: Question;
  seen: SeenState;
  fixedCursor: number;
}

/** Draw the question for round n without mutating state. */
function drawQuestion(
  ctx: GameContext,
  s: Pick<RunState, 'config' | 'pool' | 'fixed' | 'fixedCursor' | 'runUsed' | 'failedPhotos'>,
  seen: SeenState,
  n: number,
  rng: Rng,
  alsoExcludeVehicle?: string,
): Drawn | null {
  const failed = new Set(s.failedPhotos);
  if (s.fixed) {
    let cursor = s.fixedCursor;
    while (cursor < s.fixed.length && failed.has(s.fixed[cursor].id)) cursor++;
    if (cursor >= s.fixed.length) return null;
    return { question: makeQuestion(ctx, s.fixed[cursor], n, s.config, rng), seen, fixedCursor: cursor + 1 };
  }
  // Fixed-length modes never repeat a car within the run. Endless modes rely on
  // the persistent deck cycle instead, so repeats only happen once every car
  // in the pool has been shown.
  const endless = MODES[s.config.mode].rounds === null;
  const runUsed = new Set(endless ? [] : s.runUsed);
  if (alsoExcludeVehicle) runUsed.add(alsoExcludeVehicle);
  const pool = endless ? s.pool : s.pool.filter((p) => !runUsed.has(p.vehicleId));
  const res = drawPhoto(pool, seen, rng, { runUsed, excludePhotos: failed });
  if (!res) return null;
  return { question: makeQuestion(ctx, res.photo, n, s.config, rng), seen: res.seen, fixedCursor: s.fixedCursor };
}

export function createRun(ctx: GameContext, config: RunConfig, opts: CreateRunOptions): CreateRunResult {
  const mode = MODES[config.mode];
  if (config.mode === 'practice' && !(opts.practiceVehicles ?? []).length) return { ok: false, reason: 'no-practice' };
  let fixed: Photo[] | null = null;
  let pool: Photo[];
  if (config.mode === 'daily') {
    const eligible = new Set(poolFor(ctx.ds, config).map((p) => p.id));
    fixed = dailyPhotos(ctx.ds, config.dailyKey ?? '').filter((p) => eligible.has(p.id));
    pool = fixed;
  } else {
    pool = poolFor(ctx.ds, config, opts.practiceVehicles);
  }
  if (!pool.length) return { ok: false, reason: 'empty-pool' };
  let totalRounds = fixed ? fixed.length : mode.rounds === null ? null : Math.min(mode.rounds, distinctVehicles(pool));
  if (config.mode === 'party') {
    // Everyone gets the same number of turns, and no car repeats within the game.
    const players = partyPlayers(config).length;
    const each = Math.min(PARTY.roundsEach, Math.floor(distinctVehicles(pool) / players));
    if (each < 1) return { ok: false, reason: 'empty-pool' };
    totalRounds = each * players;
  }

  const base: RunState = {
    config,
    pool,
    fixed,
    fixedCursor: 0,
    totalRounds,
    phase: 'loading',
    question: null,
    upcoming: null,
    seen: opts.seen ?? emptySeen(),
    upcomingMeta: null,
    runUsed: [],
    failedPhotos: [],
    hintsUsed: 0,
    shownAt: null,
    results: [],
    score: 0,
    streak: 0,
    bestStreak: 0,
    lives: mode.lives,
    clockMs: mode.timed ? TIME_ATTACK.startMs : null,
    clockStartedAt: null,
    endReason: null,
    assisted: false,
    startedAt: opts.now,
  };
  const first = drawQuestion(ctx, base, base.seen, 1, opts.rng);
  if (!first) return { ok: false, reason: 'empty-pool' };
  const state: RunState = {
    ...base,
    question: first.question,
    seen: first.seen,
    fixedCursor: first.fixedCursor,
    runUsed: [first.question.vehicle.id],
  };
  return { ok: true, state: withUpcoming(ctx, state, opts.rng) };
}

/** Pre-draw the next question (if the run will have one). */
function withUpcoming(ctx: GameContext, s: RunState, rng: Rng): RunState {
  const n = (s.question?.n ?? 0) + 1;
  if (s.totalRounds !== null && n > s.totalRounds) return { ...s, upcoming: null, upcomingMeta: null };
  const d = drawQuestion(ctx, s, s.seen, n, rng, s.question?.vehicle.id);
  return { ...s, upcoming: d?.question ?? null, upcomingMeta: d ? { seen: d.seen, fixedCursor: d.fixedCursor } : null };
}

/* ------------------------------------------------------------------ */
/* Clock (Time Attack)                                                 */
/* ------------------------------------------------------------------ */

export function remainingMs(s: RunState, now: number): number | null {
  if (s.clockMs === null) return null;
  if (s.clockStartedAt === null) return Math.max(0, s.clockMs);
  return Math.max(0, s.clockMs - (now - s.clockStartedAt));
}

function pauseClock(s: RunState, now: number): RunState {
  if (s.clockMs === null || s.clockStartedAt === null) return s;
  return { ...s, clockMs: remainingMs(s, now), clockStartedAt: null };
}

function resumeClock(s: RunState, now: number): RunState {
  if (s.clockMs === null || s.clockStartedAt !== null) return s;
  return { ...s, clockStartedAt: now };
}

/** Call periodically while a timed question is showing; ends the run when time is up. */
export function tick(s: RunState, now: number): RunState {
  if (s.clockMs === null || s.phase !== 'question') return s;
  if ((remainingMs(s, now) ?? 1) > 0) return s;
  return { ...pauseClock(s, now), clockMs: 0, phase: 'finished', endReason: 'time', upcoming: null, upcomingMeta: null };
}

/* ------------------------------------------------------------------ */
/* Photo lifecycle                                                     */
/* ------------------------------------------------------------------ */

export function photoLoaded(s: RunState, now: number): RunState {
  if (s.phase !== 'loading') return s;
  return resumeClock({ ...s, phase: 'question', shownAt: now }, now);
}

/**
 * The current photo failed to load: exclude it and replace it with another,
 * without scoring anything. If nothing else is available the run ends.
 */
export function photoFailed(ctx: GameContext, s: RunState, rng: Rng, now: number): RunState {
  if (!s.question || (s.phase !== 'loading' && s.phase !== 'question')) return s;
  const failedId = s.question.photo.id;
  const n = s.question.n;
  const failedPhotos = [...s.failedPhotos, failedId];
  const runUsed = s.runUsed.filter((v) => v !== s.question!.vehicle.id);
  const totalRounds = s.fixed && s.totalRounds !== null ? s.totalRounds - 1 : s.totalRounds;
  let next: RunState = { ...s, failedPhotos, runUsed, totalRounds, hintsUsed: 0, shownAt: null, phase: 'loading' };
  next = pauseClock(next, now);
  // Prefer the pre-drawn question if it isn't the failed photo.
  let replacement: Drawn | null = null;
  if (s.upcoming && s.upcoming.photo.id !== failedId && s.upcomingMeta) {
    replacement = { question: { ...s.upcoming, n }, ...s.upcomingMeta };
  } else {
    replacement = drawQuestion(ctx, next, s.seen, n, rng);
  }
  if (!replacement || (totalRounds !== null && n > totalRounds)) {
    return { ...next, question: null, upcoming: null, phase: 'finished', endReason: s.results.length ? 'complete' : 'exhausted' };
  }
  next = {
    ...next,
    question: replacement.question,
    seen: replacement.seen,
    fixedCursor: replacement.fixedCursor,
    runUsed: [...runUsed, replacement.question.vehicle.id],
  };
  return withUpcoming(ctx, next, rng);
}

/* ------------------------------------------------------------------ */
/* Answers                                                             */
/* ------------------------------------------------------------------ */

export function useHint(s: RunState): RunState {
  if (s.phase !== 'question' || !s.config.hintsEnabled || s.hintsUsed >= MAX_HINTS) return s;
  return { ...s, hintsUsed: s.hintsUsed + 1, assisted: true };
}

function settle(s: RunState, check: CheckResult | null, skipped: boolean, now: number): RunState {
  const q = s.question!;
  const answerMs = s.shownAt !== null ? now - s.shownAt : null;
  const fully = !skipped && !!check?.fullyCorrect;
  const player = s.config.mode === 'party' ? partyPlayerIndex(s.config, q.n) : undefined;
  // Party streaks are per player: continue from that player's previous turn.
  const streakBefore = player === undefined ? s.streak : (lastResultOf(s, player)?.streakAfter ?? 0);
  const streakAfter = fully ? streakBefore + 1 : 0;
  const mode = MODES[s.config.mode];
  const breakdown = check
    ? scoreRound({
        difficulty: s.config.difficulty,
        hintsUsed: s.hintsUsed,
        fields: check.scoreFields,
        streakAfter,
        answerMs: answerMs ?? undefined,
        timed: mode.timed,
      })
    : null;
  const points = breakdown?.points ?? 0;
  const outcome: Outcome = skipped ? 'skipped' : fully ? 'correct' : points > 0 ? 'partial' : 'wrong';

  let next = pauseClock(s, now);
  let clockDelta = 0;
  if (next.clockMs !== null) {
    clockDelta = fully ? TIME_ATTACK.correctBonusMs : -(skipped ? TIME_ATTACK.skipPenaltyMs : TIME_ATTACK.wrongPenaltyMs);
    const before = next.clockMs;
    const after = Math.max(0, Math.min(TIME_ATTACK.maxMs, before + clockDelta));
    clockDelta = after - before;
    next = { ...next, clockMs: after };
  }
  let lifeDelta = 0;
  if (next.lives !== null) {
    if (!fully) lifeDelta = -1;
    else if (streakAfter % SURVIVAL.lifeEvery === 0 && next.lives < SURVIVAL.lives) lifeDelta = 1;
    next = { ...next, lives: next.lives + lifeDelta };
  }
  const result: RoundResult = {
    n: q.n,
    photoId: q.photo.id,
    vehicleId: q.vehicle.id,
    outcome,
    points,
    breakdown,
    hintsUsed: s.hintsUsed,
    answerMs,
    fields: check?.fields ?? null,
    expertField: q.expertField,
    streakAfter,
    clockDelta,
    lifeDelta,
    ...(player === undefined ? {} : { player }),
  };
  return {
    ...next,
    phase: 'reveal',
    results: [...s.results, result],
    score: s.score + points,
    streak: streakAfter,
    bestStreak: Math.max(s.bestStreak, streakAfter),
  };
}

export function submitChoice(s: RunState, key: string, now: number): RunState {
  if (s.phase !== 'question' || !s.question?.choices) return s;
  return settle(s, checkChoice(s.question.choices, key), false, now);
}

export function submitTyped(ctx: GameContext, s: RunState, answer: TypedAnswer, now: number): RunState {
  if (s.phase !== 'question' || !s.question || s.config.difficulty === 'normal') return s;
  const q = s.question;
  return settle(s, checkTyped(ctx, q.photo, q.vehicle, s.config.difficulty, answer, q.expertField), false, now);
}

export function skip(s: RunState, now: number): RunState {
  if (s.phase !== 'question') return s;
  return settle(s, null, true, now);
}

/* ------------------------------------------------------------------ */
/* Progression                                                         */
/* ------------------------------------------------------------------ */

/** Why the run would end if we advanced now (null = it continues). */
export function pendingEnd(s: RunState): EndReason | null {
  if (s.lives !== null && s.lives <= 0) return 'lives';
  if (s.clockMs !== null && s.clockMs <= 0) return 'time';
  if (s.totalRounds !== null && s.results.length >= s.totalRounds) return 'complete';
  if (!s.upcoming) return s.totalRounds === null ? 'exhausted' : 'complete';
  return null;
}

export function next(ctx: GameContext, s: RunState, rng: Rng): RunState {
  if (s.phase !== 'reveal') return s;
  const end = pendingEnd(s);
  if (end) return { ...s, phase: 'finished', endReason: end, upcoming: null, upcomingMeta: null };
  const q = s.upcoming!;
  const state: RunState = {
    ...s,
    phase: 'loading',
    question: q,
    seen: s.upcomingMeta?.seen ?? s.seen,
    fixedCursor: s.upcomingMeta?.fixedCursor ?? s.fixedCursor,
    runUsed: [...s.runUsed, q.vehicle.id],
    hintsUsed: 0,
    shownAt: null,
  };
  return withUpcoming(ctx, state, rng);
}

export function quit(s: RunState, now: number): RunState {
  if (s.phase === 'finished') return s;
  return { ...pauseClock(s, now), phase: 'finished', endReason: 'quit', upcoming: null, upcomingMeta: null };
}

/* ------------------------------------------------------------------ */
/* Summary                                                             */
/* ------------------------------------------------------------------ */

export interface RunSummary {
  score: number;
  answered: number;
  correct: number;
  partial: number;
  skipped: number;
  accuracy: number;
  bestStreak: number;
  perfect: boolean;
  assisted: boolean;
}

export function summarize(s: RunState): RunSummary {
  const answered = s.results.length;
  const correct = s.results.filter((r) => r.outcome === 'correct').length;
  return {
    score: s.score,
    answered,
    correct,
    partial: s.results.filter((r) => r.outcome === 'partial').length,
    skipped: s.results.filter((r) => r.outcome === 'skipped').length,
    accuracy: answered ? correct / answered : 0,
    bestStreak: s.bestStreak,
    perfect: answered > 0 && correct === answered && (s.totalRounds === null || answered >= s.totalRounds),
    assisted: s.assisted,
  };
}

/* ------------------------------------------------------------------ */
/* Party (pass & play)                                                  */
/* ------------------------------------------------------------------ */

/** Player names for a party config, defaulting to two players. */
export function partyPlayers(config: RunConfig): string[] {
  const names = (config.players ?? []).map((n) => n.trim()).filter(Boolean).slice(0, PARTY.maxPlayers);
  while (names.length < PARTY.minPlayers) names.push(`Player ${names.length + 1}`);
  return names;
}

/** Whose turn round n (1-based) is. */
export function partyPlayerIndex(config: RunConfig, n: number): number {
  return (n - 1) % partyPlayers(config).length;
}

function lastResultOf(s: RunState, player: number): RoundResult | undefined {
  for (let i = s.results.length - 1; i >= 0; i--) if (s.results[i].player === player) return s.results[i];
  return undefined;
}

/** Current streak of a party player (for the HUD). */
export function partyStreak(s: RunState, player: number): number {
  return lastResultOf(s, player)?.streakAfter ?? 0;
}

export interface PartyStanding {
  player: number;
  name: string;
  score: number;
  correct: number;
  answered: number;
  bestStreak: number;
  rank: number;
}

/** Scoreboard, highest score first; ties share a rank (and are broken by correct answers). */
export function partyStandings(s: RunState): PartyStanding[] {
  const names = partyPlayers(s.config);
  const rows = names.map((name, player) => {
    const mine = s.results.filter((r) => r.player === player);
    return {
      player,
      name,
      score: mine.reduce((t, r) => t + r.points, 0),
      correct: mine.filter((r) => r.outcome === 'correct').length,
      answered: mine.length,
      bestStreak: mine.reduce((m, r) => Math.max(m, r.streakAfter), 0),
      rank: 0,
    };
  });
  rows.sort((a, b) => b.score - a.score || b.correct - a.correct || a.player - b.player);
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    r.rank = prev && prev.score === r.score && prev.correct === r.correct ? prev.rank : i + 1;
  });
  return rows;
}
