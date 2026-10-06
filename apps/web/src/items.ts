import { basename, dirname, INBOX_TASKS, listName, TASK_LIST_EXT } from '@scrawlnotes/core';
import type { IconName } from './Icon';

// A tab holds a note (its vault path) or a view. View ids contain `:`, which no path can.
export const TODAY = 'view:today';
export const UPCOMING = 'view:upcoming';
export const TRASH = 'view:trash';
const TASKS = 'tasks:';
const BOARD = 'board:';

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
  return folder ? `${listName(list)} · ${folder}` : listName(list);
}

export function iconOf(id: string): IconName {
  if (id === TRASH) return 'trash';
  return isNote(id) ? 'note' : id.startsWith(BOARD) ? 'board' : 'tasks';
}

export function labelOf(id: string, titles: Record<string, string>): string {
  if (id === TODAY) return 'Today';
  if (id === UPCOMING) return 'Upcoming';
  if (id === TRASH) return 'Trash';
  const list = listOf(id);
  if (list !== null) return listLabel(list);
  if (id.startsWith(BOARD)) return `Board · ${basename(id.slice(BOARD.length))}`;
  return titles[id] ?? 'untitled';
}

/** What the empty page of a board says until boards are built. */
export const BOARD_PLACEHOLDER = 'Boards are not built yet. This tab will hold the board of this folder.';
