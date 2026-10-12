import { basename, type BoardLinks, type CollectionTemplate, defaultCollectionName, INBOX, join, newSchema, type Template } from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { COLLECTION_TEMPLATES, type FolderChoice, type ItemKind, KINDS, NAME_HINTS, TEMPLATES, TITLES, useFolderPicker } from './dialogs';
import { Icon } from './Icon';
import { collectionLabel, shownPath } from './items';
import { Sheet, SheetClose } from './sheets';

// Create on a phone, after the Phone create view of design/mockups.html: + opens the kinds as a
// sheet for the folder on screen; the one picked asks its name and folder in the same sheet, a
// board its template and a CRM board its links. The folder, the template and a link are each
// chosen from a list that opens in the sheet. Create sits at the top, where the keyboard never
// covers it.

/** What the sheet shows: the form, or one of the lists a row of it opens. */
type Step = 'form' | 'folder' | 'template' | 'company' | 'contact';

const folderLabel = (path: string) => (path === INBOX ? t('side.inbox') : shownPath(path));

/** A board's columns drawn by kind, small. */
function Columns({ columns }: { columns: string[] }) {
  return (
    <span className="mb-cols">
      {columns.map((column, i) => (
        <i key={i} className={column} />
      ))}
    </span>
  );
}

const Tick = ({ on }: { on: boolean }) => <span className="tick">{on && <Icon name="check" />}</span>;

export function PhoneCreate({ start = null, folders, folder, collections, onCreate, onFilter, onClose }: {
  /** The kind chosen already, if any. */
  start?: ItemKind | null;
  /** Every folder, the inbox first. */
  folders: string[];
  /** The folder on screen. */
  folder: string;
  /** Every collection, by its folder's path: what a CRM board's links can point at. */
  collections: string[];
  /** Returns a message when the item cannot be made. */
  onCreate: (kind: ItemKind, folder: FolderChoice, name: string, template: Template, collectionTemplate: CollectionTemplate, links?: BoardLinks) => Promise<string | null>;
  /** A filter has a window of its own. */
  onFilter: () => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<ItemKind | null>(start);
  const [step, setStep] = useState<Step>('form');
  const [name, setName] = useState('');
  const [place, setPlace] = useState<FolderChoice>({ folder, create: false });
  const [template, setTemplate] = useState<Template>('software');
  const [collectionTemplate, setCollectionTemplate] = useState<CollectionTemplate>('companies');
  // A CRM board's links, as chosen; until then they point at Companies and People beside the board.
  const [chosen, setChosen] = useState<Partial<BoardLinks>>({});
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const picker = useFolderPicker(folders, folder);
  // The name is typed into first; coming back from a list leaves the keyboard down.
  const named = useRef(false);
  useEffect(() => {
    if (kind && step === 'form') named.current = true;
  });

  if (!kind) {
    return (
      <Sheet label={t('create.title')} className="mb-create" onClose={onClose}>
        <div className="mb-sh">
          <b>{t('create.title')}</b>
          <small>{t('phone.in', { folder: folderLabel(folder) })}</small>
          <SheetClose onClose={onClose} />
        </div>
        <div className="mb-kinds">
          {KINDS.map((item) => (
            <button key={item.kind} type="button" className="mb-row" onClick={() => (item.kind === 'filter' ? onFilter() : setKind(item.kind))}>
              <Icon name={item.icon} />
              <span className="tx">
                <b>{t(item.label)}</b>
                {item.text && <small>{t(item.text)}</small>}
              </span>
            </button>
          ))}
        </div>
      </Sheet>
    );
  }

  const title = t(TITLES[kind]);
  const beside = (named: string) =>
    collections.find((dir) => dir === join(place.folder, named)) ?? collections.find((dir) => basename(dir) === named) ?? join(place.folder, named);
  const links: BoardLinks = { company: chosen.company ?? beside('Companies'), contact: chosen.contact ?? beside('People') };
  const boardTemplate = TEMPLATES.find((item) => item.template === template)!;
  const fieldsOf = (of: CollectionTemplate) =>
    newSchema(of)
      .fields.map((field) => field.label.toLowerCase())
      .join(', ');

  const create = async () => {
    if (busy.current) return;
    busy.current = true;
    const failed = await onCreate(kind, place, name, template, collectionTemplate, template === 'crm' ? links : undefined);
    busy.current = false;
    setError(failed);
  };
  const back = (
    <button type="button" className="cancel back" onClick={() => setStep('form')}>
      <Icon name="back" />
      <span>{title}</span>
    </button>
  );
  /** A list the form opens: its name at the top and the way back to the form. */
  const list = (label: string, rows: ReactNode) => (
    <Sheet label={label} className="mb-create" onClose={onClose} onEscape={() => setStep('form')}>
      <div className="mb-sh three">
        {back}
        <b>{label}</b>
        <span />
      </div>
      <div className="mb-form">{rows}</div>
    </Sheet>
  );

  if (step === 'folder') {
    const pick = (choice: FolderChoice) => {
      setPlace(choice);
      setError(null);
      setStep('form');
    };
    return list(
      t('create.folder'),
      <>
        <label className="mb-search">
          <Icon name="search" />
          <input
            aria-label={t('create.findFolder')}
            placeholder={t('create.findFolder')}
            enterKeyHint="done"
            value={picker.query}
            onChange={(event) => picker.filter(event.target.value)}
          />
        </label>
        <div className="mb-group">
          {picker.matches.map((path) => (
            <button key={path} type="button" className="mb-fr pick" onClick={() => pick({ folder: path, create: false })}>
              <Icon name="folder" />
              <span className="in">{folderLabel(path)}</span>
              <Tick on={!place.create && place.folder === path} />
            </button>
          ))}
          {picker.canCreate && (
            <button type="button" className="mb-fr pick add" onClick={() => pick({ folder: picker.typed, create: true })}>
              <Icon name="plus" />
              <span className="in">{t('folders.create', { name: picker.typed })}</span>
            </button>
          )}
          {picker.count === 0 && <p className="mb-fr none">{t('create.typeToCreate')}</p>}
        </div>
      </>,
    );
  }

  if (step === 'template' && kind === 'board') {
    return list(
      t('create.template'),
      <div className="mb-group">
        {TEMPLATES.map((item) => (
          <button
            key={item.template}
            type="button"
            className="mb-fr tp"
            onClick={() => {
              setTemplate(item.template);
              setStep('form');
            }}
          >
            <span className="tn">
              {t(item.label)}
              <small>{t(item.text)}</small>
              <Columns columns={item.columns} />
            </span>
            <Tick on={template === item.template} />
          </button>
        ))}
      </div>,
    );
  }

  if (step === 'template') {
    return list(
      t('create.template'),
      <div className="mb-group">
        {COLLECTION_TEMPLATES.map((item) => (
          <button
            key={item.template}
            type="button"
            className="mb-fr tp"
            onClick={() => {
              setCollectionTemplate(item.template);
              setStep('form');
            }}
          >
            <span className="tn">
              {t(item.label)}
              <small>{t(item.text)}</small>
              {item.template !== 'blank' && <small className="flds">{fieldsOf(item.template)}</small>}
            </span>
            <Tick on={collectionTemplate === item.template} />
          </button>
        ))}
      </div>,
    );
  }

  if (step === 'company' || step === 'contact') {
    const current = links[step];
    const options = [...new Set([...collections, current])].sort((a, b) => a.localeCompare(b));
    return list(
      t(step === 'company' ? 'create.linkCompany' : 'create.linkContact'),
      <div className="mb-group">
        {options.map((dir) => (
          <button
            key={dir}
            type="button"
            className="mb-fr pick"
            onClick={() => {
              setChosen({ ...chosen, [step]: dir });
              setStep('form');
            }}
          >
            <Icon name="collection" />
            <span className="in">{collectionLabel(dir)}</span>
            <Tick on={dir === current} />
          </button>
        ))}
      </div>,
    );
  }

  const row = (label: string, value: ReactNode, next: Step) => (
    <button type="button" className="mb-fr" onClick={() => setStep(next)}>
      <span className="fl">{label}</span>
      <span className="val">
        {value}
        <Icon name="chevron" />
      </span>
    </button>
  );
  return (
    <Sheet label={title} className="mb-create" onClose={onClose}>
      <div className="mb-sh three">
        <button type="button" className="cancel" onClick={onClose}>
          {t('dialog.cancel')}
        </button>
        <b>{title}</b>
        <button type="button" className="ok" onClick={() => void create()}>
          {t('create.create')}
        </button>
      </div>
      <form
        className="mb-form"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <div className="mb-group">
          <label className="mb-fr">
            <span className="fl">{t('create.name')}</span>
            <input
              className="in"
              autoFocus={!named.current}
              enterKeyHint="go"
              placeholder={kind === 'collection' ? defaultCollectionName(collectionTemplate) : t(NAME_HINTS[kind])}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
            />
          </label>
          {row(
            t('create.folder'),
            <>
              <Icon name="folder" />
              <span className="tx">{place.create ? t('phone.newFolder', { name: place.folder }) : folderLabel(place.folder)}</span>
            </>,
            'folder',
          )}
          {kind === 'board' &&
            row(
              t('create.template'),
              <>
                <Columns columns={boardTemplate.columns} />
                <span className="tx">{t(boardTemplate.label)}</span>
              </>,
              'template',
            )}
          {kind === 'collection' &&
            row(t('create.template'), <span className="tx">{t(COLLECTION_TEMPLATES.find((item) => item.template === collectionTemplate)!.label)}</span>, 'template')}
        </div>
        {kind === 'board' && template === 'crm' && (
          <>
            <div className="mb-cap">{t('create.links')}</div>
            <div className="mb-group">
              {row(t('create.linkCompany'), <span className="tx">{collectionLabel(links.company)}</span>, 'company')}
              {row(t('create.linkContact'), <span className="tx">{collectionLabel(links.contact)}</span>, 'contact')}
            </div>
          </>
        )}
        {kind === 'board' && <p className="mb-hint">{t('create.templateHint')}</p>}
        {kind === 'collection' && <p className="mb-hint">{t('create.collectionTemplateHint')}</p>}
        {error && (
          <p className="mb-hint err" role="alert">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}
