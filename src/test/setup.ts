// Vitest setup: give tests a clean localStorage each run.
import { beforeEach } from 'vitest';

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});
