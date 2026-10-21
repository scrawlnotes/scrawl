import { APP_FILE, BOARD_EXT, COLLECTION_FILE, KEYS_EXT, RULES_FILE, TASK_LIST_EXT } from '@scrawlnotes/core';

// Paths as the agent gives them, and what it may not touch. A path is inside a space, with `/`,
// as the app shows it in a tab. Keys files hold secrets, `.scrawl/` holds the app's own state and
// `_attachments/` the attached files: the agent neither reads nor writes them (design/agent.md, 4).
// A collection's schema, `_collection.json`, is the one hidden name it reads and writes.

/** What a tool could not do, with what it needs to say so: candidates, nearest names, the hash a file has now. */
export class Refusal extends Error {
  constructor(
    message: string,
    readonly details: { [key: string]: unknown } = {},
  ) {
    super(message);
    this.name = 'Refusal';
  }
}

const MAX_PATH = 1024;

/** A path as the agent wrote it, made plain: `/` only, no leading slash, no `..`, no control characters. */
export function cleanPath(raw: string): string {
  const path = raw
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^(\.\/)+/, '')
    .replace(/^\/+|\/+$/g, '');
  if (path.length > MAX_PATH) throw new Refusal('The path is too long');
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(path)) throw new Refusal('The path has characters a path cannot have');
  if (path.split('/').some((part) => part === '..' || part === '.')) throw new Refusal('The path may not go outside the space');
  return path;
}

/** Why the agent may not touch a path, or null when it may. Hidden names (`.`, `_`) hold app state and attachments; a schema, a rules file and an app's _app.json are open. */
export function closedReason(path: string): string | null {
  const parts = path.split('/').filter(Boolean);
  const hidden = (part: string, i: number) => (part.startsWith('.') || part.startsWith('_')) && !(i === parts.length - 1 && (part === COLLECTION_FILE || part === RULES_FILE || part === APP_FILE));
  if (parts.some(hidden)) return 'This is Scrawl’s own folder or an attachment; agents do not read or write it';
  if (path.endsWith(KEYS_EXT)) return 'Keys files hold secrets; agents do not read or write them';
  return null;
}

/** Refuses a closed path. */
export function checkOpen(path: string): string {
  const why = closedReason(path);
  if (why) throw new Refusal(why, { path });
  return path;
}

export type FileKind = 'note' | 'tasks' | 'board' | 'keys' | 'schema' | 'rules' | 'other';

/** What a file is, by its name: a note or a record, a task list, a board, a keys file, a collection's schema or its rules. */
export function fileKind(path: string): FileKind {
  if (path.endsWith(TASK_LIST_EXT)) return 'tasks';
  if (path.endsWith(BOARD_EXT)) return 'board';
  if (path.endsWith(KEYS_EXT)) return 'keys';
  if (path.endsWith(`/${COLLECTION_FILE}`) || path === COLLECTION_FILE) return 'schema';
  if (path.endsWith(`/${RULES_FILE}`) || path === RULES_FILE) return 'rules';
  if (path.endsWith('.md')) return 'note';
  return 'other';
}
