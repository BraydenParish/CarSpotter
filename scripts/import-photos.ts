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
 *      imageinfo API (https://www.mediawiki.org/wiki/API:Imageinfo), or for
 *      "Openverse:<id>" candidates through the Openverse API (cached, with the
 *      licence as fetched, in data/openverse.json);
 *   2. rejects anything whose license is not on the allow-list;
 *   3. downloads the image, resizes it (1600 px + 640 px WebP, metadata
 *      stripped) and produces any requested detail crops;
 *   4. writes/updates the photo record in src/data/photos.json, keeping the
 *      reviewer's verdict (only "approved" photos are used in gameplay) and
 *      recording attribution, license and modification notices.
 */
import sharp from 'sharp';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Angle, DetailPart, Photo, PhotoReview, PhotoSupports, Setting, Vehicle, YearEvidence } from '../src/data/types';
import { download, imageInfo, plain, type ImageInfo } from './lib/commons';
import { imageRecord, isOpenverse, licenseName, loadCache, openverseId, saveCache } from './lib/openverse';
import { licenseAllowed } from './lib/rules';

// Prefer CDN-cached renditions: upload.wikimedia.org rate-limits original downloads far more aggressively than thumbnails.
function renditionUrl(info: { url: string; thumbUrl?: string; width: number }): string {
  if (info.thumbUrl && info.width > 1920) return info.thumbUrl;
  const m = info.url.match(/^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/([0-9a-f]\/[0-9a-f]{2})\/([^?]+)/);
  if (m && info.width > 1280) return `${m[1]}/thumb/${m[2]}/${m[3]}/1280px-${m[3]}`;
  return info.url;
}

// Some authors put a whole licence notice in the Artist field; keep the name part only.
function shortArtist(s: string): string {
  if (s.length <= 80) return s;
  const cut = s.search(/\s(?:I|I'd|I'm|This|Please|You|If|Licen[cs]e)\b/);
  return (cut > 0 ? s.slice(0, cut) : s.slice(0, 80)).replace(/[\s,;:–-]+$/, '');
}

interface CropSpec {
  id: string;
  part: DetailPart;
  /** Rectangle in the ORIGINAL file's pixel coordinates. */
  crop: { left: number; top: number; width: number; height: number };
  review: PhotoReview;
}

export interface Candidate {
  id: string;
  /** Commons file title, e.g. "File:Example.jpg", or "Openverse:<image id>". */
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
// Re-check Openverse licences instead of using the cached record.
const refresh = args.includes('--refresh-openverse');

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

/** Licensing and file details, whichever source a candidate comes from. */
interface SourceInfo {
  title: string;
  pageUrl: string;
  url: string;
  downloadUrl: string;
  width: number;
  height: number;
  license: string;
  licenseUrl: string | null;
  artist: string;
  /** Extra credit text the source asks for, if any. */
  credit: string;
  attributionRequired: boolean;
  restrictions: string;
  via: string;
}

function fromCommons(info: ImageInfo): SourceInfo {
  const m = info.extmetadata;
  return {
    title: info.title,
    pageUrl: info.pageUrl,
    url: info.url,
    downloadUrl: renditionUrl(info),
    width: info.width,
    height: info.height,
    license: plain(m.LicenseShortName?.value) || plain(m.License?.value),
    licenseUrl: plain(m.LicenseUrl?.value) || null,
    artist: shortArtist(plain(m.Artist?.value)) || 'Unknown author',
    credit: plain(m.Credit?.value),
    attributionRequired: plain(m.AttributionRequired?.value) !== 'false',
    restrictions: plain(m.Restrictions?.value),
    via: 'Wikimedia Commons',
  };
}

const commonsInfos = await imageInfo(todo.filter((c) => !isOpenverse(c.file)).map((c) => c.file), 1920);
const infoByTitle = new Map(commonsInfos.map((i) => [i.title.replace(/_/g, ' '), fromCommons(i)]));
const ovCache = loadCache();
for (const c of todo.filter((x) => isOpenverse(x.file))) {
  try {
    const r = await imageRecord(openverseId(c.file), ovCache, refresh);
    const provider = r.source === 'flickr' || r.provider === 'flickr' ? 'Flickr' : r.source;
    infoByTitle.set(c.file, {
      title: r.title?.trim() || 'Untitled',
      pageUrl: r.foreign_landing_url,
      url: r.url,
      downloadUrl: r.url,
      width: r.width ?? 1024,
      height: r.height ?? 683,
      license: licenseName(r),
      licenseUrl: r.license_url,
      artist: shortArtist(r.creator?.trim() ?? '') || 'Unknown author',
      credit: '',
      attributionRequired: r.license !== 'cc0' && r.license !== 'pdm',
      restrictions: '',
      via: `${provider} (found through Openverse)`,
    });
  } catch (e) {
    console.error(`[${c.id}] Openverse lookup failed (${(e as Error).message.slice(0, 60)}) — skipped, re-run to retry`);
  }
}
saveCache(ovCache);
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
  const info = infoByTitle.get(isOpenverse(c.file) ? c.file : c.file.replace(/_/g, ' '));
  if (!info) {
    console.error(`${tag} ${c.file} not found — skipped`);
    continue;
  }
  const { license, licenseUrl, artist, credit, attributionRequired, restrictions } = info;
  const allowed = licenseAllowed(license);
  console.log(`${tag} ${info.width}×${info.height} · ${license || 'no license'} · ${artist}${restrictions ? ` · restrictions: ${restrictions}` : ''}`);

  const review: PhotoReview = c.review;
  if (!allowed) rejected++;
  if (dryRun) continue;

  // Rejected photos (by license or by review) stay in candidates.json as an audit trail but are
  // never written to the manifest or shipped: drop any earlier record and image files.
  if (!allowed || c.review.status === 'rejected') {
    const ids = [c.id, ...(c.crops ?? []).map((k) => k.id)];
    for (let i = photos.length - 1; i >= 0; i--) if (ids.includes(photos[i].id)) photos.splice(i, 1);
    for (const id of ids) for (const f of [`photos/${id}.webp`, `photos/${id}-sm.webp`]) rmSync(join(root, 'public', f), { force: true });
    if (allowed) console.log(`${tag} rejected in review — not imported (${c.review.notes})`);
    continue;
  }

  const image = `photos/${c.id}.webp`;
  const imageSmall = `photos/${c.id}-sm.webp`;
  let width = FULL_WIDTH;
  let height = Math.round((info.height / info.width) * FULL_WIDTH);
  let original: Buffer | null = null;
  if (allowed) {
    if (force || !existsSync(join(root, 'public', image))) {
      try {
        // Commons: a 1920 px rendition (a standard CDN-cached size) is plenty for the 1600 px output and far lighter than multi-megabyte originals.
        original = await download(info.downloadUrl);
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
    credit: `“${titleNoPrefix}” by ${artist}${license ? `, ${license}` : ''}, via ${info.via}${credit && credit !== artist ? ` (${credit})` : ''}`,
    attributionRequired,
    modifications: `Resized to ${width} px and ${SMALL_WIDTH} px wide and re-encoded as WebP (metadata removed) by CarSpotter.`,
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
      original ??= await download(info.downloadUrl);
      // Crop rectangles are in original-file pixels; scale them to the rendition actually downloaded.
      const got = (await sharp(original).rotate().metadata()).width ?? info.width;
      const f = got / info.width;
      const box = {
        left: Math.round(k.crop.left * f),
        top: Math.round(k.crop.top * f),
        width: Math.round(k.crop.width * f),
        height: Math.round(k.crop.height * f),
      };
      await sharp(original).rotate().extract(box).resize({ width: DETAIL_WIDTH, withoutEnlargement: true }).webp({ quality: 80 }).toFile(join(root, 'public', crop));
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
