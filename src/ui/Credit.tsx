import type { Photo } from '../data/types';

const isHttp = (u: string | null | undefined): u is string => !!u && /^https:\/\//.test(u);

/** Where the photo is published: Wikimedia Commons, or Flickr for photos found through Openverse. */
export function sourceSite(pageUrl: string): string | null {
  if (/^https:\/\/commons\.wikimedia\.org\//.test(pageUrl)) return 'Wikimedia Commons';
  if (/^https:\/\/(www\.)?flickr\.com\//.test(pageUrl)) return 'Flickr';
  return null;
}

/** Full attribution: title, author, license (linked), source page and modification notice. */
export function PhotoCredit({ photo, className = '' }: { photo: Photo; className?: string }) {
  const s = photo.source;
  const title = s.title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '');
  return (
    <p className={`text-xs leading-relaxed text-muted ${className}`}>
      {isHttp(s.pageUrl) ? (
        <a href={s.pageUrl} target="_blank" rel="noopener noreferrer" className="text-soft underline decoration-line underline-offset-2 hover:text-text">
          “{title}”
        </a>
      ) : (
        <>“{title}”</>
      )}{' '}
      by {s.photographer},{' '}
      {isHttp(s.licenseUrl) ? (
        <a href={s.licenseUrl} target="_blank" rel="noopener noreferrer" className="text-soft underline decoration-line underline-offset-2 hover:text-text">
          {s.license}
        </a>
      ) : (
        s.license
      )}
      {sourceSite(s.pageUrl) ? `, via ${sourceSite(s.pageUrl)}` : ''}. {s.modifications}
    </p>
  );
}

/**
 * Attribution shown while a question is open. The file title is left out until the
 * reveal because titles often name the car; author, license and links are always present.
 */
export function PhotoCreditShort({ photo }: { photo: Photo }) {
  const s = photo.source;
  return (
    <p className="text-[11px] leading-tight text-muted">
      Photo: {s.photographer} ·{' '}
      {isHttp(s.licenseUrl) ? (
        <a href={s.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-soft">
          {s.license}
        </a>
      ) : (
        s.license
      )}{' '}
      · full credit after you answer and on the Photo credits page
    </p>
  );
}
