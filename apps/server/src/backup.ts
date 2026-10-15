import { copyFileSync, existsSync, linkSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { backup as backupDb, DatabaseSync } from 'node:sqlite';
import type { Config } from './config';

// A backup of the whole server, while it runs: a consistent copy of the database, then the
// contents it points to. Contents never change once written, so they are linked where the disk
// allows it, else copied. The last seven backups are kept. A restore, with the server stopped,
// puts a backup's database in place and brings back the contents missing. See design/server.md,
// section 8.

const KEEP = 7;

export async function backup(config: Config, now = new Date()): Promise<string> {
  const root = join(config.data, 'backups');
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const target = join(root, stamp);
  mkdirSync(join(target, 'blobs'), { recursive: true });
  const source = new DatabaseSync(join(config.data, 'scrawl.db'));
  try {
    await backupDb(source, join(target, 'scrawl.db'));
  } finally {
    source.close();
  }
  const blobs = join(config.data, 'blobs');
  if (existsSync(blobs)) {
    for (const folder of readdirSync(blobs)) {
      mkdirSync(join(target, 'blobs', folder), { recursive: true });
      for (const name of readdirSync(join(blobs, folder))) {
        const from = join(blobs, folder, name);
        const to = join(target, 'blobs', folder, name);
        try {
          linkSync(from, to);
        } catch {
          copyFileSync(from, to);
        }
      }
    }
  }
  const all = readdirSync(root).sort();
  for (const old of all.slice(0, Math.max(0, all.length - KEEP))) rmSync(join(root, old), { recursive: true, force: true });
  return target;
}

export class NoSuchBackup extends Error {
  constructor(readonly which: string, readonly backups: string[]) {
    super(backups.length ? `No backup "${which}". The backups:\n${backups.map((each) => `  ${each}`).join('\n')}` : 'There are no backups yet.');
    this.name = 'NoSuchBackup';
  }
}

/** The backups there are, oldest first, by the time each was made. */
export function backups(config: Config): string[] {
  const root = join(config.data, 'backups');
  return existsSync(root) ? readdirSync(root).filter((name) => existsSync(join(root, name, 'scrawl.db'))).sort() : [];
}

/**
 * Puts a backup in place, with the server stopped: its database instead of the one there, and the
 * contents it points to that are missing. Contents there already are the same, by their digest,
 * and stay; those only the newer database pointed to stay too, unused.
 */
export function restore(config: Config, which: string): string {
  const from = join(config.data, 'backups', which);
  if (!existsSync(join(from, 'scrawl.db'))) throw new NoSuchBackup(which, backups(config));
  const db = join(config.data, 'scrawl.db');
  rmSync(`${db}-wal`, { force: true });
  rmSync(`${db}-shm`, { force: true });
  copyFileSync(join(from, 'scrawl.db'), db);
  const blobs = join(from, 'blobs');
  if (existsSync(blobs)) {
    for (const folder of readdirSync(blobs)) {
      mkdirSync(join(config.data, 'blobs', folder), { recursive: true });
      for (const name of readdirSync(join(blobs, folder))) {
        const to = join(config.data, 'blobs', folder, name);
        if (existsSync(to) && statSync(to).size === statSync(join(blobs, folder, name)).size) continue;
        try {
          linkSync(join(blobs, folder, name), to);
        } catch {
          copyFileSync(join(blobs, folder, name), to);
        }
      }
    }
  }
  return from;
}
