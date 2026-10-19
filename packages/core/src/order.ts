import { splitName } from './paths';
import type { TreeNode } from './vault';

// How the items of a folder, or of a space's top, are put in order in the sidebar and in Browse:
// the folders on top or not, grouped by their kind (task lists, boards, keys files, collections,
// folders, notes) or not; then by name, when they were made or when they were last written, one
// way or the other. Each folder is set on its own, on each device. See PLAN.md 4.1.

export interface FolderLook {
  group: 'type' | 'none';
  by: 'name' | 'created' | 'modified';
  dir: 'asc' | 'desc';
  /** The folders on top, before everything else; on where it is left out. */
  foldersFirst?: boolean;
}

/** The folders on top, then by kind, the latest written first. */
export const DEFAULT_LOOK: FolderLook = { group: 'type', by: 'modified', dir: 'desc', foldersFirst: true };

/** Whether a look puts the folders on top. */
export const foldersFirst = (look: FolderLook) => look.foldersFirst !== false;

export const isDefaultLook = (look: FolderLook) =>
  look.group === DEFAULT_LOOK.group && look.by === DEFAULT_LOOK.by && look.dir === DEFAULT_LOOK.dir && foldersFirst(look);

const KIND: Record<TreeNode['kind'], number> = { tasks: 1, board: 2, keys: 3, collection: 4, folder: 5, note: 6 };

// Names compare without their extension, so that `Board 2` comes after `Board`.
const plain = (node: TreeNode) => (node.kind === 'folder' || node.kind === 'collection' ? node.name : splitName(node.name)[0]);
const byName = (a: TreeNode, b: TreeNode) => plain(a).localeCompare(plain(b), undefined, { numeric: true });

/** What is known of when the nodes were made and written, beside what the tree has. */
export interface NodeTimes {
  /** When a node was made, as the app keeps it. */
  created?: (node: TreeNode) => number | undefined;
  /** A collection's files, its schema and its records: when the oldest and the newest were written. */
  written?: (node: TreeNode) => { first: number; last: number } | undefined;
}

/**
 * The nodes in the order `look` asks for. A node was written when its file was, a collection when
 * the newest of its files was, a folder when anything in it was. It was made when `created` says;
 * where that is not known, a folder when the first thing in it was, a collection when its oldest
 * file was written, anything else when it was last written. Nodes that tie go by name.
 */
export function sortedNodes(nodes: TreeNode[], look: FolderLook, { created = () => undefined, written = () => undefined }: NodeTimes = {}): TreeNode[] {
  const lastWritten = (node: TreeNode): number => {
    const own = written(node)?.last ?? node.modified ?? 0;
    return node.kind === 'folder' ? Math.max(own, ...(node.children ?? []).map(lastWritten)) : own;
  };
  const madeAt = (node: TreeNode): number => {
    const known = created(node);
    if (known !== undefined) return known;
    if (node.kind === 'folder' && node.children?.length) return Math.min(...node.children.map(madeAt));
    return written(node)?.first ?? lastWritten(node);
  };
  const key = look.by === 'created' ? madeAt : look.by === 'modified' ? lastWritten : null;
  const way = look.dir === 'asc' ? 1 : -1;
  const top = foldersFirst(look);
  const rank = (node: TreeNode) => (top && node.kind === 'folder' ? 0 : 10) + (look.group === 'type' ? KIND[node.kind] : 0);
  return [...nodes].sort((a, b) => rank(a) - rank(b) || (key ? key(a) - key(b) : byName(a, b)) * way || byName(a, b));
}
