import { readFileSync } from 'node:fs';
import { BOARD_EXT, type DueWork, dueWorkIn, dueWords, TASK_LIST_EXT } from '@scrawlnotes/core';
import { notifyOf } from './auth';
import type { Blobs } from './blobs';
import type { Db } from './db';
import type { Push } from './push';

// The morning's notification (design/notifications.md 5): at 09:00 on the person's clock, one
// notification of their work due today and tomorrow, not finished, by Today's rule, in the
// spaces they are in here; nothing when nothing is due. Each minute the server looks at who has
// passed nine and not yet been told today. It is read from the boards and the lists then, so it
// is never out of date. A server down in the morning does not tell at noon: only till 12:00.

/** The hour it is sent at, and the hour after which a missed one is not sent any more. */
export const DUE_HOUR = 9;
const LATEST_HOUR = 12;
const EVERY_MS = 60_000;

/** The day and the hour now on a clock: `2026-11-09`, 9. */
function clockIn(zone: string, at: Date): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const part = (type: string) => parts.find((each) => each.type === type)?.value ?? '';
  return { day: `${part('year')}-${part('month')}-${part('day')}`, hour: Number(part('hour')) };
}

const nextDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** A file the morning reads: a board or a list, not in the space's own folder (its trash). */
const readsFrom = (path: string) => (path.endsWith(BOARD_EXT) || path.endsWith(TASK_LIST_EXT)) && !path.split('/').some((part) => part.startsWith('.'));

export class Due {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly db: Db,
    private readonly blobs: Blobs,
    private readonly push: Push,
    private readonly now: () => number = Date.now,
    /** The server's own clock, for someone whose time zone the app has not said. */
    private readonly serverZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  ) {}

  start() {
    this.timer = setInterval(() => this.tick(), EVERY_MS);
    // It never keeps the process alive on its own.
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Tells everyone whose morning it is and who has not been told today. */
  tick() {
    const at = new Date(this.now());
    const accounts = this.db.prepare('SELECT id, time_zone FROM accounts WHERE disabled_at IS NULL').all() as { id: string; time_zone: string | null }[];
    for (const account of accounts) {
      const { day, hour } = clockIn(account.time_zone || this.serverZone, at);
      if (hour < DUE_HOUR || hour >= LATEST_HOUR || !notifyOf(this.db, account.id).due) continue;
      // Once a day: marked before it goes, so that a slow one is not sent twice.
      if (this.db.prepare('INSERT INTO digests (account_id, day) VALUES (?, ?) ON CONFLICT DO NOTHING').run(account.id, day).changes === 0) continue;
      const words = dueWords(this.workOf(account.id, [day, nextDay(day)]), day);
      if (words) this.push.notice(account.id, { ...words, href: 'scrawl:today', tag: 'due', space: '', item: `due:${day}` });
    }
  }

  /** The person's work due on these days, in every space they are in here. */
  workOf(account: string, days: string[]): DueWork[] {
    const files = this.db
      .prepare(
        `SELECT e.space_id, e.path, e.hash FROM entries e
         WHERE e.deleted = 0 AND e.kind = 'file' AND (e.space_id IN (SELECT space_id FROM members WHERE account_id = ?) OR e.space_id IN (SELECT id FROM spaces WHERE personal_of = ?))`,
      )
      .all(account, account) as { space_id: string; path: string; hash: string }[];
    return files.filter((file) => readsFrom(file.path)).flatMap((file) => {
      try {
        return dueWorkIn(file.path, readFileSync(this.blobs.pathOf(file.hash), 'utf8'), account, days);
      } catch {
        return [];
      }
    });
  }
}
