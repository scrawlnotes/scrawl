import {
  type AskQuestion,
  basename,
  type BoardLinks,
  type CollectionTemplate,
  defaultCollectionName,
  dirname,
  type Field,
  isEmpty,
  type Record as CollectionRecord,
  INBOX_TASKS,
  join,
  type Leftovers,
  listName,
  localPath,
  newSchema,
  type Phase,
  type PhasePatch,
  type Priority,
  RuleStop,
  spaceOf,
  type Template,
} from '@scrawlnotes/core';
import { type MessageKey, t } from '@scrawlnotes/i18n';
import {
  type CSSProperties,
  type FormEvent,
  Fragment,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { type Option, Picker } from './choices';
import { FieldInput, type ValueContext } from './Collection';
import { isPhone, onPage, pageBox, pageWindow } from './device';
import { Icon, type IconName } from './Icon';
import type { ExportFormat } from './exporting';
import { collectionLabel, placeWords, shownPath, spaceLabel } from './items';
import type { ButtonRun } from './session';
import { ActionSheet, AskSheet, Sheet, SheetClose } from './sheets';

interface DialogProps {
  label: string;
  /** Added to the window's own class, for a window that is laid out differently. */
  className?: string;
  onClose: () => void;
  /** What Esc does, when it is not closing. */
  onEscape?: () => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  children: ReactNode;
}

/**
 * A small window in the middle of the app. Esc or a click beside it closes it. On a phone it is a
 * sheet from the bottom, its title and buttons at its top; one without Cancel has × there.
 */
export function Dialog(props: DialogProps) {
  if (!isPhone()) return <WindowDialog {...props} />;
  const { label, className, onClose, onEscape = onClose, onKeyDown, children } = props;
  return (
    <Sheet label={label} className={className ? `dialog ${className}` : 'dialog'} onClose={onClose} onEscape={onEscape} onKeyDown={onKeyDown}>
      <SheetClose onClose={onClose} />
      {children}
    </Sheet>
  );
}

function WindowDialog({ label, className, onClose, onEscape = onClose, onKeyDown, children }: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Take the keyboard away from the editor, unless a field inside asked for it itself.
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus();
  }, []);
  return (
    <div className="backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        ref={panel}
        className={className ? `dialog ${className}` : 'dialog'}
        role="dialog"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return onKeyDown?.(event);
          // Taken here: the window under this one does not close with it.
          event.preventDefault();
          onEscape();
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** A new version of the web app is ready: the app is used in it, so the window has nothing but Reload. */
export function UpdateDialog({ onReload }: { onReload: () => void }) {
  return (
    <div className="backdrop update-backdrop">
      <div className="dialog update-dialog" role="alertdialog" aria-label={t('status.updateReady')}>
        <h2>{t('status.updateReady')}</h2>
        <p className="confirm">{t('status.updateMessage')}</p>
        <div className="dialog-actions">
          <button type="button" className="primary" autoFocus onClick={onReload}>
            {t('status.reload')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A folder picked from the list, or a name typed for a folder that does not exist yet. */
export interface FolderChoice {
  folder: string;
  create: boolean;
}

type FolderPicker = ReturnType<typeof useFolderPicker>;

/**
 * The folder list of Move to and Create: typing filters it, the arrow keys move through it, and
 * a name no folder has can be picked to create that folder.
 */
export function useFolderPicker(folders: string[], initial?: string) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(() => Math.max(0, initial === undefined ? 0 : folders.indexOf(initial)));
  const typed = query.trim();
  // Found by the words the list shows: a space's folder by the space's name in front.
  const shown = (folder: string) => shownPath(folder).toLowerCase();
  const matches = folders.filter((f) => shown(f).includes(typed.toLowerCase()));
  const canCreate = typed !== '' && !folders.some((f) => shown(f) === typed.toLowerCase());
  const count = matches.length + (canCreate ? 1 : 0);
  const selected = Math.min(index, count - 1);
  const choiceAt = (i: number): FolderChoice | null =>
    i >= 0 && i < matches.length ? { folder: matches[i]!, create: false } : canCreate && i === matches.length ? { folder: typed, create: true } : null;
  return {
    query,
    typed,
    matches,
    canCreate,
    count,
    selected,
    choiceAt,
    filter: (value: string) => {
      setQuery(value);
      setIndex(0);
    },
    select: setIndex,
    /** Moves the selection for the arrow keys; returns whether the key was one of them. */
    step: (key: string) => {
      if (key === 'ArrowDown') setIndex(Math.min(selected + 1, count - 1));
      else if (key === 'ArrowUp') setIndex(Math.max(selected - 1, 0));
      else return false;
      return true;
    },
  };
}

// A click on the list must not take the keyboard away from the field typed into.
const keepFocus = (event: ReactMouseEvent) => event.preventDefault();

/**
 * The folders of the Create and Move to windows, after the Spaces create view of
 * design/mockups.html: each space's folders under the space's name, which picks its top and reads
 * as a place to pick, as the folders do. A folder shows its name and, beside it, the folders it is
 * in, so that two of the same name are told apart.
 */
function FolderList({ picker, empty, onPick }: { picker: FolderPicker; empty: string; onPick: (index: number) => void }) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [picker.selected, picker.query]);
  let group: string | null | undefined;
  const option = (folder: string, i: number, className: string, label: ReactNode) => (
    <button
      key={folder}
      type="button"
      role="option"
      className={className}
      aria-selected={i === picker.selected}
      tabIndex={-1}
      onMouseDown={keepFocus}
      onClick={() => onPick(i)}
    >
      {label}
    </button>
  );
  return (
    <div ref={list} className="choices folder-groups" role="listbox" aria-label={t('folders.label')}>
      {picker.matches.flatMap((folder, i) => {
        const space = spaceOf(folder);
        const local = localPath(folder);
        const rows: ReactElement[] = [];
        // A space's top is its heading, and picks it; a heading without its top, as where something
        // already is, only names the space.
        if (space !== group) {
          group = space;
          const heading = (
            <>
              <Icon name="space" />
              <span className="nm">{spaceLabel(space)}</span>
            </>
          );
          if (local === '') return [option(folder, i, 'group', heading)];
          rows.push(
            <div key={`group:${space ?? ''}`} className="group" role="presentation">
              {heading}
            </div>,
          );
        }
        const crumb = dirname(local).split('/').filter(Boolean).join(' › ');
        rows.push(
          option(
            folder,
            i,
            'folder',
            <>
              <Icon name="folder" />
              <span className="nm">{basename(local)}</span>
              {crumb && <small className="crumb">{crumb}</small>}
            </>,
          ),
        );
        return rows;
      })}
      {picker.canCreate && (
        <button
          type="button"
          role="option"
          aria-selected={picker.selected === picker.matches.length}
          tabIndex={-1}
          onMouseDown={keepFocus}
          onClick={() => onPick(picker.matches.length)}
        >
          <span>{t('folders.create', { name: picker.typed })}</span>
        </button>
      )}
      {picker.count === 0 && <p>{empty}</p>}
    </div>
  );
}

/**
 * Where a new item goes, in the Create window: a box that shows the place the whole way down to
 * it. A click opens the folders over the window, under the box, with a box to find one and a name
 * no folder has to create it; however many there are, the list scrolls inside and the window
 * stays as it is.
 */
export function FolderField({ folders, value, onChange }: { folders: string[]; value: FolderChoice; onChange: (choice: FolderChoice) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    box.current?.focus();
  };
  const top = !value.create && localPath(value.folder) === '';
  return (
    <>
      <button
        ref={box}
        type="button"
        className="folder-field"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('create.folder')}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (open || !['ArrowDown', 'Enter', ' '].includes(event.key)) return;
          // Enter here opens the folders; it does not create the item.
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <Icon name={top ? 'space' : 'folder'} />
        <span>{value.create ? t('folders.new', { name: value.folder }) : placeWords(value.folder)}</span>
        <span className="chev">
          <Icon name="chevron" />
        </span>
      </button>
      {open && (
        <FolderPop
          anchor={box}
          folders={folders}
          value={value}
          onPick={(choice) => {
            onChange(choice);
            close();
          }}
          onClose={close}
        />
      )}
    </>
  );
}

/** The folders of a FolderField, over the window: below its box, or above it where there is more room. */
function FolderPop({ anchor, folders, value, onPick, onClose }: {
  anchor: RefObject<HTMLElement | null>;
  folders: string[];
  value: FolderChoice;
  onPick: (choice: FolderChoice) => void;
  onClose: () => void;
}) {
  const picker = useFolderPicker(folders, value.create ? undefined : value.folder);
  const pop = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const latest = useRef(onClose);
  latest.current = onClose;
  useLayoutEffect(() => {
    const measure = () => {
      const field = anchor.current && pageBox(anchor.current);
      if (!field) return;
      const page = pageWindow();
      const below = page.height - field.bottom - 12;
      const above = field.top - 12;
      const up = below < 240 && above > below;
      const room = Math.min(360, up ? above : below);
      setPlace({ left: field.left, width: field.width, maxHeight: room, ...(up ? { bottom: page.height - field.top + 4 } : { top: field.bottom + 4 }) });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [anchor]);
  useEffect(() => {
    const away = (event: globalThis.MouseEvent) => {
      const target = event.target as Node;
      if (!pop.current?.contains(target) && !anchor.current?.contains(target)) latest.current();
    };
    window.addEventListener('mousedown', away);
    return () => window.removeEventListener('mousedown', away);
  }, [anchor]);
  const pick = (index: number) => {
    const choice = picker.choiceAt(index);
    if (choice) onPick(choice);
  };
  // The keys are the list's while it is open: the window behind does not create or close with them.
  const onKey = (event: KeyboardEvent) => {
    if (picker.step(event.key)) {
      // Moved through the list.
    } else if (event.key === 'Enter') pick(picker.selected);
    else if (event.key === 'Escape' || event.key === 'Tab') onClose();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };
  return createPortal(
    <div ref={pop} className="lbl-picker folder-pop" style={place ?? { opacity: 0 }}>
      <input
        className="lbl-search"
        autoFocus
        placeholder={t('create.findFolder')}
        aria-label={t('create.findFolder')}
        value={picker.query}
        onChange={(event) => picker.filter(event.target.value)}
        onKeyDown={onKey}
      />
      <FolderList picker={picker} empty={t('create.typeToCreate')} onPick={pick} />
    </div>,
    document.body,
  );
}

export type NewKind = 'quick' | 'note' | 'tasks' | 'board' | 'keys' | 'collection' | 'app';
export type ItemKind = Exclude<NewKind, 'app' | 'quick'>;

// A quick note comes first and apart: it has no second step, and goes to the personal space from
// anywhere (design/quick-notes.md 3.5). Keys come after Board; what they are for is said beside
// them, as the kind least known. Filters are made in Filters & Labels, not here (design/filters.md 6).
export const KINDS: { kind: NewKind; label: MessageKey; icon: IconName; text?: MessageKey }[] = [
  { kind: 'quick', label: 'create.quick', icon: 'quick', text: 'create.quickText' },
  { kind: 'note', label: 'create.note', icon: 'note', text: 'create.noteText' },
  { kind: 'tasks', label: 'create.tasks', icon: 'tasks', text: 'create.tasksText' },
  { kind: 'board', label: 'create.board', icon: 'board', text: 'create.boardText' },
  { kind: 'keys', label: 'create.keys', icon: 'keys', text: 'create.keysText' },
  { kind: 'collection', label: 'create.collection', icon: 'collection', text: 'create.collectionText' },
  // An app is ready templates set up together, in a window of its own (design/scrawl-apps.md 2).
  { kind: 'app', label: 'create.app', icon: 'app', text: 'create.appText' },
];

/**
 * Creates a note, a task list, a board or a keys file. The kind is chosen first; the item then
 * gets a name, which may be left empty, and a folder; a board also starts from a template. A
 * folder's menu has the kind chosen already, and Back goes to the choice; the start page's
 * templates have the template chosen too.
 */
export function NewDialog({ start = null, template = null, folders, folder, collections, modules, onCreate, onApp, onQuick, onClose }: {
  /** The kind chosen already, if any. */
  start?: ItemKind | null;
  /** A board's or a collection's template chosen already, if any. */
  template?: Template | CollectionTemplate | null;
  /** Every place, the personal space's top first. */
  folders: string[];
  /** The folder chosen to begin with. */
  folder: string;
  /** Every collection, by its folder's path: what a CRM board's links can point at. */
  collections: string[];
  /** Made from an app (design/app-home.md 5.5): its folder is the app's, and it goes into one of these modules of its menu, asked when there are more. */
  modules?: { key: string; name: string }[];
  /** Returns a message when the item cannot be made. */
  onCreate: (kind: ItemKind, folder: FolderChoice, name: string, template: Template, collectionTemplate: CollectionTemplate, links?: BoardLinks, module?: string) => Promise<string | null>;
  /** An app has a window of its own. */
  onApp: () => void;
  /** A quick note opens its window over what is open, with nothing more to ask. */
  onQuick: () => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<ItemKind | null>(start);
  if (kind) {
    return (
      <NewItemForm kind={kind} template={template} folders={folders} folder={folder} collections={collections} modules={modules} onCreate={onCreate} onBack={() => setKind(null)} onClose={onClose} />
    );
  }
  return <KindChoice onPick={(picked) => (picked === 'app' ? onApp() : picked === 'quick' ? onQuick() : setKind(picked))} onClose={onClose} />;
}

export const TITLES: Record<ItemKind, MessageKey> = { note: 'create.newNote', tasks: 'create.newList', board: 'create.newBoard', keys: 'create.newKeys', collection: 'create.newCollection' };
// A collection's is the name its template gives it.
const NAME_HINTS: Record<Exclude<ItemKind, 'collection'>, MessageKey> = { note: 'create.noteName', tasks: 'create.listName', board: 'create.boardName', keys: 'create.keysName' };
/** What the name's box shows while it is empty: that it may stay so, and what the item is called then. */
export const nameHint = (kind: ItemKind, collectionTemplate: CollectionTemplate) =>
  t('create.optionalName', { name: kind === 'collection' ? defaultCollectionName(collectionTemplate) : t(NAME_HINTS[kind]) });

/** The ways a collection can start: its fields, which the Fields window changes later. */
export const COLLECTION_TEMPLATES: { template: CollectionTemplate; label: MessageKey; text: MessageKey }[] = [
  { template: 'companies', label: 'create.companies', text: 'create.companiesText' },
  { template: 'people', label: 'create.people', text: 'create.peopleText' },
  { template: 'activities', label: 'create.activities', text: 'create.activitiesText' },
  { template: 'feedback', label: 'create.feedback', text: 'create.feedbackText' },
  { template: 'payments', label: 'create.payments', text: 'create.paymentsText' },
  { template: 'blank', label: 'create.blank', text: 'create.blankText' },
];

/** The ways a board can start: its columns by kind, and whether phases are on. */
export const TEMPLATES: { template: Template; label: MessageKey; text: MessageKey; columns: string[] }[] = [
  { template: 'software', label: 'create.software', text: 'create.softwareText', columns: ['backlog', 'active', 'active', 'review', 'done'] },
  { template: 'simple', label: 'create.simple', text: 'create.simpleText', columns: ['active', 'active', 'done'] },
  { template: 'issues', label: 'create.issues', text: 'create.issuesText', columns: ['backlog', 'active', 'active', 'done', 'dropped', 'dropped'] },
  { template: 'crm', label: 'create.crm', text: 'create.crmText', columns: ['backlog', 'active', 'active', 'active', 'done', 'dropped'] },
];

/** Asks what to create: press its number, or choose with the arrow keys or the mouse. */
function KindChoice({ onPick, onClose }: { onPick: (kind: NewKind) => void; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const onKey = (event: KeyboardEvent) => {
    const number = Number(event.key);
    if (number >= 1 && number <= KINDS.length) onPick(KINDS[number - 1]!.kind);
    else if (event.key === 'ArrowDown') setIndex((i) => (i + 1) % KINDS.length);
    else if (event.key === 'ArrowUp') setIndex((i) => (i + KINDS.length - 1) % KINDS.length);
    else if (event.key === 'Enter') onPick(KINDS[index]!.kind);
    else return;
    event.preventDefault();
  };
  return (
    <Dialog label={t('create.title')} className="create-kinds" onClose={onClose} onKeyDown={onKey}>
      <h2>{t('create.title')}</h2>
      <div className="choices" role="listbox">
        {KINDS.map((item, i) => (
          <Fragment key={item.kind}>
            <button
              type="button"
              role="option"
              aria-selected={i === index}
              tabIndex={-1}
              onMouseEnter={() => setIndex(i)}
              onClick={() => onPick(item.kind)}
            >
              <kbd>{i + 1}</kbd>
              <Icon name={item.icon} />
              <span>{t(item.label)}</span>
              {item.text && <small>{t(item.text)}</small>}
            </button>
            {item.kind === 'quick' && <hr className="choices-apart" />}
          </Fragment>
        ))}
      </div>
    </Dialog>
  );
}

/**
 * The second step of Create: a name, which may be left empty, the folder to put the item in,
 * and for a board the template it starts from.
 */
function NewItemForm({ kind, template: chosenTemplate, folders, folder, collections, modules, onCreate, onBack, onClose }: {
  kind: ItemKind;
  template: Template | CollectionTemplate | null;
  folders: string[];
  folder: string;
  collections: string[];
  modules?: { key: string; name: string }[];
  onCreate: (kind: ItemKind, folder: FolderChoice, name: string, template: Template, collectionTemplate: CollectionTemplate, links?: BoardLinks, module?: string) => Promise<string | null>;
  onBack: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [template, setTemplate] = useState<Template>(() => TEMPLATES.find((each) => each.template === chosenTemplate)?.template ?? 'software');
  const [collectionTemplate, setCollectionTemplate] = useState<CollectionTemplate>(
    () => COLLECTION_TEMPLATES.find((each) => each.template === chosenTemplate)?.template ?? 'companies',
  );
  // A CRM board's links, as chosen; until then they point at Companies and People beside the board.
  const [chosen, setChosen] = useState<Partial<BoardLinks>>({});
  const [error, setError] = useState<string | null>(null);
  const [module, setModule] = useState(() => modules?.[0]?.key);
  const busy = useRef(false);
  // Where it goes: the folder Create was opened for, or a folder typed to be made.
  const [choice, setChoice] = useState<FolderChoice>(() => ({ folder: folders.includes(folder) ? folder : (folders[0] ?? ''), create: false }));
  const title = t(TITLES[kind]);
  const place = choice.folder;
  const beside = (named: string) => collections.find((dir) => dir === join(place, named)) ?? collections.find((dir) => basename(dir) === named) ?? join(place, named);
  const links: BoardLinks = { company: chosen.company ?? beside('Companies'), contact: chosen.contact ?? beside('People') };
  const linkOptions = (current: string): Option[] =>
    [...new Set([...collections, current])].sort((a, b) => a.localeCompare(b)).map((dir) => ({ value: dir, label: collectionLabel(dir), chip: false }));

  const create = async () => {
    if (busy.current) return;
    busy.current = true;
    const failed = await onCreate(kind, choice, name, template, collectionTemplate, template === 'crm' ? links : undefined, module);
    busy.current = false;
    setError(failed);
  };
  const onKey = (event: KeyboardEvent) => {
    // A list opened from a box here has the keys first.
    if (event.defaultPrevented) return;
    // Enter on Back, Create or the folder's box is that button's own.
    if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      void create();
    }
  };
  return (
    <Dialog label={title} className={kind === 'board' || kind === 'collection' ? 'new-item board-create' : 'new-item'} onClose={onClose} onEscape={onBack} onKeyDown={onKey}>
      <h2>{title}</h2>
      {/* The title and the buttons stay; what is between them scrolls on a short screen. */}
      <div className="dialog-body">
        <label className="field">
          <span>{t('create.name')}</span>
          <input
            id="new-name"
            autoFocus
            placeholder={nameHint(kind, collectionTemplate)}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
          />
        </label>
        {modules ? (
          modules.length > 1 && (
            <div className="field">
              <span>{t('create.module')}</span>
              <Picker
                options={modules.map((m) => ({ value: m.key, label: m.name || t('app.screens'), chip: false }))}
                value={module ?? null}
                label={t('create.module')}
                onPick={(key) => key && setModule(key)}
              />
            </div>
          )
        ) : (
          <div className="field">
            <span>{t('create.folder')}</span>
            <FolderField
              folders={folders}
              value={choice}
              onChange={(picked) => {
                setChoice(picked);
                setError(null);
              }}
            />
          </div>
        )}
        {kind === 'board' && (
          <div className="field templates-field">
            <span id="new-template-label">{t('create.template')}</span>
            <div className="templates" role="radiogroup" aria-labelledby="new-template-label">
              {TEMPLATES.map((item) => (
                <button
                  key={item.template}
                  type="button"
                  role="radio"
                  aria-checked={template === item.template}
                  onClick={() => setTemplate(item.template)}
                >
                  <b>{t(item.label)}</b>
                  <span className="cols">
                    {item.columns.map((column, i) => (
                      <i key={i} className={column} />
                    ))}
                  </span>
                  <small>{t(item.text)}</small>
                </button>
              ))}
            </div>
            <p className="dialog-hint">{t('create.templateHint')}</p>
          </div>
        )}
        {kind === 'board' && template === 'crm' && (
          <div className="field links-field">
            <span>{t('create.links')}</span>
            <div className="links">
              <span>{t('create.linkCompany')}</span>
              <Picker options={linkOptions(links.company)} value={links.company} label={t('create.linkCompany')} onPick={(dir) => dir && setChosen({ ...chosen, company: dir })} />
              <span>{t('create.linkContact')}</span>
              <Picker options={linkOptions(links.contact)} value={links.contact} label={t('create.linkContact')} onPick={(dir) => dir && setChosen({ ...chosen, contact: dir })} />
            </div>
          </div>
        )}
        {kind === 'collection' && (
          <div className="field templates-field">
            <span id="new-ctemplate-label">{t('create.template')}</span>
            <div className="templates ctemplates" role="radiogroup" aria-labelledby="new-ctemplate-label">
              {COLLECTION_TEMPLATES.map((item) => (
                <button
                  key={item.template}
                  type="button"
                  role="radio"
                  aria-checked={collectionTemplate === item.template}
                  onClick={() => setCollectionTemplate(item.template)}
                >
                  <b>{t(item.label)}</b>
                  <span className="flds">
                    {newSchema(item.template).fields.map((field) => (
                      <i key={field.key}>{field.label.toLowerCase()}</i>
                    ))}
                  </span>
                  <small>{t(item.text)}</small>
                </button>
              ))}
            </div>
            <p className="dialog-hint">{t('create.collectionTemplateHint')}</p>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
      <div className="dialog-actions">
        <button type="button" onClick={onBack}>
          {t('dialog.back')}
        </button>
        <button type="button" className="primary" onClick={() => void create()}>
          {t('create.create')}
        </button>
      </div>
    </Dialog>
  );
}

/** Picks the folder to move an item or a folder to. Typing filters the list and can name a new folder. */
export function MoveDialog({ folders, current, onMove, onCreate, onClose }: {
  folders: string[];
  current: string;
  onMove: (folder: string) => void;
  onCreate: (name: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const picker = useFolderPicker(folders.filter((f) => f !== current));

  const pick = async (i: number) => {
    const choice = picker.choiceAt(i);
    if (!choice) return;
    if (choice.create) setError(await onCreate(choice.folder));
    else onMove(choice.folder);
  };
  const onKey = (event: KeyboardEvent) => {
    if (picker.step(event.key)) event.preventDefault();
    else if (event.key === 'Enter') {
      event.preventDefault();
      void pick(picker.selected);
    }
  };
  return (
    <Dialog label={t('move.title')} onClose={onClose} onKeyDown={onKey}>
      <h2>{t('move.title')}</h2>
      <input
        id="move-folder"
        aria-label={t('move.folder')}
        placeholder={t('move.typeFolder')}
        autoFocus
        value={picker.query}
        onChange={(event) => {
          picker.filter(event.target.value);
          setError(null);
        }}
      />
      <FolderList picker={picker} empty={t('move.none')} onPick={(i) => void pick(i)} />
      {error && <p role="alert">{error}</p>}
    </Dialog>
  );
}

/** One choice among a few, or one of several picked, shown as a row of chips. */
function Chips<T>({ label, items, picked, onPick, name }: {
  label: string;
  items: { value: T; label: string; dot?: string }[];
  picked: (value: T) => boolean;
  onPick: (value: T) => void;
  /** For a choice of one: radio buttons, else checkboxes. */
  name?: string;
}) {
  return (
    <div className="frow">
      <span>{label}</span>
      <div className="fchips" role={name ? 'radiogroup' : 'group'} aria-label={label}>
        {items.map((item) => (
          <button
            key={String(item.value)}
            type="button"
            role={name ? 'radio' : 'checkbox'}
            aria-checked={picked(item.value)}
            onClick={() => onPick(item.value)}
          >
            {item.dot && <i className={`dot ${item.dot}`} />}
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A place a task can be moved to: a task list, at its top level, or a section of it. */
export interface TaskPlaceChoice {
  list: string;
  section: string | null;
  /** The list's name, or the section's. */
  label: string;
  /** For a list: the folder it is in. */
  folder?: string;
  /** The task is there now, so it is no place to move it to. */
  here: boolean;
}

/** The folders a list is in, inside its space: `Clients › Acme`; nothing at the space's top. */
export const listCrumb = (list: string) => localPath(dirname(list)).split('/').filter(Boolean).join(' › ');

/**
 * The places a new task can go, as its pickers list them: the personal space's first with Inbox
 * at their top, then each other space's as they come. Only those with what is typed: a list when its
 * name, its folders or one of its sections has it; a section when it or its list does.
 */
export function placesShown(places: TaskPlaceChoice[], typed: string): TaskPlaceChoice[] {
  const ordered = [...places].sort((a, b) => Number(b.list === INBOX_TASKS) - Number(a.list === INBOX_TASKS));
  const spaces = [null, ...new Set(ordered.map((p) => spaceOf(p.list)).filter((space) => space !== null))];
  const q = typed.trim().toLowerCase();
  const has = (text: string) => text.toLowerCase().includes(q);
  const listHas = (path: string) => has(listName(path)) || has(listCrumb(path));
  return spaces
    .flatMap((space) => ordered.filter((p) => spaceOf(p.list) === space))
    .filter((p) =>
      p.section === null ? listHas(p.list) || places.some((s) => s.list === p.list && s.section !== null && has(s.label)) : has(p.label) || listHas(p.list),
    );
}

/**
 * Moves a task to another list or section, after the Move task view of design/mockups.html
 * (direction A). Typing narrows the places by the name of a list, its folder or a section.
 */
export function MoveTaskDialog({ title, subtasks, places, onMove, onClose }: {
  title: string;
  subtasks: number;
  places: TaskPlaceChoice[];
  onMove: (place: TaskPlaceChoice) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const typed = query.trim().toLowerCase();
  const has = (text?: string) => (text ?? '').toLowerCase().includes(typed);
  const listOf = (place: TaskPlaceChoice) => places.find((p) => p.list === place.list && p.section === null);
  // A section shows when it or its list matches; a list shows when it or one of its sections does.
  const matches = (place: TaskPlaceChoice) =>
    place.section === null
      ? has(place.label) || has(place.folder) || places.some((p) => p.list === place.list && has(p.label))
      : has(place.label) || has(listOf(place)?.label) || has(listOf(place)?.folder);
  const shown = places.filter(matches);
  const open = shown.filter((place) => !place.here);
  const selected = open[Math.min(index, open.length - 1)];
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selected]);
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') setIndex(Math.min(open.indexOf(selected!) + 1, open.length - 1));
    else if (event.key === 'ArrowUp') setIndex(Math.max(open.indexOf(selected!) - 1, 0));
    else if (event.key === 'Enter' && selected) onMove(selected);
    else return;
    event.preventDefault();
  };
  return (
    <Dialog label={t('move.title')} className="move-task" onClose={onClose} onKeyDown={onKey}>
      <h2>{t('move.title')}</h2>
      <p className="move-what">
        {title}
        {subtasks > 0 && <small> {t('moveTask.withSubtasks', { subtasks: t('count.subtasks', { count: subtasks }) })}</small>}
      </p>
      <input
        aria-label={t('moveTask.search')}
        placeholder={t('moveTask.search')}
        // On a phone the keyboard comes when the field is tapped.
        autoFocus={!isPhone()}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setIndex(0);
        }}
      />
      <div ref={list} className="choices" role="listbox" aria-label={t('moveTask.places')}>
        {shown.map((place) => (
          <button
            key={`${place.list}\n${place.section ?? ''}`}
            type="button"
            role="option"
            className={place.section === null ? undefined : 'sub'}
            aria-selected={place === selected}
            aria-disabled={place.here}
            tabIndex={-1}
            onMouseDown={keepFocus}
            onClick={() => !place.here && onMove(place)}
          >
            {place.section === null && <Icon name="tasks" />}
            <span>{place.label}</span>
            {place.folder && <small>{place.folder}</small>}
            {place.here && <span className="here">✓ {t('moveTask.here')}</span>}
          </button>
        ))}
        {shown.length === 0 && <p>{t('moveTask.none')}</p>}
      </div>
    </Dialog>
  );
}

/**
 * Makes a task from a note: its title, from what was selected, and the list or section it goes
 * to. After the To task view of design/mockups.html (direction A).
 */
export function NewTaskDialog({ title, note, places, initial, onAdd, onClose }: {
  title: string;
  /** The name of the note it links back to. */
  note: string;
  places: TaskPlaceChoice[];
  /** The place picked at first. */
  initial: number;
  onAdd: (title: string, place: TaskPlaceChoice) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(title);
  const [index, setIndex] = useState(initial);
  // The note's name is underlined, wherever the sentence puts it.
  const linksBack = t('toTask.linksBack').split('{note}');
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [index]);
  const add = () => {
    const place = places[index];
    if (value.trim() && place) onAdd(value, place);
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') setIndex(Math.min(index + 1, places.length - 1));
    else if (event.key === 'ArrowUp') setIndex(Math.max(index - 1, 0));
    else if (event.key === 'Enter') add();
    else return;
    event.preventDefault();
  };
  return (
    <Dialog label={t('toTask.title')} className="move-task pick-place" onClose={onClose} onKeyDown={onKey}>
      <h2>{t('toTask.title')}</h2>
      <input
        aria-label={t('tasks.title')}
        placeholder={t('tasks.name')}
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <p className="links-back">
        {linksBack[0]}
        <u>{note}</u>
        {linksBack[1]}
      </p>
      <p className="choices-label">{t('toTask.addTo')}</p>
      {places.length === 0 && <p>{t('toTask.none')}</p>}
      <div ref={list} className="choices" role="listbox" aria-label={t('moveTask.places')} hidden={places.length === 0}>
        {places.map((place, i) => (
          <button
            key={`${place.list}\n${place.section ?? ''}`}
            type="button"
            role="option"
            className={place.section === null ? undefined : 'sub'}
            aria-selected={i === index}
            tabIndex={-1}
            onMouseDown={keepFocus}
            onClick={() => setIndex(i)}
            onDoubleClick={() => value.trim() && onAdd(value, place)}
          >
            {place.section === null && <Icon name="tasks" />}
            <span>{place.label}</span>
            {place.folder && <small>{place.folder}</small>}
          </button>
        ))}
      </div>
      <div className="dialog-actions">
        <button type="button" onClick={onClose}>
          {t('dialog.cancel')}
        </button>
        <button type="button" className="primary" disabled={!value.trim() || places.length === 0} onClick={add}>
          {t('tasks.add')}
        </button>
      </div>
    </Dialog>
  );
}

/** A board a card can be added to, with the folder it is in. */
export interface BoardChoice {
  board: string;
  label: string;
  folder: string;
}

/** A card made from a note: its title, and the board it goes to. Its description comes from the note's lines. */
export function NewCardDialog({ title, note, boards, initial, onAdd, onClose }: {
  title: string;
  /** The name of the note it links back to. */
  note: string;
  boards: BoardChoice[];
  /** The board picked at first. */
  initial: number;
  onAdd: (title: string, board: BoardChoice) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(title);
  const [index, setIndex] = useState(initial);
  const linksBack = t('toTask.linksBack').split('{note}');
  const add = () => {
    const board = boards[index];
    if (value.trim() && board) onAdd(value, board);
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') setIndex(Math.min(index + 1, boards.length - 1));
    else if (event.key === 'ArrowUp') setIndex(Math.max(index - 1, 0));
    else if (event.key === 'Enter') add();
    else return;
    event.preventDefault();
  };
  return (
    <Dialog label={t('toCard.title')} className="move-task pick-place" onClose={onClose} onKeyDown={onKey}>
      <h2>{t('toCard.title')}</h2>
      <input aria-label={t('card.title')} placeholder={t('board.cardName')} autoFocus value={value} onChange={(event) => setValue(event.target.value)} />
      <p className="links-back">
        {linksBack[0]}
        <u>{note}</u>
        {linksBack[1]}
      </p>
      <p className="choices-label">{t('toCard.addTo')}</p>
      {boards.length === 0 ? (
        <p>{t('toCard.none')}</p>
      ) : (
        <div className="choices" role="listbox" aria-label={t('toCard.addTo')}>
          {boards.map((board, i) => (
            <button
              key={board.board}
              type="button"
              role="option"
              aria-selected={i === index}
              tabIndex={-1}
              onMouseDown={keepFocus}
              onClick={() => setIndex(i)}
              onDoubleClick={() => value.trim() && onAdd(value, board)}
            >
              <Icon name="board" />
              <span>{board.label}</span>
              {board.folder && <small>{board.folder}</small>}
            </button>
          ))}
        </div>
      )}
      <div className="dialog-actions">
        <button type="button" onClick={onClose}>
          {t('dialog.cancel')}
        </button>
        <button type="button" className="primary" disabled={!value.trim() || boards.length === 0} onClick={add}>
          {t('board.addCard')}
        </button>
      </div>
    </Dialog>
  );
}

/**
 * The name and the place of a note, a task list, a board, a keys file, a collection or a folder,
 * from its menu's Rename or its tab double-clicked: its name, and its folder as the Create window
 * has it, where it is now. Save changes what was changed, the name first. An attached file has
 * only its name, its extension shown after it and kept.
 */
export function RenameDialog({ name, ext, folder = '', folders, onSave, onClose }: {
  name: string;
  /** An attached file's extension, `.pdf`. */
  ext?: string;
  /** The folder it is in. */
  folder?: string;
  /** Where it can go; without them it stays where it is, as an attached file does. */
  folders?: string[];
  /** Saves the name and the folder; returns a message when either cannot be. */
  onSave: (name: string, folder: FolderChoice) => Promise<string | null>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(name);
  const [choice, setChoice] = useState<FolderChoice>({ folder, create: false });
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    const failed = await onSave(value, choice);
    busy.current = false;
    if (failed) setError(failed);
    else onClose();
  };
  const input = (
    <input
      id="rename-item"
      autoFocus
      value={value}
      onFocus={(event) => event.target.select()}
      onChange={(event) => {
        setValue(event.target.value);
        setError(null);
      }}
    />
  );
  return (
    <Dialog label={t('rename.title')} className="new-item" onClose={onClose}>
      <h2>{t('rename.title')}</h2>
      <form onSubmit={submit}>
        <div className="dialog-body">
          <label className="field">
            <span>{t('create.name')}</span>
            {ext ? (
              <span className="name-ext">
                {input}
                <i>{ext}</i>
              </span>
            ) : (
              input
            )}
          </label>
          {folders && (
            <div className="field">
              <span>{t('create.folder')}</span>
              <FolderField
                folders={folders}
                value={choice}
                onChange={(picked) => {
                  setChoice(picked);
                  setError(null);
                }}
              />
            </div>
          )}
          {error && <p role="alert">{error}</p>}
        </div>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            {t('dialog.cancel')}
          </button>
          <button type="submit" className="primary">
            {t('card.save')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** The ways a note goes out, each with what comes out of it. */
const EXPORTS = [
  { format: 'pdf', ext: 'PDF', label: 'export.pdf', text: 'export.pdfText' },
  { format: 'html', ext: 'HTML', label: 'export.html', text: 'export.htmlText' },
  { format: 'md', ext: 'MD', label: 'export.md', text: 'export.mdText' },
] as const;

/**
 * Export, from a note's menu, after the Export views of design/mockups.html: PDF, HTML or
 * Markdown, each saying what comes out of it; a click on one exports it. On a phone a sheet.
 */
export function ExportDialog({ name, files, onPick, onClose }: {
  name: string;
  /** How many attached files the note links to, once known: its Markdown goes in a .zip with them. */
  files: number | null;
  onPick: (format: ExportFormat) => void;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') setIndex((i) => (i + 1) % EXPORTS.length);
    else if (event.key === 'ArrowUp') setIndex((i) => (i + EXPORTS.length - 1) % EXPORTS.length);
    else if (event.key === 'Enter') onPick(EXPORTS[index]!.format);
    else return;
    event.preventDefault();
  };
  const textOf = (item: (typeof EXPORTS)[number]) => (item.format !== 'md' ? t(item.text) : files ? t('export.mdText', { count: files }) : t('export.mdAlone'));
  return (
    <Dialog label={t('export.title')} className="export" onClose={onClose} onKeyDown={onKey}>
      <h2>{t('export.title')}</h2>
      <p className="export-of">{name}</p>
      <div className="choices" role="listbox" aria-label={t('export.title')}>
        {EXPORTS.map((item, i) => (
          <button
            key={item.format}
            type="button"
            role="option"
            aria-selected={i === index}
            tabIndex={-1}
            onMouseEnter={() => setIndex(i)}
            onClick={() => onPick(item.format)}
          >
            <span className="fthumb doc" aria-hidden="true">
              <Icon name="file" />
              <i>{item.ext}</i>
            </span>
            <span className="export-tx">
              <b>{t(item.label)}</b>
              <small>{textOf(item)}</small>
            </span>
          </button>
        ))}
      </div>
      {!isPhone() && (
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            {t('dialog.cancel')}
          </button>
        </div>
      )}
    </Dialog>
  );
}

/** Asks before something is deleted. Enter confirms, Esc or Cancel leaves it be. On a phone it is an action sheet. */
export function ConfirmDialog({ title, message, places, after, brief, action, danger, onConfirm, onClose }: {
  title: string;
  message: string;
  /** Named in a box under the message: where what is deleted is taken out of. */
  places?: ConfirmPlace[];
  /** Said under the places. */
  after?: string;
  /** On a phone, said instead of the message, the places and what comes after them: one sentence. */
  brief?: string;
  /** The label of the confirming button. */
  action: string;
  /** Whether it takes something away: on a phone its button is red. */
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (isPhone()) return <AskSheet title={title} message={brief ?? message} action={action} danger={danger} onConfirm={onConfirm} onClose={onClose} />;
  const onKey = (event: KeyboardEvent) => {
    // Enter on Cancel is that button's own click.
    if (event.key !== 'Enter' || event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    onConfirm();
  };
  return (
    <Dialog label={title} onClose={onClose} onKeyDown={onKey}>
      <h2>{title}</h2>
      <p className="confirm">{message}</p>
      {places && places.length > 0 && (
        <ul className="confirm-places">
          {places.map((place, i) => (
            <li key={i}>
              <Icon name={place.icon} />
              <span>{place.name}</span>
              <small>{place.sub}</small>
            </li>
          ))}
        </ul>
      )}
      {after && <p className="confirm">{after}</p>}
      <div className="dialog-actions">
        <button type="button" onClick={onClose}>
          {t('dialog.cancel')}
        </button>
        <button type="button" className="primary" onClick={onConfirm}>
          {action}
        </button>
      </div>
    </Dialog>
  );
}

/**
 * Closing a phase with cards not finished: they move to an open phase, the next one picked, out
 * of any phase, or stay in it. On a phone a sheet, the open phases a row each with a tick.
 */
export function ClosePhaseDialog({ name, cards, phases, next, onConfirm, onClose }: {
  /** The phase's name, quoted. */
  name: string;
  /** How many of its cards are not finished, as words: 3 cards. */
  cards: string;
  /** The open phases they can move to, in their order. */
  phases: Phase[];
  /** The one picked to begin with: the next open phase. */
  next: string | undefined;
  onConfirm: (leftovers: Leftovers) => void;
  onClose: () => void;
}) {
  const [choice, setChoice] = useState<'move' | 'none' | 'stay'>(next ? 'move' : 'none');
  const [target, setTarget] = useState(next ?? '');
  const title = t('phase.close');
  const message = t('phase.closeLeft', { name, cards });
  const confirm = () => onConfirm(choice === 'move' ? { phase: target } : choice === 'none' ? 'backlog' : 'stay');
  if (isPhone()) {
    const row = (key: string, icon: IconName, text: string, on: boolean, pick: () => void) => (
      <button key={key} type="button" className="mb-fr pick" role="radio" aria-checked={on} onClick={pick}>
        <Icon name={icon} />
        <span className="in">{text}</span>
        <span className="tick">{on && <Icon name="check" />}</span>
      </button>
    );
    return (
      <Sheet label={title} className="mb-create" onClose={onClose}>
        <div className="mb-sh">
          <b>{title}</b>
          <SheetClose onClose={onClose} />
        </div>
        <div className="mb-ask close-left" role="radiogroup" aria-label={message}>
          <p>{message}</p>
          {phases.length > 0 && (
            <>
              <div className="mb-cap">{t('phase.leftMove')}</div>
              <div className="mb-group">
                {phases.map((phase) =>
                  row(phase.id, 'phase', phase.name, choice === 'move' && target === phase.id, () => {
                    setChoice('move');
                    setTarget(phase.id);
                  }),
                )}
              </div>
            </>
          )}
          <div className="mb-group apart">
            {row('none', 'phase', t('phase.leftNone'), choice === 'none', () => setChoice('none'))}
            {row('stay', 'phase', t('phase.leftStay', { name }), choice === 'stay', () => setChoice('stay'))}
          </div>
          <button type="button" className="go" onClick={confirm}>
            {t('phase.closeAction')}
          </button>
        </div>
      </Sheet>
    );
  }
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.target instanceof HTMLButtonElement || event.target instanceof HTMLSelectElement) return;
    event.preventDefault();
    confirm();
  };
  return (
    <Dialog label={title} className="close-phase" onClose={onClose} onKeyDown={onKey}>
      <h2>{title}</h2>
      <p className="confirm">{message}</p>
      <div className="na-radio close-left" role="radiogroup" aria-label={message}>
        {phases.length > 0 && (
          <span className="move">
            <button type="button" role="radio" aria-checked={choice === 'move'} onClick={() => setChoice('move')}>
              {t('phase.leftMove')}
            </button>
            <select
              aria-label={t('phase.leftMove')}
              value={target}
              onChange={(event) => {
                setTarget(event.target.value);
                setChoice('move');
              }}
            >
              {phases.map((phase) => (
                <option key={phase.id} value={phase.id}>
                  {phase.name}
                </option>
              ))}
            </select>
          </span>
        )}
        <button type="button" role="radio" aria-checked={choice === 'none'} onClick={() => setChoice('none')}>
          {t('phase.leftNone')}
        </button>
        <button type="button" role="radio" aria-checked={choice === 'stay'} onClick={() => setChoice('stay')}>
          {t('phase.leftStay', { name })}
        </button>
      </div>
      <div className="dialog-actions">
        <button type="button" onClick={onClose}>
          {t('dialog.cancel')}
        </button>
        <button type="button" className="primary" onClick={confirm}>
          {t('phase.closeAction')}
        </button>
      </div>
    </Dialog>
  );
}

/**
 * The question a button of a collection's rules asks before it runs: what it will do to the
 * record, a line each, the names of what it adds faint after them. On a phone a sheet, its
 * button wide under the lines.
 */
export function ButtonDialog({ name, record, lines, onConfirm, onClose }: {
  /** The button's label. */
  name: string;
  /** The record's title. */
  record: string;
  /** A line a head names the onSave the lines after it are of. */
  lines: { text: string; names?: string; head?: boolean }[];
  onConfirm: () => void;
  onClose: () => void;
}) {
  const title = t('run.askTitle', { name });
  const list = (
    <ul className="ask-lines">
      {lines.map((line, i) => (
        <li key={i} className={line.head ? 'head' : undefined}>
          {line.text} {line.names && <small>{line.names}</small>}
        </li>
      ))}
    </ul>
  );
  if (isPhone()) {
    return (
      <Sheet label={title} className="mb-create" onClose={onClose}>
        <div className="mb-sh">
          <b>{title}</b>
          <SheetClose onClose={onClose} />
        </div>
        <div className="mb-ask">
          <p>{t('run.askFor', { name: record })}</p>
          {list}
          <button type="button" className="go" onClick={onConfirm}>
            {name}
          </button>
        </div>
      </Sheet>
    );
  }
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    onConfirm();
  };
  return (
    <Dialog label={title} onClose={onClose} onKeyDown={onKey}>
      <h2>{title}</h2>
      <p className="confirm">{t('run.askFor', { name: record })}</p>
      {list}
      <div className="dialog-actions">
        <button type="button" onClick={onClose}>
          {t('dialog.cancel')}
        </button>
        <button type="button" className="primary" onClick={onConfirm}>
          {name}
        </button>
      </div>
    </Dialog>
  );
}

/** A question of a button as a field, for the form's own box: a choice is a select, a link picks from its collection. */
const askedField = (q: AskQuestion): Field =>
  ({ key: q.key, label: q.label, type: q.type === 'choice' ? 'select' : q.type, ...(q.options && { options: q.options }), ...(q.collection && { collection: q.collection }), ...(q.time && { time: true }) }) as Field;

/**
 * The window of a button that asks before it runs: its name, what it is about, its questions in
 * the form's boxes (the first one's answer selected), under them what it will do worked out again
 * with what is typed, and its own name on its button, faint while a needed answer is empty or it
 * would stop. On a phone a sheet.
 */
export function AskDialog({ name, ask, plan, ctx, onRun, onClose }: {
  name: string;
  /** Its say and questions with what was given so far. */
  ask: (given: CollectionRecord['values']) => { say: string; questions: AskQuestion[] } | null;
  /** What it would do with the answers. */
  plan: (given: CollectionRecord['values']) => ButtonRun | RuleStop;
  ctx: ValueContext;
  onRun: (run: ButtonRun) => void;
  onClose: () => void;
}) {
  const [given, setGiven] = useState<CollectionRecord['values']>({});
  const asked = useMemo(() => ask(given), [ask, given]);
  const answers = useMemo(() => Object.fromEntries((asked?.questions ?? []).map((q) => [q.key, q.value])), [asked]);
  const run = useMemo(() => plan(answers), [plan, answers]);
  const host = useRef<HTMLDivElement>(null);
  // The first answer comes selected: typing puts another in its place.
  useEffect(() => {
    const first = host.current?.querySelector<HTMLInputElement>('input:not([type="checkbox"])');
    first?.focus();
    first?.select();
  }, []);
  if (!asked) return null;
  const missing = asked.questions.filter((q) => q.required && isEmpty(q.value));
  const stopped = run instanceof RuleStop && missing.length === 0 ? run : null;
  const ready = missing.length === 0 && !(run instanceof RuleStop);
  const go = () => ready && onRun(run as ButtonRun);
  const questions = asked.questions.map((q) => (
    <div key={q.key} className="prop ask-q">
      <label className="pl" htmlFor={`field-${q.key}`}>
        {q.label}
        {q.required && <i title={t('collection.required')}>*</i>}
      </label>
      <div className="pe">
        <FieldInput field={askedField(q)} value={q.value} ctx={ctx} onChange={(value) => setGiven((g) => ({ ...g, [q.key]: value }))} onEnter={go} />
        {q.required && isEmpty(q.value) ? <p className="pbad">{t('run.needed', { label: q.label })}</p> : q.note && <p className="pnote">{q.note}</p>}
      </div>
    </div>
  ));
  const will = (
    <div className="ask-will">
      <span className="hd">{t('run.thisWill')}</span>
      {stopped ? (
        <p className="pbad">{stopped.message}</p>
      ) : (
        !(run instanceof RuleStop) && (
          <ul className="ask-lines">
            {run.ask.map((line, i) => (
              <li key={i} className={line.head ? 'head' : undefined}>
                {line.text} {line.names && <small>{line.names}</small>}
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
  if (isPhone()) {
    return (
      <Sheet label={name} className="mb-create" onClose={onClose}>
        <div className="mb-sh">
          <b>{name}</b>
          <SheetClose onClose={onClose} />
        </div>
        <div className="mb-ask ask-form" ref={host}>
          {asked.say && <p>{asked.say}</p>}
          {questions}
          {will}
          <button type="button" className="go" disabled={!ready} onClick={go}>
            {name}
          </button>
        </div>
      </Sheet>
    );
  }
  return (
    <Dialog label={name} onClose={onClose}>
      <div className="ask-form" ref={host}>
        <h2>{name}</h2>
        {asked.say && <p className="confirm">{asked.say}</p>}
        {questions}
        {will}
      </div>
      <div className="dialog-actions">
        <button type="button" onClick={onClose}>
          {t('dialog.cancel')}
        </button>
        <button type="button" className="primary" disabled={!ready} onClick={go}>
          {name}
        </button>
      </div>
    </Dialog>
  );
}

export interface MenuItem {
  label: string;
  run: () => void;
  /** Why the item cannot be used now; it is shown greyed out with this under it. */
  disabled?: string;
  /** A line above it sets it apart from the items before. */
  apart?: boolean;
  /** On a phone: the icon before it. */
  icon?: IconName;
  /** On a phone: what it is set to, on its right. */
  value?: string;
  /** It takes something away: on a phone it comes last, red. */
  danger?: boolean;
  /** A priority: its flag in its colour before it, on a computer too, and a tick after the one set. */
  flag?: Priority;
  /** On a phone: a class for its row, as a priority's colour. */
  className?: string;
  /** On a computer too: its icon before it, coloured by its `className`, as a callout's kind is. */
  mark?: boolean;
  /** The one of a few that is set, as an image's size: a tick after it. */
  checked?: boolean;
  /**
   * A menu of its own: on a computer it opens beside the item, which shows its `value` and an
   * arrow; on a phone it takes the sheet's place.
   */
  items?: MenuItem[];
}

/** On a phone: what a menu is about, at its top. */
export interface MenuHead {
  icon: IconName;
  title: string;
  sub?: string;
  /** Shown in the icon's place: an image's own picture. */
  picture?: ReactNode;
  /** A faint line under the items, as when a note was last written. */
  foot?: string;
}

/** A place a confirming question names, in a box under its message: a note a file is taken out of. */
export interface ConfirmPlace {
  icon: IconName;
  name: string;
  sub: string;
}

/** A note the phase window can point a phase at. */
export interface NoteChoice {
  path: string;
  title: string;
}

/** A phase's name, what it is for, when it counts as done, and a note with more. */
export function PhaseDialog({ phase, notes, onSave, onClose }: {
  phase: Phase;
  notes: NoteChoice[];
  onSave: (patch: PhasePatch) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(phase.name);
  const [goal, setGoal] = useState(phase.goal ?? '');
  const [doneWhen, setDoneWhen] = useState(phase.doneWhen ?? '');
  const [note, setNote] = useState(phase.note ?? '');
  const save = () => {
    if (!name.trim()) return;
    onSave({ name, goal, doneWhen, note: note || null });
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      save();
    }
  };
  return (
    <Dialog label={t('phase.title')} className="phase-dialog" onClose={onClose} onKeyDown={onKey}>
      <h2>{t('phase.title')}</h2>
      <label className="field">
        <span>{t('phase.name')}</span>
        <input id="phase-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="field">
        <span>{t('phase.goal')}</span>
        <textarea id="phase-goal" rows={2} placeholder={t('phase.goalHint')} value={goal} onChange={(event) => setGoal(event.target.value)} />
      </label>
      <label className="field">
        <span>{t('phase.doneWhen')}</span>
        <textarea
          id="phase-done"
          rows={2}
          placeholder={t('phase.doneWhenHint')}
          value={doneWhen}
          onChange={(event) => setDoneWhen(event.target.value)}
        />
      </label>
      <label className="field">
        <span>{t('phase.note')}</span>
        <select id="phase-note" value={note} onChange={(event) => setNote(event.target.value)}>
          <option value="">{t('phase.noNote')}</option>
          {notes.map((choice) => (
            <option key={choice.path} value={choice.path}>
              {choice.title}
            </option>
          ))}
        </select>
      </label>
      <div className="dialog-actions">
        <button type="button" onClick={onClose}>
          {t('dialog.cancel')}
        </button>
        <button type="button" className="primary" disabled={!name.trim()} onClick={save}>
          {t('phase.save')}
        </button>
      </div>
    </Dialog>
  );
}

interface MenuProps {
  at: { x: number; y: number };
  items: MenuItem[];
  /** What the menu is about, said at its top on a phone. */
  head?: MenuHead;
  onClose: () => void;
}

/** The menu of a right click, at the pointer; on a phone an action sheet from the bottom. */
export function ContextMenu(props: MenuProps) {
  return isPhone() ? <ActionSheet head={props.head} items={props.items} onClose={props.onClose} /> : <PointerMenu {...props} />;
}

/** What was last pressed, and when: a menu opened by a click knows the button that opened it. */
let pressed: { element: Element; left: boolean; at: number } | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    (event) => {
      pressed = event.target instanceof Element ? { element: event.target, left: event.button === 0, at: Date.now() } : null;
    },
    true,
  );
}

/** The button a menu opening now was clicked open with; none for a right click or a key. */
function openedBy(): Element | null {
  if (!pressed?.left || Date.now() - pressed.at > 1000) return null;
  return pressed.element.closest('button, [role="button"]');
}

/**
 * A press on the button that opened a menu closes it: the click that follows is kept from the
 * button, which would open the menu again.
 */
function keepClickFrom(button: Element) {
  const keep = (event: globalThis.MouseEvent) => {
    if (button.contains(event.target as Node)) {
      event.stopPropagation();
      event.preventDefault();
    }
    done();
  };
  const done = () => {
    window.removeEventListener('click', keep, true);
    window.clearTimeout(timer);
  };
  const timer = window.setTimeout(done, 1000);
  window.addEventListener('click', keep, true);
}

function PointerMenu({ at, items, onClose }: MenuProps) {
  const menu = useRef<HTMLDivElement>(null);
  // The button it was opened with: pressed again, it closes the menu, as the other pickers do.
  const [anchor] = useState(openedBy);
  // The item whose own menu is open beside it, by its place in the list, and whether that menu
  // opens to the left, where the window has no room on the right.
  const [sub, setSub] = useState<{ index: number; top: number; left: boolean } | null>(null);
  const openSub = (index: number, button: HTMLElement) => {
    const box = pageBox(menu.current!);
    const left = box.right + box.width > pageWindow().width;
    setSub({ index, top: button.offsetTop - 4, left });
  };
  // The pointer is where the screen says; the menu is placed in the page's own pixels.
  const [place, setPlace] = useState(() => ({ x: onPage(at.x), y: onPage(at.y) }));
  // Near the right or bottom edge the menu opens to the left of or above the pointer, so it stays in the window.
  useLayoutEffect(() => {
    if (!menu.current) return;
    const box = pageBox(menu.current);
    const page = pageWindow();
    const x = onPage(at.x);
    const y = onPage(at.y);
    const margin = 8;
    setPlace({
      x: x + box.width + margin > page.width ? Math.max(margin, x - box.width) : x,
      y: y + box.height + margin > page.height ? Math.max(margin, y - box.height) : y,
    });
  }, [at]);
  useEffect(() => {
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const close = (event: MouseEvent | globalThis.KeyboardEvent) => {
      if (event instanceof MouseEvent ? menu.current?.contains(event.target as Node) : event.key !== 'Escape') return;
      if (event instanceof MouseEvent && anchor?.contains(event.target as Node)) keepClickFrom(anchor);
      onClose();
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose, anchor]);
  return (
    <div ref={menu} className="menu" role="menu" style={{ left: place.x, top: place.y }}>
      {items.map((item, index) => (
        <Fragment key={item.label}>
          {item.apart && index > 0 && <hr />}
          {item.items ? (
            <button
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={sub?.index === index}
              className={sub?.index === index ? 'has-sub on' : 'has-sub'}
              onMouseEnter={(event) => openSub(index, event.currentTarget)}
              onClick={(event) => openSub(index, event.currentTarget)}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowRight') return;
                event.preventDefault();
                openSub(index, event.currentTarget);
              }}
            >
              {item.label}
              {item.value && <span className="sub-val">{item.value}</span>}
              <Icon name="chevron" />
            </button>
          ) : item.disabled !== undefined ? (
            <button type="button" role="menuitem" className="off" disabled>
              {item.label}
              {item.disabled && <small>{item.disabled}</small>}
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              className={item.flag ? `prio p${item.flag}` : item.mark ? item.className : undefined}
              onMouseEnter={() => setSub(null)}
              onClick={() => {
                onClose();
                item.run();
              }}
            >
              {item.flag && <Icon name="flag" />}
              {item.mark && item.icon && <Icon name={item.icon} />}
              {item.label}
              {item.flag && item.value && <span className="val">{item.value}</span>}
              {item.checked && <span className="val">✓</span>}
            </button>
          )}
        </Fragment>
      ))}
      {sub && items[sub.index]?.items && (
        <div className={sub.left ? 'menu sub left' : 'menu sub'} role="menu" style={{ top: sub.top }} onMouseDown={(event) => event.stopPropagation()}>
          {items[sub.index]!.items!.map((item) => (
            <Fragment key={item.label}>
              {item.apart && <hr />}
              <button
                type="button"
                // A choice, as Group by's, is ticked; something to do, as Add new's, is not.
                role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
                aria-checked={item.checked === undefined ? undefined : item.checked}
                disabled={item.disabled !== undefined}
                onClick={() => {
                  onClose();
                  item.run();
                }}
              >
                {item.label}
                {item.checked && <span className="val">✓</span>}
              </button>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
