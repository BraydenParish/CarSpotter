/**
 * Tiny synthesized sound effects (Web Audio) — no audio files to download.
 * Every call is a no-op when sound is disabled or Web Audio is unavailable.
 */
export type Sfx = 'correct' | 'partial' | 'wrong' | 'skip' | 'streak' | 'best' | 'unlock' | 'tick' | 'click';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(ac: AudioContext, freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.12) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, ac.currentTime + start);
  g.gain.setValueAtTime(0.0001, ac.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, ac.currentTime + start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur);
  o.connect(g).connect(ac.destination);
  o.start(ac.currentTime + start);
  o.stop(ac.currentTime + start + dur + 0.02);
}

const PATTERNS: Record<Sfx, [number, number, number, OscillatorType?, number?][]> = {
  correct: [[660, 0, 0.12, 'triangle'], [990, 0.08, 0.18, 'triangle']],
  partial: [[520, 0, 0.12, 'triangle'], [620, 0.09, 0.16, 'triangle']],
  wrong: [[220, 0, 0.18, 'sawtooth', 0.05], [165, 0.12, 0.24, 'sawtooth', 0.05]],
  skip: [[300, 0, 0.12, 'sine', 0.06]],
  streak: [[660, 0, 0.1, 'triangle'], [880, 0.08, 0.1, 'triangle'], [1100, 0.16, 0.1, 'triangle'], [1320, 0.24, 0.22, 'triangle']],
  best: [[523, 0, 0.14, 'triangle'], [659, 0.12, 0.14, 'triangle'], [784, 0.24, 0.14, 'triangle'], [1047, 0.36, 0.36, 'triangle']],
  unlock: [[880, 0, 0.1, 'sine'], [1320, 0.1, 0.25, 'sine']],
  tick: [[1200, 0, 0.04, 'square', 0.03]],
  click: [[700, 0, 0.03, 'sine', 0.04]],
};

export function play(sfx: Sfx, enabled: boolean): void {
  if (!enabled) return;
  const ac = audio();
  if (!ac) return;
  for (const [f, s, d, t, g] of PATTERNS[sfx]) tone(ac, f, s, d, t, g);
}

export function buzz(pattern: number | number[], enabled: boolean): void {
  if (!enabled) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}
