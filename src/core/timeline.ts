import { type DayKey, type Doubt, END_OF_DAY, type LaneStatus, type Published, type Segment, type TimeOfDay } from './models.ts';
import * as Seattle from './seattle.ts';

// Questions about the timeline the server published. No schedule logic lives here.
// The server works out the segments, so the page and the badge only look things up.

const MINUTE = 60_000;

export interface Change {
  at: number;
  to: LaneStatus;
}

/** A run of one status across part of a Seattle day, in wall clock minutes */
export interface DaySegment {
  start: TimeOfDay;
  end: TimeOfDay;
  status: LaneStatus;
}

/** The segment covering a moment, by binary search */
export function segmentAt(p: Published, t: number): Segment | null {
  let lo = 0;
  let hi = p.segments.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = p.segments[mid];
    if (t < s.start) hi = mid - 1;
    else if (t >= s.end) lo = mid + 1;
    else return s;
  }
  return null;
}

/** Unknown outside the published range */
export const statusAt = (p: Published, t: number): LaneStatus => segmentAt(p, t)?.status ?? 'unknown';

export const doubtsAt = (p: Published, t: number): Doubt[] => p.doubts.filter((d) => d.start <= t && t < d.end);

export const doubtsBetween = (p: Published, start: number, end: number): Doubt[] =>
  p.doubts.filter((d) => d.start < end && d.end > start);

/** The next few times the status flips, after `from` */
export function upcomingChanges(p: Published, from: number, limit = 5): Change[] {
  const out: Change[] = [];
  let current = statusAt(p, from);
  for (const s of p.segments) {
    if (s.start <= from) continue;
    if (s.status !== current) {
      out.push({ at: s.start, to: s.status });
      current = s.status;
      if (out.length === limit) break;
    }
  }
  // Past the end of the published range nothing is known
  if (out.length < limit && p.horizon.end > from && current !== 'unknown') out.push({ at: p.horizon.end, to: 'unknown' });
  return out;
}

/** The last time the status flipped at or before `t`, or null if it hasn't within the published range */
export function lastChange(p: Published, t: number): number | null {
  const s = segmentAt(p, t);
  if (!s) return null;
  const i = p.segments.indexOf(s);
  for (let j = i; j > 0; j--) {
    if (p.segments[j - 1].status !== s.status) return p.segments[j].start;
  }
  return null;
}

/**
 * Colored runs across one Seattle day, for the timeline bar. Placed by wall clock time,
 * so daylight saving days still fit a 24 hour bar. Fall back's repeated hour is drawn once.
 */
export function daySegments(p: Published, day: DayKey): DaySegment[] {
  const start = Seattle.startOfDay(day);
  const end = Seattle.startOfDay(Seattle.addDays(day, 1));
  const out: DaySegment[] = [];
  const push = (from: TimeOfDay, to: TimeOfDay, status: LaneStatus) => {
    if (to <= from) return;
    const last = out.at(-1);
    if (last && last.end > from) from = last.end;
    if (to <= from) return;
    if (last && last.status === status && last.end === from) last.end = to;
    else out.push({ start: from, end: to, status });
  };
  const wall = (t: number) => (t >= end ? END_OF_DAY : Seattle.time(t));
  let t = start;
  if (start < p.horizon.start) {
    push(0, wall(Math.min(p.horizon.start, end)), 'unknown');
    t = p.horizon.start;
  }
  for (const s of p.segments) {
    if (s.end <= t || s.start >= end) continue;
    const a = Math.max(s.start, t);
    const b = Math.min(s.end, end);
    // Wall time can jump at a clock change, so walk across it an hour at a time
    for (let x = a; x < b; ) {
      const next = Math.min(b, (Math.floor(x / (60 * MINUTE)) + 1) * 60 * MINUTE);
      push(Seattle.time(x), wall(next) || END_OF_DAY, s.status);
      x = next;
    }
    t = b;
  }
  if (t < end) push(wall(t), END_OF_DAY, 'unknown');
  return out;
}
