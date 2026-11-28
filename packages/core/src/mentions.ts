import { isObject, type WorkedOn } from './activity';
import type { Board } from './board';
import type { PersonRef } from './people';
import { mentionsOf, plainText } from './sync/chat';
import type { Task } from './tasks';

// Mentions (design/mentions.html): every place someone wrote @Name of a person in a card's comment
// or description, or in a task's description, read from the files as they are, so what was written
// before it was there counts too. Which of them the person has seen is kept in a file of theirs in
// each space, `.scrawl/seen/<id>.json`, synced, so that one seen on a device is seen on all.

/** Where the seen mentions of a person are kept in a space. */
export const SEEN_DIR = '.scrawl/seen';
export const seenPath = (person: string) => `${SEEN_DIR}/${encodeURIComponent(person)}.json`;

/** The mentions a person has seen, by key, with when. */
export type SeenMentions = Record<string, string>;

/** Someone a mention was written by: the id the file has them under, and the name. */
export interface MentionBy {
  id?: string;
  name?: string;
}

/** One place a person is mentioned. */
export interface Mention {
  /** What tells it from every other: the item, and the comment or the description's line. */
  key: string;
  item: { kind: 'card' | 'task'; id: string; title: string; key?: string };
  /** In a comment, by its id, or in the description. */
  in: { comment: string } | 'description';
  by: MentionBy;
  /** When it was written: a comment's time; for a description, when the card or the task was last changed. */
  at: string;
  /** The words of the comment, or of the description's line, plain. */
  text: string;
}

const short = (text: string) => {
  const words = plainText(text);
  return words.length > 200 ? `${words.slice(0, 199)}…` : words;
};

/** A short, steady name for a line: the same line has the same one on every device. */
function lineKey(line: string): string {
  let hash = 5381;
  for (let i = 0; i < line.length; i++) hash = (Math.imul(hash, 33) ^ line.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

/** Who last changed it other than `me`, else who made it: who wrote a mention in a description, as far as the file tells. */
function writerOf(item: { workedOn?: WorkedOn[]; author?: PersonRef | null }, me: string): MentionBy {
  const worker = [...(item.workedOn ?? [])].filter((w) => w.id !== me).sort((a, b) => b.at.localeCompare(a.at))[0];
  if (worker) return { ...(worker.id && { id: worker.id }), ...(worker.name && { name: worker.name }) };
  const author = item.author;
  return author && author.id !== me ? { ...(author.id && { id: author.id }), ...(author.name && { name: author.name }) } : {};
}

/** The lines of a description that mention `me`, each a mention. */
function inDescription(description: string | undefined, me: string, item: Mention['item'], by: MentionBy, at: string): Mention[] {
  if (!description) return [];
  return description
    .split('\n')
    .filter((line) => mentionsOf(line).includes(me))
    .map((line) => ({ key: `${item.id}:d:${lineKey(line)}`, item, in: 'description' as const, by, at, text: short(line) }));
}

/** Where `me` is mentioned on a board's cards: their comments, and their descriptions. What `me` wrote is not among them. */
export function cardMentions(board: Board, me: string): Mention[] {
  const out: Mention[] = [];
  for (const card of board.cards) {
    const item = { kind: 'card' as const, id: card.id, title: card.title, key: `${board.prefix}-${card.key}` };
    for (const entry of card.timeline) {
      if (entry.kind !== 'comment' || entry.byId === me || !mentionsOf(entry.text).includes(me)) continue;
      out.push({ key: `${card.id}:c:${entry.id}`, item, in: { comment: entry.id }, by: { ...(entry.byId && { id: entry.byId }), ...(entry.by && { name: entry.by }) }, at: entry.edited ?? entry.at, text: short(entry.text) });
    }
    out.push(...inDescription(card.description, me, item, writerOf(card, me), card.updated));
  }
  return out;
}

/** Where `me` is mentioned in a list's tasks: their descriptions. */
export function taskMentions(tasks: readonly Task[], me: string): Mention[] {
  return tasks.flatMap((task) => inDescription(task.description, me, { kind: 'task', id: task.id, title: task.title }, writerOf(task, me), task.updated));
}

/** A person's seen file as it is written; one that cannot be read is nothing seen. */
export function parseSeen(text: string): SeenMentions {
  try {
    const data: unknown = JSON.parse(text);
    const seen = isObject(data) && isObject(data.seen) ? data.seen : {};
    return Object.fromEntries(Object.entries(seen).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  } catch {
    return {};
  }
}

export const serializeSeen = (seen: SeenMentions) => `${JSON.stringify({ version: 1, seen }, null, 2)}\n`;

/** Two devices' seen files together: what either has seen, at the later time. */
export function mergeSeen(_base: string, local: string, remote: string): string {
  const out: SeenMentions = { ...parseSeen(remote) };
  for (const [key, at] of Object.entries(parseSeen(local))) if (!out[key] || out[key]! < at) out[key] = at;
  return serializeSeen(Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b))));
}

/** The seen mentions with those of `mentions` added, seen `at`; the same object when all were seen already. */
export function withSeen(seen: SeenMentions, mentions: readonly Mention[], at: string): SeenMentions {
  const fresh = mentions.filter((m) => !seen[m.key]);
  return fresh.length === 0 ? seen : { ...seen, ...Object.fromEntries(fresh.map((m) => [m.key, at])) };
}
