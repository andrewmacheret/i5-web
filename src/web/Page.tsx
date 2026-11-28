import * as Format from '../core/format.ts';
import { BUILT_IN_SCHEDULE, type Notice, type ServerStatus, SOURCES, TITLES, type TripTimes } from '../core/models.ts';
import * as Seattle from '../core/seattle.ts';
import { doubtsBetween } from '../core/timeline.ts';
import { type Snapshot, verb } from '../core/snapshot.ts';
import { LIVE_MAX_AGE } from '../core/trust.ts';
import BadgeMaker from './BadgeMaker.tsx';
import Cameras from './Cameras.tsx';
import { Callout, Card, Dot, Icon, ScheduleRows, SourceLink, StatusIcon, Timeline } from './parts.tsx';

// Everything on the page, drawn from the server's timeline. No data loading here, so tests can
// render it with any status.

const DAY = 24 * 60 * 60_000;
/** "Planned changes" lists notices with a time starting within this many days */
const PLANNED_DAYS = 14;
/** Times listed per notice before the rest fold behind "…" */
const MAX_TIMES = 20;

export interface PageProps {
  snap: Snapshot;
  /** The status the server sent, or null before the first answer */
  loaded: ServerStatus | null;
  loadError: string | null;
  refreshing: boolean;
  /** Set when ?now= shows another moment */
  preview: boolean;
  onRefresh: () => void;
  apiUrl: string;
  pageUrl: string;
}

export function Page({ snap, loaded, loadError, refreshing, preview, onRefresh, apiUrl, pageUrl }: PageProps) {
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

      {preview && (
        <p className="preview-note">
          Showing {Format.shortDate(snap.now)} at {Format.clock(snap.now)}, not now. <a href="./">Back to now</a>
        </p>
      )}
      <StatusCard snap={snap} loading={loaded === null} />

      <Notices snap={snap} />
      <Timelines snap={snap} />
      <TravelTimes snap={snap} />
      <Cameras cameras={snap.status.cameras ?? []} now={snap.now} />
      <ComingUp snap={snap} />
      <Planned snap={snap} />
      <RegularSchedule snap={snap} />
      <BadgeMaker apiUrl={apiUrl} pageUrl={pageUrl} />
      <Sources snap={snap} />
      <DataStatus snap={snap} loaded={loaded} loadError={loadError} refreshing={refreshing} onRefresh={onRefresh} />

      <footer className="footer">
        <a href="https://andrewmacheret.com/">More projects</a>
        <span aria-hidden="true">·</span>
        <a href="https://github.com/andrewmacheret/i5-macos-menubar/releases/latest">Mac app</a>
        <span aria-hidden="true">·</span>
        <a href="https://github.com/andrewmacheret/i5-android/releases/latest">Android app</a>
        <span aria-hidden="true">·</span>
        <a href="https://github.com/andrewmacheret/i5-client">Source</a>
      </footer>
    </main>
  );
}

function StatusCard({ snap, loading }: { snap: Snapshot; loading: boolean }) {
  const { check, next, now } = snap;
  const seattleNote = Seattle.differsFromLocal(now) ? ' · Seattle time' : '';
  let title: string;
  let subtitle: string;
  let tone: string;
  if (loading) {
    title = 'Loading…';
    tone = 'unknown';
    subtitle = 'Asking the server';
  } else if (check.verdict === 'confident') {
    title = TITLES[check.scheduled];
    tone = check.scheduled;
    if (!next) subtitle = 'No changes coming up';
    else if (next.to === 'unknown') subtitle = `No changes before ${Format.shortDate(next.at)}`;
    else subtitle = `${verb(check.scheduled, next.to)} at ${Format.when(next.at, now)} · ${Format.countdown(next.at, now)}`;
  } else if (check.verdict === 'checking') {
    title = 'Checking…';
    tone = 'unknown';
    subtitle = "Reading WSDOT's latest update";
  } else {
    title = "Can't confirm";
    tone = 'warning';
    subtitle =
      check.scheduled === 'unknown'
        ? "Don't rely on this page right now"
        : `Expected ${TITLES[check.scheduled].toLowerCase()}, but don't rely on it`;
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
      {!loading && check.verdict === 'uncertain' && (
        <div className="concerns">
          {check.concerns.map((c) => (
            <Callout key={`${c.title}-${c.detail}`} tone="warn" icon="warning" title={c.title} link={c.link}>
              {c.detail}
            </Callout>
          ))}
          <p className="live-sources">
            <strong>Check a live source before you drive:</strong>{' '}
            <a href={SOURCES.wsdotTraffic}>WSDOT Traffic on Bluesky</a> · <a href={SOURCES.travelMap}>Traffic cameras</a> ·{' '}
            <a href={SOURCES.expressLanes}>WSDOT page</a>
          </p>
        </div>
      )}
    </section>
  );
}

const TONES: Record<Notice['kind'], 'bad' | 'warn' | 'muted'> = {
  closed: 'bad',
  northbound: 'warn',
  southbound: 'warn',
  weekday_schedule: 'warn',
  weekend_schedule: 'warn',
  unclear: 'warn',
  other: 'muted',
};

const ICONS: Record<Notice['kind'], 'closed' | 'warning' | 'moon' | 'old'> = {
  closed: 'closed',
  northbound: 'warning',
  southbound: 'warning',
  weekday_schedule: 'warning',
  weekend_schedule: 'warning',
  unclear: 'warning',
  other: 'old',
};

/** Notices in effect now or starting later today */
function Notices({ snap }: { snap: Snapshot }) {
  const notices = snap.status.published?.notices ?? [];
  const endOfToday = Seattle.startOfDay(Seattle.addDays(snap.today, 1));
  const items = notices.flatMap((n) => {
    const span = n.spans.find((s) => s.start !== null && s.start < endOfToday && (s.end === null || s.end > snap.now));
    return span ? [{ n, start: span.start!, end: span.end }] : [];
  });
  if (!items.length) return null;
  return (
    <div className="notices">
      {items.map(({ n, start, end }) => {
        const until = end === null ? 'with no end given' : `until ${Format.when(end, snap.now)}`;
        const text = start <= snap.now ? `Now ${until}.` : `From ${Format.clock(start)} ${until}.`;
        return (
          <Callout key={`${n.title}-${start}`} tone={TONES[n.kind]} icon={ICONS[n.kind]} title={n.title} link={n.link}>
            {text}
            {n.endCertainty !== 'exact' && end !== null && ' It could last longer.'}
          </Callout>
        );
      })}
    </div>
  );
}

/** Express lanes against the regular lanes, from WSDOT's sensors */
function TravelTimes({ snap }: { snap: Snapshot }) {
  const live = snap.status.live;
  if (!live?.trips || snap.now - live.at > LIVE_MAX_AGE) return null;
  const rows: { label: string; t: TripTimes }[] = [
    { label: 'Seattle → Everett', t: live.trips.northbound },
    { label: 'Everett → Seattle', t: live.trips.southbound },
  ];
  if (rows.every(({ t }) => t.express === null && t.regular === null)) return null;
  const min = (m: number | null) => (m === null ? '—' : `${m} min`);
  return (
    <Card title="Travel times" className="travel-times">
      <table>
        <thead>
          <tr>
            <td />
            <th scope="col">Express lanes</th>
            <th scope="col">Regular lanes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ label, t }) => {
            const saves = t.express !== null && t.regular !== null ? t.regular - t.express : 0;
            return (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>
                  {min(t.express)}
                  {saves >= 2 && <span className="saves"> · saves {saves} min</span>}
                </td>
                <td>
                  {min(t.regular)}
                  {t.usual !== null && <span className="usual"> · usually {t.usual}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="hint">
        Downtown Seattle to Everett, from WSDOT's sensors at {Format.clock(live.at)}.
        {rows.some(({ t }) => t.express === null) && " A dash means the express lanes aren't open that way."}
      </p>
    </Card>
  );
}

function Timelines({ snap }: { snap: Snapshot }) {
  const confident = snap.check.verdict === 'confident';
  const p = snap.status.published;
  const endOfToday = Seattle.startOfDay(Seattle.addDays(snap.today, 1));
  const todayDoubt = p ? doubtsBetween(p, snap.now, endOfToday)[0] : undefined;
  return (
    <Card title={confident ? 'Schedule' : 'Expected schedule · not confirmed'} className={confident ? '' : 'dimmed'}>
      <Timeline label="Today" segments={snap.todaySegments} now={Seattle.time(snap.now)} warning={todayDoubt?.title} />
      <Timeline label="Tomorrow" segments={snap.tomorrowSegments} warning={snap.tomorrowDoubts[0]?.title} />
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
  const changes = snap.changes.filter((c) => c.to !== 'unknown');
  return (
    <Card title="Coming up">
      {changes.length === 0 ? (
        <p className="hint">No changes coming up.</p>
      ) : (
        <ul className="changes">
          {changes.map((c) => (
            <li key={c.at}>
              <Dot status={c.to} />
              <span className="change-to">{TITLES[c.to]}</span>
              {doubtful(c.at) && (
                <span className="doubt" title="This day may not go as planned">
                  <Icon size={14}>
                    <path d="M12 3 2 21h20L12 3Zm0 6v5m0 3v.5" />
                  </Icon>
                  <span className="visually-hidden">May not go as planned</span>
                </span>
              )}
              <span className="change-when">{Format.when(c.at, snap.now)}</span>
              <span className="change-in">{Format.countdown(c.at, snap.now)}</span>
            </li>
          ))}
        </ul>
      )}
      {changes.some((c) => doubtful(c.at)) && <p className="hint">⚠ marks days that may not go as planned.</p>}
    </Card>
  );
}

const spanText = (s: { start: number | null; end: number | null }) => {
  if (s.start === null) return 'No dates given';
  const start = `${Format.shortDate(s.start)} ${Format.clock(s.start)}`;
  if (s.end === null) return `From ${start}, no end given`;
  const sameDay = Seattle.day(s.end) === Seattle.day(s.start);
  return `${start} → ${sameDay ? '' : `${Format.shortDate(s.end)} `}${Format.clock(s.end)}`;
};

function certaintyText(n: Notice): string | null {
  if (n.kind === 'unclear') return "Exact times unclear. The page won't confirm a direction then.";
  const parts: string[] = [];
  if (n.startCertainty === 'approximate') parts.push('Start time is approximate.');
  if (n.endCertainty === 'approximate') parts.push('End time is approximate.');
  if (n.endCertainty === 'unknown' && n.spans.some((s) => s.end !== null)) parts.push('It could last longer.');
  return parts.length ? parts.join(' ') : null;
}

/** Notices with times in the next two weeks, and holidays with no notice */
function Planned({ snap }: { snap: Snapshot }) {
  const p = snap.status.published;
  if (!p) return null;
  const until = snap.now + PLANNED_DAYS * DAY;
  const items = p.notices
    .map((n) => ({
      n,
      spans: n.spans.filter((s) => s.end === null || s.end > snap.now),
    }))
    .filter((x) => x.spans.some((s) => s.start === null || s.start < until));
  const holidays = p.doubts.filter((d) => d.source === 'holiday' && d.end > snap.now && d.start < until);
  if (!items.length && !holidays.length) return null;
  return (
    <Card title="Planned changes" className="planned">
      {items.map(({ n, spans }) => {
        const note = certaintyText(n);
        return (
          <div key={`${n.source}-${n.title}`} className="planned-item">
            <h3>{n.title}</h3>
            <ul className="times">
              {spans.slice(0, MAX_TIMES).map((s, i) => (
                <li key={i}>{spanText(s)}</li>
              ))}
            </ul>
            {spans.length > MAX_TIMES && (
              <details className="more-times">
                <summary aria-label={`Show ${spans.length - MAX_TIMES} more times`}>…</summary>
                <ul className="times">
                  {spans.slice(MAX_TIMES).map((s, i) => (
                    <li key={i}>{spanText(s)}</li>
                  ))}
                </ul>
              </details>
            )}
            {note && <p className="warn-text">{note}</p>}
            <details>
              <summary>{n.source === 'alert' ? "WSDOT's alert" : "WSDOT's words"}</summary>
              <p className="detail">{n.detail}</p>
            </details>
            {n.link && n.link !== SOURCES.expressLanes && (
              <p>
                <a href={n.link}>More info</a>
              </p>
            )}
          </div>
        );
      })}
      {holidays.map((h) => (
        <div key={h.title} className="planned-item">
          <h3>{h.title}</h3>
          <p className="warn-text">{h.detail}</p>
        </div>
      ))}
    </Card>
  );
}

function RegularSchedule({ snap }: { snap: Snapshot }) {
  const p = snap.status.published;
  const listed = p?.schedule ?? null;
  const schedule = listed ?? BUILT_IN_SCHEDULE;
  return (
    <Card title="Regular schedule">
      {p && !listed && (
        <p className="hint">WSDOT's page doesn't list its regular schedule right now. These are the hours it listed in Nov. 2026.</p>
      )}
      <ScheduleRows label="Mon–Fri" windows={schedule.weekday} />
      <ScheduleRows label="Sat–Sun" windows={schedule.weekend} />
    </Card>
  );
}

function Sources({ snap }: { snap: Snapshot }) {
  const p = snap.status.published;
  const seen = new Set<string>([SOURCES.expressLanes]);
  const links = (p?.notices ?? [])
    .filter((n) => n.source === 'page')
    .map((n) => n.link)
    .filter((l): l is string => l !== null && !seen.has(l) && Boolean(seen.add(l)));
  const alerts = (p?.alerts ?? []).filter((a) => a.link);
  return (
    <Card title="Sources">
      <ul className="sources">
        <SourceLink title="WSDOT express lanes schedule" subtitle="Where this data comes from" href={SOURCES.expressLanes} />
        {links.map((l) => (
          <SourceLink key={l} title="Linked from WSDOT's page" subtitle={new URL(l).host} href={l} />
        ))}
        {alerts.map((a) => (
          <SourceLink key={a.hash} title="WSDOT highway alert" subtitle="About the express lanes" href={a.link!} />
        ))}
        <SourceLink title="WSDOT real-time travel map" subtitle="Live traffic, alerts and cameras" href={SOURCES.travelMap} />
        <SourceLink title="WSDOT Traffic on Bluesky" subtitle="Unplanned closures get posted here first" href={SOURCES.wsdotTraffic} />
      </ul>
      <p className="hint">
        WSDOT doesn't publish a live feed for the express lanes. The server reads WSDOT's page and highway alerts every
        15 minutes, two AI models read each new notice, and code checks their answers and works out the times. This page
        only shows a direction when the server read WSDOT recently, both models agree, nothing about now is unclear, and
        WSDOT's travel time sensors don't show traffic going the other way. Otherwise it shows ⚠. It can't know about
        closures WSDOT hasn't posted yet. Not affiliated with WSDOT. Always follow posted signs.
      </p>
    </Card>
  );
}

function readingText(snap: Snapshot): string | null {
  const page = snap.status.published?.page;
  if (!page) return null;
  if (page.status === 'pending') return "Reading WSDOT's latest update…";
  if (page.status === 'failed') return "Couldn't read WSDOT's latest update, so earlier notices are shown.";
  if (page.models.includes('reviewed')) return 'Notices checked by hand.';
  return `Notices read by ${page.models.join(' and ')}.`;
}

function liveText(snap: Snapshot): string | null {
  const live = snap.status.live;
  if (!live || snap.now - live.at > 30 * 60_000) return null;
  const parts = [
    live.northbound ? `${live.northbound} min northbound` : null,
    live.southbound ? `${live.southbound} min southbound` : null,
  ].filter(Boolean);
  const what = parts.length ? parts.join(', ') : 'no traffic';
  return `WSDOT's sensors at ${Format.clock(live.at)}: ${what} through the express lanes.`;
}

function DataStatus({
  snap,
  loaded,
  loadError,
  refreshing,
  onRefresh,
}: {
  snap: Snapshot;
  loaded: ServerStatus | null;
  loadError: string | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const { fetchedAt, checkedAt, error, published } = snap.status;
  let text: string;
  let warn = false;
  if (!loaded) text = 'Loading…';
  else if (fetchedAt !== null && error === null) text = `Checked WSDOT at ${Format.when(fetchedAt, snap.now)}`;
  else if (fetchedAt !== null) {
    text = `WSDOT didn't answer at ${Format.clock(checkedAt ?? snap.now)}. Using what it said at ${Format.when(fetchedAt, snap.now)}.`;
    warn = true;
  } else {
    text = published ? "The server hasn't read WSDOT's page yet." : "The server hasn't published a schedule yet.";
    warn = true;
  }
  const reading = readingText(snap);
  const live = liveText(snap);
  return (
    <div className="data-status">
      <div>
        <p className={warn ? 'warn-text' : ''}>{text}</p>
        {reading && <p className="hint">{reading}</p>}
        {live && <p className="hint">{live}</p>}
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
