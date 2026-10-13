import type { Person, PersonRef } from '@scrawlnotes/core';
import { refOf } from '@scrawlnotes/core';
import { locale, t } from '@scrawlnotes/i18n';
import { type FormEvent, type MouseEvent, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { type SpacePeople, Who } from './People';
import type { SpaceView } from './session';
import { type SettingsValues, spaceWords, useAddSpace } from './Settings';
import { PhoneFolderSheet } from './PhoneSync';
import { ActionSheet, Sheet, SheetClose } from './sheets';
import { CloudIcon, placeWords, providerName, shortOf } from './SyncViews';

// The spaces on a phone, after the Phone spaces views of design/mockups.html: Settings › Spaces as
// a list with Reorder, a space's page with its name, its sync and its people, the personal space's
// with its name, folder and sync and this device's name, Remove from this phone with a switch for
// the files here, Add space as a sheet, and giving a task or a card to one of the people of its
// space.

/** How long a finger rests on a person before their menu opens. */
const HOLD_MS = 450;

const Tick = ({ on }: { on: boolean }) => <span className="tick">{on && <Icon name="check" />}</span>;

/** Where a space lives, under its name on its page: `In OneDrive, Ben Cole’s folder`. */
export function spacePlace(space: SpaceView): string | undefined {
  if (!space.source) return undefined;
  const provider = providerName(space.source.provider);
  const owner = space.source.place.owner;
  return owner ? t('phone.inOwners', { provider, owner }) : t('settings.inProvider', { provider });
}

/**
 * Settings › Spaces: the personal space first, then every other in the order Browse shows them,
 * each opening its page; Add space under them. Reordering, each space beside the personal one
 * moves up or down by its arrows; the personal space stays first.
 */
export function PhoneSpacesList({ values, reordering, onOpen, onAdd }: { values: SettingsValues; reordering: boolean; onOpen: (id: string | null) => void; onAdd: () => void }) {
  const { spaces, me } = values;
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
 * opened it, the user first and the inactive last. Its menu, with Remove from this phone, is on
 * the page's ···.
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
      {people.length > 0 && (
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
            <small>{t('phone.removeMessage', { provider: space.source ? providerName(space.source.provider) : t('sync.oneDrive') })}</small>
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

/**
 * Add space as a sheet: its name, where it lives (OneDrive, connected first when it is not), and
 * the folder there, chosen in the drive's window, among the user's own or by a link someone sent.
 * With the profile's name empty it warns, since the others see the user in a space.
 */
export function PhoneAddSpaceSheet({ values, onSetName, onClose }: { values: SettingsValues; onSetName: () => void; onClose: () => void }) {
  const { sync, syncService: service } = values;
  const { name, setName, account, folder, picking, setPicking, signing, error, setError, ready, connect, choose, add } = useAddSpace({
    service,
    account: values.addingAs ?? null,
    onAdd: values.onAddSpace,
    onDone: () => onClose(),
  });
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
        <button type="button" className="ok" disabled={!ready || !name.trim()} onClick={() => void add()}>
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
          <button type="button" className="mb-fr" disabled={account === undefined || !!signing || !!account} onClick={() => void connect()}>
            <span className="fl">{t('space.location')}</span>
            <span className="val place">
              <CloudIcon />
              {t('sync.oneDrive')}
              {account === null && <small> · {t('space.notConnected')}</small>}
            </span>
            {account === null && <Icon name="chevron" />}
          </button>
          <button type="button" className="mb-fr" disabled={!account} onClick={() => setPicking(true)}>
            <span className="fl">{t('settings.folder')}</span>
            <span className="val">{folder ? placeWords(folder.folder.path, folder.folder.drive) : <span className="none">{t('phone.choose')}</span>}</span>
            <Icon name="chevron" />
          </button>
        </div>
      </div>
      {account === null && !signing && <p className="mb-hint">{t('space.connectFirst')}</p>}
      {signing && <p className="mb-hint">{t('sync.waitingForBrowser')}</p>}
      {error && (
        <p className="mb-hint err" role="alert">
          {error}
        </p>
      )}
      {!values.me?.name && account && (
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
