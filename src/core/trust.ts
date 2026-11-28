import * as Format from './format.ts';
import { isOpen, type LaneStatus, type LiveReading, type Published, type ServerStatus, SOURCES, TITLES } from './models.ts';
import { doubtsAt, lastChange, statusAt } from './timeline.ts';

/** A reason the app can't vouch for what it shows. */
export interface Concern {
  title: string;
  detail: string;
  link: string | null;
  /** True while the server is still reading a new page or alert, which usually clears up in minutes */
  checking: boolean;
}

export type Verdict = 'confident' | 'checking' | 'uncertain';

export interface Assessment {
  verdict: Verdict;
  /** What the published timeline says right now, trusted or not */
  scheduled: LaneStatus;
  concerns: Concern[];
}

/** What the badge should show. Never a direction unless confident. */
export const shown = (a: Assessment): LaneStatus | null => (a.verdict === 'confident' ? a.scheduled : null);

/** The server reads WSDOT every 15 minutes, so data older than this means it's stuck */
export const MAX_AGE = 2 * 60 * 60_000;
/** Sensor readings older than this are ignored */
export const LIVE_MAX_AGE = 30 * 60_000;
/** WSDOT's travel times lag a switch by up to this long, so readings this soon after one are ignored */
export const LIVE_LAG = 30 * 60_000;
const CLOCK_SLACK = 5 * 60_000;

const concern = (title: string, detail: string, link: string | null = null, checking = false): Concern => ({
  title,
  detail,
  link,
  checking,
});

// Decides when the app is allowed to show a confident N or S.
// The rule is simple: if anything looks off, say so instead of guessing.
export function assess(status: ServerStatus, now: number): Assessment {
  const p = status.published;
  const scheduled = p ? statusAt(p, now) : 'unknown';
  const concerns = [...dataConcerns(status, now), ...(p ? momentConcerns(p, now) : []), ...liveConcerns(status, now)];
  let verdict: Verdict;
  if (concerns.length === 0 && scheduled !== 'unknown') verdict = 'confident';
  else if (concerns.length > 0 && concerns.every((c) => c.checking)) verdict = 'checking';
  else verdict = 'uncertain';
  return { verdict, scheduled, concerns };
}

/** Problems with the data as a whole */
export function dataConcerns(status: ServerStatus, now: number): Concern[] {
  const out: Concern[] = [];
  const { fetchedAt, published } = status;
  if (!published) {
    out.push(concern("Can't reach the server", "The server hasn't published anything yet.", SOURCES.expressLanes));
    return out;
  }
  if (fetchedAt === null || now - fetchedAt > MAX_AGE) {
    const at = fetchedAt ?? published.publishedAt;
    out.push(
      concern(
        `Data is ${Format.countdown(now, at)} old`,
        `The server last read WSDOT's page at ${Format.when(at, now)}.${status.error ? ` ${status.error}.` : ''}`,
        SOURCES.expressLanes,
      ),
    );
  } else if (fetchedAt - now > CLOCK_SLACK) {
    out.push(
      concern(
        "This device's clock is off",
        "WSDOT's page was read at a time that hasn't happened yet on this device. Check the clock in your settings.",
        SOURCES.expressLanes,
      ),
    );
  }
  if (now >= published.horizon.end || now < published.horizon.start) {
    out.push(concern('No schedule for today', "The server's timeline doesn't cover today.", SOURCES.expressLanes));
  }
  return out;
}

/** The server's doubts about this moment */
export function momentConcerns(p: Published, now: number): Concern[] {
  return doubtsAt(p, now).map((d) => concern(d.title, d.detail, d.link ?? SOURCES.expressLanes, d.checking === true));
}

/** What WSDOT's sensors see, compared with the timeline */
export function liveReadingStatus(r: LiveReading): 'northbound' | 'southbound' | 'none' | 'both' {
  const n = r.northbound !== null && r.northbound > 0;
  const s = r.southbound !== null && r.southbound > 0;
  return n && s ? 'both' : n ? 'northbound' : s ? 'southbound' : 'none';
}

export function liveConcerns(status: ServerStatus, now: number): Concern[] {
  const { live, published } = status;
  if (!live || !published || now - live.at > LIVE_MAX_AGE || live.at - now > CLOCK_SLACK) return [];
  const expected = statusAt(published, live.at);
  if (expected === 'unknown') return [];
  // Right after a switch the sensors still show the old direction
  const changed = lastChange(published, live.at);
  if (changed !== null && live.at - changed < LIVE_LAG) return [];
  const seen = liveReadingStatus(live);
  if (seen === 'both') return [];
  if (seen === 'none') {
    if (!isOpen(expected)) return [];
    return [
      concern(
        'No traffic measured',
        `The lanes should be ${TITLES[expected].toLowerCase()}, but WSDOT's sensors measured no traffic through them at ${Format.clock(live.at)}.`,
        SOURCES.travelMap,
      ),
    ];
  }
  if (seen === expected) return [];
  return [
    concern(
      `WSDOT's sensors show ${TITLES[seen].toLowerCase()} traffic`,
      `The lanes should be ${TITLES[expected].toLowerCase()}, but WSDOT's sensors measured ${TITLES[seen].toLowerCase()} traffic at ${Format.clock(live.at)}.`,
      SOURCES.travelMap,
    ),
  ];
}
