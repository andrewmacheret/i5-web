import { SOURCES } from '../core/models.ts';
import { parse } from '../core/parser.ts';
import type { ServerState } from '../core/state.ts';
import type { Store } from './store.ts';

export type Download = () => Promise<string>;

export const USER_AGENT = 'I5Express/1.0 (+https://andrewmacheret.com/projects/i5/)';

export const httpGet: Download = async () => {
  const res = await fetch(SOURCES.expressLanes, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status !== 200) throw new Error(`WSDOT returned HTTP ${res.status}`);
  return res.text();
};

/**
 * Reads WSDOT's page once and saves the result. Keeps the last good copy when
 * WSDOT can't be reached, or when the page has changed into something it can't read.
 */
export async function refresh(store: Store, download: Download = httpGet, now = Date.now()): Promise<ServerState> {
  const old = await store.loadState();
  let html: string;
  try {
    html = await download();
  } catch (e) {
    const state = { ...old, checkedAt: now, error: e instanceof Error ? e.message : String(e) };
    await store.saveState(state);
    return state;
  }

  const info = parse(html, now);
  let state: ServerState;
  if (info.scheduleFromPage) {
    await store.savePage('express-lanes.html', html);
    state = { info, fetchedAt: now, checkedAt: now, error: null, pageChanged: false, problems: [] };
  } else {
    // Don't replace the last good copy with a page we can't read.
    // pageChanged stays set until a good page comes in, so a retry never quietly trusts the old copy.
    await store.savePage('unreadable.html', html);
    state = { ...old, checkedAt: now, error: "Couldn't read WSDOT's page", pageChanged: true, problems: info.warnings };
  }
  await store.saveState(state);
  return state;
}
