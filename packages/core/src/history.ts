import { join, type VaultFs } from './fs';
import { freePath, moveTree, parseStamp, stamp } from './paths';
import { dayOf } from './tasks';

/**
 * Earlier versions of each note, kept on this device: `.scrawl/history/<note path>/<moment>.md`.
 * A version is the note's text as it was before it changed.
 */
const HISTORY = '.scrawl/history';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** While a note is being written, a version is kept at most this often. */
export const VERSION_EVERY_MS = 10 * MINUTE;
/** Every version of the last day is kept; older ones one per day, and none past this age. */
const KEEP_FOR_MS = 60 * DAY;

export interface Version {
  /** Where the version is stored. */
  path: string;
  /** When it was kept, as an ISO time. */
  time: string;
}

const historyOf = (note: string) => join(HISTORY, note);

/** The versions of a note, the latest first. */
export async function listVersions(fs: VaultFs, note: string): Promise<Version[]> {
  const versions: Version[] = [];
  for (const entry of await fs.list(historyOf(note))) {
    const stamped = entry.kind === 'file' && entry.name.endsWith('.md') ? parseStamp(entry.name) : null;
    if (stamped) versions.push({ path: entry.path, time: stamped.time.toISOString() });
  }
  // Two versions in the same second are numbered, and the numbered one is the later.
  return versions.sort((a, b) => b.time.localeCompare(a.time) || b.path.length - a.path.length || b.path.localeCompare(a.path));
}

/** The versions that the keeping rules let go: past the last day one per day, and none older than 60 days. */
function expired(versions: Version[], now: Date): Version[] {
  const days = new Set<string>();
  const out: Version[] = [];
  for (const version of versions) {
    const age = now.getTime() - Date.parse(version.time);
    if (age < DAY) continue;
    const day = dayOf(new Date(version.time));
    // Latest first, so the version kept for a day is that day's last.
    if (age > KEEP_FOR_MS || days.has(day)) out.push(version);
    else days.add(day);
  }
  return out;
}

async function prune(fs: VaultFs, versions: Version[], now: Date): Promise<void> {
  for (const version of expired(versions, now)) await fs.remove(version.path);
}

/**
 * Keeps `text` as a version of `note`. Unless `always` is set, nothing is kept when the latest
 * version is less than ten minutes old. A text that is empty, or the same as the latest
 * version, is never kept. Returns whether a version was written.
 */
export async function keepVersion(
  fs: VaultFs,
  note: string,
  text: string,
  { now = new Date(), always = false }: { now?: Date; always?: boolean } = {},
): Promise<boolean> {
  if (!text.trim()) return false;
  const versions = await listVersions(fs, note);
  const latest = versions[0];
  if (latest && !always && now.getTime() - Date.parse(latest.time) < VERSION_EVERY_MS) return false;
  if (latest && (await fs.readText(latest.path)) === text) return false;
  const taken = new Set(versions.map((v) => v.path.toLowerCase()));
  const path = freePath(historyOf(note), stamp(now), '.md', taken);
  await fs.writeText(path, text);
  await prune(fs, [{ path, time: now.toISOString() }, ...versions], now);
  return true;
}

/** A note was moved or renamed: its history goes with it. */
export async function moveHistory(fs: VaultFs, from: string, to: string): Promise<void> {
  const source = historyOf(from);
  if ((await fs.list(source)).length === 0) return;
  await moveTree(fs, source, historyOf(to));
  await fs.remove(source);
}

/**
 * Applies the keeping rules to the history of every note, also of notes that are gone, whose
 * versions so run out after 60 days. Folders left empty are removed.
 */
export async function pruneHistory(fs: VaultFs, now = new Date()): Promise<void> {
  const visit = async (dir: string): Promise<boolean> => {
    const entries = await fs.list(dir);
    const versions = await listVersions(fs, dir.slice(HISTORY.length + 1));
    await prune(fs, versions, now);
    const gone = new Set(expired(versions, now).map((v) => v.path));
    let left = entries.filter((e) => e.kind === 'file' && !gone.has(e.path)).length;
    for (const entry of entries) if (entry.kind === 'dir' && (await visit(entry.path))) left++;
    if (left === 0 && dir !== HISTORY) await fs.remove(dir);
    return left > 0;
  };
  if ((await fs.list(HISTORY)).length > 0) await visit(HISTORY);
}
