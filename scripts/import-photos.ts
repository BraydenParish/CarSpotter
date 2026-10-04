/**
 * Imports reviewed candidates from data/candidates.json into the game manifest.
 *
 *   NODE_USE_ENV_PROXY=1 npm run import-photos            # import all candidates
 *   npm run import-photos -- --only mx5-na-street-01      # one candidate
 *   npm run import-photos -- --dry-run                    # check licensing only
 *   npm run import-photos -- --force                      # re-download images
 *
 * For each candidate it:
 *   1. fetches the file URL and licensing metadata through the MediaWiki
 *      imageinfo API (https://www.mediawiki.org/wiki/API:Imageinfo);
 *   2. rejects anything whose license is not on the allow-list;
 *   3. downloads the image, resizes it (1600 px + 640 px WebP, metadata
 *      stripped) and produces any requested detail crops;
 *   4. writes/updates the photo record in src/data/photos.json, keeping the
 *      reviewer's verdict (only "approved" photos are used in gameplay) and
 *      recording attribution, license and modification notices.
 */
import sharp from 'sharp';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Angle, DetailPart, Photo, PhotoReview, PhotoSupports, Setting, Vehicle, YearEvidence } from '../src/data/types';
import { download, imageInfo, plain } from './lib/commons';
import { licenseAllowed } from './lib/rules';

interface CropSpec {
  id: string;
  part: DetailPart;
  /** Rectangle in the ORIGINAL file's pixel coordinates. */
  crop: { left: number; top: number; width: number; height: number };
  review: PhotoReview;
}

export interface Candidate {
  id: string;
  /** Commons file title, e.g. "File:Example.jpg". */
  file: string;
  vehicleId: string;
  setting: Setting;
  angle: Angle;
  modelYear: YearEvidence;
  supports: PhotoSupports;
  trim?: string;
  identityEvidence: string[];
  review: PhotoReview;
  crops?: CropSpec[];
}

const root = join(import.meta.dirname, '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

const vehicles = JSON.parse(readFileSync(join(root, 'src/data/vehicles.json'), 'utf8')) as Vehicle[];
const manifestPath = join(root, 'src/data/photos.json');
const photos = JSON.parse(readFileSync(manifestPath, 'utf8')) as Photo[];
const { candidates } = JSON.parse(readFileSync(join(root, 'data/candidates.json'), 'utf8')) as { candidates: Candidate[] };
const outDir = join(root, 'public/photos');
mkdirSync(outDir, { recursive: true });

const FULL_WIDTH = 1600;
const SMALL_WIDTH = 640;
const DETAIL_WIDTH = 1200;

function upsert(record: Photo) {
  const i = photos.findIndex((p) => p.id === record.id);
  if (i >= 0) photos[i] = record;
  else photos.push(record);
}

const todo = candidates.filter((c) => !only || c.id === only || c.crops?.some((k) => k.id === only));
if (!todo.length) {
  console.log(only ? `No candidate with id "${only}".` : 'No candidates in data/candidates.json.');
  process.exit(0);
}

const infos = await imageInfo(todo.map((c) => c.file), 1920);
const infoByTitle = new Map(infos.map((i) => [i.title.replace(/_/g, ' '), i]));
let imported = 0;
let rejected = 0;
let failed = 0;

for (const c of todo) {
  const tag = `[${c.id}]`;
  const vehicle = vehicles.find((v) => v.id === c.vehicleId);
  if (!vehicle) {
    console.error(`${tag} unknown vehicleId ${c.vehicleId} — skipped`);
    continue;
  }
  const info = infoByTitle.get(c.file.replace(/_/g, ' '));
  if (!info) {
    console.error(`${tag} ${c.file} not found on Commons — skipped`);
    continue;
  }
  const m = info.extmetadata;
  const license = plain(m.LicenseShortName?.value) || plain(m.License?.value);
  const licenseUrl = plain(m.LicenseUrl?.value) || null;
  const artist = plain(m.Artist?.value) || 'Unknown author';
  const credit = plain(m.Credit?.value);
  const attributionRequired = plain(m.AttributionRequired?.value) !== 'false';
  const restrictions = plain(m.Restrictions?.value);
  const allowed = licenseAllowed(license);
  console.log(`${tag} ${info.width}×${info.height} · ${license || 'no license'} · ${artist}${restrictions ? ` · restrictions: ${restrictions}` : ''}`);

  const review: PhotoReview = allowed
    ? c.review
    : { status: 'rejected', reviewedBy: 'import-photos', date: new Date().toISOString().slice(0, 10), notes: `License "${license}" is not allowed for reuse in the game.` };
  if (!allowed) rejected++;
  if (dryRun) continue;

  const image = `photos/${c.id}.webp`;
  const imageSmall = `photos/${c.id}-sm.webp`;
  let width = FULL_WIDTH;
  let height = Math.round((info.height / info.width) * FULL_WIDTH);
  let original: Buffer | null = null;
  if (allowed) {
    if (force || !existsSync(join(root, 'public', image))) {
      try {
        // A 1920 px rendition (a standard CDN-cached size) is plenty for the 1600 px output and far lighter than multi-megabyte originals.
        original = await download(info.thumbUrl && info.width > 1920 ? info.thumbUrl : info.url);
      } catch (e) {
        console.error(`${tag} download failed (${(e as Error).message.slice(0, 60)}) — skipped, re-run to retry`);
        failed++;
        continue;
      }
      const full = await sharp(original).rotate().resize({ width: FULL_WIDTH, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
      writeFileSync(join(root, 'public', image), full.data);
      width = full.info.width;
      height = full.info.height;
      await sharp(original).rotate().resize({ width: SMALL_WIDTH }).webp({ quality: 72 }).toFile(join(root, 'public', imageSmall));
    } else {
      const meta = await sharp(join(root, 'public', image)).metadata();
      width = meta.width ?? width;
      height = meta.height ?? height;
    }
  }

  const titleNoPrefix = info.title.replace(/^File:/, '');
  const source = {
    title: info.title,
    pageUrl: info.pageUrl,
    originalUrl: info.url,
    photographer: artist,
    license: license || 'unknown',
    licenseUrl,
    credit: `“${titleNoPrefix}” by ${artist}${license ? `, ${license}` : ''}, via Wikimedia Commons${credit && credit !== artist ? ` (${credit})` : ''}`,
    attributionRequired,
    modifications: `Resized to ${FULL_WIDTH} px and ${SMALL_WIDTH} px wide and re-encoded as WebP (metadata removed) by CarSpotter.`,
  };
  const record: Photo = {
    id: c.id,
    vehicleId: c.vehicleId,
    kind: 'full',
    image,
    imageSmall,
    width,
    height,
    setting: c.setting,
    angle: c.angle,
    modelYear: c.modelYear,
    ...(c.trim ? { trim: c.trim } : {}),
    supports: c.supports,
    identityEvidence: c.identityEvidence,
    source,
    review,
  };
  upsert(record);
  imported++;

  for (const k of c.crops ?? []) {
    if (!allowed) break;
    const crop = `photos/${k.id}.webp`;
    if (force || !existsSync(join(root, 'public', crop))) {
      original ??= await download(info.url);
      await sharp(original).rotate().extract(k.crop).resize({ width: DETAIL_WIDTH, withoutEnlargement: true }).webp({ quality: 80 }).toFile(join(root, 'public', crop));
    }
    const meta = await sharp(join(root, 'public', crop)).metadata();
    upsert({
      ...record,
      id: k.id,
      kind: 'detail',
      detailPart: k.part,
      derivedFrom: c.id,
      crop: k.crop,
      image: crop,
      imageSmall: crop,
      width: meta.width ?? DETAIL_WIDTH,
      height: meta.height ?? DETAIL_WIDTH,
      angle: 'detail',
      supports: { make: true, model: true, year: false, generation: false, trim: false },
      source: { ...source, modifications: `Cropped to the ${k.part} area, resized to ${DETAIL_WIDTH} px wide and re-encoded as WebP by CarSpotter.` },
      review: k.review,
    });
    imported++;
  }
}

if (!dryRun) {
  photos.sort((a, b) => a.id.localeCompare(b.id));
  writeFileSync(manifestPath, `${JSON.stringify(photos, null, 2)}\n`);
}
console.log(`\n${dryRun ? 'Checked' : 'Imported'} ${todo.length} candidate(s); ${imported} record(s) written; ${rejected} rejected for licensing${failed ? `; ${failed} download(s) failed — run again` : ''}.`);
console.log('Next: npm run validate');
