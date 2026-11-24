import { Engine } from './engine.ts';
import * as Format from './format.ts';
import { holidayName } from './holidays.ts';
import {
  type DayKey,
  type DayRange,
  earlyCloseOn,
  type ExpressLanesInfo,
  type FetchResult,
  fetchedAt,
  isOpen,
  type LaneStatus,
  rangeContains,
  SOURCES,
  type WeeklySchedule,
} from './models.ts';
import * as Seattle from './seattle.ts';

/** A reason the app can't vouch for what it shows. */
export interface Concern {
  title: string;
  detail: string;
  link: string | null;
  /** True for "data is old" problems that a refresh in progress may fix */
  fixedByRefresh: boolean;
}

export type Verdict = 'confident' | 'checking' | 'uncertain';

export interface Assessment {
  verdict: Verdict;
  /** What the posted schedule says right now, trusted or not */
  scheduled: LaneStatus;
  concerns: Concern[];
}

/** What the badge should show. Never a direction unless confident. */
export const shown = (a: Assessment): LaneStatus | null => (a.verdict === 'confident' ? a.scheduled : null);

/** Data older than this is treated as stale */
export const MAX_AGE = 2 * 60 * 60 * 1000;

const CLOCK_SLACK = 5 * 60 * 1000;

const concern = (title: string, detail: string, link: string | null = null, fixedByRefresh = false): Concern => ({
  title,
  detail,
  link,
  fixedByRefresh,
});

// Decides when the app is allowed to show a confident N or S.
// The rule is simple: if anything looks off, say so instead of guessing.

/** `refreshing` means a download is in flight, so old data shows as "checking" for a moment. */
export function assess(result: FetchResult, now: number, refreshing = false): Assessment {
  const today = Seattle.day(now);
  const concerns = [...dataConcerns(result, now), ...dayConcerns(result.info, today, today)];
  let verdict: Verdict;
  if (concerns.length === 0) verdict = 'confident';
  else if (refreshing && concerns.every((c) => c.fixedByRefresh)) verdict = 'checking';
  else verdict = 'uncertain';
  return { verdict, scheduled: new Engine(result.info).status(now), concerns };
}

/** The moment the data stops being fresh */
export function staleAt(result: FetchResult): number | null {
  const at = fetchedAt(result.source);
  return at === null ? null : at + MAX_AGE;
}

/** Problems with the data as a whole. */
export function dataConcerns(result: FetchResult, now: number): Concern[] {
  const out: Concern[] = [];
  const at = fetchedAt(result.source);
  if (at === null) {
    out.push(
      concern(
        "Can't reach WSDOT",
        'Only the schedule built into the app is available, and it may be out of date.',
        SOURCES.expressLanes,
        !result.pageChanged,
      ),
    );
  } else if (now - at > MAX_AGE) {
    out.push(
      concern(
        `Data is ${Format.countdown(now, at)} old`,
        `Last read WSDOT's page at ${Format.when(at, now)}. The app keeps retrying.`,
        SOURCES.expressLanes,
        true,
      ),
    );
  } else if (at - now > CLOCK_SLACK) {
    // This device's clock is behind, so the data's age is unknown
    out.push(
      concern(
        "This device's clock is off",
        "WSDOT's page was read at a time that hasn't happened yet on this device. Check the clock in your settings.",
        SOURCES.expressLanes,
        true,
      ),
    );
  }
  if (result.pageChanged) {
    out.push(
      concern(
        "WSDOT's page changed",
        "The app couldn't read the new page, so it's using an older saved copy.",
        SOURCES.expressLanes,
      ),
    );
  }
  for (const w of result.info.warnings) {
    out.push(concern("Part of WSDOT's page couldn't be read", w, SOURCES.expressLanes));
  }
  const problem = scheduleProblem(result.info.schedule);
  if (problem) out.push(concern('Schedule looks wrong', problem, SOURCES.expressLanes));
  return out;
}

/** Things that might make one day differ from the regular schedule. */
export function dayConcerns(info: ExpressLanesInfo, day: DayKey, today: DayKey): Concern[] {
  const out: Concern[] = [];
  const holiday = holidayName(day);
  if (holiday) {
    out.push(
      concern(`${holiday} may run a holiday schedule`, "WSDOT doesn't post holiday schedules on its express lanes page."),
    );
  }
  for (const a of info.advisories) {
    if (applies(a.days, day, today)) out.push(concern('WSDOT posted a notice', a.text, a.link ?? SOURCES.expressLanes));
  }
  for (const e of info.events) {
    if (e.closure === null && applies(e.days, day, today)) {
      out.push(
        concern(e.title, e.detail || "The app couldn't tell exactly when this happens.", e.link ?? SOURCES.expressLanes),
      );
    }
  }
  const early = earlyCloseOn(info, day);
  if (early && early.time === null) {
    out.push(
      concern(
        'Closing early, time unknown',
        "WSDOT lists this as an early closure day but the app couldn't read the time.",
        SOURCES.expressLanes,
      ),
    );
  }
  return out;
}

/** Undated notices count for today only, since they're on the page right now. */
const applies = (days: DayRange | null, day: DayKey, today: DayKey) => (days ? rangeContains(days, day) : day === today);

export function scheduleProblem(s: WeeklySchedule): string | null {
  for (const [name, list] of [
    ['weekday', s.weekday],
    ['weekend', s.weekend],
  ] as const) {
    if (list.length === 0) return `No ${name} hours found.`;
    const sorted = [...list].sort((a, b) => a.start - b.start);
    for (let i = 0; i < sorted.length; i++) {
      const w = sorted[i];
      if (w.start >= w.end) return `A ${name} time range ends before it starts.`;
      if (i > 0 && sorted[i - 1].end > w.start) return `Two ${name} time ranges overlap.`;
      if (!isOpen(w.status)) return `A ${name} time range has no direction.`;
    }
  }
  return null;
}
