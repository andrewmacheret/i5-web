import { beforeEach, describe, expect, it, vi } from 'vitest';

// api.ts reads the address and localStorage, so give it browser-like ones

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  vi.resetModules();
  vi.stubGlobal('location', { search: '' });
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
  });
});

const api = () => import('../src/web/api.ts');

describe('the saved copy', () => {
  it('is used when it has the server timeline', async () => {
    const status = { published: null, fetchedAt: 1, checkedAt: 1, error: null, live: null };
    storage.set('i5-status-v2', JSON.stringify(status));
    expect((await api()).savedStatus()).toEqual(status);
  });

  it("is ignored when it's from before the server sent a timeline", async () => {
    storage.set('i5-status', JSON.stringify({ info: {}, checkedAt: 1 }));
    storage.set('i5-status-v2', JSON.stringify({ info: {}, checkedAt: 1 }));
    expect((await api()).savedStatus()).toBeNull();
  });

  it('is ignored when it is garbled', async () => {
    storage.set('i5-status-v2', '{nope');
    expect((await api()).savedStatus()).toBeNull();
  });
});

describe('the address', () => {
  it('uses the real API by default', async () => {
    vi.stubEnv('DEV', false);
    expect((await api()).API_URL).toBe('https://i5.andrewmacheret.com');
    vi.unstubAllEnvs();
  });

  it('uses the local API while developing', async () => {
    vi.stubEnv('DEV', true);
    expect((await api()).API_URL).toBe('http://localhost:8787');
    vi.unstubAllEnvs();
  });

  it('takes ?api= for another copy of the API', async () => {
    vi.stubGlobal('location', { search: '?api=http://localhost:8787/' });
    expect((await api()).API_URL).toBe('http://localhost:8787');
  });

  it('takes ?now= to show another moment', async () => {
    vi.stubGlobal('location', { search: '?now=2026-11-26T10:00-08:00' });
    const offset = (await api()).clockOffset();
    expect(Date.now() + offset).toBeCloseTo(Date.parse('2026-11-26T10:00-08:00'), -3);
  });
});
