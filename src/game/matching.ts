/**
 * Answer checking for typed answers (Hard and Expert).
 *
 * Principles:
 *  - Normalise case, accents, spacing and punctuation ("MX-5" = "mx5" = "MX 5").
 *  - Accept explicit aliases only (VW → Volkswagen, Miata → MX-5).
 *  - Tolerate small typos conservatively: never when the typed text is, or is
 *    at least as close to, a *different* real make/model, and never when the
 *    digits differ ("MX-6" is not a typo of "MX-5", "912" is not "911").
 */
import type { Photo, Vehicle } from '../data/types';

/* ------------------------------------------------------------------ */
/* Normalisation                                                       */
/* ------------------------------------------------------------------ */

export function normalize(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics: Citroën → Citroen
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '') // apostrophes join: "'69" → "69"
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function compact(input: string): string {
  return normalize(input).replace(/ /g, '');
}

export function tokens(input: string): string[] {
  const n = normalize(input);
  return n ? n.split(' ') : [];
}

function digits(s: string): string {
  return s.replace(/[^0-9]/g, '');
}

/** Optimal-string-alignment Damerau–Levenshtein distance. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => {
    const row = new Array<number>(b.length + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** Typos allowed for a target name of this (compact) length. */
export function typoAllowance(length: number): number {
  if (length <= 4) return 0;
  if (length <= 7) return 1;
  return 2;
}

/* ------------------------------------------------------------------ */
/* Name index (all real names known to the game)                       */
/* ------------------------------------------------------------------ */

export interface NameIndex {
  /** compact make → canonical make */
  makes: Map<string, string>;
  /** compact model names of every real car we know about */
  models: Set<string>;
  /** compact name → compact base models of the dataset vehicles that accept it */
  owners: Map<string, Set<string>>;
}

export function buildNameIndex(
  makeAliases: Record<string, string[]>,
  extraMakes: string[],
  modelNames: string[],
  vehicles: Vehicle[],
): NameIndex {
  const makes = new Map<string, string>();
  for (const [make, aliases] of Object.entries(makeAliases)) {
    makes.set(compact(make), make);
    for (const a of aliases) makes.set(compact(a), make);
  }
  for (const m of extraMakes) if (!makes.has(compact(m))) makes.set(compact(m), m);
  const models = new Set<string>();
  const owners = new Map<string, Set<string>>();
  for (const m of modelNames) models.add(compact(m));
  for (const v of vehicles) {
    if (!makes.has(compact(v.make))) makes.set(compact(v.make), v.make);
    for (const n of [v.model, ...v.modelAliases]) {
      models.add(compact(n));
      if (!owners.has(compact(n))) owners.set(compact(n), new Set());
      owners.get(compact(n))!.add(compact(v.model));
    }
  }
  models.delete('');
  return { makes, models, owners };
}

/* ------------------------------------------------------------------ */
/* Field results                                                       */
/* ------------------------------------------------------------------ */

export type MatchKind = 'exact' | 'alias' | 'typo' | 'close' | 'wrong' | 'empty';

export interface FieldResult {
  correct: boolean;
  kind: MatchKind;
  input: string;
  expected: string;
  note?: string;
}

/** Accepted spellings for this vehicle's make (canonical + global aliases + vehicle-specific). */
export function acceptedMakes(vehicle: Vehicle, makeAliases: Record<string, string[]>): string[] {
  return [vehicle.make, ...(makeAliases[vehicle.make] ?? []), ...(vehicle.makeAliases ?? [])];
}

export function acceptedModels(vehicle: Vehicle): string[] {
  return [vehicle.model, ...vehicle.modelAliases];
}

/**
 * Trailing/leading words that may accompany a model name without changing
 * which car it is (trims, body styles, engine labels). Words that would name a
 * *different* model (e.g. "c" in "Prius c", "e" in "Mach-E") are deliberately absent.
 */
const GENERIC_EXTRAS = new Set(
  (
    'gt gti gtd gts gtx s se sel le xle lx ex dx si sport sports turbo twin base limited deluxe luxe custom ' +
    'standard coupe convertible cabrio cabriolet sedan saloon hatchback hatch wagon estate roadster spider spyder ' +
    'targa hardtop fastback ss rs rt z28 v6 v8 v12 4x4 awd 4wd hybrid electric ev tdi tsi tfsi xlt lariat ' +
    'platinum svt quattro amg nismo performance long range edition special anniversary 1 6 1 8 i ti ' +
    'manual automatic auto door 2 3 4 5 2dr 3dr 4dr 5dr'
  ).split(' '),
);

function isYearToken(t: string): boolean {
  return /^(19|20)\d\d$/.test(t);
}

/**
 * Try to read `inputTokens` as `name` plus permissible extra words.
 * Returns true if the tokens spell the name (compactly) followed or preceded only by allowed extras.
 */
function spellsName(inputTokens: string[], name: string, extras: Set<string>): boolean {
  const target = compact(name);
  if (!target) return false;
  const n = inputTokens.length;
  for (let start = 0; start < n; start++) {
    // Leading tokens must all be extras or years.
    if (!inputTokens.slice(0, start).every((t) => extras.has(t) || isYearToken(t))) break;
    let acc = '';
    for (let end = start; end < n; end++) {
      acc += inputTokens[end];
      if (acc.length > target.length) break;
      if (acc === target) {
        const rest = inputTokens.slice(end + 1);
        if (rest.every((t) => extras.has(t) || isYearToken(t))) return true;
      }
    }
  }
  return false;
}

/** Drop leading make words (any accepted spelling of this vehicle's make) from a model answer. */
function stripMake(inputTokens: string[], makes: string[]): string[] {
  for (const make of makes) {
    const mt = tokens(make);
    if (mt.length && mt.every((t, i) => inputTokens[i] === t) && inputTokens.length > mt.length) {
      return inputTokens.slice(mt.length);
    }
    // compact form, e.g. "landrover defender"
    const mc = compact(make);
    if (inputTokens.length > 1 && inputTokens[0] === mc) return inputTokens.slice(1);
  }
  return inputTokens;
}

interface FuzzyOutcome {
  accepted: boolean;
  matched?: string;
  conflict?: string;
}

/**
 * Conservative typo matching: accept only if `typed` is within the allowance of
 * an accepted name, has identical digits, and no other real name is as close.
 */
function fuzzyMatch(typed: string, accepted: string[], otherRealNames: Iterable<string>): FuzzyOutcome {
  if (typed.length < 4) return { accepted: false };
  let best: { name: string; dist: number } | null = null;
  for (const name of accepted) {
    const c = compact(name);
    if (digits(c) !== digits(typed)) continue;
    const allowance = typoAllowance(c.length);
    if (allowance === 0) continue;
    const dist = editDistance(typed, c);
    if (dist <= allowance && (!best || dist < best.dist)) best = { name, dist };
  }
  if (!best) return { accepted: false };
  const acceptedCompact = new Set(accepted.map(compact));
  for (const other of otherRealNames) {
    if (acceptedCompact.has(other)) continue;
    if (other === typed) return { accepted: false, conflict: other };
    if (Math.abs(other.length - typed.length) > best.dist) continue;
    if (editDistance(typed, other) <= best.dist) return { accepted: false, conflict: other };
  }
  return { accepted: true, matched: best.name };
}

export function matchMake(
  input: string,
  vehicle: Vehicle,
  index: NameIndex,
  makeAliases: Record<string, string[]>,
): FieldResult {
  const expected = vehicle.make;
  const typed = compact(input);
  if (!typed) return { correct: false, kind: 'empty', input, expected };
  const accepted = acceptedMakes(vehicle, makeAliases);
  if (typed === compact(vehicle.make)) return { correct: true, kind: 'exact', input, expected };
  if (accepted.some((a) => compact(a) === typed)) return { correct: true, kind: 'alias', input, expected };
  const fuzzy = fuzzyMatch(typed, accepted, index.makes.keys());
  if (fuzzy.accepted) return { correct: true, kind: 'typo', input, expected, note: `Read as “${expected}”` };
  return { correct: false, kind: 'wrong', input, expected };
}

/**
 * True when the text is exactly the name of a different real car that merely
 * extends one of this car's names with a trim-like word ("Range Rover Sport",
 * "Carrera GT", "3 Series" for a Land Rover Series). Another generation of the
 * same model ("Mustang GT", "Golf I") still counts as the right model.
 */
function namesOtherCar(toks: string[], vehicle: Vehicle, index: NameIndex): boolean {
  const typed = toks.join('');
  if (!index.models.has(typed)) return false;
  if (acceptedModels(vehicle).some((n) => compact(n) === typed)) return false;
  if (index.owners.get(typed)?.has(compact(vehicle.model))) return false;
  const mt = tokens(vehicle.model);
  if (toks.length > mt.length && mt.every((t, i) => toks[i] === t) && toks.slice(mt.length).every((t) => /^(?:[ivx]+|\d+)$/.test(t))) return false;
  return true;
}

export function matchModel(
  input: string,
  vehicle: Vehicle,
  index: NameIndex,
  makeAliases: Record<string, string[]>,
): FieldResult {
  const expected = vehicle.model;
  let toks = tokens(input);
  if (!toks.length) return { correct: false, kind: 'empty', input, expected };
  toks = stripMake(toks, acceptedMakes(vehicle, makeAliases));
  const extras = new Set(GENERIC_EXTRAS);
  for (const w of vehicle.extraWords ?? []) for (const t of tokens(w)) extras.add(t);
  if (vehicle.generation) {
    for (const g of [vehicle.generation.name, ...vehicle.generation.aliases]) {
      const gt = tokens(g);
      if (gt.length === 1) extras.add(gt[0]);
      // "Golf 7" / "Golf VII": a generation alias that repeats the model name adds its tail as an extra.
      const mt = tokens(vehicle.model);
      if (gt.length > mt.length && mt.every((t, i) => gt[i] === t)) for (const t of gt.slice(mt.length)) extras.add(t);
      extras.add(compact(g));
    }
  }
  const typed = toks.join('');
  if (namesOtherCar(toks, vehicle, index)) return { correct: false, kind: 'wrong', input, expected };
  if (typed === compact(vehicle.model) || spellsName(toks, vehicle.model, extras)) {
    return { correct: true, kind: 'exact', input, expected };
  }
  for (const alias of vehicle.modelAliases) {
    if (spellsName(toks, alias, extras)) return { correct: true, kind: 'alias', input, expected };
  }
  // Typo tolerance: on the full text, and on the text minus permissible trailing extras.
  const candidates = new Set<string>([typed]);
  for (let k = toks.length - 1; k >= 1; k--) {
    if (toks.slice(k).every((t) => extras.has(t) || isYearToken(t))) candidates.add(toks.slice(0, k).join(''));
  }
  for (const c of candidates) {
    const fuzzy = fuzzyMatch(c, acceptedModels(vehicle), index.models);
    if (fuzzy.accepted) {
      return { correct: true, kind: 'typo', input, expected, note: `Read as “${expected}”` };
    }
  }
  return { correct: false, kind: 'wrong', input, expected };
}

/* ------------------------------------------------------------------ */
/* Combined make+model entry                                          */
/* ------------------------------------------------------------------ */

/**
 * Players sometimes type "VW Golf" into the make box, or "Golf" into make and
 * nothing into model. Split such entries using the index of real makes.
 */
export function splitCombined(makeInput: string, modelInput: string, index: NameIndex): { make: string; model: string } {
  const makeToks = tokens(makeInput);
  const modelToks = tokens(modelInput);
  if (makeToks.length > 1 && !modelToks.length) {
    for (let k = makeToks.length - 1; k >= 1; k--) {
      if (index.makes.has(makeToks.slice(0, k).join(''))) {
        return { make: makeToks.slice(0, k).join(' '), model: makeToks.slice(k).join(' ') };
      }
    }
  }
  if (!makeToks.length && modelToks.length > 1) {
    for (let k = modelToks.length - 1; k >= 1; k--) {
      if (index.makes.has(modelToks.slice(0, k).join(''))) {
        return { make: modelToks.slice(0, k).join(' '), model: modelToks.slice(k).join(' ') };
      }
    }
  }
  return { make: makeInput, model: modelInput };
}

/* ------------------------------------------------------------------ */
/* Expert fields                                                       */
/* ------------------------------------------------------------------ */

export function parseYear(input: string, range?: [number, number]): number | null {
  const t = input.trim().replace(/^['’]/, '');
  if (/^\d{4}$/.test(t)) return Number(t);
  if (/^\d{2}$/.test(t)) {
    const yy = Number(t);
    const options = [1900 + yy, 2000 + yy];
    if (range) {
      const inRange = options.find((y) => y >= range[0] && y <= range[1]);
      if (inRange) return inRange;
      // nearest century to the range
      return options.reduce((a, b) => (Math.abs(a - range[0]) <= Math.abs(b - range[0]) ? a : b));
    }
    return yy > 30 ? 1900 + yy : 2000 + yy;
  }
  return null;
}

export function formatYearRange(from: number, to: number): string {
  return from === to ? String(from) : `${from}–${to}`;
}

export function matchYear(input: string, photo: Photo): FieldResult {
  const { from, to } = photo.modelYear;
  const expected = formatYearRange(from, to);
  if (!input.trim()) return { correct: false, kind: 'empty', input, expected };
  const year = parseYear(input, [from, to]);
  if (year === null) return { correct: false, kind: 'wrong', input, expected, note: 'Enter a four-digit year' };
  if (year >= from && year <= to) return { correct: true, kind: 'exact', input, expected };
  const off = year < from ? from - year : year - to;
  if (off <= 2) return { correct: false, kind: 'close', input, expected, note: `${off} year${off > 1 ? 's' : ''} off` };
  return { correct: false, kind: 'wrong', input, expected };
}

const GEN_NOISE = new Set(['generation', 'gen', 'the', 'series', 'mark', 'mk', 'type', 'chassis']);

export function matchGeneration(input: string, vehicle: Vehicle, makeAliases: Record<string, string[]>): FieldResult {
  const gen = vehicle.generation;
  const expected = gen?.name ?? '—';
  if (!gen) return { correct: false, kind: 'wrong', input, expected };
  let toks = tokens(input);
  if (!toks.length) return { correct: false, kind: 'empty', input, expected };
  toks = stripMake(toks, acceptedMakes(vehicle, makeAliases));
  // drop model words, e.g. "Golf Mk7" → "Mk7"
  const modelToks = new Set(acceptedModels(vehicle).flatMap(tokens));
  const dropModel = (ts: string[]) => {
    const kept = ts.filter((t) => !modelToks.has(t));
    return kept.length ? kept : ts;
  };
  const accepted = [gen.name, ...gen.aliases];
  // Compare the typed text both as-is and with model words removed, against each accepted name
  // treated the same way, so "Nuova 500", "Golf I" or "Sting Ray" match their own aliases.
  const typedForms = new Set([toks.join(''), dropModel(toks).join('')]);
  const acceptedForms = new Set(accepted.flatMap((a) => [compact(a), dropModel(tokens(a)).join('')]));
  if ([...typedForms].some((t) => acceptedForms.has(t))) return { correct: true, kind: 'exact', input, expected };
  // Allow noise words ("Mk 7 generation", "the A80")
  const noNoise = (ts: string[]) => ts.filter((t) => !GEN_NOISE.has(t)).join('');
  const typedLoose = new Set([noNoise(toks), noNoise(dropModel(toks))].filter(Boolean));
  const acceptedLoose = new Set(accepted.flatMap((a) => [noNoise(tokens(a)), noNoise(dropModel(tokens(a)))]).filter(Boolean));
  if ([...typedLoose].some((t) => acceptedLoose.has(t))) return { correct: true, kind: 'alias', input, expected };
  return { correct: false, kind: 'wrong', input, expected };
}
