/**
 * Minimal Openverse (https://api.openverse.org) client. Openverse indexes
 * openly licensed images from Flickr and other providers; CarSpotter uses it
 * as a second source next to Wikimedia Commons, mostly to top up cars whose
 * Commons photos nearly always show the model name.
 *
 * Anonymous access allows 20 requests/minute and 200/day, so every fetched
 * record is cached in data/openverse.json (which also keeps a dated copy of
 * the licence as it was when the photo was imported).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { USER_AGENT } from './commons';

export const OPENVERSE_API = 'https://api.openverse.org/v1';
/** Only licences that allow reuse, modification and commercial use. */
export const OPENVERSE_LICENSES = 'by,by-sa,cc0,pdm';

export interface OpenverseImage {
  id: string;
  title: string;
  url: string;
  creator: string | null;
  license: string;
  license_version: string | null;
  license_url: string | null;
  foreign_landing_url: string;
  provider: string;
  source: string;
  width: number | null;
  height: number | null;
  tags?: { name: string }[];
}

export interface CachedRecord {
  fetched: string;
  record: OpenverseImage;
}

const cachePath = join(import.meta.dirname, '../../data/openverse.json');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastCall = 0;

async function get(path: string): Promise<any> {
  for (let attempt = 0; attempt < 6; attempt++) {
    // 20 requests/minute anonymous burst limit.
    const wait = lastCall + 3200 - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    let res: Response;
    try {
      res = await fetch(`${OPENVERSE_API}${path}`, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(45_000) });
    } catch {
      await sleep(10_000);
      continue;
    }
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) {
      const retry = Number(res.headers.get('retry-after')) || 20 * (attempt + 1);
      await sleep(Math.min(retry, 120) * 1000);
      continue;
    }
    throw new Error(`Openverse ${res.status} for ${path}`);
  }
  throw new Error(`Openverse: too many retries for ${path}`);
}

export async function searchImages(q: string, page = 1): Promise<{ count: number; results: OpenverseImage[] }> {
  const qs = new URLSearchParams({ q, license: OPENVERSE_LICENSES, page_size: '20', page: String(page), mature: 'false' });
  const d = await get(`/images/?${qs}`);
  return { count: d.result_count, results: d.results };
}

export function loadCache(): Record<string, CachedRecord> {
  return existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
}

export function saveCache(cache: Record<string, CachedRecord>) {
  const sorted = Object.fromEntries(Object.entries(cache).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(cachePath, `${JSON.stringify(sorted, null, 2)}\n`);
}

/** One image record, from the cache when present (pass refresh to re-check the licence). */
export async function imageRecord(id: string, cache: Record<string, CachedRecord>, refresh = false): Promise<OpenverseImage> {
  if (!refresh && cache[id]) return cache[id].record;
  const record = (await get(`/images/${encodeURIComponent(id)}/`)) as OpenverseImage;
  cache[id] = { fetched: new Date().toISOString().slice(0, 10), record };
  return record;
}

/** "by-sa" + "2.0" → "CC BY-SA 2.0"; "cc0" → "CC0"; "pdm" → "Public domain". */
export function licenseName(r: Pick<OpenverseImage, 'license' | 'license_version'>): string {
  const l = r.license.toLowerCase();
  if (l === 'cc0') return 'CC0';
  if (l === 'pdm') return 'Public domain';
  return `CC ${l.toUpperCase()}${r.license_version ? ` ${r.license_version}` : ''}`;
}

/** Candidate files from Openverse are written "Openverse:<id>". */
export const OPENVERSE_PREFIX = 'Openverse:';
export const isOpenverse = (file: string) => file.startsWith(OPENVERSE_PREFIX);
export const openverseId = (file: string) => file.slice(OPENVERSE_PREFIX.length);
