import { basename, BOARD_EXT, boardName, collectionName, dirname, INBOX_TASKS, isScratchNote, KEYS_EXT, keysName, listName, localPath, spaceOf, TASK_LIST_EXT, type TaskFilter } from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import type { IconName } from './Icon';

// A tab holds a note (its vault path), a task list, a board, a keys file or a view. The ids of
// all but notes contain `:`, which no path can.
export const TODAY = 'view:today';
export const UPCOMING = 'view:upcoming';
export const TRASH = 'view:trash';
const TASKS = 'tasks:';
const BOARD = 'board:';
const KEYS = 'keys:';
const FILTER = 'filter:';
const COLLECTION = 'collection:';

/** The tab of a saved filter, by its id. */
export const filterTab = (id: string) => `${FILTER}${id}`;
/** The id of the filter a tab shows, or null for any other tab. */
export const filterOf = (tab: string) => (tab.startsWith(FILTER) ? tab.slice(FILTER.length) : null);

/** The tab of a task list, by the path of its file. */
export const tasksOf = (list: string) => `${TASKS}${list}`;
/** The tab of a board, by the path of its file. */
export const boardOf = (board: string) => `${BOARD}${board}`;
/** The tab of a keys file, by its path. */
export const keysOf = (keys: string) => `${KEYS}${keys}`;
/** The tab of a collection, by the path of its folder. */
export const collectionTab = (dir: string) => `${COLLECTION}${dir}`;
/** The folder of a collection tab, or null for any other tab. */
export const collectionPathOf = (id: string) => (id.startsWith(COLLECTION) ? id.slice(COLLECTION.length) : null);
export const isNote = (id: string) => !id.includes(':');
/** The file of a task list tab, or null for any other tab. */
export const listOf = (id: string) => (id.startsWith(TASKS) ? id.slice(TASKS.length) : null);
/** The file of a board tab, or null for any other tab. */
export const boardPathOf = (id: string) => (id.startsWith(BOARD) ? id.slice(BOARD.length) : null);
/** The file of a keys tab, or null for any other tab. */
export const keysPathOf = (id: string) => (id.startsWith(KEYS) ? id.slice(KEYS.length) : null);
export const isTaskListPath = (path: string) => path.endsWith(TASK_LIST_EXT) || path === INBOX_TASKS;
export const isBoardPath = (path: string) => path.endsWith(BOARD_EXT);
export const isKeysPath = (path: string) => path.endsWith(KEYS_EXT);
/** The tab that shows the note, task list, board or keys file at `path`. */
export const tabOf = (path: string) =>
  isTaskListPath(path) ? tasksOf(path) : isBoardPath(path) ? boardOf(path) : isKeysPath(path) ? keysOf(path) : path;
/** The file a tab shows: a note, a task list, a board or a keys file; null for a view. */
export const pathOf = (id: string) => (isNote(id) ? id : (listOf(id) ?? boardPathOf(id) ?? keysPathOf(id)));

/** The space a tab's note, list, board, keys file or collection is in; null in the personal space and for the views over all of them. */
export const spaceOfTab = (id: string) => spaceOf(pathOf(id) ?? collectionPathOf(id) ?? '');

// The names of the spaces beside the personal one, by id, for the places paths are shown as words;
// and the personal space's own.
let spaceNames = new Map<string, string>();
let personalName = '';

/** Tells the interface what the spaces are called, so that a path shows its space by name. */
export function setSpaceNames(names: Map<string, string>, personal = '') {
  spaceNames = names;
  personalName = personal;
}

/** What a space is called, by its id; null is the personal space. */
export const spaceLabel = (space: string | null) => (space ? (spaceNames.get(space) ?? space) : personalName || t('settings.personal'));

/** A folder's name for the interface: a space's own name where the path is the space itself. */
export function folderLabel(folder: string): string {
  const space = spaceOf(folder);
  if (space && localPath(folder) === '') return spaceNames.get(space) ?? basename(folder);
  return basename(folder);
}

/** A folder's path as a list of folders shows it: a space's own name in front of its path. */
export function shownPath(path: string): string {
  const space = spaceOf(path);
  if (!space) return path;
  const name = spaceNames.get(space) ?? space;
  const local = localPath(path);
  return local ? `${name}/${local}` : name;
}

/** The folder a path is in, shown as words: the space's name, then the folders, apart. */
export function placeLabel(path: string): string {
  const space = spaceOf(path);
  const parts = dirname(localPath(path)).split('/').filter(Boolean);
  if (space) parts.unshift(spaceNames.get(space) ?? space);
  return parts.join(' / ');
}

/** The folders a path is in, inside its space, as words: `Scrawl / meetings`; empty at the top. */
export function trailOf(path: string): string {
  return dirname(localPath(path)).split('/').filter(Boolean).join(' / ');
}

/** The space and the folder something of another space is in, as the views over every space say it: `Acme · Sales`; null in the personal space. */
function spaceWhere(path: string): string | null {
  const space = spaceOf(path);
  if (!space) return null;
  const folder = dirname(localPath(path));
  return [spaceNames.get(space) ?? space, ...(folder ? [basename(folder)] : [])].join(' · ');
}

/** Where a task list is, under a row of Today, Upcoming or a filter: as its tab says, or `Acme · Sales` in another space. */
export const listWhere = (list: string) => spaceWhere(list) ?? listLabel(list);
/** Where a board is, under a card's row in those views. */
export const boardWhere = (board: string) => spaceWhere(board) ?? boardLabel(board);
/** A task list heading its group in those views: as its tab says, or `Tasks · Acme · Sales` in another space. */
export const listHeading = (list: string) => {
  const where = spaceWhere(list);
  return where ? `${listName(list)} · ${where}` : listLabel(list);
};
/** A board heading its group of cards in those views: `Deals · Acme · Sales` in another space. */
export const boardHeading = (board: string) => {
  const where = spaceWhere(board);
  return where ? `${boardName(board)} · ${where}` : boardLabel(board);
};

/**
 * The way to what a tab shows, said when the pointer rests on the tab: the space, then its
 * folders, `Acme › Sales`; `personal` names the personal space. Null for the views over all.
 */
export function pathTip(id: string, personal: string): string | null {
  const path = pathOf(id) ?? collectionPathOf(id);
  if (path === null) return null;
  const space = spaceOf(path);
  const folders = dirname(localPath(path)).split('/').filter(Boolean);
  return [space ? (spaceNames.get(space) ?? space) : personal, ...folders].join(' › ');
}

/** The folder a tab's note, task list or board is in; null for the views over all folders. */
export function folderOf(id: string): string | null {
  const collection = collectionPathOf(id);
  if (collection !== null) return dirname(collection);
  const path = pathOf(id);
  return path === null ? null : dirname(path);
}

/** A task list's name and, apart from it, the folder it is in. */
/** The folder something is in, as its label names it: a space's name at its top, none at the personal space's top. */
const folderNamed = (path: string) => (dirname(path) ? folderLabel(dirname(path)) : '');

export function listLabel(list: string): string {
  const folder = folderNamed(list);
  return folder ? t('tab.list', { list: listName(list), folder }) : listName(list);
}

/** A board's name and, apart from it, the folder it is in. */
export function boardLabel(board: string): string {
  const folder = folderNamed(board);
  return folder ? t('tab.board', { board: boardName(board), folder }) : boardName(board);
}

/** A keys file's name and, apart from it, the folder it is in. */
export function keysLabel(keys: string): string {
  const folder = folderNamed(keys);
  return folder ? t('tab.keys', { keys: keysName(keys), folder }) : keysName(keys);
}

/** A collection's name and, apart from it, the folder it is in. */
export function collectionLabel(dir: string): string {
  const folder = folderNamed(dir);
  return folder ? t('tab.collection', { collection: collectionName(dir), folder }) : collectionName(dir);
}

export function iconOf(id: string): IconName {
  if (id === TRASH) return 'trash';
  if (id.startsWith(COLLECTION)) return 'collection';
  if (id.startsWith(FILTER)) return 'filter';
  if (id.startsWith(KEYS)) return 'keys';
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
  const keys = keysPathOf(id);
  if (keys !== null) return keysLabel(keys);
  const collection = collectionPathOf(id);
  if (collection !== null) return collectionLabel(collection);
  // A record opened as a note is not in the tree's titles; it is named after its file.
  return titles[id] ?? (isScratchNote(id) ? t('note.untitled') : basename(id).replace(/\.md$/, ''));
}

/** What something opened is called on a phone: its name alone, the folder it is in being said under it. */
export function nameOf(id: string, titles: Record<string, string>, filters: TaskFilter[] = []): string {
  const list = listOf(id);
  if (list !== null) return listName(list);
  const board = boardPathOf(id);
  if (board !== null) return boardName(board);
  const keys = keysPathOf(id);
  if (keys !== null) return keysName(keys);
  const collection = collectionPathOf(id);
  if (collection !== null) return collectionName(collection);
  return labelOf(id, titles, filters);
}
