import { describe, expect, it } from 'vitest';
import { createContext, VEHICLES } from '../data/dataset';
import { fixturePhotos } from '../dev/fixtures';
import { applyTimelineEnd, newProfile } from './progress';
import { mulberry32 } from './rng';
import { answerTimeline, makeDuel, minGap, nextTimeline, startTimeline, TIMELINE, timelineAvailable } from './timeline';

const ctx = createContext(VEHICLES, fixturePhotos(VEHICLES));

describe('Which came first?', () => {
  it('is available with the fixture set', () => {
    expect(timelineAvailable(ctx)).toBe(true);
    expect(timelineAvailable(createContext(VEHICLES, []))).toBe(false);
  });

  it('pairs two different cars far enough apart, and knows which came first', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const correct = i % 20;
      const d = makeDuel(ctx, correct, [], rng)!;
      expect(d.left.vehicle.id).not.toBe(d.right.vehicle.id);
      expect(d.gap).toBe(Math.abs(d.left.vehicle.years[0] - d.right.vehicle.years[0]));
      expect(d.gap).toBeGreaterThanOrEqual(minGap(correct));
      const older = d[d.older].vehicle.years[0];
      const newer = d[d.older === 'left' ? 'right' : 'left'].vehicle.years[0];
      expect(older).toBeLessThan(newer);
      expect(d.left.photo.vehicleId).toBe(d.left.vehicle.id);
      expect(d.right.photo.vehicleId).toBe(d.right.vehicle.id);
    }
  });

  it('narrows the gap as the score grows', () => {
    expect(minGap(0)).toBe(15);
    expect(minGap(4)).toBe(10);
    expect(minGap(8)).toBe(6);
    expect(minGap(20)).toBe(3);
  });

  it('counts answers, takes a life for each miss and ends at zero lives', () => {
    const rng = mulberry32(3);
    let s = startTimeline(ctx, rng);
    expect(s.lives).toBe(TIMELINE.lives);
    s = answerTimeline(s, s.duel!.older);
    expect(s.correct).toBe(1);
    expect(answerTimeline(s, 'left')).toBe(s); // already answered: ignored
    for (let i = 0; i < TIMELINE.lives; i++) {
      s = nextTimeline(ctx, s, rng);
      expect(s.last).toBeNull();
      s = answerTimeline(s, s.duel!.older === 'left' ? 'right' : 'left');
    }
    expect(s.lives).toBe(0);
    expect(s.over).toBe(true);
    expect(s.answered).toBe(TIMELINE.lives + 1);
    expect(nextTimeline(ctx, s, rng)).toBe(s);
  });

  it('avoids reusing recent cars', () => {
    const rng = mulberry32(11);
    let s = startTimeline(ctx, rng);
    for (let i = 0; i < 15; i++) {
      const before = s.recent.slice(-4);
      s = nextTimeline(ctx, answerTimeline(s, s.duel!.older), rng);
      for (const id of [s.duel!.left.vehicle.id, s.duel!.right.vehicle.id]) expect(before).not.toContain(id);
    }
  });

  it('records bests and XP in the profile', () => {
    const p = newProfile();
    const a = applyTimelineEnd(p, 7);
    expect(a.newBest).toBe(true);
    expect(a.profile.timeline).toEqual({ best: 7, played: 1 });
    expect(a.profile.xp).toBeGreaterThan(p.xp);
    const b = applyTimelineEnd(a.profile, 3);
    expect(b.newBest).toBe(false);
    expect(b.profile.timeline).toEqual({ best: 7, played: 2 });
  });
});
