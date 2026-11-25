import { describe, expect, test } from 'vitest';
import { EMPTY_STATE, toFetchResult } from '../src/core/state.ts';
import { makeSnapshot } from '../src/core/snapshot.ts';
import { assess } from '../src/core/trust.ts';
import { iconSvg } from '../src/core/icon.ts';
import { badgeValue, shortWhen, textWidth } from '../src/lambda/badge.ts';
import { createHandler, type HttpResponse } from '../src/lambda/index.ts';
import { refresh } from '../src/lambda/refresh.ts';
import { MemoryStore } from '../src/lambda/store.ts';
import { fixture, seattle } from './support.ts';

const now = seattle(2026, 11, 18, 16, 55);
const MINUTE = 60_000;

const serve = (html: string) => async () => html;
const offline = async (): Promise<string> => {
  throw new Error('offline');
};

describe('refresh', () => {
  test('keeps the last good copy', async () => {
    const store = new MemoryStore();
    const good = await refresh(store, serve(fixture()), now);
    expect(toFetchResult(good).source).toEqual({ kind: 'live', at: now });
    expect(store.pages.has('express-lanes.html')).toBe(true);

    // WSDOT can't be reached, so the saved copy is used
    const down = await refresh(store, offline, now + MINUTE);
    expect(toFetchResult(down).source).toEqual({ kind: 'cached', at: now });
    expect(down.error).toBe('offline');

    // The page changes into something unreadable. Keep the old copy and say so.
    const changed = await refresh(store, serve('<html>new site</html>'), now + 2 * MINUTE);
    expect(toFetchResult(changed).source).toEqual({ kind: 'cached', at: now });
    expect(changed.pageChanged).toBe(true);
    expect(changed.info?.scheduleFromPage).toBe(true);
    expect(store.pages.get('unreadable.html')).toContain('new site');
  });

  test('remembers a changed page until a good one comes in', async () => {
    const store = new MemoryStore();
    await refresh(store, serve(fixture()), now);
    await refresh(store, serve('<html>new site</html>'), now + MINUTE);

    // A failed download doesn't clear it
    const later = now + 3 * MINUTE;
    const down = await refresh(store, offline, later);
    expect(down.pageChanged).toBe(true);
    expect(assess(toFetchResult(down), later).verdict).toBe('uncertain');

    // A good page does
    expect((await refresh(store, serve(fixture()), now + 4 * MINUTE)).pageChanged).toBe(false);
  });

  test('with nothing saved it uses the built-in schedule', async () => {
    const state = await refresh(new MemoryStore(), offline, now);
    expect(toFetchResult(state).source).toEqual({ kind: 'builtIn' });
  });
});

describe('badge', () => {
  // Nothing read from WSDOT yet
  const snapAt = (at: number) => makeSnapshot(toFetchResult(EMPTY_STATE), at);

  test('says when the lanes change next', async () => {
    const store = new MemoryStore();
    const state = await refresh(store, serve(fixture()), now);
    const snap = makeSnapshot(toFetchResult(state), now);
    expect(badgeValue(snap, true)).toEqual({ text: 'northbound until 9 PM', color: '#1e8e3e' });
    expect(badgeValue(snap, false).text).toBe('northbound');

    // Overnight, after the 9 p.m. early close
    const night = seattle(2026, 11, 18, 22);
    expect(badgeValue(makeSnapshot(toFetchResult({ ...state, fetchedAt: night, checkedAt: night }), night), true).text)
      .toBe('closed until 5 AM tomorrow');
  });

  test("says can't confirm when it can't", () => {
    expect(badgeValue(snapAt(now), true)).toEqual({ text: "can't confirm", color: '#c77700' });
    expect(iconSvg(snapAt(now), 20)).toContain("can't be confirmed");
  });

  test('short times', () => {
    expect(shortWhen(seattle(2026, 11, 18, 23, 15), now)).toBe('11:15 PM');
    expect(shortWhen(seattle(2026, 11, 19, 0), now)).toBe('midnight');
    expect(shortWhen(seattle(2026, 11, 20, 12), now)).toBe('noon Fri');
  });

  test('measures text in Verdana', () => {
    expect(textWidth('ii')).toBeCloseTo(6.04);
    expect(textWidth('WW')).toBeCloseTo(21.76);
    // Characters Verdana's table doesn't have get an average width
    expect(textWidth('✕')).toBe(7);
  });
});

describe('handler', () => {
  const setup = async (clock = now) => {
    const store = new MemoryStore();
    await refresh(store, serve(fixture()), now);
    let downloads = 0;
    const handler = createHandler(store, async () => {
      downloads++;
      return fixture();
    }, () => clock);
    const get = async (rawPath: string, query: Record<string, string> = {}, headers: Record<string, string> = {}) =>
      (await handler({ rawPath, queryStringParameters: query, headers, requestContext: { http: { method: 'GET' } } })) as HttpResponse;
    return { store, handler, get, downloads: () => downloads };
  };

  test('/status sends the state and what it means now', async () => {
    const { get } = await setup();
    const res = await get('/status');
    expect(res.statusCode).toBe(200);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    const body = JSON.parse(res.body);
    expect(body.fetchedAt).toBe(now);
    expect(body.info.scheduleFromPage).toBe(true);
    expect(body.current).toMatchObject({ verdict: 'confident', shown: 'northbound', nextText: 'Closes at 9:00 PM' });
  });

  test('/badge.svg sends a badge that browsers can check back on', async () => {
    const { get } = await setup();
    const res = await get('/badge.svg');
    expect(res.headers['Content-Type']).toContain('image/svg+xml');
    expect(res.headers['Cache-Control']).toBe('no-cache');
    expect(res.body).toContain('I-5 express lanes: northbound until 9 PM');
    const again = await get('/badge.svg', {}, { 'if-none-match': res.headers.ETag });
    expect(again.statusCode).toBe(304);

    const square = await get('/badge.svg', { style: 'flat-square', time: '0', label: 'Express <lanes>' });
    expect(square.body).toContain('Express &lt;lanes&gt;: northbound<');
    expect(square.body).not.toContain('rx="3"');
  });

  test('/icon.svg', async () => {
    const { get } = await setup();
    const res = await get('/icon.svg', { size: '40' });
    expect(res.body).toContain('width="46" height="40"');
    expect(res.body).toContain('>N</text>');
  });

  test('reads WSDOT itself when the schedule stops', async () => {
    const late = await setup(now + 45 * MINUTE);
    await late.get('/status');
    await late.get('/badge.svg');
    // Only once, not on every request
    expect(late.downloads()).toBe(1);

    const onTime = await setup(now + 10 * MINUTE);
    await onTime.get('/status');
    expect(onTime.downloads()).toBe(0);
  });

  test('the schedule refreshes', async () => {
    const { handler, downloads } = await setup();
    await handler({ refresh: true });
    expect(downloads()).toBe(1);
  });

  test('/healthcheck', async () => {
    const { get } = await setup(now + 10 * MINUTE);
    const res = await get('/healthcheck');
    expect(res.statusCode).toBe(200);
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(JSON.parse(res.body)).toEqual({
      status: 'ok',
      checks: [
        { name: 'Refresh schedule', ok: true, detail: 'last ran 10 minutes ago' },
        { name: "WSDOT's page", ok: true, detail: 'read 10 minutes ago' },
      ],
    });
  });

  test('/healthcheck fails when the schedule stops, without reading WSDOT itself', async () => {
    const late = await setup(now + 60 * MINUTE);
    const res = await late.get('/healthcheck');
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).checks[0]).toEqual({ name: 'Refresh schedule', ok: false, detail: 'last ran 60 minutes ago' });
    expect(late.downloads()).toBe(0);
  });

  test("/healthcheck says when WSDOT's page can't be read", async () => {
    const { store, get } = await setup();
    await refresh(store, serve('<html>new site</html>'), now);
    expect(JSON.parse((await get('/healthcheck')).body).checks[1]).toMatchObject({ ok: false });

    await refresh(store, serve(fixture()), now);
    await refresh(store, offline, now);
    expect(JSON.parse((await get('/healthcheck')).body).checks[1]).toEqual({ name: "WSDOT's page", ok: false, detail: 'offline' });
  });

  test('other paths', async () => {
    const { get } = await setup();
    expect((await get('/')).statusCode).toBe(302);
    expect((await get('/nope')).statusCode).toBe(404);
  });
});
