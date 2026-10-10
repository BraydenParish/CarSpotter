/**
 * Candidate miner for Openverse (openly licensed photos indexed from Flickr
 * and other providers). Writes a numbered contact sheet plus JSON to
 * tmp-explore/mine/ in the same shape as mine-commons.ts, with titles of the
 * form "Openverse:<id>" that scripts/import-photos.ts understands.
 *
 *   NODE_USE_ENV_PROXY=1 npx tsx scripts/mine-openverse.ts <key> "1971 Jaguar E-Type" [pages=2] [max=15]
 *
 * Identity on Flickr rests on the photographer's title and tags, so every pick
 * still needs a visual check against the vehicle's reference article, and the
 * usual full-size review for legible model names.
 */
import { join } from 'node:path';
import { NOT_A_CAR_PHOTO, pickSpread, writeContactSheet, type MinedPhoto } from './lib/mining';
import { licenseName, loadCache, OPENVERSE_PREFIX, openverseId, saveCache, searchImages, type OpenverseImage } from './lib/openverse';
import { licenseAllowed } from './lib/rules';

const [, , key, query, pagesArg = '2', maxArg = '15'] = process.argv;
if (!key || !query) {
  console.error('usage: mine-openverse.ts <key> "search words" [pages] [max]');
  process.exit(1);
}
const cache = loadCache();
const squash = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, '');
const words = query.split(/\s+/).map(squash).filter((w) => w.length > 1 && !/^\d{4}$/.test(w));
const found: MinedPhoto[] = [];
const records = new Map<string, OpenverseImage>();
let total = 0;
for (let page = 1; page <= Number(pagesArg); page++) {
  const { count, results } = await searchImages(query, page);
  total = count;
  for (const r of results) {
    const tags = (r.tags ?? []).map((t) => t.name);
    const text = squash(`${r.title} ${tags.join(' ')}`);
    if (NOT_A_CAR_PHOTO.test(r.title ?? '') || tags.some((t) => NOT_A_CAR_PHOTO.test(t))) continue;
    // Every query word (make, model…) must appear in the title or tags.
    if (!words.every((w) => text.includes(w))) continue;
    const license = licenseName(r);
    if (!licenseAllowed(license)) continue;
    const w = r.width ?? 0;
    const h = r.height ?? 0;
    if (w < 800 || w <= h * 1.15) continue;
    records.set(`${OPENVERSE_PREFIX}${r.id}`, r);
    let score = 0;
    if (/front|parked|street/.test(text)) score += 1;
    if (/\b(19|20)\d\d\b/.test(r.title ?? '')) score += 1;
    found.push({
      title: `${OPENVERSE_PREFIX}${r.id}`,
      label: r.title ?? '',
      pageUrl: r.foreign_landing_url,
      width: w,
      height: h,
      thumb: r.url,
      license,
      artist: r.creator ?? 'unknown',
      cats: [r.title ?? '', ...tags],
      score,
    });
  }
  if (results.length < 20) break;
}
const picked = pickSpread(found, Number(maxArg), 3);
// Keep the picked records: the importer reuses them instead of spending more of the daily API quota.
for (const x of picked) cache[openverseId(x.title)] ??= { fetched: new Date().toISOString().slice(0, 10), record: records.get(x.title)! };
saveCache(cache);
if (!picked.length) {
  console.log(key, 'NONE', total);
  process.exit(0);
}
const sheet = await writeContactSheet(join(import.meta.dirname, '..'), key, picked);
console.log(key, 'results', total, 'eligible', found.length, 'sheet', picked.length, sheet);
