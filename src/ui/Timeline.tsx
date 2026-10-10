import { useCallback, useEffect, useRef, useState } from 'react';
import { applyTimelineEnd, TIMELINE_XP } from '../game/progress';
import { answerTimeline, nextTimeline, startTimeline, TIMELINE, timelineAvailable, type DuelSide, type TimelineState } from '../game/timeline';
import { buzz, play } from '../lib/sound';
import { EmptyState, Icon, PageHeader } from './components';
import { PhotoCredit, PhotoCreditShort } from './Credit';
import type { Route } from './router';
import { useStore } from './store';

type Side = 'left' | 'right';

/** "Which came first?" — tap the car whose model was introduced first. */
export function Timeline({ go }: { go: (r: Route) => void }) {
  const { ctx, profile, update, settings, pushToast } = useStore();
  const [s, setS] = useState<TimelineState>(() => startTimeline(ctx, Math.random));
  const [result, setResult] = useState<{ best: boolean } | null>(null);
  const saved = useRef(false);

  const choose = useCallback(
    (side: Side) => {
      setS((cur) => {
        const n = answerTimeline(cur, side);
        if (n !== cur && n.last) {
          play(n.last.right ? 'correct' : 'wrong', settings.sound);
          buzz(n.last.right ? 25 : [60, 40, 60], settings.haptics);
        }
        return n;
      });
    },
    [settings.sound, settings.haptics],
  );

  const next = useCallback(() => setS((cur) => (cur.last && !cur.over ? nextTimeline(ctx, cur, Math.random) : cur)), [ctx]);

  const again = () => {
    saved.current = false;
    setResult(null);
    setS(startTimeline(ctx, Math.random));
  };

  // Save once when the game ends.
  useEffect(() => {
    if (!s.over || saved.current || s.answered === 0) return;
    saved.current = true;
    const best = s.correct > profile.timeline.best;
    update((p) => applyTimelineEnd(p, s.correct).profile);
    setResult({ best });
    if (best) {
      play('best', settings.sound);
      pushToast({ icon: '🏆', title: 'New best!', body: `${s.correct} correct in “Which came first?”` });
    }
  }, [s.over, s.answered, s.correct, profile.timeline.best, update, pushToast, settings.sound]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /input|textarea|select/i.test(e.target.tagName)) return;
      if (!s.last && (e.key === '1' || e.key === 'ArrowLeft')) choose('left');
      else if (!s.last && (e.key === '2' || e.key === 'ArrowRight')) choose('right');
      else if (s.last && !s.over && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [s.last, s.over, choose, next]);

  if (!timelineAvailable(ctx)) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6">
        <PageHeader title="Which came first?" onBack={() => go('home')} />
        <EmptyState icon="hourglass" title="Not enough cars yet">
          This game needs verified photos of cars from different eras.
        </EmptyState>
      </div>
    );
  }

  const d = s.duel;
  const older = d ? d[d.older] : null;
  const newer = d ? d[d.older === 'left' ? 'right' : 'left'] : null;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-4 sm:px-6">
      <div className="flex items-center gap-3 py-2">
        <button type="button" className="btn btn-ghost !px-3" onClick={() => go('home')} aria-label="Back to home">
          <Icon name="back" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-lg font-bold">Which came first?</h1>
          <p className="text-xs text-muted">Best {Math.max(profile.timeline.best, result ? s.correct : 0)}</p>
        </div>
        <div className="flex gap-0.5 text-bad" role="img" aria-label={`${s.lives} of ${TIMELINE.lives} lives left`}>
          {Array.from({ length: TIMELINE.lives }, (_, i) => (
            <span key={i} className={i < s.lives ? '' : 'opacity-25'}>
              <Icon name="heart" size={20} />
            </span>
          ))}
        </div>
        <div className="rounded-xl border border-line px-3 py-1 font-display text-lg font-extrabold tabular" aria-label={`${s.correct} correct`}>
          {s.correct}
        </div>
      </div>

      {s.over && result ? (
        <section className="card mt-4 p-6 text-center" aria-live="polite">
          <Icon name="hourglass" size={36} className="mx-auto text-accent" />
          <h2 className="mt-2 font-display text-3xl font-extrabold">{s.correct} correct</h2>
          <p className="mt-1 text-soft">
            {result.best ? 'A new personal best!' : `Your best is ${profile.timeline.best}.`} +{s.correct * TIMELINE_XP} XP
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button type="button" className="btn btn-primary" onClick={again}>
              <Icon name="replay" size={18} /> Play again
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => go('home')}>
              <Icon name="home" size={18} /> Home
            </button>
          </div>
        </section>
      ) : d ? (
        <>
          <p className="mb-3 mt-1 text-center text-soft" aria-live="polite">
            {!s.last ? (
              <>
                Tap the car whose model <strong className="text-text">came out first</strong>.
              </>
            ) : s.last.right ? (
              <span className="font-semibold text-good">
                Right! The {older!.vehicle.make} {older!.vehicle.model} came out {d.gap} year{d.gap === 1 ? '' : 's'} earlier.
              </span>
            ) : (
              <span className="font-semibold text-bad">
                Not quite: the {older!.vehicle.make} {older!.vehicle.model} ({older!.vehicle.years[0]}) is {d.gap} year{d.gap === 1 ? '' : 's'} older than the{' '}
                {newer!.vehicle.make} {newer!.vehicle.model}.
              </span>
            )}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(['left', 'right'] as Side[]).map((side, i) => (
              <DuelCard key={`${side}-${d[side].photo.id}`} side={d[side]} index={i} state={s} sideKey={side} onPick={() => choose(side)} />
            ))}
          </div>
          {s.last && (
            <div className="sticky bottom-3 mt-4 flex justify-center">
              <button type="button" className="btn btn-primary w-full max-w-sm text-lg" onClick={s.over ? () => undefined : next} disabled={s.over} autoFocus>
                {s.over ? 'Game over' : 'Next pair'} <Icon name="next" />
              </button>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function DuelCard({ side, index, state, sideKey, onPick }: { side: DuelSide; index: number; state: TimelineState; sideKey: Side; onPick: () => void }) {
  const revealed = !!state.last;
  const isOlder = state.duel?.older === sideKey;
  const picked = state.last?.picked === sideKey;
  const ring = !revealed ? 'hover:border-accent/60' : isOlder ? 'border-good ring-2 ring-good/50' : picked ? 'border-bad ring-2 ring-bad/40' : 'opacity-80';
  return (
    <div>
      <button
        type="button"
        onClick={onPick}
        disabled={revealed}
        className={`card relative block w-full overflow-hidden text-left transition ${ring}`}
        aria-label={revealed ? `${side.vehicle.make} ${side.vehicle.model}, introduced ${side.vehicle.years[0]}` : `Car ${index + 1}`}
      >
        <img
          src={side.photo.imageSmall}
          srcSet={`${side.photo.imageSmall} 640w, ${side.photo.image} ${side.photo.width}w`}
          sizes="(min-width: 640px) 50vw, 100vw"
          alt={revealed ? `${side.vehicle.make} ${side.vehicle.model}` : `Car ${index + 1}`}
          className="aspect-[3/2] w-full bg-raised object-cover"
        />
        <span className="absolute left-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-ink/80 font-display font-bold text-text">{index + 1}</span>
        {revealed && (
          <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-ink/95 to-ink/0 px-3 pb-2 pt-8">
            <span className="min-w-0">
              <span className="block truncate font-display text-lg font-bold text-white">
                {side.vehicle.make} {side.vehicle.model}
              </span>
              <span className="block text-sm text-white/80">
                {side.vehicle.generation ? `${side.vehicle.generation.name} · ` : ''}introduced {side.vehicle.years[0]}
              </span>
            </span>
            {isOlder && (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-good px-2 py-0.5 text-sm font-bold text-ink">
                <Icon name="check" size={14} /> First
              </span>
            )}
          </span>
        )}
      </button>
      <div className="mt-1 px-1">{revealed ? <PhotoCredit photo={side.photo} /> : <PhotoCreditShort photo={side.photo} />}</div>
    </div>
  );
}
