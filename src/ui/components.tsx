import { useEffect, useId, useRef, type ReactNode } from 'react';
import { levelInfo } from '../game/progress';
import { useStore } from './store';

/* ------------------------------------------------------------------ */
/* Icons (inline SVG, stroke-based)                                    */
/* ------------------------------------------------------------------ */

const PATHS: Record<string, string> = {
  close: 'M18 6 6 18M6 6l12 12',
  back: 'M15 18l-6-6 6-6',
  next: 'M9 18l6-6-6-6',
  check: 'M20 6 9 17l-5-5',
  x: 'M18 6 6 18M6 6l12 12',
  bulb: 'M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z',
  skip: 'M5 4l10 8-10 8V4zM19 5v14',
  sound: 'M11 5 6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14',
  mute: 'M11 5 6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6',
  expand: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
  share: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13',
  replay: 'M1 4v6h6M3.5 15a9 9 0 1 0 2.1-9.4L1 10',
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  chart: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  garage: 'M3 21V9l9-6 9 6v12M7 21v-6h10v6M7 18h10',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  flame: 'M12 22c4 0 7-3 7-7 0-4-3-6-4-9-1 2-2 3-4 3 0-2-1-4-3-6 0 4-3 6-3 10 0 5 3 9 7 9z',
  bolt: 'M13 2 3 14h9l-1 8 10-12h-9z',
  calendar: 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM16 2v4M8 2v4M3 10h18',
  target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  zoom: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3M11 8v6M8 11h6',
  infinity: 'M18.2 8.4a5 5 0 1 1 0 7.2L12 12l-6.2-3.6a5 5 0 1 0 0 7.2L12 12z',
  layers: 'M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  repeat: 'M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3',
  flag: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7',
  copy: 'M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  external: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  plus: 'M12 5v14M5 12h14',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  star: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
  hourglass: 'M6 2h12M6 22h12M7 2c0 5 5 7 5 10s-5 5-5 10M17 2c0 5-5 7-5 10s5 5 5 10',
};

export function Icon({ name, size = 20, className = '', label }: { name: keyof typeof PATHS | string; size?: number; className?: string; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      <path d={PATHS[name] ?? PATHS.info} />
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 font-display font-extrabold tracking-tight text-text">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="#1a1e25" />
        <circle cx="32" cy="32" r="18" fill="none" stroke="#f5b83d" strokeWidth="5" />
        <circle cx="32" cy="32" r="6" fill="#f5b83d" />
        <path d="M32 6v10M32 48v10M6 32h10M48 32h10" stroke="#f5b83d" strokeWidth="4" strokeLinecap="round" />
      </svg>
      <span className="text-lg">
        Car<span className="text-accent">Spotter</span>
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <div id={`${id}-l`} className="font-semibold">
          {label}
        </div>
        {description && (
          <div id={`${id}-d`} className="text-sm text-muted">
            {description}
          </div>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-l`}
        aria-describedby={description ? `${id}-d` : undefined}
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-14 shrink-0 rounded-full border transition-colors ${checked ? 'border-accent bg-accent' : 'border-line bg-raised'}`}
      >
        <span className={`absolute top-1 h-6 w-6 rounded-full bg-text shadow transition-all ${checked ? 'left-7 bg-ink' : 'left-1'}`} />
      </button>
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; disabled?: boolean; hint?: string }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          title={o.hint}
          onClick={() => onChange(o.value)}
          className="chip min-h-11 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal?.();
      d.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-label={title}
      className={`m-auto w-[calc(100%-2rem)] ${wide ? 'max-w-3xl' : 'max-w-md'} rounded-3xl border border-line bg-surface p-0 text-text backdrop:bg-black/70`}
    >
      {open && children}
    </dialog>
  );
}

export function Toasts() {
  const { toasts, dismissToast } = useStore();
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-3">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismissToast(t.id)}
          className="anim-rise pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border border-accent/40 bg-raised/95 px-4 py-3 text-left shadow-2xl backdrop-blur"
        >
          <span className="text-2xl" aria-hidden="true">
            {t.icon}
          </span>
          <span>
            <span className="block font-bold">{t.title}</span>
            {t.body && <span className="block text-sm text-soft">{t.body}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

export function LevelBadge({ compact }: { compact?: boolean }) {
  const { profile } = useStore();
  const l = levelInfo(profile.xp);
  return (
    <div className="flex items-center gap-2" title={`${l.into} / ${l.span} XP to next level`}>
      <span className="grid h-8 w-8 place-items-center rounded-full border border-accent/60 bg-accent/10 text-sm font-bold text-accent tabular">
        {l.level}
      </span>
      {!compact && (
        <div className="hidden min-w-24 sm:block">
          <div className="text-xs font-semibold leading-tight">{l.title}</div>
          <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Level progress" aria-valuemin={0} aria-valuemax={l.span} aria-valuenow={l.into}>
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(l.progress * 100)}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-raised text-accent">
        <Icon name={icon} size={28} />
      </div>
      <h2 className="font-display text-xl font-bold">{title}</h2>
      {children && <div className="max-w-md text-soft">{children}</div>}
      {action}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-raised/60 p-4">
      <div className="label">{label}</div>
      <div className="mt-1 font-display text-2xl font-extrabold tabular">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <div className="mb-6 flex items-start gap-3">
      <button type="button" onClick={onBack} className="btn btn-ghost h-12 w-12 shrink-0 p-0" aria-label="Back to home">
        <Icon name="back" />
      </button>
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="text-soft">{subtitle}</p>}
      </div>
    </div>
  );
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;
