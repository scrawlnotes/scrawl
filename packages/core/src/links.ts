const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name.startsWith('#')) {
      const hex = name[1] === 'x' || name[1] === 'X';
      const code = parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
    out[m[1]!.toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return out;
}

const MAX_TITLE = 160;

/**
 * The title of a web page, from its HTML: the title the page gives for sharing (`og:title`,
 * then `twitter:title`), else its `<title>`. Null when it has none.
 */
export function pageTitle(html: string): string | null {
  const shared: Record<string, string> = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = attributes(tag);
    const key = (attrs.property ?? attrs.name ?? '').toLowerCase();
    if ((key === 'og:title' || key === 'twitter:title') && attrs.content && !shared[key]) shared[key] = attrs.content;
  }
  const found = shared['og:title'] ?? shared['twitter:title'] ?? /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const title = found && decodeEntities(found).replace(/\s+/g, ' ').trim();
  if (!title) return null;
  return title.length > MAX_TITLE ? `${title.slice(0, MAX_TITLE - 1).trimEnd()}…` : title;
}
