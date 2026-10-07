import { basename, dirname, INBOX_TASKS, listName, TASK_LIST_EXT, type TaskFilter } from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import type { IconName } from './Icon';

// A tab holds a note (its vault path) or a view. View ids contain `:`, which no path can.
export const TODAY = 'view:today';
export const UPCOMING = 'view:upcoming';
export const TRASH = 'view:trash';
const TASKS = 'tasks:';
const BOARD = 'board:';
const FILTER = 'filter:';

/** The tab of a saved filter, by its id. */
export const filterTab = (id: string) => `${FILTER}${id}`;
/** The id of the filter a tab shows, or null for any other tab. */
export const filterOf = (tab: string) => (tab.startsWith(FILTER) ? tab.slice(FILTER.length) : null);

/** The tab of a task list, by the path of its file. */
export const tasksOf = (list: string) => `${TASKS}${list}`;
export const boardOf = (folder: string) => `${BOARD}${folder}`;
export const isNote = (id: string) => !id.includes(':');
/** The file of a task list tab, or null for any other tab. */
export const listOf = (id: string) => (id.startsWith(TASKS) ? id.slice(TASKS.length) : null);
export const isTaskListPath = (path: string) => path.endsWith(TASK_LIST_EXT) || path === INBOX_TASKS;
/** The tab that shows the note or task list at `path`. */
export const tabOf = (path: string) => (isTaskListPath(path) ? tasksOf(path) : path);

/** The folder a tab's note, task list or board is in; null for the views over all folders. */
export function folderOf(id: string): string | null {
  if (isNote(id)) return dirname(id);
  const list = listOf(id);
  if (list !== null) return dirname(list);
  return id.startsWith(BOARD) ? id.slice(BOARD.length) : null;
}

/** A task list's name and, apart from it, the folder it is in. */
export function listLabel(list: string): string {
  const folder = basename(dirname(list));
  return folder ? t('tab.list', { list: listName(list), folder }) : listName(list);
}

export function iconOf(id: string): IconName {
  if (id === TRASH) return 'trash';
  if (id.startsWith(FILTER)) return 'filter';
  return isNote(id) ? 'note' : id.startsWith(BOARD) ? 'board' : 'tasks';
}

export function labelOf(id: string, titles: Record<string, string>, filters: TaskFilter[] = []): string {
  if (id === TODAY) return t('side.today');
  const filter = filterOf(id);
  if (filter !== null) return filters.find((f) => f.id === filter)?.name ?? t('filter.title');
  if (id === UPCOMING) return t('side.upcoming');
  if (id === TRASH) return t('side.trash');
  const list = listOf(id);
  if (list !== null) return listLabel(list);
  if (id.startsWith(BOARD)) return t('tab.board', { folder: basename(id.slice(BOARD.length)) });
  return titles[id] ?? t('note.untitled');
}
