import { describe, expect, test } from 'vitest';
import { advisoryIsOver, BUILT_IN_SCHEDULE, END_OF_DAY, hm, MIDNIGHT } from '../src/core/models.ts';
import { Dates, parse, window } from '../src/core/parser.ts';
import { assess } from '../src/core/trust.ts';
import { day, DEFAULT_SCHEDULE, fixture, page, seattle } from './support.ts';

const now = seattle(2026, 11, 18, 16, 55);

describe('parser', () => {
  test('reads the weekly schedule', () => {
    const info = parse(fixture(), now);
    expect(info.scheduleFromPage).toBe(true);
    expect(info.schedule).toEqual(BUILT_IN_SCHEDULE);
    expect(info.warnings).toEqual([]);
  });

  test('reads early closes', () => {
    const info = parse(fixture(), now);
    expect(info.earlyCloses).toHaveLength(19);
    expect(info.earlyCloses.every((e) => e.time === hm(21))).toBe(true);
    expect(info.earlyCloses[0].day).toBe(day(2026, 11, 16));
    // January rolls into next year
    expect(info.earlyCloses.at(-1)?.day).toBe(day(2027, 1, 6));
  });

  test('an early close with its own time', () => {
    const html = page({
      special: `<h3>Express lanes closing early</h3><p>The I-5 express lanes will close at 9 p.m. on the dates below.</p>
        <ul><li>Monday, Nov. 30</li><li>Tuesday, Dec. 1 at 8 p.m.</li></ul>`,
    });
    expect(parse(html, now).earlyCloses).toEqual([
      { day: day(2026, 11, 30), time: hm(21) },
      { day: day(2026, 12, 1), time: hm(20) },
    ]);
  });

  test('an early close without a time', () => {
    const html = page({
      special: '<h3>Express lanes closing early</h3><p>The lanes will close early.</p><ul><li>Monday, Nov. 30</li></ul>',
    });
    expect(parse(html, now).earlyCloses).toEqual([{ day: day(2026, 11, 30), time: null }]);
  });

  test('reads the weekend closure', () => {
    const e = parse(fixture(), now).events[0];
    expect(e.closure?.start).toBe(seattle(2026, 12, 4, 23));
    expect(e.closure?.end).toBe(seattle(2026, 12, 7, 4));
    expect(e.days).toEqual({ first: day(2026, 12, 4), last: day(2026, 12, 7) });
    expect(e.link).toContain('ship-canal-bridge');
  });

  test("a closure without times isn't guessed", () => {
    const html = page({
      special: '<h3>Full express lanes closure</h3><p>The lanes will be closed Dec. 12 and Dec. 13.</p>',
    });
    const e = parse(html, now).events[0];
    expect(e.closure).toBeNull();
    expect(e.days).toEqual({ first: day(2026, 12, 12), last: day(2026, 12, 13) });
  });

  test('reads notice dates', () => {
    const a = parse(fixture(), now).advisories[0];
    expect(a.text.startsWith('Please note')).toBe(true);
    expect(a.days).toEqual({ first: day(2026, 11, 16), last: day(2026, 11, 17) });
    expect(advisoryIsOver(a, day(2026, 11, 18))).toBe(true);
    expect(advisoryIsOver(a, day(2026, 11, 17))).toBe(false);
  });

  test('"until further notice" has no end', () => {
    const html = page({
      schedule: '<p>As of Nov. 16 the express lanes are closed until further notice.</p>' + DEFAULT_SCHEDULE,
    });
    const a = parse(html, now).advisories[0];
    expect(a.days).toEqual({ first: day(2026, 11, 16), last: null });
    expect(advisoryIsOver(a, day(2026, 12, 25))).toBe(false);
  });

  test('an "as of" notice has no end', () => {
    // Still on the page means still in effect, even days later
    const html = page({
      schedule:
        '<p>As of 4 p.m. Monday, Nov. 16, the express lanes are closed for emergency panel repair.</p>' +
        DEFAULT_SCHEDULE,
    });
    expect(parse(html, now).advisories[0].days).toEqual({ first: day(2026, 11, 16), last: null });
  });

  test('reads date ranges', () => {
    expect(Dates.all('Weekend closure, Dec. 4-7', now)).toEqual([day(2026, 12, 4), day(2026, 12, 7)]);
    expect(Dates.all('Dec. 4 – 7', now)).toEqual([day(2026, 12, 4), day(2026, 12, 7)]);
    // A time after a dash isn't a date
    expect(Dates.all('Monday, Nov. 16 - 4 p.m.', now)).toEqual([day(2026, 11, 16)]);
    expect(Dates.all('Nov. 16 - 4:30', now)).toEqual([day(2026, 11, 16)]);
    // Dates that don't exist are skipped
    expect(Dates.all('Feb. 30', now)).toEqual([]);
  });

  test('a closure written date first', () => {
    const html = page({
      special: '<h3>Weekend closure</h3><p>Closed from Friday, Jan. 8 at 11 p.m. to Monday, Jan. 11 at 5 a.m.</p>',
    });
    const c = parse(html, now).events[0].closure;
    expect(c?.start).toBe(seattle(2027, 1, 8, 23));
    expect(c?.end).toBe(seattle(2027, 1, 11, 5));
  });

  test('reads every closure in an event', () => {
    const html = page({
      special:
        '<h3>Weekend closures</h3><p>Closed 11 p.m. Friday, Dec. 4 to 4 a.m. Monday, Dec. 7, ' +
        'and again 11 p.m. Friday, Dec. 11 to 4 a.m. Monday, Dec. 14.</p>',
    });
    const events = parse(html, now).events;
    expect(events.map((e) => e.closure?.start)).toEqual([seattle(2026, 12, 4, 23), seattle(2026, 12, 11, 23)]);
  });

  test('flags dates no closure covers', () => {
    const html = page({
      special:
        '<h3>Weekend closures</h3><p>Closed 11 p.m. Friday, Dec. 4 to 4 a.m. Monday, Dec. 7. ' +
        'Another closure is planned Dec. 18-21.</p>',
    });
    const events = parse(html, now).events;
    expect(events).toHaveLength(2);
    const loose = events.find((e) => e.closure === null);
    expect(loose?.days).toEqual({ first: day(2026, 12, 18), last: day(2026, 12, 21) });
    const during = seattle(2026, 12, 19, 10);
    const result = { info: parse(html, during), source: { kind: 'live', at: during }, error: null, pageChanged: false } as const;
    expect(assess(result, during).verdict).toBe('uncertain');
  });

  test('flags parts of the page it does not know', () => {
    const html = page({ schedule: DEFAULT_SCHEDULE + '<h3>Holidays</h3><ul><li>Southbound only, all day</li></ul>' });
    const info = parse(html, now);
    expect(info.scheduleFromPage).toBe(true);
    expect(info.warnings.some((w) => w.includes('Holidays'))).toBe(true);
    expect(info.warnings.some((w) => w.includes('Southbound only, all day'))).toBe(true);
  });

  test('only reads the express lanes part', () => {
    // The footer's "Nov. 1" must not become a notice
    const info = parse(page(), now);
    expect(info.advisories).toEqual([]);
    expect(info.warnings).toEqual([]);
  });

  test('schedule line formats', () => {
    expect(window('Northbound - 1:45 to 11 p.m.')).toEqual({ status: 'northbound', start: hm(13, 45), end: hm(23) });
    expect(window('Southbound - 10 to 2 p.m.')).toEqual({ status: 'southbound', start: hm(10), end: hm(14) });
    expect(window('Southbound - 24 hours a day')).toEqual({ status: 'southbound', start: MIDNIGHT, end: END_OF_DAY });
    expect(window('Northbound - 11 a.m. to midnight')).toEqual({ status: 'northbound', start: hm(11), end: END_OF_DAY });
    expect(window('Closed: 11 p.m. - 5 a.m.')).toBeNull();
  });

  test('garbage falls back to the built-in schedule', () => {
    const info = parse('<html><p>nothing here</p></html>');
    expect(info.scheduleFromPage).toBe(false);
    expect(info.schedule).toEqual(BUILT_IN_SCHEDULE);
    expect(info.warnings.length).toBeGreaterThan(0);
  });
});
