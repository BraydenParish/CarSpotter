/**
 * App-wide state: the game data context and the persisted player profile.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { GameContext } from '../game/context';
import type { Profile, Settings } from '../game/progress';
import { checkAchievements, type Achievement } from '../game/achievements';
import type { RunState } from '../game/engine';
import { clearProfile, loadProfile, saveProfile, storageKey } from '../lib/storage';
import { newProfile } from '../game/progress';

export interface Toast {
  id: number;
  icon: string;
  title: string;
  body?: string;
}

interface Store {
  ctx: GameContext;
  fixtures: boolean;
  profile: Profile;
  settings: Settings;
  storageOk: boolean;
  update: (fn: (p: Profile) => Profile) => void;
  /** Apply a profile change, then check achievements; returns newly unlocked ones. */
  updateAndCheck: (fn: (p: Profile) => Profile, run: RunState | null) => Achievement[];
  setSettings: (patch: Partial<Settings>) => void;
  resetProgress: () => void;
  toasts: Toast[];
  pushToast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
  reduced: boolean;
}

const StoreCtx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(StoreCtx);
  if (!s) throw new Error('useStore outside provider');
  return s;
}

function useReducedMotion(pref: Settings['motion']): boolean {
  const [system, setSystem] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const on = () => setSystem(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return pref === 'reduce' || (pref === 'system' && !!system);
}

export function StoreProvider({ ctx, fixtures, children }: { ctx: GameContext; fixtures: boolean; children: ReactNode }) {
  const key = storageKey(fixtures);
  const [profile, setProfile] = useState<Profile>(() => loadProfile(key));
  const profileRef = useRef(profile);
  const [storageOk, setStorageOk] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  useEffect(() => {
    profileRef.current = profile;
    setStorageOk(saveProfile(key, profile));
  }, [key, profile]);

  const reduced = useReducedMotion(profile.settings.motion);
  useEffect(() => {
    document.documentElement.dataset.reduced = String(reduced);
  }, [reduced]);

  const pushToast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++toastId.current;
    setToasts((ts) => [...ts.slice(-2), { ...t, id }]);
    window.setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 4200);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((ts) => ts.filter((x) => x.id !== id)), []);

  const update = useCallback((fn: (p: Profile) => Profile) => {
    const next = fn(profileRef.current);
    profileRef.current = next;
    setProfile(next);
  }, []);

  const updateAndCheck = useCallback(
    (fn: (p: Profile) => Profile, run: RunState | null) => {
      const { profile: next, unlocked } = checkAchievements(fn(profileRef.current), ctx, run);
      profileRef.current = next;
      setProfile(next);
      return unlocked;
    },
    [ctx],
  );

  const setSettings = useCallback(
    (patch: Partial<Settings>) => update((p) => ({ ...p, settings: { ...p.settings, ...patch } })),
    [update],
  );

  const resetProgress = useCallback(() => {
    clearProfile(key);
    const fresh = { ...newProfile(), introSeen: true, settings: profileRef.current.settings };
    profileRef.current = fresh;
    setProfile(fresh);
  }, [key]);

  const value = useMemo<Store>(
    () => ({
      ctx,
      fixtures,
      profile,
      settings: profile.settings,
      storageOk,
      update,
      updateAndCheck,
      setSettings,
      resetProgress,
      toasts,
      pushToast,
      dismissToast,
      reduced,
    }),
    [ctx, fixtures, profile, storageOk, update, updateAndCheck, setSettings, resetProgress, toasts, pushToast, dismissToast, reduced],
  );
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}
