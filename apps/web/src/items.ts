import { basename, BOARD_EXT, boardName, dirname, INBOX_TASKS, listName, TASK_LIST_EXT, type TaskFilter } from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import type { IconName } from './Icon';

// A tab holds a note (its vault path), a task list, a board or a view. The ids of all but notes
// contain `:`, which no path can.
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
/** The tab of a board, by the path of its file. */
export const boardOf = (board: string) => `${BOARD}${board}`;
export const isNote = (id: string) => !id.includes(':');
/** The file of a task list tab, or null for any other tab. */
export const listOf = (id: string) => (id.startsWith(TASKS) ? id.slice(TASKS.length) : null);
/** The file of a board tab, or null for any other tab. */
export const boardPathOf = (id: string) => (id.startsWith(BOARD) ? id.slice(BOARD.length) : null);
export const isTaskListPath = (path: string) => path.endsWith(TASK_LIST_EXT) || path === INBOX_TASKS;
export const isBoardPath = (path: string) => path.endsWith(BOARD_EXT);
/** The tab that shows the note, task list or board at `path`. */
export const tabOf = (path: string) => (isTaskListPath(path) ? tasksOf(path) : isBoardPath(path) ? boardOf(path) : path);
/** The file a tab shows: a note, a task list or a board; null for a view. */
export const pathOf = (id: string) => (isNote(id) ? id : (listOf(id) ?? boardPathOf(id)));

/** The folder a tab's note, task list or board is in; null for the views over all folders. */
export function folderOf(id: string): string | null {
  const path = pathOf(id);
  return path === null ? null : dirname(path);
}

/** A task list's name and, apart from it, the folder it is in. */
export function listLabel(list: string): string {
  const folder = basename(dirname(list));
  return folder ? t('tab.list', { list: listName(list), folder }) : listName(list);
}

/** A board's name and, apart from it, the folder it is in. */
export function boardLabel(board: string): string {
  const folder = basename(dirname(board));
  return folder ? t('tab.board', { board: boardName(board), folder }) : boardName(board);
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
  const board = boardPathOf(id);
  if (board !== null) return boardLabel(board);
  return titles[id] ?? t('note.untitled');
}
