import { dayOf, type Me, newSpaceId, type Person, RemoteSignedOut, type ServerSpace, type SpaceSource } from '@scrawlnotes/core';
import { languages, type MessageKey, t } from '@scrawlnotes/i18n';
import { type CSSProperties, type KeyboardEvent, type MouseEvent, useEffect, useRef, useState } from 'react';
import { ContextMenu, Dialog, type MenuItem } from './dialogs';
import type { SpaceView } from './session';
import { chooseLanguage, languageTag, type Mode, shadeOfMode, SIZES, type SizeKind, thisSizeKind } from './device';
import { Icon, type IconName } from './Icon';
import { useNarrow } from './narrow';
import type { Connection, SyncService, SyncSnapshot } from './sync';
import { dueLabel } from './Tasks';
import { CloudIcon, FolderPicker, placeWords, providerName, ServerIcon, sourcePlace, SpaceSyncRow, SyncRow, ThisDevice } from './SyncViews';
import { paletteOf, type Shade, THEMES, type Theme, themeById } from './themes';
import { ConnectServerDialog, serverFailure } from './ServerConnect';
import { ROLE_WORD, ServerMembers, ServerPage } from './ServerPeople';
import { hostOf, knownServers, type KnownServer, noteRole, pendingJoin, serverAccount, tookJoin, useKnownServers } from './servers';
import { Agents } from './Agents';

export type Section = 'profile' | 'appearance' | 'spaces' | 'agents' | 'language';

const SECTIONS: { id: Section; label: MessageKey; icon: IconName }[] = [
  { id: 'profile', label: 'settings.profile', icon: 'person' },
  { id: 'appearance', label: 'settings.appearance', icon: 'appearance' },
  { id: 'spaces', label: 'settings.spaces', icon: 'space' },
  { id: 'agents', label: 'settings.agents', icon: 'agent' },
  { id: 'language', label: 'settings.language', icon: 'language' },
];

const MODES: { mode: Mode; label: MessageKey }[] = [
  { mode: 'system', label: 'settings.system' },
  { mode: 'light', label: 'settings.light' },
  { mode: 'dark', label: 'settings.dark' },
];


/** What the settings show and change, in the window or on a phone's pages. */
export interface SettingsValues {
  mode: Mode;
  onMode: (mode: Mode) => void;
  /** The id of the theme chosen. */
  theme: string;
  onTheme: (id: string) => void;
  /** Light or dark, as the device is right now: what System gives. */
  system: Shade;
  /** How large the app is drawn on a phone and on a computer, in percent. */
  sizes: Record<SizeKind, number>;
  onSize: (kind: SizeKind, size: number) => void;
  /** Who the user is; null until the first start has asked. */
  me: Me | null;
  onSaveProfile: (name: string, email: string) => void;
  /** The name the personal space was given; none until it is named. */
  spaceName: string | undefined;
  onRenameSpace: (name: string) => void;
  /** The spaces beside the personal one, in the sidebar's order. */
  spaces: SpaceView[];
  onRenameSpaceById: (id: string, name: string) => void;
  /** Adds a space living in a cloud folder, `id` the one the folder has when it is a space already; resolves to its id. */
  onAddSpace: (name: string, source: SpaceSource, id?: string) => Promise<string>;
  /** Takes a space off this device; with `deleteFiles`, its copy here goes too. */
  onRemoveSpace: (id: string, deleteFiles: boolean) => void;
  onMoveSpace: (id: string, by: -1 | 1) => void;
  /** Makes a person of a space inactive, or active again. */
  onPersonActive: (space: string, person: string, active: boolean) => void;
  /** Opens another section of the settings: Profile, from where a name is asked for; Spaces with Add space open, from Agents. */
  onSection?: (section: Section, options?: { adding?: boolean }) => void;
  /** Spaces opens with Add space open: asked for from Agents, to connect a server. */
  initialAdding?: boolean;
  /** Desktop: asks for another folder for a space's copy on this device, and moves it there. */
  onChangeSpaceFolder?: (id: string) => void;
  /** The space whose page Spaces opens on: an id, null for the personal space, undefined for the list. */
  initialSpace?: string | null;
  /** Back from signing in to add a space: Spaces opens with Add space, its folder to be chosen in this account. */
  addingAs?: Connection['account'] | null;
  /** Desktop: the folder the notes are in. Null in the browser. */
  folder: string | null;
  /** Desktop: the folder the notes go to unless another is chosen. */
  defaultFolder: string | null;
  /** Desktop: asks for another notes folder. */
  onChangeFolder?: () => void;
  /** Desktop: goes back to the default folder. */
  onUseDefaultFolder?: () => void;
  /** How the space's sync stands, and what connects and disconnects it. */
  sync: SyncSnapshot;
  syncService: SyncService;
}

export interface SettingsProps extends SettingsValues {
  /** The section shown first. */
  initial?: Section;
  /** Each section shown after it: the sidebar marks Sync while Spaces is on screen, Settings otherwise. */
  onShown?: (section: Section) => void;
  onClose: () => void;
}

/** The sections, Language once there is more than one language. */
export const settingsSections = () => SECTIONS.filter((section) => section.id !== 'language' || languages.length > 1);

/** What a section is set to, beside it in the list of a phone. */
export function sectionValue(id: Section, { mode, theme, spaceName, me, spaces }: Pick<SettingsValues, 'mode' | 'theme' | 'spaceName' | 'me' | 'spaces'>): string {
  if (id === 'profile') return me?.name ?? t('settings.unnamed');
  if (id === 'appearance') return `${themeById(theme).name} · ${t(MODES.find((choice) => choice.mode === mode)!.label)}`;
  // With more than one space, how many there are; with one, what it is called.
  if (id === 'spaces') return spaces.length > 0 ? String(spaces.length + 1) : (spaceName ?? t('settings.personal'));
  if (id === 'agents') return knownServers().length > 0 ? t('agents.viaServers', { count: knownServers().length }) : '';
  return languages.find((language) => language.tag === languageTag())?.name ?? '';
}

/** What a section has, in the window or on a phone's page. */
export function SettingsSection({ section, ...values }: SettingsValues & { section: Section }) {
  return section === 'profile' ? <Profile {...values} /> : section === 'appearance' ? <Appearance {...values} /> : section === 'spaces' ? <Spaces {...values} /> : section === 'agents' ? <Agents {...values} /> : <Language />;
}

/** A little window in a theme's colours, in the shade the interface is in. */
function Mini({ theme, shade }: { theme: Theme; shade: Shade }) {
  const colours = paletteOf(theme, shade);
  const style = { '--mb': colours.bg, '--ms': colours.side, '--ml': colours.line, '--mt': colours.faint, '--ma': colours.accent } as CSSProperties;
  return (
    <span className="mini" style={style} aria-hidden="true">
      <span className="s">
        <i />
        <i />
        <i />
      </span>
      <span className="m">
        <span className="t" />
        <span className="l">
          <i />
          <i />
          <i />
          <b />
        </span>
      </span>
    </span>
  );
}

const SIZE_KINDS: { kind: SizeKind; label: MessageKey }[] = [
  { kind: 'phone', label: 'settings.sizePhone' },
  { kind: 'computer', label: 'settings.sizeComputer' },
];

/**
 * The mode, light or dark or the device's own, the theme, and the size the app is drawn at on a
 * phone and on a computer, the one this device uses said so. Each theme shows itself in the shade
 * the mode gives; one without a light side says so. What is chosen applies at once.
 */
function Appearance({ mode, onMode, theme, onTheme, system, sizes, onSize }: Pick<SettingsValues, 'mode' | 'onMode' | 'theme' | 'onTheme' | 'system' | 'sizes' | 'onSize'>) {
  const shade = shadeOfMode(mode, system);
  const here = thisSizeKind();
  return (
    <>
      <span className="st-label" id="st-mode">
        {t('settings.mode')}
      </span>
      <div className="st-modes" role="radiogroup" aria-labelledby="st-mode">
        {MODES.map((choice) => (
          <button
            key={choice.mode}
            type="button"
            role="radio"
            aria-checked={choice.mode === mode}
            className={choice.mode === mode ? 'on' : undefined}
            onClick={() => onMode(choice.mode)}
          >
            {t(choice.label)}
          </button>
        ))}
      </div>
      <p className="st-note">{t(system === 'dark' ? 'settings.systemDark' : 'settings.systemLight')}</p>
      <span className="st-label" id="st-theme">
        {t('settings.theme')}
      </span>
      <div className="st-themes" role="radiogroup" aria-labelledby="st-theme">
        {THEMES.map((each) => (
          <button
            key={each.id}
            type="button"
            role="radio"
            aria-checked={each.id === theme}
            className={`st-theme${each.id === theme ? ' on' : ''}`}
            onClick={() => onTheme(each.id)}
          >
            <span className="shot">
              <Mini theme={each} shade={shade} />
            </span>
            <span className="name">
              <span className="radio" />
              {each.name}
              {!each.light && <small>{t('settings.darkOnly')}</small>}
            </span>
          </button>
        ))}
      </div>
      {SIZE_KINDS.map(({ kind, label }) => (
        <div key={kind} className="st-size">
          <span className="st-label" id={`st-size-${kind}`}>
            {t(label)}
            {kind === here && <small>{t('settings.thisDevice')}</small>}
          </span>
          <div className="st-modes" role="radiogroup" aria-labelledby={`st-size-${kind}`}>
            {SIZES.map((size) => (
              <button
                key={size}
                type="button"
                role="radio"
                aria-checked={size === sizes[kind]}
                className={size === sizes[kind] ? 'on' : undefined}
                onClick={() => onSize(kind, size)}
              >
                {t('settings.percent', { size })}
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="st-note">{t('settings.sizeNote')}</p>
    </>
  );
}

/** The personal space: its name, which has its Save, the folder it is, its sync; and this device's name. */
/** Who the user is: a name and an email, saved together; either may stay empty. */
function Profile({ me, onSaveProfile }: Pick<SettingsValues, 'me' | 'onSaveProfile'>) {
  const name = me?.name ?? '';
  const email = me?.email ?? '';
  const [draft, setDraft] = useState({ name, email });
  useEffect(() => setDraft({ name, email }), [name, email]);
  const changed = draft.name.trim() !== name || draft.email.trim() !== email;
  const save = () => {
    if (changed) onSaveProfile(draft.name, draft.email);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') save();
    else if (event.key === 'Escape' && changed) setDraft({ name, email });
    else return;
    event.preventDefault();
  };
  return (
    <>
      <span className="st-label">{t('settings.you')}</span>
      <p className="st-note">{t('settings.profileAbout')}</p>
      <div className="st-space">
        <div className="st-row">
          <label className="fl" htmlFor="me-name">
            {t('settings.name')}
          </label>
          <input id="me-name" value={draft.name} autoComplete="name" onChange={(event) => setDraft({ ...draft, name: event.target.value })} onKeyDown={onKeyDown} />
          <span />
        </div>
        <div className="st-row">
          <label className="fl" htmlFor="me-email">
            {t('settings.email')}
          </label>
          <input id="me-email" type="email" value={draft.email} autoComplete="email" placeholder={t('welcome.emailHint')} onChange={(event) => setDraft({ ...draft, email: event.target.value })} onKeyDown={onKeyDown} />
          <button type="button" className="primary" disabled={!changed} onClick={save}>
            {t('settings.save')}
          </button>
        </div>
      </div>
    </>
  );
}

/**
 * The spaces: a list in the sidebar's order, each row opening the space's page, and Add space
 * under it. A space's page has its name, its folder, its sync, and the way out of this device.
 */
function Spaces(values: Pick<SettingsValues, 'me' | 'onSaveProfile' | 'spaceName' | 'onRenameSpace' | 'spaces' | 'onRenameSpaceById' | 'onAddSpace' | 'onRemoveSpace' | 'onMoveSpace' | 'onPersonActive' | 'onSection' | 'onChangeSpaceFolder' | 'initialSpace' | 'addingAs' | 'initialAdding' | 'folder' | 'defaultFolder' | 'onChangeFolder' | 'onUseDefaultFolder' | 'sync' | 'syncService'>) {
  const { spaces, onMoveSpace, onRemoveSpace, initialSpace, addingAs, sync, syncService } = values;
  // The page open: a space by its id, null for the personal space, undefined for the list.
  const [page, setPage] = useState<string | null | undefined>(initialSpace);
  // Opened with an invite link, Add space opens with it; asked for from Agents, it opens too.
  const [adding, setAdding] = useState(() => !!addingAs || !!pendingJoin() || !!values.initialAdding);
  // A server's page, by its address.
  const [serverPage, setServerPage] = useState<string | null>(null);
  const servers = useKnownServers();
  const [removing, setRemoving] = useState<SpaceView | null>(null);
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; id: string } | null>(null);
  // The account the page came back from Microsoft with is taken once.
  useEffect(() => {
    if (addingAs) syncService.donePicking();
  }, [addingAs, syncService]);
  const personalName = values.spaceName ?? t('settings.personal');
  const add =
    adding &&
    <AddSpaceDialog
      sync={sync}
      service={syncService}
      account={addingAs ?? null}
      me={values.me}
      onDevice={values.spaces.map((space) => space.id)}
      unnamed={!values.me?.name}
      {...(values.onSection && { onSetName: () => values.onSection!('profile') })}
      onSaveProfile={values.onSaveProfile}
      onAdd={values.onAddSpace}
      onDone={(id) => {
        setAdding(false);
        if (id) setPage(id);
      }}
    />;
  if (page === null) return <PersonalPage {...values} onBack={() => setPage(undefined)} />;
  const onServer = serverPage ? servers.find((each) => each.url === serverPage) : undefined;
  if (onServer) {
    return (
      <ServerPage
        server={onServer}
        onBack={() => setServerPage(null)}
        {...(values.onSection && { onAgents: () => values.onSection!('agents') })}
        onSignOut={() => {
          setServerPage(null);
          void syncService.signOutOfServer(onServer.url);
        }}
      />
    );
  }
  const shown = page === undefined ? null : spaces.find((space) => space.id === page);
  if (shown) {
    return (
      <SpacePage
        space={shown}
        me={values.me}
        onPersonActive={(person, active) => values.onPersonActive(shown.id, person, active)}
        sync={sync}
        service={syncService}
        onRename={(name) => values.onRenameSpaceById(shown.id, name)}
        {...(values.onChangeSpaceFolder && { onChangeFolder: () => values.onChangeSpaceFolder!(shown.id) })}
        onBack={() => setPage(undefined)}
        onRemove={() => setRemoving(shown)}
        removing={removing}
        onRemoved={() => setRemoving(null)}
        onRemoveSpace={onRemoveSpace}
      />
    );
  }
  const spaceMenu = (event: MouseEvent, id: string) => {
    event.preventDefault();
    setMenu({ at: { x: event.clientX, y: event.clientY }, id });
  };
  const menuItems = (id: string): MenuItem[] => {
    const at = spaces.findIndex((space) => space.id === id);
    return [
      { label: t('side.spaceSettings'), icon: 'settings', run: () => setPage(id) },
      { label: t('side.moveUp'), apart: true, run: () => onMoveSpace(id, -1), ...(at === 0 && { disabled: t('side.first') }) },
      { label: t('side.moveDown'), run: () => onMoveSpace(id, 1), ...(at === spaces.length - 1 && { disabled: t('side.last') }) },
      { label: t('side.removeSpace'), apart: true, run: () => setRemoving(spaces[at] ?? null) },
    ];
  };
  return (
    <>
      <span className="st-label">{t('settings.spaces')}</span>
      <p className="st-note">{t('settings.spacesAbout')}</p>
      <div className="st-list">
        <button type="button" className="st-li" onClick={() => setPage(null)}>
          <Icon name="space" />
          <span className="nm">
            <b>{personalName}</b>
            <small>{values.folder ? `${t('settings.yours')} · ${values.folder}` : `${t('settings.yours')} · ${t('settings.inBrowser')}`}</small>
          </span>
        </button>
        {spaces.map((space) => (
          <div key={space.id} className={`st-li${menu?.id === space.id ? ' menu-on' : ''}`} onContextMenu={(event) => spaceMenu(event, space.id)}>
            <button type="button" className="st-li-main" onClick={() => setPage(space.id)}>
              <Icon name="space" />
              <span className="nm">
                <b>{space.name}</b>
                <small>{spaceWords(space, values.me)}</small>
              </span>
            </button>
            <button type="button" className="it-more" title={t('side.more')} aria-label={t('side.more')} onClick={(event) => spaceMenu(event, space.id)}>
              ···
            </button>
          </div>
        ))}
      </div>
      <div className="st-acts">
        <button type="button" className="primary" onClick={() => setAdding(true)}>
          <Icon name="plus" />
          {t('settings.addSpace')}
        </button>
        <small>{t('settings.addSpaceAbout')}</small>
      </div>
      {servers.length > 0 && (
        <>
          <span className="st-label">{t('server.servers')}</span>
          <div className="st-list">
            {servers.map((server) => (
              <button key={server.url} type="button" className="st-li" onClick={() => setServerPage(server.url)}>
                <ServerIcon />
                <span className="nm">
                  <b>{hostOf(server.url)}</b>
                  <small>
                    {server.email} · {t(ROLE_WORD[server.role])}
                  </small>
                </span>
                <span className="r">{t('server.spacesHere', { count: spaces.filter((space) => space.source?.provider === 'server' && space.source.place.url === server.url).length })}</span>
              </button>
            ))}
          </div>
          <p className="st-note">{t('server.serversAbout')}</p>
        </>
      )}
      {/* The device's name goes with every space's sync; on a phone it is on the personal space's page. */}
      {sync.available && <ThisDevice sync={sync} service={syncService} />}
      {add}
      {menu && <ContextMenu at={menu.at} items={menuItems(menu.id)} onClose={() => setMenu(null)} />}
      {removing && <RemoveSpaceDialog space={removing} onRemove={(deleteFiles) => onRemoveSpace(removing.id, deleteFiles)} onClose={() => setRemoving(null)} />}
    </>
  );
}

/** Who is in a space, as its row in the list says it: just you, or how many people are active. */
function peopleWords(people: Person[], me: Me | null): string | null {
  const active = people.filter((person) => person.active);
  if (active.length === 0) return null;
  if (active.length === 1 && active[0]!.id === me?.id) return t('settings.justYou');
  return t('count.people', { count: active.length });
}

/** A space's row in the list: where it lives, whose folder it is when someone shared it, and who is in it. */
export function spaceWords(space: SpaceView, me: Me | null): string {
  if (!space.source) return space.folder ?? t('settings.inBrowser');
  const owner = space.source.place.owner;
  const who = peopleWords(space.people, me);
  const where = space.source.provider === 'server' ? sourcePlace(space.source) : providerName(space.source.provider);
  return [where, ...(owner ? [t('settings.ownersFolder', { owner })] : []), ...(who ? [who] : [])].join(' · ');
}

/**
 * The people of a space, after the Space view of design/mockups.html: you first, then the
 * others by name, those without one as Unnamed, the inactive last. Another active person's menu
 * makes them inactive; they are active again once they open the space.
 */
function People({ people, me, onActive }: { people: Person[]; me: Me | null; onActive: (person: string, active: boolean) => void }) {
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; id: string } | null>(null);
  const today = dayOf(new Date());
  const rank = (person: Person) => (person.id === me?.id ? 0 : !person.active ? 3 : person.name ? 1 : 2);
  const shown = [...people].sort((a, b) => rank(a) - rank(b) || (a.name ?? '').localeCompare(b.name ?? ''));
  const open = (event: MouseEvent, id: string) => {
    event.preventDefault();
    setMenu({ at: { x: event.clientX, y: event.clientY }, id });
  };
  return (
    <>
      <span className="st-label">{t('settings.people')}</span>
      <p className="st-note">{t('settings.peopleAbout')}</p>
      <div className="st-list">
        {shown.map((person) => {
          const you = person.id === me?.id;
          const offered = !you && person.active;
          return (
            <div
              key={person.id}
              className={`st-li one${person.active ? '' : ' off'}${menu?.id === person.id ? ' menu-on' : ''}`}
              {...(offered && { onContextMenu: (event: MouseEvent) => open(event, person.id) })}
            >
              <span className="who" aria-hidden="true">
                {person.name ? person.name.slice(0, 1).toUpperCase() : '?'}
              </span>
              <span className="nm">
                <b>
                  {person.name ?? t('settings.unnamed')}
                  {you && <small>{t('settings.itsYou')}</small>}
                </b>
                <small>{person.email ?? t('settings.noEmail')}</small>
              </span>
              <span className="r">{person.active ? (person.seen ? dueLabel(dayOf(new Date(person.seen)), today) : '') : t('settings.inactive')}</span>
              {offered && (
                <button type="button" className="it-more" title={t('side.more')} aria-label={t('side.more')} onClick={(event) => open(event, person.id)}>
                  ···
                </button>
              )}
            </div>
          );
        })}
      </div>
      {menu && <ContextMenu at={menu.at} items={[{ label: t('settings.makeInactive'), run: () => onActive(menu.id, false) }]} onClose={() => setMenu(null)} />}
    </>
  );
}

/**
 * The question before a space leaves this device: it stays in its cloud and on the other
 * devices; ticked, its copy here is deleted too, which cannot be undone, and Remove turns red.
 */
export function RemoveSpaceDialog({ space, onRemove, onClose }: { space: Pick<SpaceView, 'name' | 'source'>; onRemove: (deleteFiles: boolean) => void; onClose: () => void }) {
  const [deleteFiles, setDeleteFiles] = useState(false);
  const title = t('settings.removeTitle', { name: space.name });
  const remove = () => {
    onClose();
    onRemove(deleteFiles);
  };
  return (
    <Dialog label={title} className="space-remove" onClose={onClose}>
      <h2>{title}</h2>
      <p className="confirm">{t('settings.removeMessage', { name: space.name, place: sourcePlace(space.source) })}</p>
      <label className="check">
        <input type="checkbox" checked={deleteFiles} onChange={(event) => setDeleteFiles(event.target.checked)} />
        <span>{t('settings.removeFiles')}</span>
      </label>
      {deleteFiles && (
        <p className="gone" role="alert">
          <Icon name="warn" />
          {t('settings.removeGone')}
        </p>
      )}
      <div className="dialog-actions">
        <button type="button" onClick={onClose}>
          {t('dialog.cancel')}
        </button>
        <button type="button" className={deleteFiles ? 'danger' : 'primary'} onClick={remove}>
          {t('settings.removeAction')}
        </button>
      </div>
    </Dialog>
  );
}

/**
 * Add space, after the Add space views of design/mockups.html: a name, where the space lives (a
 * row for each place, with the account it is connected to: OneDrive now, more later) and the
 * folder there, chosen in the drive's own window. Without a connection, connecting comes first.
 * A folder that is a space already keeps its id and gives its name; one that is the personal
 * space's, another space's, or inside one, is refused with a word why.
 */
/**
 * What adding a space goes through, in the window on a computer and in the sheet on a phone: a
 * name; where it lives, OneDrive or a Scrawl server this device is signed in to. In OneDrive: the
 * account, asked for, connected first when there is none; the folder there, chosen in the drive's
 * window, which a folder that is a space already, or one that cannot be one, answers. On a server:
 * a new space there, which only its owner and admins open, or one of its spaces the person was
 * invited to and that is not on this device yet. Then adding it.
 */
export function useAddSpace({ service, account: given, onAdd, onDone, onDevice }: {
  service: SyncService;
  /** Signed in already, the page back from Microsoft: the account to choose the folder in. */
  account: Connection['account'] | null;
  onAdd: SettingsValues['onAddSpace'];
  onDone: (id: string | null) => void;
  /** The ids of the spaces on this device, which a server's list leaves out. */
  onDevice: string[];
}) {
  const [name, setName] = useState('');
  // Undefined while it is being asked whether a key is kept.
  const [account, setAccount] = useState<Connection['account'] | null | undefined>(given ?? undefined);
  const [folder, setFolder] = useState<{ folder: Connection['folder']; id?: string } | null>(null);
  // Back from signing in for it, the folder window opens at once.
  const [picking, setPicking] = useState(!!given);
  const [signing, setSigning] = useState<{ cancel(): void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Where it lives: OneDrive, or a server by its address.
  const [servers, setServers] = useState<KnownServer[]>(() => knownServers());
  const [where, setWhere] = useState('onedrive');
  const server = servers.find((each) => each.url === where) ?? null;
  // The server's spaces not on this device, null while it is asked; and the one chosen, `new` for a new one.
  const [serverSpaces, setServerSpaces] = useState<ServerSpace[] | null>(null);
  const [choice, setChoice] = useState('new');
  const [serverSignedOut, setServerSignedOut] = useState(false);
  // The link the app was opened with goes into Connect a server…, which opens with it.
  const [start] = useState(pendingJoin);
  const [connecting, setConnecting] = useState(!!start);
  useEffect(() => {
    if (start) tookJoin();
  }, [start]);
  const onDeviceKey = onDevice.join(' ');

  useEffect(() => {
    if (!server) return;
    let live = true;
    setServerSpaces(null);
    setServerSignedOut(false);
    setError(null);
    const account = serverAccount(server.url);
    Promise.all([account.spaces(), account.me()]).then(
      ([spaces, me]) => {
        if (!live) return;
        const here = new Set(onDeviceKey.split(' '));
        const offered = spaces.filter((each) => !here.has(each.id));
        setServerSpaces(offered);
        setServers((now) => now.map((each) => (each.url === server.url ? { ...each, role: me.role } : each)));
        noteRole(server.url, me.role);
        setChoice(me.role === 'member' ? (offered[0]?.id ?? '') : 'new');
      },
      (failure: unknown) => {
        if (!live) return;
        setServerSpaces([]);
        if (failure instanceof RemoteSignedOut) setServerSignedOut(true);
        else setError(serverFailure(failure, hostOf(server.url)));
      },
    );
    return () => {
      live = false;
    };
  }, [server?.url, onDeviceKey]);

  /**
   * Connected to a server, or signed in to it again: it is listed, and chosen. Joined a space with
   * an invite: the space is added, or its page opens when it is on this device already. A new
   * password set with a link: there is nothing to add, and Add space closes.
   */
  const connected = (signedIn: KnownServer, after?: { joined: ServerSpace } | { reset: true }) => {
    service.signedInToServer(signedIn);
    setServers(knownServers());
    setConnecting(false);
    setWhere(signedIn.url);
    setServerSignedOut(false);
    if (after && 'reset' in after) {
      onDone(null);
      return;
    }
    const joined = after?.joined;
    if (!joined) return;
    if (onDevice.includes(joined.id)) {
      onDone(joined.id);
      return;
    }
    setBusy(true);
    const source: SpaceSource = { provider: 'server', account: signedIn.email, place: { url: signedIn.url, space: joined.id } };
    onAdd(joined.name, source, joined.id).then(onDone, (failure: unknown) => {
      setError(failure instanceof Error ? failure.message : t('error.create'));
      setBusy(false);
    });
  };

  useEffect(() => {
    if (given) return;
    let live = true;
    void service.signedInAs().then((who) => live && setAccount(who));
    return () => {
      live = false;
    };
  }, [given, service]);
  useEffect(() => () => signing?.cancel(), [signing]);

  const connect = async () => {
    const cloud = service.cloud();
    setError(null);
    if (cloud.redirects) {
      // The page goes to Microsoft and comes back with this window open again.
      await service.leaveToSignIn('space');
      return;
    }
    const attempt = cloud.signIn('space');
    setSigning(attempt);
    try {
      await attempt.done;
      setAccount(await service.account());
      setPicking(true);
    } catch (failure) {
      if (!(failure instanceof DOMException && failure.name === 'AbortError')) setError(t('sync.signInFailed', { error: failure instanceof Error ? failure.message : String(failure) }));
    } finally {
      setSigning(null);
    }
  };

  const choose = async (chosen: Connection['folder']) => {
    setPicking(false);
    setError(null);
    const refused = service.refusal(chosen);
    if (refused) {
      setError(refused);
      return;
    }
    setBusy(true);
    try {
      // A folder that is a space already says what it is called; its id goes with it.
      const info = await service.spaceAt(chosen);
      setFolder({ folder: chosen, ...(info.id && { id: info.id }) });
      // With no name typed yet, the space is called what it calls itself, else what its folder is called.
      const named = info.name ?? chosen.path.split('/').filter(Boolean).pop();
      if (named && !name.trim()) setName(named);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  const addOnServer = async (on: KnownServer) => {
    const chosen = choice === 'new' ? null : serverSpaces?.find((each) => each.id === choice);
    if (!chosen && !name.trim()) {
      setError(t('error.spaceName'));
      return;
    }
    setBusy(true);
    setError(null);
    const source = (id: string): SpaceSource => ({ provider: 'server', account: on.email, place: { url: on.url, space: id } });
    try {
      if (chosen) onDone(await onAdd(chosen.name || name, source(chosen.id), chosen.id));
      else {
        const id = newSpaceId();
        await serverAccount(on.url).openSpace(id, name.trim());
        onDone(await onAdd(name, source(id), id));
      }
    } catch (failure) {
      if (failure instanceof RemoteSignedOut) setServerSignedOut(true);
      else setError(serverFailure(failure, hostOf(on.url)));
      setBusy(false);
    }
  };

  const add = async () => {
    if (server) return addOnServer(server);
    if (busy || !account || !folder) return;
    if (!name.trim()) {
      setError(t('error.spaceName'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { id: item, path, drive, owner } = folder.folder;
      onDone(await onAdd(name, { provider: 'onedrive', account: account.email || account.name, place: { item, path, ...(drive && { drive }), ...(owner && { owner }) } }, folder.id));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('error.create'));
      setBusy(false);
    }
  };

  const chosenSpace = choice === 'new' ? null : (serverSpaces?.find((each) => each.id === choice) ?? null);
  const ready = server
    ? !busy && !serverSignedOut && (chosenSpace ? true : choice === 'new' && server.role !== 'member' && serverSpaces !== null)
    : !!account && !!folder && !busy;
  return {
    name,
    setName,
    account,
    folder,
    picking,
    setPicking,
    signing,
    error,
    setError,
    busy,
    ready,
    connect,
    choose,
    add,
    servers,
    where,
    setWhere,
    server,
    serverSpaces,
    choice,
    setChoice,
    chosenSpace,
    serverSignedOut,
    connecting,
    setConnecting,
    connected,
    start,
  };
}

function AddSpaceDialog({ sync, service, account: given, me, onDevice, unnamed, onSetName, onSaveProfile, onAdd, onDone }: {
  sync: SyncSnapshot;
  service: SyncService;
  /** Who the user is, for setting up a server or signing in to one. */
  me: Me | null;
  onDevice: string[];
  /** Signed in already, the page back from Microsoft: the account to choose the folder in. */
  account: Connection['account'] | null;
  /** The profile has no name: the others of the space would see Unnamed. */
  unnamed: boolean;
  /** Goes to Profile, to set the name. */
  onSetName?: () => void;
  onSaveProfile: SettingsValues['onSaveProfile'];
  onAdd: SettingsValues['onAddSpace'];
  onDone: (id: string | null) => void;
}) {
  const added = useAddSpace({ service, account: given, onAdd, onDone, onDevice });
  const { name, setName, account, folder, picking, setPicking, signing, error, setError, busy, ready, connect, choose, add } = added;
  const { servers, where, setWhere, server, serverSpaces, choice, setChoice, chosenSpace, serverSignedOut, connecting, setConnecting, connected, start } = added;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || picking || connecting) return;
    // The settings behind close on Escape too; this window takes it first.
    event.preventDefault();
    event.stopPropagation();
    onDone(null);
  };

  return (
    <div className="fp-ovl" onMouseDown={(event) => event.target === event.currentTarget && onDone(null)}>
      <div className="fp space-add" role="dialog" aria-modal="true" aria-label={t('space.addTitle')} tabIndex={-1} onKeyDown={onKeyDown}>
        <h3>{t('space.addTitle')}</h3>
        <label className="label" htmlFor="space-add-name">
          {t('settings.name')}
        </label>
        <input
          id="space-add-name"
          className="field"
          value={name}
          autoFocus
          autoComplete="off"
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            void add();
          }}
        />
        <span className="label">{t('space.location')}</span>
        <div className="list" role="radiogroup" aria-label={t('space.location')}>
          <button type="button" role="radio" aria-checked={where === 'onedrive'} className={where === 'onedrive' ? 'row on' : 'row'} onClick={() => setWhere('onedrive')}>
            <CloudIcon />
            <span className="name">{t('sync.oneDrive')}</span>
            <small>{account === undefined ? t('sync.loading') : account ? account.email || account.name : t('space.notConnected')}</small>
          </button>
          {servers.map((each) => (
            <button key={each.url} type="button" role="radio" aria-checked={where === each.url} className={where === each.url ? 'row on' : 'row'} onClick={() => setWhere(each.url)}>
              <ServerIcon />
              <span className="name">{hostOf(each.url)}</span>
              <small>{each.email}</small>
            </button>
          ))}
          <button type="button" className="row srv-new" onClick={() => setConnecting(true)}>
            <Icon name="plus" />
            <span className="name">{t('server.connect')}</span>
          </button>
        </div>
        {server ? (
          <>
            <span className="label">{t('space.space')}</span>
            {serverSignedOut ? (
              <div className="connect">
                <ServerIcon />
                <span>{t('server.signInAgain', { host: hostOf(server.url) })}</span>
                <button type="button" className="st-btn go" onClick={() => setConnecting(true)}>
                  {t('server.signIn')}
                </button>
              </div>
            ) : serverSpaces === null ? (
              <p className="note">{t('server.looking')}</p>
            ) : (
              <>
                <div className="list" role="radiogroup" aria-label={t('space.space')}>
                  {server.role !== 'member' && (
                    <button type="button" role="radio" aria-checked={choice === 'new'} className={choice === 'new' ? 'row on' : 'row'} onClick={() => setChoice('new')}>
                      <Icon name="plus" />
                      <span className="name">{name.trim() ? t('space.newSpace', { name: name.trim() }) : t('space.newSpaceUnnamed')}</span>
                    </button>
                  )}
                  {serverSpaces.map((each) => (
                    <button key={each.id} type="button" role="radio" aria-checked={choice === each.id} className={choice === each.id ? 'row on' : 'row'} onClick={() => setChoice(each.id)}>
                      <Icon name="space" />
                      <span className="name">{each.name || t('settings.unnamed')}</span>
                      <small>
                        {t('count.people', { count: each.people })} · {t('space.notHere')}
                      </small>
                    </button>
                  ))}
                </div>
                <p className="note">{server.role === 'member' ? t('space.onlyAdmins') : t('space.serverNote')}</p>
              </>
            )}
          </>
        ) : account === null || signing ? (
          <div className="connect">
            <CloudIcon />
            <span>{signing ? t('sync.waitingForBrowser') : t('space.connectFirst')}</span>
            {signing ? (
              <button type="button" className="st-btn" onClick={() => signing.cancel()}>
                {t('sync.cancel')}
              </button>
            ) : (
              <button type="button" className="st-btn go" onClick={() => void connect()}>
                {t('sync.connectOneDrive')}
              </button>
            )}
          </div>
        ) : (
          <>
            <span className="label">{t('settings.folder')}</span>
            <div className="pick">
              <span className={folder ? 'path' : 'path none'}>
                {folder ? (
                  <>
                    <CloudIcon />
                    {placeWords(folder.folder.path, folder.folder.drive)}
                    {account && <small>{account.email || account.name}</small>}
                  </>
                ) : (
                  t('space.noFolder')
                )}
              </span>
              <button type="button" className="st-btn" disabled={!account || busy} onClick={() => setPicking(true)}>
                {t('space.chooseFolder')}
              </button>
            </div>
          </>
        )}
        {error && (
          <p className="note err" role="alert">
            {error}
          </p>
        )}
        {unnamed && (server || account) && !signing && (
          <div className="st-warn">
            <Icon name="warn" />
            <span>{t('space.unnamedWarning')}</span>
            {onSetName && (
              <button type="button" className="st-btn" onClick={onSetName}>
                {t('space.setName')}
              </button>
            )}
          </div>
        )}
        <div className="foot">
          <button type="button" className="st-btn" onClick={() => onDone(null)}>
            {t('dialog.cancel')}
          </button>
          <button type="button" className="st-btn go" disabled={!ready} onClick={() => void add()}>
            {chosenSpace ? t('space.add', { name: chosenSpace.name || t('settings.unnamed') }) : name.trim() ? t('space.add', { name: name.trim() }) : t('settings.add')}
          </button>
        </div>
      </div>
      {picking && account && (
        <FolderPicker
          account={account}
          service={service}
          suggested={name}
          withShared
          startShared={sync.addingShared}
          onUse={(chosen) => void choose(chosen)}
          onCancel={() => setPicking(false)}
        />
      )}
      {connecting && (
        <ConnectServerDialog
          me={me}
          device={sync.device.name}
          again={serverSignedOut && server ? { url: server.url, email: server.email } : undefined}
          start={start}
          onDone={connected}
          onProfile={onSaveProfile}
          onClose={() => setConnecting(false)}
        />
      )}
    </div>
  );
}

/** The name of a space, saved with its button; Escape puts the one it has back. */
function NameRow({ id, name, fallback, onRename }: { id: string; name: string; fallback: string; onRename: (name: string) => void }) {
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const changed = (draft.trim() || fallback) !== name;
  const save = () => {
    if (changed) onRename(draft);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') save();
    else if (event.key === 'Escape' && draft !== name) setDraft(name);
    else return;
    event.preventDefault();
  };
  return (
    <div className="st-row">
      <label className="fl" htmlFor={id}>
        {t('settings.name')}
      </label>
      <input id={id} value={draft} autoComplete="off" onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} />
      <button type="button" className="primary" disabled={!changed} onClick={save}>
        {t('settings.save')}
      </button>
    </div>
  );
}

const BackRow = ({ onBack }: { onBack: () => void }) => (
  <button type="button" className="st-back" onClick={onBack}>
    <Icon name="chevron" />
    <span>{t('settings.backToSpaces')}</span>
  </button>
);

/** The personal space: its name, its folder and its sync, as before; and this device's name. */
function PersonalPage({
  spaceName,
  onRenameSpace,
  folder,
  defaultFolder,
  onChangeFolder,
  onUseDefaultFolder,
  sync,
  syncService,
  onBack,
}: Pick<SettingsValues, 'spaceName' | 'onRenameSpace' | 'folder' | 'defaultFolder' | 'onChangeFolder' | 'onUseDefaultFolder' | 'sync' | 'syncService'> & { onBack?: () => void }) {
  const name = spaceName ?? t('settings.personal');
  return (
    <>
      {onBack && <BackRow onBack={onBack} />}
      <div className="st-space">
        <div className="top">
          <Icon name="space" />
          <b>{name}</b>
          <small>{t('settings.yours')}</small>
        </div>
        <NameRow id="space-name" name={name} fallback={t('settings.personal')} onRename={onRenameSpace} />
        <div className="st-row">
          <span className="fl">{t('settings.folder')}</span>
          {folder ? (
            <span className="path" title={folder}>
              {folder}
            </span>
          ) : (
            <span className="path plain">{t('settings.inBrowser')}</span>
          )}
          {onChangeFolder ? (
            <span className="btns">
              <button type="button" onClick={onChangeFolder}>
                {t('settings.change')}
              </button>
              {onUseDefaultFolder && defaultFolder && folder !== defaultFolder && (
                <button type="button" onClick={onUseDefaultFolder}>
                  {t('settings.useDefault')}
                </button>
              )}
            </span>
          ) : (
            <span />
          )}
        </div>
        {sync.available && <SyncRow sync={sync} service={syncService} />}
      </div>
    </>
  );
}

/**
 * A space beside the personal one, after the Space view of design/mockups.html: its name, where
 * its copy is on this device (on desktop a folder, which can move), its sync, and the way out of
 * this device.
 */
function SpacePage({ space, me, onPersonActive, sync, service, onRename, onChangeFolder, onBack, onRemove, removing, onRemoved, onRemoveSpace }: {
  space: SpaceView;
  me: Me | null;
  onPersonActive: (person: string, active: boolean) => void;
  sync: SyncSnapshot;
  service: SyncService;
  onRename: (name: string) => void;
  onChangeFolder?: () => void;
  onBack: () => void;
  onRemove: () => void;
  removing: SpaceView | null;
  onRemoved: () => void;
  onRemoveSpace: SettingsValues['onRemoveSpace'];
}) {
  return (
    <>
      <BackRow onBack={onBack} />
      <div className="st-space">
        <div className="top">
          <Icon name="space" />
          <b>{space.name}</b>
          {space.source && <small>{space.source.provider === 'server' ? t('settings.onAServer') : t('settings.inProvider', { provider: providerName(space.source.provider) })}</small>}
        </div>
        <NameRow id="space-name" name={space.name} fallback={space.name} onRename={onRename} />
        <div className="st-row">
          <span className="fl">{t('settings.folder')}</span>
          {space.folder ? (
            <span className="path" title={space.folder}>
              {space.folder}
            </span>
          ) : (
            <span className="path plain">{t('settings.inBrowser')}</span>
          )}
          {space.folder && onChangeFolder ? (
            <button type="button" onClick={onChangeFolder}>
              {t('settings.change')}
            </button>
          ) : (
            <span />
          )}
        </div>
        <SpaceSyncRow view={sync.all.find((unit) => unit.space === space.id)} service={service} />
      </div>
      {space.source?.provider === 'server' ? <ServerMembers space={space} me={me} /> : space.people.length > 0 && <People people={space.people} me={me} onActive={onPersonActive} />}
      <div className="st-acts">
        <button type="button" onClick={onRemove}>
          {t('settings.removeSpace')}
        </button>
      </div>
      {removing && <RemoveSpaceDialog space={removing} onRemove={(deleteFiles) => onRemoveSpace(removing.id, deleteFiles)} onClose={onRemoved} />}
    </>
  );
}

/** The language of the interface; offered once there is more than one. */
function Language() {
  const current = languageTag();
  return (
    <>
      <span className="st-label" id="st-language">
        {t('settings.language')}
      </span>
      <div className="st-choices" role="radiogroup" aria-labelledby="st-language">
        {languages.map((language) => (
          <button
            key={language.tag}
            type="button"
            role="radio"
            aria-checked={language.tag === current}
            className={language.tag === current ? 'on' : undefined}
            onClick={() => language.tag !== current && chooseLanguage(language.tag)}
          >
            <span className="radio" />
            {language.name}
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * The settings, after the Settings views of design/mockups.html (direction A): a window in the
 * middle with its sections on the left. On a phone it fills the screen, the sections are a list
 * with arrows, and each one opens as a page with a way back. What is chosen applies at once.
 */
export function Settings(props: SettingsProps) {
  const { onClose } = props;
  const narrow = useNarrow();
  const sections = settingsSections();
  const [section, setSection] = useState<Section>(props.initial ?? 'appearance');
  /** On a phone: the section open as a page, or none while the list shows. */
  const [page, setPage] = useState<Section | null>(props.initial ?? null);
  /** Spaces opens with Add space open, when Agents asked for a server. */
  const [adding, setAdding] = useState(false);
  const box = useRef<HTMLElement>(null);

  useEffect(() => {
    box.current?.focus();
  }, []);

  // Esc goes back from a section's page to the list on a phone, and otherwise closes. A field
  // that takes back what was typed in it has used the key already.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      if (narrow && page) setPage(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [narrow, page, onClose]);

  const go = (next: Section, options?: { adding?: boolean }) => {
    setAdding(!!options?.adding);
    if (narrow) setPage(next);
    else setSection(next);
    props.onShown?.(next);
  };
  const body = (id: Section) => <SettingsSection section={id} {...props} initialAdding={adding} onSection={go} />;
  // What each section is set to, beside it in a narrow window's list.
  const value = (id: Section) => sectionValue(id, props);
  const close = (
    <button type="button" className="x" title={t('settings.close')} aria-label={t('settings.close')} onClick={onClose}>
      ×
    </button>
  );
  const shown = narrow ? page : section;
  const label = (id: Section) => t(SECTIONS.find((s) => s.id === id)!.label);

  return (
    <div className="backdrop settings-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={box} tabIndex={-1} className="settings" role="dialog" aria-modal="true" aria-label={t('settings.title')}>
        <div className="st-head">
          {narrow && page && (
            <button type="button" className="st-back" title={t('settings.back')} aria-label={t('settings.back')} onClick={() => setPage(null)}>
              ‹
            </button>
          )}
          <h2>{narrow && page ? label(page) : t('settings.title')}</h2>
          {close}
        </div>
        {narrow ? (
          shown ? (
            <div className="st-body">{body(shown)}</div>
          ) : (
            <div className="st-list">
              {sections.map((s) => (
                <button key={s.id} type="button" className="st-item" onClick={() => go(s.id)}>
                  <Icon name={s.icon} />
                  <span>{t(s.label)}</span>
                  <span className="v">{value(s.id)}</span>
                  <span className="chev" aria-hidden="true">
                    ›
                  </span>
                </button>
              ))}
            </div>
          )
        ) : (
          <div className="st-main">
            <nav className="st-nav" aria-label={t('settings.title')}>
              {sections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={s.id === section ? 'on' : undefined}
                  aria-current={s.id === section ? 'page' : undefined}
                  onClick={() => go(s.id)}
                >
                  <Icon name={s.icon} />
                  <span>{t(s.label)}</span>
                </button>
              ))}
            </nav>
            <div className="st-body">{body(section)}</div>
          </div>
        )}
      </section>
    </div>
  );
}
