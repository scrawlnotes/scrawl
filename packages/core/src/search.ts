// Searching everywhere: anything found by its name or by its text, in one list, the best match
// first. What was typed is found where a word starts, so `tu` finds `Tulin` but not `Status`. A
// letter matches itself with or without its accent and in either case, so `şirket` finds
// `Sirket` and `cafe` finds `Café`; Turkish ı and İ are i. See PLAN.md 4.2.

/** What the search window finds: a note, a task, a card, a record, a file, or what holds them. */
export type FindKind = 'note' | 'task' | 'card' | 'record' | 'file' | 'tasks' | 'board' | 'collection' | 'keys' | 'filter' | 'folder' | 'space';

/** Something to be found: what it is called, a key it goes by, its text and its fields. */
export interface Findable {
  kind: FindKind;
  name: string;
  /** A card's key or a record's code: found as its name is. */
  key?: string;
  /** A note's text; a task's description; a card's description and comments; a record's body. */
  text?: string;
  /** A card's or a record's fields, as label and value: found by their values only, shown with their labels. */
  fields?: [label: string, value: string][];
  /** A task done, a card in a done column: lower in the list than one as well found that is not. */
  done?: boolean;
}

/** A part of a string, from where it starts to where it ends. */
export type Span = [number, number];

/** The line something was found in by its text, or the field it was found in by its value. */
export interface FoundLine {
  /** The line as it reads, without its Markdown marks; cut short around the words when long. A field reads `Label: value`. */
  text: string;
  /** Where the words are in `text`. */
  marks: Span[];
  /** Where the words are in the whole text of what was found, to show them there once it is open; none for a field. */
  spans: Span[];
}

export interface Found<T extends Findable> {
  item: T;
  /** Where its name has the words. */
  inName: Span[];
  /** Where its key has them. */
  inKey: Span[];
  /** Set when some of the words were found in its text or its fields only. */
  line?: FoundLine;
}

interface Prepared<T extends Findable> {
  item: T;
  name: string;
  key: string;
  text: string;
  fields: string[];
}

/** Things made ready to be searched again and again, as one types. */
export interface SearchIndex<T extends Findable> {
  items: Prepared<T>[];
}

const MARKS = /\p{M}/gu;
const ASCII = /^[\x00-\x7f]*$/;

/** A string as the search compares it: lower case, without accents, ı as i. */
export function fold(text: string): string {
  const lower = text.toLowerCase();
  if (ASCII.test(lower)) return lower;
  return lower.normalize('NFD').replace(MARKS, '').replace(/ı/g, 'i');
}

/** A string folded a character at a time, with where each folded character came from. */
function foldMapped(text: string): { folded: string; from: number[] } {
  let folded = '';
  const from: number[] = [];
  let at = 0;
  for (const ch of text) {
    const piece = fold(ch);
    for (let i = 0; i < piece.length; i++) from.push(at);
    folded += piece;
    at += ch.length;
  }
  from.push(at);
  return { folded, from };
}

const LETTER = /[\p{L}\p{N}]/u;

/** Where the word starts a word in the folded string, the first such; -1 where it does not. */
function wordAt(folded: string, word: string, from = 0): number {
  // A word that starts with a mark, `#tag` or `(draft)`, is found wherever the mark is.
  const anywhere = !LETTER.test(word[0] ?? '');
  for (let i = folded.indexOf(word, from); i >= 0; i = folded.indexOf(word, i + 1)) {
    if (anywhere || i === 0 || !LETTER.test(folded[i - 1]!)) return i;
  }
  return -1;
}

const hasWord = (folded: string, word: string) => wordAt(folded, word) >= 0;

/** Whether the word is found as a whole word: nothing of a word goes on after it. */
function wholeWord(folded: string, word: string): boolean {
  for (let i = wordAt(folded, word); i >= 0; i = wordAt(folded, word, i + 1)) {
    const after = folded[i + word.length];
    if (after === undefined || !LETTER.test(after)) return true;
  }
  return false;
}

/** Where the words are in a string, as spans of the string itself; overlapping ones joined. */
function spansOf(text: string, words: string[]): Span[] {
  if (words.length === 0 || text === '') return [];
  const { folded, from } = foldMapped(text);
  const spans: Span[] = [];
  for (const word of words) {
    for (let i = wordAt(folded, word); i >= 0; i = wordAt(folded, word, i + word.length)) spans.push([from[i]!, from[i + word.length]!]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  const joined: Span[] = [];
  for (const span of spans) {
    const last = joined[joined.length - 1];
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else joined.push([span[0], span[1]]);
  }
  return joined;
}

export function searchIndex<T extends Findable>(items: T[]): SearchIndex<T> {
  return {
    items: items.map((item) => ({
      item,
      name: fold(item.name),
      key: fold(item.key ?? ''),
      text: fold(item.text ?? ''),
      fields: (item.fields ?? []).map(([, value]) => fold(value)),
    })),
  };
}

/** The words of what was typed, folded; each once. */
export function queryWords(query: string): string[] {
  return [...new Set(fold(query).split(/\s+/).filter(Boolean))];
}

/** Where a name has every word of what was typed, each where a word starts; null when it has not all of them. */
export function nameMatch(name: string, query: string): Span[] | null {
  const words = queryWords(query);
  const folded = fold(name);
  if (words.length === 0 || !words.every((word) => hasWord(folded, word))) return null;
  return spansOf(name, words);
}

// The Markdown marks a line of text is read without: a heading's #, a list's bullet or number and
// its box, a quote's >, bold, italic, struck and code marks, and where a link goes.
const LEAD = /^\s*(?:(?:#{1,6}|[-*+]|\d+[.)]|>)\s+)*(?:\[[ xX]\]\s+)?/;
const INLINE = /\*\*|__|~~|`+|!?\[|\]\([^)\n]*\)|<\/?[a-z][^>\n]*>/gi;

/** A line without its Markdown marks, and where each of its characters went: -1 for one left out. */
function plainLine(line: string): { text: string; to: number[] } {
  const keep = new Array<boolean>(line.length).fill(true);
  const lead = LEAD.exec(line)?.[0].length ?? 0;
  for (let i = 0; i < lead; i++) keep[i] = false;
  for (const m of line.matchAll(INLINE)) {
    if (m.index! < lead) continue;
    for (let i = m.index!; i < m.index! + m[0].length; i++) keep[i] = false;
  }
  let text = '';
  const to: number[] = [];
  for (let i = 0; i < line.length; i++) {
    to.push(keep[i] ? text.length : -1);
    if (keep[i]) text += line[i];
  }
  to.push(text.length);
  return { text, to };
}

/** How much of a long line is shown before the first word found, and how long it is at most. */
const BEFORE = 40;
const LONGEST = 200;

/** A line as it is shown: cut before the first word at a space when long, and after; the marks moved with it. */
function cut(text: string, marks: Span[]): { text: string; marks: Span[] } {
  let shown = text;
  const first = marks[0]?.[0] ?? 0;
  if (first > BEFORE) {
    const space = shown.lastIndexOf(' ', first - BEFORE / 2);
    const at = space > 0 ? space + 1 : first - BEFORE / 2;
    shown = `…${shown.slice(at)}`;
    marks = marks.map(([from, to]): Span => [from - at + 1, to - at + 1]);
  }
  if (shown.length > LONGEST) {
    shown = `${shown.slice(0, LONGEST).trimEnd()}…`;
    marks = marks.filter(([from]) => from < LONGEST).map(([from, to]): Span => [from, Math.min(to, LONGEST)]);
  }
  return { text: shown, marks };
}

/** A line of a text, as it reads, with the words marked. */
function textLine(text: string, index: number, words: string[]): FoundLine | undefined {
  const lines = text.split('\n');
  const line = lines[index] ?? '';
  let start = 0;
  for (let i = 0; i < index; i++) start += lines[i]!.length + 1;
  const found = spansOf(line, words);
  const plain = plainLine(line);
  // Marks follow the characters kept; a word whose characters all went (inside a link's address) is not marked.
  const at = (i: number) => {
    for (let j = i; j < plain.to.length; j++) if (plain.to[j]! >= 0) return plain.to[j]!;
    return plain.text.length;
  };
  const shownFound = found.filter(([from, to]) => at(to) > at(from));
  if (shownFound.length === 0) return undefined;
  const shown = cut(
    plain.text,
    shownFound.map(([from, to]): Span => [at(from), at(to)]),
  );
  return { ...shown, spans: shownFound.map(([from, to]): Span => [start + from, start + to]) };
}

/** A field as it reads, `Label: value`, with the words marked in its value. */
function fieldLine([label, value]: [string, string], words: string[]): FoundLine | undefined {
  const head = `${label}: `;
  const marks = spansOf(value, words).map(([from, to]): Span => [head.length + from, head.length + to]);
  if (marks.length === 0) return undefined;
  return { ...cut(`${head}${value}`, marks), spans: [] };
}

/** The line of the text, or the field, with the most of the words; the text before the fields, the first such. */
function lineOf<T extends Findable>(each: Prepared<T>, words: string[]): FoundLine | undefined {
  const count = (folded: string) => words.filter((word) => hasWord(folded, word)).length;
  const lines = each.text.split('\n');
  let line = -1;
  let field = -1;
  let most = 0;
  for (let i = 0; i < lines.length; i++) {
    const n = count(lines[i]!);
    if (n > most) [most, line] = [n, i];
  }
  for (let i = 0; i < each.fields.length; i++) {
    const n = count(each.fields[i]!);
    if (n > most) [most, field, line] = [n, i, -1];
  }
  if (field >= 0) return fieldLine(each.item.fields![field]!, words);
  return line >= 0 ? textLine(each.item.text ?? '', line, words) : undefined;
}

/**
 * What matches what was typed, the best first. Every word has to start a word, in the name or the
 * key, or else in the text or a field's value. Found in the name alone is best, the whole of what
 * was typed best of all, then at its start; then found partly in the name and partly elsewhere;
 * then elsewhere only.
 */
export function search<T extends Findable>(index: SearchIndex<T>, query: string): Found<T>[] {
  const words = queryWords(query);
  if (words.length === 0) return [];
  const phrase = words.join(' ');
  const scored: { found: Found<T>; score: number }[] = [];
  for (const each of index.items) {
    const inName: string[] = [];
    const inText: string[] = [];
    let missing = false;
    for (const word of words) {
      if (hasWord(each.name, word) || hasWord(each.key, word)) inName.push(word);
      else if (hasWord(each.text, word) || each.fields.some((value) => hasWord(value, word))) inText.push(word);
      else {
        missing = true;
        break;
      }
    }
    if (missing) continue;
    let score: number;
    if (inText.length === 0) {
      score = 1000;
      if (each.name === phrase || each.key === phrase) score += 500;
      else if (each.name.startsWith(phrase) || each.key.startsWith(phrase)) score += 300;
      else if (each.name.includes(phrase)) score += 150;
      score += 40 * inName.filter((word) => wholeWord(each.name, word) || wholeWord(each.key, word)).length;
      // Of names as well found, the shorter is nearer to what was typed.
      score -= Math.min(each.name.length, 120) / 2;
    } else if (inName.length > 0) {
      score = 400 + 60 * inName.length;
    } else {
      score = 100;
      if (words.length > 1 && each.text.includes(phrase)) score += 60;
      score += 10 * inText.filter((word) => wholeWord(each.text, word)).length;
    }
    if (each.item.done) score -= 300;
    const found: Found<T> = {
      item: each.item,
      inName: spansOf(each.item.name, inName),
      inKey: spansOf(each.item.key ?? '', inName),
    };
    if (inText.length > 0) {
      const line = lineOf(each, inText);
      if (line) found.line = line;
    }
    scored.push({ found, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.found.item.name.localeCompare(b.found.item.name, undefined, { numeric: true, sensitivity: 'base' }))
    .map((each) => each.found);
}
