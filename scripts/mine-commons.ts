/**
 * Candidate miner for Wikimedia Commons: searches one or more model categories
 * (including subcategories, via `deepcat:`), keeps licence-allowed landscape
 * photos at least 1600 px wide, ranks them and writes a numbered contact sheet
 * plus JSON to tmp-explore/mine/ for review.
 *
 *   NODE_USE_ENV_PROXY=1 npx tsx scripts/mine-commons.ts <key> "Category:A;Category:B" [max=15]
 *
 * Good categories come from scripts/discover-cars.ts (Wikidata) or a Commons
 * category search. Nothing here is imported: picked photos still go through
 * data/candidates.json, full-size review and scripts/import-photos.ts.
 */
import { join } from 'node:path';
import { api, plain } from './lib/commons';
import { NOT_A_CAR_PHOTO, pickSpread, writeContactSheet, type MinedPhoto } from './lib/mining';
import { licenseAllowed } from './lib/rules';

const [, , key, cats, maxArg = '15'] = process.argv;
if (!key || !cats) {
  console.error('usage: mine-commons.ts <key> "Category:A;Category:B" [max]');
  process.exit(1);
}
const MAX = Number(maxArg);
/** Photographers whose uploads are reliably sharp, well-framed and well-categorised. */
const PROLIFIC =
  /vauxford|calreyn88|mrwalkr|elise240sx|mr\.choppers|^osx$|ifcar|bull-doser|kieran white|rutger van der maar|jeremy from sydney|sicnag|riley from christchurch|dave_7|tokumeigakarinoaoshima|alexander migl|charles01|damian b oh|matti blume|rl gnzlz|spanish coches|greg gjerdingen|niels de wit|carfanatic|corvettec6r|m 93|dinkun|ermell/i;

const found: MinedPhoto[] = [];
const seen = new Set<string>();
for (const c0 of cats.split(';')) {
  const c = c0.replace(/^Category:/, '').trim();
  let offset = 0;
  for (let page = 0; page < 3; page++) {
    const d = await api({
      action: 'query',
      generator: 'search',
      gsrnamespace: '6',
      gsrlimit: '50',
      gsroffset: String(offset),
      gsrsearch: `deepcat:"${c}" filetype:bitmap`,
      prop: 'imageinfo|categories',
      iiprop: 'url|size|extmetadata',
      iiurlwidth: '500',
      iiextmetadatalanguage: 'en',
      cllimit: '500',
      clshow: '!hidden',
    });
    for (const p of d.query?.pages ?? []) {
      if (seen.has(p.title)) continue;
      seen.add(p.title);
      if (!/\.jpe?g$/i.test(p.title) || NOT_A_CAR_PHOTO.test(p.title)) continue;
      const ii = p.imageinfo?.[0];
      if (!ii) continue;
      const license = plain(ii.extmetadata?.LicenseShortName?.value);
      const artist = plain(ii.extmetadata?.Artist?.value);
      if (!licenseAllowed(license) || ii.width < 1600 || ii.width <= ii.height * 1.15) continue;
      const pc: string[] = (p.categories ?? []).map((x: { title: string }) => x.title.replace('Category:', ''));
      if (pc.some((x) => NOT_A_CAR_PHOTO.test(x))) continue;
      let score = 0;
      if (PROLIFIC.test(artist)) score += 3;
      if (/front|vorne|avant|frente|\b01\b/i.test(p.title)) score += 2;
      if (/\b(1[0-9]{3}|20[0-2][0-9])\b/.test(p.title)) score += 1;
      if (/parked|street|road|strasse|rue|calle/i.test(p.title + pc.join(' '))) score += 1;
      found.push({ title: p.title, label: p.title, pageUrl: ii.descriptionurl, width: ii.width, height: ii.height, thumb: ii.thumburl, license, artist, cats: pc, score });
    }
    if (!d.continue || found.length >= MAX * 3) break;
    offset = Number(d.continue.gsroffset ?? offset + 50);
  }
}
const picked = pickSpread(found, MAX);
if (!picked.length) {
  console.log(key, 'NONE', seen.size);
  process.exit(0);
}
const sheet = await writeContactSheet(join(import.meta.dirname, '..'), key, picked);
console.log(key, 'files', seen.size, 'eligible', found.length, 'sheet', picked.length, sheet);
