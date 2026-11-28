import type { ReactNode } from 'react';
import { iconSvg } from '../core/icon.ts';
import { type LaneStatus, type LaneWindow, TITLES, timeLabel, type TimeOfDay } from '../core/models.ts';
import type { Snapshot } from '../core/snapshot.ts';
import type { DaySegment } from '../core/timeline.ts';

export function StatusIcon({ snap, height }: { snap: Snapshot; height: number }) {
  // The same drawing as /icon.svg, so the page and the API never disagree
  return <span className="status-icon" dangerouslySetInnerHTML={{ __html: iconSvg(snap, height) }} />;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="section-head">{children}</h2>;
}

export function Card({ title, children, className }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className ? `card section ${className}` : 'card section'}>
      {title && <SectionTitle>{title}</SectionTitle>}
      {children}
    </section>
  );
}

type Tone = 'warn' | 'bad' | 'muted';

const CALLOUT_ICONS: Record<string, ReactNode> = {
  warning: <path d="M12 3 2 21h20L12 3Zm0 6v5m0 3v.5" />,
  closed: <path d="M8 2h8l6 6v8l-6 6H8l-6-6V8l6-6Zm1 7 6 6m0-6-6 6" />,
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />,
  old: <path d="M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5m4-1v5l3 2" />,
};

export function Callout({
  tone,
  icon,
  title,
  children,
  link,
}: {
  tone: Tone;
  icon: keyof typeof CALLOUT_ICONS;
  title: string;
  children: ReactNode;
  link?: string | null;
}) {
  return (
    <div className={`callout ${tone}`}>
      <Icon>{CALLOUT_ICONS[icon]}</Icon>
      <div>
        <h3>{title}</h3>
        <p>{children}</p>
        {link && (
          <p>
            <a href={link}>More info</a>
          </p>
        )}
      </div>
    </div>
  );
}

export function Icon({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const Dot = ({ status }: { status: LaneStatus }) => <span className={`dot ${status}`} aria-hidden="true" />;

const pct = (t: TimeOfDay) => `${(t / (24 * 60)) * 100}%`;

export function Timeline({
  label,
  warning,
  segments,
  now,
}: {
  label: string;
  warning?: string;
  segments: DaySegment[];
  now?: TimeOfDay;
}) {
  const open = segments.filter((s) => s.status !== 'closed');
  const summary = open.length
    ? open.map((s) => `${TITLES[s.status]} ${timeLabel(s.start)} to ${timeLabel(s.end)}`).join(', ')
    : 'Closed all day';
  return (
    <div className="timeline">
      <div className="timeline-label">
        <span>{label}</span>
        {warning && (
          <span className="timeline-warning">
            <Icon size={14}>{CALLOUT_ICONS.warning}</Icon>
            {warning}
          </span>
        )}
      </div>
      <div className="timeline-bar" role="img" aria-label={`${label}: ${summary}`}>
        {segments.map((s) => (
          <span
            key={s.start}
            className={`segment ${s.status}`}
            style={{ left: pct(s.start), width: pct(s.end - s.start) }}
            title={`${TITLES[s.status]} ${timeLabel(s.start)}–${timeLabel(s.end)}`}
          />
        ))}
        {now !== undefined && <span className="now-marker" style={{ left: pct(now) }} />}
      </div>
      <div className="timeline-hours" aria-hidden="true">
        <span>12a</span>
        <span>6a</span>
        <span>12p</span>
        <span>6p</span>
        <span>12a</span>
      </div>
    </div>
  );
}

export function ScheduleRows({ label, windows }: { label: string; windows: LaneWindow[] }) {
  return (
    <div className="schedule-row">
      <span className="schedule-label">{label}</span>
      <ul>
        {windows.map((w) => (
          <li key={`${w.status}-${w.start}`}>
            <Dot status={w.status} />
            {TITLES[w.status]} <span className="times">{timeLabel(w.start)} – {timeLabel(w.end)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SourceLink({ title, subtitle, href }: { title: string; subtitle: string; href: string }) {
  return (
    <li>
      <a href={href}>
        <Icon size={16}>
          <path d="M14 4h6v6m0-6-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
        </Icon>
        <span>
          <span className="source-title">{title}</span>
          <span className="source-subtitle">{subtitle}</span>
        </span>
      </a>
    </li>
  );
}
