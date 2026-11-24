import { describe, expect, test } from 'vitest';
import { Engine } from '../src/core/engine.ts';
import * as Format from '../src/core/format.ts';
import { END_OF_DAY, type ExpressLanesInfo, hm, BUILT_IN_SCHEDULE } from '../src/core/models.ts';
import * as Seattle from '../src/core/seattle.ts';
import { day, seattle } from './support.ts';

const info: ExpressLanesInfo = {
  schedule: BUILT_IN_SCHEDULE,
  scheduleFromPage: false,
  earlyCloses: [
    { day: day(2026, 11, 18), time: hm(21) },
    { day: day(2026, 11, 19), time: null },
  ],
  events: [
    {
      title: 'Weekend closure',
      detail: '',
      link: null,
      days: null,
      closure: { title: 'Weekend closure', start: seattle(2026, 12, 4, 23), end: seattle(2026, 12, 7, 4) },
    },
  ],
  advisories: [],
  warnings: [],
};
const engine = new Engine(info);

describe('engine', () => {
  test('a passed early close drops off the list', () => {
    expect(engine.upcomingEarlyCloses(seattle(2026, 11, 18, 20))[0].day).toBe(day(2026, 11, 18));
    expect(engine.upcomingEarlyCloses(seattle(2026, 11, 18, 22))[0].day).toBe(day(2026, 11, 19));
  });

  test("an early close with an unknown time doesn't cut", () => {
    // Trust flags this day. The engine just keeps the normal schedule.
    expect(engine.status(seattle(2026, 11, 19, 22))).toBe('northbound');
  });

  test('daylight saving days', () => {
    // Nov 1, 2026 falls back and Mar 8, 2026 springs forward. Both are Sundays.
    for (const d of [day(2026, 11, 1), day(2026, 3, 8)]) {
      const segs = engine.segments(d);
      expect(segs.map((s) => s.status)).toEqual(['closed', 'southbound', 'closed', 'northbound', 'closed']);
      expect([segs[1].start, segs[1].end]).toEqual([hm(8), hm(13, 30)]);
      expect([segs[3].start, segs[3].end]).toEqual([hm(13, 45), hm(23)]);
      expect(segs.at(-1)?.end).toBe(END_OF_DAY);
    }
  });

  test('wall times on daylight saving days', () => {
    // 11 p.m. on the spring forward day is 7 hours behind UTC, not 8
    expect(seattle(2026, 3, 8, 23)).toBe(Date.UTC(2026, 2, 9, 6));
    // 2:30 a.m. doesn't happen that day, so it moves to 3:30
    expect(seattle(2026, 3, 8, 2, 30)).toBe(Date.UTC(2026, 2, 8, 10, 30));
    // 1:30 a.m. happens twice on the fall back day. The first one counts.
    expect(seattle(2026, 11, 1, 1, 30)).toBe(Date.UTC(2026, 10, 1, 8, 30));
    expect(Seattle.time(seattle(2026, 11, 1, 23))).toBe(hm(23));
  });

  test('weekday', () => {
    // Thu Nov 19, 2026
    expect(engine.status(seattle(2026, 11, 19, 4, 59))).toBe('closed');
    expect(engine.status(seattle(2026, 11, 19, 5))).toBe('southbound');
    expect(engine.status(seattle(2026, 11, 19, 11, 5))).toBe('closed');
    expect(engine.status(seattle(2026, 11, 19, 11, 15))).toBe('northbound');
    expect(engine.status(seattle(2026, 11, 19, 22, 59))).toBe('northbound');
    expect(engine.status(seattle(2026, 11, 19, 23))).toBe('closed');
  });

  test('weekend', () => {
    // Sat Nov 21, 2026
    expect(engine.status(seattle(2026, 11, 21, 7, 59))).toBe('closed');
    expect(engine.status(seattle(2026, 11, 21, 8))).toBe('southbound');
    expect(engine.status(seattle(2026, 11, 21, 13, 40))).toBe('closed');
    expect(engine.status(seattle(2026, 11, 21, 14))).toBe('northbound');
  });

  test('early close', () => {
    expect(engine.status(seattle(2026, 11, 18, 20, 59))).toBe('northbound');
    expect(engine.status(seattle(2026, 11, 18, 21))).toBe('closed');
  });

  test('full closure', () => {
    // Sat Dec 5 would normally be southbound at 10 a.m.
    expect(engine.status(seattle(2026, 12, 5, 10))).toBe('closed');
    expect(engine.status(seattle(2026, 12, 7, 5))).toBe('southbound');
  });

  test('upcoming changes', () => {
    const changes = engine.upcomingChanges(seattle(2026, 11, 18, 16, 55), 3);
    expect(changes.map((c) => c.to)).toEqual(['closed', 'southbound', 'closed']);
    expect(changes[0].at).toBe(seattle(2026, 11, 18, 21));
    expect(changes[1].at).toBe(seattle(2026, 11, 19, 5));
  });

  test('timeline', () => {
    const segs = engine.segments(day(2026, 11, 19));
    expect(segs.map((s) => s.status)).toEqual(['closed', 'southbound', 'closed', 'northbound', 'closed']);
    expect([segs[1].start, segs[1].end]).toEqual([hm(5), hm(11)]);
  });

  test('countdown text', () => {
    const now = seattle(2026, 11, 18, 16, 55);
    expect(Format.countdown(seattle(2026, 11, 18, 21), now)).toBe('4h 5m');
    expect(Format.countdown(seattle(2026, 11, 18, 17), now)).toBe('5m');
    expect(Format.when(seattle(2026, 11, 19, 5), now)).toBe('5:00 AM tomorrow');
    expect(Format.when(seattle(2026, 11, 21, 8), now)).toBe('8:00 AM Sat');
    expect(Format.shortDay(day(2026, 11, 19))).toBe('Thu, Nov 19');
  });
});
