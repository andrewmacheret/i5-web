import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Format from '../core/format.ts';
import { advisoryIsOver, type EarlyClose, rangeIsOver, SOURCES, TITLES, timeLabel } from '../core/models.ts';
import * as Seattle from '../core/seattle.ts';
import { makeSnapshot, type Snapshot, upcomingHolidays, verb } from '../core/snapshot.ts';
import { EMPTY_STATE, type ServerState, toFetchResult } from '../core/state.ts';
import { clockOffset, loadStatus, savedStatus } from './api.ts';
import BadgeMaker from './BadgeMaker.tsx';
import { Callout, Card, Dot, Icon, ScheduleRows, SourceLink, StatusIcon, Timeline } from './parts.tsx';

// How often the page asks the server again. The server reads WSDOT every 15 minutes.
const RELOAD_EVERY = 5 * 60_000;
const TICK_EVERY = 15_000;

const offset = clockOffset();
const clock = () => Date.now() + offset;

/** With ?now=, move the server's times along with the clock so the data doesn't look old */
const shifted = (s: ServerState): ServerState =>
  offset === 0
    ? s
    : {
        ...s,
        fetchedAt: s.fetchedAt === null ? null : s.fetchedAt + offset,
        checkedAt: s.checkedAt === null ? null : s.checkedAt + offset,
      };

export default function App() {
  const [state, setState] = useState<ServerState | null>(savedStatus);
  const [refreshing, setRefreshing] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(clock);
  const lastLoad = useRef(0);

  const reload = useCallback(async () => {
    lastLoad.current = Date.now();
    setRefreshing(true);
    setNow(clock());
    try {
      setState(await loadStatus());
      setLoadError(null);
    } catch (e) {
      setLoadError(`Couldn't reach the server: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRefreshing(false);
      setNow(clock());
    }
  }, []);

  useEffect(() => {
    reload();
    const tick = setInterval(() => setNow(clock()), TICK_EVERY);
    const poll = setInterval(reload, RELOAD_EVERY);
    // Phones pause timers in background tabs, so catch up when the page comes back
    const wake = () => {
      setNow(clock());
      if (document.visibilityState === 'visible' && Date.now() - lastLoad.current > 60_000) reload();
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', reload);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', reload);
    };
  }, [reload]);

  const snap = useMemo(
    () => makeSnapshot(toFetchResult(shifted(state ?? EMPTY_STATE)), now, refreshing),
    [state, now, refreshing],
  );

  return (
    <main className="app">
      <header className="header">
        <div>
          <div className="title-row">
            <a className="home" href="https://andrewmacheret.com/">
              <img src="https://andrewmacheret.com/favicon.svg" alt="andrewmacheret.com" width="20" height="20" />
            </a>
            <span className="slash" aria-hidden="true">/</span>
            <h1>I-5 Express Lanes</h1>
          </div>
          <p>Which way Seattle's I-5 express lanes are open right now.</p>
        </div>
      </header>

      {offset !== 0 && (
        <p className="preview-note">
          Showing {Format.shortDate(now)} at {Format.clock(now)}, not now. <a href="./">Back to now</a>
        </p>
      )}
      <StatusCard snap={snap} />

      <Notices snap={snap} />
      <Timelines snap={snap} />
      <ComingUp snap={snap} />
      <Planned snap={snap} />
      <RegularSchedule snap={snap} />
      <BadgeMaker />
      <Sources snap={snap} />
      <DataStatus snap={snap} state={state} loadError={loadError} refreshing={refreshing} onRefresh={reload} />

      <footer className="footer">
        <a href="https://andrewmacheret.com/">More projects</a>
        <span aria-hidden="true">·</span>
        <a href="https://github.com/andrewmacheret/i5-macos-menubar/releases/latest">Mac app</a>
        <span aria-hidden="true">·</span>
        <a href="https://github.com/andrewmacheret/i5-android/releases/latest">Android app</a>
        <span aria-hidden="true">·</span>
        <a href="https://github.com/andrewmacheret/i5-web">Source</a>
      </footer>
    </main>
  );
}

function StatusCard({ snap }: { snap: Snapshot }) {
  const { check, next, now } = snap;
  const seattleNote = Seattle.differsFromLocal(now) ? ' · Seattle time' : '';
  let title: string;
  let subtitle: string;
  let tone: string;
  if (check.verdict === 'confident') {
    title = TITLES[check.scheduled];
    tone = check.scheduled;
    subtitle = next
      ? `${verb(check.scheduled, next.to)} at ${Format.when(next.at, now)} · ${Format.countdown(next.at, now)}`
      : 'No changes in the next week';
  } else if (check.verdict === 'checking') {
    title = 'Checking…';
    tone = 'unknown';
    subtitle = "Reading WSDOT's latest schedule";
  } else {
    title = "Can't confirm";
    tone = 'warning';
    subtitle = `Posted schedule says ${TITLES[check.scheduled].toLowerCase()}, but don't rely on it`;
  }
  return (
    <section className="stage status-card" aria-labelledby="status-title">
      <div className="status-head" aria-live="polite">
        <StatusIcon snap={snap} height={56} />
        <div>
          <p className="caption">I-5 express lanes{seattleNote}</p>
          <h2 id="status-title" className={`status-title ${tone}`}>
            {title}
          </h2>
          <p className="status-subtitle">{subtitle}</p>
        </div>
      </div>
      {check.verdict === 'uncertain' && (
        <div className="concerns">
          {check.concerns.map((c) => (
            <Callout key={`${c.title}-${c.detail}`} tone="warn" icon="warning" title={c.title} link={c.link}>
              {c.detail}
            </Callout>
          ))}
          <p className="live-sources">
            <strong>Check a live source before you drive:</strong> <a href={SOURCES.travelMap}>Traffic cameras</a> ·{' '}
            <a href={SOURCES.wsdotTrafficX}>@wsdot_traffic</a> · <a href={SOURCES.expressLanes}>WSDOT page</a>
          </p>
        </div>
      )}
    </section>
  );
}

function Notices({ snap }: { snap: Snapshot }) {
  const info = snap.result.info;
  const showEarly = snap.earlyCloseTonight !== null && Seattle.time(snap.now) < snap.earlyCloseTonight;
  const oldNotices = info.advisories.filter((a) => advisoryIsOver(a, snap.today));
  if (!snap.activeClosure && !showEarly && oldNotices.length === 0) return null;
  return (
    <div className="notices">
      {snap.activeClosure && (
        <Callout tone="bad" icon="closed" title={snap.activeClosure.title}>
          Closed until {Format.when(snap.activeClosure.end, snap.now)}.
        </Callout>
      )}
      {showEarly && (
        <Callout tone="warn" icon="moon" title="Closing early tonight">
          The lanes close at {timeLabel(snap.earlyCloseTonight!)} for construction.
        </Callout>
      )}
      {oldNotices.map((a) => (
        <Callout key={a.text} tone="muted" icon="old" title="Old notice still on WSDOT's page" link={a.link}>
          {a.text}
        </Callout>
      ))}
    </div>
  );
}

function Timelines({ snap }: { snap: Snapshot }) {
  const confident = snap.check.verdict === 'confident';
  return (
    <Card title={confident ? 'Schedule' : 'Posted schedule · not confirmed'} className={confident ? '' : 'dimmed'}>
      <Timeline label="Today" segments={snap.todaySegments} now={Seattle.time(snap.now)} />
      <Timeline label="Tomorrow" segments={snap.tomorrowSegments} warning={snap.tomorrowConcerns[0]?.title} />
      <div className="legend">
        <span>
          <span className="swatch southbound" /> Southbound
        </span>
        <span>
          <span className="swatch northbound" /> Northbound
        </span>
        <span>
          <span className="swatch closed" /> Closed
        </span>
      </div>
    </Card>
  );
}

function ComingUp({ snap }: { snap: Snapshot }) {
  const doubtful = (at: number) => snap.doubtfulDays.has(Seattle.day(at));
  return (
    <Card title="Coming up">
      {snap.changes.length === 0 ? (
        <p className="hint">No changes in the next week.</p>
      ) : (
        <ul className="changes">
          {snap.changes.map((c) => (
            <li key={c.at}>
              <Dot status={c.to} />
              <span className="change-to">{TITLES[c.to]}</span>
              {doubtful(c.at) && (
                <span className="doubt" title="This day may not follow the regular schedule">
                  <Icon size={14}>
                    <path d="M12 3 2 21h20L12 3Zm0 6v5m0 3v.5" />
                  </Icon>
                  <span className="visually-hidden">May not follow the regular schedule</span>
                </span>
              )}
              <span className="change-when">{Format.when(c.at, snap.now)}</span>
              <span className="change-in">{Format.countdown(c.at, snap.now)}</span>
            </li>
          ))}
        </ul>
      )}
      {snap.changes.some((c) => doubtful(c.at)) && (
        <p className="hint">⚠ marks days that may not follow the regular schedule.</p>
      )}
    </Card>
  );
}

const earlyLabel = (e: EarlyClose) => `${Format.shortDay(e.day)} at ${e.time === null ? 'unknown time' : timeLabel(e.time)}`;

function Planned({ snap }: { snap: Snapshot }) {
  const info = snap.result.info;
  const closures = snap.engine.upcomingClosures(snap.now);
  const early = snap.engine.upcomingEarlyCloses(snap.now);
  const unclear = info.events.filter((e) => e.closure === null && !(e.days && rangeIsOver(e.days, snap.today)));
  const future = info.advisories.filter((a) => a.days && snap.today < a.days.first);
  const holidays = upcomingHolidays(snap);
  if (!closures.length && !early.length && !unclear.length && !future.length && !holidays.length) return null;
  return (
    <Card title="Planned changes" className="planned">
      {closures.map((c) => (
        <div key={`${c.title}-${c.start}`} className="planned-item">
          <h3>{c.title}</h3>
          <p className="times">
            Closed {Format.shortDate(c.start)} {Format.clock(c.start)} → {Format.shortDate(c.end)} {Format.clock(c.end)}
          </p>
        </div>
      ))}
      {unclear.map((e) => (
        <div key={`${e.title}-${e.days?.first}`} className="planned-item">
          <h3>{e.title}</h3>
          <p className="warn-text">Exact times unclear. The app won't confirm a direction on these days.</p>
          {e.detail && <p className="detail">{e.detail}</p>}
        </div>
      ))}
      {future.map((a) => (
        <div key={a.text} className="planned-item">
          <p>{a.text}</p>
        </div>
      ))}
      {early.length > 0 && (
        <div className="planned-item">
          <h3>Closing early</h3>
          <p className="detail">{early.map(earlyLabel).join('  ·  ')}</p>
        </div>
      )}
      {holidays.length > 0 && (
        <div className="planned-item">
          <h3>Holidays</h3>
          <p className="detail">{holidays.map(([d, name]) => `${name} (${Format.shortDay(d)})`).join('  ·  ')}</p>
          <p className="hint">WSDOT doesn't post holiday hours, so the app won't confirm a direction on these days.</p>
        </div>
      )}
    </Card>
  );
}

function RegularSchedule({ snap }: { snap: Snapshot }) {
  const { schedule } = snap.result.info;
  return (
    <Card title="Regular schedule">
      <ScheduleRows label="Mon–Fri" windows={schedule.weekday} />
      <ScheduleRows label="Sat–Sun" windows={schedule.weekend} />
    </Card>
  );
}

function Sources({ snap }: { snap: Snapshot }) {
  const info = snap.result.info;
  const seen = new Set<string>([SOURCES.reviveI5, SOURCES.expressLanes]);
  const links = [...info.events, ...info.advisories]
    .map((x) => x.link)
    .filter((l): l is string => l !== null && !seen.has(l) && Boolean(seen.add(l)));
  return (
    <Card title="Sources">
      <ul className="sources">
        <SourceLink title="WSDOT express lanes schedule" subtitle="Where this data comes from" href={SOURCES.expressLanes} />
        {links.map((l) => (
          <SourceLink
            key={l}
            title={l.includes('govdelivery') ? 'WSDOT bulletin' : 'Construction project page'}
            subtitle={new URL(l).host}
            href={l}
          />
        ))}
        <SourceLink title="Revive I-5" subtitle="Ship Canal Bridge work" href={SOURCES.reviveI5} />
        <SourceLink title="WSDOT real-time travel map" subtitle="Live traffic, alerts and cameras" href={SOURCES.travelMap} />
        <SourceLink title="@wsdot_traffic" subtitle="Unplanned closures get posted here first" href={SOURCES.wsdotTrafficX} />
      </ul>
      <p className="hint">
        WSDOT doesn't publish a live feed for the express lanes, so this works out the status from WSDOT's posted
        schedule, early closures and planned closures. It only shows a direction when WSDOT's page was read in the last 2
        hours, the page made sense, and nothing on it hints that today is different. Otherwise it shows ⚠. It can't know
        about closures WSDOT hasn't posted yet. Not affiliated with WSDOT. Always follow posted signs.
      </p>
    </Card>
  );
}

function DataStatus({
  snap,
  state,
  loadError,
  refreshing,
  onRefresh,
}: {
  snap: Snapshot;
  state: ServerState | null;
  loadError: string | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const source = snap.result.source;
  let text: string;
  let warn = false;
  if (source.kind === 'live') text = `Checked WSDOT at ${Format.when(source.at, snap.now)}`;
  else if (source.kind === 'cached') {
    text = `WSDOT didn't answer at ${Format.clock(state?.checkedAt ?? snap.now)}. Using the copy from ${Format.when(source.at, snap.now)}.`;
    warn = true;
  } else {
    text = state ? 'No copy of WSDOT\'s page yet. Showing the built-in schedule.' : 'Loading…';
    warn = state !== null;
  }
  return (
    <div className="data-status">
      <div>
        <p className={warn ? 'warn-text' : ''}>{text}</p>
        {loadError && <p className="error-text">{loadError}</p>}
      </div>
      <button
        type="button"
        className="control round refresh"
        onClick={onRefresh}
        disabled={refreshing}
        aria-label="Refresh"
        title="Refresh"
      >
        <span className={refreshing ? 'spinning' : ''}>
          <Icon size={18}>
            <path d="M21 12a9 9 0 1 1-3-6.7L21 8m0-5v5h-5" />
          </Icon>
        </span>
      </button>
    </div>
  );
}
