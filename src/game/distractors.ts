/**
 * Multiple-choice option generation for Normal difficulty.
 *
 * Distractors are real cars (dataset vehicles or reference-lexicon entries)
 * chosen for plausibility: same body style, overlapping era, shared category,
 * same country. Exactly one option identifies the answer: anything that shares
 * the answer's make+model name, an alias, or a badge-engineered twin is excluded.
 */
import type { BodyStyle, Category, Vehicle } from '../data/types';
import type { LexiconCar } from '../data/lexicon';
import { compact } from './matching';
import { shuffle, type Rng } from './rng';

export interface Choice {
  /** Stable key for React and analytics. */
  key: string;
  make: string;
  model: string;
  label: string;
  correct: boolean;
}

interface Candidate {
  make: string;
  model: string;
  bodyStyle: BodyStyle;
  years: [number, number];
  country: string;
  categories: Category[];
}

const BODY_FAMILY: Record<BodyStyle, string> = {
  sedan: 'car',
  hatchback: 'car',
  wagon: 'car',
  coupe: 'sporty',
  convertible: 'sporty',
  roadster: 'sporty',
  suv: 'utility',
  pickup: 'utility',
  van: 'utility',
};

export function choiceLabel(make: string, model: string): string {
  return `${make} ${model}`;
}

/** Names (compact, "make|model") that would also be a correct answer for this vehicle. */
function answerNames(answer: Vehicle): { models: string[]; twins: Set<string> } {
  const models = [answer.model, ...answer.modelAliases].map(compact).filter(Boolean);
  const twins = new Set((answer.twins ?? []).map(compact));
  return { models, twins };
}

/** True if choosing this candidate would arguably also be correct (or confusingly identical). */
export function conflictsWithAnswer(candidate: { make: string; model: string }, answer: Vehicle): boolean {
  const { models, twins } = answerNames(answer);
  const cm = compact(candidate.model);
  const full = compact(`${candidate.make} ${candidate.model}`);
  if (twins.has(full) || twins.has(cm)) return true;
  const sameMake = compact(candidate.make) === compact(answer.make) ||
    (answer.makeAliases ?? []).some((m) => compact(m) === compact(candidate.make));
  // Same model name under the same make is the same answer (a different generation is still "correct" in Normal).
  if (sameMake && models.some((m) => m === cm || m.includes(cm) || cm.includes(m))) return true;
  // Different make but a name contained in the answer's name (e.g. "GT-R" vs "Skyline GT-R") is too confusing.
  if (models.some((m) => m === cm)) return true;
  return false;
}

function plausibility(c: Candidate, answer: Vehicle): number {
  let score = 0;
  if (c.bodyStyle === answer.bodyStyle) score += 4;
  else if (BODY_FAMILY[c.bodyStyle] === BODY_FAMILY[answer.bodyStyle]) score += 2;
  else score -= 3;
  const [a0, a1] = answer.years;
  const [c0, c1] = c.years;
  const gap = c0 > a1 ? c0 - a1 : a0 > c1 ? a0 - c1 : 0;
  if (gap === 0) score += 3;
  else if (gap <= 8) score += 2;
  else if (gap <= 15) score += 0;
  else score -= 3;
  const shared = c.categories.filter((cat) => answer.categories.includes(cat)).length;
  score += Math.min(shared, 2) * 2;
  if (c.country === answer.country) score += 1;
  return score;
}

/**
 * Build four shuffled choices: the answer plus three plausible, distinct, non-conflicting distractors.
 */
export function buildChoices(
  answer: Vehicle,
  vehicles: Vehicle[],
  lexicon: LexiconCar[],
  rng: Rng,
  count = 4,
): Choice[] {
  const pool: Candidate[] = [
    ...vehicles.filter((v) => v.id !== answer.id),
    ...lexicon,
  ];
  const seen = new Set<string>([compact(choiceLabel(answer.make, answer.model))]);
  const scored: { c: Candidate; s: number }[] = [];
  for (const c of pool) {
    const label = compact(choiceLabel(c.make, c.model));
    if (seen.has(label)) continue;
    if (conflictsWithAnswer(c, answer)) continue;
    seen.add(label);
    scored.push({ c, s: plausibility(c, answer) + rng() * 2.5 });
  }
  scored.sort((x, y) => y.s - x.s);
  // Sample from the most plausible band so options vary between plays.
  const band = scored.slice(0, Math.max(count + 3, 8));
  const picked: Candidate[] = [];
  const makesUsed = new Map<string, number>();
  for (const { c } of shuffle(band, rng)) {
    if (picked.length >= count - 1) break;
    const n = makesUsed.get(c.make) ?? 0;
    if (n >= 2) continue; // avoid three of the same make
    picked.push(c);
    makesUsed.set(c.make, n + 1);
  }
  // Fallback for tiny pools: fill from anything remaining.
  for (const { c } of scored) {
    if (picked.length >= count - 1) break;
    if (!picked.includes(c)) picked.push(c);
  }
  const choices: Choice[] = [
    { key: `a:${answer.id}`, make: answer.make, model: answer.model, label: choiceLabel(answer.make, answer.model), correct: true },
    ...picked.map((c, i) => ({
      key: `d:${i}:${compact(c.make)}-${compact(c.model)}`,
      make: c.make,
      model: c.model,
      label: choiceLabel(c.make, c.model),
      correct: false,
    })),
  ];
  return shuffle(choices, rng);
}
