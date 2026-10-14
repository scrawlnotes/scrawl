import { basename, dirname, type Entry, type VaultFs } from '../fs';
import { freePath, splitName } from '../paths';
import { trashItem } from '../vault';
import { sha256 } from './hash';
import { mergeFile, mergeKindOf } from './merge-files';
import { isSynced, keyOf } from './paths';
import { RemoteConflict, type RemoteFile, type RemoteStore } from './remote';
import { dropBase, type FileRecord, loadSyncState, moveBase, readBase, saveSyncState, type SyncState, writeBase } from './state';

// One turn of syncing a space with its remote. Each path is told against the base it had when it
// was last synced: what changed on one side goes to the other, what changed on both is merged,
// and nothing is written over blindly. See design/sync.md.

export interface SyncDevice {
  /** Kept in the state; a state written for another device is not used. */
  id: string;
  /** Goes into the names of conflict copies. */
  name: string;
}

export interface SyncReport {
  uploaded: string[];
  downloaded: string[];
  /** Files changed on both sides whose changes were merged. */
  merged: string[];
  /** Conflict copies made: another version of a file, put beside it. */
  conflicts: string[];
  moved: string[];
  /** Moved on this device because they moved on the other side: what is open there follows them. */
  followed: { from: string; to: string }[];
  /** Deleted on this device because they went on the other side. */
  removedHere: string[];
  /** Deleted on the other side because they went on this device. */
  removedThere: string[];
  /**
   * Changed while the turn ran, on the other side or here (the user saving): left for the next
   * turn, nothing written over.
   */
  skipped: string[];
  /** Here, but named as the other side does not take: not synced. */
  refused: string[];
}

/**
 * One thing a turn does to one file, for showing the turn as it goes: sent up, brought down,
 * changed on both sides, moved, taken to this device's trash, deleted on the other side, a
 * conflict copy made, or a name the other side does not take.
 */
export type SyncJobKind = 'up' | 'down' | 'both' | 'moved' | 'trash' | 'removeThere' | 'copy' | 'name';
/** How a job ended: sent, brought, merged, found alike (nothing moved), moved, a copy, to the trash, deleted there. */
export type SyncJobResult = 'sent' | 'brought' | 'merged' | 'alike' | 'moved' | 'copy' | 'trashed' | 'removedThere';

export interface SyncJob {
  path: string;
  kind: SyncJobKind;
  /** The bytes it moves; 0 for what moves none. */
  size: number;
  /** Waiting for its turn, done, left for the next turn (changed meanwhile), or refused (its name). */
  state: 'waiting' | 'done' | 'skipped' | 'refused';
  result?: SyncJobResult;
  /** Where a moved file was. */
  from?: string;
  /** Where it changed while the turn ran, for one left for the next turn. */
  reason?: 'here' | 'there';
}

/** How a turn stands: reading what changed there, checking what changed here, then the jobs one by one. */
export interface SyncProgress {
  stage: 'reading' | 'checking' | 'sending';
  /** How much is done, 0 to 1; below 1 until the turn ends. */
  share: number;
  /** While reading and checking: how many files were looked at. */
  looked: number;
  /** Every job of the turn, the planned ones in the order they go; the same array all turn long, changed in place. */
  jobs: readonly SyncJob[];
  files: { done: number; total: number };
  bytes: { done: number; total: number };
  /** The job going now, with how many of its bytes went. */
  current: { path: string; kind: SyncJobKind; done: number; size: number } | null;
}

export interface SyncOptions {
  now?: () => Date;
  /** How often the state is written while a turn runs; a turn cut short resumes from it. */
  saveEveryMs?: number;
  /** Told how the turn stands, often: a caller showing it draws at its own pace. */
  onProgress?: (progress: SyncProgress) => void;
}

type LocalStatus = 'same' | 'changed' | 'new' | 'deleted' | 'none';
type RemoteStatus = 'same' | 'changed' | 'new' | 'deleted' | 'none';

const TRASH = '.scrawl/trash';
/** Reading and checking count for this share of a turn; the jobs for the rest. */
const CHECKING = 0.1;
/** A job counts as at least this many bytes, so that hundreds of small notes move the share too. */
const LEAST_WEIGHT = 64 * 1024;
const weightOf = (job: { kind: SyncJobKind; size: number }) => (job.kind === 'up' || job.kind === 'down' || job.kind === 'both' ? Math.max(job.size, LEAST_WEIGHT) : LEAST_WEIGHT);

/** Every synced file and folder of the space, by key. */
async function walk(fs: VaultFs, dir = '', files = new Map<string, Entry>(), dirs = new Map<string, string>()) {
  for (const entry of await fs.list(dir)) {
    if (!isSynced(entry.path)) continue;
    if (entry.kind === 'dir') {
      dirs.set(keyOf(entry.path), entry.path);
      await walk(fs, entry.path, files, dirs);
    } else files.set(keyOf(entry.path), entry);
  }
  return { files, dirs };
}

const pad = (n: number) => String(n).padStart(2, '0');
/** A moment as a conflict copy's name carries it, in local time: `2026-10-07 1432`. */
const moment = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}`;
/** A device name as it can stand in a file name anywhere. */
const safeName = (name: string) => name.replace(/[\\/:*?"<>|]/g, '-').trim() || 'another device';
const isUnder = (key: string, dir: string) => key.startsWith(`${dir}/`);

/**
 * Where another version of a file goes beside it, made on `device` at `at`: `Plan (conflict,
 * Kaan's laptop, 2026-10-07 1432).md`, or with a number after it when `taken` has that path.
 */
export function conflictPath(path: string, device: string, at: Date, taken: ReadonlySet<string>): string {
  const [name, ext] = splitName(basename(path));
  return freePath(dirname(path), `${name} (conflict, ${safeName(device)}, ${moment(at)})`, ext, taken);
}

class Turn {
  readonly report: SyncReport = { uploaded: [], downloaded: [], merged: [], conflicts: [], moved: [], followed: [], removedHere: [], removedThere: [], skipped: [], refused: [] };
  private local = { files: new Map<string, Entry>(), dirs: new Map<string, string>() };
  private readonly remoteFiles = new Map<string, RemoteFile>();
  private readonly remoteDirs = new Map<string, string>();
  private readonly removed = new Set<string>();
  private readonly hashes = new Map<string, string>();
  private savedAt = Date.now();
  // How the turn stands, for `onProgress`.
  private readonly jobs: SyncJob[] = [];
  private stage: SyncProgress['stage'] = 'reading';
  private looked = 0;
  private checked = 0;
  private readonly files = { done: 0, total: 0 };
  private readonly bytes = { done: 0, total: 0 };
  private readonly weight = { done: 0, total: 0 };
  private current: SyncProgress['current'] = null;
  /** How the job going now ended, as the step that did it says. */
  private result: SyncJobResult | null = null;
  /** Where each file left for the next turn changed, by key. */
  private readonly skipReasons = new Map<string, 'here' | 'there'>();

  constructor(
    private readonly fs: VaultFs,
    private readonly remote: RemoteStore,
    private readonly device: SyncDevice,
    private readonly state: SyncState,
    private readonly now: () => Date,
    private readonly saveEveryMs: number,
    private readonly onProgress?: (progress: SyncProgress) => void,
  ) {}

  async run(): Promise<void> {
    const startCursor = this.state.cursor;
    this.tell();
    const listing = await this.remote.changes(startCursor, (count) => {
      this.looked = count;
      this.tell();
    });
    for (const entry of listing.changed) {
      if (!isSynced(entry.path)) continue;
      if (entry.kind === 'dir') this.remoteDirs.set(keyOf(entry.path), entry.path);
      else this.remoteFiles.set(keyOf(entry.path), entry);
    }
    for (const path of listing.removed) {
      const key = keyOf(path);
      if (isSynced(path) && !this.remoteFiles.has(key) && !this.remoteDirs.has(key)) this.removed.add(key);
    }
    // A first listing holds everything there is: what the base has and the listing lacks is gone.
    if (startCursor === null || listing.full) {
      for (const key of Object.keys(this.state.files)) if (!this.remoteFiles.has(key)) this.removed.add(key);
      for (const key of Object.keys(this.state.dirs)) if (!this.remoteDirs.has(key)) this.removed.add(key);
    }
    this.stage = 'checking';
    this.looked = 0;
    this.local = await walk(this.fs);
    this.refuseNames();
    this.tell();

    await this.moves();
    const keys = [...new Set([...this.local.files.keys(), ...this.remoteFiles.keys(), ...Object.keys(this.state.files), ...[...this.removed].filter((k) => !(k in this.state.dirs))])].sort();
    const status = new Map<string, [LocalStatus, RemoteStatus]>();
    for (const [index, key] of keys.entries()) {
      status.set(key, [await this.localStatus(key), this.remoteStatus(key)]);
      this.looked = index + 1;
      this.checked = (index + 1) / keys.length;
      if (index % 20 === 19) this.tell();
    }

    // The turn's jobs, in the order they go. What comes from the other side first, the trash's new
    // files among it; then what goes up; deletions last, so that "is it in the trash already?" is
    // asked with the trash complete.
    const plan: { job: SyncJob | null; run: () => Promise<void> }[] = [];
    for (const [key, [here, there]] of status) {
      if (there !== 'new' && there !== 'changed') continue;
      const file = this.remoteFiles.get(key)!;
      const both = here === 'new' || here === 'changed';
      // A file gone from there since the listing is left for the next turn, which lists it gone.
      plan.push({ job: this.planned(file.path, both ? 'both' : 'down', file.size), run: () => this.attempt(file.path, () => (both ? this.both(key) : this.download(key))) });
    }
    for (const [key, [here, there]] of status) {
      if ((here === 'new' || here === 'changed') && (there === 'same' || there === 'none' || there === 'deleted')) {
        const entry = this.local.files.get(key)!;
        plan.push({ job: this.planned(entry.path, 'up', entry.size ?? 0), run: () => this.upload(key, there === 'same' ? this.state.files[key]!.tag : null) });
      }
    }
    for (const [key, [here, there]] of status) {
      if (there !== 'deleted') continue;
      if (here === 'same') plan.push({ job: this.planned(this.local.files.get(key)!.path, 'trash', 0), run: () => this.removeHere(key) });
      else if (here === 'deleted' || here === 'none') plan.push({ job: null, run: () => this.drop(key) });
    }
    for (const [key, [here, there]] of status) {
      if (here === 'deleted' && there === 'same') plan.push({ job: this.planned(this.state.files[key]!.path, 'removeThere', 0), run: () => this.removeThere(key) });
    }

    this.stage = 'sending';
    for (const { job } of plan) {
      if (!job) continue;
      this.files.total++;
      this.bytes.total += job.size;
      this.weight.total += weightOf(job);
    }
    this.tell();
    for (const { job, run } of plan) {
      if (job) await this.work(job, run);
      else await run();
    }
    await this.folders();

    // Files that are the same but were touched keep their new time, so they are not read again.
    for (const [key, [here]] of status) {
      const record = this.state.files[key];
      const entry = this.local.files.get(key);
      if (here === 'same' && record && entry?.modified !== undefined && entry.path === record.path) record.modified = entry.modified;
    }
    // A change of the other side left for later is listed again next turn: the cursor stays.
    this.state.cursor = this.report.skipped.length > 0 ? startCursor : listing.cursor;
    await saveSyncState(this.fs, this.state);
  }

  /** Paths the other side does not take stay here only; they are told, not renamed. */
  private refuseNames(): void {
    const accepts = this.remote.accepts?.bind(this.remote);
    if (!accepts) return;
    for (const [key, entry] of this.local.files) {
      if (accepts(entry.path)) continue;
      this.local.files.delete(key);
      if (this.state.files[key]) continue;
      this.report.refused.push(entry.path);
      this.jobs.push({ path: entry.path, kind: 'name', size: 0, state: 'refused' });
    }
    for (const [key, path] of this.local.dirs) if (!accepts(path)) this.local.dirs.delete(key);
  }

  // ---------- how the turn stands ----------

  private planned(path: string, kind: SyncJobKind, size: number): SyncJob {
    const job: SyncJob = { path, kind, size, state: 'waiting' };
    this.jobs.push(job);
    return job;
  }

  /** A job done in passing, before the plan or beside a job of it: a move, a conflict copy. */
  private did(path: string, kind: SyncJobKind, result: SyncJobResult, size = 0, from?: string): void {
    this.jobs.push({ path, kind, size, state: 'done', result, ...(from !== undefined && { from }) });
    this.tell();
  }

  /** Runs one job of the plan, and tells how it ended: done, or left for the next turn. */
  private async work(job: SyncJob, run: () => Promise<void>): Promise<void> {
    this.current = { path: job.path, kind: job.kind, done: 0, size: job.size };
    this.result = null;
    this.tell();
    const key = keyOf(job.path);
    const before = this.report.skipped.length;
    await run();
    if (this.report.skipped.slice(before).some((path) => keyOf(path) === key)) {
      job.state = 'skipped';
      job.reason = this.skipReasons.get(key) ?? 'there';
    } else {
      job.state = 'done';
      job.result = this.result ?? 'alike';
    }
    this.files.done++;
    this.weight.done += weightOf(job);
    this.bytes.done += job.size;
    this.current = null;
    this.tell();
  }

  /** How many bytes of the job going now went, as the remote tells while it sends or brings a file. */
  private readonly sent = (done: number) => {
    if (!this.current) return;
    this.current.done = done;
    this.tell();
  };

  private tell(): void {
    if (!this.onProgress) return;
    let share = 0;
    if (this.stage === 'checking') share = CHECKING * this.checked;
    else if (this.stage === 'sending') {
      const current = this.current;
      const part = current && current.size > 0 ? weightOf(current) * Math.min(1, current.done / current.size) : 0;
      share = CHECKING + (1 - CHECKING) * (this.weight.total > 0 ? (this.weight.done + part) / this.weight.total : 1);
    }
    this.onProgress({
      stage: this.stage,
      share: Math.min(share, 0.99),
      looked: this.looked,
      jobs: this.jobs,
      files: { ...this.files },
      bytes: { done: this.bytes.done + (this.current?.done ?? 0), total: this.bytes.total },
      current: this.current && { ...this.current },
    });
  }

  private skip(path: string, reason: 'here' | 'there'): void {
    this.report.skipped.push(path);
    this.skipReasons.set(keyOf(path), reason);
  }

  // ---------- telling what changed ----------

  private async hashOf(key: string): Promise<string> {
    let hash = this.hashes.get(key);
    if (hash === undefined) {
      hash = await sha256(await this.fs.readBlob(this.local.files.get(key)!.path));
      this.hashes.set(key, hash);
    }
    return hash;
  }

  private async localStatus(key: string): Promise<LocalStatus> {
    const record = this.state.files[key];
    const entry = this.local.files.get(key);
    if (!entry) return record ? 'deleted' : 'none';
    if (!record) return 'new';
    if (entry.path === record.path && entry.size === record.size && entry.modified !== undefined && entry.modified === record.modified) return 'same';
    return (await this.hashOf(key)) === record.hash ? 'same' : 'changed';
  }

  private remoteStatus(key: string): RemoteStatus {
    const record = this.state.files[key];
    const file = this.remoteFiles.get(key);
    if (file) return !record ? 'new' : file.tag !== record.tag ? 'changed' : 'same';
    if (this.removed.has(key)) return record ? 'deleted' : 'none';
    return record ? 'same' : 'none';
  }

  // ---------- moves ----------

  /**
   * A file deleted at one path and added at another with the same content was moved: it is
   * moved on the other side too, so that a large file is not sent again.
   */
  private async moves(): Promise<void> {
    const records = this.state.files;
    // Moved here: a record whose file is gone, and a new file with its digest.
    const goneHere = Object.keys(records).filter((key) => !this.local.files.has(key) && this.remoteStatus(key) === 'same');
    for (const key of [...this.local.files.keys()].sort()) {
      if (records[key] || this.remoteStatus(key) !== 'none' || goneHere.length === 0) continue;
      const entry = this.local.files.get(key)!;
      const candidates = goneHere.filter((old) => records[old]!.size === entry.size);
      if (candidates.length === 0) continue;
      const hash = await this.hashOf(key);
      const old = candidates.find((k) => records[k]!.hash === hash);
      if (!old) continue;
      goneHere.splice(goneHere.indexOf(old), 1);
      const record = records[old]!;
      await this.attempt(entry.path, async () => {
        const moved = await this.remote.move(record.path, entry.path, record.tag);
        await this.refile(old, key, { ...record, path: entry.path, tag: moved.tag, modified: entry.modified });
        // The listing was taken before the move: what it says of either path is past.
        this.remoteFiles.delete(old);
        this.remoteFiles.delete(key);
        this.report.moved.push(entry.path);
        this.did(entry.path, 'moved', 'moved', 0, record.path);
      });
    }
    // Moved there: a record gone from the remote, and a new remote file with its tag.
    const goneThere = Object.keys(records).filter((key) => this.removed.has(key) && this.local.files.has(key));
    for (const [key, file] of [...this.remoteFiles].sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (records[key] || this.local.files.has(key)) continue;
      const old = goneThere.find((k) => records[k]!.tag === file.tag && records[k]!.size === file.size);
      if (!old || (await this.localStatus(old)) !== 'same') continue;
      goneThere.splice(goneThere.indexOf(old), 1);
      const entry = this.local.files.get(old)!;
      await this.fs.move(entry.path, file.path);
      this.local.files.delete(old);
      this.local.files.set(key, { ...entry, name: basename(file.path), path: file.path });
      this.removed.delete(old);
      this.remoteFiles.delete(key);
      await this.refile(old, key, { ...records[old]!, path: file.path });
      this.report.moved.push(file.path);
      this.report.followed.push({ from: entry.path, to: file.path });
      this.did(file.path, 'moved', 'moved', 0, entry.path);
    }
    // Renamed in case or Unicode form only: the key is the same, the spelling not.
    for (const [key, entry] of [...this.local.files]) {
      const record = records[key];
      if (!record) continue;
      const there = this.remoteFiles.get(key);
      const renamedHere = entry.path !== record.path;
      const renamedThere = there !== undefined && there.tag === record.tag && there.path !== record.path;
      if (renamedThere && !renamedHere) {
        await this.fs.move(entry.path, there.path);
        await moveBase(this.fs, record.path, there.path);
        this.local.files.set(key, { ...entry, name: basename(there.path), path: there.path });
        record.path = there.path;
        this.report.moved.push(there.path);
        this.report.followed.push({ from: entry.path, to: there.path });
        this.did(there.path, 'moved', 'moved', 0, entry.path);
      } else if (renamedHere && (!there || there.tag === record.tag) && !this.removed.has(key)) {
        await this.attempt(entry.path, async () => {
          const moved = await this.remote.move(record.path, entry.path, record.tag);
          await moveBase(this.fs, record.path, entry.path);
          const from = record.path;
          Object.assign(record, { path: entry.path, tag: moved.tag });
          this.report.moved.push(entry.path);
          this.did(entry.path, 'moved', 'moved', 0, from);
        });
      }
    }
  }

  // ---------- one file ----------

  private async download(key: string): Promise<void> {
    const file = this.remoteFiles.get(key)!;
    const path = this.local.files.get(key)?.path ?? file.path;
    const data = await this.remote.read(file.path, this.sent);
    if (!(await this.untouched(key, path))) return;
    await this.fs.writeBlob(path, data);
    await this.keep(key, path, file.tag, data);
    this.report.downloaded.push(path);
    this.result = 'brought';
  }

  private async upload(key: string, ifMatch: string | null): Promise<void> {
    const entry = this.local.files.get(key)!;
    const data = await this.fs.readBlob(entry.path);
    await this.attempt(entry.path, async () => {
      const sent = await this.remote.write(entry.path, data, ifMatch, this.sent);
      await this.keep(key, entry.path, sent.tag, data, entry.modified);
      this.report.uploaded.push(entry.path);
      this.result = 'sent';
    });
  }

  /** Changed on both sides: the same content is only linked; otherwise it is merged by its kind. */
  private async both(key: string): Promise<void> {
    const entry = this.local.files.get(key)!;
    const file = this.remoteFiles.get(key)!;
    const mine = await this.fs.readBlob(entry.path);
    if (file.hash !== undefined && this.remote.hashOf && (await this.remote.hashOf(mine)) === file.hash) {
      await this.keep(key, entry.path, file.tag, mine, entry.modified);
      return;
    }
    const theirs = await this.remote.read(file.path, this.sent);
    if ((await sha256(theirs)) === (await sha256(mine))) {
      await this.keep(key, entry.path, file.tag, mine, entry.modified);
      return;
    }
    const kind = mergeKindOf(entry.path);
    if (!kind) {
      // Not mergeable: the other side's keeps the name, this one goes beside it.
      if (!(await this.untouched(key, entry.path))) return;
      if (await this.conflictCopy(entry.path, mine)) {
        await this.fs.writeBlob(entry.path, theirs);
        await this.keep(key, entry.path, file.tag, theirs);
        this.report.downloaded.push(entry.path);
        this.result = 'brought';
      }
      return;
    }
    const record = this.state.files[key];
    const base = (record && (await readBase(this.fs, record.path))) ?? '';
    const [localText, remoteText] = [await mine.text(), await theirs.text()];
    const merged = mergeFile(kind, base, localText, remoteText);
    if (merged.text === remoteText) {
      if (!(await this.untouched(key, entry.path))) return;
      await this.fs.writeBlob(entry.path, theirs);
      await this.keep(key, entry.path, file.tag, theirs);
      this.report.merged.push(entry.path);
      this.result = 'merged';
      return;
    }
    // Up first: if the other side changed again meanwhile nothing is written here, and two
    // devices settling the same conflict at once cannot both make a copy.
    const result = new Blob([merged.text]);
    if (merged.text !== localText && !(await this.untouched(key, entry.path))) return;
    await this.attempt(entry.path, async () => {
      const sent = await this.remote.write(file.path, result, file.tag);
      // The other side's lines that clashed go beside the file whatever happens here next.
      if (!merged.clean) await this.conflictCopy(entry.path, theirs);
      if (merged.text !== localText) {
        // Saved here while the merge went up: the next turn merges that saving with what went up.
        if (!(await this.untouched(key, entry.path))) return;
        await this.fs.writeBlob(entry.path, result);
      }
      await this.keep(key, entry.path, sent.tag, result, merged.text === localText ? entry.modified : undefined);
      this.report.merged.push(entry.path);
      this.result = 'merged';
    });
  }

  /**
   * Another version of a file, put beside it and sent up: `Plan (conflict, Kaan's laptop,
   * 2026-10-07 1432).md`. A copy with the same content already there is enough.
   */
  private async conflictCopy(path: string, data: Blob): Promise<boolean> {
    const dir = dirname(path);
    const [name] = splitName(basename(path));
    const hash = await sha256(data);
    const siblings = await this.fs.list(dir);
    for (const sibling of siblings) {
      if (sibling.kind !== 'file' || !sibling.name.startsWith(`${name} (conflict`) || sibling.size !== data.size) continue;
      if ((await sha256(await this.fs.readBlob(sibling.path))) === hash) return true;
    }
    const taken = new Set(siblings.map((s) => s.path.toLowerCase()));
    const copy = conflictPath(path, this.device.name, this.now(), taken);
    let sent = false;
    await this.attempt(copy, async () => {
      const file = await this.remote.write(copy, data, null);
      await this.fs.writeBlob(copy, data);
      await this.keep(keyOf(copy), copy, file.tag, data);
      this.report.conflicts.push(copy);
      this.did(copy, 'copy', 'copy', data.size);
      sent = true;
    });
    return sent;
  }

  /**
   * Gone on the other side. What is in the trash already (the app moved it there, and the trash
   * came over) is removed; what went otherwise goes to this device's trash, as everything sync
   * deletes does.
   */
  private async removeHere(key: string): Promise<void> {
    const entry = this.local.files.get(key)!;
    const record = this.state.files[key]!;
    if (!(await this.untouched(key, entry.path))) return;
    if (isUnder(key, TRASH) || (await this.inTrash(record))) await this.fs.remove(entry.path);
    else await trashItem(this.fs, entry.path, this.now());
    this.report.removedHere.push(entry.path);
    this.result = 'trashed';
    await this.drop(key);
  }

  private trashed: Map<string, Entry> | null = null;

  /** Whether the trash holds a file with this content. */
  private async inTrash(record: FileRecord): Promise<boolean> {
    this.trashed ??= (await walk(this.fs, TRASH)).files;
    for (const entry of this.trashed.values()) {
      if (entry.size !== record.size) continue;
      if ((await sha256(await this.fs.readBlob(entry.path))) === record.hash) return true;
    }
    return false;
  }

  private async removeThere(key: string): Promise<void> {
    const record = this.state.files[key]!;
    await this.attempt(record.path, async () => {
      await this.remote.remove(record.path, record.tag);
      this.report.removedThere.push(record.path);
      this.result = 'removedThere';
      await this.drop(key);
    });
  }

  // ---------- folders ----------

  /**
   * Empty folders are synced too. A folder goes on the other side only when nothing synced is
   * left in it; one that still holds something stays, or comes back. One deleted here while the
   * turn ran is still known by what was in it: it is kept until a later turn takes that away
   * there, and then goes there too, rather than staying there empty and coming back.
   */
  private async folders(): Promise<void> {
    const now = await walk(this.fs);
    const holds = (dir: string) =>
      [...Object.keys(this.state.files), ...now.files.keys()].some((k) => isUnder(k, dir)) || [...now.dirs.keys()].some((k) => isUnder(k, dir));
    const keys = new Set([...now.dirs.keys(), ...this.remoteDirs.keys(), ...Object.keys(this.state.dirs)]);
    for (const key of [...keys].sort()) {
      const here = now.dirs.get(key);
      const known = this.state.dirs[key];
      const there = this.remoteDirs.has(key) || (known !== undefined && !this.removed.has(key));
      if (here && there) this.state.dirs[key] = here;
      else if (here && known === undefined) {
        await this.remote.mkdir(here);
        this.state.dirs[key] = here;
      } else if (here && this.removed.has(key)) {
        if (holds(key)) {
          await this.remote.mkdir(here);
          this.state.dirs[key] = here;
        } else {
          await this.fs.remove(here);
          delete this.state.dirs[key];
        }
      } else if (!here && there && known === undefined) {
        const path = this.remoteDirs.get(key)!;
        await this.fs.mkdir(path);
        this.state.dirs[key] = path;
      } else if (!here && known !== undefined) {
        if (holds(key)) continue;
        if (there) await this.remote.remove(known, null).catch(() => undefined);
        delete this.state.dirs[key];
      }
    }
  }

  // ---------- the state ----------

  /**
   * The file at `path` as synced: its tag on the other side, its size, time and digest here, and
   * its text if it merges. A file just written here has no time yet: the next turn reads it once
   * and keeps its time then, rather than this turn listing its folder after every file.
   */
  private async keep(key: string, path: string, tag: string, data: Blob, modified?: number): Promise<void> {
    this.state.files[key] = { path, tag, size: data.size, ...(modified !== undefined && { modified }), hash: await sha256(data) };
    if (mergeKindOf(path)) await writeBase(this.fs, path, await data.text());
    for (let dir = dirname(path); dir; dir = dirname(dir)) this.state.dirs[keyOf(dir)] ??= dir;
    await this.saveNowAndThen();
  }

  /** A record that moved to another key, its base text with it. */
  private async refile(from: string, to: string, record: FileRecord): Promise<void> {
    const old = this.state.files[from];
    delete this.state.files[from];
    this.state.files[to] = record;
    if (old && old.path !== record.path) await moveBase(this.fs, old.path, record.path);
    await this.saveNowAndThen();
  }

  private async drop(key: string): Promise<void> {
    const record = this.state.files[key];
    if (!record) return;
    delete this.state.files[key];
    await dropBase(this.fs, record.path);
    await this.saveNowAndThen();
  }

  /**
   * Whether the file at `path` is still as the turn found it (or still not there). One the user
   * saved meanwhile is not written over: it is left for the next turn, which tells it anew.
   */
  private async untouched(key: string, path: string): Promise<boolean> {
    const was = this.local.files.get(key);
    let now: Entry | null;
    if (this.fs.stat) now = await this.fs.stat(path);
    else now = await this.fs.readBlob(path).then((data) => ({ name: basename(path), path, kind: 'file' as const, size: data.size }), () => null);
    let same: boolean;
    if (!was || !now) same = !was && !now;
    else if (now.size !== was.size) same = false;
    else if (now.modified !== undefined && was.modified !== undefined) same = now.modified === was.modified;
    else same = (await sha256(await this.fs.readBlob(path))) === (await this.hashOf(key));
    if (!same) this.skip(path, 'here');
    return same;
  }

  /** Runs a write to the other side; one it refuses because the file changed there is left for the next turn. */
  private async attempt(path: string, write: () => Promise<void>): Promise<void> {
    try {
      await write();
    } catch (error) {
      if (!(error instanceof RemoteConflict)) throw error;
      this.skip(path, 'there');
    }
  }

  private async saveNowAndThen(): Promise<void> {
    if (Date.now() - this.savedAt < this.saveEveryMs) return;
    this.savedAt = Date.now();
    await saveSyncState(this.fs, this.state);
  }
}

/** One turn of syncing the space in `fs` with `remote`. Two turns of one space must not run at once. */
export async function syncOnce(fs: VaultFs, remote: RemoteStore, device: SyncDevice, options: SyncOptions = {}): Promise<SyncReport> {
  const state = await loadSyncState(fs, device.id);
  const turn = new Turn(fs, remote, device, state, options.now ?? (() => new Date()), options.saveEveryMs ?? 2000, options.onProgress);
  await turn.run();
  return turn.report;
}
