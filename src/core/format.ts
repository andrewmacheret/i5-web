import type { DayKey } from './models.ts';
import * as Seattle from './seattle.ts';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "9:00 PM" in Seattle time */
export function clock(ms: number): string {
  const t = Seattle.time(ms);
  const h = Math.floor(t / 60);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(t % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "Today", "Tomorrow" or "Thu" */
export function dayName(ms: number, now: number): string {
  const day = Seattle.day(ms);
  const diff = Seattle.daysBetween(Seattle.day(now), day);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return WEEKDAYS[Seattle.weekday(day)];
}

/** "9:00 PM", "5:00 AM tomorrow", "8:00 AM Sat" */
export function when(ms: number, now: number): string {
  const day = dayName(ms, now);
  if (day === 'Today') return clock(ms);
  return `${clock(ms)} ${day === 'Tomorrow' ? 'tomorrow' : day}`;
}

/** "Thu, Nov 19" */
export function shortDay(day: DayKey): string {
  const { month, day: d } = Seattle.splitDay(day);
  return `${WEEKDAYS[Seattle.weekday(day)]}, ${MONTHS[month - 1]} ${d}`;
}

export const shortDate = (ms: number) => shortDay(Seattle.day(ms));

/** "4h 5m", "12m", "2d 3h" */
export function countdown(to: number, from: number): string {
  const total = Math.max(0, Math.floor((to - from) / 60_000));
  const d = Math.floor(total / (24 * 60));
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${Math.max(m, 1)}m`;
}
