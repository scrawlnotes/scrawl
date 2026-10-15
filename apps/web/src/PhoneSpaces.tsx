import type { Person, PersonRef, ServerSpace } from '@scrawlnotes/core';
import { refOf } from '@scrawlnotes/core';
import { locale, t } from '@scrawlnotes/i18n';
import { type FormEvent, type MouseEvent, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { type SpacePeople, Who } from './People';
import type { SpaceView } from './session';
import type { Connection } from './sync';
import { type SettingsValues, spaceWords, useAddSpace } from './Settings';
import { PhoneFolderSheet } from './PhoneSync';
import { ActionSheet, Sheet, SheetClose } from './sheets';
import { CloudIcon, placeWords, providerName, ServerIcon, shortOf, sourcePlace } from './SyncViews';
import { ConnectServerSheet } from './ServerConnect';
import { PhoneServerMembers, ROLE_WORD } from './ServerPeople';
import { hostOf, type KnownServer, useKnownServers } from './servers';

// The spaces on a phone, after the Phone spaces views of design/mockups.html: Settings › Spaces as
// a list with Reorder and the servers this phone is signed in to, a space's page with its name, its
// sync and its people, the personal space's with its name, folder and sync and this device's name,
// Remove from this phone with a switch for the files here, Add space as a sheet, and giving a task
// or a card to one of the people of its space.

/** How long a finger rests on a person before their menu opens. */
const HOLD_MS = 450;

const Tick = ({ on }: { on: boolean }) => <span className="tick">{on && <Icon name="check" />}</span>;

/** Where a space lives, under its name on its page: `In OneDrive, Ben Cole’s folder`. */
export function spacePlace(space: SpaceView): string | undefined {
  if (!space.source) return undefined;
  if (space.source.provider === 'server') return t('settings.onServer', { host: sourcePlace(space.source) });
  const provider = providerName(space.source.provider);
  const owner = space.source.place.owner;
  return owner ? t('phone.inOwners', { provider, owner }) : t('settings.inProvider', { provider });
}

/**
 * Settings › Spaces: the personal space first, then every other in the order Browse shows them,
 * each opening its page; Add space under them, and the servers this phone is signed in to, each
 * opening its page. Reordering, each space beside the personal one moves up or down by its arrows;
 * the personal space stays first.
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
      <div className="mb-list">
        <button type="button" className="mb-row" disabled={reordering} onClick={() => onOpen(null)}>
          <Icon name="space" />
          <span className="tx">
            <b>{values.spaceName ?? t('settings.personal')}</b>
            <small>{t('phone.yoursHere')}</small>
          </span>
          {!reordering && <Icon name="chevron" />}
        </button>
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
      {!reordering && (
        <div className="mb-list apart">
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

/** A space's name, typed in a sheet: Cancel, Save, and the name. */
function NameSheet({ name, onSave, onClose }: { name: string; onSave: (name: string) => void; onClose: () => void }) {
  const [text, setText] = useState(name);
  const save = (event?: FormEvent) => {
    event?.preventDefault();
    if (text.trim() && text.trim() !== name) onSave(text.trim());
    onClose();
  };
  return (
    <Sheet label={t('settings.name')} className="mb-create" onClose={onClose}>
      <div className="mb-sh three">
        <button type="button" className="cancel" onClick={onClose}>
          {t('dialog.cancel')}
        </button>
        <b>{t('settings.name')}</b>
        <button type="button" className="ok" disabled={!text.trim()} onClick={() => save()}>
          {t('card.save')}
        </button>
      </div>
      <form className="mb-form" onSubmit={save}>
        <div className="mb-group">
          <label className="mb-fr">
            <input className="in" autoFocus enterKeyHint="done" aria-label={t('settings.name')} value={text} onChange={(event) => setText(event.target.value)} />
          </label>
        </div>
      </form>
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
 * The personal space's page, after the Phone sync more view of design/mockups.html: its name,
 * changed in a sheet, where it is kept, and its sync, which opens its sync page; this device's
 * name apart, which conflict copies made here carry.
 */
export function PhonePersonalPage({ values, onSync }: { values: SettingsValues; onSync: () => void }) {
  const [naming, setNaming] = useState<'space' | 'device' | null>(null);
  const { sync, syncService } = values;
  const name = values.spaceName ?? t('settings.personal');
  const unit = sync.all.find((each) => each.space === null);
  return (
    <>
      <div className="mb-form">
        <div className="mb-group">
          <button type="button" className="mb-fr" onClick={() => setNaming('space')}>
            <span className="fl">{t('settings.name')}</span>
            <span className="in">{name}</span>
          </button>
          <div className="mb-fr">
            <span className="fl">{t('settings.folder')}</span>
            <span className="in">{values.folder ?? t('phone.onThisPhone')}</span>
          </div>
          {sync.available && <SyncField provider={sync.connection?.provider} word={unit && shortOf(unit)} onSync={onSync} />}
        </div>
      </div>
      {sync.available && (
        <>
          <div className="mb-sec">
            <span>{t('sync.thisDevice')}</span>
          </div>
          <div className="mb-form">
            <div className="mb-group">
              <button type="button" className="mb-fr" onClick={() => setNaming('device')}>
                <span className="fl">{t('settings.name')}</span>
                <span className="in">{sync.device.name}</span>
              </button>
            </div>
          </div>
          <p className="mb-p">{t('sync.deviceAbout')}</p>
        </>
      )}
      {naming === 'space' && <NameSheet name={name} onSave={values.onRenameSpace} onClose={() => setNaming(null)} />}
      {naming === 'device' && <NameSheet name={sync.device.name} onSave={(device) => syncService.renameDevice(device)} onClose={() => setNaming(null)} />}
    </>
  );
}

/**
 * A space's page: its name, its sync, which opens the space's sync page, and the people who have
 * opened it, the user first and the inactive last; on a server, who can open it there, its
 * managers marked. Its menu, with Remove from this phone, is on the page's ···.
 */
export function PhoneSpacePage({ space, values, onSync }: { space: SpaceView; values: SettingsValues; onSync: () => void }) {
  const [naming, setNaming] = useState(false);
  const [held, setHeld] = useState<Person | null>(null);
  const unit = values.sync.all.find((each) => each.space === space.id);
  const me = values.me?.id;
  const rank = (person: Person) => (person.id === me ? 0 : !person.active ? 3 : person.name ? 1 : 2);
  const people = [...space.people].sort((a, b) => rank(a) - rank(b) || (a.name ?? '').localeCompare(b.name ?? '', locale()));
  return (
    <>
      <div className="mb-form">
        <div className="mb-group">
          <button type="button" className="mb-fr" onClick={() => setNaming(true)}>
            <span className="fl">{t('settings.name')}</span>
            <span className="in">{space.name}</span>
          </button>
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
      {naming && <NameSheet name={space.name} onSave={(name) => values.onRenameSpaceById(space.id, name)} onClose={() => setNaming(false)} />}
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
 * or one of its spaces the user was invited to. With the profile's name empty it warns, since the
 * others see the user in a space.
 */
export function PhoneAddSpaceSheet({ values, onSetName, onClose }: { values: SettingsValues; onSetName: () => void; onClose: () => void }) {
  const { sync, syncService: service } = values;
  const added = useAddSpace({
    service,
    account: values.addingAs ?? null,
    onAdd: values.onAddSpace,
    onDone: () => onClose(),
    onDevice: values.spaces.map((space) => space.id),
  });
  const { name, setName, account, folder, picking, setPicking, signing, error, setError, ready, connect, choose, add } = added;
  const { servers, where, setWhere, server, serverSpaces, choice, setChoice, chosenSpace, serverSignedOut, connecting, setConnecting, connected } = added;
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
        <button type="button" className="ok" disabled={!ready || (!chosenSpace && !name.trim())} onClick={() => void add()}>
          {t('settings.add')}
        </button>
      </div>
      <div className="mb-form">
        <div className="mb-group">
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
            <button type="button" className="mb-fr" disabled={serverSpaces === null || serverSignedOut} onClick={() => setSpacing(true)}>
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
        </div>
      </div>
      {server && serverSignedOut && (
        <p className="mb-hint">
          {t('server.signInAgain', { host: hostOf(server.url) })}{' '}
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
      {!values.me?.name && (server || account) && (
        <div className="mb-warn">
          <Icon name="warn" />
          <span>
            {t('space.unnamedWarning')}
            <button type="button" onClick={onSetName}>
              {t('space.setName')}
            </button>
          </span>
        </div>
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
          again={serverSignedOut && server ? { url: server.url, email: server.email } : undefined}
          start={added.start}
          onDone={connected}
          onProfile={values.onSaveProfile}
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
  const offered = team.people.filter((person) => person.active).sort((a, b) => rank(a) - rank(b) || (a.name ?? '').localeCompare(b.name ?? '', locale()));
  const inactive = team.people.filter((person) => !person.active).map((person) => person.name ?? t('settings.unnamed'));
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
