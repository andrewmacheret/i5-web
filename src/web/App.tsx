import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ServerStatus } from '../core/models.ts';
import { makeSnapshot } from '../core/snapshot.ts';
import { API_URL, clockOffset, loadStatus, PAGE_URL, savedStatus } from './api.ts';
import { Page } from './Page.tsx';

// How often the page asks the server again. The server reads WSDOT every 15 minutes.
const RELOAD_EVERY = 5 * 60_000;
const TICK_EVERY = 15_000;

const offset = clockOffset();
const clock = () => Date.now() + offset;

const EMPTY: ServerStatus = { published: null, fetchedAt: null, checkedAt: null, error: null, live: null };

/**
 * With ?now=, move the server's read times along with the clock so the data doesn't look old.
 * A local API started with --at already runs on that clock, so its data is left alone.
 */
const shifted = (s: ServerStatus): ServerStatus =>
  offset === 0 || (s.checkedAt !== null && Math.abs(s.checkedAt - clock()) < 60 * 60_000)
    ? s
    : {
        ...s,
        fetchedAt: s.fetchedAt === null ? null : s.fetchedAt + offset,
        checkedAt: s.checkedAt === null ? null : s.checkedAt + offset,
        live: null,
      };

export default function App() {
  const [status, setStatus] = useState<ServerStatus | null>(savedStatus);
  const [refreshing, setRefreshing] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(clock);
  const lastLoad = useRef(0);

  const reload = useCallback(async () => {
    lastLoad.current = Date.now();
    setRefreshing(true);
    setNow(clock());
    try {
      setStatus(await loadStatus());
      setLoadError(null);
    } catch (e) {
      setLoadError(`Couldn't reach the server: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRefreshing(false);
      setNow(clock());
    }
  }, []);

  useEffect(() => {
    reload();
    const tick = setInterval(() => setNow(clock()), TICK_EVERY);
    const poll = setInterval(reload, RELOAD_EVERY);
    // Phones pause timers in background tabs, so catch up when the page comes back
    const wake = () => {
      setNow(clock());
      if (document.visibilityState === 'visible' && Date.now() - lastLoad.current > 60_000) reload();
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', reload);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', reload);
    };
  }, [reload]);

  const snap = useMemo(() => makeSnapshot(shifted(status ?? EMPTY), now), [status, now]);

  return (
    <Page
      snap={snap}
      loaded={status}
      loadError={loadError}
      refreshing={refreshing}
      preview={offset !== 0}
      onRefresh={reload}
      apiUrl={API_URL}
      pageUrl={PAGE_URL}
    />
  );
}
