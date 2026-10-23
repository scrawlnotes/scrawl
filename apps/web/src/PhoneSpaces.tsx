import type { MovedMark, Person, PersonRef, ServerSpace } from '@scrawlnotes/core';
import { isAgent, refOf } from '@scrawlnotes/core';
import { locale, t } from '@scrawlnotes/i18n';
import { type FormEvent, type MouseEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import type { MenuItem } from './dialogs';
import { Icon } from './Icon';
import { type SpacePeople, Who } from './People';
import type { SpaceView } from './session';
import type { Connection } from './sync';
import { type PersonalPlace, type SettingsValues, spaceWords, useAddSpace, useSyncPersonal } from './Settings';
import { OwnAppSheet, PhoneFolderSheet } from './PhoneSync';
import { ActionSheet, Sheet, SheetClose } from './sheets';
import { CloudIcon, personalPlace, placeWords, providerName, ServerIcon, shortOf, sourcePlace } from './SyncViews';
import { ConnectServerSheet, signInWords } from './ServerConnect';
import { PhoneServerMembers, ROLE_WORD, useSpaceRename } from './ServerPeople';
import { hostOf, type KnownServer, useKnownServers } from './servers';

// The spaces on a phone, after the Phone spaces views of design/mockups.html: Settings › Spaces as
// a list with Reorder and the servers this phone is signed in to, a space's page with its name, its
// sync and its people, the personal space's with its name, folder and sync and this device's name,
// Remove from this phone with a switch for the files here, Add space as a sheet, and giving a task
// or a card to one of the people of its space.

/** How long a finger rests on a person before their menu opens. */
const HOLD_MS = 450;

const Tick = ({ on }: { on: boolean }) => <span className="tick">{on && <Icon name="check" />}</span>;

/** What a shared space is and where it lives, under its name on its page: `Shared · in OneDrive, Ben Cole’s folder`. */
export function spacePlace(space: SpaceView): string {
  if (!space.source) return t('settings.shared');
  if (space.source.provider === 'server') return t('phone.sharedOn', { host: sourcePlace(space.source) });
  const provider = providerName(space.source.provider);
  const owner = space.source.place.owner;
  return owner ? t('phone.sharedInOwners', { provider, owner }) : t('phone.sharedIn', { provider });
}

/**
 * Settings › Spaces: Personal, the one space that is only yours, with where it syncs; Shared,
 * every other in the order Browse shows them, each opening its page, Add space under them; and
 * the servers this phone is signed in to, each opening its page. Reordering, each shared space
 * moves up or down by its arrows; the personal space stays where it is.
 */
export function PhoneSpacesList({ values, reordering, onOpen, onAdd, onServer }: {
  values: SettingsValues;
  reordering: boolean;
  onOpen: (id: string | null) => void;
  onAdd: () => void;
  onServer: (url: string) => void;
}) {
  const { spaces, me } = values;
  const servers = useKnownServers();
  return (
    <>
      <div className="mb-sec">
        <span>{t('settings.personal')}</span>
      </div>
      <div className="mb-list">
        <button type="button" className="mb-row" disabled={reordering} onClick={() => onOpen(null)}>
          <Icon name="space" />
          <span className="tx">
            <b>{values.spaceName ?? t('settings.personal')}</b>
            <small>{personalPlace(values.sync.connection, true)}</small>
          </span>
          {!reordering && <Icon name="chevron" />}
        </button>
      </div>
      <p className="mb-p">{t('phone.personalAbout')}</p>
      <div className="mb-sec">
        <span>{t('settings.shared')}</span>
      </div>
      {spaces.length > 0 && (
        <div className="mb-list">
          {spaces.map((space, i) =>
            reordering ? (
              <div key={space.id} className="mb-row">
                <Icon name="space" />
                <span className="tx">
                  <b>{space.name}</b>
                  <small>{spaceWords(space, me)}</small>
                </span>
                <button type="button" className="mb-ib" aria-label={t('side.moveUp')} title={t('side.moveUp')} disabled={i === 0} onClick={() => values.onMoveSpace(space.id, -1)}>
                  <Icon name="up" />
                </button>
                <button type="button" className="mb-ib" aria-label={t('side.moveDown')} title={t('side.moveDown')} disabled={i === spaces.length - 1} onClick={() => values.onMoveSpace(space.id, 1)}>
                  <Icon name="down" />
                </button>
              </div>
            ) : (
              <button key={space.id} type="button" className="mb-row" onClick={() => onOpen(space.id)}>
                <Icon name="space" />
                <span className="tx">
                  <b>{space.name}</b>
                  <small>{spaceWords(space, me)}</small>
                </span>
                <Icon name="chevron" />
              </button>
            ),
          )}
        </div>
      )}
      {!reordering && (
        <div className={spaces.length > 0 ? 'mb-list apart' : 'mb-list'}>
          <button type="button" className="mb-row add" onClick={onAdd}>
            <Icon name="plus" />
            <span className="tx">
              <b>{t('phone.addSpace')}</b>
            </span>
          </button>
        </div>
      )}
      <p className="mb-p">{t('phone.spacesAbout')}</p>
      {!reordering && servers.length > 0 && (
        <>
          <div className="mb-sec">
            <span>{t('server.servers')}</span>
          </div>
          <div className="mb-list">
            {servers.map((server) => (
              <button key={server.url} type="button" className="mb-row" onClick={() => onServer(server.url)}>
                <ServerIcon />
                <span className="tx">
                  <b>{hostOf(server.url)}</b>
                  <small>
                    {server.email} · {t(ROLE_WORD[server.role])}
                  </small>
                </span>
                <Icon name="chevron" />
              </button>
            ))}
          </div>
          <p className="mb-p">{t('server.serversAbout')}</p>
        </>
      )}
    </>
  );
}

/** A person of a space on its page; held, another active one's menu makes them inactive. */
function PersonRow({ person, you, onHold }: { person: Person; you: boolean; onHold?: () => void }) {
  const timer = useRef(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const stop = () => {
    window.clearTimeout(timer.current);
    start.current = null;
  };
  useEffect(() => stop, []);
  const hold = onHold && {
    onPointerDown: (event: { clientX: number; clientY: number }) => {
      start.current = { x: event.clientX, y: event.clientY };
      timer.current = window.setTimeout(() => {
        start.current = null;
        onHold();
      }, HOLD_MS);
    },
    onPointerMove: (event: { clientX: number; clientY: number }) => {
      if (start.current && Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > 8) stop();
    },
    onPointerUp: stop,
    onPointerCancel: stop,
    onContextMenu: (event: MouseEvent) => {
      event.preventDefault();
      stop();
      onHold();
    },
  };
  return (
    <div className={person.active ? 'mb-row person' : 'mb-row person off'} {...hold}>
      <Who name={person.name} />
      <span className="tx">
        <b>
          {person.name ?? t('settings.unnamed')}
          {you && <small className="you"> · {t('settings.itsYou')}</small>}
        </b>
        <small>{[!person.active && t('settings.inactive'), person.email ?? t('settings.noEmail')].filter(Boolean).join(' · ')}</small>
      </span>
    </div>
  );
}

/** A space's name, typed in a sheet: Cancel, Save, and the name. What a server says when it refuses shows under it, the sheet still open. */
function NameSheet({ name, onSave, onClose }: { name: string; onSave: (name: string) => void | Promise<void>; onClose: () => void }) {
  const [text, setText] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!text.trim() || text.trim() === name) return onClose();
    setBusy(true);
    try {
      await onSave(text.trim());
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      setBusy(false);
    }
  };
  return (
    <Sheet label={t('settings.name')} className="mb-create" onClose={onClose}>
      <div className="mb-sh three">
        <button type="button" className="cancel" onClick={onClose}>
          {t('dialog.cancel')}
        </button>
        <b>{t('settings.name')}</b>
        <button type="button" className="ok" disabled={busy || !text.trim()} onClick={() => void save()}>
          {t('card.save')}
        </button>
      </div>
      <form className="mb-form" onSubmit={(event) => void save(event)}>
        <div className="mb-group">
          <label className="mb-fr">
            <input className="in" autoFocus enterKeyHint="done" aria-label={t('settings.name')} value={text} onChange={(event) => setText(event.target.value)} />
          </label>
        </div>
      </form>
      {error && (
        <p className="mb-hint err" role="alert">
          {error}
        </p>
      )}
    </Sheet>
  );
}

/** A space's Sync row: its cloud, how it stands in a word, a sign when something needs the user; it opens the space's sync. */
function SyncField({ provider, word, onSync }: { provider: string | undefined; word: { text: string; bad: boolean } | undefined; onSync: () => void }) {
  return (
    <button type="button" className="mb-fr" onClick={onSync}>
      <span className="fl">{t('sync.label')}</span>
      <span className={provider ? 'in' : 'in none'}>{provider ? providerName(provider) : t('phone.notSynced')}</span>
      {word && (
        <span className={word.bad ? 'val bad' : 'val'}>
          {word.bad && <Icon name="warn" />}
          {word.text}
        </span>
      )}
      <Icon name="chevron" />
    </button>
  );
}

/**
 * A space's menu, from the ··· of its page: Rename, which names it in a sheet, where this person
 * renames it, and for a space beside the personal one Remove from this phone.
 */
export function PhoneSpaceMenu({ space, values, onRemove, onClose }: { space: SpaceView | null; values: SettingsValues; onRemove: () => void; onClose: () => void }) {
  const renaming = useSpaceRename(space);
  const [showing, setShowing] = useState(true);
  const [naming, setNaming] = useState(false);
  const name = space ? space.name : (values.spaceName ?? t('settings.personal'));
  // The sheet closes as an item is chosen; the menu is gone once neither it nor the name's sheet is open.
  useEffect(() => {
    if (!showing && !naming) onClose();
  }, [showing, naming, onClose]);
  const items: MenuItem[] = [
    ...(renaming.canRename ? [{ label: t('menu.rename'), icon: 'pen' as const, run: () => setNaming(true) }] : []),
    ...(space ? [{ label: t('phone.removeFromPhone'), danger: true, run: onRemove }] : []),
  ];
  return (
    <>
      {showing && <ActionSheet head={{ icon: 'space', title: name }} items={items} onClose={() => setShowing(false)} />}
      {naming && (
        <NameSheet
          name={name}
          onSave={async (named) => {
            if (!space) return values.onRenameSpace(named);
            await renaming.onServer(named);
            values.onRenameSpaceById(space.id, named);
          }}
          onClose={() => setNaming(false)}
        />
      )}
    </>
  );
}

/**
 * The personal space's page, after the Phone sync more view of design/mockups.html: where it is
 * kept, and its sync, which opens its sync page; this device's name apart, which conflict copies
 * made here carry. Its name is changed from the page's ···.
 */
export function PhonePersonalPage({ values, onSync }: { values: SettingsValues; onSync: () => void }) {
  const [naming, setNaming] = useState(false);
  const [placing, setPlacing] = useState(false);
  const { sync, syncService } = values;
  const unit = sync.all.find((each) => each.space === null);
  return (
    <>
      {sync.available && (
        <div className="mb-form">
          <div className="mb-group">
            <button type="button" className="mb-fr" onClick={() => setPlacing(true)}>
              <span className="fl">{t('space.location')}</span>
              {sync.connection ? <span className="in">{sync.connection.server ? hostOf(sync.connection.server) : t('sync.oneDrive')}</span> : <span className="in none">{t('sync.notSyncedShort')}</span>}
              <Icon name="chevron" />
            </button>
            {sync.connection && <SyncField provider={sync.connection.provider} word={unit && shortOf(unit)} onSync={onSync} />}
          </div>
        </div>
      )}
      {!sync.connection && <p className="mb-p">{t('phone.onlyHereText')}</p>}
      {placing && <PhoneSyncPersonalSheet values={values} account={null} onClose={() => setPlacing(false)} />}
      {sync.available && (
        <>
          <div className="mb-sec">
            <span>{t('sync.thisDevice')}</span>
          </div>
          <div className="mb-form">
            <div className="mb-group">
              <button type="button" className="mb-fr" onClick={() => setNaming(true)}>
                <span className="fl">{t('settings.name')}</span>
                <span className="in">{sync.device.name}</span>
              </button>
            </div>
          </div>
          <p className="mb-p">{t('sync.deviceAbout')}</p>
        </>
      )}
      {naming && <NameSheet name={sync.device.name} onSave={(device) => syncService.renameDevice(device)} onClose={() => setNaming(false)} />}
    </>
  );
}

/**
 * Sync Personal as a sheet, after the Phone views of design/mockups.html and design/spaces.md 2.6,
 * as `useSyncPersonal` goes through it: the place, Not synced, OneDrive or a server, the one it
 * syncs with now marked; in OneDrive, connected first when it is not, then its folder, chosen in
 * the drive's sheet; on a server, its personal space there or a new one, with a word when the
 * server is someone else's. Moving, a switch asks whether the copy it leaves goes, off; `follow`
 * opens it at where a move made on another device went. Connect a server… opens over it, for an
 * address only.
 */
export function PhoneSyncPersonalSheet({ values, account: given, follow = null, onClose }: {
  values: SettingsValues;
  /** Back from signing in in the browser: the account whose folders are chosen from. */
  account: Connection['account'] | null;
  /** Move this phone too: where the space went on another device. */
  follow?: MovedMark | null;
  onClose: () => void;
}) {
  const { sync, syncService: service } = values;
  const name = values.spaceName ?? t('settings.personal');
  const p = useSyncPersonal({ sync, service, name, account: given, follow, onDone: onClose });
  const [ownApp, setOwnApp] = useState(false);
  const placeRow = (place: PersonalPlace, icon: ReactNode, label: string, detail: string) => (
    <button key={place} type="button" className="mb-row" onClick={() => p.setWhere(place)}>
      {icon}
      <span className="tx">
        <b>
          {label}
          {p.now === place && <small className="you"> · {t('phone.now')}</small>}
        </b>
        <small>{detail}</small>
      </span>
      <Tick on={p.where === place} />
    </button>
  );
  // The folder it syncs with now, until another is chosen.
  const ownFolder = p.current && !p.current.server ? p.current : null;
  const shownFolder = p.folder ?? ownFolder?.folder ?? null;
  const folderAccount = p.folder ? p.account : (ownFolder?.account ?? p.account);
  return (
    <Sheet label={t('personal.syncTitle', { name })} className="mb-create" onClose={onClose}>
      <div className="mb-sh three">
        <button type="button" className="cancel" onClick={onClose}>
          {t('dialog.cancel')}
        </button>
        <b>{t('personal.syncTitle', { name })}</b>
        <button type="button" className="ok" disabled={!p.ready} onClick={() => void p.apply()}>
          {p.stopping ? t('personal.stopShort') : p.moving || p.following ? t('personal.moveShort') : t('personal.syncShort')}
        </button>
      </div>
      <div className="mb-sec">
        <span>{t('space.location')}</span>
      </div>
      <div className="mb-list">
        {placeRow('none', <Icon name="device" />, t('sync.notSyncedShort'), t('phone.onlyHere'))}
        {placeRow('onedrive', <CloudIcon />, t('sync.oneDrive'), p.account === undefined ? t('sync.loading') : p.account ? p.account.email || p.account.name : t('space.notConnected'))}
        {p.servers.map((each) => placeRow(each.url, <ServerIcon />, hostOf(each.url), each.email))}
        <button type="button" className="mb-row srv-new" onClick={() => p.setConnecting(true)}>
          <Icon name="plus" />
          <span className="tx">
            <b>{t('server.connect')}</b>
          </span>
        </button>
      </div>
      {p.where === 'onedrive' &&
        (!ownFolder && (p.account === null || p.signing) ? (
          <>
            <div className="mb-list apart">
              {p.signing ? (
                <div className="mb-wait">
                  <span className="spinner" aria-hidden="true" />
                  <span>{t('sync.waitingForBrowser')}</span>
                  <button type="button" onClick={() => p.signing?.cancel()}>
                    {t('sync.cancel')}
                  </button>
                </div>
              ) : (
                <button type="button" className="mb-row add" onClick={() => void p.connect()}>
                  <CloudIcon />
                  <span className="tx">
                    <b>{t('sync.connectOneDrive')}</b>
                  </span>
                </button>
              )}
            </div>
            <p className="mb-p">{t('sync.access')}</p>
            <button type="button" className="mb-link" onClick={() => setOwnApp(true)}>
              {t('sync.ownApp')}
            </button>
          </>
        ) : (
          <>
            <div className="mb-sec">
              <span>{t('settings.folder')}</span>
            </div>
            <div className="mb-list">
              <button type="button" className="mb-row" disabled={p.following || !p.account || p.busy} onClick={() => p.setPicking(true)}>
                <Icon name="folder" />
                <span className="tx">
                  <b>{shownFolder ? placeWords(shownFolder.path, shownFolder.drive) : t('space.noFolder')}</b>
                  {folderAccount && <small>{folderAccount.email || folderAccount.name}</small>}
                </span>
                {!p.following && <Icon name="chevron" />}
              </button>
            </div>
          </>
        ))}
      {p.server && (
        <>
          <div className="mb-sec">
            <span>{t('personal.spaceOn', { host: hostOf(p.server.url) })}</span>
          </div>
          {p.serverSignedOut ? (
            <div className="mb-list">
              <button type="button" className="mb-row add" onClick={() => p.setConnecting(true)}>
                <ServerIcon />
                <span className="tx">
                  <b>{t('server.signIn')}</b>
                  <small>{signInWords(p.serverSignedOut, hostOf(p.server.url))}</small>
                </span>
              </button>
            </div>
          ) : p.there === undefined ? (
            <p className="mb-p">{t('server.looking')}</p>
          ) : !p.keeps ? (
            <p className="mb-hint err">{t('personal.serverTooOld', { host: hostOf(p.server.url) })}</p>
          ) : (
            <div className="mb-list">
              <div className="mb-row">
                <Icon name={p.there ? 'space' : 'plus'} />
                <span className="tx">
                  <b>{p.there ? p.there.name || name : t('space.newSpace', { name })}</b>
                  {p.there && <small>{p.following && follow?.by ? t('personal.movedHere', { device: follow.by }) : t('personal.yoursThere')}</small>}
                </span>
                <Tick on />
              </div>
            </div>
          )}
          {p.notYours && p.keeps && (
            <div className="mb-srvfound late">
              <Icon name="warn" />
              <span>
                <b>{t('personal.notYours')}</b>
                <small>{t('personal.notYoursText', { host: hostOf(p.server.url) })}</small>
              </span>
            </div>
          )}
        </>
      )}
      {p.moving && (
        <div className="mb-form">
          <div className="mb-group">
            <button type="button" className="mb-fr" role="switch" aria-checked={p.deleteLeft} onClick={() => p.setDeleteLeft(!p.deleteLeft)}>
              <span className="in">{t('personal.deleteLeft', { place: p.left })}</span>
              <span className={p.deleteLeft ? 'mb-sw on red' : 'mb-sw'} />
            </button>
          </div>
        </div>
      )}
      {(p.note || p.moving) && <p className="mb-p">{[p.moving && t('personal.deleteLeftNote', { place: p.left }), p.note].filter(Boolean).join(' ')}</p>}
      {p.error && (
        <p className="mb-hint err" role="alert">
          {p.error}
        </p>
      )}
      {p.picking && p.account && <PhoneFolderSheet account={p.account} service={service} onUse={(chosen) => p.choose(chosen)} onCancel={() => p.setPicking(false)} />}
      {ownApp && <OwnAppSheet onClose={() => setOwnApp(false)} />}
      {p.connecting && (
        <ConnectServerSheet
          addressOnly
          me={values.me}
          device={sync.device.name}
          again={p.serverSignedOut && p.server ? { url: p.server.url, email: p.server.email, why: p.serverSignedOut } : undefined}
          start={p.followUrl ?? null}
          onDone={p.connected}
          onClose={() => p.setConnecting(false)}
        />
      )}
    </Sheet>
  );
}

/**
 * A space's page: its sync, which opens the space's sync page, and the people who have opened it,
 * the user first and the inactive last; on a server, who can open it there, its managers marked.
 * Its menu, with Rename and Remove from this phone, is on the page's ···.
 */
export function PhoneSpacePage({ space, values, onSync }: { space: SpaceView; values: SettingsValues; onSync: () => void }) {
  const [held, setHeld] = useState<Person | null>(null);
  const unit = values.sync.all.find((each) => each.space === space.id);
  const me = values.me?.id;
  const rank = (person: Person) => (person.id === me ? 0 : !person.active ? 3 : person.name ? 1 : 2);
  const people = space.people.filter((person) => !isAgent(person)).sort((a, b) => rank(a) - rank(b) || (a.name ?? '').localeCompare(b.name ?? '', locale()));
  return (
    <>
      <div className="mb-form">
        <div className="mb-group">
          <SyncField provider={space.source?.provider} word={unit && shortOf(unit)} onSync={onSync} />
        </div>
      </div>
      {space.source?.provider === 'server' ? (
        <PhoneServerMembers space={space} me={values.me} />
      ) : people.length > 0 && (
        <>
          <div className="mb-sec">
            <span>{t('settings.people')}</span>
          </div>
          <div className="mb-list">
            {people.map((person) => (
              <PersonRow key={person.id} person={person} you={person.id === me} {...(person.id !== me && person.active && { onHold: () => setHeld(person) })} />
            ))}
          </div>
        </>
      )}
      {held && (
        <ActionSheet
          head={{ icon: 'person', title: held.name ?? t('settings.unnamed'), ...(held.email && { sub: held.email }) }}
          items={[{ label: t('settings.makeInactive'), run: () => values.onPersonActive(space.id, held.id, false) }]}
          onClose={() => setHeld(null)}
        />
      )}
    </>
  );
}

/**
 * The question before a space leaves this phone, as an action sheet: it stays in its cloud and on
 * the other devices; with the switch on, its copy here is deleted too, which cannot be undone.
 */
export function RemoveSpaceSheet({ space, onRemove, onClose }: { space: SpaceView; onRemove: (deleteFiles: boolean) => void; onClose: () => void }) {
  const [deleteFiles, setDeleteFiles] = useState(false);
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const title = t('phone.removeTitle', { name: space.name });
  return (
    <>
      <div className="mb-acts-back" onClick={onClose} />
      <div className="mb-acts" role="alertdialog" aria-label={title}>
        <div className="mb-card">
          <div className="ask">
            <b>{title}</b>
            <small>{t('phone.removeMessage', { place: sourcePlace(space.source) })}</small>
          </div>
          <button type="button" className="a tog" role="switch" aria-checked={deleteFiles} onClick={() => setDeleteFiles(!deleteFiles)}>
            <span className="lb">{t('phone.removeFiles')}</span>
            <span className={deleteFiles ? 'mb-sw on red' : 'mb-sw'} />
          </button>
          {deleteFiles && (
            <div className="gone" role="alert">
              {t('phone.removeGone')}
            </div>
          )}
          <button
            type="button"
            className="a red center"
            onClick={() => {
              onClose();
              onRemove(deleteFiles);
            }}
          >
            {t('settings.removeAction')}
          </button>
        </div>
        <div className="mb-card">
          <button type="button" className="a cancel" onClick={onClose}>
            {t('dialog.cancel')}
          </button>
        </div>
      </div>
    </>
  );
}

/** The head of a list picked inside Add space: the way back to it, and what is picked. */
function PickHead({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="mb-sh three">
      <button type="button" className="cancel back" onClick={onBack}>
        <Icon name="back" />
        <span>{t('space.addTitle')}</span>
      </button>
      <b>{title}</b>
      <span />
    </div>
  );
}

/** Where a space lives, picked: OneDrive, a server this phone is signed in to, or one connected to now. */
function LocationSheet({ account, servers, where, onPick, onConnect, onClose }: {
  account: Connection['account'] | null | undefined;
  servers: KnownServer[];
  where: string;
  onPick: (where: string) => void;
  onConnect: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet label={t('space.location')} className="mb-create" onClose={onClose}>
      <PickHead title={t('space.location')} onBack={onClose} />
      <div className="mb-list">
        <button type="button" className="mb-row" onClick={() => onPick('onedrive')}>
          <CloudIcon />
          <span className="tx">
            <b>{t('sync.oneDrive')}</b>
            <small>{account ? account.email || account.name : t('space.notConnected')}</small>
          </span>
          <Tick on={where === 'onedrive'} />
        </button>
        {servers.map((server) => (
          <button key={server.url} type="button" className="mb-row" onClick={() => onPick(server.url)}>
            <ServerIcon />
            <span className="tx">
              <b>{hostOf(server.url)}</b>
              <small>{server.email}</small>
            </span>
            <Tick on={where === server.url} />
          </button>
        ))}
        <button type="button" className="mb-row srv-new" onClick={onConnect}>
          <Icon name="plus" />
          <span className="tx">
            <b>{t('server.connect')}</b>
          </span>
        </button>
      </div>
    </Sheet>
  );
}

/** A space on a server, picked: a new one, named as typed, or one of its spaces not on this phone. */
function ServerSpaceSheet({ server, spaces, name, choice, onPick, onClose }: {
  server: KnownServer;
  spaces: ServerSpace[];
  name: string;
  choice: string;
  onPick: (choice: string) => void;
  onClose: () => void;
}) {
  return (
    <Sheet label={t('space.space')} className="mb-create" onClose={onClose}>
      <PickHead title={t('space.space')} onBack={onClose} />
      <div className="mb-list">
        {server.role !== 'member' && (
          <button type="button" className="mb-row" onClick={() => onPick('new')}>
            <Icon name="plus" />
            <span className="tx">
              <b>{name.trim() ? t('space.newSpace', { name: name.trim() }) : t('space.newSpaceUnnamed')}</b>
            </span>
            <Tick on={choice === 'new'} />
          </button>
        )}
        {spaces.map((space) => (
          <button key={space.id} type="button" className="mb-row" onClick={() => onPick(space.id)}>
            <Icon name="space" />
            <span className="tx">
              <b>{space.name || t('settings.unnamed')}</b>
              <small>
                {t('count.people', { count: space.people })} · {t('space.notHere')}
              </small>
            </span>
            <Tick on={choice === space.id} />
          </button>
        ))}
      </div>
      <p className="mb-hint">{server.role === 'member' ? t('space.onlyAdmins') : t('space.serverNote')}</p>
    </Sheet>
  );
}

/**
 * Add space as a sheet: its name, where it lives, and in OneDrive the folder there, chosen in the
 * drive's window, among the user's own or by a link someone sent; on a server, a new space there
 * or one of its spaces the user was invited to. In OneDrive, with Profile's name or email empty,
 * You asks for both, since the others see the user in a space.
 */
export function PhoneAddSpaceSheet({ values, onClose }: { values: SettingsValues; onClose: () => void }) {
  const { sync, syncService: service } = values;
  const added = useAddSpace({
    service,
    account: values.addingAs ?? null,
    me: values.me,
    onSaveProfile: values.onSaveProfile,
    onAdd: values.onAddSpace,
    onDone: () => onClose(),
    onDevice: values.spaces.map((space) => space.id),
  });
  const { name, setName, naming, spaceName, account, folder, picking, setPicking, signing, error, setError, ready, connect, choose, add } = added;
  const { servers, where, setWhere, server, serverSpaces, choice, setChoice, chosenSpace, serverSignedOut, connecting, setConnecting, connected, asking, you, setYou } = added;
  const [locating, setLocating] = useState(false);
  const [spacing, setSpacing] = useState(false);
  // The account the page came back from Microsoft with is taken once.
  useEffect(() => {
    if (values.addingAs) service.donePicking();
  }, [values.addingAs, service]);
  return (
    <Sheet label={t('space.addTitle')} className="mb-create" onClose={onClose}>
      <div className="mb-sh three">
        <button type="button" className="cancel" onClick={onClose}>
          {t('dialog.cancel')}
        </button>
        <b>{t('space.addTitle')}</b>
        <button type="button" className="ok" disabled={!ready} onClick={() => void add()}>
          {t('settings.add')}
        </button>
      </div>
      <div className="mb-form">
        <div className="mb-group">
          <button type="button" className="mb-fr" disabled={!!signing} onClick={() => setLocating(true)}>
            <span className="fl">{t('space.location')}</span>
            {server ? (
              <span className="val place">
                <ServerIcon />
                {hostOf(server.url)}
              </span>
            ) : (
              <span className="val place">
                <CloudIcon />
                {t('sync.oneDrive')}
                {account === null && <small> · {t('space.notConnected')}</small>}
              </span>
            )}
            <Icon name="chevron" />
          </button>
          {server ? (
            <button type="button" className="mb-fr" disabled={serverSpaces === null || !!serverSignedOut} onClick={() => setSpacing(true)}>
              <span className="fl">{t('space.space')}</span>
              <span className="val">
                {serverSpaces === null ? (
                  <span className="none">{t('server.looking')}</span>
                ) : chosenSpace ? (
                  chosenSpace.name || t('settings.unnamed')
                ) : choice === 'new' && server.role !== 'member' ? (
                  t('space.newSpaceUnnamed')
                ) : (
                  <span className="none">{t('phone.choose')}</span>
                )}
              </span>
              <Icon name="chevron" />
            </button>
          ) : (
            <button type="button" className="mb-fr" disabled={!account} onClick={() => setPicking(true)}>
              <span className="fl">{t('settings.folder')}</span>
              <span className="val">{folder ? placeWords(folder.folder.path, folder.folder.drive) : <span className="none">{t('phone.choose')}</span>}</span>
              <Icon name="chevron" />
            </button>
          )}
          {/* A name only for a new space: one that is there already comes with its own. */}
          {naming && (
            <label className="mb-fr">
              <span className="fl">{t('settings.name')}</span>
              <input
                className="in"
                autoComplete="off"
                enterKeyHint="done"
                aria-label={t('settings.name')}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setError(null);
                }}
              />
            </label>
          )}
        </div>
      </div>
      {server && serverSignedOut && (
        <p className="mb-hint">
          {signInWords(serverSignedOut, hostOf(server.url))}{' '}
          <button type="button" className="mb-link inline" onClick={() => setConnecting(true)}>
            {t('server.signIn')}
          </button>
        </p>
      )}
      {!server && account === null && !signing && <p className="mb-hint">{t('space.connectFirst')}</p>}
      {signing && <p className="mb-hint">{t('sync.waitingForBrowser')}</p>}
      {error && (
        <p className="mb-hint err" role="alert">
          {error}
        </p>
      )}
      {asking && (
        <>
          <div className="mb-sec">{t('settings.you')}</div>
          <div className="mb-form">
            <div className="mb-group">
              <label className="mb-fr">
                <span className="fl">{t('settings.name')}</span>
                <input className="in" autoComplete="name" enterKeyHint="next" aria-label={t('space.yourName')} value={you.name} onChange={(event) => setYou({ ...you, name: event.target.value })} />
              </label>
              <label className="mb-fr">
                <span className="fl">{t('settings.email')}</span>
                <input
                  className="in"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  enterKeyHint="done"
                  aria-label={t('space.yourEmail')}
                  placeholder={t('settings.emailHint')}
                  value={you.email}
                  onChange={(event) => setYou({ ...you, email: event.target.value })}
                />
              </label>
            </div>
          </div>
          <p className="mb-hint end">{spaceName ? t('space.youNote', { space: spaceName }) : t('space.youNoteUnnamed')}</p>
        </>
      )}
      {locating && (
        <LocationSheet
          account={account}
          servers={servers}
          where={where}
          onPick={(picked) => {
            setLocating(false);
            setWhere(picked);
            if (picked === 'onedrive' && account === null) void connect();
          }}
          onConnect={() => {
            setLocating(false);
            setConnecting(true);
          }}
          onClose={() => setLocating(false)}
        />
      )}
      {spacing && server && serverSpaces && (
        <ServerSpaceSheet
          server={server}
          spaces={serverSpaces}
          name={name}
          choice={choice}
          onPick={(picked) => {
            setChoice(picked);
            setSpacing(false);
          }}
          onClose={() => setSpacing(false)}
        />
      )}
      {connecting && (
        <ConnectServerSheet
          me={values.me}
          device={sync.device.name}
          again={serverSignedOut && server ? { url: server.url, email: server.email, why: serverSignedOut } : undefined}
          start={added.start}
          onDone={connected}
          onClose={() => setConnecting(false)}
        />
      )}
      {picking && account && (
        <PhoneFolderSheet
          account={account}
          service={service}
          suggested={name}
          withShared
          startShared={sync.addingShared}
          onUse={(chosen) => void choose(chosen)}
          onCancel={() => setPicking(false)}
        />
      )}
    </Sheet>
  );
}

/**
 * Giving a task or a card to someone on a phone: Nobody, then the active people of its space, the
 * one it is given to ticked; under them, who has opened the space and who is left out.
 */
export function PeopleSheet({ about, team, current, onPick, onClose }: {
  /** What is being given: the task's or the card's title. */
  about: string;
  team: SpacePeople;
  current: PersonRef | null;
  onPick: (assignee: PersonRef | null) => void;
  onClose: () => void;
}) {
  const rank = (person: Person) => (person.id === team.me ? 0 : person.name ? 1 : 2);
  const offered = team.people.filter((person) => person.active && !isAgent(person)).sort((a, b) => rank(a) - rank(b) || (a.name ?? '').localeCompare(b.name ?? '', locale()));
  const inactive = team.people.filter((person) => !person.active && !isAgent(person)).map((person) => person.name ?? t('settings.unnamed'));
  const pick = (assignee: PersonRef | null) => {
    onPick(assignee);
    onClose();
  };
  return (
    <Sheet label={t('people.assignTo')} className="mb-create mb-people" onClose={onClose}>
      <div className="mb-sh">
        <b>{t('people.assignTo')}</b>
        <small>{about}</small>
        <SheetClose onClose={onClose} />
      </div>
      <div className="mb-list">
        <button type="button" className="mb-row" onClick={() => pick(null)}>
          <Icon name="person" />
          <span className="tx">
            <b>{t('people.nobody')}</b>
          </span>
          <Tick on={!current} />
        </button>
      </div>
      <div className="mb-sec">
        <span>{t('people.in', { space: team.name })}</span>
      </div>
      <div className="mb-list">
        {offered.map((person) => (
          <button key={person.id} type="button" className={person.name ? 'mb-row person' : 'mb-row person dim'} onClick={() => pick(refOf(person))}>
            <Who name={person.name} />
            <span className="tx">
              <b>
                {person.name ?? t('settings.unnamed')}
                {person.id === team.me && <small className="you"> · {t('settings.itsYou')}</small>}
              </b>
              <small>{person.email ?? t('settings.noEmail')}</small>
            </span>
            <Tick on={current?.id === person.id} />
          </button>
        ))}
      </div>
      <p className="mb-p">
        {t('people.everyone', { space: team.name })}
        {inactive.length > 0 && ` ${t('people.inactive', { count: inactive.length, names: new Intl.ListFormat(locale(), { type: 'conjunction' }).format(inactive) })}`}
      </p>
    </Sheet>
  );
}
