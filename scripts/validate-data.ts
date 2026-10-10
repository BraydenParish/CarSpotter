/**
 * Validates the curated manifest (src/data/vehicles.json, src/data/photos.json)
 * and the reviewer's candidate list (data/candidates.json).
 *
 *   npm run validate
 *
 * Errors fail the build. Coverage shortfalls (fewer than the target number of
 * verified photos/cars) are reported as warnings, never papered over.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ANGLES, BODY_STYLES, CATEGORIES, DETAIL_PARTS, SETTINGS, type Photo, type Vehicle } from '../src/data/types';
import { expertField } from '../src/game/expert';
import { CAPTURE_DATE_PATTERN, licenseAllowed, TARGET_PHOTOS, TARGET_VEHICLES } from './lib/rules';

const root = join(import.meta.dirname, '..');
const read = <T>(p: string): T => JSON.parse(readFileSync(join(root, p), 'utf8')) as T;

const errors: string[] = [];
const warnings: string[] = [];
const err = (where: string, msg: string) => errors.push(`${where}: ${msg}`);
const warn = (where: string, msg: string) => warnings.push(`${where}: ${msg}`);

const vehicles = read<Vehicle[]>('src/data/vehicles.json');
const photos = read<Photo[]>('src/data/photos.json');
const candidates = read<{ candidates: unknown[] }>('data/candidates.json');

/* Vehicles ---------------------------------------------------------- */
const vehicleIds = new Set<string>();
for (const v of vehicles) {
  const w = `vehicle ${v.id ?? '?'}`;
  if (!v.id || !/^[a-z0-9-]+$/.test(v.id)) err(w, 'id must be kebab-case');
  if (vehicleIds.has(v.id)) err(w, 'duplicate id');
  vehicleIds.add(v.id);
  if (!v.make?.trim() || !v.model?.trim()) err(w, 'make and model are required');
  if (!Array.isArray(v.modelAliases)) err(w, 'modelAliases must be an array');
  if (!BODY_STYLES.includes(v.bodyStyle)) err(w, `unknown bodyStyle "${v.bodyStyle}"`);
  if (!v.country?.trim()) err(w, 'country is required');
  if (!Array.isArray(v.years) || v.years.length !== 2 || v.years[0] > v.years[1]) err(w, 'years must be [from, to]');
  if (!v.categories?.length) err(w, 'at least one category is required');
  for (const c of v.categories ?? []) if (!CATEGORIES.includes(c)) err(w, `unknown category "${c}"`);
  if (v.generation && (!v.generation.name || !Array.isArray(v.generation.aliases))) err(w, 'generation needs name and aliases');
  if (!/^https:\/\//.test(v.referenceUrl ?? '')) err(w, 'referenceUrl (https) is required');
}

/* Photos ------------------------------------------------------------ */
const photoIds = new Set<string>();
const byId = new Map(photos.map((p) => [p.id, p]));
for (const p of photos) {
  const w = `photo ${p.id ?? '?'}`;
  if (!p.id || !/^[a-z0-9-]+$/.test(p.id)) err(w, 'id must be kebab-case');
  if (photoIds.has(p.id)) err(w, 'duplicate id');
  photoIds.add(p.id);
  const v = vehicles.find((x) => x.id === p.vehicleId);
  if (!v) {
    err(w, `unknown vehicleId "${p.vehicleId}"`);
    continue;
  }
  if (!['full', 'detail'].includes(p.kind)) err(w, 'kind must be full or detail');
  if (!SETTINGS.includes(p.setting)) err(w, `unknown setting "${p.setting}"`);
  if (!ANGLES.includes(p.angle)) err(w, `unknown angle "${p.angle}"`);
  for (const key of ['image', 'imageSmall'] as const) {
    const path = p[key];
    if (!path) err(w, `${key} is required`);
    else if (!/^https:\/\//.test(path) && !existsSync(join(root, 'public', path))) err(w, `${key} file missing: public/${path}`);
  }
  if (!(p.width > 0 && p.height > 0)) err(w, 'width/height required');

  // Model year evidence
  const y = p.modelYear;
  if (!y || !(y.from <= y.to)) err(w, 'modelYear {from, to} required with from <= to');
  else {
    if (y.from < v.years[0] || y.to > v.years[1]) err(w, `modelYear ${y.from}–${y.to} lies outside the vehicle's years ${v.years[0]}–${v.years[1]}`);
    if (!y.basis?.trim()) err(w, 'modelYear.basis must explain the evidence');
    else if (CAPTURE_DATE_PATTERN.test(y.basis)) err(w, 'modelYear.basis cites a capture/upload date, which is not evidence of model year');
  }

  // Supported answer fields
  const s = p.supports;
  if (!s) err(w, 'supports is required');
  else {
    if (p.review?.status === 'approved' && (!s.make || !s.model)) err(w, 'approved photos must support make and model');
    if (s.trim && !p.trim) err(w, 'supports.trim requires a verified trim');
    if (s.generation && !v.generation) err(w, 'supports.generation but the vehicle has no generation');
  }
  if (!p.identityEvidence?.length) err(w, 'identityEvidence needs at least one URL');

  // Licensing and attribution
  const src = p.source;
  if (!src) err(w, 'source is required');
  else {
    if (!/^https:\/\/(commons\.wikimedia\.org|www\.flickr\.com)\//.test(src.pageUrl ?? '')) warn(w, 'source.pageUrl is not a Wikimedia Commons or Flickr page; make sure reuse rights are documented');
    if (!licenseAllowed(src.license ?? '')) err(w, `license "${src.license}" is not on the allowed list`);
    if (/^cc[ -]by/i.test(src.license ?? '') && !src.licenseUrl) err(w, 'CC licenses need licenseUrl');
    if (!src.photographer?.trim()) err(w, 'photographer is required');
    if (!src.credit?.trim()) err(w, 'credit line is required');
    if (!src.modifications?.trim()) err(w, 'modifications notice is required (e.g. "Resized and re-encoded as WebP")');
  }

  // Detail crops
  if (p.kind === 'detail') {
    if (!p.detailPart || !DETAIL_PARTS.includes(p.detailPart)) err(w, 'detail photos need a valid detailPart');
    if (p.derivedFrom) {
      const parent = byId.get(p.derivedFrom);
      if (!parent) err(w, `derivedFrom "${p.derivedFrom}" not found`);
      else if (parent.vehicleId !== p.vehicleId) err(w, 'detail crop vehicle differs from its source photo');
      if (!p.crop) err(w, 'crops derived from a photo need a crop rectangle');
      if (!/crop/i.test(src?.modifications ?? '')) err(w, 'crop modification must be noted in source.modifications');
    }
  }

  // Review
  const r = p.review;
  if (!r || !['approved', 'pending', 'rejected'].includes(r.status)) err(w, 'review.status must be approved/pending/rejected');
  else if (r.status === 'approved' && (!r.reviewedBy?.trim() || !r.date)) err(w, 'approved photos need reviewedBy and date');
}

if (!Array.isArray(candidates.candidates)) err('data/candidates.json', '"candidates" must be an array');

/* Summary ----------------------------------------------------------- */
const approved = photos.filter((p) => p.review?.status === 'approved' && vehicleIds.has(p.vehicleId));
const full = approved.filter((p) => p.kind === 'full');
const cars = new Set(full.map((p) => p.vehicleId));
const street = full.filter((p) => p.setting === 'street').length;
const studio = full.filter((p) => p.setting === 'studio').length;
const expert = full.filter((p) => {
  const v = vehicles.find((x) => x.id === p.vehicleId)!;
  return expertField(p, v) !== null;
});
const details = approved.filter((p) => p.kind === 'detail');

if (full.length < TARGET_PHOTOS) warn('coverage', `${full.length} approved photos (target ${TARGET_PHOTOS})`);
if (cars.size < TARGET_VEHICLES) warn('coverage', `${cars.size} distinct approved cars (target ${TARGET_VEHICLES})`);
if (full.length && street < studio) warn('coverage', `street photos (${street}) should outnumber studio photos (${studio})`);

console.log('CarSpotter data validation');
console.log(`  vehicles defined:        ${vehicles.length}`);
console.log(`  photo records:           ${photos.length} (${approved.length} approved, ${photos.filter((p) => p.review?.status === 'pending').length} pending, ${photos.filter((p) => p.review?.status === 'rejected').length} rejected)`);
console.log(`  approved full photos:    ${full.length} (street ${street}, studio ${studio}, other ${full.length - street - studio})`);
console.log(`  distinct approved cars:  ${cars.size}`);
console.log(`  Expert-eligible photos:  ${expert.length} (${new Set(expert.map((p) => p.vehicleId)).size} cars)`);
console.log(`  detail crops:            ${details.length}`);
{
  const cands = (candidates.candidates ?? []) as { id: string; review?: { status?: string } }[];
  const inManifest = new Set(photos.map((p) => p.id));
  const by = (st: string) => cands.filter((c) => c.review?.status === st).length;
  console.log(`  reviewed candidates:     ${cands.length} (${by('approved')} approved, ${by('pending')} pending, ${by('rejected')} rejected — rejected ones are never imported)`);
  const waiting = cands.filter((c) => c.review?.status !== 'rejected' && !inManifest.has(c.id)).length;
  console.log(`  candidates awaiting import: ${waiting}`);
}
for (const w of warnings) console.warn(`  warning  ${w}`);
for (const e of errors) console.error(`  ERROR    ${e}`);
if (errors.length) {
  console.error(`\n${errors.length} error(s).`);
  process.exit(1);
}
console.log(errors.length ? '' : '  OK');
