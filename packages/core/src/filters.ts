import { t } from '@scrawlnotes/i18n';
import { basename, dirname, type VaultFs } from './fs';
import { type Board, type Card, cardValues, isFinished } from './board';
import { type Condition, type Field, isComplete, matchesCondition, readCondition } from './collection';
import { sameLabel } from './labels';
import { isMine, type PersonRef } from './people';
import { spaceOf } from './spaces';
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
  /** The folders looked in, with the folders inside them; `''` is the whole personal space, a space's top the whole space. Empty looks everywhere. */
  folders: string[];
  /** Text the title or the description has, in any case; empty for any. */
  text: string;
  /** The labels shown, any one of them, whatever their case; none or empty shows every task and card. */
  labels?: string[];
  /** Who what is shown is given to, any one of them: a person's or an agent's id, or one of `GIVEN`. None or empty takes anyone and no one. */
  assignees?: string[];
  /** Only what is given to the user: in spaces with people, by the id of their `me.json`. `assignees` asks it too; an older filter has only this. */
  mine?: true;
  /** Conditions on the boards' own fields, by key. They are about cards: with any, the filter shows no tasks. */
  fields?: Condition[];
  /** The folder it sits in, in the sidebar; none for the top of the personal space. Not what it looks in: that is `folders`. */
  folder?: string;
}

/** What a filter picks, without its name, its id and where it sits. */
export type FilterChoices = Omit<TaskFilter, 'id' | 'name' | 'folder'>;

/** What filtering a list or a board where it is picks: a filter's choices without the folders, which are where it is. */
export type PlaceChoices = Omit<FilterChoices, 'folders'>;

/** Choices that ask nothing: a list or a board filtered by them shows all it has. */
export const NO_CHOICES: PlaceChoices = { due: 'any', priorities: [], text: '' };

/** Who a task or a card is given to, as a filter asks it besides a person's or an agent's id. */
export const GIVEN = { me: 'me', others: 'others', nobody: 'none' } as const;

const FILE = '.scrawl/filters.json';

/** The words of a list, without what is not a word or is only spaces; none when nothing is left. */
function words(raw: unknown): string[] | undefined {
  const kept = Array.isArray(raw) ? raw.filter((each): each is string => typeof each === 'string' && each.trim() !== '') : [];
  return kept.length > 0 ? kept : undefined;
}

/** What a filter or a list's filtering picks, as a file has it: what is not one of the choices is read as asking nothing. */
export function readChoices(raw: unknown): PlaceChoices {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Partial<FilterChoices>;
  const labels = words(data.labels);
  const assignees = words(data.assignees);
  const fields = Array.isArray(data.fields) ? data.fields.map((c) => readCondition(c)).filter((c): c is Condition => c !== null) : [];
  return {
    due: DUE_RULES.includes(data.due as DueRule) ? (data.due as DueRule) : 'any',
    priorities: Array.isArray(data.priorities) ? data.priorities.filter((p): p is Priority => [1, 2, 3, 4].includes(p)) : [],
    text: typeof data.text === 'string' ? data.text : '',
    ...(labels && { labels }),
    ...(assignees && { assignees }),
    ...(data.mine === true && { mine: true }),
    ...(fields.length > 0 && { fields }),
  };
}

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
    // Unknown fields are kept, so a newer version's choices survive an older one saving.
    const { labels: _labels, assignees: _assignees, mine: _mine, fields: _fields, ...rest } = raw;
    filters.push({
      ...rest,
      id: raw.id,
      name: raw.name,
      ...readChoices(raw),
      folders: Array.isArray(raw.folders) ? raw.folders.filter((f): f is string => typeof f === 'string') : [],
      folder: typeof raw.folder === 'string' ? raw.folder : undefined,
    });
    const filter = filters[filters.length - 1]!;
    if (!filter.folder) delete filter.folder;
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

/**
 * The ready filters a person starts with (design/filters.md 4.3), as Todoist's: ordinary filters,
 * changed, renamed and deleted as any. Each has its own id, so that two devices writing them before
 * they meet keep one of each.
 */
export function presetFilters(): TaskFilter[] {
  const base = { due: 'any' as DueRule, priorities: [] as Priority[], folders: [] as string[], text: '' };
  return [
    { ...base, id: 'p1', name: t('filter.preset.p1'), priorities: [1] },
    { ...base, id: 'p2', name: t('filter.preset.p2'), priorities: [2] },
    { ...base, id: 'p3', name: t('filter.preset.p3'), priorities: [3] },
    { ...base, id: 'given-me', name: t('filter.preset.givenMe'), assignees: [GIVEN.me] },
    { ...base, id: 'given-others', name: t('filter.preset.givenOthers'), assignees: [GIVEN.others] },
    { ...base, id: 'no-date', name: t('filter.preset.noDate'), due: 'none' },
  ];
}

/** Writes the ready filters where there is no filters file yet, and returns them; null when there is one. */
export async function writePresetFilters(fs: VaultFs): Promise<TaskFilter[] | null> {
  try {
    await fs.readText(FILE);
    return null;
  } catch {
    const presets = presetFilters();
    await saveFilters(fs, presets);
    return presets;
  }
}

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
const fieldConditions = (filter: Pick<FilterChoices, 'fields'>) => (filter.fields ?? []).filter(isComplete);

/** Who the choices take, as given to; an older filter's `mine` is the user. */
export const assigneesOf = (choices: Pick<FilterChoices, 'assignees' | 'mine'>): string[] =>
  choices.assignees?.length ? choices.assignees : choices.mine ? [GIVEN.me] : [];

/** Whether choices ask anything: with none, a list or a board filtered by them shows all it has. */
export const asksAnything = (choices: PlaceChoices) =>
  choices.due !== 'any' ||
  choices.priorities.length > 0 ||
  choices.text.trim() !== '' ||
  !!choices.labels?.length ||
  assigneesOf(choices).length > 0 ||
  fieldConditions(choices).length > 0;

/** Whether something given to `ref` is given to one of `asked`; asking no one takes everything. */
function givenMatches(asked: string[], ref: PersonRef | null | undefined, me: string | undefined): boolean {
  if (asked.length === 0) return true;
  const given = !!(ref?.id || ref?.name);
  return asked.some((who) =>
    who === GIVEN.nobody ? !given : who === GIVEN.me ? isMine(ref, me) : who === GIVEN.others ? given && !isMine(ref, me) : ref?.id === who,
  );
}

/** Whether something with these labels has one of `asked`, whatever their case; asking none takes everything. */
const labelsMatch = (asked: string[] | undefined, labels: string[] | undefined) =>
  !asked?.length || asked.some((name) => (labels ?? []).some((label) => sameLabel(label, name)));

/** Whether anything is chosen, a condition still without its value too: what a list's or a board's look keeps while it is picked. */
export const choosesAnything = (choices: PlaceChoices) => asksAnything(choices) || !!choices.fields?.length;

/** Whether a title or its description has the text, in any case; no text takes everything. */
function textMatches(text: string, item: { title: string; description?: string }): boolean {
  const asked = text.trim().toLowerCase();
  return !asked || `${item.title}\n${item.description ?? ''}`.toLowerCase().includes(asked);
}

/** Whether something in `folder` is in one of the folders a filter looks in; `''` takes the whole personal space. */
function inFolders(folders: string[], folder: string): boolean {
  return folders.length === 0 || folders.some((f) => (f === '' ? spaceOf(folder) === null : folder === f || folder.startsWith(`${f}/`)));
}

/**
 * Whether a task, done or not, is one the choices take, wherever it is: what a list filtered
 * where it is shows. Conditions on boards' fields are about cards and take no task. `me` is the
 * user's id, for what is given to them.
 */
export function taskMatches(choices: PlaceChoices, task: Task, today: string, me?: string): boolean {
  if (fieldConditions(choices).length > 0 || !dueMatches(choices.due, task.due, today)) return false;
  if (choices.priorities.length > 0 && !choices.priorities.includes(task.priority)) return false;
  return labelsMatch(choices.labels, task.labels) && givenMatches(assigneesOf(choices), task.assignee, me) && textMatches(choices.text, task);
}

/**
 * What a filtered list shows of its tasks: those that match, true, and the tasks above them, false,
 * which keep them where they are; a task in neither is not shown. A subtask that does not match
 * is not shown under one that does.
 */
export function taskPicks(tasks: Task[], matches: (task: Task) => boolean): Map<string, boolean> {
  const children = new Map<string, Task[]>();
  for (const task of tasks) if (task.parent) children.set(task.parent, [...(children.get(task.parent) ?? []), task]);
  const picks = new Map<string, boolean>();
  const visit = (task: Task): boolean => {
    const own = matches(task);
    // Every subtask is looked at, so that each one's own answer is kept.
    const below = (children.get(task.id) ?? []).map(visit).some(Boolean);
    if (own || below) picks.set(task.id, own);
    return own || below;
  };
  for (const task of tasks) if (!task.parent || !tasks.some((each) => each.id === task.parent)) visit(task);
  return picks;
}

/**
 * Whether an open task of the list at `list` is one the filter shows; none is when the filter
 * asks about boards' fields. `me` is the user's id, for a filter of what is given to them.
 */
export function matchesFilter(filter: FilterChoices, list: string, task: Task, today: string, me?: string): boolean {
  return !task.done && inFolders(filter.folders, dirname(list)) && taskMatches(filter, task, today, me);
}

const byDue = (a: Task, b: Task) =>
  (a.due ?? '￿').localeCompare(b.due ?? '￿') || a.priority - b.priority || a.order - b.order;

/**
 * The tasks a filter shows, by the list they are in, in the order the lists come. In each list
 * they go by due day, the undated last, then by priority.
 */
export function filterTasks(filter: FilterChoices, lists: Record<string, Task[]>, today: string, me?: string): { list: string; tasks: Task[] }[] {
  return Object.entries(lists)
    .map(([list, tasks]) => ({ list, tasks: tasks.filter((task) => matchesFilter(filter, list, task, today, me)).sort(byDue) }))
    .filter((group) => group.tasks.length > 0);
}

/**
 * Whether a card of `whole`, finished or not, is one the choices take, as a task would be, and by
 * the board's own fields: what a board filtered where it is shows.
 */
export function cardMatches(choices: PlaceChoices, whole: Board, card: Card, today: string, me?: string): boolean {
  if (!dueMatches(choices.due, card.due, today)) return false;
  if (!givenMatches(assigneesOf(choices), card.assignee, me)) return false;
  if (choices.priorities.length > 0 && !choices.priorities.includes(card.priority)) return false;
  if (!labelsMatch(choices.labels, card.labels) || !textMatches(choices.text, card)) return false;
  // A condition on a field the card's board does not have leaves the card out.
  const fields = whole.fields ?? [];
  const values = { values: cardValues(whole, card) };
  return fieldConditions(choices).every((c) => fields.some((f) => f.key === c.field) && matchesCondition(values, { fields }, c, today));
}

/** Whether a card of the board at `board` is one the filter shows: not finished, and matching as a task would. */
export function matchesFilterCard(filter: FilterChoices, board: string, whole: Board, card: Card, today: string, me?: string): boolean {
  return !isFinished(whole, card) && inFolders(filter.folders, dirname(board)) && cardMatches(filter, whole, card, today, me);
}

/** The fields the boards in a filter's folders have, by key, the first board's label and type for each: what its conditions can ask about. */
export function filterFields(filter: Pick<FilterChoices, 'folders'>, boards: Record<string, Board>): Field[] {
  const out = new Map<string, Field>();
  for (const [path, board] of Object.entries(boards)) {
    const folder = dirname(path);
    if (!inFolders(filter.folders, folder)) continue;
    for (const field of board.fields ?? []) if (!out.has(field.key)) out.set(field.key, field);
  }
  return [...out.values()];
}

/** The cards a filter shows, by the board they are on; in each by due day, the undated last, then priority. */
export function filterCards(filter: FilterChoices, boards: Record<string, Board>, today: string, me?: string): { board: string; cards: Card[] }[] {
  return Object.entries(boards)
    .map(([board, whole]) => ({
      board,
      cards: whole.cards
        .filter((card) => matchesFilterCard(filter, board, whole, card, today, me))
        .sort((a, b) => (a.due ?? '￿').localeCompare(b.due ?? '￿') || a.priority - b.priority || a.order - b.order),
    }))
    .filter((group) => group.cards.length > 0);
}

/**
 * A name made of what a filter picks, for one left unnamed: `bug · Scrawl`, `This week · p1`.
 * `folderName` words a folder it looks in, `personName` a person or an agent it is given to.
 */
export function filterName(filter: FilterChoices, folderName: (folder: string) => string = basename, personName: (id: string) => string = (id) => id): string {
  const parts: string[] = [];
  if (filter.labels?.length) parts.push(filter.labels.join(', '));
  if (filter.due !== 'any') parts.push(t(`filter.due.${filter.due}`));
  if (filter.priorities.length > 0) {
    parts.push([...filter.priorities].sort().map((p) => (p === 4 ? t('filter.noPriority') : `p${p}`)).join(', '));
  }
  const who = assigneesOf(filter).map((id) => (id === GIVEN.me ? t('filter.mine') : id === GIVEN.others ? t('filter.others') : id === GIVEN.nobody ? t('people.nobody') : personName(id)));
  if (who.length > 0) parts.push(who.join(', '));
  if (filter.folders.length > 0) parts.push(filter.folders.map((f) => folderName(f)).join(', '));
  if (filter.text.trim()) parts.push(`“${filter.text.trim()}”`);
  return parts.join(' · ') || t('filter.everything');
}
