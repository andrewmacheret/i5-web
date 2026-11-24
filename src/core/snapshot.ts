import { type Change, Engine, type Segment } from './engine.ts';
import * as Format from './format.ts';
import { holidayName } from './holidays.ts';
import { type Closure, type DayKey, type FetchResult, type LaneStatus, TITLES, type TimeOfDay } from './models.ts';
import * as Seattle from './seattle.ts';
import { type Assessment, assess, type Concern, dayConcerns } from './trust.ts';

/** Everything the page and the badge show, worked out once. */
export interface Snapshot {
  now: number;
  today: DayKey;
  result: FetchResult;
  engine: Engine;
  check: Assessment;
  changes: Change[];
  next: Change | null;
  todaySegments: Segment[];
  tomorrowSegments: Segment[];
  tomorrowConcerns: Concern[];
  /** Days in the next week that may not follow the schedule */
  doubtfulDays: Set<DayKey>;
  activeClosure: Closure | null;
  earlyCloseTonight: TimeOfDay | null;
}

export function makeSnapshot(result: FetchResult, now: number, refreshing = false): Snapshot {
  const engine = new Engine(result.info);
  const today = Seattle.day(now);
  const tomorrow = Seattle.addDays(today, 1);
  const doubtful = new Set<DayKey>();
  for (let i = 0; i <= 7; i++) {
    const d = Seattle.addDays(today, i);
    if (dayConcerns(result.info, d, today).length) doubtful.add(d);
  }
  const changes = engine.upcomingChanges(now, 4);
  return {
    now,
    today,
    result,
    engine,
    check: assess(result, now, refreshing),
    changes,
    next: changes[0] ?? null,
    todaySegments: engine.segments(today),
    tomorrowSegments: engine.segments(tomorrow),
    tomorrowConcerns: dayConcerns(result.info, tomorrow, today),
    doubtfulDays: doubtful,
    activeClosure: engine.closure(now),
    earlyCloseTonight: engine.earlyCloseTime(today),
  };
}

/** "Closes", "Opens northbound", "Switches southbound" */
export function verb(current: LaneStatus, to: LaneStatus): string {
  if (to === 'closed') return 'Closes';
  if (current === 'closed') return `Opens ${TITLES[to].toLowerCase()}`;
  return `Switches ${TITLES[to].toLowerCase()}`;
}

/** "Closes at 9:00 PM" */
export function nextText(s: Snapshot): string {
  if (!s.next) return 'No changes in the next week';
  return `${verb(s.check.scheduled, s.next.to)} at ${Format.when(s.next.at, s.now)}`;
}

/** True when the lanes flip within 15 minutes */
export const changingSoon = (s: Snapshot) => s.next !== null && s.next.at - s.now <= 15 * 60_000;

/** Holidays in the next two weeks */
export function upcomingHolidays(s: Snapshot): [DayKey, string][] {
  const out: [DayKey, string][] = [];
  for (let i = 0; i <= 14; i++) {
    const d = Seattle.addDays(s.today, i);
    const name = holidayName(d);
    if (name) out.push([d, name]);
  }
  return out;
}
