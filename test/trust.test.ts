import { describe, expect, test } from 'vitest';
import { holidayName } from '../src/core/holidays.ts';
import { BUILT_IN_SCHEDULE, builtInInfo, type FetchResult, hm } from '../src/core/models.ts';
import { parse } from '../src/core/parser.ts';
import { toFetchResult } from '../src/core/state.ts';
import { assess, scheduleProblem, shown } from '../src/core/trust.ts';
import { day, DEFAULT_SCHEDULE, fixture, page, seattle } from './support.ts';

const now = seattle(2026, 11, 18, 16, 55);
const HOUR = 3_600_000;

const live = (html: string, at = now): FetchResult => ({
  info: parse(html, at),
  source: { kind: 'live', at },
  error: null,
  pageChanged: false,
});

describe('trust', () => {
  test("today's real page is confident", () => {
    // The old Monday notice is over, so it doesn't count
    const check = assess(live(fixture()), now);
    expect(check.verdict).toBe('confident');
    expect(shown(check)).toBe('northbound');
  });

  test('a notice for today blocks confidence', () => {
    const at = seattle(2026, 11, 17, 8);
    const check = assess(live(fixture(), at), at);
    expect(check.verdict).toBe('uncertain');
    expect(shown(check)).toBeNull();
    expect(check.concerns.some((c) => c.title === 'WSDOT posted a notice')).toBe(true);
  });

  test('an undated notice blocks confidence', () => {
    const html = page({ schedule: '<p>The express lanes are closed for an emergency repair.</p>' + DEFAULT_SCHEDULE });
    expect(assess(live(html), now).verdict).toBe('uncertain');
  });

  test('a holiday blocks confidence', () => {
    const tg = seattle(2026, 11, 26, 10);
    const check = assess(live(fixture(), tg), tg);
    expect(check.verdict).toBe('uncertain');
    expect(check.concerns[0].title).toContain('Thanksgiving');
  });

  test('a closure with unclear times blocks those days', () => {
    const html = page({
      special: '<h3>Full express lanes closure</h3><p>The lanes will be closed Dec. 12 and Dec. 13.</p>',
    });
    const during = seattle(2026, 12, 12, 10);
    expect(assess(live(html, during), during).verdict).toBe('uncertain');
    const before = seattle(2026, 12, 10, 10);
    expect(assess(live(html, before), before).verdict).toBe('confident');
  });

  test('an early close without a time blocks that day', () => {
    const html = page({
      special: '<h3>Express lanes closing early</h3><p>Early closures.</p><ul><li>Wednesday, Nov. 18</li></ul>',
    });
    expect(assess(live(html), now).verdict).toBe('uncertain');
  });

  test('stale data', () => {
    const info = parse(fixture(), now);
    const old: FetchResult = { info, source: { kind: 'cached', at: now - 3 * HOUR }, error: null, pageChanged: false };
    expect(assess(old, now).verdict).toBe('uncertain');
    // While a refresh is running it says checking instead
    expect(assess(old, now, true).verdict).toBe('checking');
    const fresh: FetchResult = { ...old, source: { kind: 'cached', at: now - HOUR / 2 } };
    expect(assess(fresh, now).verdict).toBe('confident');
  });

  test('the built-in schedule is never confident', () => {
    const r: FetchResult = { info: builtInInfo(), source: { kind: 'builtIn' }, error: null, pageChanged: false };
    expect(assess(r, now).verdict).toBe('uncertain');
    expect(assess(r, now, true).verdict).toBe('checking');
  });

  test('a changed page is never confident', () => {
    const r: FetchResult = { info: parse(fixture(), now), source: { kind: 'cached', at: now }, error: null, pageChanged: true };
    expect(assess(r, now, true).verdict).toBe('uncertain');
  });

  test("a fetch time in the future isn't trusted", () => {
    // The clock is behind the server's
    const r: FetchResult = { info: parse(fixture(), now), source: { kind: 'cached', at: now + HOUR }, error: null, pageChanged: false };
    expect(assess(r, now).verdict).toBe('uncertain');
    expect(assess(r, now, true).verdict).toBe('checking');
  });

  test('unknown page parts block confidence', () => {
    const html = page({ schedule: DEFAULT_SCHEDULE + '<h3>Holidays</h3><ul><li>Southbound only</li></ul>' });
    expect(assess(live(html), now).verdict).toBe('uncertain');
  });

  test('a broken schedule blocks confidence', () => {
    const bad = {
      weekday: [
        { status: 'southbound', start: hm(5), end: hm(12) },
        { status: 'northbound', start: hm(11), end: hm(23) },
      ],
      weekend: BUILT_IN_SCHEDULE.weekend,
    } as const;
    expect(scheduleProblem({ weekday: [...bad.weekday], weekend: bad.weekend })).not.toBeNull();
    expect(scheduleProblem(BUILT_IN_SCHEDULE)).toBeNull();
  });

  test('holidays', () => {
    expect(holidayName(day(2026, 11, 26))).toBe('Thanksgiving');
    expect(holidayName(day(2026, 11, 27))).toBe('Day after Thanksgiving');
    expect(holidayName(day(2026, 5, 25))).toBe('Memorial Day');
    expect(holidayName(day(2026, 9, 7))).toBe('Labor Day');
    // July 4, 2026 is a Saturday, observed Friday the 3rd
    expect(holidayName(day(2026, 7, 3))).toBe('Independence Day');
    expect(holidayName(day(2026, 7, 4))).toBe('Independence Day');
    expect(holidayName(day(2026, 11, 18))).toBeNull();
  });
});

describe('server state', () => {
  const info = parse(fixture(), now);

  test('a good read is live', () => {
    const r = toFetchResult({ info, fetchedAt: now, checkedAt: now, error: null, pageChanged: false, problems: [] });
    expect(r.source).toEqual({ kind: 'live', at: now });
    expect(assess(r, now).verdict).toBe('confident');
  });

  test('a failed read keeps the last good copy', () => {
    const r = toFetchResult({ info, fetchedAt: now - HOUR, checkedAt: now, error: 'timeout', pageChanged: false, problems: [] });
    expect(r.source).toEqual({ kind: 'cached', at: now - HOUR });
    expect(r.error).toBe('timeout');
  });

  test('an unreadable page shows its problems', () => {
    const r = toFetchResult({ info, fetchedAt: now, checkedAt: now, error: null, pageChanged: true, problems: ['New section'] });
    expect(r.info.warnings).toContain('New section');
    expect(assess(r, now).verdict).toBe('uncertain');
  });

  test('nothing read yet uses the built-in schedule', () => {
    const r = toFetchResult({ info: null, fetchedAt: null, checkedAt: now, error: 'down', pageChanged: false, problems: [] });
    expect(r.source).toEqual({ kind: 'builtIn' });
    expect(assess(r, now).verdict).toBe('uncertain');
  });
});
