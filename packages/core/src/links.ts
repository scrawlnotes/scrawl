import { dirname, type VaultFs } from './fs';

// A note links to something else in its space with a Markdown link whose address is a path from
// the note's folder, as GitHub and other Markdown tools read it: [Deals](Deals.board.json),
// [Plan](../Plans/Roadmap.md), [Order lines](Order%20lines). Attached files keep their address
// from the top of the space, _attachments/…, as the app writes them. When something is moved or
// renamed, the links to it follow, and so do the links of what moved.

const ATTACHMENTS = '_attachments';

/** Whether a link's address points inside the space: a path, not a web or mail address, nor a place in the note. */
export function isInsideHref(href: string): boolean {
  const h = href.trim();
  return h !== '' && !/^[a-z][a-z0-9+.-]*:/i.test(h) && !h.startsWith('#') && !h.startsWith('//');
}

/** An address split into its path, as written, and what follows it: a place in the page, a query. */
function splitHref(href: string): [string, string] {
  let h = href.trim();
  if (h.startsWith('<') && h.endsWith('>')) h = h.slice(1, -1);
  const cut = h.search(/[?#]/);
  return cut < 0 ? [h, ''] : [h.slice(0, cut), h.slice(cut)];
}

const decode = (part: string) => {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
};

/**
 * The path in the space a link of a note in `folder` points at; null for one that is not a path,
 * or that goes above the top of the space. An attached file's address is read from the top.
 */
export function resolveHref(folder: string, href: string): string | null {
  if (!isInsideHref(href)) return null;
  const [path] = splitHref(href);
  const fromTop = path.startsWith('/') || path.startsWith(`${ATTACHMENTS}/`);
  const parts = fromTop || !folder ? [] : folder.split('/');
  for (const raw of path.split('/')) {
    const part = decode(raw);
    if (!part || part === '.') continue;
    if (part === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(part);
  }
  return parts.length > 0 ? parts.join('/') : null;
}

/** A part of a path as an address writes it: what Markdown or an address reads otherwise (a space, a bracket, %) escaped, the rest as it is. */
const escapePart = (part: string) => part.replace(/[%\s()<>[\]#?\\]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);

/** How a note in `folder` writes a link to `path`: from its folder, going up as far as needed. */
export function hrefTo(folder: string, path: string): string {
  if (path.startsWith(`${ATTACHMENTS}/`)) return path.split('/').map(escapePart).join('/');
  const from = folder ? folder.split('/') : [];
  const to = path.split('/');
  let same = 0;
  while (same < from.length && same < to.length && from[same] === to[same]) same++;
  const parts = [...from.slice(same).map(() => '..'), ...to.slice(same)];
  return parts.map((p) => (p === '..' ? p : escapePart(p))).join('/') || '.';
}

/** A Markdown link or image as written: where its address starts and ends, and the address. */
interface WrittenLink {
  from: number;
  to: number;
  href: string;
}

/** The links of a Markdown text, outside code: `[text](address)` and `![alt](address)`. */
export function linksIn(text: string): WrittenLink[] {
  // Code is blanked out, keeping its length, so that what looks like a link in it is not one.
  const plain = text
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?(^\1[^\n]*$|(?![\s\S]))/gm, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(`+)[^`\n][\s\S]*?\1/g, (m) => ' '.repeat(m.length));
  const links: WrittenLink[] = [];
  // Its text may hold brackets, one pair deep: [A [b]](address).
  const LINK = /!?\[(?:[^[\]\\\n]|\\.|\[(?:[^[\]\\\n]|\\.)*\])*\]\(([ \t]*)(<[^>\n]*>|[^\s()]+)(?:[ \t]+"[^"\n]*")?[ \t]*\)/g;
  for (const m of plain.matchAll(LINK)) {
    const from = m.index! + m[0].indexOf('](') + 2 + m[1]!.length;
    links.push({ from, to: from + m[2]!.length, href: text.slice(from, from + m[2]!.length) });
  }
  return links;
}

/** What is under a moved path is under its new one; null for what did not move. */
export const movedBy =
  (moves: readonly { from: string; to: string }[]) =>
  (path: string): string | null => {
    for (const m of moves) {
      if (path === m.from) return m.to;
      if (path.startsWith(`${m.from}/`)) return m.to + path.slice(m.from.length);
    }
    return null;
  };

export interface TextChange {
  from: number;
  to: number;
  insert: string;
}

/**
 * What changes in a note's text after moves: each link to what moved points at it where it is
 * now; when the note itself moved from the folder `was` to `now`, each of its links is written
 * from where it is. A link to what is not in the space is left as it was. Empty when none changes.
 */
export function relinkText(text: string, was: string, now: string, moved: (path: string) => string | null): TextChange[] {
  const changes: TextChange[] = [];
  for (const link of linksIn(text)) {
    const [path, rest] = splitHref(link.href);
    if (!isInsideHref(link.href) || path.startsWith(`${ATTACHMENTS}/`) || path.startsWith('/')) continue;
    const target = resolveHref(was, link.href);
    if (!target) continue;
    const after = moved(target) ?? target;
    if (resolveHref(now, link.href) === after) continue;
    const written = `${hrefTo(now, after)}${rest}`;
    changes.push({ from: link.from, to: link.to, insert: link.href.trim().startsWith('<') ? `<${decode(hrefTo(now, after))}${rest}>` : written });
  }
  return changes;
}

/** A text with changes put in, the last first so that the places of the others hold. */
export const applyChanges = (text: string, changes: readonly TextChange[]) =>
  [...changes].sort((a, b) => b.from - a.from).reduce((out, c) => out.slice(0, c.from) + c.insert + out.slice(c.to), text);

/** Every note of a space, records' notes too: its Markdown files, outside the app's own folders and the attachments. */
async function notesOf(fs: VaultFs, dir = ''): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await fs.list(dir)) {
    if (entry.name.startsWith('.') || (entry.name.startsWith('_') && entry.kind === 'dir')) continue;
    if (entry.kind === 'dir') out.push(...(await notesOf(fs, entry.path)));
    else if (entry.name.endsWith('.md')) out.push(entry.path);
  }
  return out;
}

/** A note to change after moves: where it is, its text as read and the changes. */
export interface Relink {
  path: string;
  text: string;
  changes: TextChange[];
}

/** The notes of the space whose links change after `moves`, read now; writes nothing. */
export async function relinkPlan(fs: VaultFs, moves: readonly { from: string; to: string }[]): Promise<Relink[]> {
  const moved = movedBy(moves);
  const back = movedBy(moves.map((m) => ({ from: m.to, to: m.from })));
  const out: Relink[] = [];
  for (const path of await notesOf(fs)) {
    const text = await fs.readText(path).catch(() => null);
    if (text === null || !text.includes('](')) continue;
    const was = back(path) ?? path;
    const changes = relinkText(text, dirname(was), dirname(path), moved);
    if (changes.length > 0) out.push({ path, text, changes });
  }
  return out;
}

/** Changes the links of the space's notes after `moves`; returns the notes changed. */
export async function relinkNotes(fs: VaultFs, moves: readonly { from: string; to: string }[]): Promise<string[]> {
  const plan = await relinkPlan(fs, moves);
  for (const { path, text, changes } of plan) await fs.writeText(path, applyChanges(text, changes));
  return plan.map((r) => r.path);
}

