/**
 * Shared helpers for the candidate miners (mine-commons.ts, mine-openverse.ts):
 * the junk filter, a per-photographer cap, and the numbered contact sheet a
 * reviewer looks at before picking candidates.
 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { download } from './commons';

/** Titles, categories or tags that point to something other than a clean photo of a road car. */
export const NOT_A_CAR_PHOTO =
  /\b(interiors?|innenraum|engines?|motorraum|engine bay|badges?|emblems?|logos?|dashboard|cockpit|wheels?|rims?|steering|lenkrad|trunk|kofferraum|rear|heck|tail|taillights?|headlights?|details?|model cars?|toys?|diecast|lego|scale model|crash|crashed|wreck|unfall|damaged|accident|scrapyard|junkyard|brochure|advert|poster|stamps?|drawing|sketch|cutaway|instruments?|gauges?|underside|racing|race car|rally|rallye|drift|gt3|gt500|gt300|nascar|dtm|police|polizei|taxi|ambulance|fire engine|replica)\b/i;

export interface MinedPhoto {
  /** "File:…" for Commons, "Openverse:<id>" for Openverse. */
  title: string;
  /** Human-readable title (same as title for Commons). */
  label: string;
  pageUrl: string;
  width: number;
  height: number;
  thumb: string;
  license: string;
  artist: string;
  /** Commons categories, or Openverse tags. */
  cats: string[];
  score: number;
}

/** Highest score first, at most `perArtist` photos from one photographer, `max` in total. */
export function pickSpread(items: MinedPhoto[], max: number, perArtist = 4): MinedPhoto[] {
  const sorted = [...items].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  const counts = new Map<string, number>();
  const out: MinedPhoto[] = [];
  for (const x of sorted) {
    const k = x.artist.slice(0, 30).toLowerCase();
    const n = counts.get(k) ?? 0;
    if (n >= perArtist) continue;
    counts.set(k, n + 1);
    out.push(x);
    if (out.length >= max) break;
  }
  return out;
}

/** Writes tmp-explore/mine/<key>.jpg (numbered 3-column sheet) and <key>.json. */
export async function writeContactSheet(root: string, key: string, picked: MinedPhoto[]): Promise<string> {
  const dir = join(root, 'tmp-explore/mine');
  mkdirSync(dir, { recursive: true });
  const tiles: Buffer[] = [];
  for (const [n, x] of picked.entries()) {
    try {
      const buf = await download(x.thumb);
      const label = Buffer.from(
        `<svg width="480" height="320"><rect width="54" height="34" fill="black"/><text x="6" y="26" font-size="26" fill="yellow" font-family="Arial">${n}</text></svg>`,
      );
      tiles.push(await sharp(buf).resize(480, 320, { fit: 'cover' }).composite([{ input: label }]).jpeg({ quality: 80 }).toBuffer());
    } catch {
      tiles.push(await sharp({ create: { width: 480, height: 320, channels: 3, background: '#400' } }).jpeg().toBuffer());
    }
  }
  const sheet = join(dir, `${key}.jpg`);
  if (tiles.length) {
    const cols = 3;
    const rows = Math.ceil(tiles.length / cols);
    await sharp({ create: { width: cols * 480, height: rows * 320, channels: 3, background: '#000' } })
      .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * 480, top: Math.floor(i / cols) * 320 })))
      .jpeg({ quality: 78 })
      .toFile(sheet);
  }
  writeFileSync(join(dir, `${key}.json`), JSON.stringify(picked, null, 1));
  return sheet;
}
