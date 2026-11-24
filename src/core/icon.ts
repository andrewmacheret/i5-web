import type { LaneStatus } from './models.ts';
import { changingSoon, type Snapshot } from './snapshot.ts';

// The same colors as the Android app's badges
export const COLORS: Record<LaneStatus | 'warning', string> = {
  northbound: '#1e8e3e',
  southbound: '#1a73e8',
  closed: '#d93025',
  unknown: '#80868b',
  // Darker than the app's amber, so white text stays readable
  warning: '#c77700',
};

const FONT = "system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * The apps' icon as SVG: a colored tile with N or S, a red ✕ for closed, a gray ? while checking,
 * or an amber warning triangle when the status can't be confirmed.
 * An amber dot means the lanes change within 15 minutes.
 */
export function iconSvg(snap: Snapshot, height: number): string {
  const h = height;
  const w = Math.round(h * 1.15);
  const { verdict, scheduled } = snap.check;
  const open = (label: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}"><title>${label}</title>`;

  if (verdict === 'uncertain') {
    // Shaped differently from the tiles so it can't be misread
    const s = h * 0.12;
    return (
      open("I-5 express lanes status can't be confirmed") +
      `<path d="M${w / 2} ${s / 2 + 0.5} L${w - s / 2 - 0.5} ${h - s / 2 - 0.5} L${s / 2 + 0.5} ${h - s / 2 - 0.5} Z" fill="${COLORS.warning}" stroke="${COLORS.warning}" stroke-width="${s}" stroke-linejoin="round"/>` +
      `<rect x="${w / 2 - h * 0.05}" y="${h * 0.3}" width="${h * 0.1}" height="${h * 0.34}" rx="${h * 0.05}" fill="#fff"/>` +
      `<circle cx="${w / 2}" cy="${h * 0.77}" r="${h * 0.06}" fill="#fff"/>` +
      '</svg>'
    );
  }

  const status: LaneStatus = verdict === 'checking' ? 'unknown' : scheduled;
  const letter = (text: string, scale: number) => {
    const size = h * scale;
    return `<text x="${w / 2}" y="${h / 2 + size * 0.36}" text-anchor="middle" font-family="${FONT}" font-size="${size}" font-weight="800" fill="#fff">${text}</text>`;
  };
  let mark: string;
  if (status === 'closed') {
    const a = h * 0.22;
    const cx = w / 2;
    const cy = h / 2;
    mark = `<path d="M${cx - a} ${cy - a} L${cx + a} ${cy + a} M${cx + a} ${cy - a} L${cx - a} ${cy + a}" stroke="#fff" stroke-width="${h * 0.13}" stroke-linecap="round"/>`;
  } else {
    mark = letter(status === 'northbound' ? 'N' : status === 'southbound' ? 'S' : '?', 0.74);
  }
  let dot = '';
  if (verdict === 'confident' && changingSoon(snap)) {
    const d = h * 0.34;
    dot =
      `<circle cx="${w - d / 2}" cy="${d / 2}" r="${d / 2}" fill="#fff"/>` +
      `<circle cx="${w - d / 2}" cy="${d / 2}" r="${d / 2 - d * 0.18}" fill="${COLORS.warning}"/>`;
  }
  const label = verdict === 'checking' ? 'Checking the I-5 express lanes' : `I-5 express lanes ${status}`;
  return (
    open(label) +
    `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="${h * 0.26}" fill="${COLORS[status]}"/>` +
    mark +
    dot +
    '</svg>'
  );
}
