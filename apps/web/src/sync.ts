import {
  foldersNest,
  inSpace,
  type OneDriveFolder,
  OneDriveRemote,
  parseSpace,
  RemoteFolderGone,
  RemoteOffline,
  RemoteSignedOut,
  type RemoteStore,
  type SpaceInfo,
  type SyncDevice,
  type SyncProgress,
  syncOnce,
  type VaultFs,
} from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import { type Cloud, oneDrive, type SignInIntent, type SignInResult, takeSignInResult } from './cloud';
import type { Session, SpaceView } from './session';
import { isPhone } from './device';
import { isDesktop, vaultFolder } from './storage';

// Sync of the spaces with folders of the user's cloud drive: when a turn runs, what the app shows
// of it, and connecting and disconnecting. Each space syncs on its own, with its own folder and
// its own state in its own `.scrawl/`. The personal space is connected from its settings, and
// which folder it is connected to is kept on the device; every other space lives in a cloud
// folder from the moment it is added, which the device's list of spaces says. See
// design/cloud.md, sections 3, 6 and 7.

/**
 * A turn after a save comes this long after it, so that typing on does not start one each time.
 * Sooner on a phone, which is put away soon after something is jotted down.
 */
const afterSaveMs = () => (isPhone() ? 1500 : 5000);
/** While the app is open and on screen, a turn this often. */
const EVERY_MS = 30_000;
/** How often a turn's progress is shown at most; the engine tells it far more often. */
const PROGRESS_MS = 150;
const CONNECTION = 'scrawl.sync';
const DEVICE = 'scrawl.device';
/** What the engine and the adapter keep of a connection, all on the device. */
const STATE_FILES = ['.scrawl/sync-state.json', '.scrawl/sync-base'];
/** The key of the personal space among the spaces that sync. */
const PERSONAL = '';

/**
 * Runs a turn of one space alone among the tabs and windows of the app in this browser: they
 * share the space's files and its sync state, and two turns of one space must not run at once.
 * One asked for while another tab's runs waits for it, and then finds what that one brought.
 * Where the browser has no locks, it runs at once.
 */
function alone<T>(space: string | null, turn: () => Promise<T>): Promise<T> {
  if (!('locks' in navigator)) return turn();
  return navigator.locks.request(`scrawl.sync:${space ?? PERSONAL}`, turn);
}

export interface Connection {
  provider: 'onedrive';
  /** The space it is for: the desktop's notes folder, or the browser's own vault; `space:` and its id for a space beside it. */
  vault: string;
  account: { name: string; email: string };
  /** The folder: in the user's drive, or in `drive`, someone else's who shared it, `owner` being who. */
  folder: { id: string; path: string; drive?: string; owner?: string };
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

/** How one space's sync stands. */
export interface SpaceSync {
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
  /** The last conflict copy made, by its path in the app, with when, to point it out for a moment. */
  conflict: { path: string; at: number } | null;
}

/** A space that syncs, as the status bar and the sync panel list it. */
export interface SpaceSyncView extends SpaceSync {
  /** The space; null for the personal one. */
  space: string | null;
  name: string;
}

/** Sync as the app shows it: the personal space's, as its settings have it, and every space's. */
export interface SyncSnapshot extends SpaceSync {
  /** Whether sync can be connected here at all. */
  available: boolean;
  device: SyncDevice;
  /** Signed in in the browser to connect, the page back from Microsoft: the account to choose a folder in. */
  picking: Connection['account'] | null;
  /** Signed in in the browser to add a space, the page back from Microsoft: the account to choose its folder in. */
  adding: Connection['account'] | null;
  /** Back from allowing the wider permission: the folder is chosen among those shared with the user. */
  addingShared: boolean;
  /** Signing in in the browser went wrong, as the page came back. */
  signInError: string | null;
  /** Every space that syncs, the personal one first, the others in the sidebar's order. */
  all: SpaceSyncView[];
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
const FRESH = { syncedAt: null, error: null, turn: null, lastDone: null, conflict: null } satisfies Partial<SpaceSync>;

/** The personal space's key, which its connection is kept for: another notes folder is not connected with it. */
const vaultKey = () => (isDesktop ? (vaultFolder() ?? '') : 'browser');

/** The connection kept for the personal space here, before anything opens; null when there is none. */
export function keptConnection(): Connection | null {
  const kept = read<Connection>(CONNECTION);
  return kept && kept.vault === vaultKey() ? kept : null;
}

/** The connection of a space beside the personal one, from where the device's list says it lives; null when it lives nowhere sync reaches. */
function connectionOf(space: SpaceView): Connection | null {
  const { source } = space;
  if (source?.provider !== 'onedrive' || !source.place.item) return null;
  const { item, path = '', drive, owner } = source.place;
  return { provider: 'onedrive', vault: `space:${space.id}`, account: { name: '', email: source.account ?? '' }, folder: { id: item, path, ...(drive && { drive }), ...(owner && { owner }) } };
}

/** One space's turns: its files, its folder there, and how they stand. */
interface Unit extends SpaceSyncView {
  vault: VaultFs;
  store: RemoteStore | null;
  running: Promise<void> | null;
  /** A turn was asked for while one ran: one more follows it. */
  again: boolean;
  /** Taken out of sync: no turn starts, and one running ends unheard. */
  gone: boolean;
}

/** A folder's path in the drive in one spelling, OneDrive's being of any case. */
const drivePath = (path: string) => path.toLowerCase();

export class SyncService {
  private snapshot: SyncSnapshot = {
    available: true,
    connection: null,
    phase: 'off',
    ...FRESH,
    device: { id: '', name: '' },
    picking: null,
    adding: null,
    addingShared: false,
    signInError: null,
    all: [],
  };
  private versions = 0;
  private readonly listeners = new Set<() => void>();
  /** Every space that syncs, by its id, the personal one under `PERSONAL`. */
  private units = new Map<string, Unit>();
  private afterSave = 0;
  private every = 0;
  private stops: (() => void)[] = [];
  /** The personal space's files, as last opened. */
  private vault: VaultFs | null = null;
  /** The spaces beside it, as the session last showed them. */
  private spaces: SpaceView[] = [];
  /** How a sign-in that left the page ended, dealt with once the space is open. */
  private signedIn: SignInResult | null = takeSignInResult();

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

  /** Shows the units as they are now: the personal one's sync on top, every one's in the list. */
  private show() {
    const personal = this.units.get(PERSONAL);
    const all = [...(personal ? [personal] : []), ...this.spaces.flatMap((space) => this.units.get(space.id) ?? [])];
    const personalName = this.session.getSnapshot().space.name ?? t('settings.personal');
    const view = (unit: Unit): SpaceSyncView => ({
      space: unit.space,
      name: unit.space === null ? personalName : unit.name,
      connection: unit.connection,
      phase: unit.phase,
      syncedAt: unit.syncedAt,
      error: unit.error,
      turn: unit.turn,
      lastDone: unit.lastDone,
      conflict: unit.conflict,
    });
    const { space: _s, name: _n, ...own } = personal ? view(personal) : { space: null, name: '', connection: null, phase: 'off' as const, ...FRESH };
    this.set({ ...own, all: all.map(view) });
  }

  private change(unit: Unit, patch: Partial<SpaceSync>) {
    Object.assign(unit, patch);
    if (!unit.gone) this.show();
  }

  /** Follows the session: once the spaces are open, their connections are looked up and turns begin. */
  start() {
    // Turns wait for this device's id; the spaces opened meanwhile begin once it is known.
    void loadDevice().then((device) => {
      this.set({ device });
      this.session.deviceName = device.name;
      this.syncNow();
    });
    let wasSaved = true;
    const onSession = () => {
      const { ready, saved, spaces } = this.session.getSnapshot();
      const vault = ready ? this.session.vault : null;
      if (vault !== this.vault) this.open(vault);
      if (ready && spaces !== this.spaces) this.follow(spaces);
      // A save done: a turn shortly, unless more saves come first.
      if (saved && !wasSaved) this.soon();
      wasSaved = saved;
    };
    this.stops.push(this.session.subscribe(onSession));
    onSession();
    const onFocus = () => this.syncNow();
    const onOnline = () => this.syncNow();
    // Put away, what was typed goes at once: a phone stops the page soon after, and what is left
    // here would meet what is typed meanwhile on another device. Back on screen, what came from
    // there comes before more is typed. A phone tells neither with focus.
    const onVisibility = () => this.syncNow();
    const onShow = (event: PageTransitionEvent) => event.persisted && this.syncNow();
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', onShow);
    this.stops.push(
      () => window.removeEventListener('focus', onFocus),
      () => window.removeEventListener('online', onOnline),
      () => document.removeEventListener('visibilitychange', onVisibility),
      () => window.removeEventListener('pageshow', onShow),
    );
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

  private unit(space: string | null, name: string, vault: VaultFs, connection: Connection): Unit {
    return { space, name, vault, connection, phase: 'idle', ...FRESH, store: null, running: null, again: false, gone: false };
  }

  /** The personal space opened, or none: its own connection, if it has one. */
  private open(vault: VaultFs | null) {
    this.vault = vault;
    const old = this.units.get(PERSONAL);
    if (old) old.gone = true;
    this.units.delete(PERSONAL);
    const kept = vault ? read<Connection>(CONNECTION) : null;
    const connection = kept && kept.vault === vaultKey() && !oneDrive().fake ? kept : null;
    if (vault && connection) this.units.set(PERSONAL, this.unit(null, '', vault, connection));
    this.show();
    if (connection) this.syncNow(PERSONAL);
    if (vault) this.afterSignIn();
  }

  /** The spaces beside the personal one changed: a space added starts syncing, one removed stops, one renamed is shown so. */
  private follow(spaces: SpaceView[]) {
    this.spaces = spaces;
    const fresh: string[] = [];
    for (const space of spaces) {
      const connection = connectionOf(space);
      const vault = this.session.spaceVault(space.id);
      const unit = this.units.get(space.id);
      // The same folder: the same turns go on, its files as the session opened them again.
      if (unit && connection && vault && unit.connection?.folder.id === connection.folder.id) {
        unit.name = space.name;
        if (unit.vault !== vault) Object.assign(unit, { vault, store: null });
        continue;
      }
      if (unit) unit.gone = true;
      this.units.delete(space.id);
      if (!connection || !vault) continue;
      this.units.set(space.id, this.unit(space.id, space.name, vault, connection));
      // Two turns never run on one space at once: a new one waits for the old one to end.
      if (unit?.running) void unit.running.finally(() => this.syncNow(space.id));
      else fresh.push(space.id);
    }
    for (const [key, unit] of this.units) {
      if (key === PERSONAL || spaces.some((space) => space.id === key)) continue;
      unit.gone = true;
      this.units.delete(key);
    }
    this.show();
    for (const key of fresh) this.syncNow(key);
  }

  /**
   * Takes a space out of sync before it leaves this device, waiting for a turn that runs to end:
   * its files may be deleted next, and no turn may see them go and take that to the cloud.
   */
  async forgetSpace(id: string) {
    const unit = this.units.get(id);
    if (!unit) return;
    unit.gone = true;
    this.units.delete(id);
    this.show();
    await unit.running?.catch(() => undefined);
  }

  /**
   * The page came back from Microsoft: signed in to connect, the folder is chosen next; signed in
   * to add a space, its folder is chosen next; signed in again, turns go on by themselves. What
   * went wrong is told, but for a renewal on opening, which the next turn tells if it matters.
   */
  private afterSignIn() {
    const done = this.signedIn;
    this.signedIn = null;
    if (!done) return;
    if (done.error) {
      if (done.intent !== 'renew') this.set({ signInError: t('sync.signInFailed', { error: done.error }) });
      return;
    }
    if (done.intent !== 'connect' && done.intent !== 'space' && done.intent !== 'shared') return;
    this.account().then(
      (account) => this.set(done.intent === 'connect' ? { picking: account } : { adding: account, addingShared: done.intent === 'shared' }),
      (error: unknown) => this.set({ signInError: t('sync.signInFailed', { error: error instanceof Error ? error.message : String(error) }) }),
    );
  }

  /** The folder window took the account it was opened for. */
  donePicking() {
    this.set({ picking: null, adding: null, addingShared: false });
  }

  clearSignInError() {
    if (this.snapshot.signInError) this.set({ signInError: null });
  }

  /** In the browser: what is being typed is written, then the page goes to Microsoft to sign in, and comes back. */
  async leaveToSignIn(intent: SignInIntent) {
    await this.session.beforeSync();
    oneDrive().signIn(intent, this.snapshot.connection?.account.email);
  }

  private soon() {
    window.clearTimeout(this.afterSave);
    this.afterSave = window.setTimeout(() => this.syncNow(), afterSaveMs());
  }

  /** A turn now, of one space or of every one; while one runs, another right after it. */
  syncNow(space?: string | null) {
    const keys = space === undefined ? [...this.units.keys()] : [space ?? PERSONAL];
    for (const key of keys) {
      const unit = this.units.get(key);
      if (!unit || unit.gone || !unit.connection || !this.snapshot.device.id) continue;
      if (unit.running) unit.again = true;
      else unit.running = this.turn(unit);
    }
  }

  private storeFor(unit: Unit): RemoteStore {
    const { id, drive } = unit.connection!.folder;
    unit.store ??= oneDrive().remote(id, unit.vault, drive);
    return unit.store;
  }

  private async turn(unit: Unit) {
    const { device } = this.snapshot;
    const connection = unit.connection;
    window.clearTimeout(this.afterSave);
    // The engine tells how the turn stands at every step; it is shown a few times a second.
    const startedAt = Date.now();
    let progress = NOTHING_YET;
    let sendingSince: number | null = null;
    let timer = 0;
    const view = (endedAt: number | null, stopped: boolean): TurnView => ({ progress, version: ++this.versions, startedAt, sendingSince, endedAt, stopped });
    const showTurn = () => {
      timer = 0;
      this.change(unit, { turn: view(null, false) });
    };
    const onProgress = (next: SyncProgress) => {
      progress = next;
      if (next.stage === 'sending' && sendingSince === null) sendingSince = Date.now();
      timer ||= window.setTimeout(showTurn, PROGRESS_MS);
    };
    this.change(unit, { phase: 'syncing', turn: view(null, false) });
    try {
      const report = await alone(unit.space, async () => {
        // The space may have been closed, removed or disconnected while another tab's turn ran.
        if (unit.gone || unit.connection !== connection) return null;
        await this.session.beforeSync();
        return syncOnce(unit.vault, this.storeFor(unit), device, { onProgress });
      });
      window.clearTimeout(timer);
      // The space may have been closed, removed or disconnected while the turn ran.
      if (!report || unit.gone || unit.connection !== connection) return;
      await this.session.afterSync(report, unit.space);
      const copy = report.conflicts.at(-1);
      const turn = view(Date.now(), false);
      this.change(unit, {
        phase: 'idle',
        syncedAt: Date.now(),
        error: null,
        turn,
        lastDone: progress.jobs.some((job) => job.state === 'done') ? turn : unit.lastDone,
        ...(copy && { conflict: { path: inSpace(unit.space, copy), at: Date.now() } }),
      });
    } catch (error) {
      window.clearTimeout(timer);
      if (unit.gone || unit.connection !== connection) return;
      const turn = view(Date.now(), true);
      const lastDone = progress.jobs.some((job) => job.state === 'done') ? turn : unit.lastDone;
      if (error instanceof RemoteOffline) this.change(unit, { phase: 'offline', turn, lastDone });
      else if (error instanceof RemoteSignedOut) this.change(unit, { phase: 'signedOut', turn, lastDone });
      else if (error instanceof RemoteFolderGone) this.change(unit, { phase: 'folderGone', turn, lastDone });
      else this.change(unit, { phase: 'failed', error: error instanceof Error ? error.message : String(error), turn, lastDone });
    } finally {
      unit.running = null;
      if (unit.again && !unit.gone) {
        unit.again = false;
        this.syncNow(unit.space);
      }
    }
  }

  // ---------- connecting ----------

  /** The cloud drive, for signing in and choosing a folder. */
  cloud(): Cloud {
    return oneDrive();
  }

  /** The folders in a folder of the drive, its root for null. */
  folders(parent: string | null): Promise<OneDriveFolder[]> {
    return oneDrive().account().folders(parent);
  }

  createFolder(parent: string | null, name: string): Promise<OneDriveFolder> {
    return oneDrive().account().createFolder(parent, name);
  }

  /** Who is signed in. */
  account(): Promise<{ name: string; email: string }> {
    return oneDrive().account().me();
  }

  /** Who is signed in, without signing in: null when no key is kept, or it no longer works. */
  async signedInAs(): Promise<{ name: string; email: string } | null> {
    if (!(await oneDrive().signedIn())) return null;
    return this.account().catch(() => null);
  }

  /**
   * Whether a folder of the drive can be a space: not one already, the personal space's own or
   * another's, and neither inside one nor holding one. A message why not; null when it can.
   */
  refusal(folder: Connection['folder']): string | null {
    const taken = [this.units.get(PERSONAL)?.connection, ...this.spaces.map(connectionOf)].filter((each): each is Connection => !!each);
    if (taken.some((each) => each.folder.id === folder.id && each.folder.drive === folder.drive)) return t('error.spaceThere');
    // Paths only nest in one drive: the user's own, or the same one someone shared from.
    if (taken.some((each) => each.folder.drive === folder.drive && foldersNest(drivePath(each.folder.path), drivePath(folder.path)))) return t('error.spaceNests');
    return null;
  }

  /** Whether the sign-in reaches folders shared with the user; without it such a folder asks to allow it first. */
  wide(): boolean {
    return oneDrive().wide();
  }

  /** The folder a sharing link leads to, as a folder of a space: in its owner's drive. Null when the link is not to a folder. */
  async sharedFolder(link: string): Promise<Connection['folder'] | null> {
    const found = await oneDrive().account().shared(link);
    return found && { id: found.id, path: `/${found.name}`, drive: found.drive, ...(found.owner && { owner: found.owner }) };
  }

  /** What a folder of the drive says of itself as a space, from its own `.scrawl/space.json`: its id and its name; nothing when it is not one yet. */
  async spaceAt(folder: Connection['folder']): Promise<SpaceInfo> {
    const text = await oneDrive().account().readText(folder.id, '.scrawl/space.json', folder.drive);
    return text === null ? {} : parseSpace(text);
  }

  /**
   * Connects the personal space to a folder of the drive and starts its first turn: what is in
   * both is put together, nothing lost. Whatever was kept of an earlier connection goes first.
   */
  async connect(account: Connection['account'], folder: Connection['folder']) {
    const vault = this.vault;
    if (!vault) return;
    await this.forgetState(vault);
    const connection: Connection = { provider: 'onedrive', vault: vaultKey(), account, folder };
    // The stand-in drive forgets everything on reload, so its connection is not kept either.
    if (!oneDrive().fake) write(CONNECTION, connection);
    const old = this.units.get(PERSONAL);
    if (old) old.gone = true;
    this.units.set(PERSONAL, this.unit(null, '', vault, connection));
    this.show();
    this.syncNow(PERSONAL);
  }

  /**
   * Disconnects the personal space: what sync kept of the connection goes; notes here and files
   * there stay as they are. The key goes too, unless another space still syncs with it.
   */
  async disconnect() {
    const vault = this.vault;
    write(CONNECTION, null);
    const unit = this.units.get(PERSONAL);
    if (unit) unit.gone = true;
    this.units.delete(PERSONAL);
    this.show();
    if (this.units.size === 0) {
      await oneDrive()
        .signOut()
        .catch(() => undefined);
    }
    if (vault) await this.forgetState(vault);
  }

  private async forgetState(vault: VaultFs) {
    for (const path of STATE_FILES) await vault.remove(path).catch(() => undefined);
    await OneDriveRemote.forget(vault);
  }

  /** Signed in again after the key stopped working: turns go on, of every space. */
  signedInAgain() {
    for (const unit of this.units.values()) this.change(unit, { phase: 'idle' });
    this.syncNow();
  }

  renameDevice(name: string) {
    const device = { ...this.snapshot.device, name: name.trim() || this.snapshot.device.name };
    write(DEVICE, { id: device.id, name: name.trim() || undefined });
    this.set({ device });
  }
}
