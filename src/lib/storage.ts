/** localStorage access that never throws (private mode, quota, disabled storage). */
import { hydrateProfile, newProfile, type Profile } from '../game/progress';

export function storageKey(fixtures: boolean): string {
  return fixtures ? 'carspotter:profile:fixtures' : 'carspotter:profile';
}

export function loadProfile(key: string): Profile {
  try {
    const raw = localStorage.getItem(key);
    return raw ? hydrateProfile(JSON.parse(raw)) : newProfile();
  } catch {
    return newProfile();
  }
}

export function saveProfile(key: string, profile: Profile): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}

export function clearProfile(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
