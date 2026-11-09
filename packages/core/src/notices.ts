import { BOARD_EXT, type Board, isFinished, parseBoard, type TimelineEntry } from './board';
import { lastReminded, REMIND_EVERY_MS, type WorkedOn } from './activity';
import { isAgentId, isMyWork, ownerOf, type PersonRef } from './people';
import { itemLink, mentionsOf, plainText } from './sync/chat';
import { parseList, TASK_LIST_EXT, type Task, type TaskEntry } from './tasks';

// What a change to a board or a task list tells people (design/notifications.md): someone was
// mentioned in a card's comment or description, or a task's description; a card or a task was
// given to someone; someone was reminded of one given to them. The server sees the file before and after a write and tells those it names;
// the change is read from the files alone, so the app, an agent and an older device all count.
// Who did it comes from what the file says of it: a comment's or a giving's stamp, else the last
// one who worked on it, else whoever wrote the file. No one is told of what they did themselves.

/** Someone, by the id the file has them under, with the name it has. */
export interface NoticeBy {
  id?: string;
  name?: string;
}

/** One thing that tells one person. */
export interface Notice {
  kind: 'mention' | 'assign' | 'remind';
  /** The person told, by the id of their `me.json`; on a server, their account. */
  to: string;
  by: NoticeBy;
  item: { kind: 'card' | 'task'; id: string; title: string; key?: string; due?: string | null };
  /** Where a mention was: in a comment, by its id, or in the description. */
  in?: { comment: string } | 'description';
  /** A comment's words, plain: what a notification of a mention in it says under its title. */
  text?: string;
  /** Where someone was mentioned, as written: the comment or the description; what an agent woken by it is shown (design/agent-wake.md 6.4). */
  said?: string;
  /** What a click opens: the card or the task, at the comment. */
  href: string;
}

/** What a person on a server is told of (design/notifications.md 7): all of it until they turn some off. */
export interface NotifyChoices {
  mentions: boolean;
  assignments: boolean;
  reminders: boolean;
  /** The morning's notification. */
  due: boolean;
}

export const NOTIFY_CHOICES = ['mentions', 'assignments', 'reminders', 'due'] as const satisfies readonly (keyof NotifyChoices)[];

/** The choice each kind of notice follows. */
export const CHOICE_OF: Record<Notice['kind'], keyof NotifyChoices> = { mention: 'mentions', assign: 'assignments', remind: 'reminders' };

/** Whether a path's file is one whose changes can tell someone: a board or a task list. */
export const tellsPeople = (path: string) => path.endsWith(BOARD_EXT) || path.endsWith(TASK_LIST_EXT);

/** The one who worked on it last, from `workedOn`. */
function lastWorker(workedOn: WorkedOn[] | undefined): NoticeBy | null {
  const last = [...(workedOn ?? [])].sort((a, b) => b.at.localeCompare(a.at))[0];
  return last && (last.id || last.name) ? { ...(last.id && { id: last.id }), ...(last.name && { name: last.name }) } : null;
}

const stampBy = (stamp: { by?: string; byId?: string }): NoticeBy | null => (stamp.byId || stamp.by ? { ...(stamp.byId && { id: stamp.byId }), ...(stamp.by && { name: stamp.by }) } : null);

/** Who a card or a task was given to now and not before; null when that did not change or is no one. */
function newlyGiven(before: PersonRef | null | undefined, after: PersonRef | null | undefined): string | null {
  return after?.id && after.id !== before?.id ? after.id : null;
}

/**
 * The reminders new on a timeline, each telling the one reminded; one within an hour of the same
 * person's last to the same, written by hand, tells no one.
 */
function newReminders(before: readonly (TimelineEntry | TaskEntry)[] | undefined, after: readonly (TimelineEntry | TaskEntry)[] | undefined) {
  const had = new Set((before ?? []).map((entry) => entry.id));
  return (after ?? []).flatMap((entry) => {
    if (entry.kind !== 'remind' || had.has(entry.id)) return [];
    const remind = entry;
    if (!remind.to.id) return [];
    const last = lastReminded(before, remind.byId, remind.to.id);
    if (last && Date.parse(remind.at) - Date.parse(last) < REMIND_EVERY_MS) return [];
    return [{ to: remind.to.id, by: stampBy(remind) }];
  });
}

/** Those mentioned in `after` and not in `before`. */
const newMentions = (before: string | undefined, after: string | undefined) => {
  const had = new Set(mentionsOf(before ?? ''));
  return mentionsOf(after ?? '').filter((id) => !had.has(id));
};

function readable(text: string): boolean {
  try {
    const data: unknown = JSON.parse(text);
    return typeof data === 'object' && data !== null && !Array.isArray(data);
  } catch {
    return false;
  }
}

const short = (text: string) => {
  const words = plainText(text);
  return words.length > 140 ? `${words.slice(0, 139)}…` : words;
};

/**
 * What a write of a board or a task list tells people: `before` and `after` its text, `space`
 * the space's id, `path` the file's path in it, `writer` whoever wrote it. A file new to the
 * place tells no one: what it holds was done somewhere else already.
 */
export function noticesFrom(input: { space: string; path: string; before: string | null; after: string; writer: NoticeBy }): Notice[] {
  // One that cannot be read is no before: everything in it would look new.
  if (input.before === null || !readable(input.before) || !readable(input.after)) return [];
  const found = input.path.endsWith(BOARD_EXT) ? boardNotices(input) : input.path.endsWith(TASK_LIST_EXT) ? taskNotices(input) : [];
  const seen = new Set<string>();
  return found.filter((notice) => {
    // Nobody is told of what they did themselves.
    if (notice.by.id && notice.by.id === notice.to) return false;
    const key = `${notice.kind}\n${notice.to}\n${notice.item.id}\n${typeof notice.in === 'object' ? notice.in.comment : (notice.in ?? '')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function boardNotices(input: { space: string; path: string; before: string | null; after: string; writer: NoticeBy }): Notice[] {
  let was: Board;
  let now: Board;
  try {
    was = parseBoard(input.before!);
    now = parseBoard(input.after);
  } catch {
    return [];
  }
  const out: Notice[] = [];
  const before = new Map(was.cards.map((card) => [card.id, card]));
  for (const card of now.cards) {
    const old = before.get(card.id);
    const item = { kind: 'card' as const, id: card.id, title: card.title, key: `${now.prefix}-${card.key}`, due: card.due };
    const href = (comment?: string) => itemLink({ kind: 'card', space: input.space, path: input.path, id: card.id, ...(comment && { comment }) });
    const worker = lastWorker(card.workedOn) ?? input.writer;
    const given = newlyGiven(old?.assignee, card.assignee);
    if (given) {
      const entry = [...card.timeline].reverse().find((each) => each.kind === 'assign' && each.given?.id === given);
      out.push({ kind: 'assign', to: given, by: (entry && stampBy(entry)) ?? worker, item, href: href() });
    }
    const oldComments = new Map((old?.timeline ?? []).flatMap((each) => (each.kind === 'comment' ? [[each.id, each.text] as const] : [])));
    for (const entry of card.timeline) {
      if (entry.kind !== 'comment') continue;
      for (const to of newMentions(oldComments.get(entry.id), entry.text)) {
        out.push({ kind: 'mention', to, by: stampBy(entry) ?? worker, item, in: { comment: entry.id }, text: short(entry.text), said: entry.text, href: href(entry.id) });
      }
    }
    for (const to of newMentions(old?.description, card.description)) out.push({ kind: 'mention', to, by: worker, item, in: 'description', said: card.description, href: href() });
    for (const { to, by } of newReminders(old?.timeline, card.timeline)) out.push({ kind: 'remind', to, by: by ?? worker, item, href: href() });
  }
  return out;
}

function taskNotices(input: { space: string; path: string; before: string | null; after: string; writer: NoticeBy }): Notice[] {
  const before = new Map<string, Task>(parseList(input.before!).tasks.map((task) => [task.id, task]));
  const out: Notice[] = [];
  for (const task of parseList(input.after).tasks) {
    const old = before.get(task.id);
    const item = { kind: 'task' as const, id: task.id, title: task.title, due: task.due };
    const href = itemLink({ kind: 'task', space: input.space, path: input.path, id: task.id });
    const worker = lastWorker(task.workedOn) ?? input.writer;
    const given = newlyGiven(old?.assignee, task.assignee);
    if (given) {
      const entry = [...(task.timeline ?? [])].reverse().find((each) => each.kind === 'assign' && each.given?.id === given);
      out.push({ kind: 'assign', to: given, by: (entry && stampBy(entry)) ?? worker, item, href });
    }
    for (const to of newMentions(old?.description, task.description)) out.push({ kind: 'mention', to, by: worker, item, in: 'description', said: task.description, href });
    for (const { to, by } of newReminders(old?.timeline, task.timeline)) out.push({ kind: 'remind', to, by: by ?? worker, item, href });
  }
  return out;
}

/**
 * What a notification of a notice says (design/notifications.md 2 and 3): who did what to which,
 * and under it a comment's words, else the card's title, else where the task is (`where`). A
 * person goes by their first name, as `nameOf` has it now; an agent by its name and whose it is:
 * "Claude Code (Laptop) · Kaan".
 */
export function noticeWords(notice: Notice, where: string, nameOf: (id: string) => string | undefined = () => undefined): { title: string; body: string } {
  const first = (name: string | undefined) => name?.trim().split(/\s+/)[0];
  const by = notice.by.id;
  // An agent's stamp has whose it is after its name already ("Claude Code · Kaan Arslan"): its own part only.
  const who = by && isAgentId(by)
    ? [notice.by.name?.split(' · ')[0]?.trim() || 'An agent', first(nameOf(ownerOf(by)))].filter(Boolean).join(' · ')
    : first((by && nameOf(by)) || notice.by.name) || 'Someone';
  const which = notice.item.key ?? notice.item.title;
  const title = notice.kind === 'assign' ? `${who} assigned you ${which}` : notice.kind === 'remind' ? `${who} reminded you about ${which}` : `${who} mentioned you on ${which}`;
  const body = notice.text || (notice.item.key ? notice.item.title : where);
  // A reminder says when it is due as well.
  if (notice.kind === 'remind' && notice.item.due) return { title, body: `${body} · Due ${new Date(`${notice.item.due}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}` };
  return { title, body };
}

// ---------- the morning's due work ----------

/** A piece of work due, as the morning's notification names it: a card by its key, a task by its name. */
export interface DueWork {
  name: string;
  due: string;
}

/**
 * The work of the person `me` in a board or a task list that is due on one of `days` and not
 * finished (design/notifications.md 5): Today's rule, given to them or to an agent of theirs, or
 * given to no one and made by them. A file that cannot be read has none.
 */
export function dueWorkIn(path: string, text: string, me: string, days: string[]): DueWork[] {
  if (!readable(text)) return [];
  const on = new Set(days);
  if (path.endsWith(BOARD_EXT)) {
    const board = parseBoard(text);
    return board.cards
      .filter((card) => card.due && on.has(card.due) && !isFinished(board, card) && isMyWork(card, me))
      .map((card) => ({ name: `${board.prefix}-${card.key}`, due: card.due! }));
  }
  if (path.endsWith(TASK_LIST_EXT)) {
    return parseList(text)
      .tasks.filter((task) => task.due && on.has(task.due) && !task.done && isMyWork(task, me))
      .map((task) => ({ name: task.title, due: task.due! }));
  }
  return [];
}

/** What the morning's notification says: "2 due today, 1 due tomorrow", and the first of them by name; null when nothing is due. */
export function dueWords(work: DueWork[], today: string): { title: string; body: string } | null {
  if (!work.length) return null;
  const now = work.filter((each) => each.due === today);
  const later = work.filter((each) => each.due !== today);
  const title = [now.length && `${now.length} due today`, later.length && `${later.length} due tomorrow`].filter(Boolean).join(', ');
  const names = [...now, ...later].map((each) => each.name);
  const body = names.length <= 3 ? names.join(', ').replace(/, ([^,]*)$/, ' and $1') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
  return { title, body };
}
