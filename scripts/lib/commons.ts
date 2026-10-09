/**
 * Minimal Wikimedia Commons (MediaWiki Action API) client used by the
 * import tooling. See https://www.mediawiki.org/wiki/API:Imageinfo
 */
export const API = 'https://commons.wikimedia.org/w/api.php';
export const USER_AGENT =
  'CarSpotter-asset-importer/1.0 (open-source car quiz; local build tooling)';

export interface ExtMeta {
  [key: string]: { value: string; source?: string } | undefined;
}

export interface ImageInfo {
  title: string;
  pageUrl: string;
  url: string;
  thumbUrl?: string;
  width: number;
  height: number;
  mime: string;
  extmetadata: ExtMeta;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastCall = 0;

/** Throttled (≥1.5 s between requests), retrying API call — be polite to Wikimedia. */
export async function api(params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams({ format: 'json', formatversion: '2', maxlag: '5', ...params });
  for (let attempt = 0; attempt < 10; attempt++) {
    const wait = lastCall + 1500 - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    try {
      const res = await fetch(`${API}?${qs}`, { headers: { 'User-Agent': USER_AGENT } });
      const text = await res.text();
      if (res.ok && text.startsWith('{')) {
        const json = JSON.parse(text);
        if (json.error?.code === 'maxlag') throw new Error('maxlag');
        if (json.error) throw new Error(`Commons API error: ${json.error.info}`);
        return json;
      }
      if (res.status !== 429 && res.status < 500 && res.ok) throw new Error(`Unexpected response: ${text.slice(0, 200)}`);
    } catch (e) {
      if (attempt === 9) throw e;
    }
    // Wikimedia rate limits are per-minute; back off generously.
    await sleep(Math.min(4000 * (attempt + 1), 30000));
  }
  throw new Error('Commons API: too many retries');
}

/** List file titles in a category (non-recursive). */
export async function categoryFiles(category: string, limit = 200): Promise<string[]> {
  const out: string[] = [];
  let cont: string | undefined;
  do {
    const data = await api({
      action: 'query',
      list: 'categorymembers',
      cmtitle: category.startsWith('Category:') ? category : `Category:${category}`,
      cmtype: 'file',
      cmlimit: '500',
      ...(cont ? { cmcontinue: cont } : {}),
    });
    for (const m of data.query?.categorymembers ?? []) out.push(m.title);
    cont = data.continue?.cmcontinue;
  } while (cont && out.length < limit);
  return out.slice(0, limit);
}

/** Full-text search for files (namespace 6). Supports CirrusSearch syntax such as incategory:/deepcat:. */
export async function searchFiles(query: string, limit = 100): Promise<string[]> {
  const data = await api({
    action: 'query',
    list: 'search',
    srnamespace: '6',
    srlimit: String(Math.min(limit, 500)),
    srsearch: query,
  });
  return (data.query?.search ?? []).map((s: { title: string }) => s.title);
}

/** Fetch imageinfo (url, size, mime, extmetadata) for up to 50 titles per request. */
export async function imageInfo(titles: string[], thumbWidth?: number): Promise<ImageInfo[]> {
  const results: ImageInfo[] = [];
  for (let i = 0; i < titles.length; i += 40) {
    const chunk = titles.slice(i, i + 40);
    const data = await api({
      action: 'query',
      titles: chunk.join('|'),
      prop: 'imageinfo',
      iiprop: 'url|size|mime|extmetadata',
      iiextmetadatalanguage: 'en',
      ...(thumbWidth ? { iiurlwidth: String(thumbWidth) } : {}),
    });
    for (const p of data.query?.pages ?? []) {
      const ii = p.imageinfo?.[0];
      if (!ii) continue;
      results.push({
        title: p.title,
        pageUrl: ii.descriptionurl,
        url: ii.url,
        thumbUrl: ii.thumburl,
        width: ii.width,
        height: ii.height,
        mime: ii.mime,
        extmetadata: ii.extmetadata ?? {},
      });
    }
  }
  return results;
}

/** Strip HTML tags/entities from an extmetadata value. */
export function plain(html: string | undefined): string {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function download(url: string): Promise<Buffer> {
  for (let attempt = 0; attempt < 5; attempt++) {
    await sleep(400);
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    throw new Error(`Download ${res.status} for ${url}`);
  }
  throw new Error(`Download failed after retries: ${url}`);
}
