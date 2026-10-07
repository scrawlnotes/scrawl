import { languages, type MessageKey, t } from '@scrawlnotes/i18n';
import { type CSSProperties, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { chooseLanguage, languageTag, type Mode, shadeOfMode } from './device';
import { Icon, type IconName } from './Icon';
import { useNarrow } from './narrow';
import type { SyncService, SyncSnapshot } from './sync';
import { SyncRow, ThisDevice } from './SyncViews';
import { paletteOf, type Shade, THEMES, type Theme, themeById } from './themes';

export type Section = 'appearance' | 'spaces' | 'language';

const SECTIONS: { id: Section; label: MessageKey; icon: IconName }[] = [
  { id: 'appearance', label: 'settings.appearance', icon: 'appearance' },
  { id: 'spaces', label: 'settings.spaces', icon: 'folder' },
  { id: 'language', label: 'settings.language', icon: 'language' },
];

const MODES: { mode: Mode; label: MessageKey }[] = [
  { mode: 'system', label: 'settings.system' },
  { mode: 'light', label: 'settings.light' },
  { mode: 'dark', label: 'settings.dark' },
];


export interface SettingsProps {
  mode: Mode;
  onMode: (mode: Mode) => void;
  /** The id of the theme chosen. */
  theme: string;
  onTheme: (id: string) => void;
  /** Light or dark, as the device is right now: what System gives. */
  system: Shade;
  /** The name the personal space was given; none until it is named. */
  spaceName: string | undefined;
  onRenameSpace: (name: string) => void;
  /** Desktop: the folder the notes are in. Null in the browser. */
  folder: string | null;
  /** Desktop: asks for another notes folder. */
  onChangeFolder?: () => void;
  /** How the space's sync stands, and what connects and disconnects it. */
  sync: SyncSnapshot;
  syncService: SyncService;
  /** The section shown first. */
  initial?: Section;
  onClose: () => void;
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

/**
 * The mode, light or dark or the device's own, and the theme. Each theme shows itself in the
 * shade the mode gives; one without a light side says so. What is chosen applies at once.
 */
function Appearance({ mode, onMode, theme, onTheme, system }: Pick<SettingsProps, 'mode' | 'onMode' | 'theme' | 'onTheme' | 'system'>) {
  const shade = shadeOfMode(mode, system);
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
    </>
  );
}

/** The personal space: its name, which has its Save, the folder it is, its sync; and this device's name. */
function Spaces({
  spaceName,
  onRenameSpace,
  folder,
  onChangeFolder,
  sync,
  syncService,
}: Pick<SettingsProps, 'spaceName' | 'onRenameSpace' | 'folder' | 'onChangeFolder' | 'sync' | 'syncService'>) {
  const name = spaceName ?? t('settings.personal');
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const changed = (draft.trim() || t('settings.personal')) !== name;
  const save = () => {
    if (changed) onRenameSpace(draft);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') save();
    else if (event.key === 'Escape' && draft !== name) setDraft(name);
    else return;
    event.preventDefault();
  };
  return (
    <>
      <span className="st-label">{t('settings.spaces')}</span>
      <p className="st-note">{t('settings.spacesAbout')}</p>
      <div className="st-space">
        <div className="top">
          <Icon name="folder" />
          <b>{name}</b>
          <small>{t('settings.onDevice')}</small>
        </div>
        <div className="st-row">
          <label className="fl" htmlFor="space-name">
            {t('settings.name')}
          </label>
          <input id="space-name" value={draft} autoComplete="off" onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} />
          <button type="button" className="primary" disabled={!changed} onClick={save}>
            {t('settings.save')}
          </button>
        </div>
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
            <button type="button" onClick={onChangeFolder}>
              {t('settings.change')}
            </button>
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
  const { mode, theme, onClose } = props;
  const narrow = useNarrow();
  const sections = SECTIONS.filter((section) => section.id !== 'language' || languages.length > 1);
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

  const body = (id: Section) =>
    id === 'appearance' ? <Appearance {...props} /> : id === 'spaces' ? <Spaces {...props} /> : <Language />;
  // What each section is set to, beside it in the phone's list.
  const value = (id: Section) =>
    id === 'appearance'
      ? `${themeById(theme).name} · ${t(MODES.find((choice) => choice.mode === mode)!.label)}`
      : id === 'spaces'
        ? (props.spaceName ?? t('settings.personal'))
        : (languages.find((language) => language.tag === languageTag())?.name ?? '');
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
