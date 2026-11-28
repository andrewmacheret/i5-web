// What the server publishes and the page draws. Everything here is plain JSON.
// Moments are epoch milliseconds. Days are Seattle calendar days like "2026-11-18".
// The page repo (i5-client) has a copy of this file and of timeline.ts, trust.ts, snapshot.ts,
// seattle.ts and format.ts. Change both together.

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

/** The schedule WSDOT posted as of Nov 2026. Used when the page lists none. */
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

/** A stretch of time with one status. Published segments cover the horizon with no gaps. */
export interface Segment {
  start: number;
  end: number;
  status: LaneStatus;
}

export type SourceKind = 'page' | 'alert' | 'holiday' | 'models';

/** A stretch of time the server can't vouch for, with the reason */
export interface Doubt {
  start: number;
  end: number;
  title: string;
  detail: string;
  link: string | null;
  source: SourceKind;
  /** True while a new page or alert is still being read, which usually clears up within minutes */
  checking?: boolean;
}

export type ChangeKind = 'northbound' | 'southbound' | 'closed' | 'weekday_schedule' | 'weekend_schedule' | 'other' | 'unclear';

export type Certainty = 'exact' | 'approximate' | 'unknown';

/** One notice from the page or an alert, for the page's lists */
export interface Notice {
  title: string;
  /** The page's own words */
  detail: string;
  link: string | null;
  kind: ChangeKind;
  spans: { start: number | null; end: number | null }[];
  startCertainty: Certainty;
  endCertainty: Certainty;
  source: 'page' | 'alert';
}

/** A page version or alert the server has read */
export interface DocumentInfo {
  kind: 'page' | 'alert';
  hash: string;
  /** When the server first saw this version */
  firstSeen: number;
  /** Models whose answers were used, or "reviewed" for an answer a person wrote */
  models: string[];
  status: 'answered' | 'pending' | 'failed';
  link: string | null;
}

/** What the server worked out from WSDOT's page and alerts */
export interface Published {
  publishedAt: number;
  /** Segments cover exactly this range */
  horizon: { start: number; end: number };
  /** The weekly schedule as the page lists it, or null when it lists none */
  schedule: WeeklySchedule | null;
  segments: Segment[];
  doubts: Doubt[];
  notices: Notice[];
  page: DocumentInfo | null;
  alerts: DocumentInfo[];
}

/** WSDOT's travel times through the express lanes, which only exist in the direction they're open */
export interface LiveReading {
  /** When WSDOT measured it */
  at: number;
  /** Minutes from Seattle to Everett through the express lanes, or null when there's no measurement */
  northbound: number | null;
  southbound: number | null;
}

/** GET /status */
export interface ServerStatus {
  published: Published | null;
  /** When the server last read WSDOT's page successfully */
  fetchedAt: number | null;
  /** When the server last tried */
  checkedAt: number | null;
  /** Why the last try failed */
  error: string | null;
  live: LiveReading | null;
}

export const SOURCES = {
  expressLanes: 'https://wsdot.wa.gov/travel/roads-bridges/express-lanes',
  alerts: 'https://wsdot.com/travel/real-time/alerts',
  travelMap: 'https://wsdot.com/Travel/Real-time/Map/',
  wsdotTrafficX: 'https://x.com/wsdot_traffic',
};
