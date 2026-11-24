import type { ServerState } from '../core/state.ts';

const params = new URLSearchParams(location.search);

/** Add ?api=http://localhost:8787 to use another copy of the API */
export const API_URL = (
  params.get('api') ?? (import.meta.env.DEV ? 'http://localhost:8787' : 'https://i5.andrewmacheret.com')
).replace(/\/$/, '');

export const PAGE_URL = 'https://andrewmacheret.com/projects/i5/';

const SAVED_KEY = 'i5-status';

export async function loadStatus(): Promise<ServerState> {
  const res = await fetch(`${API_URL}/status`, { cache: 'no-cache', signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`The server returned HTTP ${res.status}`);
  const state = (await res.json()) as ServerState;
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(state));
  } catch {
    // storage can be turned off, it just won't remember the last copy
  }
  return state;
}

/** The last copy this browser got, so the page has something to show right away */
export function savedStatus(): ServerState | null {
  try {
    const state = JSON.parse(localStorage.getItem(SAVED_KEY) ?? 'null');
    return state && typeof state === 'object' && 'checkedAt' in state ? state : null;
  } catch {
    return null;
  }
}

/** Add ?now=2026-11-26T10:00-08:00 to see how the page looks at another time */
export function clockOffset(): number {
  const at = params.get('now');
  const ms = at ? Date.parse(at) : NaN;
  return Number.isNaN(ms) ? 0 : ms - Date.now();
}
