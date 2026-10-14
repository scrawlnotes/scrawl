// Searching everywhere: anything found by its name or by its text, in one list, the best match
// first. A letter matches itself with or without its accent and in either case, so `şirket`
// finds `Sirket` and `cafe` finds `Café`; Turkish ı and İ are i. See PLAN.md 4.2.

/** What the search window finds: a note, a task, a card, a record, a file, or what holds them. */
export type FindKind = 'note' | 'task' | 'card' | 'record' | 'file' | 'tasks' | 'board' | 'collection' | 'keys' | 'filter' | 'folder' | 'space';

/** Something to be found: what it is called, a key it goes by, and its text. */
export interface Findable {
  kind: FindKind;
  name: string;
  /** A card's key or a record's code: found as its name is. */
  key?: string;
  /** A note's text; a task's description; a card's description, comments and fields; a record's fields and body. */
  text?: string;
  /** A task done, a card in a done column: lower in the list than one as well found that is not. */
  done?: boolean;
}

/** A part of a string, from where it starts to where it ends. */
export type Span = [number, number];

/** The line something was found in by its text. */
export interface FoundLine {
  /** The line as it reads, without its Markdown marks; cut short around the words when long. */
  text: string;
  /** Where the words are in `text`. */
  marks: Span[];
  /** Where the words are in the whole text of what was found, to show them there once it is open. */
  spans: Span[];
}

export interface Found<T extends Findable> {
  item: T;
  /** Where its name has the words. */
  inName: Span[];
  /** Where its key has them. */
  inKey: Span[];
  /** Set when some of the words were found in its text only. */
  line?: FoundLine;
}

interface Prepared<T extends Findable> {
  item: T;
  name: string;
  key: string;
  text: string;
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

/** Where the words are in a string, as spans of the string itself; overlapping ones joined. */
function spansOf(text: string, words: string[]): Span[] {
  if (words.length === 0) return [];
  const { folded, from } = foldMapped(text);
  const spans: Span[] = [];
  for (const word of words) {
    for (let i = folded.indexOf(word); i >= 0; i = folded.indexOf(word, i + word.length)) spans.push([from[i]!, from[i + word.length]!]);
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

const LETTER = /[\p{L}\p{N}]/u;
/** Whether the word starts a word somewhere in the folded string. */
const startsAWord = (folded: string, word: string) => {
  for (let i = folded.indexOf(word); i >= 0; i = folded.indexOf(word, i + 1)) if (i === 0 || !LETTER.test(folded[i - 1]!)) return true;
  return false;
};

export function searchIndex<T extends Findable>(items: T[]): SearchIndex<T> {
  return { items: items.map((item) => ({ item, name: fold(item.name), key: fold(item.key ?? ''), text: fold(item.text ?? '') })) };
}

/** The words of what was typed, folded; each once. */
export function queryWords(query: string): string[] {
  return [...new Set(fold(query).split(/\s+/).filter(Boolean))];
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

/** The line of a text that has the most of the words, the first such; as it reads, with the words marked. */
function lineOf(text: string, foldedText: string, words: string[]): FoundLine | undefined {
  const folded = foldedText.split('\n');
  let best = -1;
  let most = 0;
  for (let i = 0; i < folded.length; i++) {
    const count = words.filter((word) => folded[i]!.includes(word)).length;
    if (count > most) {
      most = count;
      best = i;
    }
  }
  if (best < 0) return undefined;
  const lines = text.split('\n');
  const line = lines[best] ?? '';
  let start = 0;
  for (let i = 0; i < best; i++) start += lines[i]!.length + 1;
  const found = spansOf(line, words);
  if (found.length === 0) return undefined;
  const plain = plainLine(line);
  // Marks follow the characters kept; a word whose characters all went (inside a link's address) is not marked.
  const at = (i: number) => {
    for (let j = i; j < plain.to.length; j++) if (plain.to[j]! >= 0) return plain.to[j]!;
    return plain.text.length;
  };
  const shownFound = found.filter(([from, to]) => at(to) > at(from));
  if (shownFound.length === 0) return undefined;
  let marks = shownFound.map(([from, to]): Span => [at(from), at(to)]);
  let shown = plain.text;
  // A long line shows the words: it is cut before them at a space, and after.
  const first = marks[0]?.[0] ?? 0;
  if (first > BEFORE) {
    const space = shown.lastIndexOf(' ', first - BEFORE / 2);
    const cut = space > 0 ? space + 1 : first - BEFORE / 2;
    shown = `…${shown.slice(cut)}`;
    marks = marks.map(([from, to]): Span => [from - cut + 1, to - cut + 1]);
  }
  if (shown.length > LONGEST) {
    shown = `${shown.slice(0, LONGEST).trimEnd()}…`;
    marks = marks.filter(([from]) => from < LONGEST).map(([from, to]): Span => [from, Math.min(to, LONGEST)]);
  }
  return { text: shown, marks, spans: shownFound.map(([from, to]): Span => [start + from, start + to]) };
}

/**
 * What matches what was typed, the best first. Every word has to be found, in the name or the key
 * or else in the text. Found in the name alone is best, the whole of what was typed best of all,
 * then at its start; then found partly in the name and partly in the text; then in the text.
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
      if (each.name.includes(word) || each.key.includes(word)) inName.push(word);
      else if (each.text.includes(word)) inText.push(word);
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
      score += 40 * inName.filter((word) => startsAWord(each.name, word) || startsAWord(each.key, word)).length;
      // Of names as well found, the shorter is nearer to what was typed.
      score -= Math.min(each.name.length, 120) / 2;
    } else if (inName.length > 0) {
      score = 400 + 60 * inName.length;
    } else {
      score = 100;
      if (words.length > 1 && each.text.includes(phrase)) score += 60;
      score += 10 * inText.filter((word) => startsAWord(each.text, word)).length;
    }
    if (each.item.done) score -= 300;
    const found: Found<T> = {
      item: each.item,
      inName: spansOf(each.item.name, inName),
      inKey: spansOf(each.item.key ?? '', inName),
    };
    if (inText.length > 0) {
      const line = lineOf(each.item.text ?? '', each.text, inText);
      if (line) found.line = line;
    }
    scored.push({ found, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.found.item.name.localeCompare(b.found.item.name, undefined, { numeric: true, sensitivity: 'base' }))
    .map((each) => each.found);
}
