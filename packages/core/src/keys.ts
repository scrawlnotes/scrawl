import { basename } from './fs';

// A keys file holds API keys, passwords and settings as a .env file: `KEY=value` lines, with a
// `# heading` comment before each group of them. The text is what is kept; the groups are read
// from it, and every change is made to its lines, so that comments, blank lines and anything else
// written in it stay as they are. See the Keys views of design/mockups.html.

export const KEYS_EXT = '.env';

/** What a keys file is called: its file name. */
export const keysName = (path: string) => basename(path).slice(0, -KEYS_EXT.length);

export interface KeyEntry {
  /** The line it is on, from 0. */
  line: number;
  key: string;
  /** The value as it reads: quotes taken off, escapes undone. */
  value: string;
}

export interface KeyGroup {
  /** The line of its heading, or -1 for the keys before any heading. */
  line: number;
  /** Its heading; null for the keys before any heading. */
  name: string | null;
  keys: KeyEntry[];
  /** The line after its last key or comment, where a key added to it goes. */
  end: number;
}

/** A key as the interface points at it: the line it was read from, and its name to check that line by. */
export interface KeyAt {
  line: number;
  key: string;
}

const ENTRY = /^\s*(export\s+)?([^\s=#][^\s=]*)\s*=(.*)$/;
const COMMENT = /^\s*#(.*)$/;

/** The value written after `=`, as it reads. A quoted value ends at its closing quote; what follows is a comment. */
function readValue(raw: string): string {
  const text = raw.trim();
  const quote = text[0];
  if (quote === "'") {
    const close = text.indexOf("'", 1);
    return close > 0 ? text.slice(1, close) : text;
  }
  if (quote === '"') {
    let value = '';
    for (let i = 1; i < text.length; i++) {
      const c = text[i]!;
      if (c === '"') return value;
      if (c === '\\' && i + 1 < text.length) {
        const next = text[++i]!;
        value += next === 'n' ? '\n' : next === '"' || next === '\\' ? next : `\\${next}`;
      } else value += c;
    }
    return text;
  }
  return text;
}

/** A value as it is written after `=`: as it is when it can be, else in quotes, as with a space in it. */
export function writeValue(value: string): string {
  const plain = !/\s/.test(value) && !/^["']/.test(value);
  if (plain) return value;
  if (!value.includes("'") && !value.includes('\n')) return `'${value}'`;
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

/** A name typed for a key, as a key can be written: spaces become underscores, `=` and `#` are left out. */
export function cleanKey(key: string): string {
  return key.trim().replace(/\s+/g, '_').replace(/[=#]/g, '');
}

const entryOf = (line: string) => {
  const m = ENTRY.exec(line);
  return m ? { exported: !!m[1], key: m[2]!, value: readValue(m[3]!) } : null;
};

/** A comment that is not a key put out of use (`# OLD_KEY=...`). */
const commentOf = (line: string) => {
  const m = COMMENT.exec(line);
  return m && !entryOf(m[1]!) ? m[1]!.trim() : null;
};

const linesOf = (text: string) => text.split(/\r?\n/);
const eolOf = (text: string) => (text.includes('\r\n') ? '\r\n' : '\n');

/**
 * The groups of a keys file. A comment starts a group when the line before it is not a comment
 * too; the comments after it are notes, kept in the file but not shown. Keys before any heading
 * make a group without a name.
 */
export function parseKeys(text: string): KeyGroup[] {
  const lines = linesOf(text);
  const groups: KeyGroup[] = [];
  let current: KeyGroup | null = null;
  let afterComment = false;
  lines.forEach((line, i) => {
    const entry = entryOf(line);
    if (entry) {
      if (!current) {
        current = { line: -1, name: null, keys: [], end: i + 1 };
        groups.push(current);
      }
      current.keys.push({ line: i, key: entry.key, value: entry.value });
      current.end = i + 1;
      afterComment = false;
      return;
    }
    const comment = COMMENT.test(line) ? commentOf(line) : null;
    if (comment !== null && comment !== '' && !afterComment) {
      current = { line: i, name: comment, keys: [], end: i + 1 };
      groups.push(current);
      afterComment = true;
      return;
    }
    if (COMMENT.test(line)) {
      if (current) current.end = i + 1;
      afterComment = true;
      return;
    }
    afterComment = false;
  });
  return groups;
}

/** How many keys there are in all. */
export const keyCount = (groups: KeyGroup[]) => groups.reduce((sum, group) => sum + group.keys.length, 0);

/**
 * The lines, from 0, that are neither a key, a comment nor blank: lines the table cannot show,
 * as a name with a space in it (`API KEY=...`) or a value after a colon (`KEY: ...`).
 */
export function badLines(text: string): number[] {
  const bad: number[] = [];
  linesOf(text).forEach((line, i) => {
    if (line.trim() !== '' && !COMMENT.test(line) && !entryOf(line)) bad.push(i);
  });
  return bad;
}

/** The line a key is on now: the one it was read from if it still holds it, else the first that does; -1 when none does. */
function lineOf(lines: string[], at: KeyAt): number {
  if (entryOf(lines[at.line] ?? '')?.key === at.key) return at.line;
  return lines.findIndex((line) => entryOf(line)?.key === at.key);
}

/** A group by its heading's line, checked by its name; else the first group of that name. */
function groupOf(groups: KeyGroup[], line: number, name: string | null): KeyGroup | undefined {
  return groups.find((g) => g.line === line && g.name === name) ?? groups.find((g) => g.name === name);
}

function change(text: string, edit: (lines: string[]) => boolean): string {
  const lines = linesOf(text);
  return edit(lines) ? lines.join(eolOf(text)) : text;
}

/**
 * Adds a key at the end of a group, given by its heading's line and name; with a null name, to the
 * keys before any heading. Returns the text and where the key went.
 */
export function addKey(text: string, group: { line: number; name: string | null }, key: string, value: string): { text: string; at: KeyAt | null } {
  const name = cleanKey(key);
  if (!name) return { text, at: null };
  const entry = `${name}=${writeValue(value)}`;
  const target = groupOf(parseKeys(text), group.line, group.name);
  if (!target) {
    // The keys before any heading, when there are none yet: they go first, a blank line between
    // them and the heading that follows.
    if (group.name !== null) return { text, at: null };
    if (!text) return { text: `${entry}\n`, at: { line: 0, key: name } };
    const eol = eolOf(text);
    const apart = linesOf(text)[0]!.trim() === '' ? '' : eol;
    return { text: `${entry}${eol}${apart}${text}`, at: { line: 0, key: name } };
  }
  const lines = linesOf(text);
  lines.splice(target.end, 0, entry);
  return { text: lines.join(eolOf(text)), at: { line: target.end, key: name } };
}

/** Changes a key's name and value; a key written with `export` keeps it. */
export function updateKey(text: string, at: KeyAt, key: string, value: string): string {
  const name = cleanKey(key);
  if (!name) return text;
  return change(text, (lines) => {
    const i = lineOf(lines, at);
    if (i < 0) return false;
    const exported = entryOf(lines[i]!)!.exported;
    lines[i] = `${exported ? 'export ' : ''}${name}=${writeValue(value)}`;
    return true;
  });
}

export function removeKey(text: string, at: KeyAt): string {
  return change(text, (lines) => {
    const i = lineOf(lines, at);
    if (i < 0) return false;
    lines.splice(i, 1);
    return true;
  });
}

/** Adds an empty group at the end, a blank line before its heading. */
export function addGroup(text: string, name: string): string {
  const heading = `# ${name.trim()}`;
  if (!name.trim()) return text;
  const eol = eolOf(text);
  const body = text.replace(/(\r?\n)+$/, '');
  return body ? `${body}${eol}${eol}${heading}${eol}` : `${heading}${eol}`;
}

/** Renames a group; the keys before any heading get one. */
export function renameGroup(text: string, group: { line: number; name: string | null }, name: string): string {
  const heading = `# ${name.trim()}`;
  if (!name.trim()) return text;
  const target = groupOf(parseKeys(text), group.line, group.name);
  if (!target) return text;
  return change(text, (lines) => {
    if (target.line >= 0) lines[target.line] = heading;
    else lines.splice(target.keys[0]!.line, 0, heading);
    return true;
  });
}

/** Removes a group: its heading, its keys and its notes, and a blank line that set it apart. */
export function removeGroup(text: string, group: { line: number; name: string | null }): string {
  const target = groupOf(parseKeys(text), group.line, group.name);
  if (!target) return text;
  return change(text, (lines) => {
    let from = target.line >= 0 ? target.line : target.keys[0]!.line;
    let to = target.end;
    // The blank line after it, unless that is where the file ends; else the one before it.
    if (to < lines.length - 1 && lines[to]!.trim() === '') to++;
    else if (from > 0 && lines[from - 1]!.trim() === '') from--;
    lines.splice(from, to - from);
    return true;
  });
}

/** A group as .env text, as it is written in the file: its heading, keys and notes. */
export function groupText(text: string, group: { line: number; name: string | null }): string {
  const target = groupOf(parseKeys(text), group.line, group.name);
  if (!target) return '';
  const from = target.line >= 0 ? target.line : target.keys[0]!.line;
  return `${linesOf(text).slice(from, target.end).join('\n')}\n`;
}

const SECRET_NAME = /PASS|PWD|SECRET|TOKEN|KEY|PRIVATE/i;
/** An address with a password in it: `postgres://user:password@host`. */
const SECRET_URL = /^[a-z][a-z0-9+.-]*:\/\/[^/\s:@]*:[^/\s@]+@/i;

/** A value that shows as dots until asked for: its name says it is secret, or it is an address with a password. */
export const isSecret = (entry: { key: string; value: string }) => SECRET_NAME.test(entry.key) || SECRET_URL.test(entry.value);
