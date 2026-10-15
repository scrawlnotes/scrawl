import { basename, BOARD_EXT, COLLECTION_FILE, dirname, KEYS_EXT, type SyncJob, TASK_LIST_EXT } from '@scrawlnotes/core';
import { locale, t } from '@scrawlnotes/i18n';
import { type CSSProperties, type FormEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { clientId, DEFAULT_CLIENT_ID, setClientId } from './cloud';
import { Icon, type IconName } from './Icon';
import type { SpaceView } from './session';
import type { SettingsValues } from './Settings';
import { DOWNLOAD_LIMITS, loadDownloadLimit, saveDownloadLimit } from './device';
import { ActionSheet, Empty, Sheet, SheetClose } from './sheets';
import { isDesktop } from './storage';
import type { Connection, SpaceSync, SyncService, SyncSnapshot } from './sync';
import {
  ago,
  bytesOf,
  emptyOf,
  JobIcon,
  type PanelTab,
  percent,
  providerName,
  placeName,
  reasonOf,
  rowEnd,
  statusText,
  standingOf,
  STATUS,
  TAB_LABEL,
  turnLine,
  useFolderChoice,
  useSharedFolder,
  useTicking,
  useTurnLists,
} from './SyncViews';

// Sync on a phone, after the Phone sync views of design/mockups.html: a page of its own from
// Browse. With more than one space each is a row with how it stands; a space's page tells what its
// turn does or did, its tabs a segmented control and each file a row with what it is in Scrawl.
// The personal space not synced has Connect OneDrive, and OneDrive's folders are chosen in a sheet.

/** A row's height in a space's list of files: its name, and its folder under it. */
const ROW = 64;
/** How many rows beyond those in sight are drawn, above and below. */
const SPARE = 12;

/** Nothing synced yet, for a space with no turn of its own. */
const NONE: SpaceSync = { connection: null, phase: 'off', syncedAt: null, error: null, turn: null, lastDone: null, conflict: null, live: false };

const IMAGES = /\.(png|jpe?g|gif|webp|heic|avif|svg)$/i;
const SOUNDS = /\.(m4a|mp3|wav|webm|ogg|aac|opus)$/i;
/** The moment a deleted item's name in the trash starts with: `2026-10-13 101712 `. */
const TRASHED = /^\d{4}-\d{2}-\d{2} \d{6} /;

/**
 * What a file of a turn is in Scrawl, as its row says it: its icon, its name without the
 * extension Scrawl gives it, and the folder it is in; a deleted item says Trash, and the files
 * Scrawl keeps for itself say so. `top` names the space's top.
 */
export function fileLook(path: string, top: string): { icon: IconName; name: string; folder: string } {
  const name = basename(path);
  const lower = path.toLowerCase();
  const where = (dir: string) => (dir ? dir.split('/').join(' › ') : top);
  const look = (file: string): { icon: IconName; name: string } => {
    const low = file.toLowerCase();
    if (low.endsWith(BOARD_EXT)) return { icon: 'board', name: file.slice(0, -BOARD_EXT.length) };
    if (low.endsWith(TASK_LIST_EXT)) return { icon: 'tasks', name: file.slice(0, -TASK_LIST_EXT.length) };
    if (low === 'tasks.json') return { icon: 'tasks', name: t('side.tasks') };
    if (low.endsWith(KEYS_EXT)) return { icon: 'keys', name: file.slice(0, -KEYS_EXT.length) };
    if (low.endsWith('.md')) return { icon: 'note', name: file.slice(0, -3) };
    if (IMAGES.test(file)) return { icon: 'image', name: file };
    if (SOUNDS.test(file)) return { icon: 'audio', name: file };
    return { icon: 'file', name: file };
  };
  if (lower.startsWith('.scrawl/trash/') && lower !== '.scrawl/trash/index.json') return { ...look(name.replace(TRASHED, '')), folder: t('side.trash') };
  if (lower.startsWith('.scrawl/')) return { icon: 'file', name, folder: t('phone.ownFiles') };
  if (name === COLLECTION_FILE) return { icon: 'collection', name: basename(dirname(path)), folder: where(dirname(dirname(path))) };
  return { ...look(name), folder: where(dirname(path)) };
}

/** A file of a turn: its kind, its name, its folder, and on the right what it does or did. */
function FileRow({ job, top, place, style }: { job: SyncJob; top: string; place: string; style?: CSSProperties }) {
  const look = fileLook(job.path, top);
  return (
    <div className="mb-row mb-file" style={style}>
      <Icon name={look.icon} />
      <span className="tx">
        <b>{look.name}</b>
        <small>{look.folder}</small>
      </span>
      <span className="ct">
        <JobIcon job={job} />
        {rowEnd(job, place)}
      </span>
    </div>
  );
}

/**
 * The files of a tab. A turn may move thousands: only the rows in sight of the page, and a few
 * around them, are drawn, each at its place.
 */
function FileRows({ jobs, top, place }: { jobs: readonly SyncJob[]; top: string; place: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState({ first: 0, last: 40 });
  useLayoutEffect(() => {
    const list = box.current;
    const page = list?.closest('.mb-body');
    if (!list || !page) return;
    const update = () => {
      // How far the list starts below the top of what the page shows; less than nought once scrolled past.
      const offset = list.getBoundingClientRect().top - page.getBoundingClientRect().top;
      const first = Math.max(0, Math.floor(-offset / ROW) - SPARE);
      const last = Math.min(jobs.length, Math.ceil((page.clientHeight - offset) / ROW) + SPARE);
      setRange((now) => (now.first === first && now.last === last ? now : { first, last }));
    };
    update();
    page.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      page.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [jobs.length]);
  return (
    <div ref={box} className="mb-files" style={{ height: jobs.length * ROW }}>
      {jobs.slice(range.first, range.last).map((job, index) => (
        <FileRow key={range.first + index} job={job} top={top} place={place} style={{ top: (range.first + index) * ROW, height: ROW }} />
      ))}
    </div>
  );
}

/** How a space's sync stands on its row of the Sync page: while a turn runs its files, else as the panel says it. */
function lineOf(unit: SpaceSync): string {
  const progress = unit.turn?.progress;
  if (unit.phase !== 'syncing' || !progress) return standingOf(unit);
  if (progress.stage !== 'sending') return t('sync.syncing');
  return `${t('sync.syncingShort')} · ${t('panel.files', { done: progress.files.done, count: progress.files.total })}`;
}

/**
 * The Sync page with more than one space: each a row with how it stands, a bar while it syncs,
 * what keeps it from going on with a sign; a row opens the space's page.
 */
const Tick = ({ on }: { on: boolean }) => <span className="tick">{on && <Icon name="check" />}</span>;

/**
 * This phone's limit, after the Phone large files view of design/mockups.html: how large an
 * attached file comes by itself. A larger one waits in the cloud, in its place in the note, until
 * it is tapped. Raising it brings what is under it now.
 */
export function DownloadLimit({ service }: { service: SyncService }) {
  const [limit, setLimit] = useState(loadDownloadLimit);
  const [open, setOpen] = useState(false);
  const label = (each: number | null) => (each === null ? t('settings.everyFile') : t('settings.upToShort', { size: `${each} MB` }));
  const choose = (each: number | null) => {
    setLimit(each);
    saveDownloadLimit(each);
    setOpen(false);
    service.syncNow();
  };
  return (
    <>
      <div className="mb-sec">{t('phone.thisPhone')}</div>
      <div className="mb-list">
        <button type="button" className="mb-row" onClick={() => setOpen(true)}>
          <Icon name="download" />
          <span className="tx">
            <b>{t('settings.downloadBy')}</b>
          </span>
          <span className="ct">{label(limit)}</span>
          <Icon name="chevron" />
        </button>
      </div>
      <p className="mb-p">{t('settings.downloadAbout')}</p>
      {open && (
        <Sheet label={t('settings.downloadBy')} className="mb-create" onClose={() => setOpen(false)}>
          <div className="mb-sh">
            <b>{t('settings.downloadBy')}</b>
            <small>{t('phone.thisPhone')}</small>
            <SheetClose onClose={() => setOpen(false)} />
          </div>
          <div className="mb-form">
            <div className="mb-group">
              {[...DOWNLOAD_LIMITS, null].map((each) => (
                <button key={each ?? 'all'} type="button" className="mb-fr pick" onClick={() => choose(each)}>
                  <span className="in">{label(each)}</span>
                  <Tick on={each === limit} />
                </button>
              ))}
            </div>
            <p className="mb-hint">{t('settings.downloadAboutPhone')}</p>
          </div>
        </Sheet>
      )}
    </>
  );
}

export function PhoneSyncList({ sync, spaces, personalName, service, onOpen }: {
  sync: SyncSnapshot;
  spaces: SpaceView[];
  personalName: string;
  service: SyncService;
  onOpen: (space: string | null) => void;
}) {
  useTicking(true);
  const rows = [{ id: null, name: personalName }, ...spaces.map((space) => ({ id: space.id, name: space.name }))];
  return (
    <>
      <div className="mb-list">
        {rows.map(({ id, name }) => {
          const unit = sync.all.find((each) => each.space === id);
          const running = unit?.phase === 'syncing' && unit.turn !== null && unit.turn.endedAt === null;
          const share = unit?.turn?.progress.share ?? 0;
          const bad = !!unit && !['off', 'idle', 'syncing'].includes(unit.phase);
          return (
            <button key={id ?? ''} type="button" className="mb-row mb-spsync" onClick={() => onOpen(id)}>
              <Icon name="space" />
              <span className="tx">
                <b>{name}</b>
                <small className={bad ? 'bad' : undefined}>
                  {bad && <Icon name="warn" />}
                  {unit ? lineOf(unit) : t('phone.notSynced')}
                </small>
                {running && (
                  <span className="mb-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(share * 100)}>
                    <i style={{ width: `${Math.floor(share * 1000) / 10}%` }} />
                  </span>
                )}
              </span>
              {running && <span className="ct">{percent(share)}</span>}
              <Icon name="chevron" />
            </button>
          );
        })}
      </div>
      <p className="mb-p">{t('panel.when')}</p>
      <DownloadLimit service={service} />
    </>
  );
}

/** What a space's sync page puts in its frame: the line under its title, and what its bar offers. */
export interface SyncHead {
  sub?: string;
  action?: { label: string; run: () => void };
  onMenu?: () => void;
}

/**
 * A space's sync on its page: how its turn stands, in a large word with its share and a bar while
 * it runs, the file going now, or when it was synced and what the last turn did, or what keeps it
 * from going on with the button that mends it; then Waiting, Done and Not synced, each file a row.
 * The personal space not synced connects here, and its menu disconnects it. `frame` puts the page
 * in its frame, with the line under its title and what its bar offers.
 */
export function PhoneSyncPage({ space, values, frame }: { space: string | null; values: SettingsValues; frame: (head: SyncHead, body: ReactNode) => ReactNode }) {
  const { sync, syncService: service } = values;
  const personal = space === null;
  const unit = sync.all.find((each) => each.space === space);
  const top = personal ? (values.spaceName ?? t('settings.personal')) : (values.spaces.find((each) => each.id === space)?.name ?? '');
  useTicking(true);
  const { running, progress, current, doneFrom, lists, tabs, fallback } = useTurnLists(unit ?? NONE);
  const [chosen, setChosen] = useState<PanelTab | null>(null);
  const tab = chosen && tabs.includes(chosen) ? chosen : fallback;
  const [picking, setPicking] = useState<Connection['account'] | null>(null);
  const [signing, setSigning] = useState<{ cancel(): void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [ownApp, setOwnApp] = useState(false);

  useEffect(() => () => signing?.cancel(), [signing]);

  // Back from Microsoft, signed in to connect the personal space: its folder is chosen now.
  useEffect(() => {
    if (!personal || !sync.picking) return;
    setPicking(sync.picking);
    service.donePicking();
  }, [personal, sync.picking, service]);

  // Signs in, to connect and choose a folder, or again once the key stopped working. In the
  // browser the page goes to Microsoft and comes back.
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
    if (then === 'resume') return service.signedInAgain();
    try {
      setPicking(await service.account());
    } catch (failure) {
      setError(t('sync.signInFailed', { error: failure instanceof Error ? failure.message : String(failure) }));
    }
  };

  const failed = error ?? (personal ? sync.signInError : null);
  const waiting = signing && (
    <div className="mb-wait">
      <span className="spinner" aria-hidden="true" />
      <span>{t('sync.waitingForBrowser')}</span>
      <button type="button" onClick={() => signing.cancel()}>
        {t('sync.cancel')}
      </button>
    </div>
  );
  const problem = failed && (
    <p className="mb-hint err" role="alert">
      {failed}
    </p>
  );
  const picker = picking && (
    <PhoneFolderSheet
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

  // The personal space not synced: the way to connect it, with the app registration of one's own.
  if (personal && !sync.connection) {
    return frame(
      {},
      <>
        <Empty
          icon="cloud"
          title={t('phone.notSynced')}
          text={t('phone.notSyncedText')}
          {...(!signing && { action: { label: t('sync.connectOneDrive'), run: () => void signIn('pick') } })}
        />
        {waiting}
        {problem}
        <p className="mb-p center">{t('sync.access')}</p>
        <button type="button" className="mb-link" onClick={() => setOwnApp(true)}>
          {t('sync.ownApp')}
        </button>
        {ownApp && <OwnAppSheet onClose={() => setOwnApp(false)} />}
        {picker}
      </>,
    );
  }
  // A space beside it that does not sync here: its folder was not reached on this device.
  if (!unit) return frame({}, <Empty icon="cloud" title={t('phone.notSynced')} text={t('phone.spaceNotSynced')} />);

  const { phase, connection } = unit;
  const account = connection?.account;
  const owner = connection?.folder.owner;
  const provider = connection?.server ? placeName(connection) : providerName(connection?.provider ?? 'onedrive');
  const sub = owner ? `${provider} · ${t('settings.ownersFolder', { owner })}` : account ? `${provider} · ${account.email || account.name}` : provider;
  const bad = !['off', 'idle', 'syncing'].includes(phase);
  // What mends what keeps it from going on, where something does: signing in again; for the
  // personal space, another folder.
  const mend =
    phase === 'signedOut'
      ? { label: t('sync.signInAgain'), run: () => (connection?.server ? service.askServerSignIn(connection.server, connection.account.email) : void signIn('resume')) }
      : phase === 'folderGone' && personal && connection
        ? { label: t('sync.chooseFolder'), run: () => setPicking(connection.account) }
        : null;
  const head: SyncHead = {
    sub,
    ...(!running && !mend && { action: { label: t('sync.syncNow'), run: () => service.syncNow(space) } }),
    ...(personal && { onMenu: () => setMenu(true) }),
  };
  const shown = lists[tab];
  const share = progress?.share ?? 0;

  return frame(
    head,
    <>
      <div className={bad ? 'mb-sync bad' : 'mb-sync'}>
        <div className="st">
          {bad && <Icon name="warn" />}
          <b>{running ? t('sync.syncingShort') : bad ? statusText(phase as keyof typeof STATUS, connection) : t('phone.synced')}</b>
          {!running && !bad && unit.syncedAt !== null && <small>{ago(unit.syncedAt)}</small>}
          {running && <span className="pct">{percent(share)}</span>}
        </div>
        {running && (
          <span className="mb-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(share * 100)}>
            <i style={{ width: `${Math.floor(share * 1000) / 10}%` }} />
          </span>
        )}
        <div className="sub">{turnLine(unit, running, doneFrom)}</div>
        {current && current.size >= 512 * 1024 && (
          <div className="now">
            <Icon name={fileLook(current.path, top).icon} />
            <span className="nm">{basename(current.path)}</span>
            <small>
              <JobIcon job={{ path: current.path, kind: current.kind, size: current.size, state: 'waiting' }} />
              {bytesOf(current.done, current.size)}
            </small>
            <span className="mb-bar">
              <i style={{ width: `${Math.min(100, (current.done / current.size) * 100)}%` }} />
            </span>
          </div>
        )}
        {mend && !signing && (
          <button type="button" className="mb-btn" onClick={mend.run}>
            {mend.label}
          </button>
        )}
        {waiting}
        {problem}
      </div>
      {/* With one space its sync page is the Sync page: this phone's limit is here. */}
      {values.spaces.length === 0 && <DownloadLimit service={service} />}
      <div className={tabs.length === 3 ? 'mb-seg three' : 'mb-seg'} role="tablist">
        {tabs.map((each) => (
          <button key={each} type="button" role="tab" aria-selected={each === tab} onClick={() => setChosen(each)}>
            {t(TAB_LABEL[each])}
            <small className={each === 'notSynced' && lists[each].length > 0 ? 'warn' : undefined}>{lists[each].length.toLocaleString(locale())}</small>
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="mb-none">{emptyOf(tab, running, progress?.stage)}</p>
      ) : tab === 'notSynced' ? (
        <div className="mb-list">
          {shown.map((job) => {
            const look = fileLook(job.path, top);
            return (
              <div key={job.path} className="mb-row mb-file bad">
                <Icon name={look.icon} />
                <span className="tx">
                  <b>{look.name}</b>
                  <small>{look.folder}</small>
                  <span className="why">{reasonOf(job, placeName(connection))}</span>
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <FileRows key={tab} jobs={shown} top={top} place={placeName(connection)} />
      )}
      <p className="mb-p">{t('panel.when')}</p>
      {menu && connection && (
        <ActionSheet
          head={{ icon: 'cloud', title: provider, sub: `${account?.email || account?.name || ''} · ${connection.folder.path}` }}
          items={[{ label: t('sync.disconnect'), danger: true, run: () => void service.disconnect() }]}
          onClose={() => setMenu(false)}
        />
      )}
      {picker}
    </>,
  );
}

/** The user's own app registration, in a sheet: its id, for those who would rather not sign in through Scrawl's. */
function OwnAppSheet({ onClose }: { onClose: () => void }) {
  const kept = clientId();
  const [draft, setDraft] = useState(kept === DEFAULT_CLIENT_ID ? '' : kept);
  const save = (event?: FormEvent) => {
    event?.preventDefault();
    setClientId(draft);
    onClose();
  };
  return (
    <Sheet label={t('phone.appRegistration')} className="mb-create" onClose={onClose}>
      <div className="mb-sh three">
        <button type="button" className="cancel" onClick={onClose}>
          {t('dialog.cancel')}
        </button>
        <b>{t('phone.appRegistration')}</b>
        <button type="button" className="ok" onClick={() => save()}>
          {t('settings.save')}
        </button>
      </div>
      <form className="mb-form" onSubmit={save}>
        <div className="mb-group">
          <label className="mb-fr">
            <input
              className="in"
              autoFocus
              enterKeyHint="done"
              autoComplete="off"
              spellCheck={false}
              placeholder={t('sync.clientId')}
              aria-label={t('sync.clientId')}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
        </div>
        <p className="mb-hint">{isDesktop ? t('sync.ownAppAbout') : t('sync.ownAppAboutWeb', { address: `${window.location.origin}/` })}</p>
      </form>
    </Sheet>
  );
}

/** A folder of the drive in the sheet: a tap picks it, its › goes into it. */
function FolderRow({ name, tag, sub, on, onPick, onOpen }: { name: string; tag?: string; sub?: string; on: boolean; onPick?: () => void; onOpen?: () => void }) {
  return (
    <div className={on ? 'mb-row mb-pickf on' : 'mb-row mb-pickf'}>
      <button type="button" className="pick" role="option" aria-selected={on} onClick={onPick}>
        <Icon name="folder" />
        <span className="tx">
          <b>
            {name}
            {tag && <small className="tag">{tag}</small>}
          </b>
          {sub && <small>{sub}</small>}
        </span>
        {on && (
          <span className="tick">
            <Icon name="check" />
          </span>
        )}
      </button>
      {onOpen && (
        <button type="button" className="go" title={t('sync.openFolder', { name })} aria-label={t('sync.openFolder', { name })} onClick={onOpen}>
          <Icon name="chevron" />
        </button>
      )}
    </div>
  );
}

/**
 * Under Shared: a folder someone shared, found by the link they sent, once Scrawl is allowed to
 * reach what is shared with the user.
 */
function SharedPane({ account, service, found, onFound }: {
  account: Connection['account'];
  service: SyncService;
  found: Connection['folder'] | null;
  onFound: (folder: Connection['folder'] | null) => void;
}) {
  const { allowed, signing, link, setLink, finding, error, allow } = useSharedFolder({ account, service, onFound });
  const problem = error && (
    <p className="mb-hint err" role="alert">
      {error}
    </p>
  );
  if (!allowed) {
    return (
      <div className="mb-allow">
        <p>{signing ? t('sync.waitingForBrowser') : t('sync.allowShared')}</p>
        {signing ? (
          <button type="button" className="mb-link" onClick={() => signing.cancel()}>
            {t('sync.cancel')}
          </button>
        ) : (
          <button type="button" className="mb-btn" onClick={() => void allow()}>
            {t('sync.allowInOneDrive')}
          </button>
        )}
        {problem}
      </div>
    );
  }
  return (
    <>
      <div className="mb-form">
        <div className="mb-group">
          <label className="mb-fr">
            <span className="fl">{t('sync.link')}</span>
            <input
              className="in"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="done"
              placeholder={t('sync.linkHint')}
              value={link}
              onChange={(event) => setLink(event.target.value)}
            />
          </label>
        </div>
      </div>
      {(found || finding) && (
        <div className="mb-list">
          {found ? <FolderRow name={found.path.slice(1)} {...(found.owner && { sub: t('settings.ownersFolder', { owner: found.owner }) })} on /> : <p className="mb-none">{t('sync.loading')}</p>}
        </div>
      )}
      {problem ?? <p className="mb-p">{t('sync.linkAbout')}</p>}
    </>
  );
}

/**
 * OneDrive's folders as a sheet, after the Phone sync more view of design/mockups.html: Cancel,
 * the folder it is in and Use at its top; a tap picks a folder, its › goes into it and the top
 * left goes back out; New folder names one in place. At the top of the drive the suggested folder
 * is offered, made when it is used. For a space, My files and Shared, where a folder someone
 * shared is found by its link.
 */
export function PhoneFolderSheet({ account, service, suggested, withShared = false, startShared = false, onUse, onCancel }: {
  account: Connection['account'];
  service: SyncService;
  suggested?: string;
  withShared?: boolean;
  startShared?: boolean;
  onUse: (folder: Connection['folder']) => void;
  onCancel: () => void;
}) {
  const [tab, setTab] = useState<'mine' | 'shared'>(withShared && startShared ? 'shared' : 'mine');
  const [shared, setShared] = useState<Connection['folder'] | null>(null);
  const { suggested: SUGGESTED, trail, here, atTop, folders, failed, chosen, setChosen, making, setMaking, busy, load, enter, up, suggestedNew, target, use, make } = useFolderChoice({ service, suggested, onUse });
  const onShared = tab === 'shared';
  const usable = onShared ? !!shared : !!target && !busy;
  const name = (event: FormEvent) => {
    event.preventDefault();
    void make();
  };
  return (
    <Sheet label={t('sync.chooseTitle')} className="mb-create mb-folders" onClose={onCancel} onEscape={() => (making !== null ? setMaking(null) : onCancel())}>
      <div className="mb-sh three">
        {onShared || atTop ? (
          <button type="button" className="cancel" onClick={onCancel}>
            {t('dialog.cancel')}
          </button>
        ) : (
          <button type="button" className="cancel back" onClick={up}>
            <Icon name="back" />
            <span>{trail.at(-2)!.name}</span>
          </button>
        )}
        <b>{onShared ? t('sync.oneDrive') : here.name}</b>
        <button type="button" className="ok" disabled={!usable} onClick={() => (onShared ? shared && onUse(shared) : void use())}>
          {t('phone.use')}
        </button>
      </div>
      <p className="mb-hint top">{account.email || account.name}</p>
      {withShared && (
        <div className="mb-seg" role="tablist" aria-label={t('sync.chooseTitle')}>
          {(['mine', 'shared'] as const).map((each) => (
            <button key={each} type="button" role="tab" aria-selected={tab === each} onClick={() => setTab(each)}>
              {t(each === 'mine' ? 'sync.myFiles' : 'sync.sharedTab')}
            </button>
          ))}
        </div>
      )}
      {onShared ? (
        <SharedPane account={account} service={service} found={shared} onFound={setShared} />
      ) : (
        <>
          <div className="mb-list" role="listbox" aria-label={here.name}>
            {folders === null && !failed && <p className="mb-none">{t('sync.loading')}</p>}
            {suggestedNew && <FolderRow name={SUGGESTED} tag={t('sync.newTag')} on={chosen === `new:${SUGGESTED}`} onPick={() => setChosen(`new:${SUGGESTED}`)} />}
            {folders?.map((folder) => (
              <FolderRow key={folder.id} name={folder.name} on={folder.id === chosen} onPick={() => setChosen(folder.id)} onOpen={() => enter(folder)} />
            ))}
            {folders !== null && folders.length === 0 && !suggestedNew && making === null && <p className="mb-none">{t('sync.noFolders')}</p>}
            {making !== null ? (
              <form className="mb-form-row" onSubmit={name}>
                <Icon name="folder" />
                <input
                  autoFocus
                  enterKeyHint="done"
                  aria-label={t('sync.folderName')}
                  placeholder={t('sync.folderName')}
                  value={making}
                  onChange={(event) => setMaking(event.target.value)}
                />
                <button type="submit" className="go" disabled={!making.trim() || busy}>
                  {t('sync.add')}
                </button>
                <button type="button" className="x" aria-label={t('dialog.cancel')} title={t('dialog.cancel')} onClick={() => setMaking(null)}>
                  <Icon name="close" />
                </button>
              </form>
            ) : (
              folders !== null && (
                <button type="button" className="mb-row plus" onClick={() => setMaking('')}>
                  <Icon name="plus" />
                  <span className="tx">
                    <b>{t('sync.newFolder')}</b>
                  </span>
                </button>
              )
            )}
          </div>
          {failed ? (
            <p className="mb-hint err" role="alert">
              {failed}{' '}
              <button type="button" className="mb-link inline" onClick={() => void load(here.id)}>
                {t('sync.retry')}
              </button>
            </p>
          ) : (
            <p className="mb-p">{t('sync.putTogether')}</p>
          )}
        </>
      )}
    </Sheet>
  );
}
