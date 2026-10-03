import type { Photo } from '../data/types';

const isHttp = (u: string | null | undefined): u is string => !!u && /^https:\/\//.test(u);

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
      {isHttp(s.pageUrl) ? ', via Wikimedia Commons' : ''}. {s.modifications}
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
