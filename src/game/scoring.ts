/**
 * Scoring rules (documented in README "Scoring").
 *
 *  Base points:     Normal 100 · Hard 200 · Expert 300
 *  Hints:           each hint lowers the available points: 100% → 75% → 50% → 25%
 *  Partial credit:  Hard/Expert award the weight of each correct field
 *                   (Hard: make 40%, model 60%; Expert: make 25%, model 35%, year/generation 40%)
 *                   but only a fully correct answer counts as "correct".
 *  Streak bonus:    +10% per consecutive correct answer after the first, capped at +50%
 *                   (full answers only).
 *  Time Attack:     speed bonus up to +50% for answers within 3 s, fading to 0 at 10 s.
 */
export type Difficulty = 'normal' | 'hard' | 'expert';

export const BASE_POINTS: Record<Difficulty, number> = { normal: 100, hard: 200, expert: 300 };
export const HINT_MULTIPLIERS = [1, 0.75, 0.5, 0.25] as const;
export const MAX_HINTS = 3;

export const FIELD_WEIGHTS: Record<Difficulty, Record<string, number>> = {
  normal: { choice: 1 },
  hard: { make: 0.4, model: 0.6 },
  expert: { make: 0.25, model: 0.35, detail: 0.4 },
};

export function hintMultiplier(hintsUsed: number): number {
  return HINT_MULTIPLIERS[Math.max(0, Math.min(MAX_HINTS, hintsUsed))];
}

/** Bonus fraction for the streak *including* this answer. */
export function streakBonus(streakAfter: number): number {
  return Math.min(Math.max(streakAfter - 1, 0), 5) * 0.1;
}

/** Time Attack speed bonus fraction, from answer time in ms. */
export function speedBonus(answerMs: number): number {
  if (answerMs <= 3000) return 0.5;
  if (answerMs >= 10000) return 0;
  return 0.5 * (1 - (answerMs - 3000) / 7000);
}

export interface ScoreInput {
  difficulty: Difficulty;
  hintsUsed: number;
  /** Field name → correct? (Normal uses { choice }) */
  fields: Record<string, boolean>;
  streakAfter: number;
  answerMs?: number;
  timed?: boolean;
}

export interface ScoreBreakdown {
  points: number;
  fullyCorrect: boolean;
  base: number;
  fieldFraction: number;
  hintMultiplier: number;
  streakBonus: number;
  speedBonus: number;
}

export function scoreRound(input: ScoreInput): ScoreBreakdown {
  const base = BASE_POINTS[input.difficulty];
  const weights = FIELD_WEIGHTS[input.difficulty];
  const names = Object.keys(weights);
  const fullyCorrect = names.every((n) => input.fields[n]);
  const fieldFraction = names.reduce((sum, n) => sum + (input.fields[n] ? weights[n] : 0), 0);
  const hm = hintMultiplier(input.hintsUsed);
  const sb = fullyCorrect ? streakBonus(input.streakAfter) : 0;
  const spb = fullyCorrect && input.timed && input.answerMs !== undefined ? speedBonus(input.answerMs) : 0;
  const points = Math.round(base * fieldFraction * hm * (1 + sb + spb));
  return { points, fullyCorrect, base, fieldFraction, hintMultiplier: hm, streakBonus: sb, speedBonus: spb };
}

/** Points the player can still earn on this question (shown next to the hint button). */
export function availablePoints(difficulty: Difficulty, hintsUsed: number): number {
  return Math.round(BASE_POINTS[difficulty] * hintMultiplier(hintsUsed));
}
