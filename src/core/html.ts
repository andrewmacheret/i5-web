// A tiny HTML reader. It only pulls out headings, paragraphs and list items,
// which is all the WSDOT page needs.

export interface Block {
  kind: 'h2' | 'h3' | 'p' | 'li';
  text: string;
  href: string | null;
}

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&rsquo;': "'",
  '&lsquo;': "'",
  '&ldquo;': '"',
  '&rdquo;': '"',
  '&ndash;': '–',
  '&mdash;': '—',
  '&lt;': '<',
  '&gt;': '>',
};

export function blocks(html: string): Block[] {
  const out: Block[] = [];
  for (const m of html.matchAll(/<(h2|h3|p|li)\b[^>]*>(.*?)<\/\1>/gis)) {
    const text = plainText(m[2]);
    if (text) out.push({ kind: m[1].toLowerCase() as Block['kind'], text, href: firstHref(m[2]) });
  }
  return out;
}

export function plainText(html: string): string {
  let s = html.replace(/<[^>]+>/g, ' ');
  for (const [k, v] of Object.entries(ENTITIES)) s = s.replaceAll(k, v);
  // Last, so "&amp;nbsp;" stays as written
  s = s.replaceAll('&amp;', '&');
  return s.replaceAll('\u00a0', ' ').replace(/\s+/g, ' ').trim();
}

export const firstHref = (html: string) => html.match(/href="([^"]+)"/)?.[1] ?? null;
