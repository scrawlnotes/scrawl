import { basename, dirname, type OneDriveFolder, oneDriveTakes, type SyncJob, type SyncJobResult } from '@scrawlnotes/core';
import { sizeText } from '@scrawlnotes/editor';
import { locale, type MessageKey, t } from '@scrawlnotes/i18n';
import { type CSSProperties, type KeyboardEvent, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { clientId, DEFAULT_CLIENT_ID, setClientId } from './cloud';
import { pageBox, pageWindow } from './device';
import { Icon } from './Icon';
import { useNarrow } from './narrow';
import type { Connection, SpaceSync, SpaceSyncView, SyncPhase, SyncService, SyncSnapshot, TurnView } from './sync';
import { isDesktop } from './storage';

// What sync shows: its row in a space's settings, this device's name, the window to choose a
// folder of the cloud drive in, and its place in the status bar. After the Settings views of
// design/mockups.html (Sync, Connect, Choose folder) and its status bar.

/** How long ago a moment was, as the status bar and the settings say it. */
export function ago(at: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  if (seconds < 5) return t('ago.now');
  if (seconds < 60) return t('ago.seconds', { count: seconds });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('ago.minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? t('ago.hours', { count: hours }) : t('ago.days', { count: Math.floor(hours / 24) });
}

/** Draws again every few seconds, so that "12 s ago" keeps up. */
export function useTicking(on: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!on) return;
    const timer = window.setInterval(() => setTick((n) => n + 1), 5000);
    return () => window.clearInterval(timer);
  }, [on]);
}

/**
 * Why a folder in the cloud is gone, and what to do: the personal space chooses another; a space
 * lives in its folder, so it is gone with it, or no longer open to you, and its copy stays here.
 */
const goneLong = (space: string | null) => t(space ? 'sync.spaceGoneLong' : 'sync.folderGoneLong');

/** Where a phase stands, in the settings: words, and the colour of its dot; `space` null for the personal one. */
function stateOf(sync: SpaceSync, space: string | null = null): { text: string; tone: 'ok' | 'busy' | 'off' | 'bad' } {
  const { phase, syncedAt, error } = sync;
  if (phase === 'syncing') return { text: t('sync.syncingPct', { pct: percent(sync.turn?.progress.share ?? 0) }), tone: 'busy' };
  if (phase === 'offline') return { text: t('sync.offlineLong'), tone: 'off' };
  if (phase === 'signedOut') return { text: t('sync.signedOutLong'), tone: 'bad' };
  if (phase === 'folderGone') return { text: goneLong(space), tone: 'bad' };
  if (phase === 'failed') return { text: t('sync.failedLong', { error: error ?? '' }), tone: 'bad' };
  return { text: syncedAt === null ? t('sync.notYet') : t('sync.syncedAgo', { ago: ago(syncedAt) }), tone: 'ok' };
}

export interface SyncRowProps {
  sync: SyncSnapshot;
  service: SyncService;
}

/**
 * A space's sync, in its card: connected, its cloud, account, folder, how it stands and what can
 * be done; or not yet, with a sentence and the way to connect. Signing in goes on in the
 * system browser; the folder is chosen after it.
 */
export function SyncRow({ sync, service }: SyncRowProps) {
  const [signing, setSigning] = useState<{ cancel(): void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<Connection['account'] | null>(null);
  const [ownApp, setOwnApp] = useState(false);
  const { connection } = sync;
  useTicking(connection !== null);

  useEffect(() => () => signing?.cancel(), [signing]);

  // Back from Microsoft in the browser, signed in to connect: the folder is chosen now.
  useEffect(() => {
    if (!sync.picking) return;
    setPicking(sync.picking);
    service.donePicking();
  }, [sync.picking, service]);

  // Signs in, then asks for the folder, unless the key that is kept still works. In the browser
  // the page goes to Microsoft and comes back, and the folder is asked for then.
  const signIn = async (then: 'pick' | 'resume') => {
    const cloud = service.cloud();
    setError(null);
    service.clearSignInError();
    if (cloud.redirects) {
      await service.leaveToSignIn(then === 'pick' ? 'connect' : 'again');
      return;
    }
    const attempt = cloud.signIn(then === 'pick' ? 'connect' : 'again');
    setSigning(attempt);
    try {
      await attempt.done;
    } catch (failure) {
      setSigning(null);
      if (failure instanceof DOMException && failure.name === 'AbortError') return;
      const message = String(failure instanceof Error ? failure.message : failure);
      setError(message === 'timeout' ? t('sync.signInTimeout') : t('sync.signInFailed', { error: message }));
      return;
    }
    setSigning(null);
    if (then === 'resume') {
      service.signedInAgain();
      return;
    }
    try {
      setPicking(await service.account());
    } catch (failure) {
      setError(t('sync.signInFailed', { error: failure instanceof Error ? failure.message : String(failure) }));
    }
  };

  const picker = picking && (
    <FolderPicker
      account={picking}
      service={service}
      onUse={(folder) => {
        setPicking(null);
        void service.connect(picking, folder);
      }}
      onCancel={() => {
        setPicking(null);
        // Not connected after all: the key kept for it goes, unless a space syncs with it.
        if (!sync.connection && sync.all.length === 0) void service.cloud().signOut();
      }}
    />
  );

  if (signing) {
    return (
      <div className="st-sync">
        <span className="fl">{t('sync.label')}</span>
        <div className="what">
          <p className="waiting">
            <span className="spinner" aria-hidden="true" />
            {t('sync.waitingForBrowser')}
          </p>
          <span className="acts">
            <button
              type="button"
              className="st-btn"
              onClick={() => {
                signing.cancel();
                setSigning(null);
              }}
            >
              {t('sync.cancel')}
            </button>
          </span>
        </div>
      </div>
    );
  }

  const failed = error ?? sync.signInError;

  if (!connection) {
    return (
      <div className="st-sync">
        <span className="fl">{t('sync.label')}</span>
        <div className="what">
          <p>{t('sync.notSynced')}</p>
          <span className="acts">
            <button type="button" className="st-btn go" onClick={() => void signIn('pick')}>
              <CloudIcon />
              {t('sync.connectOneDrive')}
            </button>
          </span>
          {failed && (
            <p className="err" role="alert">
              {failed}
            </p>
          )}
          <p className="small">{t('sync.access')}</p>
          {!ownApp && (
            <button type="button" className="st-link" onClick={() => setOwnApp(true)}>
              {t('sync.ownApp')}
            </button>
          )}
          {ownApp && <OwnApp onDone={() => setOwnApp(false)} />}
        </div>
        {picker}
      </div>
    );
  }

  const state = stateOf(sync);
  const notSynced = sync.turn?.progress.jobs.filter((job) => job.state === 'skipped' || job.state === 'refused').length ?? 0;
  return (
    <div className="st-sync">
      <span className="fl">{t('sync.label')}</span>
      <div className="what">
        <span className="who">
          <CloudIcon />
          <b>{t('sync.oneDrive')}</b>
          <small>{connection.account.email || connection.account.name}</small>
        </span>
        <span className="where">{connection.folder.path}</span>
        <span className={`state ${state.tone}`} role="status">
          <i />
          {state.text}
        </span>
        <span className="acts">
          {sync.phase === 'signedOut' ? (
            <button type="button" className="st-btn go" onClick={() => void signIn('resume')}>
              {t('sync.signInAgain')}
            </button>
          ) : sync.phase === 'folderGone' ? (
            <button type="button" className="st-btn go" onClick={() => setPicking(connection.account)}>
              {t('sync.chooseFolder')}
            </button>
          ) : (
            <button type="button" className="st-btn" disabled={sync.phase === 'syncing'} onClick={() => service.syncNow()}>
              {t('sync.syncNow')}
            </button>
          )}
          <button type="button" className="st-btn" onClick={() => void service.disconnect()}>
            {t('sync.disconnect')}
          </button>
        </span>
        {failed && (
          <p className="err" role="alert">
            {failed}
          </p>
        )}
        {notSynced > 0 && <p className="small">{t('sync.notSyncedCount', { count: notSynced })}</p>}
      </div>
      {picker}
    </div>
  );
}

/**
 * The sync of a space beside the personal one, on its page: its cloud, account and folder, how it
 * stands, and Sync now; Sign in again once the key stopped working. A space lives in its cloud
 * folder, so there is no disconnecting it: it is removed from the device instead.
 */
export function SpaceSyncRow({ view, service }: { view: SpaceSyncView | undefined; service: SyncService }) {
  const [signing, setSigning] = useState<{ cancel(): void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useTicking(true);
  useEffect(() => () => signing?.cancel(), [signing]);
  const signIn = async () => {
    const cloud = service.cloud();
    setError(null);
    if (cloud.redirects) {
      await service.leaveToSignIn('again');
      return;
    }
    const attempt = cloud.signIn('again');
    setSigning(attempt);
    try {
      await attempt.done;
      service.signedInAgain();
    } catch (failure) {
      if (!(failure instanceof DOMException && failure.name === 'AbortError')) setError(t('sync.signInFailed', { error: failure instanceof Error ? failure.message : String(failure) }));
    } finally {
      setSigning(null);
    }
  };
  if (!view?.connection) {
    return (
      <div className="st-sync">
        <span className="fl">{t('sync.label')}</span>
        <div className="what">
          <p>{t('sync.notSynced')}</p>
        </div>
      </div>
    );
  }
  const state = stateOf(view, view.space);
  const { connection } = view;
  return (
    <div className="st-sync">
      <span className="fl">{t('sync.label')}</span>
      <div className="what">
        <span className="who">
          <CloudIcon />
          <b>{t('sync.oneDrive')}</b>
          <small>
            {connection.account.email || connection.account.name} · {placeWords(connection.folder.path)}
          </small>
        </span>
        <span className={`state ${state.tone}`} role="status">
          <i />
          {state.text}
        </span>
        <span className="acts">
          {signing ? (
            <button type="button" className="st-btn" onClick={() => signing.cancel()}>
              {t('sync.cancel')}
            </button>
          ) : view.phase === 'signedOut' ? (
            <button type="button" className="st-btn go" onClick={() => void signIn()}>
              {t('sync.signInAgain')}
            </button>
          ) : (
            <button type="button" className="st-btn" disabled={view.phase === 'syncing'} onClick={() => service.syncNow(view.space)}>
              {t('sync.syncNow')}
            </button>
          )}
        </span>
        {signing && <p className="small">{t('sync.waitingForBrowser')}</p>}
        {error && (
          <p className="err" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

/** A cloud's name, by the provider a space's source names: OneDrive now, more as they come. */
export function providerName(provider: string): string {
  return provider === 'onedrive' ? t('sync.oneDrive') : provider;
}

/** A folder of a cloud drive in words, as its folder window shows the way to it: "My files › Clients". */
export function placeWords(path: string): string {
  return [t('sync.myFiles'), ...path.split('/').filter(Boolean)].join(' › ');
}

/** The user's own app registration, for those who would rather not sign in through Scrawl's. */
function OwnApp({ onDone }: { onDone: () => void }) {
  const kept = clientId();
  const [draft, setDraft] = useState(kept === DEFAULT_CLIENT_ID ? '' : kept);
  const save = () => {
    setClientId(draft);
    onDone();
  };
  return (
    <div className="own-app">
      <p className="small">{isDesktop ? t('sync.ownAppAbout') : t('sync.ownAppAboutWeb', { address: `${window.location.origin}/` })}</p>
      <div className="st-row bare">
        <input
          value={draft}
          placeholder={t('sync.clientId')}
          aria-label={t('sync.clientId')}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            save();
          }}
        />
        <button type="button" className="primary" onClick={save}>
          {t('settings.save')}
        </button>
      </div>
    </div>
  );
}

/** This device's name, which conflict copies made here carry. */
export function ThisDevice({ sync, service }: SyncRowProps) {
  const name = sync.device.name;
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const changed = draft.trim() !== '' && draft.trim() !== name;
  const save = () => {
    if (changed) service.renameDevice(draft);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') save();
    else if (event.key === 'Escape' && draft !== name) setDraft(name);
    else return;
    event.preventDefault();
  };
  return (
    <>
      <span className="st-label">{t('sync.thisDevice')}</span>
      <div className="st-row">
        <label className="fl" htmlFor="device-name">
          {t('settings.name')}
        </label>
        <input id="device-name" value={draft} autoComplete="off" onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} />
        <button type="button" className="primary" disabled={!changed} onClick={save}>
          {t('settings.save')}
        </button>
      </div>
      <p className="st-note">{t('sync.deviceAbout')}</p>
    </>
  );
}

export function CloudIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 18h10.5a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.6 9.06 4.5 4.5 0 0 0 7 18z" />
    </svg>
  );
}

function ResyncIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19.5 12a7.5 7.5 0 0 1-13.1 5M4.5 12a7.5 7.5 0 0 1 13.1-5" />
      <path d="M17.6 3.5V7h-3.5M6.4 20.5V17h3.5" />
    </svg>
  );
}

/** The folder suggested for the personal space, at the top of the drive. */
const DEFAULT_FOLDER = 'Scrawl';

interface PickerProps {
  account: Connection['account'];
  service: SyncService;
  /** The folder offered at the top of the drive, made with one click if it is not there: `Scrawl` for the personal space, a space's name for it. */
  suggested?: string;
  onUse: (folder: Connection['folder']) => void;
  onCancel: () => void;
}

/**
 * Choosing the folder of the cloud drive the space goes in: its folders, gone into and out of,
 * one chosen, a new one made in place. At the top of the drive `Scrawl` is offered, made with
 * one click if it is not there.
 */
export function FolderPicker({ account, service, suggested, onUse, onCancel }: PickerProps) {
  const SUGGESTED = suggested?.trim() || DEFAULT_FOLDER;
  /** The folders gone into, from the top of the drive (id null). */
  const [trail, setTrail] = useState<{ id: string | null; name: string }[]>([{ id: null, name: t('sync.oneDrive') }]);
  const [folders, setFolders] = useState<OneDriveFolder[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  /** The folder chosen: an id, or `new:` and a name for the suggested one not made yet. */
  const [chosen, setChosen] = useState<string | null>(null);
  const [making, setMaking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const here = trail.at(-1)!;
  const atTop = trail.length === 1;

  useEffect(() => {
    box.current?.focus();
  }, []);

  const load = async (id: string | null, choose?: string) => {
    setFolders(null);
    setFailed(null);
    try {
      const list = await service.folders(id);
      setFolders(list);
      const suggested = id === null ? list.find((f) => f.name.toLowerCase() === SUGGESTED.toLowerCase()) : undefined;
      setChosen(choose ?? suggested?.id ?? (id === null ? `new:${SUGGESTED}` : null));
    } catch (error) {
      setFailed(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    void load(here.id);
  }, [here.id]);

  const enter = (folder: OneDriveFolder) => {
    setMaking(null);
    setTrail([...trail, { id: folder.id, name: folder.name }]);
  };
  const up = () => {
    setMaking(null);
    setTrail(trail.slice(0, -1));
  };
  const pathOf = (name: string) => `/${[...trail.slice(1).map((step) => step.name), name].join('/')}`;

  const suggestedNew = atTop && folders !== null && !folders.some((f) => f.name.toLowerCase() === SUGGESTED.toLowerCase());
  const chosenFolder = folders?.find((f) => f.id === chosen) ?? null;
  // Nothing chosen inside a folder: that folder itself.
  const target = chosenFolder ? chosenFolder.name : chosen?.startsWith('new:') ? SUGGESTED : atTop ? null : here.name;

  const use = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (chosen?.startsWith('new:')) {
        const made = await service.createFolder(here.id, SUGGESTED);
        onUse({ id: made.id, path: pathOf(made.name) });
      } else if (chosenFolder) onUse({ id: chosenFolder.id, path: pathOf(chosenFolder.name) });
      else if (here.id) onUse({ id: here.id, path: `/${trail.slice(1).map((step) => step.name).join('/')}` });
    } catch (error) {
      setFailed(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const make = async () => {
    const name = making?.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const made = await service.createFolder(here.id, name);
      setMaking(null);
      await load(here.id, made.id);
    } catch (error) {
      setFailed(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    // The settings behind close on Escape too; this window takes it first.
    event.preventDefault();
    event.stopPropagation();
    if (making !== null) setMaking(null);
    else onCancel();
  };

  return (
    <div className="fp-ovl" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <div ref={box} className="fp" role="dialog" aria-modal="true" aria-label={t('sync.chooseTitle')} tabIndex={-1} onKeyDown={onKeyDown}>
        <h3>
          {t('sync.chooseTitle')}
          <small>{account.email || account.name}</small>
        </h3>
        <div className="crumbs">
          {trail.map((step, index) =>
            index === trail.length - 1 ? (
              <b key={step.id ?? 'top'}>{step.name}</b>
            ) : (
              <span key={step.id ?? 'top'}>
                <button type="button" onClick={() => setTrail(trail.slice(0, index + 1))}>
                  {step.name}
                </button>
                <span className="sep" aria-hidden="true">
                  ›
                </span>
              </span>
            ),
          )}
        </div>
        <div className="list" role="listbox" aria-label={here.name}>
          {!atTop && (
            <button type="button" className="row up" onClick={up}>
              ‹ {trail.at(-2)!.name}
            </button>
          )}
          {making !== null && (
            <div className="row making">
              <Icon name="folder" />
              <input
                autoFocus
                value={making}
                placeholder={t('sync.folderName')}
                aria-label={t('sync.folderName')}
                onChange={(event) => setMaking(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  void make();
                }}
              />
              <button type="button" className="st-btn go" disabled={!making.trim() || busy} onClick={() => void make()}>
                {t('sync.add')}
              </button>
              <button type="button" className="st-btn" onClick={() => setMaking(null)}>
                {t('sync.cancel')}
              </button>
            </div>
          )}
          {folders === null && !failed && <p className="empty">{t('sync.loading')}</p>}
          {suggestedNew && (
            <button
              type="button"
              role="option"
              aria-selected={chosen === `new:${SUGGESTED}`}
              className={`row${chosen === `new:${SUGGESTED}` ? ' on' : ''}`}
              onClick={() => setChosen(`new:${SUGGESTED}`)}
            >
              <Icon name="folder" />
              <span className="name">{SUGGESTED}</span>
              <small className="new">{t('sync.newTag')}</small>
            </button>
          )}
          {folders?.map((folder) => (
            <div key={folder.id} className={`row${folder.id === chosen ? ' on' : ''}`}>
              <button
                type="button"
                role="option"
                aria-selected={folder.id === chosen}
                className="pick"
                onClick={() => setChosen(folder.id)}
                onDoubleClick={() => enter(folder)}
              >
                <Icon name="folder" />
                <span className="name">{folder.name}</span>
              </button>
              <button type="button" className="open" title={t('sync.openFolder', { name: folder.name })} aria-label={t('sync.openFolder', { name: folder.name })} onClick={() => enter(folder)}>
                ›
              </button>
            </div>
          ))}
          {folders !== null && folders.length === 0 && !suggestedNew && making === null && <p className="empty">{t('sync.noFolders')}</p>}
        </div>
        {failed ? (
          <p className="note err" role="alert">
            {failed}{' '}
            <button type="button" className="st-link" onClick={() => void load(here.id)}>
              {t('sync.retry')}
            </button>
          </p>
        ) : (
          <p className="note">{t('sync.putTogether')}</p>
        )}
        <div className="foot">
          <button type="button" className="st-btn" disabled={making !== null} onClick={() => setMaking('')}>
            {t('sync.newFolder')}
          </button>
          <button type="button" className="st-btn" onClick={onCancel}>
            {t('sync.cancel')}
          </button>
          <button type="button" className="st-btn go" disabled={!target || busy} onClick={() => void use()}>
            {target ? t('sync.use', { name: target }) : t('sync.useNone')}
          </button>
        </div>
      </div>
    </div>
  );
}

const STATUS: Record<Exclude<SyncPhase, 'off' | 'idle' | 'syncing'>, MessageKey> = {
  offline: 'sync.offline',
  signedOut: 'sync.signedOut',
  folderGone: 'sync.folderGone',
  failed: 'sync.failed',
};

/** How long a new conflict copy is pointed out in the status bar. */
const CONFLICT_SHOWN_MS = 10_000;
/** How long the pointer rests on the status bar's sync before its panel opens, and how long it may be away before it closes. */
const HOVER_OPEN_MS = 350;
const HOVER_CLOSE_MS = 300;

/** Which of the spaces that sync the status bar speaks of: one in a turn, else one kept from going on, else the one synced longest ago. */
function standing(all: readonly SpaceSyncView[]): SpaceSyncView | null {
  const worst: SyncPhase[] = ['syncing', 'signedOut', 'folderGone', 'failed', 'offline'];
  for (const phase of worst) {
    const found = all.find((unit) => unit.phase === phase);
    if (found) return found;
  }
  return [...all].sort((a, b) => (a.syncedAt ?? 0) - (b.syncedAt ?? 0))[0] ?? null;
}

/** A space's key among those that sync: its id, or the personal one's. */
const keyOf = (unit: SpaceSyncView) => unit.space ?? '';

export interface SyncStatusProps {
  sync: SyncSnapshot;
  /** A turn of one space, or of every one. */
  onSyncNow: (space?: string | null) => void;
  /** Opens Settings at a space's sync: the personal space's for null. */
  onSettings: (space: string | null) => void;
  /** Signs in again after the key stopped working. */
  onSignIn: () => void;
  onOpenCopy: (path: string) => void;
}

/**
 * Sync in the status bar: how it stands, with the share done while a turn runs, Sync now beside
 * it, and a new conflict copy for a moment. Resting the pointer on it opens the sync panel, a
 * click keeps it open; on a phone a tap opens it as a sheet. Nothing while not connected.
 */
export function SyncStatus({ sync, onSyncNow, onSettings, onSignIn, onOpenCopy }: SyncStatusProps) {
  useTicking(sync.all.length > 0);
  const narrow = useNarrow();
  const [copy, setCopy] = useState<string | null>(null);
  /** The panel: shown while the pointer is on it, kept open by a click, or closed. */
  const [open, setOpen] = useState<'hover' | 'kept' | null>(null);
  const item = useRef<HTMLSpanElement>(null);
  const timers = useRef({ open: 0, close: 0 });

  // The latest conflict copy of any space.
  const conflict = sync.all.reduce<SpaceSyncView['conflict']>((latest, unit) => (unit.conflict && (!latest || unit.conflict.at > latest.at) ? unit.conflict : latest), null);
  useEffect(() => {
    if (!conflict || Date.now() - conflict.at > CONFLICT_SHOWN_MS) return;
    setCopy(conflict.path);
    const timer = window.setTimeout(() => setCopy(null), CONFLICT_SHOWN_MS);
    return () => window.clearTimeout(timer);
  }, [conflict]);

  const syncing = sync.all.length > 0;
  useEffect(() => {
    if (!syncing) setOpen(null);
  }, [syncing]);

  useEffect(() => () => window.clearTimeout(timers.current.open), []);

  // Only a mouse hovers: a finger's touch is a tap, and opens the panel by the click it makes.
  const enter = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || narrow) return;
    window.clearTimeout(timers.current.close);
    if (!open) timers.current.open = window.setTimeout(() => setOpen((now) => now ?? 'hover'), HOVER_OPEN_MS);
  };
  const leave = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    window.clearTimeout(timers.current.open);
    timers.current.close = window.setTimeout(() => setOpen((now) => (now === 'hover' ? null : now)), HOVER_CLOSE_MS);
  };
  const close = useCallback(() => setOpen(null), []);

  const shown = standing(sync.all);
  if (!shown) return null;
  const { phase, syncedAt, turn } = shown;
  // With more than one space, the one in a turn is named.
  const many = sync.all.length > 1;
  let text: ReactNode;
  if (phase === 'syncing') {
    text = (
      <>
        {many ? t('sync.syncingIn', { name: shown.name }) : t('sync.syncingShort')} <span className="pct">{percent(turn?.progress.share ?? 0)}</span>
      </>
    );
  } else if (phase === 'off' || phase === 'idle') text = syncedAt === null ? t('sync.notYet') : t('sync.syncedTo', { ago: ago(syncedAt) });
  else text = t(STATUS[phase]);
  const name = copy && basename(copy).replace(/\.[^.]+$/, '');
  return (
    <>
      {copy && (
        <button type="button" className="notice sync-copy" onClick={() => onOpenCopy(copy)}>
          {t('sync.conflictCopy', { name: name ?? '' })}
        </button>
      )}
      <span ref={item} className={`sync-st ${phase}`}>
        <button
          type="button"
          className={`sync-text${open ? ' on' : ''}`}
          aria-expanded={open !== null}
          aria-haspopup="dialog"
          onPointerEnter={(event) => enter(event.nativeEvent)}
          onPointerLeave={(event) => leave(event.nativeEvent)}
          onClick={() => {
            window.clearTimeout(timers.current.open);
            setOpen(open === 'kept' ? null : 'kept');
          }}
        >
          <CloudIcon />
          {text}
        </button>
        <button type="button" className="sync-now" title={t('sync.syncNow')} aria-label={t('sync.syncNow')} disabled={!many && phase === 'syncing'} onClick={() => onSyncNow()}>
          <ResyncIcon />
        </button>
      </span>
      {open &&
        createPortal(
          <SyncPanel
            sync={sync}
            narrow={narrow}
            anchor={item.current}
            kept={open === 'kept'}
            onEnter={enter}
            onLeave={leave}
            onClose={close}
            onSyncNow={onSyncNow}
            onSettings={(space) => {
              close();
              onSettings(space);
            }}
            onSignIn={() => {
              close();
              onSignIn();
            }}
          />,
          document.body,
        )}
    </>
  );
}


/** A share as the language writes it, never 100% before the end: `38%`. */
function percent(share: number): string {
  return new Intl.NumberFormat(locale(), { style: 'percent', maximumFractionDigits: 0 }).format(Math.min(0.99, Math.floor(share * 100) / 100));
}

const UNITS = ['B', 'KB', 'MB', 'GB'];

/** How much of how many bytes, both in the unit of the whole, so that the part moves visibly: `12.4 MB of 42.9 MB`. */
function bytesOf(done: number, total: number): string {
  let unit = 0;
  while (unit < UNITS.length - 1 && total >= 1024 ** (unit + 1)) unit++;
  const show = (bytes: number) => {
    if (unit === 0) return `${bytes} B`;
    const value = bytes / 1024 ** unit;
    return `${(value < 100 ? value.toFixed(1) : String(Math.round(value))).replace(/\.0$/, '')} ${UNITS[unit]}`;
  };
  return t('panel.bytes', { done: show(done), total: show(total) });
}

/** The time a turn has left, from how fast its jobs went so far; null until that can be told. */
function timeLeft(turn: TurnView): string | null {
  const { progress, sendingSince } = turn;
  if (progress.stage !== 'sending' || sendingSince === null) return null;
  const elapsed = (Date.now() - sendingSince) / 1000;
  const done = (progress.share - 0.1) / 0.9;
  if (elapsed < 3 || done <= 0.01) return null;
  const left = (elapsed * (1 - done)) / done;
  if (left < 60) return t('panel.leftMinute');
  if (left < 3600) return t('panel.leftMinutes', { count: Math.round(left / 60) });
  return t('panel.leftHours', { count: Math.round(left / 3600) });
}

type PanelTab = 'waiting' | 'done' | 'notSynced';

const TAB_LABEL: Record<PanelTab, MessageKey> = { waiting: 'panel.waiting', done: 'panel.done', notSynced: 'panel.notSynced' };

/** What a turn did, counted: `3 sent, 2 brought, 1 merged`. */
function summary(jobs: readonly SyncJob[]): string {
  const counts = new Map<SyncJobResult, number>();
  for (const job of jobs) if (job.state === 'done' && job.result) counts.set(job.result, (counts.get(job.result) ?? 0) + 1);
  const KEYS: [SyncJobResult, MessageKey][] = [
    ['sent', 'panel.countSent'],
    ['brought', 'panel.countBrought'],
    ['merged', 'panel.countMerged'],
    ['moved', 'panel.countMoved'],
    ['copy', 'panel.countCopies'],
    ['trashed', 'panel.countTrashed'],
    ['removedThere', 'panel.countRemovedThere'],
    ['alike', 'panel.countAlike'],
  ];
  return KEYS.flatMap(([result, key]) => (counts.get(result) ? [t(key, { count: counts.get(result)! })] : [])).join(t('list.separator'));
}

/** The icon of a job: what it did, or what it will do. */
function JobIcon({ job }: { job: SyncJob }) {
  const what = job.state === 'done' ? job.result : job.state === 'waiting' ? job.kind : 'warn';
  const shapes: Record<string, ReactNode> = {
    up: <path d="M12 19V5M6 11l6-6 6 6" />,
    sent: <path d="M12 19V5M6 11l6-6 6 6" />,
    down: <path d="M12 5v14M6 13l6 6 6-6" />,
    brought: <path d="M12 5v14M6 13l6 6 6-6" />,
    both: <path d="M6 4v5a6 6 0 0 0 6 6M18 4v5a6 6 0 0 1-6 6v5" />,
    merged: <path d="M6 4v5a6 6 0 0 0 6 6M18 4v5a6 6 0 0 1-6 6v5" />,
    alike: <path d="M5 12.5l4.5 4.5L19 7.5" />,
    moved: (
      <>
        <path d="M4 12h11M11 7l5 5-5 5" />
        <path d="M20 5v14" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="11" height="12" rx="2" />
        <path d="M5 15V6a2 2 0 0 1 2-2h8" />
      </>
    ),
    warn: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5v5.5M12 16.2v.3" />
      </>
    ),
  };
  const bin = <path d="M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7" />;
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      {shapes[what ?? 'alike'] ?? bin}
    </svg>
  );
}

/** What a row says on its right: a waiting job's size or what it will do, a done one's outcome. */
function rowEnd(job: SyncJob): string {
  if (job.state === 'waiting') {
    if (job.kind === 'trash') return t('panel.willTrash');
    if (job.kind === 'removeThere') return t('panel.willRemoveThere');
    if (job.kind === 'both') return t('panel.willMerge');
    return sizeText(job.size);
  }
  switch (job.result) {
    case 'sent':
      return t('panel.sentLabel');
    case 'brought':
      return t('panel.broughtLabel');
    case 'merged':
      return t('panel.mergedLabel');
    case 'moved': {
      const from = job.from ?? '';
      if (dirname(from) === dirname(job.path)) return t('panel.wasNamed', { name: basename(from) });
      return t('panel.from', { place: dirname(from) ? basename(dirname(from)) : t('panel.top') });
    }
    case 'copy':
      return t('panel.copyLabel');
    case 'trashed':
      return t('panel.trashedLabel');
    case 'removedThere':
      return t('panel.removedThereLabel');
    default:
      return t('panel.alikeLabel');
  }
}

/** Why a file was not synced, in a sentence. */
function reasonOf(job: SyncJob): string {
  if (job.state === 'skipped') return t(job.reason === 'here' ? 'panel.changedHere' : 'panel.changedThere');
  const bad = [...new Set([...job.path].filter((c) => '"*:<>?\\|'.includes(c)))].map((c) => t('quote', { name: c }));
  if (bad.length === 0 || job.path.split('/').some((name) => !oneDriveTakes(name.replace(/["*:<>?\\|]/g, '')))) return t('panel.badName');
  const chars = bad.length === 1 ? bad[0]! : `${bad.slice(0, -1).join(t('list.separator'))}${t('list.or')}${bad.at(-1)}`;
  return t('panel.badChars', { chars });
}

const ROW = 26;
const ROW_NARROW = 34;

/** A long list of jobs, of which only the rows in sight are drawn. */
function JobRows({ jobs, height }: { jobs: readonly SyncJob[]; height: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [seen, setSeen] = useState(480);
  useLayoutEffect(() => {
    if (box.current) setSeen(box.current.clientHeight || 480);
  }, [jobs.length]);
  const first = Math.max(0, Math.floor(top / height) - 10);
  const last = Math.min(jobs.length, Math.ceil((top + seen) / height) + 10);
  return (
    <div ref={box} className="sp-list" onScroll={(event) => setTop(event.currentTarget.scrollTop)}>
      <div className="sp-rows" style={{ height: jobs.length * height }}>
        {jobs.slice(first, last).map((job, index) => (
          <div key={first + index} className={`sp-row${job.state === 'waiting' ? ' wait' : ''}`} style={{ top: (first + index) * height, height }}>
            <JobIcon job={job} />
            <span className="nm" title={job.path}>
              {basename(job.path)}
              {dirname(job.path) && <small>{dirname(job.path)}</small>}
            </span>
            <span className="r">{rowEnd(job)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** How a space's sync stands in a word or two. */
function wordOf({ phase, syncedAt, turn }: SpaceSync): string {
  if (phase === 'syncing') return percent(turn?.progress.share ?? 0);
  if (phase === 'off' || phase === 'idle') return syncedAt === null ? t('sync.notYet') : ago(syncedAt);
  return t(STATUS[phase]);
}

/** How a space's sync stands, on its row of the panel: `Synced 12 s ago`, `Syncing 38%`. */
function standingOf(unit: SpaceSync): string {
  if (unit.phase === 'syncing') return t('sync.syncingPct', { pct: percent(unit.turn?.progress.share ?? 0) });
  if (unit.phase === 'idle' || unit.phase === 'off') return unit.syncedAt === null ? t('sync.notYet') : t('sync.syncedAgo', { ago: ago(unit.syncedAt) });
  return t(STATUS[unit.phase]);
}

/** How sync stands in a word or two, beside the Sync row of a phone's Browse; Off when nothing syncs. */
export function syncWord(sync: SyncSnapshot): string {
  const shown = standing(sync.all);
  return shown ? wordOf(shown) : t('phone.off');
}

/** The sync panel as a sheet from the bottom, opened from the Sync row of a phone's Browse. */
export function SyncSheet({ sync, onClose, onSyncNow, onSettings, onSignIn }: {
  sync: SyncSnapshot;
  onClose: () => void;
  onSyncNow: (space?: string | null) => void;
  onSettings: (space: string | null) => void;
  onSignIn: () => void;
}) {
  const nothing = useCallback(() => undefined, []);
  return createPortal(
    <SyncPanel
      sync={sync}
      narrow
      anchor={null}
      kept
      onEnter={nothing}
      onLeave={nothing}
      onClose={onClose}
      onSyncNow={onSyncNow}
      onSettings={(space) => {
        onClose();
        onSettings(space);
      }}
      onSignIn={() => {
        onClose();
        onSignIn();
      }}
    />,
    document.body,
  );
}

interface PanelProps {
  sync: SyncSnapshot;
  narrow: boolean;
  /** The status bar's sync, which the panel stands above. */
  anchor: HTMLElement | null;
  /** Opened by a click: it stays until closed. */
  kept: boolean;
  onEnter: (event: PointerEvent) => void;
  onLeave: (event: PointerEvent) => void;
  onClose: () => void;
  onSyncNow: (space?: string | null) => void;
  onSettings: (space: string | null) => void;
  onSignIn: () => void;
}

/**
 * The sync panel, after the Sync panel, Sync done and Sync phone views of design/mockups.html.
 * While a turn runs: the share done, files and bytes, the time left, the file going now, and
 * what waits, in the order it goes. After a turn: what it did, and what could not be synced,
 * and why. It only tells. A space may hold thousands of files: one tab shows at a time, and
 * only the rows in sight are drawn.
 */
function SyncPanel({ sync: whole, narrow, anchor, kept, onEnter, onLeave, onClose, onSyncNow, onSettings, onSignIn }: PanelProps) {
  const box = useRef<HTMLElement>(null);
  // With more than one space, each is a row on top, and the one chosen is told under them.
  const [picked, setPicked] = useState<string | null>(null);
  const units = whole.all;
  const many = units.length > 1;
  const sync: SpaceSyncView = units.find((unit) => keyOf(unit) === picked) ?? standing(units) ?? { ...whole, space: null, name: '' };
  const { phase, turn, lastDone } = sync;
  const running = phase === 'syncing' && turn !== null && turn.endedAt === null;
  const progress = turn?.progress;
  const current = running ? (progress?.current ?? null) : null;
  const doneFrom = running ? turn : (lastDone ?? turn);

  const lists = useMemo(() => {
    const jobs = progress?.jobs ?? [];
    return {
      waiting: jobs.filter((job) => job.state === 'waiting' && job.path !== current?.path),
      done: (doneFrom?.progress.jobs ?? []).filter((job) => job.state === 'done'),
      notSynced: jobs.filter((job) => job.state === 'skipped' || job.state === 'refused'),
    };
    // The jobs change in place; the versions tell when.
  }, [turn?.version, lastDone?.version, current?.path, running]);

  const stoppedWithWaiting = !running && turn?.stopped === true && lists.waiting.length > 0;
  const tabs: PanelTab[] = running || stoppedWithWaiting ? ['waiting', 'done', 'notSynced'] : ['done', 'notSynced'];
  const fallback: PanelTab = running || stoppedWithWaiting ? 'waiting' : lists.notSynced.length > 0 ? 'notSynced' : 'done';
  const [chosen, setChosen] = useState<PanelTab | null>(null);
  const tab = chosen && tabs.includes(chosen) ? chosen : fallback;

  // Kept open: Escape and a click elsewhere close it. Shown by hovering, it goes with the pointer.
  useEffect(() => {
    const onKey = (event: KeyboardEvent | globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    const onDown = (event: MouseEvent | globalThis.MouseEvent) => {
      const target = event.target as Node;
      if (box.current?.contains(target) || anchor?.contains(target)) return;
      if (kept || narrow) onClose();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [kept, narrow, anchor, onClose]);

  // A finger pulling the sheet's handle down closes it.
  const pull = useRef<number | null>(null);

  let place: CSSProperties = {};
  if (!narrow && anchor) {
    const rect = pageBox(anchor);
    const page = pageWindow();
    place = { right: Math.max(8, page.width - rect.right - 6), bottom: page.height - rect.top + 6, maxHeight: Math.min(486, rect.top - 16) };
  }

  let title: ReactNode;
  let sub: ReactNode = null;
  if (running && progress) {
    title = (
      <>
        <b>{many ? t('panel.syncingIn', { name: sync.name }) : t('panel.syncing')}</b>
        <span className="pct">{percent(progress.share)}</span>
      </>
    );
    if (progress.stage === 'reading') sub = progress.looked > 0 ? t('panel.readingCount', { count: progress.looked }) : t('panel.reading');
    else if (progress.stage === 'checking') sub = t('panel.checking', { count: progress.looked });
    else {
      const parts = [t('panel.files', { done: progress.files.done, count: progress.files.total })];
      if (progress.bytes.total > 0) parts.push(bytesOf(progress.bytes.done, progress.bytes.total));
      const left = timeLeft(turn!);
      if (left) parts.push(left);
      sub = parts.join(' · ');
    }
  } else if (phase === 'idle' || phase === 'off' || phase === 'syncing') {
    title = (
      <>
        <b>{t('panel.synced')}</b>
        {sync.syncedAt !== null && <small>{ago(sync.syncedAt)}</small>}
      </>
    );
    const said = doneFrom ? summary(doneFrom.progress.jobs) : '';
    if (!said) sub = t('panel.nothing');
    else if (doneFrom === turn) sub = t('panel.lastTurn', { summary: said });
    else sub = t('panel.lastChanges', { ago: ago(doneFrom!.endedAt ?? doneFrom!.startedAt), summary: said });
  } else {
    title = <b>{t(STATUS[phase])}</b>;
    sub =
      phase === 'offline'
        ? t('sync.offlineLong')
        : phase === 'signedOut'
          ? t('sync.signedOutLong')
          : phase === 'folderGone'
            ? goneLong(sync.space)
            : t('sync.failedLong', { error: sync.error ?? '' });
  }

  const count = (which: PanelTab) => lists[which].length;
  const shown = lists[tab];
  const empty =
    tab === 'waiting'
      ? running && progress?.stage !== 'sending'
        ? t('panel.planComing')
        : t('panel.nothingWaits')
      : tab === 'done'
        ? t('panel.nothingDone')
        : t('panel.allSynced');

  const panel = (
    <section
      ref={box}
      className={`sp${narrow ? ' sheet' : ''}`}
      style={place}
      role="dialog"
      aria-label={t('panel.title')}
      onPointerEnter={(event) => onEnter(event.nativeEvent)}
      onPointerLeave={(event) => onLeave(event.nativeEvent)}
    >
      {narrow && (
        <span
          className="grab"
          aria-hidden="true"
          onPointerDown={(event) => (pull.current = event.clientY)}
          onPointerUp={(event) => {
            if (pull.current !== null && event.clientY - pull.current > 48) onClose();
            pull.current = null;
          }}
        />
      )}
      {many && (
        <div className="sp-spaces" role="listbox" aria-label={t('panel.spaces')}>
          {units.map((unit) => (
            <button
              key={keyOf(unit)}
              type="button"
              role="option"
              aria-selected={unit === sync}
              className={unit === sync ? 'sp-sp on' : 'sp-sp'}
              onClick={() => setPicked(keyOf(unit))}
            >
              <Icon name="space" />
              <span className="nm">{unit.name}</span>
              <span className="r">{standingOf(unit)}</span>
            </button>
          ))}
        </div>
      )}
      <div className="sp-head">
        <div className="sp-title">
          {title}
          {narrow && (
            <button type="button" className="x" title={t('panel.close')} aria-label={t('panel.close')} onClick={onClose}>
              ×
            </button>
          )}
        </div>
        {running && progress && (
          <div className="sp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(progress.share * 100)}>
            <i style={{ width: `${Math.floor(progress.share * 1000) / 10}%` }} />
          </div>
        )}
        {sub && <div className="sp-sub">{sub}</div>}
        {current && current.size >= 512 * 1024 && (
          <div className="sp-now">
            <JobIcon job={{ path: current.path, kind: current.kind, size: current.size, state: 'waiting' }} />
            <span className="nm" title={current.path}>
              {basename(current.path)}
            </span>
            <small>{bytesOf(current.done, current.size)}</small>
            <div className="sp-bar">
              <i style={{ width: `${Math.min(100, (current.done / current.size) * 100)}%` }} />
            </div>
          </div>
        )}
      </div>
      <div className="sp-tabs" role="tablist">
        {tabs.map((each) => (
          <button key={each} type="button" role="tab" aria-selected={each === tab} className={each === tab ? 'on' : undefined} onClick={() => setChosen(each)}>
            {t(TAB_LABEL[each])}
            <small className={each === 'notSynced' && count(each) > 0 ? 'warn' : undefined}>{count(each).toLocaleString(locale())}</small>
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="sp-empty">{empty}</p>
      ) : tab === 'notSynced' ? (
        <div className="sp-list">
          {shown.map((job) => (
            <div key={job.path} className="sp-row bad">
              <JobIcon job={job} />
              <span className="nm" title={job.path}>
                {basename(job.path)}
                {dirname(job.path) && <small>{dirname(job.path)}</small>}
                <span className="why">{reasonOf(job)}</span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <JobRows key={tab} jobs={shown} height={narrow ? ROW_NARROW : ROW} />
      )}
      <div className="sp-foot">
        {!narrow && <span className="left">{running ? t('panel.started', { ago: ago(turn!.startedAt) }) : t('panel.when')}</span>}
        <button type="button" className="st-btn" onClick={() => onSettings(sync.space)}>
          {t('panel.settings')}
        </button>
        {phase === 'signedOut' ? (
          <button type="button" className="st-btn go" onClick={onSignIn}>
            {t('sync.signInAgain')}
          </button>
        ) : (
          !running && (
            <button type="button" className="st-btn go" onClick={() => onSyncNow(many ? sync.space : undefined)}>
              {t('sync.syncNow')}
            </button>
          )
        )}
      </div>
    </section>
  );

  if (!narrow) return panel;
  return (
    <>
      <div className="sp-backdrop" onMouseDown={onClose} />
      {panel}
    </>
  );
}
