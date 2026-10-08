import { t } from '@scrawlnotes/i18n';
import { basename, dirname, type VaultFs } from './fs';
import { type Board, type Card, cardValues, isFinished } from './board';
import { type Condition, type Field, isComplete, matchesCondition, readCondition } from './collection';
import { addDays, type Priority, type Task } from './tasks';

/**
 * When the tasks a filter shows are due. Today, this week and the next 7 days take in what is
 * overdue too, as the Today view does.
 */
export type DueRule = 'any' | 'overdue' | 'today' | 'week' | 'next7' | 'none';

export const DUE_RULES: DueRule[] = ['any', 'overdue', 'today', 'week', 'next7', 'none'];

/** A saved view over every task list: the open tasks that match all of its choices. */
export interface TaskFilter {
  id: string;
  name: string;
  due: DueRule;
  /** The priorities shown, 4 being none; empty shows every one. */
  priorities: Priority[];
  /** The folders looked in, with the folders inside them, the inbox as `Inbox`; empty looks everywhere. */
  folders: string[];
  /** Text the title or the description has, in any case; empty for any. */
  text: string;
  /** Conditions on the boards' own fields, by key. They are about cards: with any, the filter shows no tasks. */
  fields?: Condition[];
}

/** What a filter picks, without its name and id. */
export type FilterChoices = Omit<TaskFilter, 'id' | 'name'>;

const FILE = '.scrawl/filters.json';

/** Reads the saved filters. Anything that is not a usable filter is left out. */
export function parseFilters(text: string): TaskFilter[] {
  let data: { filters?: unknown } | null;
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    return [];
  }
  if (!Array.isArray(data?.filters)) return [];
  const filters: TaskFilter[] = [];
  for (const raw of data.filters as Partial<TaskFilter>[]) {
    if (!raw || typeof raw.id !== 'string' || typeof raw.name !== 'string') continue;
    filters.push({
      // Unknown fields are kept, so a newer version's choices survive an older one saving.
      ...raw,
      id: raw.id,
      name: raw.name,
      due: DUE_RULES.includes(raw.due as DueRule) ? (raw.due as DueRule) : 'any',
      priorities: Array.isArray(raw.priorities) ? raw.priorities.filter((p): p is Priority => [1, 2, 3, 4].includes(p)) : [],
      folders: Array.isArray(raw.folders) ? raw.folders.filter((f): f is string => typeof f === 'string') : [],
      text: typeof raw.text === 'string' ? raw.text : '',
      fields: Array.isArray(raw.fields) ? raw.fields.map((c) => readCondition(c)).filter((c): c is Condition => c !== null) : undefined,
    });
    const filter = filters[filters.length - 1]!;
    if (!filter.fields?.length) delete filter.fields;
  }
  return filters;
}

export const serializeFilters = (filters: TaskFilter[]) => `${JSON.stringify({ version: 1, filters }, null, 2)}\n`;

/** The saved filters of a vault; none when there is no file yet. */
export async function loadFilters(fs: VaultFs): Promise<TaskFilter[]> {
  try {
    return parseFilters(await fs.readText(FILE));
  } catch {
    return [];
  }
}

export const saveFilters = (fs: VaultFs, filters: TaskFilter[]) => fs.writeText(FILE, serializeFilters(filters));

/** The last day of the week `today` is in. Weeks run from Monday to Sunday. */
export function endOfWeek(today: string): string {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  return addDays(today, (7 - new Date(y, m - 1, d).getDay()) % 7);
}

function dueMatches(rule: DueRule, due: string | null, today: string): boolean {
  switch (rule) {
    case 'any':
      return true;
    case 'none':
      return due === null;
    case 'overdue':
      return due !== null && due < today;
    case 'today':
      return due !== null && due <= today;
    case 'week':
      return due !== null && due <= endOfWeek(today);
    case 'next7':
      return due !== null && due <= addDays(today, 6);
  }
}

/** The conditions on boards' fields that ask anything: the ones with a value where they need one. */
const fieldConditions = (filter: FilterChoices) => (filter.fields ?? []).filter(isComplete);

/** Whether an open task of the list at `list` is one the filter shows; none is when the filter asks about boards' fields. */
export function matchesFilter(filter: FilterChoices, list: string, task: Task, today: string): boolean {
  if (fieldConditions(filter).length > 0) return false;
  if (task.done || !dueMatches(filter.due, task.due, today)) return false;
  if (filter.priorities.length > 0 && !filter.priorities.includes(task.priority)) return false;
  const folder = dirname(list);
  if (filter.folders.length > 0 && !filter.folders.some((f) => folder === f || folder.startsWith(`${f}/`))) return false;
  const text = filter.text.trim().toLowerCase();
  return !text || `${task.title}\n${task.description ?? ''}`.toLowerCase().includes(text);
}

const byDue = (a: Task, b: Task) =>
  (a.due ?? '￿').localeCompare(b.due ?? '￿') || a.priority - b.priority || a.order - b.order;

/**
 * The tasks a filter shows, by the list they are in, in the order the lists come. In each list
 * they go by due day, the undated last, then by priority.
 */
export function filterTasks(filter: FilterChoices, lists: Record<string, Task[]>, today: string): { list: string; tasks: Task[] }[] {
  return Object.entries(lists)
    .map(([list, tasks]) => ({ list, tasks: tasks.filter((task) => matchesFilter(filter, list, task, today)).sort(byDue) }))
    .filter((group) => group.tasks.length > 0);
}

/** Whether a card of the board at `board` is one the filter shows: not finished, and matching as a task would. */
export function matchesFilterCard(filter: FilterChoices, board: string, whole: Board, card: Card, today: string): boolean {
  if (isFinished(whole, card) || !dueMatches(filter.due, card.due, today)) return false;
  if (filter.priorities.length > 0 && !filter.priorities.includes(card.priority)) return false;
  const folder = dirname(board);
  if (filter.folders.length > 0 && !filter.folders.some((f) => folder === f || folder.startsWith(`${f}/`))) return false;
  const text = filter.text.trim().toLowerCase();
  if (text && !`${card.title}\n${card.description ?? ''}`.toLowerCase().includes(text)) return false;
  // A condition on a field the card's board does not have leaves the card out.
  const fields = whole.fields ?? [];
  const values = { values: cardValues(whole, card) };
  return fieldConditions(filter).every((c) => fields.some((f) => f.key === c.field) && matchesCondition(values, { fields }, c, today));
}

/** The fields the boards in a filter's folders have, by key, the first board's label and type for each: what its conditions can ask about. */
export function filterFields(filter: Pick<FilterChoices, 'folders'>, boards: Record<string, Board>): Field[] {
  const out = new Map<string, Field>();
  for (const [path, board] of Object.entries(boards)) {
    const folder = dirname(path);
    if (filter.folders.length > 0 && !filter.folders.some((f) => folder === f || folder.startsWith(`${f}/`))) continue;
    for (const field of board.fields ?? []) if (!out.has(field.key)) out.set(field.key, field);
  }
  return [...out.values()];
}

/** The cards a filter shows, by the board they are on; in each by due day, the undated last, then priority. */
export function filterCards(filter: FilterChoices, boards: Record<string, Board>, today: string): { board: string; cards: Card[] }[] {
  return Object.entries(boards)
    .map(([board, whole]) => ({
      board,
      cards: whole.cards
        .filter((card) => matchesFilterCard(filter, board, whole, card, today))
        .sort((a, b) => (a.due ?? '￿').localeCompare(b.due ?? '￿') || a.priority - b.priority || a.order - b.order),
    }))
    .filter((group) => group.cards.length > 0);
}

/** A name made of what a filter picks, for one left unnamed: `This week · p1`. */
export function filterName(filter: FilterChoices): string {
  const parts: string[] = [];
  if (filter.due !== 'any') parts.push(t(`filter.due.${filter.due}`));
  if (filter.priorities.length > 0) {
    parts.push([...filter.priorities].sort().map((p) => (p === 4 ? t('filter.noPriority') : `p${p}`)).join(', '));
  }
  if (filter.folders.length > 0) parts.push(filter.folders.map((f) => basename(f)).join(', '));
  if (filter.text.trim()) parts.push(`“${filter.text.trim()}”`);
  return parts.join(' · ') || t('filter.everything');
}
