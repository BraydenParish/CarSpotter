import { useCallback, useEffect, useState } from 'react';

export type Route = 'home' | 'play' | 'stats' | 'garage' | 'awards' | 'credits' | 'settings' | 'how' | 'timeline';
const ROUTES: Route[] = ['home', 'play', 'stats', 'garage', 'awards', 'credits', 'settings', 'how', 'timeline'];

function parse(): Route {
  const r = window.location.hash.replace(/^#\/?/, '') as Route;
  return ROUTES.includes(r) ? r : 'home';
}

/** Minimal hash router so the browser/phone back button works. */
export function useRoute(): [Route, (r: Route, replace?: boolean) => void] {
  const [route, setRoute] = useState<Route>(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = useCallback((r: Route, replace = false) => {
    const hash = r === 'home' ? '#/' : `#/${r}`;
    if (replace) window.history.replaceState(null, '', hash);
    else window.history.pushState(null, '', hash);
    setRoute(r);
    window.scrollTo({ top: 0 });
  }, []);
  return [route, go];
}
