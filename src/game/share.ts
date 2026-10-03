/**
 * Spoiler-free result text: no car names, makes or photos — only outcomes.
 */
import type { RunState } from './engine';
import { summarize } from './engine';
import { MODES, THEMES } from './modes';

const MARK = { correct: '🟩', partial: '🟨', wrong: '🟥', skipped: '⬛' } as const;
const DIFF = { normal: 'Normal', hard: 'Hard', expert: 'Expert' } as const;

export function shareText(run: RunState, url?: string): string {
  const s = summarize(run);
  const c = run.config;
  const title =
    c.mode === 'daily'
      ? `CarSpotter Daily ${c.dailyKey}`
      : c.mode === 'theme'
        ? `CarSpotter · ${THEMES.find((t) => t.id === c.themeId)?.name ?? 'Theme'}`
        : `CarSpotter · ${MODES[c.mode].name}`;
  const marks = run.results.map((r) => MARK[r.outcome]);
  // Wrap long open-ended runs onto several lines of 10.
  const rows: string[] = [];
  for (let i = 0; i < marks.length; i += 10) rows.push(marks.slice(i, i + 10).join(''));
  const lines = [
    `${title} · ${DIFF[c.difficulty]}${s.assisted ? ' · hints' : ''}`,
    ...rows,
    `${s.correct}/${s.answered} · ${s.score.toLocaleString('en-US')} pts · best streak ${s.bestStreak}`,
  ];
  if (url) lines.push(url);
  return lines.join('\n');
}
