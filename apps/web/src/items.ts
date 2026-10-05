import { basename } from '@scrawlnotes/core';
import type { IconName } from './Icon';

// A tab holds a note (its vault path) or a view. View ids contain `:`, which no path can.
export const TODAY = 'view:today';
export const UPCOMING = 'view:upcoming';
const TASKS = 'tasks:';
const BOARD = 'board:';

export const tasksOf = (folder: string) => `${TASKS}${folder}`;
export const boardOf = (folder: string) => `${BOARD}${folder}`;
export const isNote = (id: string) => !id.includes(':');
/** The folder a task list tab belongs to, or null for any other tab. */
export const tasksFolder = (id: string) => (id.startsWith(TASKS) ? id.slice(TASKS.length) : null);

export function iconOf(id: string): IconName {
  return isNote(id) ? 'note' : id.startsWith(BOARD) ? 'board' : 'tasks';
}

export function labelOf(id: string, titles: Record<string, string>): string {
  if (id === TODAY) return 'Today';
  if (id === UPCOMING) return 'Upcoming';
  if (id.startsWith(TASKS)) return `Tasks · ${basename(id.slice(TASKS.length))}`;
  if (id.startsWith(BOARD)) return `Board · ${basename(id.slice(BOARD.length))}`;
  return titles[id] ?? 'untitled';
}

/** What the empty page of a view says until the view is built. */
export function placeholderOf(id: string): string {
  return id.startsWith(BOARD)
    ? 'Boards are not built yet. This tab will hold the board of this folder.'
    : 'Tasks are not built yet. This view will list them.';
}
