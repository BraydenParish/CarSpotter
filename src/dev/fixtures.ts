/**
 * DEV / TEST FIXTURES — NOT PHOTOGRAPHS.
 *
 * Synthetic photo records pointing at generated placeholder cards (an SVG that
 * says "TEST FIXTURE"). They exist so the unit tests and local UI playtesting
 * can exercise every mode before verified photos are imported. They are only
 * loaded by tests or by the dev server with `?fixtures` in the URL, are never
 * part of a production build, and must never be presented as quiz photos.
 */
import type { Photo, PhotoSupports, Setting, Vehicle, YearEvidence } from '../data/types';

function placeholder(n: number, label: string): string {
  const hue = (n * 47) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1067" viewBox="0 0 1600 1067">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},25%,22%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360},30%,10%)"/></linearGradient></defs>
<rect width="1600" height="1067" fill="url(#g)"/>
<g fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2">${Array.from({ length: 12 }, (_, i) => `<line x1="${i * 140}" y1="0" x2="${i * 140 - 400}" y2="1067"/>`).join('')}</g>
<text x="800" y="500" text-anchor="middle" font-family="system-ui,sans-serif" font-size="88" font-weight="700" fill="rgba(255,255,255,0.85)">TEST FIXTURE #${n}</text>
<text x="800" y="590" text-anchor="middle" font-family="system-ui,sans-serif" font-size="40" fill="rgba(255,255,255,0.55)">${label} · not a photograph · dev only</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

interface FixtureSpec {
  vehicleId: string;
  setting: Setting;
  year: [number, number];
  supports?: Partial<PhotoSupports>;
}

/** A spread of cases: exact years, ranges, generation-only, ineligible for Expert, street and studio. */
const SPECS: FixtureSpec[] = [
  { vehicleId: 'mazda-mx5-na', setting: 'street', year: [1989, 1997] },
  { vehicleId: 'mazda-mx5-na', setting: 'studio', year: [1989, 1997] },
  { vehicleId: 'toyota-supra-a80', setting: 'street', year: [1993, 1998] },
  { vehicleId: 'nissan-skyline-r34', setting: 'street', year: [1998, 2002] },
  { vehicleId: 'honda-nsx-na', setting: 'studio', year: [1990, 2001] },
  { vehicleId: 'datsun-240z', setting: 'street', year: [1969, 1973] },
  { vehicleId: 'vw-beetle', setting: 'street', year: [1938, 2003], supports: { year: false, generation: false } },
  { vehicleId: 'citroen-2cv', setting: 'street', year: [1948, 1990], supports: { year: false, generation: false } },
  { vehicleId: 'citroen-ds', setting: 'street', year: [1968, 1975] },
  { vehicleId: 'trabant-601', setting: 'street', year: [1964, 1990], supports: { year: false } },
  { vehicleId: 'mini-classic', setting: 'street', year: [1959, 2000], supports: { year: false, generation: false } },
  { vehicleId: 'fiat-500-nuova', setting: 'street', year: [1965, 1975], supports: { generation: true } },
  { vehicleId: 'vw-type2-t1', setting: 'street', year: [1950, 1967], supports: { year: false } },
  { vehicleId: 'mercedes-300sl', setting: 'studio', year: [1954, 1957] },
  { vehicleId: 'jaguar-etype', setting: 'street', year: [1961, 1968] },
  { vehicleId: 'porsche-911-993', setting: 'street', year: [1994, 1998] },
  { vehicleId: 'lamborghini-countach', setting: 'studio', year: [1974, 1990], supports: { year: false } },
  { vehicleId: 'lamborghini-aventador', setting: 'street', year: [2011, 2016] },
  { vehicleId: 'ferrari-f40', setting: 'street', year: [1987, 1992] },
  { vehicleId: 'ford-mustang-1g', setting: 'street', year: [1965, 1966] },
  { vehicleId: 'dodge-charger-2g', setting: 'street', year: [1969, 1969] },
  { vehicleId: 'chevrolet-camaro-1g', setting: 'street', year: [1969, 1969] },
  { vehicleId: 'dodge-challenger-1g', setting: 'studio', year: [1970, 1974] },
  { vehicleId: 'land-rover-defender', setting: 'street', year: [1983, 2016], supports: { year: false, generation: false } },
  { vehicleId: 'jeep-wrangler-jk', setting: 'street', year: [2007, 2018] },
  { vehicleId: 'vw-golf-mk7', setting: 'street', year: [2012, 2017] },
  { vehicleId: 'toyota-prius-xw30', setting: 'street', year: [2009, 2011] },
  { vehicleId: 'tesla-model-3', setting: 'street', year: [2017, 2023] },
  { vehicleId: 'ford-f150-13g', setting: 'street', year: [2015, 2017] },
  { vehicleId: 'ferrari-f40', setting: 'studio', year: [1987, 1992] },
];

export function fixturePhotos(vehicles: Vehicle[]): Photo[] {
  const known = new Set(vehicles.map((v) => v.id));
  return SPECS.filter((s) => known.has(s.vehicleId)).map((s, i) => {
    const n = i + 1;
    const img = placeholder(n, s.setting);
    const modelYear: YearEvidence = { from: s.year[0], to: s.year[1], basis: 'Fixture data for tests — not a verified photo.' };
    return {
      id: `fixture-${String(n).padStart(2, '0')}`,
      vehicleId: s.vehicleId,
      kind: 'full',
      image: img,
      imageSmall: img,
      width: 1600,
      height: 1067,
      setting: s.setting,
      angle: 'front-quarter',
      modelYear,
      supports: { make: true, model: true, year: true, generation: true, trim: false, ...s.supports },
      identityEvidence: ['fixture'],
      source: {
        title: `Fixture ${n}`,
        pageUrl: 'about:blank',
        originalUrl: 'about:blank',
        photographer: 'CarSpotter test fixture',
        license: 'Test fixture (not a photograph)',
        licenseUrl: null,
        credit: 'Generated placeholder — not a photograph',
        attributionRequired: false,
        modifications: 'none',
      },
      review: { status: 'approved', reviewedBy: 'fixture', date: '2026-01-01', notes: 'Synthetic test fixture.' },
    } satisfies Photo;
  });
}

/** Two detail-crop fixtures, to exercise the Detail Challenge UI. */
export function fixtureDetails(vehicles: Vehicle[]): Photo[] {
  const base = fixturePhotos(vehicles);
  const pick = ['fixture-01', 'fixture-19', 'fixture-21', 'fixture-15'];
  return base
    .filter((p) => pick.includes(p.id))
    .map((p, i) => ({
      ...p,
      id: `${p.id}-detail`,
      kind: 'detail' as const,
      detailPart: (['headlight', 'taillight', 'interior', 'grille'] as const)[i % 4],
      derivedFrom: p.id,
      image: placeholder(100 + i, 'detail crop'),
      imageSmall: placeholder(100 + i, 'detail crop'),
    }));
}
