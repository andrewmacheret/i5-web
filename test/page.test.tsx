import { readdirSync, readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ServerStatus } from '../src/core/models.ts';
import { makeSnapshot } from '../src/core/snapshot.ts';
import { CameraGrid, cameraImageUrl, cameraMapLink, RETRY_DELAYS } from '../src/web/Cameras.tsx';
import { Page } from '../src/web/Page.tsx';

// Renders the page from real /status responses. The fixtures come from i5-server-lambdas, made
// by its real code from saved copies of WSDOT's page, with fake models giving the approved answers.

interface Fixture {
  about: string;
  at: number;
  status: ServerStatus;
}

const dir = new URL('./fixtures/', import.meta.url);
const fixture = (name: string): Fixture => JSON.parse(readFileSync(new URL(`${name}.json`, dir), 'utf8'));

function render(status: ServerStatus | null, at: number, extra: { loadError?: string } = {}) {
  const empty: ServerStatus = { published: null, fetchedAt: null, checkedAt: null, error: null, live: null };
  const html = renderToStaticMarkup(
    <Page
      snap={makeSnapshot(status ?? empty, at)}
      loaded={status}
      loadError={extra.loadError ?? null}
      refreshing={false}
      preview={false}
      onRefresh={() => {}}
      apiUrl="https://i5.andrewmacheret.com"
      pageUrl="https://andrewmacheret.com/projects/i5/"
    />,
  );
  // Plain text, for checking what a reader sees
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
  return { html, text };
}

const page = (name: string) => {
  const f = fixture(name);
  return render(f.status, f.at);
};

describe('every fixture', () => {
  const names = readdirSync(dir).map((f) => f.replace(/\.json$/, ''));

  it.each(names)('%s renders every section', (name) => {
    const { text, html } = page(name);
    for (const section of ['I-5 Express Lanes', 'Today', 'Tomorrow', 'Coming up', 'Regular schedule', 'Badge for your site', 'Sources']) {
      expect(text).toContain(section);
    }
    expect(html).toContain('<svg');
    expect(text).not.toMatch(/undefined|NaN|null/);
  });
});

describe('the page', () => {
  it('shows a confirmed direction, what happens next, and the notices coming up', () => {
    const { text, html } = page('confident');
    expect(text).toContain('Northbound');
    expect(text).toMatch(/Closes at 11:00 PM · \d+h/);
    expect(text).not.toContain("Can't confirm");
    // The alert's lane reduction starts tonight
    expect(text).toContain('Reduced to two lanes at night From 7:00 PM until 5:00 AM tomorrow.');
    // Planned changes from the page and the alert
    expect(text).toContain('Weekend-long full closure');
    expect(text).toContain('Start time is approximate.');
    expect(text).toContain('Closing early at 9 p.m.');
    expect(html).toContain('<li>Wed, Dec 2 9:00 PM → Thu, Dec 3 5:00 AM</li>');
    expect(text).toContain("WSDOT's words");
    expect(text).toContain("WSDOT's alert");
    expect(html).toContain('https://wsdot.com/Travel/Real-time/Map/?featureid=727762&amp;featuretype=alert');
    expect(text).toContain('Notices read by gemini-4-hydrogen and gpt-oss-120b.');
    expect(text).toContain("WSDOT's sensors at 3:00 PM: 18 min northbound through the express lanes.");
    expect(html).toContain('aria-label="Today: Southbound 5 AM to 11 AM, Northbound 11:15 AM to 11 PM"');
    expect(html).toContain('aria-label="Tomorrow: Southbound 5 AM to 11 AM, Northbound 11:15 AM to 9 PM"');
  });

  it('compares the express lanes with the regular lanes', () => {
    const { text } = page('confident');
    expect(text).toContain('Travel times Express lanes Regular lanes');
    expect(text).toContain('Seattle → Everett 18 min · saves 8 min 26 min · usually 22');
    expect(text).toContain('Everett → Seattle — 15 min · usually 16');
    expect(text).toContain("Downtown Seattle to Everett, from WSDOT's sensors at 3:00 PM. A dash means the express lanes aren't open that way.");
  });

  it('leaves out travel times from old readings without them, or once they are 30 minutes old', () => {
    expect(page('holiday').text).not.toContain('Travel times');
    const f = fixture('confident');
    expect(render(f.status, f.at + 31 * 60_000).text).not.toContain('Travel times');
  });

  it("can't confirm the day after Thanksgiving, with no holiday notice", () => {
    const { text, html } = page('holiday');
    expect(html).toContain('href="https://bsky.app/profile/traffic.wsdot.wa.gov"');
    expect(text).toContain("Can't confirm");
    expect(text).toContain("Expected northbound, but don't rely on it");
    expect(text).toContain('No word yet on Thanksgiving');
    expect(text).toContain('Check a live source before you drive: WSDOT Traffic on Bluesky · Traffic cameras · WSDOT page');
    expect(html).toContain('>Traffic cameras</a>');
    expect(html).toContain('href="https://wsdot.com/Travel/Real-time/Map/?layers=');
  });

  it('sends "Traffic cameras" to the Cameras section when the server sent cameras', () => {
    const f = fixture('holiday');
    const cameras = fixture('confident').status?.cameras;
    const { html } = render(f.status && { ...f.status, cameras }, f.at);
    expect(html).toContain('<a href="#cameras">Traffic cameras</a>');
    expect(html).toContain('<details id="cameras">');
  });

  it('says it is checking while the models read a new page', () => {
    const { text } = page('checking');
    expect(text).toContain('Checking…');
    expect(text).toContain("Reading WSDOT's latest update");
    expect(text).not.toContain('Check a live source before you drive');
  });

  it('warns when no model could read the latest page', () => {
    const { text } = page('failed');
    expect(text).toContain("Can't confirm");
    expect(text).toContain("Couldn't read WSDOT's latest update, so earlier notices are shown.");
    // The earlier page lists no regular hours
    expect(text).toContain("WSDOT's page doesn't list its regular schedule right now.");
  });

  it("warns when WSDOT's page has been down for hours", () => {
    const { text } = page('stale');
    expect(text).toContain('Data is 3h old');
    expect(text).toMatch(/WSDOT didn't answer at 2:50 PM\. Using what it said at 12:00 PM\./);
  });

  it('shows a notice in effect now, and that it could last longer', () => {
    const { text } = page('winter-2022');
    expect(text).toContain('Southbound');
    expect(text).toContain('Southbound for winter weather Now until 11:00 AM Mon. It could last longer.');
  });

  it('handles a notice that runs past the end of the timeline', () => {
    const { text } = page('revive-2026');
    expect(text).toContain('Northbound');
    expect(text).toContain('No changes before Fri, Oct 9');
    expect(text).toContain('Northbound around the clock for Revive I-5 Now until 12:00 AM Fri, Jan 1. It could last longer.');
    expect(text).toContain('Ninth Avenue on-ramp closed Now until 12:00 AM Tue, Sep 8.');
    expect(text).toContain('No changes coming up.');
  });

  it('lists up to 20 times per notice and folds the rest behind …', () => {
    const f = fixture('confident');
    const p = f.status.published!;
    const n = p.notices.find((x) => x.title === 'Closing early at 9 p.m.')!;
    const spans = Array.from({ length: 25 }, (_, i) => ({ start: f.at + (i + 1) * 86_400_000, end: f.at + (i + 1) * 86_400_000 + 3_600_000 }));
    const status = { ...f.status, published: { ...p, notices: [{ ...n, spans }] } };
    const { html } = render(status, f.at);
    const shown = html.slice(0, html.indexOf('class="more-times"'));
    const folded = html.slice(html.indexOf('class="more-times"'));
    expect(shown.match(/<li>[^<]+→/g)).toHaveLength(20);
    expect(folded).toContain('aria-label="Show 5 more times">…</summary>');
    expect(folded.slice(0, folded.indexOf('</details>')).match(/<li>/g)).toHaveLength(5);
  });

  it('says it is loading before the first answer', () => {
    const { text } = render(null, Date.UTC(2026, 11, 1, 20));
    expect(text).toContain('Loading…');
    expect(text).toContain('Asking the server');
    expect(text).not.toContain("Can't confirm");
  });

  it("shows the error when the server can't be reached", () => {
    const f = fixture('confident');
    const { text } = render(f.status, f.at, { loadError: "Couldn't reach the server: Failed to fetch" });
    expect(text).toContain("Couldn't reach the server: Failed to fetch");
  });
});

describe('cameras', () => {
  const f = fixture('confident');
  const cameras = f.status?.cameras ?? [];

  it('start closed, offering the express lane ones, so no pictures load', () => {
    const { html, text } = page('confident');
    expect(text).toContain('Cameras Show 2 express lane cameras, downtown to Northgate');
    expect(html).toContain('<details id="cameras">');
    expect(html).not.toContain('images.wsdot.wa.gov');
  });

  it("are left out when the server didn't send any", () => {
    expect(page('holiday').text).not.toContain('Cameras');
  });

  it("show WSDOT's picture, which changes address every 5 minutes, with its milepost and a map link", () => {
    const grid = (now: number) => renderToStaticMarkup(<CameraGrid cameras={cameras.slice(1, 2)} now={now} />);
    const html = grid(f.at);
    expect(html).toMatch(/<img src="https:\/\/images\.wsdot\.wa\.gov\/nw\/[\w]+\.jpg\?v=\d+"/);
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('Roanoke St Express Lanes');
    expect(html).toContain('MP 168 ·');
    expect(grid(f.at + 60_000)).toBe(html);
    expect(grid(f.at + 5 * 60_000)).not.toBe(html);
  });

  it('each have a reload button', () => {
    const html = renderToStaticMarkup(<CameraGrid cameras={cameras.slice(1, 2)} now={f.at} />);
    expect(html).toContain('aria-label="Reload the picture from Roanoke St Express Lanes"');
  });

  it('retry a picture three times, waiting longer each time, with a new address each try', () => {
    expect(RETRY_DELAYS).toEqual([5_000, 15_000, 45_000]);
    const c = cameras[0];
    expect(cameraImageUrl(c, 100)).toBe(`${c.image}?v=100`);
    expect(cameraImageUrl(c, 100, 2)).toBe(`${c.image}?v=100-2`);
  });

  it('link to the travel map zoomed in on the camera', () => {
    const c = cameras[0];
    const url = new URL(cameraMapLink(c));
    expect(url.origin + url.pathname).toBe('https://wsdot.com/Travel/Real-time/Map/');
    expect(url.searchParams.get('layers')).toBe('traffic-flow,alert,camera');
    const [west, south, east, north] = (url.searchParams.get('extent') ?? '').split(',').map(Number);
    expect(west).toBeLessThan(c.lon);
    expect(east).toBeGreaterThan(c.lon);
    expect(south).toBeLessThan(c.lat);
    expect(north).toBeGreaterThan(c.lat);
    expect(east - west).toBeCloseTo(0.012, 5);
  });
});
