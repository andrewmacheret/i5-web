import * as Format from '../core/format.ts';
import { COLORS } from '../core/icon.ts';
import { timeLabel } from '../core/models.ts';
import * as Seattle from '../core/seattle.ts';
import type { Snapshot } from '../core/snapshot.ts';
import { VERDANA_11 } from './verdana.ts';

export type BadgeStyle = 'flat' | 'flat-square';

export interface BadgeOptions {
  style: BadgeStyle;
  /** Adds when the lanes change next, like "until 11 PM" */
  time: boolean;
  label: string;
}

export const DEFAULT_LABEL = 'I-5 express lanes';

/** "11 PM", "11:15 AM tomorrow", "4 AM Mon", "midnight" */
export function shortWhen(at: number, now: number): string {
  const t = Seattle.time(at);
  const clock = t === 0 || t === 12 * 60 ? timeLabel(t).toLowerCase() : timeLabel(t);
  // Midnight belongs to the day before, so "until midnight" means tonight
  const day = Format.dayName(t === 0 ? at - 60_000 : at, now);
  if (day === 'Today') return clock;
  return `${clock} ${day === 'Tomorrow' ? 'tomorrow' : day}`;
}

/** The right half of the badge, and its color */
export function badgeValue(snap: Snapshot, time: boolean): { text: string; color: string } {
  const { verdict, scheduled } = snap.check;
  if (verdict !== 'confident') return { text: "can't confirm", color: COLORS.warning };
  let text = scheduled;
  if (time && snap.next) text += ` until ${shortWhen(snap.next.at, snap.now)}`;
  return { text, color: COLORS[scheduled] };
}

export function textWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += VERDANA_11[(ch.codePointAt(0) ?? 0) - 32] ?? 7;
  return w;
}

const escape = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/** A shields.io style badge. Text widths come from Verdana, like shields.io. */
export function badgeSvg(label: string, value: string, color: string, style: BadgeStyle): string {
  const labelText = Math.round(textWidth(label));
  const valueText = Math.round(textWidth(value));
  const lw = labelText + 10;
  const vw = valueText + 10;
  const w = lw + vw;
  const flat = style === 'flat';
  const title = escape(`${label}: ${value}`);
  // Text is drawn 10x bigger and scaled down, which places it more precisely
  const text = (x: number, length: number, s: string) =>
    (flat
      ? `<text aria-hidden="true" x="${x * 10}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${length * 10}">${escape(s)}</text>`
      : '') + `<text x="${x * 10}" y="140" transform="scale(.1)" fill="#fff" textLength="${length * 10}">${escape(s)}</text>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${title}">` +
    `<title>${title}</title>` +
    (flat
      ? '<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>' +
        `<clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>`
      : '') +
    `<g${flat ? ' clip-path="url(#r)"' : ''} shape-rendering="crispEdges">` +
    `<rect width="${lw}" height="20" fill="#555"/>` +
    `<rect x="${lw}" width="${vw}" height="20" fill="${color}"/>` +
    (flat ? `<rect width="${w}" height="20" fill="url(#s)"/>` : '') +
    '</g>' +
    '<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">' +
    text(lw / 2, labelText, label) +
    text(lw + vw / 2, valueText, value) +
    '</g></svg>'
  );
}

export function badge(snap: Snapshot, options: BadgeOptions): string {
  const { text, color } = badgeValue(snap, options.time);
  return badgeSvg(options.label, text, color, options.style);
}
