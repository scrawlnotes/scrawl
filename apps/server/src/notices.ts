import { readFileSync } from 'node:fs';
import { BOARD_EXT, type Notice, noticesFrom, noticeWords, TASK_LIST_EXT, tellsPeople } from '@scrawlnotes/core';
import type { Blobs } from './blobs';
import type { Db } from './db';
import type { Actor } from './files';
import type { Push } from './push';

// A card's or a task's notifications (design/notifications.md): a board or a task list written,
// from the app, an agent or another device, is read before and after; whoever it now mentions or
// gives something to hears of it, when they are in the space. Nothing is kept: a notice is sent
// and done. A write never fails for its notifications.

/** A short tag for a notice, as a toast takes it: one a thing, so the next of the same replaces it. */
function tagOf(notice: Notice): string {
  const key = `${notice.kind}\n${notice.item.id}\n${typeof notice.in === 'object' ? notice.in.comment : ''}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 0x01000193);
  return `n${(hash >>> 0).toString(16)}`;
}

/** A board's or a list's name, as the app shows it: its file's name without the kind. */
const nameOf = (path: string) => (path.split('/').at(-1) ?? path).replace(BOARD_EXT, '').replace(TASK_LIST_EXT, '');

export class Notices {
  constructor(
    private readonly db: Db,
    private readonly blobs: Blobs,
    private readonly push: Push,
  ) {}

  /** A file was written: those its change tells hear of it. */
  written(space: string, path: string, before: string | null, after: string, by: Actor) {
    if (before === null || !tellsPeople(path)) return;
    try {
      const read = (hash: string) => readFileSync(this.blobs.pathOf(hash), 'utf8');
      const notices = noticesFrom({ space, path, before: read(before), after: read(after), writer: { id: by.account, name: this.accountName(by.account) } });
      if (!notices.length) return;
      const members = new Set(
        (this.db.prepare('SELECT m.account_id FROM members m JOIN accounts a ON a.id = m.account_id WHERE m.space_id = ? AND a.disabled_at IS NULL').all(space) as { account_id: string }[]).map((row) => row.account_id),
      );
      const spaceName = (this.db.prepare('SELECT name FROM spaces WHERE id = ?').get(space) as { name: string } | undefined)?.name ?? '';
      const where = [nameOf(path), spaceName].filter(Boolean).join(' · ');
      for (const notice of notices) {
        // Someone not in the space, or an agent, hears of nothing.
        if (!members.has(notice.to)) continue;
        const words = noticeWords(notice, where, (id) => this.accountName(id));
        this.push.notice(notice.to, { ...words, href: notice.href, tag: tagOf(notice), space, item: notice.item.id });
      }
    } catch {
      // A file that could not be read tells no one; the write stands.
    }
  }

  private accountName(id: string): string | undefined {
    return (this.db.prepare('SELECT name FROM accounts WHERE id = ?').get(id) as { name: string } | undefined)?.name || undefined;
  }
}
