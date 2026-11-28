import * as Format from './format.ts';
import { type DayKey, type Doubt, type LaneStatus, type ServerStatus, TITLES } from './models.ts';
import * as Seattle from './seattle.ts';
import { type Change, type DaySegment, daySegments, doubtsBetween, upcomingChanges } from './timeline.ts';
import { type Assessment, assess } from './trust.ts';

/** Everything the page and the badge show, worked out once. */
export interface Snapshot {
  now: number;
  today: DayKey;
  status: ServerStatus;
  check: Assessment;
  changes: Change[];
  next: Change | null;
  todaySegments: DaySegment[];
  tomorrowSegments: DaySegment[];
  tomorrowDoubts: Doubt[];
  /** Days in the next week with something the server can't vouch for */
  doubtfulDays: Set<DayKey>;
}

export function makeSnapshot(status: ServerStatus, now: number): Snapshot {
  const p = status.published;
  const today = Seattle.day(now);
  const tomorrow = Seattle.addDays(today, 1);
  const doubtful = new Set<DayKey>();
  if (p) {
    for (let i = 0; i <= 7; i++) {
      const d = Seattle.addDays(today, i);
      if (doubtsBetween(p, Math.max(now, Seattle.startOfDay(d)), Seattle.startOfDay(Seattle.addDays(d, 1))).length) doubtful.add(d);
    }
  }
  const changes = p ? upcomingChanges(p, now, 4) : [];
  return {
    now,
    today,
    status,
    check: assess(status, now),
    changes,
    next: changes[0] ?? null,
    todaySegments: p ? daySegments(p, today) : [{ start: 0, end: 24 * 60, status: 'unknown' }],
    tomorrowSegments: p ? daySegments(p, tomorrow) : [{ start: 0, end: 24 * 60, status: 'unknown' }],
    tomorrowDoubts: p ? doubtsBetween(p, Seattle.startOfDay(tomorrow), Seattle.startOfDay(Seattle.addDays(tomorrow, 1))) : [],
    doubtfulDays: doubtful,
  };
}

/** "Closes", "Opens northbound", "Switches southbound" */
export function verb(current: LaneStatus, to: LaneStatus): string {
  if (to === 'unknown') return 'Schedule unknown';
  if (to === 'closed') return 'Closes';
  if (current === 'closed' || current === 'unknown') return `Opens ${TITLES[to].toLowerCase()}`;
  return `Switches ${TITLES[to].toLowerCase()}`;
}

/** "Closes at 9:00 PM" */
export function nextText(s: Snapshot): string {
  if (!s.next) return 'No changes coming up';
  if (s.next.to === 'unknown') return `Schedule unknown after ${Format.when(s.next.at, s.now)}`;
  return `${verb(s.check.scheduled, s.next.to)} at ${Format.when(s.next.at, s.now)}`;
}

/** True when the lanes flip within 15 minutes */
export const changingSoon = (s: Snapshot) => s.next !== null && s.next.to !== 'unknown' && s.next.at - s.now <= 15 * 60_000;
