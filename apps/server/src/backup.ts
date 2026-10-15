import { copyFileSync, existsSync, linkSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { backup as backupDb, DatabaseSync } from 'node:sqlite';
import type { Config } from './config';

// A backup of the whole server, while it runs: a consistent copy of the database, then the
// contents it points to. Contents never change once written, so they are linked where the disk
// allows it, else copied. The last seven backups are kept. See design/server.md, section 8.

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
