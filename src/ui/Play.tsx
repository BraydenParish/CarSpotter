import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Achievement } from '../game/achievements';
import {
  next as nextRound,
  photoFailed,
  photoLoaded,
  quit as quitRun,
  remainingMs,
  skip as skipRound,
  submitChoice,
  submitTyped,
  tick,
  useHint,
  type RoundResult,
  type RunState,
} from '../game/engine';
import type { Choice } from '../game/distractors';
import { expertRequirement } from '../game/expert';
import { hintsFor } from '../game/hints';
import { formatYearRange } from '../game/matching';
import { MODES, SURVIVAL, THEMES, type RunConfig } from '../game/modes';
import { applyRound, applyRunEnd, type RunOutcome } from '../game/progress';
import { availablePoints, MAX_HINTS } from '../game/scoring';
import { buzz, play } from '../lib/sound';
import { Icon, Modal } from './components';
import { PhotoCredit, PhotoCreditShort } from './Credit';
import { DIFF_LABEL } from './Home';
import { Results } from './Results';
import { useStore } from './store';

const FIELD_LABEL: Record<string, string> = { choice: 'Answer', make: 'Make', model: 'Model', year: 'Year', generation: 'Generation' };

export function Play({
  initial,
  onExit,
  onAgain,
}: {
  initial: RunState;
  onExit: () => void;
  onAgain: (config: RunConfig) => void;
}) {
  const { ctx, settings, updateAndCheck, pushToast } = useStore();
  const [s, setS] = useState<RunState>(initial);
  const sRef = useRef(s);
  const [now, setNow] = useState(() => Date.now());
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const [unlocked, setUnlocked] = useState<Achievement[]>([]);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [slow, setSlow] = useState(false);
  const finalized = useRef(false);

  const commit = useCallback((n: RunState) => {
    sRef.current = n;
    setS(n);
  }, []);

  /** Persist a settled round and fire feedback. */
  const afterSettle = useCallback(
    (prev: RunState, n: RunState) => {
      if (n.results.length <= prev.results.length) return;
      const round: RoundResult = n.results[n.results.length - 1];
      const fresh = updateAndCheck((p) => applyRound(p, ctx, n, round), n);
      if (fresh.length) {
        setUnlocked((u) => [...u, ...fresh]);
        play('unlock', settings.sound);
        for (const a of fresh) pushToast({ icon: a.icon, title: `Achievement: ${a.name}`, body: a.description });
      }
      if (round.outcome === 'correct') {
        const milestone = round.streakAfter > 0 && round.streakAfter % 5 === 0;
        play(milestone ? 'streak' : 'correct', settings.sound);
        buzz(milestone ? [30, 40, 30, 40, 60] : 25, settings.haptics);
        if (milestone) pushToast({ icon: '🔥', title: `${round.streakAfter} in a row!`, body: 'Streak bonus is climbing.' });
      } else if (round.outcome === 'partial') {
        play('partial', settings.sound);
        buzz(20, settings.haptics);
      } else if (round.outcome === 'wrong') {
        play('wrong', settings.sound);
        buzz([60, 40, 60], settings.haptics);
      } else {
        play('skip', settings.sound);
      }
    },
    [ctx, settings.sound, settings.haptics, updateAndCheck, pushToast],
  );

  /* --- answering -------------------------------------------------- */
  const onChoice = (key: string) => {
    const prev = sRef.current;
    const n = submitChoice(prev, key, Date.now());
    if (n === prev) return;
    commit(n);
    afterSettle(prev, n);
  };
  const onTyped = (a: { make: string; model: string; extra?: string }) => {
    const prev = sRef.current;
    const n = submitTyped(ctx, prev, a, Date.now());
    if (n === prev) return;
    commit(n);
    afterSettle(prev, n);
  };
  const onSkip = () => {
    const prev = sRef.current;
    const n = skipRound(prev, Date.now());
    if (n === prev) return;
    commit(n);
    afterSettle(prev, n);
  };
  const onHint = () => {
    play('click', settings.sound);
    commit(useHint(sRef.current));
  };
  const onNext = useCallback(() => {
    const prev = sRef.current;
    if (prev.phase !== 'reveal') return;
    setSlow(false);
    commit(nextRound(ctx, prev, Math.random));
  }, [ctx, commit]);

  /* --- photo lifecycle -------------------------------------------- */
  const q = s.question;
  const onImageLoad = useCallback(() => {
    setSlow(false);
    const prev = sRef.current;
    if (prev.phase === 'loading') commit(photoLoaded(prev, Date.now()));
  }, [commit]);
  const onImageError = useCallback(() => {
    const prev = sRef.current;
    if (prev.phase !== 'loading' && prev.phase !== 'question') return;
    commit(photoFailed(ctx, prev, Math.random, Date.now()));
    setSlow(false);
    pushToast({ icon: '🖼️', title: 'A photo failed to load', body: 'We swapped it for another. Nothing was counted against you.' });
  }, [ctx, commit, pushToast]);

  // Slow-load escape hatch.
  useEffect(() => {
    if (s.phase !== 'loading') return;
    const t = window.setTimeout(() => setSlow(true), 8000);
    return () => window.clearTimeout(t);
  }, [s.phase, q?.photo.id]);

  // Preload the next photo.
  const upcomingSrc = s.upcoming?.photo.image;
  useEffect(() => {
    if (!upcomingSrc) return;
    const img = new Image();
    img.decoding = 'async';
    img.src = upcomingSrc;
  }, [upcomingSrc]);

  /* --- Time Attack clock ------------------------------------------ */
  const timed = s.clockMs !== null;
  useEffect(() => {
    if (!timed || s.phase === 'finished') return;
    const t = window.setInterval(() => {
      const n = Date.now();
      setNow(n);
      const prev = sRef.current;
      const after = tick(prev, n);
      if (after !== prev) commit(after);
    }, 100);
    return () => window.clearInterval(t);
  }, [timed, s.phase, commit]);
  const remaining = remainingMs(s, now);
  const lastTickSecond = useRef<number | null>(null);
  useEffect(() => {
    if (remaining === null || s.phase !== 'question') return;
    const sec = Math.ceil(remaining / 1000);
    if (sec <= 5 && sec > 0 && lastTickSecond.current !== sec) {
      lastTickSecond.current = sec;
      play('tick', settings.sound);
    }
  }, [remaining, s.phase, settings.sound]);

  /* --- Finish ------------------------------------------------------ */
  useEffect(() => {
    if (s.phase !== 'finished' || finalized.current) return;
    finalized.current = true;
    let out: RunOutcome | null = null;
    const fresh = updateAndCheck((p) => {
      out = applyRunEnd(p, s);
      return out.profile;
    }, s);
    setOutcome(out);
    if (fresh.length) {
      setUnlocked((u) => [...u, ...fresh]);
      for (const a of fresh) pushToast({ icon: a.icon, title: `Achievement: ${a.name}`, body: a.description });
    }
    const o = out as RunOutcome | null;
    if (o?.newBest) {
      play('best', settings.sound);
      buzz([40, 40, 40, 40, 90], settings.haptics);
    }
  }, [s, updateAndCheck, pushToast, settings.sound, settings.haptics]);

  /* --- Keyboard shortcuts ------------------------------------------ */
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      const cur = sRef.current;
      if (cur.phase === 'reveal' && !typing && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight')) {
        if (el && (el.tagName === 'BUTTON' || el.tagName === 'A') && e.key !== 'ArrowRight') return; // let buttons handle themselves
        e.preventDefault();
        onNext();
      }
      if (cur.phase === 'question' && !typing && cur.question?.choices && /^[1-4]$/.test(e.key)) {
        const choice = cur.question.choices[Number(e.key) - 1];
        if (choice) onChoice(choice.key);
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onNext]);

  /* --- Auto-advance ------------------------------------------------- */
  const last = s.results[s.results.length - 1];
  const autoMs = settings.autoAdvance > 0 && last ? settings.autoAdvance + (last.outcome === 'correct' ? 0 : 2500) : 0;
  useEffect(() => {
    if (s.phase !== 'reveal' || !autoMs) return;
    const t = window.setTimeout(onNext, autoMs);
    return () => window.clearTimeout(t);
  }, [s.phase, s.results.length, autoMs, onNext]);

  /* --- Finished: results ------------------------------------------- */
  if (s.phase === 'finished') {
    return <Results run={s} outcome={outcome} unlocked={unlocked} onExit={onExit} onAgain={onAgain} />;
  }

  const mode = MODES[s.config.mode];
  const title =
    s.config.mode === 'theme' ? (THEMES.find((t) => t.id === s.config.themeId)?.name ?? mode.name) : mode.name;
  const roundLabel = s.totalRounds ? `${Math.min(s.results.length + (s.phase === 'reveal' ? 0 : 1), s.totalRounds)} / ${s.totalRounds}` : `Round ${(q?.n ?? 1)}`;
  const revealed = s.phase === 'reveal';

  return (
    <div className="mx-auto flex min-h-dvh max-w-4xl flex-col px-3 pb-4 pt-2 sm:px-6">
      {/* HUD */}
      <header className="flex items-center gap-2 py-1">
        <button type="button" className="btn btn-ghost h-11 w-11 shrink-0 p-0" onClick={() => (s.results.length ? setConfirmQuit(true) : onExit())} aria-label="Leave run">
          <Icon name="close" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{title}</div>
          <div className="text-xs text-muted">
            {DIFF_LABEL[s.config.difficulty]} · {roundLabel}
          </div>
        </div>
        {s.lives !== null && (
          <div className="flex gap-0.5 text-bad" role="img" aria-label={`${s.lives} of ${SURVIVAL.lives} lives left`}>
            {Array.from({ length: SURVIVAL.lives }, (_, i) => (
              <span key={i} className={i < s.lives! ? '' : 'opacity-25'}>
                <Icon name="heart" size={20} />
              </span>
            ))}
          </div>
        )}
        {timed && remaining !== null && (
          <div
            className={`rounded-xl border px-3 py-1 font-display text-lg font-extrabold tabular ${remaining < 10_000 ? 'border-bad text-bad' : 'border-line'}`}
            role="timer"
            aria-label={`${Math.ceil(remaining / 1000)} seconds left`}
          >
            {(remaining / 1000).toFixed(1)}s
          </div>
        )}
        <div className="flex items-center gap-1 rounded-xl border border-line px-2.5 py-1 text-sm" aria-label={`Streak ${s.streak}`}>
          <span className={`text-accent ${s.streak >= 3 ? 'anim-flame' : ''}`}>
            <Icon name="flame" size={16} />
          </span>
          <span className="font-bold tabular">{s.streak}</span>
        </div>
        <div className="text-right">
          <div className="label !text-[10px]">Score</div>
          <div className="font-display text-xl font-extrabold leading-none tabular" aria-live="polite">
            {s.score.toLocaleString('en-US')}
          </div>
        </div>
      </header>

      {/* Photo */}
      {q && (
        <figure className="relative mt-1 flex min-h-[200px] items-center justify-center overflow-hidden rounded-3xl border border-line bg-black">
          <img
            key={q.photo.id}
            ref={(el) => {
              if (el && el.complete && el.naturalWidth > 0) queueMicrotask(onImageLoad);
            }}
            src={q.photo.image}
            width={q.photo.width}
            height={q.photo.height}
            alt={revealed && last ? `${formatYearRange(q.photo.modelYear.from, q.photo.modelYear.to)} ${q.vehicle.make} ${q.vehicle.model}` : q.photo.kind === 'detail' ? 'Close-up detail of a car to identify' : 'A car to identify'}
            onLoad={onImageLoad}
            onError={onImageError}
            decoding="async"
            className={`block h-auto max-h-[44dvh] w-auto max-w-full object-contain transition-opacity duration-200 sm:max-h-[50dvh] ${s.phase === 'loading' ? 'opacity-0' : 'opacity-100'}`}
          />
          {s.phase === 'loading' && (
            <div className="absolute inset-0 grid place-items-center bg-surface" role="status">
              <div className="flex flex-col items-center gap-3 text-muted">
                <div className="h-9 w-9 animate-spin rounded-full border-4 border-line border-t-accent motion-reduce:animate-none" />
                <span>Loading photo…</span>
                {slow && (
                  <button type="button" className="btn btn-ghost" onClick={onImageError}>
                    Taking long — try another photo
                  </button>
                )}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full bg-black/60 text-text backdrop-blur hover:bg-black/80"
            aria-label="View photo larger"
          >
            <Icon name="expand" size={18} />
          </button>
          {q.photo.kind === 'detail' && !revealed && (
            <figcaption className="absolute bottom-3 left-3 rounded-full bg-black/65 px-3 py-1 text-xs font-semibold capitalize backdrop-blur">
              Detail · {q.photo.detailPart}
            </figcaption>
          )}
        </figure>
      )}
      {q && !revealed && (
        <div className="mt-1.5 px-1">
          <PhotoCreditShort photo={q.photo} />
        </div>
      )}

      {/* Question / reveal */}
      {q && s.phase !== 'reveal' && (
        <section className="mt-3 flex flex-1 flex-col gap-3" aria-label="Your answer">
          {s.config.hintsEnabled && s.phase === 'question' && <HintBar s={s} onHint={onHint} />}
          {q.choices ? (
            <Choices key={q.photo.id} choices={q.choices} disabled={s.phase !== 'question'} onPick={onChoice} />
          ) : (
            <TypedForm key={q.photo.id} s={s} disabled={s.phase !== 'question'} onSubmit={onTyped} />
          )}
          <div className="mt-auto flex items-center justify-between pt-1">
            <button type="button" className="btn btn-ghost" onClick={onSkip} disabled={s.phase !== 'question'}>
              <Icon name="skip" size={18} /> Skip & reveal
            </button>
            <span className="text-xs text-muted">
              {q.choices ? 'Keys 1–4 also work' : 'Enter to submit'}
              {s.config.mode === 'survival' ? ' · skip costs a life' : timed ? ' · skip costs 3 s' : ''}
            </span>
          </div>
        </section>
      )}

      {q && revealed && last && <Reveal s={s} last={last} autoMs={autoMs} onNext={onNext} onChoice={q.choices} />}

      <Modal open={expanded} onClose={() => setExpanded(false)} title="Photo" wide>
        <div className="p-2">
          {q && <img src={q.photo.image} alt={revealed && last ? `${q.vehicle.make} ${q.vehicle.model}` : 'A car to identify'} className="max-h-[80dvh] w-full rounded-2xl object-contain" />}
          <button type="button" className="btn btn-ghost mt-2 w-full" onClick={() => setExpanded(false)}>
            Close
          </button>
        </div>
      </Modal>

      <Modal open={confirmQuit} onClose={() => setConfirmQuit(false)} title="Leave this run?">
        <div className="p-6">
          <h2 className="font-display text-xl font-bold">Leave this run?</h2>
          <p className="mt-2 text-soft">
            Your answers so far are already saved to your stats and garage.
            {mode.ranked ? ' A run you leave early doesn’t set a personal best.' : ''}
            {s.config.mode === 'daily' ? ' Leaving today’s challenge early counts as your attempt.' : ''}
          </p>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmQuit(false)}>
              Keep playing
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setConfirmQuit(false);
                commit(quitRun(sRef.current, Date.now()));
              }}
            >
              End run
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function HintBar({ s, onHint }: { s: RunState; onHint: () => void }) {
  const q = s.question!;
  const hints = hintsFor(q.photo, q.vehicle);
  const avail = availablePoints(s.config.difficulty, s.hintsUsed);
  const nextAvail = availablePoints(s.config.difficulty, s.hintsUsed + 1);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn btn-ghost !min-h-11 !px-3 text-sm" onClick={onHint} disabled={s.hintsUsed >= MAX_HINTS}>
        <Icon name="bulb" size={16} />
        {s.hintsUsed >= MAX_HINTS ? 'No hints left' : `Hint (${hints[s.hintsUsed].label}) · −${avail - nextAvail}`}
      </button>
      {hints.slice(0, s.hintsUsed).map((h) => (
        <span key={h.label} className="chip anim-pop !min-h-11" role="status">
          <span className="text-muted">{h.label}</span> <span className="font-semibold text-text">{h.value}</span>
        </span>
      ))}
      <span className="ml-auto text-xs text-muted tabular">{avail} pts available</span>
    </div>
  );
}

function Choices({
  choices,
  disabled,
  onPick,
  result,
  compact,
}: {
  choices: Choice[];
  disabled: boolean;
  onPick: (key: string) => void;
  result?: { picked: string | null };
  compact?: boolean;
}) {
  return (
    <div className={`grid gap-2.5 ${compact ? '' : 'sm:grid-cols-2'}`} role="group" aria-label={compact ? 'Your answer and the correct answer' : 'Answer choices'}>
      {choices.map((c, i) => {
        const showCorrect = !!result && c.correct;
        const showWrong = !!result && result.picked === c.key && !c.correct;
        return (
          <button
            key={c.key}
            type="button"
            disabled={disabled}
            onClick={() => onPick(c.key)}
            aria-label={`${compact ? '' : `${i + 1}. `}${c.label}${showCorrect ? ' (correct answer)' : showWrong ? ' (your answer, incorrect)' : ''}`}
            className={`btn ${compact ? '!min-h-12' : '!min-h-16'} !justify-start gap-3 !rounded-2xl border px-4 text-left text-base disabled:!opacity-100 ${
              showCorrect
                ? 'anim-glow border-good bg-good/15 text-text'
                : showWrong
                  ? 'anim-shake border-bad bg-bad/15 text-text'
                  : result
                    ? 'border-line bg-raised/50 text-muted'
                    : 'border-line bg-raised hover:border-accent/60 hover:bg-[#20252d]'
            }`}
          >
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-bold ${showCorrect ? 'bg-good text-ink' : showWrong ? 'bg-bad text-ink' : 'bg-ink text-muted'}`}>
              {showCorrect ? <Icon name="check" size={16} /> : showWrong ? <Icon name="x" size={16} /> : i + 1}
            </span>
            <span className="font-semibold">{c.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function TypedForm({ s, disabled, onSubmit }: { s: RunState; disabled: boolean; onSubmit: (a: { make: string; model: string; extra?: string }) => void }) {
  const q = s.question!;
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [extra, setExtra] = useState('');
  const makeRef = useRef<HTMLInputElement>(null);
  const expert = s.config.difficulty === 'expert';
  const field = q.expertField;
  const fine = typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches;
  useEffect(() => {
    if (fine && !disabled) makeRef.current?.focus();
  }, [fine, disabled]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (disabled) return;
    if (!make.trim() && !model.trim() && !extra.trim()) return;
    onSubmit({ make, model, extra: expert ? extra : undefined });
  };
  const common = { autoComplete: 'off', autoCorrect: 'off', autoCapitalize: 'off', spellCheck: false, disabled } as const;
  const empty = !make.trim() && !model.trim() && !extra.trim();

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      {expert && field && (
        <p className="rounded-2xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-soft" id="expert-req">
          <span className="font-semibold text-accent">Expert: </span>
          {expertRequirement(q.photo, field)}
        </p>
      )}
      <div className={`grid gap-3 ${expert ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        <label className="block">
          <span className="label mb-1 block">Make</span>
          <input ref={makeRef} className="field" name="make" placeholder="e.g. Toyota" value={make} onChange={(e) => setMake(e.target.value)} enterKeyHint="next" {...common} />
        </label>
        <label className="block">
          <span className="label mb-1 block">Model</span>
          <input className="field" name="model" placeholder="e.g. Supra" value={model} onChange={(e) => setModel(e.target.value)} enterKeyHint={expert ? 'next' : 'done'} {...common} />
        </label>
        {expert && field && (
          <label className="block">
            <span className="label mb-1 block">{field === 'year' ? 'Model year' : 'Generation'}</span>
            <input
              className="field"
              name="extra"
              placeholder={field === 'year' ? 'e.g. 1995' : 'e.g. Mk2 or E30'}
              inputMode={field === 'year' ? 'numeric' : 'text'}
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              aria-describedby="expert-req"
              enterKeyHint="done"
              {...common}
            />
          </label>
        )}
      </div>
      <button type="submit" className="btn btn-primary w-full text-lg" disabled={disabled || empty}>
        Submit answer
      </button>
    </form>
  );
}

function Reveal({ s, last, autoMs, onNext, onChoice }: { s: RunState; last: RoundResult; autoMs: number; onNext: () => void; onChoice: Choice[] | null }) {
  const q = s.question!;
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    nextRef.current?.focus({ preventScroll: false });
  }, [last.n]);

  const heading =
    last.outcome === 'correct'
      ? 'Correct!'
      : last.outcome === 'partial'
        ? 'Close — partial credit'
        : last.outcome === 'skipped'
          ? 'Skipped'
          : 'Not quite';
  const tone = last.outcome === 'correct' ? 'text-good' : last.outcome === 'partial' ? 'text-warn' : last.outcome === 'skipped' ? 'text-soft' : 'text-bad';
  const b = last.breakdown;
  const endsRun =
    (s.lives !== null && s.lives <= 0) || (s.clockMs !== null && s.clockMs <= 0) || (s.totalRounds !== null && s.results.length >= s.totalRounds) || !s.upcoming;
  const picked = last.fields?.choice?.input ? (onChoice?.find((c) => c.label === last.fields!.choice.input)?.key ?? null) : null;

  return (
    <section className="anim-rise mt-3 flex flex-1 flex-col gap-3" aria-label="Answer reveal" aria-live="polite">
      {onChoice && (
        <Choices
          choices={onChoice.filter((c) => c.correct || c.key === picked)}
          disabled
          onPick={() => {}}
          result={{ picked }}
          compact
        />
      )}

      <div className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className={`anim-pop font-display text-2xl font-extrabold ${tone}`}>{heading}</h2>
          <div className="font-display text-xl font-extrabold tabular">
            {last.points > 0 ? `+${last.points}` : '+0'} <span className="text-sm font-semibold text-muted">pts</span>
          </div>
        </div>

        <p className="mt-1 text-xl font-bold leading-tight sm:text-2xl">
          {formatYearRange(q.photo.modelYear.from, q.photo.modelYear.to)} {q.vehicle.make} {q.vehicle.model}
        </p>
        <p className="text-sm text-muted">
          {q.vehicle.generation ? `${q.vehicle.generation.name} · ` : ''}
          {q.vehicle.country} · {q.vehicle.bodyStyle}
          {q.photo.kind === 'detail' ? ` · ${q.photo.detailPart} detail` : ''}
        </p>

        {last.fields && !onChoice && (
          <ul className="mt-3 grid gap-2 sm:grid-cols-3" aria-label="Field results">
            {Object.entries(last.fields).map(([name, f]) => (
              <li key={name} className={`rounded-xl border px-3 py-2 text-sm ${f.correct ? 'border-good/50 bg-good/10' : 'border-bad/50 bg-bad/10'}`}>
                <div className="flex items-center gap-1.5 font-semibold">
                  <span className={f.correct ? 'text-good' : 'text-bad'}>
                    <Icon name={f.correct ? 'check' : 'x'} size={14} />
                  </span>
                  {FIELD_LABEL[name] ?? name}
                  <span className="sr-only">{f.correct ? 'correct' : 'incorrect'}</span>
                </div>
                <div className="truncate text-muted">{f.input.trim() ? `You: ${f.input}` : 'You: —'}</div>
                {!f.correct && <div className="truncate text-soft">Answer: {f.expected}</div>}
                {f.correct && f.kind === 'alias' && <div className="text-xs text-muted">Accepted as “{f.expected}”</div>}
                {f.correct && name === 'year' && f.expected.includes('–') && <div className="text-xs text-muted">Any year in {f.expected} counts: the photo can’t tell them apart</div>}
                {f.note && <div className="text-xs text-muted">{f.note}</div>}
              </li>
            ))}
          </ul>
        )}

        {b && b.points > 0 && (
          <p className="mt-3 text-xs text-muted tabular">
            Base {b.base}
            {b.fieldFraction < 1 ? ` × ${Math.round(b.fieldFraction * 100)}% of fields` : ''}
            {b.hintMultiplier < 1 ? ` × ${Math.round(b.hintMultiplier * 100)}% (hints)` : ''}
            {b.streakBonus > 0 ? ` + ${Math.round(b.streakBonus * 100)}% streak` : ''}
            {b.speedBonus > 0 ? ` + ${Math.round(b.speedBonus * 100)}% speed` : ''}
          </p>
        )}
        {(last.clockDelta !== 0 || last.lifeDelta !== 0) && (
          <p className="mt-1 text-sm font-semibold">
            {last.clockDelta !== 0 && <span className={last.clockDelta > 0 ? 'text-good' : 'text-bad'}>{last.clockDelta > 0 ? '+' : '−'}{Math.abs(last.clockDelta / 1000)} s </span>}
            {last.lifeDelta !== 0 && <span className={last.lifeDelta > 0 ? 'text-good' : 'text-bad'}>{last.lifeDelta > 0 ? '+1 life' : '−1 life'}</span>}
          </p>
        )}

        {q.vehicle.tip && (
          <div className="mt-4 rounded-2xl bg-raised p-3.5">
            <div className="label !text-accent">Spotting tip</div>
            <p className="mt-1 text-soft">{q.vehicle.tip}</p>
          </div>
        )}
        <details className="mt-3 text-sm text-muted">
          <summary className="cursor-pointer select-none py-1 hover:text-soft">Why this answer? Sources & photo credit</summary>
          <div className="space-y-2 pb-1 pt-2">
            <p>
              <span className="font-semibold text-soft">Year evidence:</span> {q.photo.modelYear.basis}
            </p>
            <p>
              <a href={q.vehicle.referenceUrl} target="_blank" rel="noopener noreferrer" className="text-soft underline underline-offset-2">
                Vehicle reference
              </a>
              {q.photo.identityEvidence
                .filter((u) => /^https:\/\//.test(u))
                .map((u, i) => (
                  <span key={u}>
                    {' · '}
                    <a href={u} target="_blank" rel="noopener noreferrer" className="text-soft underline underline-offset-2">
                      Identity evidence {i + 1}
                    </a>
                  </span>
                ))}
            </p>
            <PhotoCredit photo={q.photo} />
          </div>
        </details>
      </div>

      <div className="sticky bottom-3 mt-auto">
        <button ref={nextRef} type="button" className="btn btn-primary relative w-full overflow-hidden text-lg shadow-xl" onClick={onNext}>
          {autoMs > 0 && (
            <span
              key={last.n}
              aria-hidden="true"
              className="countdown-bar absolute inset-x-0 bottom-0 h-1 bg-black/35"
              style={{ animationDuration: `${autoMs}ms` }}
            />
          )}
          {endsRun ? 'See results' : 'Next car'} <Icon name="next" />
        </button>
        <p className="mt-1 text-center text-xs text-muted">{autoMs > 0 ? 'Auto-advancing — press Next to go now' : 'Press Enter or → for the next car'}</p>
      </div>
    </section>
  );
}
