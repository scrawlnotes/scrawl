import { splitName } from './paths';
import type { TreeNode } from './vault';

// How the items of a folder, or of a space's top, are put in order in the sidebar and in Browse:
// grouped by their kind (task lists, boards, keys files, collections, folders, notes) or not,
// with the folders on top; then by name, when they were made or when they were last written,
// one way or the other. Each folder is set on its own, on each device. See PLAN.md 4.1.

export interface FolderLook {
  group: 'type' | 'none';
  by: 'name' | 'created' | 'modified';
  dir: 'asc' | 'desc';
}

/** As the items have always been: by kind, then by name, A to Z. */
export const DEFAULT_LOOK: FolderLook = { group: 'type', by: 'name', dir: 'asc' };

export const isDefaultLook = (look: FolderLook) => look.group === DEFAULT_LOOK.group && look.by === DEFAULT_LOOK.by && look.dir === DEFAULT_LOOK.dir;

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
  const rank = (node: TreeNode) => (look.group === 'type' ? KIND[node.kind] : node.kind === 'folder' ? 0 : 1);
  return [...nodes].sort((a, b) => rank(a) - rank(b) || (key ? key(a) - key(b) : byName(a, b)) * way || byName(a, b));
}
