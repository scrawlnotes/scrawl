import type { Me } from '@scrawlnotes/core';
import { languages, type MessageKey, t } from '@scrawlnotes/i18n';
import { type CSSProperties, type KeyboardEvent, type MouseEvent, useEffect, useRef, useState } from 'react';
import { ConfirmDialog, ContextMenu, type MenuItem } from './dialogs';
import type { SpaceView } from './session';
import { isDesktop } from './storage';
import { chooseLanguage, languageTag, type Mode, shadeOfMode, SIZES, type SizeKind, thisSizeKind } from './device';
import { Icon, type IconName } from './Icon';
import { useNarrow } from './narrow';
import type { SyncService, SyncSnapshot } from './sync';
import { SyncRow, ThisDevice } from './SyncViews';
import { paletteOf, type Shade, THEMES, type Theme, themeById } from './themes';

export type Section = 'profile' | 'appearance' | 'spaces' | 'language';

const SECTIONS: { id: Section; label: MessageKey; icon: IconName }[] = [
  { id: 'profile', label: 'settings.profile', icon: 'person' },
  { id: 'appearance', label: 'settings.appearance', icon: 'appearance' },
  { id: 'spaces', label: 'settings.spaces', icon: 'folder' },
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
  /** Adds a space; resolves to its id, or null when the folder window was cancelled. */
  onAddSpace: (how: 'new' | 'existing', name: string) => Promise<string | null>;
  onRemoveSpace: (id: string, deleteFiles: boolean) => void;
  onMoveSpace: (id: string, by: -1 | 1) => void;
  /** The space whose page Spaces opens on: an id, null for the personal space, undefined for the list. */
  initialSpace?: string | null;
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
  onClose: () => void;
}

/** The sections, Language once there is more than one language. */
export const settingsSections = () => SECTIONS.filter((section) => section.id !== 'language' || languages.length > 1);

/** What a section is set to, beside it in the list of a phone. */
export function sectionValue(id: Section, { mode, theme, spaceName, me }: Pick<SettingsValues, 'mode' | 'theme' | 'spaceName' | 'me'>): string {
  if (id === 'profile') return me?.name ?? t('settings.unnamed');
  if (id === 'appearance') return `${themeById(theme).name} · ${t(MODES.find((choice) => choice.mode === mode)!.label)}`;
  if (id === 'spaces') return spaceName ?? t('settings.personal');
  return languages.find((language) => language.tag === languageTag())?.name ?? '';
}

/** What a section has, in the window or on a phone's page. */
export function SettingsSection({ section, ...values }: SettingsValues & { section: Section }) {
  return section === 'profile' ? <Profile {...values} /> : section === 'appearance' ? <Appearance {...values} /> : section === 'spaces' ? <Spaces {...values} /> : <Language />;
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
function Spaces(values: Pick<SettingsValues, 'spaceName' | 'onRenameSpace' | 'spaces' | 'onRenameSpaceById' | 'onAddSpace' | 'onRemoveSpace' | 'onMoveSpace' | 'initialSpace' | 'folder' | 'defaultFolder' | 'onChangeFolder' | 'onUseDefaultFolder' | 'sync' | 'syncService'>) {
  const { spaces, onMoveSpace, onRemoveSpace, initialSpace } = values;
  // The page open: a space by its id, null for the personal space, undefined for the list.
  const [page, setPage] = useState<string | null | undefined>(initialSpace);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<SpaceView | null>(null);
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; id: string } | null>(null);
  const personalName = values.spaceName ?? t('settings.personal');
  if (page === null) return <PersonalPage {...values} onBack={() => setPage(undefined)} />;
  const shown = page === undefined ? null : spaces.find((space) => space.id === page);
  if (shown) return <SpacePage space={shown} onRename={(name) => values.onRenameSpaceById(shown.id, name)} onBack={() => setPage(undefined)} onRemove={() => setRemoving(shown)} removing={removing} onRemoved={() => setRemoving(null)} onRemoveSpace={onRemoveSpace} />;
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
      { label: t('side.removeSpace'), apart: true, danger: true, run: () => setRemoving(spaces[at] ?? null) },
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
          <Icon name="chevron" />
        </button>
        {spaces.map((space) => (
          <div key={space.id} className={`st-li${menu?.id === space.id ? ' menu' : ''}`} onContextMenu={(event) => spaceMenu(event, space.id)}>
            <button type="button" className="st-li-main" onClick={() => setPage(space.id)}>
              <Icon name="space" />
              <span className="nm">
                <b>{space.name}</b>
                <small>{space.folder ? `${t('settings.onComputer')} · ${space.folder}` : t('settings.inBrowser')}</small>
              </span>
            </button>
            {space.shared && (
              <span className="r" title={t('sync.shared')}>
                <Icon name="cloud" />
              </span>
            )}
            <button type="button" className="it-more" title={t('side.more')} aria-label={t('side.more')} onClick={(event) => spaceMenu(event, space.id)}>
              ···
            </button>
          </div>
        ))}
      </div>
      {adding ? (
        <AddSpace onAdd={values.onAddSpace} onDone={(id) => {
          setAdding(false);
          if (id) setPage(id);
        }} />
      ) : (
        <div className="st-acts">
          <button type="button" className="primary" onClick={() => setAdding(true)}>
            {t('settings.addSpace')}
          </button>
          <small>{t('settings.addSpaceAbout')}</small>
        </div>
      )}
      {menu && <ContextMenu at={menu.at} items={menuItems(menu.id)} onClose={() => setMenu(null)} />}
      {removing && <RemoveSpaceAsk space={removing} onRemoveSpace={onRemoveSpace} onClose={() => setRemoving(null)} />}
    </>
  );
}

/** The question before a space leaves this device: its folder stays, or goes too. */
function RemoveSpaceAsk({ space, onRemoveSpace, onClose }: { space: SpaceView; onRemoveSpace: SettingsValues['onRemoveSpace']; onClose: () => void }) {
  return (
    <ConfirmDialog
      title={t('settings.removeTitle', { name: space.name })}
      message={t('settings.removeMessage')}
      action={t('settings.removeKeep')}
      danger={false}
      second={{
        action: t('settings.removeDelete'),
        run: () => {
          onClose();
          onRemoveSpace(space.id, true);
        },
      }}
      onConfirm={() => {
        onClose();
        onRemoveSpace(space.id, false);
      }}
      onClose={onClose}
    />
  );
}

/** Adding a space: a new one, named here, or on desktop a folder that is already there. */
function AddSpace({ onAdd, onDone }: { onAdd: SettingsValues['onAddSpace']; onDone: (id: string | null) => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const add = async (how: 'new' | 'existing') => {
    if (how === 'new' && !name.trim()) {
      setError(t('error.spaceName'));
      return;
    }
    setBusy(true);
    try {
      onDone(await onAdd(how, name));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('error.create'));
      setBusy(false);
    }
  };
  return (
    <div className="st-space st-add">
      <div className="top">
        <Icon name="plus" />
        <b>{t('settings.newSpace')}</b>
        <small>{t('settings.newSpaceAbout')}</small>
      </div>
      <div className="st-row">
        <label className="fl" htmlFor="space-new-name">
          {t('settings.name')}
        </label>
        <input
          id="space-new-name"
          value={name}
          autoFocus
          autoComplete="off"
          disabled={busy}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void add('new');
            else if (event.key === 'Escape') onDone(null);
            else return;
            event.preventDefault();
          }}
        />
        <button type="button" className="primary" disabled={busy} onClick={() => void add('new')}>
          {t('settings.add')}
        </button>
      </div>
      {error && (
        <p className="st-note error" role="alert">
          {error}
        </p>
      )}
      <div className="st-acts">
        {isDesktop && (
          <button type="button" disabled={busy} onClick={() => void add('existing')}>
            {t('settings.existingFolder')}
          </button>
        )}
        {isDesktop && <small>{t('settings.existingAbout')}</small>}
        <button type="button" className="right" disabled={busy} onClick={() => onDone(null)}>
          {t('dialog.cancel')}
        </button>
      </div>
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
}: Pick<SettingsValues, 'spaceName' | 'onRenameSpace' | 'folder' | 'defaultFolder' | 'onChangeFolder' | 'onUseDefaultFolder' | 'sync' | 'syncService'> & { onBack: () => void }) {
  const name = spaceName ?? t('settings.personal');
  return (
    <>
      <BackRow onBack={onBack} />
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
      {sync.available && <ThisDevice sync={sync} service={syncService} />}
    </>
  );
}

/** A space beside the personal one: its name, where its files are, and the way out of this device. */
function SpacePage({ space, onRename, onBack, onRemove, removing, onRemoved, onRemoveSpace }: {
  space: SpaceView;
  onRename: (name: string) => void;
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
          {space.shared && <small>{t('sync.shared')}</small>}
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
          <span />
        </div>
      </div>
      <div className="st-acts">
        <button type="button" onClick={onRemove}>
          {t('settings.removeSpace')}
        </button>
        <small>{t('settings.removeAbout')}</small>
      </div>
      {removing && <RemoveSpaceAsk space={removing} onRemoveSpace={onRemoveSpace} onClose={onRemoved} />}
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

  const body = (id: Section) => <SettingsSection section={id} {...props} />;
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
                <button key={s.id} type="button" className="st-item" onClick={() => setPage(s.id)}>
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
                  onClick={() => setSection(s.id)}
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
