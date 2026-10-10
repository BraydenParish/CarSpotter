/**
 * Reviewer helper: list candidate files from a Commons category and build a
 * numbered contact sheet so a human can visually confirm the car before
 * adding it to data/candidates.json.
 *
 *   npx tsx scripts/explore-category.ts "Category:Mazda MX-5 (NA)" out-dir [max]
 *   npx tsx scripts/explore-category.ts 'search:incategory:"Citroën 2CV" street' out-dir
 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { categoryFiles, searchFiles, imageInfo, download, plain } from './lib/commons';

const [, , category, outDir = 'tmp-explore', maxArg = '24'] = process.argv;
if (!category) {
  console.error('usage: explore-category.ts "Category:..." outDir [max]');
  process.exit(1);
}
const max = Number(maxArg);
mkdirSync(outDir, { recursive: true });

const titles = (category.startsWith('search:') ? await searchFiles(category.slice(7), 200) : await categoryFiles(category, 400)).filter((t) => /\.(jpe?g|png)$/i.test(t));
const infos = (await imageInfo(titles, 360))
  .filter((i) => i.width >= 1600 && i.width > i.height)
  .slice(0, max);

if (!infos.length) {
  console.log('no landscape >=1600px files found for', category);
  process.exit(0);
}
const lines: string[] = [];
const tiles: Buffer[] = [];
for (const [n, info] of infos.entries()) {
  const lic = plain(info.extmetadata.LicenseShortName?.value);
  const artist = plain(info.extmetadata.Artist?.value);
  lines.push(`${n}\t${info.width}x${info.height}\t${lic}\t${artist}\t${info.title}`);
  try {
    const buf = await download(info.thumbUrl!);
    const label = Buffer.from(
      `<svg width="360" height="240"><rect x="0" y="0" width="44" height="30" fill="black"/><text x="6" y="23" font-size="22" fill="yellow" font-family="Arial">${n}</text></svg>`,
    );
    tiles.push(
      await sharp(buf).resize(360, 240, { fit: 'cover' }).composite([{ input: label, top: 0, left: 0 }]).jpeg().toBuffer(),
    );
  } catch (e) {
    tiles.push(await sharp({ create: { width: 360, height: 240, channels: 3, background: '#400' } }).jpeg().toBuffer());
  }
}
const cols = 4;
const rows = Math.ceil(tiles.length / cols);
const sheet = await sharp({ create: { width: cols * 360, height: rows * 240, channels: 3, background: '#000' } })
  .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * 360, top: Math.floor(i / cols) * 240 })))
  .jpeg({ quality: 70 })
  .toBuffer();
const slug = category.replace(/^Category:/, '').replace(/[^a-z0-9]+/gi, '_');
writeFileSync(join(outDir, `${slug}.jpg`), sheet);
writeFileSync(join(outDir, `${slug}.tsv`), lines.join('\n'));
console.log(lines.join('\n'));
console.log(`sheet: ${join(outDir, `${slug}.jpg`)}`);
