import { createReadStream, createWriteStream, mkdirSync } from 'node:fs';
import { once } from 'node:events';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import type { Config } from './config';

// A space as it is now, as an ordinary folder tree in a zip: to leave the server, for OneDrive or
// another place. Run beside a running server: it only reads. See design/server.md, section 8.

/** Already compressed: stored as they are, not compressed again. */
const PACKED = /\.(png|jpe?g|gif|webp|heic|avif|mp4|mov|webm|m4a|mp3|ogg|opus|aac|zip|gz|7z|pdf|docx|xlsx|pptx)$/i;

export class NoSuchSpace extends Error {
  constructor(readonly which: string, readonly spaces: { id: string; name: string }[]) {
    super(
      spaces.length
        ? `No space "${which}" on this server. Its spaces:\n${spaces.map((each) => `  ${each.name || '(no name)'}  ${each.id}`).join('\n')}`
        : `No space "${which}": this server has no spaces yet.`,
    );
    this.name = 'NoSuchSpace';
  }
}

/** Zips a space, found by its id or its name, to `out` or to `exports/<name>-<day>.zip` in the data folder; returns where. */
export async function exportSpace(config: Config, which: string, out?: string, now = new Date()): Promise<string> {
  const db = new DatabaseSync(join(config.data, 'scrawl.db'), { readOnly: true });
  try {
    const spaces = db.prepare('SELECT id, name FROM spaces ORDER BY name COLLATE NOCASE').all() as { id: string; name: string }[];
    const space = spaces.find((each) => each.id === which) ?? spaces.find((each) => each.name.toLowerCase() === which.toLowerCase());
    if (!space) throw new NoSuchSpace(which, spaces);
    const entries = db
      .prepare('SELECT path, kind, hash, at FROM entries WHERE space_id = ? AND deleted = 0 ORDER BY path')
      .all(space.id) as { path: string; kind: 'file' | 'dir'; hash: string | null; at: number }[];
    const target = out ?? join(config.data, 'exports', `${(space.name || space.id).replace(/[\\/:*?"<>|]/g, '-')}-${now.toISOString().slice(0, 10)}.zip`);
    mkdirSync(dirname(target), { recursive: true });
    await writeZip(
      target,
      entries.map((entry) => ({
        name: entry.kind === 'dir' ? `${entry.path}/` : entry.path,
        from: entry.kind === 'file' && entry.hash ? join(config.data, 'blobs', entry.hash.slice(0, 2), entry.hash) : null,
        at: entry.at,
      })),
    );
    return target;
  } finally {
    db.close();
  }
}

/** Writes the files into a zip as they are read, so a large space never sits in memory. */
async function writeZip(target: string, files: { name: string; from: string | null; at: number }[]) {
  const file = createWriteStream(target);
  let failed: Error | null = null;
  const zip = new Zip((error, chunk, final) => {
    if (error) failed = error;
    else file.write(chunk);
    if (final) file.end();
  });
  const drained = async () => {
    if (file.writableNeedDrain) await once(file, 'drain');
  };
  for (const each of files) {
    const entry = each.from && !PACKED.test(each.name) ? new ZipDeflate(each.name, { level: 6 }) : new ZipPassThrough(each.name);
    entry.mtime = each.at;
    zip.add(entry);
    if (each.from) {
      for await (const chunk of createReadStream(each.from)) {
        entry.push(chunk as Uint8Array);
        await drained();
      }
    }
    entry.push(new Uint8Array(0), true);
    if (failed) throw failed;
  }
  zip.end();
  await once(file, 'close');
  if (failed) throw failed;
}
