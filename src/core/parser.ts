import { blocks as readBlocks } from './html.ts';
import {
  type Advisory,
  BUILT_IN_SCHEDULE,
  builtInInfo,
  type Closure,
  type DayKey,
  type DayRange,
  END_OF_DAY,
  type EarlyClose,
  type ExpressLanesInfo,
  hm,
  type LaneStatus,
  type LaneWindow,
  MIDNIGHT,
  rangeContains,
  type SpecialEvent,
  type TimeOfDay,
} from './models.ts';
import * as Seattle from './seattle.ts';

/** Reads the WSDOT express lanes page into an `ExpressLanesInfo`. */
export function parse(html: string, now: number = Date.now()): ExpressLanesInfo {
  const weekday: LaneWindow[] = [];
  const weekend: LaneWindow[] = [];
  const advisories: Advisory[] = [];
  const earlyCloses: EarlyClose[] = [];
  let earlyDefault: TimeOfDay | null = null;
  const events: SpecialEvent[] = [];
  const warnings: string[] = [];

  // Only read the express lanes part of the page, not the site nav and footer
  const all = readBlocks(html);
  const start = all.findIndex((b) => b.kind === 'h2' && b.text.toLowerCase().includes('express lanes schedule'));
  if (start < 0) return builtInInfo(["Couldn't find the schedule section on WSDOT's page"]);
  const endOffset = all
    .slice(start + 1)
    .findIndex((b) => b.kind === 'h2' && b.text.toLowerCase().includes('map'));
  const blocks = all.slice(start, endOffset < 0 ? all.length : start + 1 + endOffset);

  let section: 'schedule' | 'special' | 'unknown' = 'schedule';
  let h3: string | null = null;
  let pending: SpecialEvent | null = null;

  const flushEvent = () => {
    const e = pending;
    if (!e) return;
    pending = null;
    const text = `${e.title} ${e.detail}`;
    const found = closures(e, now);
    if (found.length === 0) {
      events.push({ ...e, days: range(text, now) });
      return;
    }
    const spans: DayRange[] = found.map((c) => ({ first: Seattle.day(c.start), last: Seattle.day(c.end) }));
    found.forEach((c, i) => events.push({ ...e, closure: c, days: spans[i] }));
    // A date the closures don't cover may be another closure the app couldn't read
    const loose = Dates.all(text, now).filter((d) => !spans.some((s) => rangeContains(s, d)));
    if (loose.length) events.push({ ...e, days: { first: min(loose), last: max(loose) } });
  };

  for (const b of blocks) {
    const lower = b.text.toLowerCase();
    if (b.kind === 'h2') {
      flushEvent();
      h3 = null;
      if (lower.includes('express lanes schedule')) section = 'schedule';
      else if (lower.includes('special')) section = 'special';
      else {
        section = 'unknown';
        warnings.push(`New section on WSDOT's page: ${b.text}`);
      }
    } else if (b.kind === 'h3') {
      flushEvent();
      h3 = lower;
      if (section === 'schedule' && !isWeekdayHeading(lower) && !isWeekendHeading(lower)) {
        warnings.push(`New schedule section on WSDOT's page: ${b.text}`);
      }
      if (section === 'special' && !lower.includes('closing early')) {
        pending = { title: b.text, detail: '', link: null, days: null, closure: null };
      }
    } else if (section === 'schedule') {
      if (b.kind === 'p') {
        // Any note in the schedule area could change today's plan
        advisories.push({ text: b.text, link: absolute(b.href), days: range(b.text, now) });
        continue;
      }
      if (lower.startsWith('closed')) continue;
      const w = window(b.text);
      if (h3 === null || w === null) warnings.push(`Couldn't read schedule line: ${b.text}`);
      else if (isWeekendHeading(h3)) weekend.push(w);
      else if (isWeekdayHeading(h3)) weekday.push(w);
    } else if (section === 'special') {
      if (h3?.includes('closing early')) {
        if (b.kind === 'p') {
          earlyDefault = Times.firstAfter('close at', b.text) ?? earlyDefault;
        } else {
          const days = Dates.all(b.text, now);
          if (days.length === 0) warnings.push(`Couldn't read early closure date: ${b.text}`);
          // A date can carry its own time, like "Monday, Nov. 30 at 8 p.m."
          const own = Times.explicit(b.text);
          for (const day of days) earlyCloses.push({ day, time: own ?? earlyDefault });
        }
      } else if (pending) {
        pending.detail = pending.detail ? `${pending.detail}\n${b.text}` : b.text;
        pending.link ??= absolute(b.href);
      } else {
        advisories.push({ text: b.text, link: absolute(b.href), days: range(b.text, now) });
      }
    }
  }
  flushEvent();

  const fromPage = weekday.length > 0 && weekend.length > 0;
  if (!fromPage) warnings.push("Couldn't read the weekday and weekend schedule on WSDOT's page");
  return {
    schedule: fromPage ? { weekday, weekend } : BUILT_IN_SCHEDULE,
    scheduleFromPage: fromPage,
    earlyCloses: earlyCloses.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)),
    events,
    advisories,
    warnings,
  };
}

const min = (days: DayKey[]) => days.reduce((a, b) => (b < a ? b : a));
const max = (days: DayKey[]) => days.reduce((a, b) => (b > a ? b : a));

const isWeekdayHeading = (s: string) => (s.includes('monday') && s.includes('friday')) || s.includes('weekday');

const isWeekendHeading = (s: string) => (s.includes('saturday') && s.includes('sunday')) || s.includes('weekend');

/** The span of dates a notice talks about. Open ended if it says "until further notice". */
export function range(text: string, now: number): DayRange | null {
  const days = Dates.all(text, now);
  if (days.length === 0) return null;
  const first = min(days);
  const last = max(days);
  const untilNotice = /further notice|indefinite|until repairs|until it is safe/i.test(text);
  // "As of Nov. 16, the lanes are closed" has a start but no end
  const startsOnly = first === last && /\b(as of|beginning|starting|effective|since)\b/i.test(text);
  return { first, last: untilNotice || startsOnly ? null : last };
}

/** "Southbound - 5 a.m. to 11 a.m." or "Northbound - 1:45 to 11 p.m." */
export function window(text: string): LaneWindow | null {
  const lower = text.toLowerCase();
  let status: LaneStatus;
  if (lower.startsWith('southbound')) status = 'southbound';
  else if (lower.startsWith('northbound')) status = 'northbound';
  else return null;

  if (lower.includes('24 hours')) return { status, start: MIDNIGHT, end: END_OF_DAY };

  const sep = lower.search(/[-–—:]/);
  if (sep < 0) return null;
  const parts = lower.slice(sep + 1).split(' to ');
  if (parts.length < 2) return null;
  const end = Times.parse(parts[1]);
  if (!end) return null;

  // Times like "1:45 to 11 p.m." borrow the am/pm from the end time
  let start = Times.parse(parts[0], end.pm);
  if (!start) return null;
  if (start.time >= end.time && end.pm && !start.explicit) {
    start = Times.parse(parts[0], false) ?? start;
  }
  return { status, start: start.time, end: end.time === MIDNIGHT ? END_OF_DAY : end.time };
}

const TIME = String.raw`(\d{1,2}(?::\d{2})?\s*[ap]\.?\s?m\.?|noon|midnight)`;
const WEEKDAY = String.raw`(?:[A-Za-z]+day,?\s+)?`;
const DATE = String.raw`([A-Za-z]{3,9}\.?\s+\d{1,2})`;
const SEP = String.raw`\s+(?:to|through|until|-|–)\s+`;
// "11 p.m. Friday, Dec. 4 to 4 a.m. Monday, Dec. 7"
const TIME_FIRST = new RegExp(String.raw`${TIME}\s+${WEEKDAY}${DATE}${SEP}${TIME}\s+${WEEKDAY}${DATE}`, 'gi');
// "Friday, Dec. 4 at 11 p.m. to Monday, Dec. 7 at 4 a.m."
const DATE_FIRST = new RegExp(String.raw`${WEEKDAY}${DATE},?\s+at\s+${TIME}${SEP}${WEEKDAY}${DATE},?\s+at\s+${TIME}`, 'gi');

/** Every "11 p.m. Friday, Dec. 4 to 4 a.m. Monday, Dec. 7" style range in an event, like two weekends in one notice. */
export function closures(event: SpecialEvent, now: number): Closure[] {
  // Only trust headings that say closure, so lane reductions don't count
  if (!event.title.toLowerCase().includes('clos')) return [];
  const found: Closure[] = [];
  for (const g of event.detail.matchAll(TIME_FIRST)) {
    const c = make(event.title, g[2], g[1], g[4], g[3], now);
    if (c) found.push(c);
  }
  for (const g of event.detail.matchAll(DATE_FIRST)) {
    const c = make(event.title, g[1], g[2], g[3], g[4], now);
    if (c) found.push(c);
  }
  // No exact times means an empty list. Don't guess, Trust flags those days instead.
  const unique = found.filter(
    (c, i) => found.findIndex((o) => o.start === c.start && o.end === c.end && o.title === c.title) === i,
  );
  return unique.sort((a, b) => a.start - b.start);
}

function make(title: string, d1: string, t1: string, d2: string, t2: string, now: number): Closure | null {
  const day1 = Dates.all(d1, now)[0];
  let day2 = Dates.all(d2, now)[0];
  const time1 = Times.parse(t1)?.time;
  const time2 = Times.parse(t2)?.time;
  if (!day1 || !day2 || time1 === undefined || time2 === undefined) return null;
  if (day2 < day1) {
    const { year, month, day } = Seattle.splitDay(day2);
    day2 = Seattle.validDay(year + 1, month, day) ?? day2;
  }
  return { title, start: Seattle.instant(day1, time1), end: Seattle.instant(day2, time2) };
}

export function absolute(href: string | null): string | null {
  if (!href) return null;
  if (href.startsWith('http')) return href;
  if (href.startsWith('/')) return `https://wsdot.wa.gov${href}`;
  return null;
}

interface ParsedTime {
  time: TimeOfDay;
  pm: boolean;
  /** False when am/pm was guessed */
  explicit: boolean;
}

export const Times = {
  parse(text: string, defaultPM: boolean | null = null): ParsedTime | null {
    const lower = text.toLowerCase();
    if (lower.includes('noon')) return { time: hm(12), pm: true, explicit: true };
    if (lower.includes('midnight')) return { time: MIDNIGHT, pm: false, explicit: true };
    const g = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?/);
    if (!g) return null;
    let hour = Number(g[1]);
    if (hour > 12) return null;
    const minute = g[2] ? Number(g[2]) : 0;
    if (minute > 59) return null;
    const marker = g[3] ?? '';
    const explicit = marker !== '';
    const pm = explicit ? marker.startsWith('p') : (defaultPM ?? false);
    if (hour === 12) hour = 0;
    if (pm) hour += 12;
    return { time: hm(hour, minute), pm, explicit };
  },

  /** Only times that say a.m., p.m., noon or midnight, so "Nov. 30" isn't read as 30 o'clock */
  explicit(text: string): TimeOfDay | null {
    const g = text.match(/(\d{1,2}(?::\d{2})?\s*[ap]\.?\s?m\.?|\bnoon\b|\bmidnight\b)/i);
    return g ? (Times.parse(g[1])?.time ?? null) : null;
  },

  firstAfter(phrase: string, text: string): TimeOfDay | null {
    const i = text.toLowerCase().indexOf(phrase.toLowerCase());
    return i < 0 ? null : (Times.parse(text.slice(i + phrase.length))?.time ?? null);
  },
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// "Dec. 4-7" also counts the 7, but "Nov. 16 - 4 p.m." doesn't count the 4
const DATE_PATTERN = new RegExp(
  String.raw`\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})\b` +
    String.raw`(?:\s*[-–]\s*(\d{1,2})\b(?!\s*(?::|[ap]\.?\s?m\b|\d)))?`,
  'gi',
);

export const Dates = {
  /** Finds dates like "Nov. 16" or "December 4" and picks the year closest to `now`. */
  all(text: string, now: number): DayKey[] {
    const today = Seattle.day(now);
    const { year } = Seattle.splitDay(today);
    const date = (month: number, d: string | undefined): DayKey | null => {
      if (!d) return null;
      const candidates = [year - 1, year, year + 1]
        .map((y) => Seattle.validDay(y, month, Number(d)))
        .filter((k): k is DayKey => k !== null);
      if (!candidates.length) return null;
      return candidates.reduce((a, b) =>
        Math.abs(Seattle.daysBetween(today, b)) < Math.abs(Seattle.daysBetween(today, a)) ? b : a,
      );
    };
    const out: DayKey[] = [];
    for (const g of text.matchAll(DATE_PATTERN)) {
      const month = MONTHS.indexOf(g[1].toLowerCase().slice(0, 3)) + 1;
      if (month === 0) continue;
      const first = date(month, g[2]);
      if (!first) continue;
      out.push(first);
      const last = date(month, g[3]);
      if (last && first < last) out.push(last);
    }
    return out;
  },
};
