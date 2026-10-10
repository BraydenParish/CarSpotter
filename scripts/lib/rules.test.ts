import { describe, expect, it } from 'vitest';
import { CAPTURE_DATE_PATTERN, licenseAllowed } from './rules';

describe('license allow-list', () => {
  it('accepts free licenses', () => {
    for (const l of ['CC BY-SA 4.0', 'CC BY 2.0', 'CC BY-SA 3.0', 'CC0', 'Public domain', 'CC BY-SA 2.5']) expect(licenseAllowed(l), l).toBe(true);
  });
  it('rejects restrictive or unknown licenses', () => {
    for (const l of ['CC BY-NC 2.0', 'CC BY-ND 4.0', 'CC BY-NC-SA 3.0', 'Fair use', 'All rights reserved', '']) expect(licenseAllowed(l), l).toBe(false);
  });
});

describe('model-year evidence', () => {
  it('flags capture or upload dates used as evidence', () => {
    expect(CAPTURE_DATE_PATTERN.test('Photo uploaded in 2012')).toBe(true);
    expect(CAPTURE_DATE_PATTERN.test('EXIF says 1999')).toBe(true);
    expect(CAPTURE_DATE_PATTERN.test('Split grille with centre divider appears only on 1969 cars')).toBe(false);
  });
});
