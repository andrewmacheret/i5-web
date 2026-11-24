import { createHash } from 'node:crypto';
import { makeSnapshot, nextText } from '../core/snapshot.ts';
import { type ServerState, toFetchResult } from '../core/state.ts';
import { shown } from '../core/trust.ts';
import { iconSvg } from '../core/icon.ts';
import { badge, type BadgeStyle, DEFAULT_LABEL } from './badge.ts';
import { type Download, httpGet, refresh } from './refresh.ts';
import { S3Store, type Store } from './store.ts';

/** The parts of an API Gateway HTTP API event this uses */
export interface HttpEvent {
  rawPath?: string;
  queryStringParameters?: Record<string, string | undefined>;
  headers?: Record<string, string | undefined>;
  requestContext?: { http?: { method?: string } };
  /** Sent by the EventBridge schedule. API Gateway events never have it. */
  refresh?: boolean;
}

export interface HttpResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export const PAGE_URL = 'https://andrewmacheret.com/projects/i5/';

// How long a warm Lambda keeps the saved state before reading S3 again
const STATE_TTL = 60_000;
// If the schedule hasn't read WSDOT in this long, a request reads it instead
const OVERDUE = 30 * 60_000;
const INLINE_RETRY = 5 * 60_000;

const CORS = { 'Access-Control-Allow-Origin': '*' };

export function statusBody(state: ServerState, now: number) {
  const snap = makeSnapshot(toFetchResult(state), now);
  return {
    ...state,
    // Worked out by the server at `at`, for scripts that don't want to run the schedule themselves
    current: {
      at: now,
      verdict: snap.check.verdict,
      scheduled: snap.check.scheduled,
      shown: shown(snap.check),
      next: snap.next,
      nextText: nextText(snap),
      concerns: snap.check.concerns.map(({ title, detail, link }) => ({ title, detail, link })),
    },
  };
}

const flag = (v: string | undefined, fallback: boolean) =>
  v === undefined ? fallback : !['0', 'false', 'no', 'off'].includes(v.toLowerCase());

function svgResponse(svg: string, ifNoneMatch: string | undefined): HttpResponse {
  const etag = `"${createHash('sha1').update(svg).digest('hex').slice(0, 16)}"`;
  // no-cache makes GitHub's image proxy check back each time, so README badges stay current
  const headers = { ...CORS, 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'no-cache', ETag: etag };
  if (ifNoneMatch === etag) return { statusCode: 304, headers, body: '' };
  return { statusCode: 200, headers, body: svg };
}

const json = (status: number, body: unknown, cache = 'public, max-age=60'): HttpResponse => ({
  statusCode: status,
  headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache },
  body: JSON.stringify(body),
});

export function createHandler(store: Store, download: Download = httpGet, clock: () => number = Date.now) {
  let cached: { state: ServerState; loadedAt: number } | null = null;
  let lastInline = 0;

  async function current(now: number): Promise<ServerState> {
    if (!cached || now - cached.loadedAt > STATE_TTL) cached = { state: await store.loadState(), loadedAt: now };
    if (now - (cached.state.checkedAt ?? 0) > OVERDUE && now - lastInline > INLINE_RETRY) {
      lastInline = now;
      cached = { state: await refresh(store, download, now), loadedAt: now };
    }
    return cached.state;
  }

  return async (event: HttpEvent): Promise<HttpResponse | ServerState> => {
    const now = clock();
    if (event.refresh) {
      const state = await refresh(store, download, now);
      cached = { state, loadedAt: now };
      return state;
    }

    const method = event.requestContext?.http?.method ?? 'GET';
    if (method === 'OPTIONS') {
      return { statusCode: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS' }, body: '' };
    }
    if (method !== 'GET' && method !== 'HEAD') return json(405, { error: 'Only GET works here' }, 'no-store');

    const path = event.rawPath ?? '/';
    const q = event.queryStringParameters ?? {};
    const headers = event.headers ?? {};
    try {
      switch (path) {
        case '/':
          return { statusCode: 302, headers: { Location: PAGE_URL, 'Cache-Control': 'public, max-age=3600' }, body: '' };
        case '/status':
          return json(200, statusBody(await current(now), now));
        case '/badge.svg': {
          const snap = makeSnapshot(toFetchResult(await current(now)), now);
          const style: BadgeStyle = q.style === 'flat-square' ? 'flat-square' : 'flat';
          const label = (q.label ?? DEFAULT_LABEL).slice(0, 60);
          return svgResponse(badge(snap, { style, time: flag(q.time, true), label }), headers['if-none-match']);
        }
        case '/icon.svg': {
          const snap = makeSnapshot(toFetchResult(await current(now)), now);
          const size = Math.min(256, Math.max(12, Number(q.size) || 20));
          return svgResponse(iconSvg(snap, size), headers['if-none-match']);
        }
        default:
          return json(404, { error: `Not found: ${path}. Try /status, /badge.svg or /icon.svg` }, 'no-store');
      }
    } catch (e) {
      console.error(e);
      return json(500, { error: e instanceof Error ? e.message : String(e) }, 'no-store');
    }
  };
}

export const handler = createHandler(new S3Store(process.env.STATE_BUCKET ?? ''));
