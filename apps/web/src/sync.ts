import {
  clearLeftPlace,
  foldersNest,
  inSpace,
  localPath,
  MemoryFs,
  type MovedMark,
  movedPath,
  type OneDriveFolder,
  OneDriveRemote,
  parseSpace,
  RemoteFolderGone,
  RemoteMoved,
  RemoteOffline,
  RemoteSignedOut,
  type RemoteStore,
  ServerLive,
  type SpaceInfo,
  type SpaceSource,
  serializeMoved,
  spaceOf,
  type SyncDevice,
  type SyncProgress,
  syncOnce,
  fetchAway,
  type VaultFs,
} from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import { type Cloud, oneDrive, type SignInIntent, signInSettled, takeSignInResult } from './cloud';
import type { Session, SpaceView } from './session';
import { isPhone, LEAVE_OVER } from './device';
import { type KnownServer, serverKey, serverRemote, signOutOf } from './servers';
import { isDesktop, vaultFolder } from './storage';

// Sync of the spaces with folders of the user's cloud drive: when a turn runs, what the app shows
// of it, and connecting and disconnecting. Each space syncs on its own, with its own folder and
// its own state in its own `.scrawl/`. The personal space is connected from its settings, and
// which folder it is connected to is kept on the device; every other space lives in a cloud
// folder from the moment it is added, which the device's list of spaces says. A space can live on
// a Scrawl server too, the team's own, synced the same way (design/server.md, section 7). See
// design/cloud.md, sections 3, 6 and 7.

/**
 * A turn after a save comes this long after it, so that typing on does not start one each time.
 * Sooner on a phone, which is put away soon after something is jotted down.
 */
const afterSaveMs = () => (isPhone() ? 1500 : 5000);
/** While the app is open and on screen, a turn this often; for a space on a server that says what changes as it does, every other time. */
const EVERY_MS = 30_000;
/** A save goes to a server this soon: the others see it in a second or two. */
const SERVER_AFTER_SAVE_MS = 1000;
/** How often a turn's progress is shown at most; the engine tells it far more often. */
const PROGRESS_MS = 150;
const CONNECTION = 'scrawl.sync';
/** The place the personal space left, its copy there to be deleted once the new place has had a turn. */
const CLEAR = 'scrawl.syncClear';
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
  provider: 'onedrive' | 'server';
  /** The space it is for: the desktop's notes folder, or the browser's own vault; `space:` and its id for a space beside it. */
  vault: string;
  account: { name: string; email: string };
  /**
   * The folder: in the user's drive, or in `drive`, someone else's who shared it, `owner` being
   * who. On a server, the space there, by its id, with no path.
   */
  folder: { id: string; path: string; drive?: string; owner?: string };
  /** On a server: its address. */
  server?: string;
  /**
   * The personal space: since when this device syncs with this place, in milliseconds. A mark of
   * the space moving away left before it is of a move this device followed or chose past; one
   * left after it stops the turn. Kept without it, every mark counts.
   */
  since?: number;
}

/** Where a connection leads, as a mark or the list of spaces says it. */
export function sourceOf(connection: Pick<Connection, 'provider' | 'account' | 'folder' | 'server'>): SpaceSource {
  const { account, folder } = connection;
  if (connection.provider === 'server') return { provider: 'server', account: account.email, place: { url: connection.server ?? '', space: folder.id } };
  return { provider: 'onedrive', account: account.email || account.name, place: { item: folder.id, path: folder.path, ...(folder.drive && { drive: folder.drive }), ...(folder.owner && { owner: folder.owner }) } };
}

/**
 * How sync stands: off (not connected), resting between turns, in a turn, or kept from going on:
 * no network, signed out, the folder gone, or another error.
 */
export type SyncPhase = 'off' | 'idle' | 'syncing' | 'offline' | 'signedOut' | 'folderGone' | 'moved' | 'failed';

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
  /** On a server whose live channel is open: what changes there comes in as it does. */
  live: boolean;
  /** Why a space on a server stopped: this person was taken out of it, or signed out of the server on this device. */
  why: 'removed' | 'left' | null;
  /** The personal space moved on another device: where to, by which device, when. */
  moved: MovedMark | null;
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
  /** A server whose key no longer works, to sign in to again: its address and the account. */
  serverSignIn: { url: string; email: string } | null;
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
const FRESH = { syncedAt: null, error: null, turn: null, lastDone: null, conflict: null, live: false, why: null, moved: null } satisfies Partial<SpaceSync>;

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
  if (source?.provider === 'server' && source.place.url && source.place.space) {
    return { provider: 'server', vault: `space:${space.id}`, account: { name: '', email: source.account ?? '' }, folder: { id: source.place.space, path: '' }, server: source.place.url };
  }
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
  /** The last turn missed a file of this device that was being written just then: the next one goes at once. */
  missed: boolean;
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
    serverSignIn: null,
    all: [],
  };
  private versions = 0;
  private readonly listeners = new Set<() => void>();
  /** Every space that syncs, by its id, the personal one under `PERSONAL`. */
  private units = new Map<string, Unit>();
  private afterSave = 0;
  private afterServerSave = 0;
  private every = 0;
  /** Each server's live channel, by its address, open while a space on it syncs here. */
  private lives = new Map<string, ServerLive>();
  /** The servers whose live channel is open now. */
  private liveOn = new Set<string>();
  private stops: (() => void)[] = [];
  /** The personal space's files, as last opened. */
  private vault: VaultFs | null = null;
  /** The spaces beside it, as the session last showed them. */
  private spaces: SpaceView[] = [];

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
      live: unit.live,
      why: unit.why,
      moved: unit.moved,
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
    // A file left in the cloud comes when it is asked for.
    this.session.fetcher = (path, onBytes) => this.fetch(path, onBytes);
    // Turns wait for this device's id; the spaces opened meanwhile begin once it is known.
    void loadDevice().then((device) => {
      this.set({ device });
      this.session.deviceName = device.name;
      this.session.deviceId = device.id;
      void this.session.carry();
      this.syncNow();
    });
    let wasSaved = true;
    let seen: { spaces: SpaceView[] | null; reading: ReadonlySet<string> | null } = { spaces: null, reading: null };
    const onSession = () => {
      const { ready, saved, spaces, reading } = this.session.getSnapshot();
      const vault = ready ? this.session.vault : null;
      if (vault !== this.vault) this.open(vault);
      // As the app opens, each space syncs once it is read.
      if (ready && (spaces !== seen.spaces || reading !== seen.reading)) {
        seen = { spaces, reading };
        this.follow(reading.size > 0 ? spaces.filter((space) => !reading.has(space.id)) : spaces);
      }
      // A save done: a turn shortly, unless more saves come first.
      if (saved && !wasSaved) this.soon();
      wasSaved = saved;
    };
    this.stops.push(this.session.subscribe(onSession));
    onSession();
    const onFocus = () => this.syncNow();
    const onOnline = () => {
      this.wakeLives();
      this.syncNow();
    };
    // Put away, what was typed goes at once: a phone stops the page soon after, and what is left
    // here would meet what is typed meanwhile on another device. Back on screen, what came from
    // there comes before more is typed. A phone tells neither with focus.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') this.wakeLives();
      this.syncNow();
    };
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
    let ticks = 0;
    this.every = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      ticks++;
      // A space on a server that tells what changes needs the turn only as a check, every other time.
      for (const [key, unit] of this.units) if (!(unit.live && ticks % 2)) this.syncNow(key);
    }, EVERY_MS);
  }

  dispose() {
    for (const stop of this.stops) stop();
    this.stops = [];
    window.clearInterval(this.every);
    window.clearTimeout(this.afterSave);
    window.clearTimeout(this.afterServerSave);
    for (const live of this.lives.values()) live.stop();
    this.lives.clear();
  }

  /**
   * Opens a live channel to every server a space syncs on here, and closes those no space needs:
   * a change there starts that space's turn at once.
   */
  private followLives() {
    const wanted = new Set([...this.units.values()].flatMap((unit) => (unit.connection?.server ? [unit.connection.server] : [])));
    for (const [url, live] of this.lives) {
      if (wanted.has(url)) continue;
      live.stop();
      this.lives.delete(url);
      this.liveOn.delete(url);
    }
    for (const url of wanted) {
      if (this.lives.has(url)) continue;
      const live = new ServerLive({
        url,
        token: () => serverKey(url),
        onChanged: (space) => {
          for (const [key, unit] of this.units) if (unit.connection?.server === url && unit.connection.folder.id === space) this.syncNow(key);
        },
        onLive: (on) => {
          if (on) this.liveOn.add(url);
          else this.liveOn.delete(url);
          for (const unit of this.units.values()) if (unit.connection?.server === url) this.change(unit, { live: on });
        },
        onSignedOut: () => this.signedOutOf(url),
      });
      this.lives.set(url, live);
      live.start();
    }
    // A space added on a server whose channel is open hears it too.
    for (const unit of this.units.values()) if (unit.connection?.server) unit.live = this.liveOn.has(unit.connection.server);
  }

  /** The network came back or the app came to the front: a channel that closed opens again now. */
  private wakeLives() {
    for (const live of this.lives.values()) live.wake();
  }

  private unit(space: string | null, name: string, vault: VaultFs, connection: Connection): Unit {
    return { space, name, vault, connection, phase: 'idle', ...FRESH, store: null, running: null, again: false, gone: false, missed: false };
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
    // How a sign-in that left the page ended is dealt with once the space is open and the return is finished.
    if (vault) void signInSettled().then(() => this.afterSignIn());
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
      if (unit && connection && vault && unit.connection?.folder.id === connection.folder.id && unit.connection.server === connection.server) {
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
    this.followLives();
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
    this.followLives();
    this.show();
    await unit.running?.catch(() => undefined);
  }

  /**
   * The page came back from Microsoft: signed in to connect, the folder is chosen next; signed in
   * to add a space, its folder is chosen next; signed in again, turns go on by themselves. What
   * went wrong is told, but for a renewal on opening, which the next turn tells if it matters.
   */
  private afterSignIn() {
    const done = takeSignInResult();
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

  /** A save done: a turn shortly, a space on a server's sooner; more saves meanwhile wait for it. */
  private soon() {
    window.clearTimeout(this.afterSave);
    window.clearTimeout(this.afterServerSave);
    const keys = (server: boolean) => [...this.units].flatMap(([key, unit]) => (!!unit.connection?.server === server ? [key] : []));
    this.afterSave = window.setTimeout(() => keys(false).forEach((key) => this.syncNow(key)), afterSaveMs());
    this.afterServerSave = window.setTimeout(() => keys(true).forEach((key) => this.syncNow(key)), SERVER_AFTER_SAVE_MS);
  }

  /** A turn now, of one space or of every one; while one runs, another right after it. */
  syncNow(space?: string | null) {
    const keys = space === undefined ? [...this.units.keys()] : [space ?? PERSONAL];
    for (const key of keys) {
      const unit = this.units.get(key);
      if (!unit || unit.gone || !unit.connection || !this.snapshot.device.id || unit.phase === 'moved') continue;
      if (unit.running) unit.again = true;
      else unit.running = this.turn(unit);
    }
  }

  private storeFor(unit: Unit): RemoteStore {
    const { folder, server } = unit.connection!;
    unit.store ??= server ? serverRemote(server, folder.id) : oneDrive().remote(folder.id, unit.vault, folder.drive);
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
        // The personal space looks for a mark of it moving away, left after this device came to this place.
        return syncOnce(unit.vault, this.storeFor(unit), device, { onProgress, leaveOver: LEAVE_OVER, ...(unit.space === null && { movedSince: connection?.since ?? 0 }) });
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
        why: null,
        turn,
        lastDone: progress.jobs.some((job) => job.state === 'done') ? turn : unit.lastDone,
        moved: null,
        ...(copy && { conflict: { path: inSpace(unit.space, copy), at: Date.now() } }),
      });
      unit.missed = false;
      // The personal space's first turn in a new place went through: the copy it left goes now, asked for.
      if (unit.space === null) void this.clearLeft();
    } catch (error) {
      window.clearTimeout(timer);
      if (unit.gone || unit.connection !== connection) return;
      const turn = view(Date.now(), true);
      const lastDone = progress.jobs.some((job) => job.state === 'done') ? turn : unit.lastDone;
      // A file of this device that was being written just then, as a space opens and the user's
      // row goes into its people: the turn goes again at once, and only a second miss is told.
      const missed = error instanceof DOMException && error.name === 'NotFoundError';
      if (missed && !unit.missed) {
        unit.missed = true;
        unit.again = true;
      } else if (error instanceof RemoteOffline) this.change(unit, { phase: 'offline', turn, lastDone });
      // Signed out on purpose stays said so, turn after turn, until it is signed in to again.
      else if (error instanceof RemoteSignedOut) this.change(unit, { phase: 'signedOut', why: unit.why === 'left' ? 'left' : null, turn, lastDone });
      else if (error instanceof RemoteFolderGone) this.change(unit, { phase: 'folderGone', why: error.removed ? 'removed' : null, turn, lastDone });
      // Moved on another device: nothing was done, and no turn goes until this device follows.
      else if (error instanceof RemoteMoved) this.change(unit, { phase: 'moved', moved: error.mark, turn, lastDone });
      else this.change(unit, { phase: 'failed', error: error instanceof Error ? error.message : String(error), turn, lastDone });
      if (!missed) unit.missed = false;
    } finally {
      unit.running = null;
      if (unit.again && !unit.gone) {
        unit.again = false;
        this.syncNow(unit.space);
      }
    }
  }

  /**
   * Brings here an attached file its space's sync left in the cloud, told how many of its bytes
   * came so far. False when the space does not sync here, or the file is not away. It waits for
   * a turn of its space, as a turn waits for it.
   */
  async fetch(path: string, onBytes?: (done: number) => void): Promise<boolean> {
    const unit = this.units.get(spaceOf(path) ?? PERSONAL);
    if (!unit || unit.gone || !unit.connection) return false;
    const { device } = this.snapshot;
    return alone(unit.space, () => fetchAway(unit.vault, this.storeFor(unit), device, localPath(path), onBytes));
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
    const taken = [this.units.get(PERSONAL)?.connection, ...this.spaces.map(connectionOf)].filter((each): each is Connection => each?.provider === 'onedrive');
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
  /** `since`: following a move made on another device, when it was made; else now. */
  async connect(account: Connection['account'], folder: Connection['folder'], since?: number) {
    // The stand-in drive forgets everything on reload, so its connection is not kept either.
    await this.attach({ provider: 'onedrive', vault: vaultKey(), account, folder, ...(since !== undefined && { since }) }, !oneDrive().fake);
  }

  /**
   * Connects the personal space to its space on a server the device is signed in to, as `connect`
   * does to a folder of the drive: what is here and there is put together (design/spaces.md).
   */
  async connectServer(url: string, email: string, space: string, since?: number) {
    await this.attach({ provider: 'server', vault: vaultKey(), account: { name: '', email }, folder: { id: space, path: '' }, server: url, ...(since !== undefined && { since }) }, true);
  }

  /**
   * Moves the personal space to another place (design/spaces.md 5): first the mark, in the place
   * it leaves, which stops the other devices still syncing there; then the new place, where the
   * first turn puts what is here and there together; and, asked for, once that turn has gone
   * through, the copy in the old place goes but for its marks.
   */
  async move(to: Omit<Connection, 'vault' | 'since'>, deleteLeft: boolean) {
    const unit = this.units.get(PERSONAL);
    const from = unit?.connection;
    if (!unit || !from) return;
    const at = Date.now();
    const mark: MovedMark = { to: sourceOf(to), by: this.snapshot.device.name, at };
    await this.storeFor(unit).write(movedPath(at), new Blob([serializeMoved(mark)]), null);
    write(CLEAR, deleteLeft ? from : null);
    await this.attach({ ...to, vault: vaultKey(), since: at }, to.provider === 'server' || !oneDrive().fake);
  }

  /**
   * Deletes the copy the personal space left in its old place, asked for when it moved: every
   * file and folder there but the marks, which tell the devices still syncing there where it went.
   * It goes on after a restart until it is done.
   */
  private async clearLeft() {
    const left = read<Connection>(CLEAR);
    if (!left || this.clearing) return;
    this.clearing = true;
    try {
      // A store of its own: what the drive's store keeps of a folder is not the new place's to hold.
      const store = left.server ? serverRemote(left.server, left.folder.id) : oneDrive().remote(left.folder.id, new MemoryFs(), left.folder.drive);
      await clearLeftPlace(store);
      write(CLEAR, null);
    } catch {
      // Unreached now: it goes on after the next turn.
    } finally {
      this.clearing = false;
    }
  }

  private clearing = false;

  private async attach(connection: Connection, keep: boolean) {
    const vault = this.vault;
    if (!vault) return;
    await this.forgetState(vault);
    connection = { ...connection, since: connection.since ?? Date.now() };
    if (keep) write(CONNECTION, connection);
    const old = this.units.get(PERSONAL);
    if (old) old.gone = true;
    this.units.set(PERSONAL, this.unit(null, '', vault, connection));
    this.show();
    // A space on a server tells of its changes over the server's live channel.
    if (connection.server) this.followLives();
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
    this.followLives();
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

  /**
   * Signed in to a server, or set it up: this device takes the account's id, the person being one
   * on every device, and its name and email where Profile has none; its spaces here sync again.
   */
  signedInToServer(server: KnownServer) {
    this.session.takeAccount(server);
    this.signedInTo(server.url);
  }

  /** Signed in to a server again: its live channel opens with the new key, and its spaces here sync. */
  private signedInTo(url: string) {
    if (![...this.units.values()].some((unit) => unit.connection?.server === url)) return;
    this.lives.get(url)?.stop();
    this.lives.delete(url);
    this.liveOn.delete(url);
    this.followLives();
    for (const unit of this.units.values()) if (unit.connection?.server === url) this.change(unit, { phase: 'idle', why: null });
    this.syncNow();
  }

  /** A server's key no longer works: the app asks to sign in to it again, with the account it had. */
  askServerSignIn(url: string, email: string) {
    this.set({ serverSignIn: { url, email } });
  }

  /** Signed in to a server again, or not: the spaces on it sync again either way, and say so if not. */
  doneServerSignIn(signedIn: boolean) {
    const url = this.snapshot.serverSignIn?.url;
    this.set({ serverSignIn: null });
    if (signedIn && url) this.signedInTo(url);
  }

  /**
   * The spaces on a server, signed out of it on this device: they wait until it is signed in to
   * again. `left` when the person signed out themselves, which stays said when the server's
   * channel tells it afterwards.
   */
  signedOutOf(url: string, left = false) {
    for (const unit of this.units.values()) {
      if (unit.connection?.server !== url) continue;
      unit.store = null;
      this.change(unit, { phase: 'signedOut', why: left || unit.why === 'left' ? 'left' : null });
    }
  }

  /** Signs out of a server on this device, as the person asked: its channel closes, and its spaces say so until it is signed in to again. */
  async signOutOfServer(url: string) {
    this.lives.get(url)?.stop();
    this.lives.delete(url);
    this.liveOn.delete(url);
    this.signedOutOf(url, true);
    await signOutOf(url);
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
