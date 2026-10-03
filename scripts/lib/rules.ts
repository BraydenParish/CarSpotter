/**
 * Shared data rules for the import and validation scripts.
 */

/** Licenses we accept for quiz photos (reuse, modification and commercial use allowed). */
export function licenseAllowed(shortName: string): boolean {
  const s = shortName.trim().toLowerCase();
  if (!s) return false;
  if (/\b(nc|nd)\b|non-?commercial|no ?deriv|fair use|all rights reserved|copyrighted/.test(s)) return false;
  return (
    /^cc0/.test(s) ||
    /^public domain/.test(s) ||
    /^pd\b/.test(s) ||
    /^cc[ -]by(-sa)?[ -]\d(\.\d)?/.test(s) ||
    /^cc[ -]by(-sa)?$/.test(s)
  );
}

/** Year evidence must come from the car, never from when the photo was taken or uploaded. */
export const CAPTURE_DATE_PATTERN = /\b(uploaded|upload date|date taken|taken on|captured|capture date|exif|photo date|photographed in)\b/i;

export const TARGET_PHOTOS = 30;
export const TARGET_VEHICLES = 20;
