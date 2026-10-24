import { createReadStream, createWriteStream, mkdirSync } from 'node:fs';
import { once } from 'node:events';
import { dirname, join } from 'node:path';
import type { Writable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { type ExportEntry, transcriptOf } from './chat';
import type { Config } from './config';

// A space as it is now, as an ordinary folder tree in a zip: to leave the server, for OneDrive or
// another place. Run beside a running server: it only reads. See design/server.md, section 8.
// Its rooms come along under Chat/, private ones too, a folder each with a Markdown file a month,
// their files in Chat/_attachments/; direct messages are their people's, and stay (design/chat.md, 10).

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
    const blob = (hash: string) => join(config.data, 'blobs', hash.slice(0, 2), hash);
    await writeZip(target, [
      ...entries.map((entry) => ({
        name: entry.kind === 'dir' ? `${entry.path}/` : entry.path,
        from: entry.kind === 'file' && entry.hash ? blob(entry.hash) : null,
        at: entry.at,
      })),
      ...roomsOf(db, space.id).map((entry) => ({ name: entry.name, from: entry.hash ? blob(entry.hash) : null, ...(entry.text !== undefined && { text: entry.text }), at: entry.at })),
    ]);
    return target;
  } finally {
    db.close();
  }
}

/**
 * A space's rooms as the export has them: Chat/<room>/2026-10.md, archived and private ones too,
 * and their files once in Chat/_attachments/; days and times in the server owner's time zone.
 */
function roomsOf(db: DatabaseSync, space: string): ExportEntry[] {
  // A server from before messaging has no rooms.
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'chats'").get()) return [];
  const rooms = db.prepare("SELECT id, name, topic FROM chats WHERE space_id = ? AND kind <> 'direct' ORDER BY name COLLATE NOCASE").all(space) as { id: string; name: string; topic: string }[];
  const zone = (db.prepare("SELECT time_zone FROM accounts WHERE role = 'owner' AND time_zone IS NOT NULL ORDER BY created_at LIMIT 1").get() as { time_zone: string } | undefined)?.time_zone ?? 'UTC';
  const kept = new Map<string, ExportEntry>();
  const months = rooms.flatMap((room) =>
    transcriptOf(db, room, `#${room.name}`, zone, { folder: 'Chat/_attachments', link: '../_attachments', kept }).map((entry) => ({ ...entry, name: `Chat/${roomFolder(room.name)}/${entry.name}` })),
  );
  return [...months, ...kept.values()];
}

/** A room's name as a folder on any computer. */
const roomFolder = (name: string) => name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim() || 'room';

/** Writes the files into a zip as they are read, so a large space never sits in memory. */
async function writeZip(target: string, files: ZipFile[]) {
  const file = createWriteStream(target);
  const done = once(file, 'close');
  await zipInto(file, files);
  await done;
}

/** A file in a zip: its content from a file on disk, or text written for it; a folder has neither. */
export interface ZipFile {
  name: string;
  from: string | null;
  text?: string;
  at: number;
}

/**
 * Writes the files into a zip on `out` as they are read, waiting for it to take each piece, and
 * ends it: a file, or a download as it goes (a conversation's export, design/chat.md 10).
 */
export async function zipInto(out: Writable, files: ZipFile[]) {
  let failed: Error | null = null;
  const zip = new Zip((error, chunk, final) => {
    if (error) failed = error;
    else out.write(chunk);
    if (final) out.end();
  });
  const drained = async () => {
    if (out.writableNeedDrain) await once(out, 'drain');
  };
  for (const each of files) {
    const packs = (each.from || each.text !== undefined) && !PACKED.test(each.name);
    const entry = packs ? new ZipDeflate(each.name, { level: 6 }) : new ZipPassThrough(each.name);
    entry.mtime = each.at;
    zip.add(entry);
    if (each.text !== undefined) entry.push(new TextEncoder().encode(each.text));
    else if (each.from) {
      for await (const chunk of createReadStream(each.from)) {
        entry.push(chunk as Uint8Array);
        await drained();
      }
    }
    entry.push(new Uint8Array(0), true);
    if (failed) throw failed;
    await drained();
  }
  zip.end();
  if (failed) throw failed;
}
