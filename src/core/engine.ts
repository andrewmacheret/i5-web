import {
  type Closure,
  closuresOf,
  type DayKey,
  earlyCloseOn,
  END_OF_DAY,
  type EarlyClose,
  type ExpressLanesInfo,
  type LaneStatus,
  type LaneWindow,
  MIDNIGHT,
  type TimeOfDay,
} from './models.ts';
import * as Seattle from './seattle.ts';

export interface Change {
  at: number;
  to: LaneStatus;
}

export interface Segment {
  start: TimeOfDay;
  end: TimeOfDay;
  status: LaneStatus;
}

const MINUTE = 60_000;

/** Works out the lane status at any moment from the schedule and its exceptions. */
export class Engine {
  readonly info: ExpressLanesInfo;
  private readonly closures: Closure[];
  private readonly windowCache = new Map<DayKey, LaneWindow[]>();

  constructor(info: ExpressLanesInfo) {
    this.info = info;
    this.closures = closuresOf(info);
  }

  status(at: number): LaneStatus {
    if (this.closure(at)) return 'closed';
    const t = Seattle.time(at);
    return this.windows(Seattle.day(at)).find((w) => w.start <= t && t < w.end)?.status ?? 'closed';
  }

  closure(at: number): Closure | null {
    return this.closures.find((c) => c.start <= at && at < c.end) ?? null;
  }

  /** The early closing time for a day, if it has a known one */
  earlyCloseTime(day: DayKey): TimeOfDay | null {
    const t = earlyCloseOn(this.info, day)?.time;
    if (t === undefined || t === null) return null;
    return t === MIDNIGHT ? END_OF_DAY : t;
  }

  windows(day: DayKey): LaneWindow[] {
    let list = this.windowCache.get(day);
    if (!list) {
      list = Seattle.isWeekend(day) ? this.info.schedule.weekend : this.info.schedule.weekday;
      const cut = this.earlyCloseTime(day);
      if (cut !== null) {
        list = list.filter((w) => w.start < cut).map((w) => ({ ...w, end: Math.min(w.end, cut) }));
      }
      this.windowCache.set(day, list);
    }
    return list;
  }

  /** The next few times the status flips, looking up to `days` ahead. */
  upcomingChanges(from: number, limit = 5, days = 8): Change[] {
    const start = Math.floor(from / MINUTE) * MINUTE;
    let current = this.status(from);
    const out: Change[] = [];
    for (let minute = 1; minute <= days * 24 * 60; minute++) {
      const at = start + minute * MINUTE;
      const s = this.status(at);
      if (s !== current) {
        out.push({ at, to: s });
        current = s;
        if (out.length === limit) break;
      }
    }
    return out;
  }

  /**
   * Colored runs across one Seattle day, for the timeline bar. Steps through real
   * clock time and places each step by its wall time, so daylight saving days line up.
   */
  segments(day: DayKey): Segment[] {
    const end = Seattle.startOfDay(Seattle.addDays(day, 1));
    const out: Segment[] = [];
    for (let at = Seattle.startOfDay(day); at < end; at += 5 * MINUTE) {
      const s = this.status(at);
      const t = Seattle.time(at);
      const stepEnd = Math.min(t + 5, END_OF_DAY);
      const last = out.at(-1);
      if (last && last.status === s && last.end <= t) last.end = stepEnd;
      // Fall back repeats an hour. Skip the repeat.
      else if (last && last.end > t) continue;
      else out.push({ start: t, end: stepEnd, status: s });
    }
    return out;
  }

  upcomingEarlyCloses(from: number, limit = 6): EarlyClose[] {
    const today = Seattle.day(from);
    const time = Seattle.time(from);
    return this.info.earlyCloses
      .filter((e) => e.day > today || (e.day === today && (e.time === null || time < e.time)))
      .slice(0, limit);
  }

  upcomingClosures(from: number): Closure[] {
    return this.closures.filter((c) => c.end > from).sort((a, b) => a.start - b.start);
  }
}
