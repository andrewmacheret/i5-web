// Everything here is plain JSON, so the Lambda can send it to the page as is.
// Moments are epoch milliseconds. Days are Seattle calendar days like "2026-11-18".

export type LaneStatus = 'northbound' | 'southbound' | 'closed' | 'unknown';

export const TITLES: Record<LaneStatus, string> = {
  northbound: 'Northbound',
  southbound: 'Southbound',
  closed: 'Closed',
  unknown: 'Unknown',
};

export const isOpen = (s: LaneStatus) => s === 'northbound' || s === 'southbound';

/** Minutes since midnight, 0 to 1440 */
export type TimeOfDay = number;

export const MIDNIGHT: TimeOfDay = 0;
export const END_OF_DAY: TimeOfDay = 24 * 60;

export const hm = (hour: number, minute = 0): TimeOfDay => hour * 60 + minute;

/** "5 AM", "11:15 AM", "Midnight" */
export function timeLabel(t: TimeOfDay): string {
  const m = t % (24 * 60);
  if (m === 0) return 'Midnight';
  if (m === 12 * 60) return 'Noon';
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? 'AM' : 'PM';
  return mm === 0 ? `${h12} ${ampm}` : `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
}

/** An open window. Any time not covered by a window is closed. */
export interface LaneWindow {
  status: LaneStatus;
  start: TimeOfDay;
  end: TimeOfDay;
}

export interface WeeklySchedule {
  weekday: LaneWindow[];
  weekend: LaneWindow[];
}

/** The schedule WSDOT posted as of Nov 2026. Used when the page can't be read. */
export const BUILT_IN_SCHEDULE: WeeklySchedule = {
  weekday: [
    { status: 'southbound', start: hm(5), end: hm(11) },
    { status: 'northbound', start: hm(11, 15), end: hm(23) },
  ],
  weekend: [
    { status: 'southbound', start: hm(8), end: hm(13, 30) },
    { status: 'northbound', start: hm(13, 45), end: hm(23) },
  ],
};

/** A calendar day in Seattle, "YYYY-MM-DD". Sorts and compares as a string. */
export type DayKey = string;

/** A full closure over a date range, like a weekend-long closure. */
export interface Closure {
  title: string;
  start: number;
  end: number;
}

/** The days something applies to. `last: null` means it has no end date. */
export interface DayRange {
  first: DayKey;
  last: DayKey | null;
}

export const rangeContains = (r: DayRange, day: DayKey) => r.first <= day && (r.last === null || day <= r.last);

export const rangeIsOver = (r: DayRange, today: DayKey) => r.last !== null && r.last < today;

export interface SpecialEvent {
  title: string;
  detail: string;
  link: string | null;
  /** Days the event mentions. Null when it has no dates we could read. */
  days: DayRange | null;
  /** Set when we could read exact start and end times for a full closure. */
  closure: Closure | null;
}

export interface Advisory {
  text: string;
  link: string | null;
  /** Days the notice mentions. Null when it has no dates we could read. */
  days: DayRange | null;
}

/** True when the notice only talks about days that are already over. */
export const advisoryIsOver = (a: Advisory, today: DayKey) => (a.days ? rangeIsOver(a.days, today) : false);

export interface EarlyClose {
  day: DayKey;
  /** Null when the page didn't say what time */
  time: TimeOfDay | null;
}

export interface ExpressLanesInfo {
  schedule: WeeklySchedule;
  /** False when the page's schedule couldn't be read and the built-in one is used. */
  scheduleFromPage: boolean;
  earlyCloses: EarlyClose[];
  events: SpecialEvent[];
  advisories: Advisory[];
  /** Bits of the page that looked important but couldn't be read */
  warnings: string[];
}

export function builtInInfo(warnings: string[] = []): ExpressLanesInfo {
  return {
    schedule: BUILT_IN_SCHEDULE,
    scheduleFromPage: false,
    earlyCloses: [],
    events: [],
    advisories: [],
    warnings,
  };
}

export const closuresOf = (info: ExpressLanesInfo): Closure[] =>
  info.events.flatMap((e) => (e.closure ? [e.closure] : []));

export const earlyCloseOn = (info: ExpressLanesInfo, day: DayKey) => info.earlyCloses.find((e) => e.day === day);

export type DataSource =
  /** Read from WSDOT on the last try, at this time */
  | { kind: 'live'; at: number }
  /** The last try failed, so this is the last good copy, read at this time */
  | { kind: 'cached'; at: number }
  /** Nothing good saved, using the schedule baked into the app */
  | { kind: 'builtIn' };

export interface FetchResult {
  info: ExpressLanesInfo;
  source: DataSource;
  error: string | null;
  /** WSDOT's page loaded but couldn't be read */
  pageChanged: boolean;
}

export const fetchedAt = (s: DataSource) => (s.kind === 'builtIn' ? null : s.at);

export const SOURCES = {
  expressLanes: 'https://wsdot.wa.gov/travel/roads-bridges/express-lanes',
  reviveI5: 'https://wsdot.wa.gov/construction-planning/search-projects/revive-i-5-preserving-vital-freeway',
  travelMap: 'https://wsdot.com/travel/real-time/map/',
  wsdotTrafficX: 'https://x.com/wsdot_traffic',
};
