import { describe, expect, it } from 'vitest';
import { createContext, VEHICLES } from '../data/dataset';
import { LEXICON } from '../data/lexicon';
import { fixturePhotos } from '../dev/fixtures';
import type { Photo } from '../data/types';
import { distinctVehicles, drawPhoto, emptySeen } from './deck';
import { buildChoices, conflictsWithAnswer } from './distractors';
import { expertField, expertRequirement, isExpertEligible, MAX_YEAR_SPAN } from './expert';
import { hintsFor } from './hints';
import { compact } from './matching';
import { bestKey, DEFAULT_FILTERS } from './modes';
import { applyDifficulty, applyFilters, availableThemes, dailyKey, dailyPhotos, fullPhotos, msUntilDailyReset } from './pool';
import { mulberry32, seededRng } from './rng';
import { availablePoints, scoreRound, speedBonus, streakBonus } from './scoring';

const photos = fixturePhotos(VEHICLES);
const ctx = createContext(VEHICLES, photos);
const v = (id: string) => ctx.ds.vehicleById.get(id)!;
const photoOf = (id: string) => ctx.ds.photos.find((p) => p.vehicleId === id)!;

describe('multiple-choice distractors', () => {
  it('always gives four distinct options with exactly one correct answer', () => {
    for (const vehicle of VEHICLES) {
      for (let seed = 0; seed < 20; seed++) {
        const choices = buildChoices(vehicle, VEHICLES, LEXICON, mulberry32(seed));
        expect(choices).toHaveLength(4);
        expect(choices.filter((c) => c.correct)).toHaveLength(1);
        expect(new Set(choices.map((c) => compact(c.label))).size).toBe(4);
        // No two options may be the same car under different badges (e.g. Acura/Honda Integra).
        expect(new Set(choices.map((c) => compact(c.model))).size).toBe(4);
        for (const c of choices.filter((x) => !x.correct)) {
          expect(conflictsWithAnswer(c, vehicle), `${c.label} conflicts with ${vehicle.id}`).toBe(false);
        }
      }
    }
  }, 60_000);

  it('offers vans, not sports cars, for a van', () => {
    const t1 = v('vw-type2-t1');
    for (let seed = 0; seed < 30; seed++) {
      for (const c of buildChoices(t1, VEHICLES, LEXICON, mulberry32(seed)).filter((x) => !x.correct)) {
        const meta = [...VEHICLES, ...LEXICON].find((x) => x.make === c.make && x.model === c.model)!;
        expect(['van', 'suv', 'pickup'], `${c.label} offered for a VW T1`).toContain(meta.bodyStyle);
      }
    }
  });

  it('never offers another name for the same car', () => {
    const datsun = v('datsun-240z');
    expect(conflictsWithAnswer({ make: 'Nissan', model: 'Fairlady Z' }, datsun)).toBe(true);
    const ds = v('citroen-ds');
    expect(conflictsWithAnswer({ make: 'Citroën', model: 'ID' }, ds)).toBe(true);
    const fiat = v('fiat-500-nuova');
    expect(conflictsWithAnswer({ make: 'Fiat', model: '500' }, fiat)).toBe(true);
    expect(conflictsWithAnswer({ make: 'Fiat', model: 'Panda' }, fiat)).toBe(false);
  });

  it('chooses plausible cars of similar body style and era', () => {
    const answer = v('ford-mustang-1g');
    let sameFamily = 0;
    let closeEra = 0;
    let total = 0;
    for (let seed = 0; seed < 50; seed++) {
      for (const c of buildChoices(answer, VEHICLES, LEXICON, mulberry32(seed)).filter((x) => !x.correct)) {
        const meta = [...VEHICLES, ...LEXICON].find((x) => x.make === c.make && x.model === c.model)!;
        total++;
        if (['coupe', 'convertible', 'roadster'].includes(meta.bodyStyle)) sameFamily++;
        const gap = meta.years[0] > answer.years[1] ? meta.years[0] - answer.years[1] : answer.years[0] > meta.years[1] ? answer.years[0] - meta.years[1] : 0;
        if (gap <= 8) closeEra++;
      }
    }
    expect(sameFamily / total).toBeGreaterThan(0.9);
    expect(closeEra / total).toBeGreaterThan(0.9);
  });

  it('shuffles the position of the correct answer', () => {
    const positions = new Set<number>();
    for (let seed = 0; seed < 40; seed++) {
      positions.add(buildChoices(v('mazda-mx5-na'), VEHICLES, LEXICON, mulberry32(seed)).findIndex((c) => c.correct));
    }
    expect(positions.size).toBe(4);
  });
});

describe('Expert eligibility', () => {
  it('asks for a year when the photo supports a narrow enough range', () => {
    expect(expertField(photoOf('mazda-mx5-na'), v('mazda-mx5-na'))).toBe('year');
    expect(expertField(photoOf('dodge-charger-2g'), v('dodge-charger-2g'))).toBe('year');
  });

  it('falls back to the generation when the year cannot be narrowed', () => {
    const p = photoOf('vw-type2-t1');
    expect(p.supports.year).toBe(false);
    expect(expertField(p, v('vw-type2-t1'))).toBe('generation');
  });

  it('excludes photos that support neither, or ranges that are too wide', () => {
    expect(isExpertEligible(photoOf('vw-beetle'), v('vw-beetle'))).toBe(false);
    expect(isExpertEligible(photoOf('land-rover-defender'), v('land-rover-defender'))).toBe(false);
    const wide: Photo = { ...photoOf('mazda-mx5-na'), modelYear: { from: 1980, to: 1980 + MAX_YEAR_SPAN + 1, basis: 'x' }, supports: { ...photoOf('mazda-mx5-na').supports, generation: false } };
    expect(isExpertEligible(wide, v('mazda-mx5-na'))).toBe(false);
  });

  it('never uses a vehicle without a generation for a generation question', () => {
    const p: Photo = { ...photoOf('trabant-601'), supports: { ...photoOf('trabant-601').supports, year: false, generation: true } };
    expect(v('trabant-601').generation).toBeNull();
    expect(expertField(p, v('trabant-601'))).toBeNull();
  });

  it('explains the requirement without revealing the answer', () => {
    const exact = expertRequirement(photoOf('dodge-charger-2g'), 'year');
    expect(exact).toMatch(/exact model year/);
    expect(exact).not.toMatch(/1969|Charger|Dodge/);
    expect(expertRequirement(photoOf('mazda-mx5-na'), 'year')).toMatch(/Any year within/);
    expect(expertRequirement(photoOf('vw-type2-t1'), 'generation')).toMatch(/generation/);
  });

  it('filters the Expert pool and handles an empty one', () => {
    const expert = applyDifficulty(ctx.ds, fullPhotos(ctx.ds), 'expert');
    expect(expert.length).toBeGreaterThan(0);
    expect(expert.every((p) => isExpertEligible(p, v(p.vehicleId)))).toBe(true);
    const onlyBeetle = applyDifficulty(ctx.ds, [photoOf('vw-beetle')], 'expert');
    expect(onlyBeetle).toEqual([]);
  });
});

describe('scoring', () => {
  it('awards base points by difficulty', () => {
    expect(scoreRound({ difficulty: 'normal', hintsUsed: 0, fields: { choice: true }, streakAfter: 1 }).points).toBe(100);
    expect(scoreRound({ difficulty: 'hard', hintsUsed: 0, fields: { make: true, model: true }, streakAfter: 1 }).points).toBe(200);
    expect(scoreRound({ difficulty: 'expert', hintsUsed: 0, fields: { make: true, model: true, detail: true }, streakAfter: 1 }).points).toBe(300);
  });

  it('reduces available points with each hint', () => {
    expect([0, 1, 2, 3].map((h) => availablePoints('hard', h))).toEqual([200, 150, 100, 50]);
    expect(scoreRound({ difficulty: 'normal', hintsUsed: 2, fields: { choice: true }, streakAfter: 1 }).points).toBe(50);
  });

  it('gives partial credit per field but only full answers count as correct', () => {
    const r = scoreRound({ difficulty: 'expert', hintsUsed: 0, fields: { make: true, model: true, detail: false }, streakAfter: 0 });
    expect(r.fullyCorrect).toBe(false);
    expect(r.points).toBe(180);
    expect(scoreRound({ difficulty: 'hard', hintsUsed: 0, fields: { make: true, model: false }, streakAfter: 0 }).points).toBe(80);
  });

  it('caps the streak bonus at +50%', () => {
    expect(streakBonus(1)).toBe(0);
    expect(streakBonus(3)).toBeCloseTo(0.2);
    expect(streakBonus(6)).toBeCloseTo(0.5);
    expect(streakBonus(40)).toBeCloseTo(0.5);
    expect(scoreRound({ difficulty: 'normal', hintsUsed: 0, fields: { choice: true }, streakAfter: 3 }).points).toBe(120);
  });

  it('applies the speed bonus only to timed, fully correct answers', () => {
    expect(speedBonus(2000)).toBe(0.5);
    expect(speedBonus(6500)).toBeCloseTo(0.25);
    expect(speedBonus(12000)).toBe(0);
    expect(scoreRound({ difficulty: 'normal', hintsUsed: 0, fields: { choice: true }, streakAfter: 1, answerMs: 1000, timed: true }).points).toBe(150);
    expect(scoreRound({ difficulty: 'normal', hintsUsed: 0, fields: { choice: true }, streakAfter: 1, answerMs: 1000, timed: false }).points).toBe(100);
  });

  it('keeps personal bests separate by difficulty, assistance and filters', () => {
    const base = { mode: 'session' as const, difficulty: 'hard' as const, filters: DEFAULT_FILTERS };
    const keys = new Set([
      bestKey(base, false),
      bestKey(base, true),
      bestKey({ ...base, difficulty: 'normal' }, false),
      bestKey({ ...base, filters: { setting: 'street', categories: [] } }, false),
      bestKey({ ...base, mode: 'theme', themeId: 'jdm' }, false),
    ]);
    expect(keys.size).toBe(5);
  });
});

describe('repeat prevention', () => {
  it('shows every car once before any car repeats, across many draws', () => {
    const pool = fullPhotos(ctx.ds);
    const n = distinctVehicles(pool);
    let seen = emptySeen();
    const rng = mulberry32(7);
    for (let cycle = 0; cycle < 3; cycle++) {
      const shown = new Set<string>();
      for (let i = 0; i < n; i++) {
        const r = drawPhoto(pool, seen, rng)!;
        expect(shown.has(r.photo.vehicleId)).toBe(false);
        shown.add(r.photo.vehicleId);
        seen = r.seen;
      }
      expect(shown.size).toBe(n);
    }
  });

  it('never repeats a car back-to-back across a cycle boundary', () => {
    const pool = fullPhotos(ctx.ds).slice(0, 6);
    let seen = emptySeen();
    let last = '';
    const rng = mulberry32(3);
    for (let i = 0; i < 60; i++) {
      const r = drawPhoto(pool, seen, rng)!;
      expect(r.photo.vehicleId).not.toBe(last);
      last = r.photo.vehicleId;
      seen = r.seen;
    }
  });

  it('rotates through a car’s photos before repeating one', () => {
    const pool = fullPhotos(ctx.ds).filter((p) => p.vehicleId === 'mazda-mx5-na');
    expect(pool).toHaveLength(2);
    let seen = emptySeen();
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r = drawPhoto(pool, seen, mulberry32(i))!;
      ids.push(r.photo.id);
      seen = r.seen;
    }
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids[2]).not.toBe(ids[3]);
  });

  it('skips excluded (failed) photos and returns null when nothing is left', () => {
    const pool = fullPhotos(ctx.ds).slice(0, 2);
    const r = drawPhoto(pool, emptySeen(), mulberry32(1), { excludePhotos: new Set([pool[0].id]) })!;
    expect(r.photo.id).toBe(pool[1].id);
    expect(drawPhoto(pool, emptySeen(), mulberry32(1), { excludePhotos: new Set(pool.map((p) => p.id)) })).toBeNull();
  });
});

describe('pools, filters, themes and the daily challenge', () => {
  it('filters by setting and category using dataset tags', () => {
    const studio = applyFilters(ctx.ds, fullPhotos(ctx.ds), { setting: 'studio', categories: [] });
    expect(studio.length).toBeGreaterThan(0);
    expect(studio.every((p) => p.setting === 'studio')).toBe(true);
    const jdm = applyFilters(ctx.ds, fullPhotos(ctx.ds), { setting: 'all', categories: ['jdm'] });
    expect(jdm.every((p) => v(p.vehicleId).categories.includes('jdm'))).toBe(true);
  });

  it('offers only themes with enough verified cars', () => {
    const themes = availableThemes(ctx.ds).map((t) => t.theme.id);
    expect(themes).toContain('jdm');
    expect(themes).toContain('muscle');
    expect(availableThemes(createContext(VEHICLES, photos.slice(0, 2)).ds)).toEqual([]);
  });

  it('selects the same daily cars for the same UTC date', () => {
    const a = dailyPhotos(ctx.ds, '2026-10-03').map((p) => p.id);
    const b = dailyPhotos(ctx.ds, '2026-10-03').map((p) => p.id);
    const c = dailyPhotos(ctx.ds, '2026-10-04').map((p) => p.id);
    expect(a).toEqual(b);
    expect(a).toHaveLength(5);
    expect(new Set(a.map((id) => ctx.ds.photos.find((p) => p.id === id)!.vehicleId)).size).toBe(5);
    expect(a).not.toEqual(c);
  });

  it('uses UTC for the daily key and reset', () => {
    expect(dailyKey(new Date('2026-10-03T23:30:00-05:00'))).toBe('2026-10-04');
    expect(msUntilDailyReset(new Date('2026-10-03T23:00:00Z'))).toBe(3600_000);
  });

  it('is deterministic for a seed', () => {
    expect(seededRng('x')()).toBe(seededRng('x')());
  });
});

describe('hints', () => {
  it('reveal country, then era, then make', () => {
    const h = hintsFor(photoOf('dodge-charger-2g'), v('dodge-charger-2g'));
    expect(h.map((x) => x.label)).toEqual(['Country', 'Era', 'Make']);
    expect(h[1].value).toBe('1960s');
    expect(hintsFor(photoOf('vw-type2-t1'), v('vw-type2-t1'))[1].value).toBe('1950s–1960s');
  });
});
