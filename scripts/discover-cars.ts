/**
 * Finds well-documented car models that CarSpotter does not cover yet, using
 * Wikidata (https://query.wikidata.org). A model qualifies when it has a
 * Wikimedia Commons category (P373) and an English Wikipedia article; results
 * are ranked by how many Wikipedia language editions describe the car, a good
 * proxy for "people will recognise it".
 *
 *   NODE_USE_ENV_PROXY=1 npx tsx scripts/discover-cars.ts [limit=150] [minSitelinks=12]
 *
 * Each line prints the Commons category to mine (scripts/mine-commons.ts) and
 * the reference article to check the vehicle record against.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Vehicle } from '../src/data/types';
import { USER_AGENT } from './lib/commons';

const [, , limitArg = '150', minArg = '12'] = process.argv;
const root = join(import.meta.dirname, '..');
const vehicles = JSON.parse(readFileSync(join(root, 'src/data/vehicles.json'), 'utf8')) as Vehicle[];
const known = new Set(vehicles.map((v) => decodeURIComponent(v.referenceUrl.split('/wiki/')[1] ?? '').replace(/_/g, ' ').toLowerCase()));

const query = `
SELECT ?item ?itemLabel ?cat ?article ?makerLabel ?links WHERE {
  ?item wdt:P31/wdt:P279* wd:Q3231690 ;
        wdt:P373 ?cat ;
        wikibase:sitelinks ?links .
  ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> .
  OPTIONAL { ?item wdt:P176 ?maker }
  FILTER(?links >= ${Number(minArg)})
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY DESC(?links)
LIMIT ${Number(limitArg) * 3}`;

const res = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`, {
  headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json' },
});
if (!res.ok) throw new Error(`Wikidata query failed: ${res.status}`);
const rows = ((await res.json()) as any).results.bindings as Record<string, { value: string }>[];

const seen = new Set<string>();
let printed = 0;
for (const r of rows) {
  const title = decodeURIComponent(r.article.value.split('/wiki/')[1]).replace(/_/g, ' ');
  if (seen.has(r.item.value) || known.has(title.toLowerCase())) continue;
  seen.add(r.item.value);
  console.log([r.links.value.padStart(3), r.makerLabel?.value ?? '?', r.itemLabel.value, `Category:${r.cat.value}`, r.article.value].join('\t'));
  if (++printed >= Number(limitArg)) break;
}
console.error(`${printed} candidate models (of ${rows.length} rows; ${known.size} already in the game)`);
