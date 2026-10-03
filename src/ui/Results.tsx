import type { Achievement } from '../game/achievements';
import { summarize, type RunState } from '../game/engine';
import { formatYearRange } from '../game/matching';
import { MODES, THEMES, type RunConfig } from '../game/modes';
import type { RunOutcome } from '../game/progress';
import { shareText } from '../game/share';
import { EmptyState, Icon, pct } from './components';
import { DIFF_LABEL } from './Home';
import { useStore } from './store';
import { copyOrShare } from './share-util';

const END_TEXT: Record<string, string> = {
  complete: 'Run complete',
  time: 'Time’s up',
  lives: 'Out of lives',
  quit: 'Run ended early',
  exhausted: 'Out of photos',
};

const OUTCOME_ICON = { correct: '🟩', partial: '🟨', wrong: '🟥', skipped: '⬛' } as const;

export function Results({
  run,
  outcome,
  unlocked,
  onExit,
  onAgain,
}: {
  run: RunState;
  outcome: RunOutcome | null;
  unlocked: Achievement[];
  onExit: () => void;
  onAgain: (c: RunConfig) => void;
}) {
  const { ctx, pushToast } = useStore();
  const sum = summarize(run);
  const mode = MODES[run.config.mode];
  const title = run.config.mode === 'theme' ? (THEMES.find((t) => t.id === run.config.themeId)?.name ?? mode.name) : mode.name;

  if (!sum.answered) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <EmptyState
          icon="camera"
          title={run.endReason === 'exhausted' ? 'No photos could be loaded' : 'Nothing to score'}
          action={
            <button type="button" className="btn btn-primary" onClick={onExit}>
              Back to home
            </button>
          }
        >
          {run.endReason === 'exhausted'
            ? 'None of the photos in this selection would load, so nothing was counted. Check your connection and try again.'
            : 'You left before answering anything.'}
        </EmptyState>
      </div>
    );
  }

  const headline =
    outcome?.newBest && sum.score > 0
      ? 'New personal best!'
      : sum.perfect
        ? 'Flawless!'
        : sum.accuracy >= 0.8
          ? 'Sharp eyes.'
          : sum.accuracy >= 0.5
            ? 'Solid run.'
            : 'Keep spotting.';
  const canAgain = run.config.mode !== 'daily';
  const missed = run.results.filter((r) => r.outcome !== 'correct');

  const share = async () => {
    const res = await copyOrShare(shareText(run, location.href.split('#')[0]));
    if (res) pushToast({ icon: '📋', title: res === 'shared' ? 'Shared' : 'Result copied', body: 'Spoiler-free: no car names included.' });
    else pushToast({ icon: '⚠️', title: 'Couldn’t copy', body: 'Select the text in the preview to copy it manually.' });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6">
      <div className="text-center">
        <div className="label">{END_TEXT[run.endReason ?? 'complete']} · {title} · {DIFF_LABEL[run.config.difficulty]}{sum.assisted ? ' · hints used' : ''}</div>
        <h1 className={`anim-pop mt-2 font-display text-4xl font-extrabold tracking-tight sm:text-5xl ${outcome?.newBest && sum.score > 0 ? 'text-accent' : ''}`}>{headline}</h1>
        <div className="mt-4 font-display text-6xl font-extrabold tabular sm:text-7xl">{sum.score.toLocaleString('en-US')}</div>
        <div className="text-muted">points</div>
        {outcome && mode.ranked && run.endReason !== 'quit' && (
          <p className="mt-2 text-sm text-soft">
            {outcome.previousBest
              ? outcome.newBest
                ? `Previous best in this category: ${outcome.previousBest.score.toLocaleString('en-US')}`
                : `Your best in this category: ${outcome.previousBest.score.toLocaleString('en-US')}`
              : 'First score in this category — it’s your best so far.'}
          </p>
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Correct', `${sum.correct}/${sum.answered}`],
          ['Accuracy', pct(sum.accuracy)],
          ['Best streak', String(sum.bestStreak)],
          ['Skipped', String(sum.skipped)],
        ].map(([l, v]) => (
          <div key={l} className="card p-4 text-center">
            <div className="label">{l}</div>
            <div className="mt-1 font-display text-2xl font-extrabold tabular">{v}</div>
          </div>
        ))}
      </div>

      {unlocked.length > 0 && (
        <section className="card mt-4 p-4" aria-label="Achievements unlocked">
          <div className="label !text-accent">Unlocked this run</div>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {unlocked.map((a) => (
              <li key={a.id} className="anim-pop flex items-center gap-3 rounded-xl bg-raised px-3 py-2">
                <span className="text-2xl" aria-hidden="true">{a.icon}</span>
                <span>
                  <span className="block font-semibold">{a.name}</span>
                  <span className="block text-xs text-muted">{a.description}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card mt-4 p-4" aria-label="Round by round">
        <div className="label mb-2">Round by round</div>
        <ol className="divide-y divide-line">
          {run.results.map((r) => {
            const v = ctx.ds.vehicleById.get(r.vehicleId)!;
            const p = ctx.ds.photos.find((x) => x.id === r.photoId);
            return (
              <li key={r.n} className="flex items-center gap-3 py-2.5">
                {p && <img src={p.imageSmall} alt="" loading="lazy" className="h-12 w-16 shrink-0 rounded-lg object-cover" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">
                    {p ? formatYearRange(p.modelYear.from, p.modelYear.to) : ''} {v.make} {v.model}
                  </div>
                  <div className="text-xs text-muted">
                    {r.outcome === 'correct' ? 'Correct' : r.outcome === 'partial' ? 'Partly right' : r.outcome === 'skipped' ? 'Skipped' : 'Missed'}
                    {r.hintsUsed ? ` · ${r.hintsUsed} hint${r.hintsUsed > 1 ? 's' : ''}` : ''}
                  </div>
                </div>
                <span aria-hidden="true">{OUTCOME_ICON[r.outcome]}</span>
                <span className="w-14 text-right font-semibold tabular">+{r.points}</span>
              </li>
            );
          })}
        </ol>
        {missed.length > 0 && <p className="mt-3 text-sm text-muted">Missed cars are saved to your Practice list.</p>}
      </section>

      <section className="card mt-4 p-4" aria-label="Share your result">
        <div className="label mb-2">Share (spoiler-free)</div>
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl bg-ink p-3 text-sm leading-relaxed">{shareText(run)}</pre>
        <button type="button" className="btn btn-ghost mt-3 w-full sm:w-auto" onClick={share}>
          <Icon name="share" size={18} /> Share or copy result
        </button>
      </section>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {canAgain ? (
          <button type="button" className="btn btn-primary text-lg" onClick={() => onAgain(run.config)} autoFocus>
            <Icon name="replay" size={20} /> Play again
          </button>
        ) : (
          <button type="button" className="btn btn-primary text-lg" onClick={onExit} autoFocus>
            Back to home
          </button>
        )}
        <button type="button" className="btn btn-ghost text-lg" onClick={onExit}>
          <Icon name="home" size={20} /> {canAgain ? 'Home & other modes' : 'Try another mode'}
        </button>
      </div>
    </div>
  );
}
