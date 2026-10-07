import {
  type OneDriveFolder,
  OneDriveRemote,
  RemoteFolderGone,
  RemoteOffline,
  RemoteSignedOut,
  type RemoteStore,
  type SyncDevice,
  type SyncProgress,
  syncOnce,
  type VaultFs,
} from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import { type Cloud, oneDrive } from './cloud';
import type { Session } from './session';
import { isDesktop, vaultFolder } from './storage';

// Sync of the personal space with a folder in the user's cloud drive: when a turn runs, what the
// app shows of it, and connecting and disconnecting. Which folder a space is connected to is kept
// on the device, not in the space. See design/cloud.md, sections 3, 6 and 7.

/** A turn after a save comes this long after it, so that typing on does not start one each time. */
const AFTER_SAVE_MS = 5000;
/** While the app is open and on screen, a turn this often. */
const EVERY_MS = 30_000;
/** How often a turn's progress is shown at most; the engine tells it far more often. */
const PROGRESS_MS = 150;
const CONNECTION = 'scrawl.sync';
const DEVICE = 'scrawl.device';
/** What the engine and the adapter keep of a connection, all on the device. */
const STATE_FILES = ['.scrawl/sync-state.json', '.scrawl/sync-base'];

export interface Connection {
  provider: 'onedrive';
  /** The space it is for: the desktop's notes folder, or the browser's own vault. */
  vault: string;
  account: { name: string; email: string };
  folder: { id: string; path: string };
}

/**
 * How sync stands: off (not connected), resting between turns, in a turn, or kept from going on:
 * no network, signed out, the folder gone, or another error.
 */
export type SyncPhase = 'off' | 'idle' | 'syncing' | 'offline' | 'signedOut' | 'folderGone' | 'failed';

/** A turn as the sync panel shows it: how it stands, or how it ended. */
export interface TurnView {
  progress: SyncProgress;
  /** Changes whenever the turn does: its jobs are changed in place. */
  version: number;
  startedAt: number;
  /** When its jobs began to go, to tell the time left. */
  sendingSince: number | null;
  /** When it ended; null while it runs. */
  endedAt: number | null;
  /** Ended by an error, perhaps with jobs still waiting. */
  stopped: boolean;
}

const NOTHING_YET: SyncProgress = { stage: 'reading', share: 0, looked: 0, jobs: [], files: { done: 0, total: 0 }, bytes: { done: 0, total: 0 }, current: null };

export interface SyncSnapshot {
  /** Whether sync can be connected here at all. */
  available: boolean;
  connection: Connection | null;
  phase: SyncPhase;
  /** When the last turn finished well. */
  syncedAt: number | null;
  /** What went wrong, for `failed`. */
  error: string | null;
  /** The turn running, or the last one. */
  turn: TurnView | null;
  /** The last turn that did something, for what the panel lists as done once a turn does nothing. */
  lastDone: TurnView | null;
  /** The last conflict copy made, with when, to point it out for a moment. */
  conflict: { path: string; at: number } | null;
  device: SyncDevice;
}

function read<T>(key: string): T | null {
  try {
    const text = localStorage.getItem(key);
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not kept: it holds until the app closes.
  }
}

/** A name for a browser, from what it says it runs on. */
function browserDeviceName(): string {
  const agent = navigator.userAgent;
  for (const [pattern, name] of [
    [/iPhone/, 'iPhone'],
    [/iPad/, 'iPad'],
    [/Android/, 'Android'],
    [/Mac OS X/, 'Mac'],
    [/Windows/, 'Windows'],
    [/Linux/, 'Linux'],
  ] as const) {
    if (pattern.test(agent)) return name;
  }
  return t('sync.thisBrowser');
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return (await import('@tauri-apps/api/core')).invoke<T>(command, args);
}

/** This device: an id made once, and the name conflict copies carry, the computer's own unless changed. */
async function loadDevice(): Promise<SyncDevice> {
  const kept = read<Partial<SyncDevice>>(DEVICE);
  const id = kept?.id ?? crypto.randomUUID();
  let name = kept?.name?.trim();
  if (!name) name = (isDesktop ? await invoke<string | null>('device_name').catch(() => null) : null) ?? browserDeviceName();
  const device = { id, name };
  if (!kept?.id) write(DEVICE, { id });
  return device;
}

/** What a new connection, or none, starts from. */
const FRESH = { syncedAt: null, error: null, turn: null, lastDone: null, conflict: null } satisfies Partial<SyncSnapshot>;

/** The space's key, which a connection is kept for: another notes folder is not connected with it. */
const vaultKey = () => (isDesktop ? (vaultFolder() ?? '') : 'browser');

export class SyncService {
  private snapshot: SyncSnapshot = {
    available: oneDrive() !== null,
    connection: null,
    phase: 'off',
    syncedAt: null,
    error: null,
    turn: null,
    lastDone: null,
    conflict: null,
    device: { id: '', name: '' },
  };
  private versions = 0;
  private readonly listeners = new Set<() => void>();
  private remote: { connection: Connection; vault: VaultFs; store: RemoteStore } | null = null;
  private running = false;
  /** A turn was asked for while one ran: one more follows it. */
  private again = false;
  private afterSave = 0;
  private every = 0;
  private stops: (() => void)[] = [];
  private vault: VaultFs | null = null;

  constructor(private readonly session: Session) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = () => this.snapshot;

  private set(patch: Partial<SyncSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  /** Follows the session: once a space is open, its connection is looked up and turns begin. */
  start() {
    void loadDevice().then((device) => this.set({ device }));
    let wasSaved = true;
    const onSession = () => {
      const { ready, saved } = this.session.getSnapshot();
      const vault = ready ? this.session.vault : null;
      if (vault !== this.vault) this.open(vault);
      // A save done: a turn shortly, unless more saves come first.
      if (saved && !wasSaved) this.soon();
      wasSaved = saved;
    };
    this.stops.push(this.session.subscribe(onSession));
    onSession();
    const onFocus = () => this.syncNow();
    const onOnline = () => this.syncNow();
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    this.stops.push(() => window.removeEventListener('focus', onFocus), () => window.removeEventListener('online', onOnline));
    this.every = window.setInterval(() => {
      if (document.visibilityState === 'visible') this.syncNow();
    }, EVERY_MS);
  }

  dispose() {
    for (const stop of this.stops) stop();
    this.stops = [];
    window.clearInterval(this.every);
    window.clearTimeout(this.afterSave);
  }

  /** Another space opened, or none: its own connection, if it has one. */
  private open(vault: VaultFs | null) {
    this.vault = vault;
    this.remote = null;
    const kept = vault ? read<Connection>(CONNECTION) : null;
    const connection = kept && kept.vault === vaultKey() && oneDrive() && !oneDrive()!.fake ? kept : null;
    this.set({ connection, phase: connection ? 'idle' : 'off', ...FRESH });
    if (connection) this.syncNow();
  }

  private soon() {
    window.clearTimeout(this.afterSave);
    this.afterSave = window.setTimeout(() => this.syncNow(), AFTER_SAVE_MS);
  }

  /** A turn now; while one runs, another right after it. */
  syncNow() {
    if (!this.snapshot.connection || !this.vault) return;
    if (this.running) {
      this.again = true;
      return;
    }
    void this.turn();
  }

  private storeFor(connection: Connection, vault: VaultFs): RemoteStore {
    if (this.remote?.connection !== connection || this.remote.vault !== vault) {
      this.remote = { connection, vault, store: oneDrive()!.remote(connection.folder.id, vault) };
    }
    return this.remote.store;
  }

  private async turn() {
    const { connection, device } = this.snapshot;
    const vault = this.vault;
    if (!connection || !vault || !device.id) return;
    this.running = true;
    window.clearTimeout(this.afterSave);
    // The engine tells how the turn stands at every step; it is shown a few times a second.
    const startedAt = Date.now();
    let progress = NOTHING_YET;
    let sendingSince: number | null = null;
    let timer = 0;
    const view = (endedAt: number | null, stopped: boolean): TurnView => ({ progress, version: ++this.versions, startedAt, sendingSince, endedAt, stopped });
    const show = () => {
      timer = 0;
      if (this.snapshot.connection === connection) this.set({ turn: view(null, false) });
    };
    const onProgress = (next: SyncProgress) => {
      progress = next;
      if (next.stage === 'sending' && sendingSince === null) sendingSince = Date.now();
      timer ||= window.setTimeout(show, PROGRESS_MS);
    };
    this.set({ phase: 'syncing', turn: view(null, false) });
    try {
      await this.session.beforeSync();
      const report = await syncOnce(vault, this.storeFor(connection, vault), device, { onProgress });
      window.clearTimeout(timer);
      // The space may have been closed or disconnected while the turn ran.
      if (this.snapshot.connection !== connection || this.vault !== vault) return;
      await this.session.afterSync(report);
      const copy = report.conflicts.at(-1);
      const turn = view(Date.now(), false);
      this.set({
        phase: 'idle',
        syncedAt: Date.now(),
        error: null,
        turn,
        lastDone: progress.jobs.some((job) => job.state === 'done') ? turn : this.snapshot.lastDone,
        ...(copy && { conflict: { path: copy, at: Date.now() } }),
      });
    } catch (error) {
      window.clearTimeout(timer);
      if (this.snapshot.connection !== connection) return;
      const turn = view(Date.now(), true);
      const lastDone = progress.jobs.some((job) => job.state === 'done') ? turn : this.snapshot.lastDone;
      if (error instanceof RemoteOffline) this.set({ phase: 'offline', turn, lastDone });
      else if (error instanceof RemoteSignedOut) this.set({ phase: 'signedOut', turn, lastDone });
      else if (error instanceof RemoteFolderGone) this.set({ phase: 'folderGone', turn, lastDone });
      else this.set({ phase: 'failed', error: error instanceof Error ? error.message : String(error), turn, lastDone });
    } finally {
      this.running = false;
      if (this.again) {
        this.again = false;
        this.syncNow();
      }
    }
  }

  // ---------- connecting ----------

  /** The cloud drive, for signing in and choosing a folder. */
  cloud(): Cloud | null {
    return oneDrive();
  }

  /** The folders in a folder of the drive, its root for null. */
  folders(parent: string | null): Promise<OneDriveFolder[]> {
    return oneDrive()!.account().folders(parent);
  }

  createFolder(parent: string | null, name: string): Promise<OneDriveFolder> {
    return oneDrive()!.account().createFolder(parent, name);
  }

  /** Who is signed in. */
  account(): Promise<{ name: string; email: string }> {
    return oneDrive()!.account().me();
  }

  /**
   * Connects the open space to a folder of the drive and starts its first turn: what is in both
   * is put together, nothing lost. Whatever was kept of an earlier connection goes first.
   */
  async connect(account: Connection['account'], folder: Connection['folder']) {
    const vault = this.vault;
    if (!vault) return;
    await this.forgetState(vault);
    const connection: Connection = { provider: 'onedrive', vault: vaultKey(), account, folder };
    // The stand-in drive forgets everything on reload, so its connection is not kept either.
    if (!oneDrive()!.fake) write(CONNECTION, connection);
    this.remote = null;
    this.set({ connection, phase: 'idle', ...FRESH });
    this.syncNow();
  }

  /** Disconnects: the key is deleted, and what sync kept of the connection; notes here and files there stay as they are. */
  async disconnect() {
    const vault = this.vault;
    write(CONNECTION, null);
    this.remote = null;
    this.set({ connection: null, phase: 'off', ...FRESH });
    await oneDrive()
      ?.signOut()
      .catch(() => undefined);
    if (vault) await this.forgetState(vault);
  }

  private async forgetState(vault: VaultFs) {
    for (const path of STATE_FILES) await vault.remove(path).catch(() => undefined);
    await OneDriveRemote.forget(vault);
  }

  /** Signed in again after the key stopped working: turns go on. */
  signedInAgain() {
    this.set({ phase: 'idle' });
    this.syncNow();
  }

  renameDevice(name: string) {
    const device = { ...this.snapshot.device, name: name.trim() || this.snapshot.device.name };
    write(DEVICE, { id: device.id, name: name.trim() || undefined });
    this.set({ device });
  }
}
