/** Share via the Web Share API when available, otherwise copy to the clipboard. */
export async function copyOrShare(text: string): Promise<'shared' | 'copied' | null> {
  try {
    if (typeof navigator.share === 'function' && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)) {
      await navigator.share({ text });
      return 'shared';
    }
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return null;
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok ? 'copied' : null;
    } catch {
      return null;
    }
  }
}
