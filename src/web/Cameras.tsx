import { useEffect, useRef, useState } from 'react';
import type { Camera } from '../core/models.ts';
import { Card } from './parts.tsx';

// Pictures come straight from WSDOT's image server. Nothing loads until the section is opened.

const MAP = 'https://wsdot.com/Travel/Real-time/Map/';
export const CAMERAS_ID = 'cameras';

/** Opens the section, for links to #cameras. The browser then scrolls to it. */
export function openCameras() {
  const details = document.getElementById(CAMERAS_ID);
  if (details instanceof HTMLDetailsElement) details.open = true;
}

/** WSDOT updates each picture about this often */
const REFRESH_EVERY = 5 * 60_000;

/** WSDOT's travel map zoomed in on one camera, with cameras on. Its own camera links don't work. */
export function cameraMapLink(c: Camera): string {
  const extent = [c.lon - 0.006, c.lat - 0.004, c.lon + 0.006, c.lat + 0.004].map((n) => n.toFixed(5)).join(',');
  return `${MAP}?layers=traffic-flow%2Calert%2Ccamera&base=wsdot&extent=${encodeURIComponent(extent)}&fromLink=true`;
}

/** The pictures. `now` changes the address every 5 minutes so browsers fetch a new one. */
export function CameraGrid({ cameras, now }: { cameras: Camera[]; now: number }) {
  const version = Math.floor(now / REFRESH_EVERY);
  return (
    <ul className="camera-grid">
      {cameras.map((c) => (
        <li key={c.id}>
          <a href={c.image}>
            <img src={`${c.image}?v=${version}`} alt={`WSDOT camera at ${c.name}`} width={335} height={244} loading="lazy" />
          </a>
          <span className="camera-name">{c.name}</span>
          <span className="camera-meta">
            MP {c.milepost} · <a href={cameraMapLink(c)}>map</a>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function Cameras({ cameras, now }: { cameras: Camera[]; now: number }) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const details = useRef<HTMLDetailsElement>(null);
  const hasCameras = cameras.length > 0;
  // A link to #cameras from another page lands before the cameras load, so open and scroll here
  useEffect(() => {
    if (hasCameras && location.hash === `#${CAMERAS_ID}` && details.current) {
      details.current.open = true;
      details.current.scrollIntoView();
    }
  }, [hasCameras]);
  if (!hasCameras) return null;
  const express = cameras.filter((c) => c.express);
  const shown = all || !express.length ? cameras : express;
  return (
    <Card title="Cameras" className="cameras">
      <details id={CAMERAS_ID} ref={details} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary>
          {`${open ? 'Hide' : 'Show'} ${express.length ? `${express.length} express lane cameras` : `${cameras.length} cameras`}, downtown to Northgate`}
        </summary>
        {open && (
          <>
            <CameraGrid cameras={shown} now={now} />
            {express.length > 0 && express.length < cameras.length && (
              <button type="button" className="control small" onClick={() => setAll(!all)}>
                {all ? 'Only express lane cameras' : `Show all ${cameras.length} cameras along I-5`}
              </button>
            )}
            <p className="hint">From WSDOT. Each picture updates about every 5 minutes.</p>
          </>
        )}
      </details>
    </Card>
  );
}
