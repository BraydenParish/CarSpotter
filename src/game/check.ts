/**
 * Turns a player's answer into per-field results for scoring and display.
 */
import type { Photo, Vehicle } from '../data/types';
import type { GameContext } from './context';
import type { ExpertField } from './expert';
import type { Choice } from './distractors';
import { matchGeneration, matchMake, matchModel, matchYear, splitCombined, type FieldResult } from './matching';
import type { Difficulty } from './scoring';

export interface TypedAnswer {
  make: string;
  model: string;
  /** Year or generation (Expert only). */
  extra?: string;
}

export interface CheckResult {
  /** Field name → result, in display order. */
  fields: Record<string, FieldResult>;
  /** Field name → correct, keyed as in FIELD_WEIGHTS. */
  scoreFields: Record<string, boolean>;
  fullyCorrect: boolean;
}

export function checkChoice(choices: Choice[], key: string): CheckResult {
  const chosen = choices.find((c) => c.key === key);
  const answer = choices.find((c) => c.correct)!;
  const correct = !!chosen?.correct;
  return {
    fields: {
      choice: {
        correct,
        kind: correct ? 'exact' : 'wrong',
        input: chosen?.label ?? '',
        expected: answer.label,
      },
    },
    scoreFields: { choice: correct },
    fullyCorrect: correct,
  };
}

export function checkTyped(
  ctx: GameContext,
  photo: Photo,
  vehicle: Vehicle,
  difficulty: Exclude<Difficulty, 'normal'>,
  answer: TypedAnswer,
  expertField: ExpertField | null,
): CheckResult {
  const { make, model } = splitCombined(answer.make, answer.model, ctx.index);
  const makeResult = matchMake(make, vehicle, ctx.index, ctx.makeAliases);
  const modelResult = matchModel(model, vehicle, ctx.index, ctx.makeAliases);
  const fields: Record<string, FieldResult> = { make: makeResult, model: modelResult };
  const scoreFields: Record<string, boolean> = { make: makeResult.correct, model: modelResult.correct };
  if (difficulty === 'expert') {
    const extra = answer.extra ?? '';
    const detail =
      expertField === 'generation'
        ? matchGeneration(extra, vehicle, ctx.makeAliases)
        : matchYear(extra, photo);
    fields[expertField === 'generation' ? 'generation' : 'year'] = detail;
    scoreFields.detail = detail.correct;
  }
  return { fields, scoreFields, fullyCorrect: Object.values(scoreFields).every(Boolean) };
}
