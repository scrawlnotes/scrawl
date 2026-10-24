import { type ComputerAgent, dayOf, isAgent, type Me, type MovedMark, newSpaceId, ownerName, type Person, RemoteSignedOut, type ServerSpace, type SpaceSource } from '@scrawlnotes/core';
import { languages, locale, type MessageKey, t } from '@scrawlnotes/i18n';
import { type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ContextMenu, Dialog, type MenuItem } from './dialogs';
import type { SpaceView } from './session';
import { chooseLanguage, isPhone, languageTag, type Mode, NUMBER_CHOICES, type Numbers, shadeOfMode, SIZES, type SizeKind, thisSizeKind } from './device';
import { Icon, type IconName } from './Icon';
import { useNarrow } from './narrow';
import type { Connection, SyncService, SyncSnapshot } from './sync';
import { dueLabel } from './Tasks';
import { ago, CloudIcon, FolderPicker, OwnApp, personalPlace, placeWords, providerName, ServerIcon, sourcePlace, SpaceSyncRow, SyncRow, ThisDevice, useTicking } from './SyncViews';
import { paletteOf, type Shade, THEMES, type Theme, themeById } from './themes';
import { ConnectStep, serverFailure, signInWords } from './ServerConnect';
import { ROLE_WORD, ServerMembers, ServerPage, useSpaceRename } from './ServerPeople';
import { hostOf, knownServers, type KnownServer, noteRole, pendingJoin, serverAccount, type SignInWhy, signInWhy, tookJoin, useKnownServers } from './servers';
import { Agents } from './Agents';
import { LogsSection } from './Logs';
import { checkForUpdates, releasePage, useAppVersion, useDesktopUpdate } from './desktopUpdate';
import { APP_VERSION, checkForWebUpdate, PUBLISHED, subscribeUpdate, webUpdatesOn, webUpdateStatus } from './pwa';
import { type AskOneDrive, isDesktop, type OneDriveAnswer, openUrlOnDesktop } from './storage';
import { setBackground, useBackground } from './tray';

export type Section = 'profile' | 'appearance' | 'general' | 'spaces' | 'agents' | 'language' | 'logs' | 'about';

const SECTIONS: { id: Section; label: MessageKey; icon: IconName }[] = [
  { id: 'profile', label: 'settings.profile', icon: 'person' },
  { id: 'appearance', label: 'settings.appearance', icon: 'appearance' },
  { id: 'general', label: 'settings.general', icon: 'tune' },
  { id: 'spaces', label: 'settings.spaces', icon: 'space' },
  { id: 'agents', label: 'settings.agents', icon: 'agent' },
  { id: 'language', label: 'settings.language', icon: 'language' },
  { id: 'logs', label: 'settings.logs', icon: 'logs' },
  { id: 'about', label: 'settings.about', icon: 'info' },
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
  /** How numbers are written on this device. */
  numbers: Numbers;
  onNumbers: (numbers: Numbers) => void;
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
  /** Adds a space; `existing` for one that is there already, which comes with its own name. */
  onAddSpace: (name: string, source: SpaceSource, id?: string, existing?: boolean) => Promise<string>;
  /** Takes a space off this device; with `deleteFiles`, its copy here goes too. */
  onRemoveSpace: (id: string, deleteFiles: boolean) => void;
  onMoveSpace: (id: string, by: -1 | 1) => void;
  /** Makes a person of a space inactive, or active again. */
  onPersonActive: (space: string, person: string, active: boolean) => void;
  /** The person's agents on their computers, from their own space. */
  computerAgents?: () => Promise<ComputerAgent[]>;
  /** A new name for one of the person's agents on a computer. */
  onRenameComputerAgent?: (id: string, name: string) => Promise<void>;
  /** Opens another section of the settings: Profile, from where a name is asked for; Spaces with Add space open, from Agents. */
  onSection?: (section: Section, options?: { adding?: boolean }) => void;
  /** Spaces opens with Add space open: asked for from Agents, to connect a server. */
  initialAdding?: boolean;
  /** Desktop: asks for another folder for a space's copy on this device, and moves it there; one in OneDrive is asked about with `ask`. */
  onChangeSpaceFolder?: (id: string, ask: AskOneDrive) => void;
  /** The space whose page Spaces opens on: an id, null for the personal space, undefined for the list. */
  initialSpace?: string | null;
  /** Back from signing in to add a space: Spaces opens with Add space, its folder to be chosen in this account. */
  addingAs?: Connection['account'] | null;
  /** Desktop: the folder the notes are in. Null in the browser. */
  folder: string | null;
  /** Desktop: the folder the notes go to unless another is chosen. */
  defaultFolder: string | null;
  /** Desktop: asks for another notes folder; one in OneDrive is asked about with `ask`. */
  onChangeFolder?: (ask: AskOneDrive) => void;
  /** Desktop: goes back to the default folder. */
  onUseDefaultFolder?: () => void;
  /** How the space's sync stands, and what connects and disconnects it. */
  sync: SyncSnapshot;
  syncService: SyncService;
  /** Writes what is being typed, then goes over to the new version: on the desktop it installs it and opens again, on the web the page reloads into it. */
  onRestartUpdate?: () => void;
}

export interface SettingsProps extends SettingsValues {
  /** The section shown first. */
  initial?: Section;
  /** Each section shown after it: the sidebar marks Sync while Spaces is on screen, Settings otherwise. */
  onShown?: (section: Section) => void;
  onClose: () => void;
}

/** The sections, General on the desktop only, Language once there is more than one language, About on the desktop and the web, not on a phone. */
export const settingsSections = () =>
  SECTIONS.filter((section) => (section.id !== 'general' || isDesktop) && (section.id !== 'language' || languages.length > 1) && (section.id !== 'about' || isDesktop || !isPhone()));

/** What a section is set to, beside it in the list of a phone. */
export function sectionValue(id: Section, { mode, theme, spaceName, me, spaces }: Pick<SettingsValues, 'mode' | 'theme' | 'spaceName' | 'me' | 'spaces'>): string {
  if (id === 'profile') return me?.name ?? t('settings.unnamed');
  if (id === 'appearance') return `${themeById(theme).name} · ${t(MODES.find((choice) => choice.mode === mode)!.label)}`;
  // With more than one space, how many there are; with one, what it is called.
  if (id === 'spaces') return spaces.length > 0 ? String(spaces.length + 1) : (spaceName ?? t('settings.personal'));
  if (id === 'agents') return knownServers().length > 0 ? t('agents.viaServers', { count: knownServers().length }) : '';
  if (id === 'about' || id === 'logs' || id === 'general') return '';
  return languages.find((language) => language.tag === languageTag())?.name ?? '';
}

/** What a section has, in the window or on a phone's page. */
export function SettingsSection({ section, ...values }: SettingsValues & { section: Section }) {
  return section === 'profile' ? <Profile {...values} /> : section === 'appearance' ? <Appearance {...values} /> : section === 'general' ? <General /> : section === 'spaces' ? <Spaces {...values} /> : section === 'agents' ? <Agents {...values} /> : section === 'logs' ? <LogsSection /> : section === 'about' ? <About {...values} /> : <Language />;
}

/** The source, under both Abouts. */
function AboutSource({ open }: { open: (url: string) => void }) {
  return (
    <p className="st-note about-source">
      {t('about.openSource')}{' '}
      <button type="button" className="st-link" onClick={() => open('https://github.com/scrawlnotes/scrawl')}>
        github.com/scrawlnotes/scrawl
      </button>
    </p>
  );
}

/**
 * On the web: the version running, the desktop app's number, with when it went out on the web, and
 * under it how the updates stand, with Check for updates. A version found is kept on the device,
 * and Reload goes over to it, as the status bar's Reload does.
 */
function WebAbout({ onRestartUpdate }: Pick<SettingsValues, 'onRestartUpdate'>) {
  const update = useSyncExternalStore(subscribeUpdate, webUpdateStatus);
  const on = useSyncExternalStore(subscribeUpdate, webUpdatesOn);
  useTicking(update.state === 'upToDate');
  const check = () => void checkForWebUpdate();
  const checkButton = (label: MessageKey, disabled = false) => (
    <button type="button" className="st-btn" disabled={disabled || !on} onClick={check}>
      {t(label)}
    </button>
  );
  let state: ReactNode;
  let acts: ReactNode = null;
  switch (update.state) {
    case 'idle':
      state = <span className="state off">{t('about.notYet')}</span>;
      acts = checkButton('about.check');
      break;
    case 'checking':
      state = (
        <span className="state">
          <span className="spinner" aria-hidden="true" />
          {t('about.checking')}
        </span>
      );
      acts = checkButton('about.check', true);
      break;
    case 'upToDate':
      state = (
        <span className="state">
          <i />
          {t('about.upToDate', { ago: ago(update.checked) })}
        </span>
      );
      acts = checkButton('about.check');
      break;
    case 'downloading':
      state = (
        <span className="state">
          <span className="spinner" aria-hidden="true" />
          {t('about.webDownloading')}
        </span>
      );
      break;
    case 'ready':
      state = (
        <span className="state ready">
          <i />
          {t('about.webReady')}
        </span>
      );
      acts = (
        <button type="button" className="st-btn go" onClick={onRestartUpdate}>
          {t('status.reload')}
        </button>
      );
      break;
    case 'failed':
      state = (
        <span className="state warn">
          <Icon name="warn" />
          {update.offline ? t('about.webOffline', { host: window.location.host }) : t('about.failed', { reason: update.reason })}
        </span>
      );
      acts = checkButton('about.tryAgain');
      break;
  }
  return (
    <>
      <span className="st-label">{t('settings.about')}</span>
      <div className="st-space">
        <div className="st-row">
          <span className="fl">{t('about.version')}</span>
          <span className="path plain">{t('about.webName', { version: APP_VERSION, date: new Date(PUBLISHED).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' }) })}</span>
        </div>
        <div className="st-sync">
          <span className="fl">{t('about.updates')}</span>
          <div className="what" role="status">
            {state}
            {acts && <span className="acts">{acts}</span>}
          </div>
        </div>
      </div>
      <p className="st-note">{t('about.webNote')}</p>
      <AboutSource open={(url) => void window.open(url, '_blank', 'noopener')} />
    </>
  );
}

/**
 * The version running and what is new in it; under it how the updates stand, as a space's page
 * shows its sync, with what can be done. The web has its own, WebAbout.
 */
/** Settings › General, on the desktop: what the app does with its window closed (design/background.md 2.4). */
function General() {
  const background = useBackground();
  return (
    <>
      <span className="st-label">{t('settings.general')}</span>
      <div className="st-space">
        <label className="st-check">
          <input type="checkbox" checked={background} onChange={(event) => setBackground(event.target.checked)} />
          <span>
            {t('general.background')}
            <small>{t('general.backgroundNote')}</small>
          </span>
        </label>
      </div>
    </>
  );
}

function About({ onRestartUpdate }: Pick<SettingsValues, 'onRestartUpdate'>) {
  if (!isDesktop) return <WebAbout onRestartUpdate={onRestartUpdate} />;
  return <DesktopAbout onRestartUpdate={onRestartUpdate} />;
}

function DesktopAbout({ onRestartUpdate }: Pick<SettingsValues, 'onRestartUpdate'>) {
  const version = useAppVersion();
  const update = useDesktopUpdate();
  useTicking(update.state === 'upToDate');
  const open = (url: string) => void openUrlOnDesktop(url).catch(() => undefined);
  const check = () => void checkForUpdates().catch(() => undefined);
  const checkButton = (label: MessageKey, disabled = false) => (
    <button type="button" className="st-btn" disabled={disabled} onClick={check}>
      {t(label)}
    </button>
  );
  let state: ReactNode;
  let acts: ReactNode = null;
  switch (update.state) {
    case 'idle':
      state = <span className="state off">{t('about.notYet')}</span>;
      acts = checkButton('about.check');
      break;
    case 'checking':
      state = (
        <span className="state">
          <span className="spinner" aria-hidden="true" />
          {t('about.checking')}
        </span>
      );
      acts = checkButton('about.check', true);
      break;
    case 'upToDate':
      state = (
        <span className="state">
          <i />
          {t('about.upToDate', { ago: ago(update.checked) })}
        </span>
      );
      acts = checkButton('about.check');
      break;
    case 'downloading':
      state = (
        <span className="state">
          {update.percent === null ? t('about.downloading', { version: update.version }) : t('about.downloadingPct', { version: update.version, pct: update.percent })}
          {update.percent !== null && (
            <span className="bar" aria-hidden="true">
              <i style={{ width: `${update.percent}%` }} />
            </span>
          )}
        </span>
      );
      break;
    case 'ready':
      state = (
        <span className="state ready">
          <i />
          {t('about.ready', { version: update.version })}
        </span>
      );
      acts = (
        <>
          <button type="button" className="st-btn go" onClick={onRestartUpdate}>
            {t('about.restart')}
          </button>
          <button type="button" className="st-btn" onClick={() => open(releasePage(update.version))}>
            {t('about.whatsNewIn', { version: update.version })}
          </button>
        </>
      );
      break;
    case 'failed':
      state = (
        <span className="state warn">
          <Icon name="warn" />
          {update.offline ? t('about.offline') : t('about.failed', { reason: update.reason })}
        </span>
      );
      acts = checkButton('about.tryAgain');
      break;
  }
  return (
    <>
      <span className="st-label">{t('settings.about')}</span>
      <div className="st-space">
        <div className="st-row">
          <span className="fl">{t('about.version')}</span>
          <span className="path plain">{t('about.name', { version })}</span>
          <button type="button" disabled={!version} onClick={() => open(releasePage(version))}>
            {t('about.whatsNew')}
          </button>
        </div>
        <div className="st-sync">
          <span className="fl">{t('about.updates')}</span>
          <div className="what" role="status">
            {state}
            {acts && <span className="acts">{acts}</span>}
          </div>
        </div>
      </div>
      <p className="st-note">{t('about.note')}</p>
      <AboutSource open={open} />
    </>
  );
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
function Appearance({ mode, onMode, theme, onTheme, system, sizes, onSize, numbers, onNumbers }: Pick<SettingsValues, 'mode' | 'onMode' | 'theme' | 'onTheme' | 'system' | 'sizes' | 'onSize' | 'numbers' | 'onNumbers'>) {
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
      <span className="st-label" id="st-numbers">
        {t('settings.numbers')}
      </span>
      <div className="st-modes" role="radiogroup" aria-labelledby="st-numbers">
        {NUMBER_CHOICES.map((choice) => {
          // Each written as it writes a number; the browser's way as this browser does.
          const sample = new Intl.NumberFormat(choice === 'browser' ? undefined : choice).format(1234.56);
          return (
            <button key={choice} type="button" role="radio" aria-checked={choice === numbers} className={choice === numbers ? 'on' : undefined} onClick={() => onNumbers(choice)}>
              {choice === 'browser' ? t('settings.numbersBrowser', { sample }) : sample}
            </button>
          );
        })}
      </div>
      <p className="st-note">{t('settings.numbersNote')}</p>
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
          <input id="me-email" type="email" value={draft.email} autoComplete="email" placeholder={t('settings.emailHint')} onChange={(event) => setDraft({ ...draft, email: event.target.value })} onKeyDown={onKeyDown} />
          <button type="button" className="primary" disabled={!changed} onClick={save}>
            {t('settings.save')}
          </button>
        </div>
      </div>
    </>
  );
}

/**
 * The spaces, after the Spaces views of design/mockups.html and design/spaces.md: Personal, the
 * one space that is only yours, with where it syncs; Shared, the spaces worked in with others, in
 * the sidebar's order, Add space under them. Each row opens the space's page: a shared space's has
 * its name, its folder, its sync, its people and the way out of this device.
 */
function Spaces(values: Pick<SettingsValues, 'me' | 'onSaveProfile' | 'spaceName' | 'onRenameSpace' | 'spaces' | 'onRenameSpaceById' | 'onAddSpace' | 'onRemoveSpace' | 'onMoveSpace' | 'onPersonActive' | 'onSection' | 'onChangeSpaceFolder' | 'initialSpace' | 'addingAs' | 'initialAdding' | 'folder' | 'defaultFolder' | 'onChangeFolder' | 'onUseDefaultFolder' | 'sync' | 'syncService'>) {
  const { spaces, onMoveSpace, onRemoveSpace, initialSpace, addingAs, sync, syncService } = values;
  // The page open: a space by its id, null for the personal space, undefined for the list.
  const [page, setPage] = useState<string | null | undefined>(initialSpace);
  // Opened with an invite link, Add space opens with it; asked for from Agents, it opens too.
  const [adding, setAdding] = useState(() => !!addingAs || !!pendingJoin() || !!values.initialAdding);
  // A server's page, by its address.
  const [serverPage, setServerPage] = useState<string | null>(null);
  // A server's space being added from its page, chosen in the window already.
  const [addingFrom, setAddingFrom] = useState<{ server: string; space: string } | null>(null);
  const servers = useKnownServers();
  const [removing, setRemoving] = useState<SpaceView | null>(null);
  const [oneDrive, askOneDrive] = useOneDriveAsk();
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; id: string } | null>(null);
  // The account the page came back from Microsoft with is taken once.
  useEffect(() => {
    if (addingAs) syncService.donePicking();
  }, [addingAs, syncService]);
  // Back from Microsoft to sync the personal space: its page opens, the window on it at the folders.
  useEffect(() => {
    if (sync.picking) setPage(null);
  }, [sync.picking]);
  const personalName = values.spaceName ?? t('settings.personal');
  const add =
    adding &&
    <AddSpaceDialog
      sync={sync}
      service={syncService}
      account={addingAs ?? null}
      me={values.me}
      onDevice={values.spaces.map((space) => space.id)}
      preset={addingFrom}
      onSaveProfile={values.onSaveProfile}
      onAdd={values.onAddSpace}
      onDone={(id) => {
        setAdding(false);
        setAddingFrom(null);
        if (id) {
          setServerPage(null);
          setPage(id);
        }
      }}
    />;
  if (page === null) {
    const { onChangeFolder } = values;
    return (
      <>
        <PersonalPage {...values} onChangeFolder={onChangeFolder && (() => onChangeFolder(askOneDrive))} onBack={() => setPage(undefined)} />
        {oneDrive}
      </>
    );
  }
  const onServer = serverPage ? servers.find((each) => each.url === serverPage) : undefined;
  if (onServer) {
    return (
      <>
        <ServerPage
          server={onServer}
          onDevice={values.spaces.map((space) => space.id)}
          onAdd={(space) => {
            setAddingFrom({ server: onServer.url, space });
            setAdding(true);
          }}
          onBack={() => setServerPage(null)}
          {...(values.onSection && { onAgents: () => values.onSection!('agents') })}
          onSignOut={() => {
            setServerPage(null);
            void syncService.signOutOfServer(onServer.url);
          }}
        />
        {add}
      </>
    );
  }
  const shown = page === undefined ? null : spaces.find((space) => space.id === page);
  if (shown) {
    return (
      <>
        <SpacePage
          space={shown}
          me={values.me}
          onPersonActive={(person, active) => values.onPersonActive(shown.id, person, active)}
          sync={sync}
          service={syncService}
          onRename={(name) => values.onRenameSpaceById(shown.id, name)}
          {...(values.onChangeSpaceFolder && { onChangeFolder: () => values.onChangeSpaceFolder!(shown.id, askOneDrive) })}
          onBack={() => setPage(undefined)}
          onRemove={() => setRemoving(shown)}
          removing={removing}
          onRemoved={() => setRemoving(null)}
          onRemoveSpace={onRemoveSpace}
        />
        {oneDrive}
      </>
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
      <span className="st-label">{t('settings.personal')}</span>
      <p className="st-note">{t('settings.personalAbout')}</p>
      <div className="st-list">
        <button type="button" className="st-li" onClick={() => setPage(null)}>
          <Icon name="space" />
          <span className="nm">
            <b>{personalName}</b>
            <small>{personalPlace(sync.connection)}</small>
          </span>
        </button>
      </div>
      <span className="st-label">{t('settings.shared')}</span>
      <p className="st-note">{t('settings.sharedAbout')}</p>
      {spaces.length > 0 && (
        <div className="st-list">
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
      )}
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
  const active = people.filter((person) => person.active && !isAgent(person));
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
  const shown = people.filter((person) => !isAgent(person)).sort((a, b) => rank(a) - rank(b) || (a.name ?? '').localeCompare(b.name ?? ''));
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
 * The agents of a space, under its people (design/mockups.html, Kim ne yaptı, ajanlar dahil):
 * everyone's agents that have changed something here, each with whose it is and when it last
 * did. One is made inactive from its menu; it is active again when it changes something.
 */
function SpaceAgents({ people, onActive }: { people: Person[]; onActive: (person: string, active: boolean) => void }) {
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; id: string } | null>(null);
  const today = dayOf(new Date());
  const whose = (agent: Person) => ownerName(agent, people);
  const shown = people.filter(isAgent).sort((a, b) => Number(!a.active) - Number(!b.active) || (whose(a) ?? '').localeCompare(whose(b) ?? '') || (a.name ?? '').localeCompare(b.name ?? ''));
  const open = (event: MouseEvent, id: string) => {
    event.preventDefault();
    setMenu({ at: { x: event.clientX, y: event.clientY }, id });
  };
  return (
    <>
      <span className="st-label">{t('settings.spaceAgents')}</span>
      <p className="st-note">{t('settings.agentsAbout')}</p>
      <div className="st-list">
        {shown.map((agent) => {
          const owner = whose(agent);
          return (
            <div key={agent.id} className={`st-li one${agent.active ? '' : ' off'}${menu?.id === agent.id ? ' menu-on' : ''}`} {...(agent.active && { onContextMenu: (event: MouseEvent) => open(event, agent.id) })}>
              <span className="who bot" aria-hidden="true">
                {(agent.agent?.client ?? agent.name ?? '?').slice(0, 1).toUpperCase()}
              </span>
              <span className="nm">
                <b>{agent.name ?? agent.agent?.client ?? t('agents.unnamedAgent')}</b>
                <small>{owner ? t('settings.agentOf', { name: owner }) : t('settings.someonesAgent')}</small>
              </span>
              <span className="r">{agent.active ? (agent.seen ? dueLabel(dayOf(new Date(agent.seen)), today) : '') : t('settings.inactive')}</span>
              {agent.active && (
                <button type="button" className="it-more" title={t('side.more')} aria-label={t('side.more')} onClick={(event) => open(event, agent.id)}>
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

/** Desktop: the question about a folder chosen in OneDrive, whose app would sync it a second time. Enter chooses another. */
function OneDriveFolderDialog({ onAnswer }: { onAnswer: (answer: OneDriveAnswer) => void }) {
  const title = t('settings.inOneDrive');
  const onKey = (event: KeyboardEvent) => {
    // Enter on Use it anyway is that button's own click.
    if (event.key !== 'Enter' || event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    onAnswer('another');
  };
  return (
    <Dialog label={title} onClose={() => onAnswer(null)} onKeyDown={onKey}>
      <h2>{title}</h2>
      <p className="confirm">{t('settings.inOneDriveText')}</p>
      <div className="dialog-actions">
        <button type="button" onClick={() => onAnswer('use')}>
          {t('settings.useAnyway')}
        </button>
        <button type="button" className="primary" onClick={() => onAnswer('another')}>
          {t('settings.chooseAnother')}
        </button>
      </div>
    </Dialog>
  );
}

/** The question about a folder in OneDrive, drawn where the settings are, and the ask that opens it and waits for its answer. */
function useOneDriveAsk(): [ReactNode, AskOneDrive] {
  const [answering, setAnswering] = useState<((answer: OneDriveAnswer) => void) | null>(null);
  const ask: AskOneDrive = () => new Promise((resolve) => setAnswering(() => resolve));
  const window = answering && (
    <OneDriveFolderDialog
      onAnswer={(answer) => {
        setAnswering(null);
        answering(answer);
      }}
    />
  );
  return [window, ask];
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
 * window, which a folder that is a space already, or one that cannot be one, answers; the others
 * there see you by Profile's name and email, so with either empty both are asked, and adding saves
 * them to Profile. On a server: a new space there, which only its owner and admins open, or one of
 * its spaces the person was invited to and that is not on this device yet; the account there says
 * who you are. Then adding it.
 */
export function useAddSpace({ service, account: given, me, onSaveProfile, onAdd, onDone, onDevice, preset }: {
  service: SyncService;
  /** Signed in already, the page back from Microsoft: the account to choose the folder in. */
  account: Connection['account'] | null;
  /** Who the user is: Profile's name and email, asked for when one is empty. */
  me: Me | null;
  onSaveProfile: SettingsValues['onSaveProfile'];
  onAdd: SettingsValues['onAddSpace'];
  onDone: (id: string | null) => void;
  /** The ids of the spaces on this device, which a server's list leaves out. */
  onDevice: string[];
  /** A space of a server to add, chosen already: from the server's page. */
  preset?: { server: string; space: string } | null;
}) {
  const [name, setName] = useState('');
  // Your name and email for the others of a space in OneDrive, what Profile has to start with.
  const [you, setYou] = useState({ name: me?.name ?? '', email: me?.email ?? '' });
  // Asked once in a window, they stay until it closes, also once adding saved them to Profile.
  const missing = !me?.name || !me?.email;
  const [asked, setAsked] = useState(missing);
  useEffect(() => {
    if (missing) setAsked(true);
  }, [missing]);
  // Profile filled meanwhile, from a server's account: what it has goes where nothing is typed.
  useEffect(() => setYou((now) => ({ name: now.name || me?.name || '', email: now.email || me?.email || '' })), [me?.name, me?.email]);
  // Undefined while it is being asked whether a key is kept.
  const [account, setAccount] = useState<Connection['account'] | null | undefined>(given ?? undefined);
  // A folder that is a space already has its id and its name; one that is not is named here.
  const [folder, setFolder] = useState<{ folder: Connection['folder']; id?: string; name?: string } | null>(null);
  // Back from signing in for it, the folder window opens at once.
  const [picking, setPicking] = useState(!!given);
  const [signing, setSigning] = useState<{ cancel(): void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Where it lives: OneDrive, or a server by its address.
  const [servers, setServers] = useState<KnownServer[]>(() => knownServers());
  const [where, setWhere] = useState(preset?.server ?? 'onedrive');
  const server = servers.find((each) => each.url === where) ?? null;
  // The server's spaces not on this device, null while it is asked; and the one chosen, `new` for a new one.
  const [serverSpaces, setServerSpaces] = useState<ServerSpace[] | null>(null);
  const [choice, setChoice] = useState('new');
  const [serverSignedOut, setServerSignedOut] = useState<SignInWhy | null>(null);
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
    setServerSignedOut(null);
    setError(null);
    const account = serverAccount(server.url);
    Promise.all([account.spaces(), account.me()]).then(
      ([spaces, me]) => {
        if (!live) return;
        const here = new Set(onDeviceKey.split(' '));
        // The account's personal space there is not a shared space to add.
        const offered = spaces.filter((each) => !here.has(each.id) && !each.personal);
        setServerSpaces(offered);
        setServers((now) => now.map((each) => (each.url === server.url ? { ...each, role: me.role } : each)));
        noteRole(server.url, me.role);
        const asked = preset?.server === server.url ? offered.find((each) => each.id === preset.space) : undefined;
        setChoice(asked ? asked.id : me.role === 'member' ? (offered[0]?.id ?? '') : 'new');
      },
      (failure: unknown) => {
        if (!live) return;
        setServerSpaces([]);
        if (failure instanceof RemoteSignedOut) setServerSignedOut(signInWhy(failure, server.url));
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
    setServerSignedOut(null);
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
    onAdd(joined.name, source, joined.id, true).then(onDone, (failure: unknown) => {
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
      // A folder that is a space already says what it is called; its id goes with it. One that is
      // not is named here, its folder's name to start with.
      const info = await service.spaceAt(chosen);
      const folderName = chosen.path.split('/').filter(Boolean).pop();
      if (info.id) setFolder({ folder: chosen, id: info.id, name: info.name ?? folderName ?? t('settings.unnamed') });
      else {
        setFolder({ folder: chosen });
        if (folderName && !name.trim()) setName(folderName);
      }
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
      if (chosen) onDone(await onAdd(chosen.name || t('settings.unnamed'), source(chosen.id), chosen.id, true));
      else {
        const id = newSpaceId();
        await serverAccount(on.url).openSpace(id, name.trim());
        onDone(await onAdd(name, source(id), id));
      }
    } catch (failure) {
      if (failure instanceof RemoteSignedOut) setServerSignedOut(signInWhy(failure, on.url));
      else setError(serverFailure(failure, hostOf(on.url)));
      setBusy(false);
    }
  };

  const add = async () => {
    if (server) return addOnServer(server);
    if (busy || !account || !folder) return;
    if (!folder.id && !name.trim()) {
      setError(t('error.spaceName'));
      return;
    }
    setBusy(true);
    setError(null);
    // Profile first, so that the space's people have you as typed as soon as it opens.
    if (asking && (you.name.trim() !== (me?.name ?? '') || you.email.trim() !== (me?.email ?? ''))) onSaveProfile(you.name, you.email);
    try {
      const { id: item, path, drive, owner } = folder.folder;
      const source: SpaceSource = { provider: 'onedrive', account: account.email || account.name, place: { item, path, ...(drive && { drive }), ...(owner && { owner }) } };
      onDone(await (folder.id ? onAdd(folder.name!, source, folder.id, true) : onAdd(name, source)));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('error.create'));
      setBusy(false);
    }
  };

  const chosenSpace = choice === 'new' ? null : (serverSpaces?.find((each) => each.id === choice) ?? null);
  // In OneDrive, once it is connected, with a name or an email missing from Profile.
  const asking = !server && !!account && !signing && asked;
  // A name is asked only for a new space: a space that is there already comes with its own,
  // which only its Rename changes.
  const naming = server ? !chosenSpace && choice === 'new' && server.role !== 'member' && serverSpaces !== null : !!folder && !folder.id;
  // What the space is called, for Add and the note on your name.
  const spaceName = server ? (chosenSpace ? chosenSpace.name || t('settings.unnamed') : name.trim()) : folder?.id ? folder.name! : name.trim();
  const ready = server
    ? !busy && !serverSignedOut && (chosenSpace ? true : naming && !!name.trim())
    : !!account && !!folder && !busy && (!naming || !!name.trim());
  return {
    name,
    setName,
    naming,
    spaceName,
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
    asking,
    you,
    setYou,
  };
}

function AddSpaceDialog({ sync, service, account: given, me, onDevice, preset, onSaveProfile, onAdd, onDone }: {
  sync: SyncSnapshot;
  service: SyncService;
  /** Who the user is: asked for here when Profile lacks it, and for setting up a server or signing in to one. */
  me: Me | null;
  onDevice: string[];
  /** Signed in already, the page back from Microsoft: the account to choose the folder in. */
  account: Connection['account'] | null;
  onSaveProfile: SettingsValues['onSaveProfile'];
  onAdd: SettingsValues['onAddSpace'];
  onDone: (id: string | null) => void;
  /** A space of a server to add, chosen already: from the server's page. */
  preset?: { server: string; space: string } | null;
}) {
  const added = useAddSpace({ service, account: given, me, onSaveProfile, onAdd, onDone, onDevice, preset });
  const { name, setName, naming, spaceName, account, folder, picking, setPicking, signing, error, setError, busy, ready, connect, choose, add } = added;
  const { servers, where, setWhere, server, serverSpaces, choice, setChoice, serverSignedOut, connecting, setConnecting, connected, start, asking, you, setYou } = added;
  // The name of a new space, under what it is made in: the server's New space, or a folder that is not a space yet.
  const nameField = naming && (
    <>
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
    </>
  );
  const addOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void add();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || picking) return;
    // The settings behind close on Escape too; this window takes it first. Connecting, it goes back to Location.
    event.preventDefault();
    event.stopPropagation();
    if (connecting) setConnecting(false);
    else onDone(null);
  };

  return (
    <div className="fp-ovl" onMouseDown={(event) => event.target === event.currentTarget && onDone(null)}>
      <div className="fp space-add" role="dialog" aria-modal="true" aria-label={t('space.addTitle')} tabIndex={-1} onKeyDown={onKeyDown}>
        <h3>
          {t('space.addTitle')}
          <small>{t('space.sharedWithOthers')}</small>
        </h3>
        {connecting ? (
          <ConnectStep
            me={me}
            device={sync.device.name}
            again={serverSignedOut && server ? { url: server.url, email: server.email, why: serverSignedOut } : undefined}
            start={start}
            onDone={connected}
            onBack={() => setConnecting(false)}
          />
        ) : (
          <>
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
                    <span>{signInWords(serverSignedOut, hostOf(server.url))}</span>
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
                    {nameField}
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
                {nameField}
          </>
        )}
        {asking && (
          <div className="you">
            <div>
              <label className="label" htmlFor="space-add-you-name">
                {t('space.yourName')}
              </label>
              <input id="space-add-you-name" className="field" value={you.name} autoComplete="name" onChange={(event) => setYou({ ...you, name: event.target.value })} onKeyDown={addOnEnter} />
            </div>
            <div>
              <label className="label" htmlFor="space-add-you-email">
                {t('space.yourEmail')}
              </label>
              <input
                id="space-add-you-email"
                className="field"
                type="email"
                value={you.email}
                autoComplete="email"
                placeholder={t('settings.emailHint')}
                onChange={(event) => setYou({ ...you, email: event.target.value })}
                onKeyDown={addOnEnter}
              />
            </div>
            <p className="note">{spaceName ? t('space.youNote', { space: spaceName }) : t('space.youNoteUnnamed')}</p>
          </div>
        )}
        {error && (
          <p className="note err" role="alert">
            {error}
          </p>
        )}
        <div className="foot">
          <button type="button" className="st-btn" onClick={() => onDone(null)}>
            {t('dialog.cancel')}
          </button>
          <button type="button" className="st-btn go" disabled={!ready} onClick={() => void add()}>
            {spaceName ? t('space.add', { name: spaceName }) : t('settings.add')}
          </button>
        </div>
          </>
        )}
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
    </div>
  );
}

/**
 * A space's name at the top of its page, with Rename beside it where this person renames it:
 * the name turns into a field, with Save and Cancel. What the server says when it refuses shows
 * under it, the field still open.
 */
function SpaceTop({ name, sub, canRename, onRename }: { name: string; sub: string; canRename: boolean; onRename: (name: string) => void | Promise<void> }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setDraft(null);
    setError(null);
  };
  const save = async () => {
    const named = draft?.trim() ?? '';
    if (!named || named === name) return close();
    setBusy(true);
    try {
      await onRename(named);
      close();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };
  if (draft === null) {
    return (
      <div className="top">
        <Icon name="space" />
        <b>{name}</b>
        {canRename && (
          <button type="button" className="st-rename" onClick={() => setDraft(name)}>
            <Icon name="pen" />
            {t('menu.rename')}
          </button>
        )}
        <small>{sub}</small>
      </div>
    );
  }
  return (
    <>
      <form
        className="top naming"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Icon name="space" />
        <input
          autoFocus
          value={draft}
          autoComplete="off"
          aria-label={t('settings.name')}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            close();
          }}
        />
        <button type="submit" className="primary" disabled={busy || !draft.trim()}>
          {t('settings.save')}
        </button>
        <button type="button" onClick={close}>
          {t('dialog.cancel')}
        </button>
      </form>
      {error && (
        <p className="st-note error" role="alert">
          {error}
        </p>
      )}
    </>
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
  me,
}: Pick<SettingsValues, 'spaceName' | 'onRenameSpace' | 'folder' | 'defaultFolder' | 'onUseDefaultFolder' | 'sync' | 'syncService' | 'me'> & { onChangeFolder?: () => void; onBack?: () => void }) {
  const name = spaceName ?? t('settings.personal');
  // Where it syncs is chosen in one window; back from Microsoft with an account, it opens at OneDrive's folders.
  const [placing, setPlacing] = useState(false);
  const [signedIn, setSignedIn] = useState<Connection['account'] | null>(null);
  // Move this device too: where the space went on another device.
  const [following, setFollowing] = useState<MovedMark | null>(null);
  useEffect(() => {
    if (!sync.picking) return;
    setSignedIn(sync.picking);
    setPlacing(true);
    syncService.donePicking();
  }, [sync.picking, syncService]);
  return (
    <>
      {onBack && <BackRow onBack={onBack} />}
      <div className="st-space">
        <SpaceTop name={name} sub={t('settings.onlyYou')} canRename onRename={onRenameSpace} />
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
        {sync.available && <SyncRow
            sync={sync}
            service={syncService}
            onPlace={() => setPlacing(true)}
            onFollow={() => {
              setFollowing(sync.moved);
              setPlacing(true);
            }}
          />}
      </div>
      {placing && (
        <SyncPersonalDialog
          sync={sync}
          service={syncService}
          me={me}
          name={name}
          account={signedIn}
          follow={following}
          onDone={() => {
            setPlacing(false);
            setSignedIn(null);
            setFollowing(null);
          }}
        />
      )}
    </>
  );
}

/** Where the personal space syncs: nowhere, OneDrive, or a server by its address. */
export type PersonalPlace = 'none' | 'onedrive' | (string & {});

/**
 * What Sync Personal goes through, in the window on a computer and in the sheet on a phone
 * (design/spaces.md 2.4): the place, Not synced, OneDrive or a server this device is signed in to,
 * the one it syncs with now marked; in OneDrive, connected first when it is not, then its folder;
 * on a server, the account's personal space there, or a new one, named as the personal space is,
 * with a word when the server is someone else's. Connect a server… is a step of it, an address
 * only. From one place to another it moves the space, leaving a mark in the old place and, asked,
 * deleting the copy there; Stop syncing takes this device out. `follow`, the mark of a move made on
 * another device, opens it at the place that move went to, for this device to follow.
 */
export function useSyncPersonal({ sync, service, name, account: given, follow, onDone }: {
  sync: SyncSnapshot;
  service: SyncService;
  /** What the personal space is called, which a new space on a server takes. */
  name: string;
  /** Back from signing in in the browser: the account whose folders are chosen from. */
  account: Connection['account'] | null;
  /** Move this device too: where the space went on another device. */
  follow?: MovedMark | null;
  onDone: () => void;
}) {
  const current = sync.connection;
  const now: PersonalPlace = current ? (current.server ?? 'onedrive') : 'none';
  const followTo = follow?.to;
  const followUrl = followTo?.provider === 'server' ? followTo.place.url : undefined;
  const [servers, setServers] = useState<KnownServer[]>(() => knownServers());
  const [where, setWhere] = useState<PersonalPlace>(given ? 'onedrive' : followTo ? (followUrl ?? 'onedrive') : now);
  // Undefined while it is being asked whether a key is kept.
  const [account, setAccount] = useState<Connection['account'] | null | undefined>(given ?? undefined);
  const [folder, setFolder] = useState<Connection['folder'] | null>(() =>
    followTo?.provider === 'onedrive' && followTo.place.item ? { id: followTo.place.item, path: followTo.place.path ?? '', ...(followTo.place.drive && { drive: followTo.place.drive }) } : null,
  );
  const [picking, setPicking] = useState(!!given);
  const [signing, setSigning] = useState<{ cancel(): void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const server = servers.find((each) => each.url === where) ?? null;
  // On a server: the account's personal space there, null when it has none yet; undefined while it is asked.
  const [there, setThere] = useState<ServerSpace | null | undefined>(undefined);
  // Whether the server keeps personal spaces: one from before them would open a shared space instead.
  const [keeps, setKeeps] = useState(true);
  const [serverSignedOut, setServerSignedOut] = useState<SignInWhy | null>(null);
  // Following to a server this device is not signed in to: connecting to it comes first.
  const [connecting, setConnecting] = useState(!!followUrl && !servers.some((each) => each.url === followUrl));
  // Asked when it moves: the copy in the place it leaves goes too.
  const [deleteLeft, setDeleteLeft] = useState(false);

  useEffect(() => {
    if (given) return;
    let live = true;
    void service.signedInAs().then((who) => live && setAccount(who));
    return () => {
      live = false;
    };
  }, [given, service]);
  useEffect(() => () => signing?.cancel(), [signing]);

  useEffect(() => {
    if (!server) return;
    let live = true;
    setThere(undefined);
    setServerSignedOut(null);
    setError(null);
    const asked = serverAccount(server.url);
    Promise.all([asked.spaces(), asked.me(), asked.status()]).then(
      ([spaces, me, status]) => {
        if (!live) return;
        setKeeps(status.personal === true);
        setThere(spaces.find((each) => each.personal) ?? null);
        setServers((list) => list.map((each) => (each.url === server.url ? { ...each, role: me.role } : each)));
        noteRole(server.url, me.role);
      },
      (failure: unknown) => {
        if (!live) return;
        setThere(null);
        if (failure instanceof RemoteSignedOut) setServerSignedOut(signInWhy(failure, server.url));
        else setError(serverFailure(failure, hostOf(server.url)));
      },
    );
    return () => {
      live = false;
    };
  }, [server?.url]);

  /** Connected to a server, or signed in to it again: it is listed, and chosen. */
  const connected = (signedIn: KnownServer) => {
    service.signedInToServer(signedIn);
    setServers(knownServers());
    setConnecting(false);
    setServerSignedOut(null);
    setWhere(signedIn.url);
  };

  const connect = async () => {
    const cloud = service.cloud();
    setError(null);
    service.clearSignInError();
    if (cloud.redirects) {
      // The page goes to Microsoft and comes back with this window open again, at the folders.
      await service.leaveToSignIn('connect');
      return;
    }
    const attempt = cloud.signIn('connect');
    setSigning(attempt);
    try {
      await attempt.done;
      setAccount(await service.account());
      if (!followTo) setPicking(true);
    } catch (failure) {
      if (failure instanceof DOMException && failure.name === 'AbortError') return;
      const message = String(failure instanceof Error ? failure.message : failure);
      setError(message === 'timeout' ? t('sync.signInTimeout') : t('sync.signInFailed', { error: message }));
    } finally {
      setSigning(null);
    }
  };

  const choose = (chosen: Connection['folder']) => {
    setPicking(false);
    // The folder it syncs with now is its own; any other that a space has is refused.
    const own = current && !current.server && current.folder.id === chosen.id && current.folder.drive === chosen.drive;
    const refused = own ? null : service.refusal(chosen);
    setError(refused);
    if (!refused) setFolder(own ? null : chosen);
  };

  // A folder of OneDrive other than the one it syncs with now is another place too.
  const otherFolder = where === 'onedrive' && now === 'onedrive' && !!folder;
  // Following, the place it went is elsewhere by its mark, in OneDrive another folder.
  const changing = !!followTo || where !== now || otherFolder;
  const stopping = where === 'none' && now !== 'none';
  const moving = !followTo && now !== 'none' && where !== 'none' && changing;

  const apply = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (where === 'none') await service.disconnect();
      else if (where === 'onedrive') {
        if (!account || !folder) {
          setBusy(false);
          return;
        }
        if (moving) await service.move({ provider: 'onedrive', account, folder }, deleteLeft);
        else await service.connect(account, folder, follow?.at);
      } else if (server) {
        const space = followTo?.place.space ? { id: followTo.place.space } : (there ?? (await serverAccount(server.url).openSpace(newSpaceId(), name, true)));
        const to = { provider: 'server' as const, account: { name: '', email: server.email }, folder: { id: space.id, path: '' }, server: server.url };
        if (moving) await service.move(to, deleteLeft);
        else await service.connectServer(server.url, server.email, space.id, follow?.at);
      }
      onDone();
    } catch (failure) {
      if (failure instanceof RemoteSignedOut && server) setServerSignedOut(signInWhy(failure, server.url));
      else setError(server ? serverFailure(failure, hostOf(server.url)) : failure instanceof Error ? failure.message : String(failure));
      setBusy(false);
    }
  };

  const placeReady = where === 'onedrive' ? !!account && !!folder : !!server && there !== undefined && keeps && !serverSignedOut;
  const ready = !busy && changing && (where === 'none' || placeReady);
  const place = where === 'onedrive' ? t('sync.oneDrive') : server ? hostOf(server.url) : '';
  // What it leaves, by name: OneDrive, or the server's address.
  const left = current ? (current.server ? hostOf(current.server) : t('sync.oneDrive')) : '';
  const action = stopping ? t('personal.stop') : moving || followTo ? t('personal.moveTo', { place }) : t('personal.syncWith', { place: place || t('sync.oneDrive') });
  const note = stopping
    ? t('personal.stopNote', { place: left })
    : followTo
      ? t('personal.followNote')
      : moving
        ? t(where === 'onedrive' ? 'personal.othersFolder' : 'personal.othersSpace', { place: left })
        : now !== 'none' || where === 'none'
          ? null
          : t(where === 'onedrive' ? 'personal.sameFolderNote' : 'personal.sameSpaceNote');
  // Someone else's server: its owner reaches what is stored on it.
  const notYours = !!server && server.role !== 'owner';
  return {
    now,
    current,
    where,
    setWhere,
    account,
    folder,
    picking,
    setPicking,
    signing,
    error: error ?? sync.signInError,
    busy,
    servers,
    server,
    there,
    keeps,
    serverSignedOut,
    connecting,
    setConnecting,
    connected,
    connect,
    choose,
    apply,
    ready,
    stopping,
    moving,
    following: !!followTo,
    followUrl,
    deleteLeft,
    setDeleteLeft,
    left,
    action,
    note,
    notYours,
  };
}

/**
 * Sync Personal, after its views in design/mockups.html and design/spaces.md 2.4: where the
 * personal space syncs, chosen in one window, as `useSyncPersonal` goes through it. Connect a
 * server… is a step of the window.
 */
function SyncPersonalDialog({ sync, service, me, name, account: given, follow, onDone }: {
  sync: SyncSnapshot;
  service: SyncService;
  /** Who the user is, for setting up a server from here. */
  me: Me | null;
  name: string;
  /** Back from signing in in the browser: the account whose folders are chosen from. */
  account: Connection['account'] | null;
  /** Move this device too: where the space went on another device. */
  follow: MovedMark | null;
  onDone: () => void;
}) {
  const p = useSyncPersonal({ sync, service, name, account: given, follow, onDone });
  const [ownApp, setOwnApp] = useState(false);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || p.picking) return;
    // The settings behind close on Escape too; this window takes it first. Connecting, it goes back to Location.
    event.preventDefault();
    event.stopPropagation();
    if (p.connecting) p.setConnecting(false);
    else onDone();
  };
  const placeRow = (place: PersonalPlace, icon: ReactNode, label: string, detail: string) => (
    <button key={place} type="button" role="radio" aria-checked={p.where === place} className={p.where === place ? 'row on' : 'row'} onClick={() => p.setWhere(place)}>
      {icon}
      <span className="name">{label}</span>
      {p.now === place && <em className="now">{t('personal.now')}</em>}
      <small>{detail}</small>
    </button>
  );
  // The folder it syncs with now, until another is chosen.
  const ownFolder = p.current && !p.current.server ? p.current : null;
  const shownFolder = p.folder ?? ownFolder?.folder ?? null;
  const folderAccount = p.folder ? p.account : (ownFolder?.account ?? p.account);

  return (
    <div className="fp-ovl" onMouseDown={(event) => event.target === event.currentTarget && onDone()}>
      <div className="fp space-add" role="dialog" aria-modal="true" aria-label={t('personal.syncTitle', { name })} tabIndex={-1} onKeyDown={onKeyDown}>
        <h3>{t('personal.syncTitle', { name })}</h3>
        {p.connecting ? (
          <ConnectStep
            addressOnly
            me={me}
            device={sync.device.name}
            again={p.serverSignedOut && p.server ? { url: p.server.url, email: p.server.email, why: p.serverSignedOut } : undefined}
            start={p.followUrl ?? null}
            onDone={p.connected}
            onBack={() => p.setConnecting(false)}
          />
        ) : (
          <>
            <span className="label">{t('space.location')}</span>
            <div className="list" role="radiogroup" aria-label={t('space.location')}>
              {placeRow('none', <Icon name="laptop" />, t('sync.notSyncedShort'), t('sync.onlyHere'))}
              {placeRow('onedrive', <CloudIcon />, t('sync.oneDrive'), p.account === undefined ? t('sync.loading') : p.account ? p.account.email || p.account.name : t('space.notConnected'))}
              {p.servers.map((each) => placeRow(each.url, <ServerIcon />, hostOf(each.url), each.email))}
              <button type="button" className="row srv-new" onClick={() => p.setConnecting(true)}>
                <Icon name="plus" />
                <span className="name">{t('server.connect')}</span>
              </button>
            </div>
            {p.where === 'onedrive' &&
              (!ownFolder && (p.account === null || p.signing) ? (
                <>
                  <div className="connect">
                    <CloudIcon />
                    <span>{p.signing ? t('sync.waitingForBrowser') : t('space.connectFirst')}</span>
                    {p.signing ? (
                      <button type="button" className="st-btn" onClick={() => p.signing?.cancel()}>
                        {t('sync.cancel')}
                      </button>
                    ) : (
                      <button type="button" className="st-btn go" onClick={() => void p.connect()}>
                        {t('sync.connectOneDrive')}
                      </button>
                    )}
                  </div>
                  <p className="note">{t('sync.access')}</p>
                  {ownApp ? (
                    <OwnApp onDone={() => setOwnApp(false)} />
                  ) : (
                    <button type="button" className="st-link" onClick={() => setOwnApp(true)}>
                      {t('sync.ownApp')}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <span className="label">{t('settings.folder')}</span>
                  <div className="pick">
                    <span className={shownFolder ? 'path' : 'path none'}>
                      {shownFolder ? (
                        <>
                          <CloudIcon />
                          {placeWords(shownFolder.path, shownFolder.drive)}
                          {folderAccount && <small>{folderAccount.email || folderAccount.name}</small>}
                        </>
                      ) : (
                        t('space.noFolder')
                      )}
                    </span>
                    {!p.following && (
                      <button type="button" className="st-btn" disabled={!p.account || p.busy} onClick={() => p.setPicking(true)}>
                        {t('space.chooseFolder')}
                      </button>
                    )}
                  </div>
                </>
              ))}
            {p.server && (
              <>
                <span className="label">{t('personal.spaceOn', { host: hostOf(p.server.url) })}</span>
                {p.serverSignedOut ? (
                  <div className="connect">
                    <ServerIcon />
                    <span>{signInWords(p.serverSignedOut, hostOf(p.server.url))}</span>
                    <button type="button" className="st-btn go" onClick={() => p.setConnecting(true)}>
                      {t('server.signIn')}
                    </button>
                  </div>
                ) : p.there === undefined ? (
                  <p className="note">{t('server.looking')}</p>
                ) : !p.keeps ? (
                  <p className="note err">{t('personal.serverTooOld', { host: hostOf(p.server.url) })}</p>
                ) : (
                  <div className="list">
                    <span className="row on">
                      {p.there ? <Icon name="space" /> : <Icon name="plus" />}
                      <span className="name">{p.there ? p.there.name || name : t('space.newSpace', { name })}</span>
                      {p.there && <small>{p.following && follow?.by ? t('personal.movedHere', { device: follow.by }) : t('personal.yoursThere')}</small>}
                    </span>
                  </div>
                )}
                {p.notYours && p.keeps && (
                  <div className="srv-found late">
                    <Icon name="warn" />
                    <span>
                      <b>{t('personal.notYours')}</b>
                      <small>{t('personal.notYoursText', { host: hostOf(p.server.url) })}</small>
                    </span>
                  </div>
                )}
              </>
            )}
            {p.note && <p className="note">{p.note}</p>}
            {p.moving && (
              <>
                <label className="check">
                  <input type="checkbox" checked={p.deleteLeft} onChange={(event) => p.setDeleteLeft(event.target.checked)} />
                  {t('personal.deleteLeft', { place: p.left })}
                </label>
                <p className="note under">{t('personal.deleteLeftNote', { place: p.left })}</p>
              </>
            )}
            {p.error && (
              <p className="note err" role="alert">
                {p.error}
              </p>
            )}
            <div className="foot">
              <button type="button" className="st-btn" onClick={onDone}>
                {t('dialog.cancel')}
              </button>
              <button type="button" className="st-btn go" disabled={!p.ready} onClick={() => void p.apply()}>
                {p.action}
              </button>
            </div>
          </>
        )}
      </div>
      {p.picking && p.account && <FolderPicker account={p.account} service={service} onUse={(chosen) => p.choose(chosen)} onCancel={() => p.setPicking(false)} />}
    </div>
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
  const renaming = useSpaceRename(space);
  return (
    <>
      <BackRow onBack={onBack} />
      <div className="st-space">
        <SpaceTop
          name={space.name}
          sub={t('settings.shared')}
          canRename={renaming.canRename}
          onRename={async (name) => {
            await renaming.onServer(name);
            onRename(name);
          }}
        />
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
      {space.source?.provider === 'server' ? <ServerMembers space={space} me={me} /> : space.people.some((person) => !isAgent(person)) && <People people={space.people} me={me} onActive={onPersonActive} />}
      {space.people.some(isAgent) && <SpaceAgents people={space.people} onActive={onPersonActive} />}
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
