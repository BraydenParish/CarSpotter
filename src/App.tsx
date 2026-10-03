import { useCallback, useEffect, useState } from 'react';
import type { GameContext } from './game/context';
import { createRun, type RunState } from './game/engine';
import type { RunConfig } from './game/modes';
import { practiceList } from './game/progress';
import { Toasts } from './ui/components';
import { Garage } from './ui/Garage';
import { Home } from './ui/Home';
import { Awards, Credits, HowToPlay, IntroModal, SettingsPage } from './ui/Pages';
import { Play } from './ui/Play';
import { useRoute } from './ui/router';
import { Stats } from './ui/Stats';
import { StoreProvider, useStore } from './ui/store';

export function App({ ctx, fixtures }: { ctx: GameContext; fixtures: boolean }) {
  return (
    <StoreProvider ctx={ctx} fixtures={fixtures}>
      <Shell />
    </StoreProvider>
  );
}

function Shell() {
  const { ctx, profile, update, pushToast } = useStore();
  const [route, go] = useRoute();
  const [run, setRun] = useState<RunState | null>(null);

  const start = useCallback(
    (config: RunConfig) => {
      const res = createRun(ctx, config, {
        now: Date.now(),
        rng: Math.random,
        seen: profile.seen,
        practiceVehicles: practiceList(profile, ctx),
      });
      if (!res.ok) {
        pushToast({
          icon: '🚫',
          title: res.reason === 'no-practice' ? 'Nothing to practise yet' : 'Not enough verified photos',
          body: res.reason === 'no-practice' ? 'Miss a car first and it will show up here.' : 'Try different filters or difficulty.',
        });
        return;
      }
      setRun(res.state);
      go('play');
    },
    [ctx, profile, go, pushToast],
  );

  // A reload on #/play has no run to resume: send the player home.
  useEffect(() => {
    if (route === 'play' && !run) go('home', true);
    if (route !== 'play' && run) setRun(null);
  }, [route, run, go]);

  const exit = useCallback(() => {
    setRun(null);
    go('home', true);
  }, [go]);

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-xl focus:bg-accent focus:px-4 focus:py-2 focus:text-ink">
        Skip to content
      </a>
      <main id="main" tabIndex={-1} className="outline-none">
        {route === 'play' && run ? (
          <Play key={run.startedAt} initial={run} onExit={exit} onAgain={start} />
        ) : route === 'stats' ? (
          <Stats go={go} />
        ) : route === 'garage' ? (
          <Garage go={go} />
        ) : route === 'awards' ? (
          <Awards go={go} />
        ) : route === 'credits' ? (
          <Credits go={go} />
        ) : route === 'settings' ? (
          <SettingsPage go={go} />
        ) : route === 'how' ? (
          <HowToPlay go={go} />
        ) : (
          <Home go={go} onStart={start} />
        )}
      </main>
      <IntroModal open={route === 'home' && !profile.introSeen} onDone={() => update((p) => ({ ...p, introSeen: true }))} />
      <Toasts />
    </>
  );
}
