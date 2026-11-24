import { useState } from 'react';
import { API_URL, PAGE_URL } from './api.ts';
import { Card } from './parts.tsx';

type Kind = 'badge' | 'badge-square' | 'icon';

const KINDS: { id: Kind; label: string }[] = [
  { id: 'badge', label: 'Badge' },
  { id: 'badge-square', label: 'Square badge' },
  { id: 'icon', label: 'Icon' },
];

function imageUrl(kind: Kind, time: boolean): string {
  if (kind === 'icon') return `${API_URL}/icon.svg?size=40`;
  const q = new URLSearchParams();
  if (kind === 'badge-square') q.set('style', 'flat-square');
  if (!time) q.set('time', '0');
  const s = q.toString();
  return `${API_URL}/badge.svg${s ? `?${s}` : ''}`;
}

function CopyRow({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Some browsers block the clipboard. The text can still be selected by hand.
    }
  };
  return (
    <div className="copy-row">
      <span className="copy-label">{label}</span>
      <code>{text}</code>
      <button type="button" className="control small" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

/** Lets other sites show the live status, the way GitHub READMEs show build badges */
export default function BadgeMaker() {
  const [kind, setKind] = useState<Kind>('badge');
  const [time, setTime] = useState(true);
  const src = imageUrl(kind, time);
  const alt = 'I-5 express lanes status';
  return (
    <Card title="Badge for your site" className="badge-maker">
      <p className="hint">
        Shows the live status anywhere an image can go, like a GitHub README. It says “can't confirm” whenever this page
        would.
      </p>
      <div className="badge-options">
        <div className="segmented" role="radiogroup" aria-label="Badge style">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              role="radio"
              aria-checked={kind === k.id}
              className="control small"
              onClick={() => setKind(k.id)}
            >
              {k.label}
            </button>
          ))}
        </div>
        {kind !== 'icon' && (
          <label className="checkbox">
            <input type="checkbox" checked={time} onChange={(e) => setTime(e.target.checked)} />
            Show the next change
          </label>
        )}
      </div>
      <div className="badge-preview">
        <a href={PAGE_URL}>
          <img src={src} alt={alt} />
        </a>
      </div>
      <CopyRow label="Markdown" text={`[![${alt}](${src})](${PAGE_URL})`} />
      <CopyRow label="HTML" text={`<a href="${PAGE_URL}"><img src="${src}" alt="${alt}"></a>`} />
    </Card>
  );
}
