import { readFileSync } from 'node:fs';
import { hm } from '../src/core/models.ts';
import { dayKey, instant } from '../src/core/seattle.ts';

/** A moment in Seattle time */
export const seattle = (y: number, mo: number, d: number, h: number, mi = 0) => instant(dayKey(y, mo, d), hm(h, mi));

export const day = dayKey;

export const fixture = () =>
  readFileSync(new URL('./fixtures/express-lanes-2026-11-18.html', import.meta.url), 'utf8');

export const DEFAULT_SCHEDULE = `
<h3>Monday-Friday</h3><ul><li>Southbound - 5 a.m. to 11 a.m.</li><li>Northbound - 11:15 a.m. to 11 p.m.</li><li>Closed: 11 p.m. - 5 a.m.</li></ul>
<h3>Saturday &amp; Sunday</h3><ul><li>Southbound - 8 a.m. to 1:30 p.m.</li><li>Northbound - 1:45 to 11 p.m.</li></ul>
`;

/** Wraps snippets in the page's real outline so tests can tweak one part. */
export const page = ({ schedule = DEFAULT_SCHEDULE, special = '' } = {}) => `
<h2>Main navigation</h2>
<h2>I-5 express lanes schedule</h2>${schedule}
<h2>Special events schedule</h2>${special}
<h2>I-5 express lanes map</h2><h2>Footer</h2><p>Copyright Nov. 1</p>
`;
