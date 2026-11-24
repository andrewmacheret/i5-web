import type { DayKey, TimeOfDay } from './models.ts';

// Seattle time helpers. The lanes run on Seattle time no matter where the browser is.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const parts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

// Seattle's clock only changes on the hour in UTC, so one lookup per UTC hour is enough.
// Asking Intl every minute would make the week-ahead scan slow.
const offsets = new Map<number, number>();

/** Minutes Seattle is ahead of UTC at a moment, like -480 in winter */
export function offsetMinutes(ms: number): number {
  const hour = Math.floor(ms / HOUR);
  let off = offsets.get(hour);
  if (off === undefined) {
    const p: Record<string, number> = {};
    for (const { type, value } of parts.formatToParts(new Date(hour * HOUR))) p[type] = Number(value);
    const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    off = Math.round((wall - hour * HOUR) / MINUTE);
    if (offsets.size > 50_000) offsets.clear();
    offsets.set(hour, off);
  }
  return off;
}

/** The Seattle wall clock at a moment, as a Date whose UTC fields read as Seattle time */
const wallClock = (ms: number) => new Date(ms + offsetMinutes(ms) * MINUTE);

const pad = (n: number) => String(n).padStart(2, '0');

export const dayKey = (year: number, month: number, day: number): DayKey => `${year}-${pad(month)}-${pad(day)}`;

export function splitDay(key: DayKey): { year: number; month: number; day: number } {
  const [year, month, day] = key.split('-').map(Number);
  return { year, month, day };
}

/** Null for dates that don't exist, like Feb. 30 */
export function validDay(year: number, month: number, day: number): DayKey | null {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCMonth() === month - 1 && d.getUTCDate() === day ? dayKey(year, month, day) : null;
}

const calendarMs = (key: DayKey) => {
  const { year, month, day } = splitDay(key);
  return Date.UTC(year, month - 1, day);
};

export function addDays(key: DayKey, n: number): DayKey {
  const d = new Date(calendarMs(key) + n * DAY);
  return dayKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export const daysBetween = (a: DayKey, b: DayKey) => Math.round((calendarMs(b) - calendarMs(a)) / DAY);

/** 0 is Sunday */
export const weekday = (key: DayKey) => new Date(calendarMs(key)).getUTCDay();

export const isWeekend = (key: DayKey) => weekday(key) === 0 || weekday(key) === 6;

export function day(ms: number): DayKey {
  const d = wallClock(ms);
  return dayKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function time(ms: number): TimeOfDay {
  const d = wallClock(ms);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/**
 * The moment a Seattle wall clock shows `t` on `key`. END_OF_DAY means the next midnight.
 * Like java.time, a time skipped by spring forward moves later by an hour,
 * and a time repeated by fall back picks the first one.
 */
export function instant(key: DayKey, t: TimeOfDay): number {
  if (t >= 24 * 60) return startOfDay(addDays(key, 1));
  const wall = calendarMs(key) + t * MINUTE;
  const before = offsetMinutes(wall - DAY);
  const valid: number[] = [];
  for (const off of new Set([before, offsetMinutes(wall + DAY)])) {
    const ms = wall - off * MINUTE;
    if (offsetMinutes(ms) === off) valid.push(ms);
  }
  return valid.length ? Math.min(...valid) : wall - before * MINUTE;
}

export const startOfDay = (key: DayKey) => instant(key, 0);

/** True when the browser's clock isn't on Seattle time right now */
export const differsFromLocal = (ms: number) => -new Date(ms).getTimezoneOffset() !== offsetMinutes(ms);
