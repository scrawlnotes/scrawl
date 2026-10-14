import { dayOf, type FileUse } from '@scrawlnotes/core';
import { sizeText } from '@scrawlnotes/editor';
import { locale, t } from '@scrawlnotes/i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChooseBox, groupState, useLetGo } from './choose';
import { isPhone } from './device';
import { Icon, type IconName } from './Icon';
import { useHold } from './Phone';
import type { FileRow } from './session';
import { Empty } from './sheets';
import { clockTime, pastDayLabel } from './text';
import type { TrashSpace } from './Trash';

// Files: every image, recording and file attached in a space, with where it is used, its size and
// when it came, each space's under its own heading. A row opens the file; the name of a note, a
// card or a record on it opens that. After the Files views of design/mockups.html (PLAN 4.2).

const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i;
const AUDIO = /\.(webm|ogg|oga|opus|mp3|m4a|aac|wav|flac)$/i;

export type FileKind = 'image' | 'audio' | 'file';
export const kindOf = (file: { name: string }): FileKind => (IMAGE.test(file.name) ? 'image' : AUDIO.test(file.name) ? 'audio' : 'file');

/** How a file is called: its own name, or for one the app named by the moment it came, what it is and that moment: `Image · Oct 6, 14:32`. */
export function fileTitle(file: Pick<FileRow, 'name' | 'named' | 'added'>): string {
  if (!file.named || file.added === null) return file.name;
  const word = { image: t('files.image'), audio: t('files.recording'), file: t('files.file') }[kindOf(file)];
  const when = new Date(file.added);
  const sameYear = when.getFullYear() === new Date().getFullYear();
  const day = when.toLocaleDateString(locale(), sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
  return `${word} · ${day}, ${clockTime(when.toISOString())}`;
}

export const useIcon = (use: FileUse): IconName => (use.kind === 'card' ? 'board' : use.kind === 'record' ? 'collection' : 'note');
export const useWord = (use: FileUse) => (use.kind === 'card' ? t('files.useCard') : use.kind === 'record' ? t('files.useRecord') : t('files.useNote'));
/** What a use is called: a card by its key and its title. */
export const useTitle = (use: FileUse) => (use.card ? `${use.title} ${use.card.title}` : use.title);

/** How many bytes, together. */
const total = (files: FileRow[]) => sizeText(files.reduce((sum, file) => sum + file.size, 0));

export interface FilesChoice {
  chosen: ReadonlySet<string>;
  /** A phone's Select is on: a tap on a row chooses it. */
  choosing: boolean;
  onChoose: (paths: string[], on: boolean) => void;
  onDelete: () => void;
}

export interface FileActions {
  /** Opens a file; one left in the cloud is brought first. */
  open: (file: FileRow) => void;
  /** Brings a file left in the cloud here. */
  fetch: (file: FileRow) => void;
  /** On the desktop app: the file in its folder. */
  reveal?: (file: FileRow) => void;
  /** In a browser: the file saved where downloads go. */
  download?: (file: FileRow) => void;
  remove: (files: FileRow[]) => void;
  openUse: (use: FileUse) => void;
  /** Where an image shows from. */
  image: (path: string) => string | Promise<string>;
  /** On a phone: a held row's actions. */
  menu: (file: FileRow) => void;
  /** On a phone: the sort, chosen in a sheet. */
  chooseSort: (sort: FileSort, onPick: (sort: FileSort) => void) => void;
}

export type FileSort = { key: 'added' | 'size' | 'name'; dir: 'asc' | 'desc' };
const NEWEST: FileSort = { key: 'added', dir: 'desc' };

function sorted(files: FileRow[], sort: FileSort): FileRow[] {
  const by = (a: FileRow, b: FileRow) =>
    sort.key === 'size' ? a.size - b.size : sort.key === 'name' ? fileTitle(a).localeCompare(fileTitle(b), undefined, { numeric: true }) : (a.added ?? 0) - (b.added ?? 0);
  return [...files].sort((a, b) => (sort.dir === 'asc' ? by(a, b) : by(b, a)));
}

/** A file's small picture: the image itself once its row is in sight, or its kind with its extension. */
export function Thumb({ file, image, className }: { file: FileRow; image: (path: string) => string | Promise<string>; className: string }) {
  const kind = kindOf(file);
  const holder = useRef<HTMLSpanElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  // An image read again (deleted and brought back, say) has a new address: one that no longer loads is asked for once more.
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (kind !== 'image' || file.away || !holder.current) return;
    let live = true;
    const watch = new IntersectionObserver((seen) => {
      if (!seen.some((each) => each.isIntersecting)) return;
      watch.disconnect();
      void Promise.resolve(image(file.path)).then((url) => live && setSrc(url), () => undefined);
    });
    watch.observe(holder.current);
    return () => {
      live = false;
      watch.disconnect();
    };
  }, [file.path, file.away, kind, image, tries]);
  const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.') + 1).toUpperCase().slice(0, 4) : '';
  return (
    <span ref={holder} className={`${className}${src ? '' : ' doc'}`} aria-hidden="true">
      {src ? (
        <img
          src={src}
          alt=""
          draggable={false}
          onError={() => {
            setSrc(null);
            if (tries < 2) setTries(tries + 1);
          }}
        />
      ) : (
        <>
          <Icon name={kind === 'image' ? 'image' : kind === 'audio' ? 'audio' : 'file'} />
          {kind === 'file' && ext && <i>{ext}</i>}
        </>
      )}
    </span>
  );
}

/** The places a file is used, each opening what it is; those in the trash only said. */
function Uses({ file, onOpen }: { file: FileRow; onOpen: (use: FileUse) => void }) {
  if (file.uses.length === 0) return <span className="unused">{t('files.unused')}</span>;
  return (
    <>
      {file.uses.map((use, i) =>
        use.inTrash ? (
          <span key={i} className="use gone">
            <Icon name={useIcon(use)} />
            {useTitle(use)}
            <small>{t('files.inTrash')}</small>
          </span>
        ) : (
          <button key={i} type="button" className="use" title={useTitle(use)} onClick={() => onOpen(use)}>
            <Icon name={useIcon(use)} />
            {use.kind === 'card' ? use.title : useTitle(use)}
          </button>
        ),
      )}
    </>
  );
}

/** A row on a computer: box, picture, name, where it is used, size, when it came, and on hover what can be done. */
function FileLine({ file, today, chosen, choosing, going, actions, onChoose }: {
  file: FileRow;
  today: string;
  chosen: boolean;
  choosing: boolean;
  /** How much of it came, while it comes from the cloud. */
  going?: { done: number; size: number };
  actions: FileActions;
  onChoose: (on: boolean) => void;
}) {
  const title = fileTitle(file);
  const share = going && going.size > 0 ? Math.min(1, going.done / going.size) : 0;
  return (
    <div className={`flrow${chosen ? ' chosen' : ''}${file.away ? ' away' : ''}`} onClick={choosing ? () => onChoose(!chosen) : undefined}>
      <ChooseBox state={chosen} label={t('choose.row', { name: title })} onChange={onChoose} />
      <Thumb file={file} image={actions.image} className="fthumb" />
      <button type="button" className="nm" title={title} onClick={(event) => (choosing ? undefined : (event.stopPropagation(), actions.open(file)))}>
        {title}
        {file.away && <small className="in-cloud">{going ? t('files.downloading', { done: sizeText(going.done), size: sizeText(going.size) }) : t('files.inCloud')}</small>}
      </button>
      <span className="used">
        <Uses file={file} onOpen={actions.openUse} />
      </span>
      <span className="r size">{sizeText(file.size)}</span>
      <span className="r day">{file.added === null ? '' : pastDayLabel(dayOf(new Date(file.added)), today)}</span>
      {!choosing && file.away ? (
        <span className="task-actions">
          {!going && (
            <button type="button" className="hot" title={t('files.download')} aria-label={t('files.download')} onClick={() => actions.fetch(file)}>
              <Icon name="download" />
            </button>
          )}
          <button type="button" title={t('menu.delete')} aria-label={t('menu.delete')} onClick={() => actions.remove([file])}>
            <Icon name="trash" />
          </button>
        </span>
      ) : !choosing ? (
        <span className="task-actions">
          <button type="button" title={t('files.open')} aria-label={t('files.open')} onClick={() => actions.open(file)}>
            <Icon name="open" />
          </button>
          {actions.reveal ? (
            <button type="button" title={t('files.reveal')} aria-label={t('files.reveal')} onClick={() => actions.reveal!(file)}>
              <Icon name="folder" />
            </button>
          ) : (
            actions.download && (
              <button type="button" title={t('files.download')} aria-label={t('files.download')} onClick={() => actions.download!(file)}>
                <Icon name="download" />
              </button>
            )
          )}
          <button type="button" title={t('menu.delete')} aria-label={t('menu.delete')} onClick={() => actions.remove([file])}>
            <Icon name="trash" />
          </button>
        </span>
      ) : (
        <span className="task-actions" />
      )}
      {going && (
        <span className="fl-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
          <i style={{ width: `${share * 100}%` }} />
        </span>
      )}
    </div>
  );
}

/** A row on a phone: picture, name, where it is used and its size, when it came. A tap opens it; held, its actions open. */
function PhoneFileRow({ file, chosen, choosing, going, actions, onChoose }: {
  file: FileRow;
  chosen: boolean;
  choosing: boolean;
  going?: { done: number; size: number };
  actions: FileActions;
  onChoose: (on: boolean) => void;
}) {
  const [held, setHeld] = useState(false);
  const hold = useHold(
    choosing
      ? undefined
      : () => {
          setHeld(true);
          actions.menu(file);
          window.setTimeout(() => setHeld(false), 400);
        },
  );
  const places = file.uses.filter((use) => !use.inTrash);
  const where = file.uses.length === 0 ? t('files.unused') : `${useTitle(places[0] ?? file.uses[0]!)}${file.uses.length > 1 ? ` +${file.uses.length - 1}` : ''}`;
  const today = dayOf(new Date());
  const share = going && going.size > 0 ? Math.min(1, going.done / going.size) : 0;
  // A file left in the cloud says so, and a tap brings it; coming, it says how far it got.
  const line = going
    ? t('files.downloading', { done: sizeText(going.done), size: sizeText(going.size) })
    : file.away
      ? `${t('files.notDownloaded')} · ${sizeText(file.size)}`
      : `${where} · ${sizeText(file.size)}`;
  return (
    <button
      type="button"
      className={`mb-frow${chosen ? ' chosen' : ''}${held ? ' held' : ''}`}
      onClick={() => (choosing ? onChoose(!chosen) : file.away ? actions.fetch(file) : actions.open(file))}
      {...hold}
    >
      {choosing && <span className={`mb-pick${chosen ? ' on' : ''}`} aria-hidden="true" />}
      <Thumb file={file} image={actions.image} className="mb-thumb" />
      <span className="tx">
        <b>{fileTitle(file)}</b>
        <small>{line}</small>
        {going && (
          <span className="mb-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
            <i style={{ width: `${share * 100}%` }} />
          </span>
        )}
      </span>
      {file.away ? (
        !going && (
          <span className="dl" aria-label={t('files.download')}>
            <Icon name="download" />
          </span>
        )
      ) : (
        <span className="rt">{file.added === null ? '' : pastDayLabel(dayOf(new Date(file.added)), today)}</span>
      )}
    </button>
  );
}

/**
 * Files, on a computer a view in a tab and on a phone a page from Browse: a search, the kinds as
 * chips, and the files, each space's under its heading when there is more than one. Rows are
 * chosen together as in the trash.
 */
export function FilesView({ files, today, spaces, choice, actions, downloads }: {
  /** Null while they are read. */
  files: FileRow[] | null;
  /** The files coming from the cloud now, by path: how much of each came. */
  downloads: Record<string, { done: number; size: number }>;
  today: string;
  /** Every space, the personal one first; with more than one Files goes by space. */
  spaces: TrashSpace[];
  choice: FilesChoice;
  actions: FileActions;
}) {
  const phone = isPhone();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<FileKind | 'all'>('all');
  const [sort, setSort] = useState<FileSort>(NEWEST);
  const all = files ?? [];
  const counts = useMemo(() => {
    const out = { all: all.length, image: 0, audio: 0, file: 0 };
    for (const file of all) out[kindOf(file)]++;
    return out;
  }, [all]);
  const words = query.trim().toLowerCase();
  const shown = sorted(
    all.filter(
      (file) =>
        (kind === 'all' || kindOf(file) === kind) &&
        (!words || [fileTitle(file), file.name, ...file.uses.map(useTitle)].some((text) => text.toLowerCase().includes(words))),
    ),
    sort,
  );
  const { chosen } = choice;
  const count = all.filter((file) => chosen.has(file.path)).length;
  const choosing = phone ? choice.choosing : count > 0;
  const every = all.map((file) => file.path);
  useLetGo(!phone && count > 0, () => choice.onChoose(every, false));
  const groups = spaces.length > 1 ? spaces.map((space) => ({ space, files: shown.filter((file) => file.space === space.id) })).filter((group) => group.files.length > 0) : [{ space: null, files: shown }];
  const allChosen = count === all.length && count > 0;
  const chips: { id: FileKind | 'all'; label: string }[] = [
    { id: 'all', label: t('files.all') },
    { id: 'image', label: t('files.images') },
    { id: 'audio', label: t('files.recordings') },
    { id: 'file', label: t('files.others') },
  ];
  const chipButtons = chips.map((chip) => (
    <button
      key={chip.id}
      type="button"
      role="tab"
      aria-selected={kind === chip.id}
      className={phone ? `mb-view${kind === chip.id ? ' on' : ''}` : kind === chip.id ? 'on' : ''}
      onClick={() => setKind(chip.id)}
    >
      {chip.label}
      {!phone && <small>{counts[chip.id]}</small>}
    </button>
  ));
  const kinds = phone ? (
    <div className="mb-views">
      <div className="ch" role="tablist">
        {chipButtons}
      </div>
      <button type="button" className="opt" title={t('files.sort')} aria-label={t('files.sort')} onClick={() => actions.chooseSort(sort, setSort)}>
        <Icon name="sort" />
      </button>
    </div>
  ) : (
    <div className="fv-kinds" role="tablist">
      {chipButtons}
    </div>
  );
  const search = (
    <label className={phone ? 'mb-searchbar' : 'search'}>
      <Icon name="search" />
      <input type="search" enterKeyHint="search" placeholder={t('files.search')} aria-label={t('files.search')} value={query} onChange={(event) => setQuery(event.target.value)} />
    </label>
  );
  const summary = files === null ? '' : `${t('count.files', { count: all.length })} · ${total(all)}`;
  const empty =
    files !== null && all.length === 0 ? (
      phone ? (
        <Empty icon="clip" title={t('files.empty')} text={t('files.emptyText')} />
      ) : (
        <p className="task-empty">
          <b>{t('files.empty')}</b> {t('files.emptyText')}
        </p>
      )
    ) : files !== null && shown.length === 0 ? (
      <p className="task-empty">{t('files.noMatch')}</p>
    ) : null;
  const heading = (space: TrashSpace, list: FileRow[]) => (
    <div className={phone ? 'mb-sec' : 'sec spc'}>
      {choosing && !phone && (
        <ChooseBox
          state={groupState(
            list.map((file) => file.path),
            chosen,
          )}
          label={t('choose.group', { name: space.name })}
          onChange={(on) =>
            choice.onChoose(
              list.map((file) => file.path),
              on,
            )
          }
        />
      )}
      {!phone && <Icon name="space" />}
      {space.name}
      {phone ? <span className="sum">{total(list)}</span> : <small>{`${list.length} · ${total(list)}`}</small>}
    </div>
  );

  if (phone) {
    return (
      <section className="mb-files">
        <header className="mb-head">
          <h1>{t('files.title')}</h1>
          {summary && <small>{summary}</small>}
        </header>
        {all.length > 0 && search}
        {all.length > 0 && kinds}
        {empty}
        {groups.map(({ space, files: list }) => (
          <div key={space?.id ?? ''}>
            {space && heading(space, list)}
            {list.map((file) => (
              <PhoneFileRow
                key={file.path}
                file={file}
                chosen={chosen.has(file.path)}
                choosing={choosing}
                going={downloads[file.path]}
                actions={actions}
                onChoose={(on) => choice.onChoose([file.path], on)}
              />
            ))}
          </div>
        ))}
      </section>
    );
  }

  const header = (key: FileSort['key'], label: string, right = false) => {
    const on = sort.key === key;
    return (
      <button
        type="button"
        className={`${right ? 'r ' : ''}${on ? 'sorted' : ''}`}
        onClick={() => setSort(on ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' })}
      >
        {label}
        {on && (sort.dir === 'asc' ? ' ↑' : ' ↓')}
      </button>
    );
  };
  const chosenFiles = all.filter((file) => chosen.has(file.path));
  return (
    <section className="tasks files-view">
      {count > 0 ? (
        <header className="th chosen-bar">
          <button type="button" className="let-go" title={t('choose.letGo')} aria-label={t('choose.letGo')} onClick={() => choice.onChoose(every, false)}>
            <Icon name="close" />
          </button>
          <b>{t('choose.selected', { count })}</b>
          <span className="count">{total(chosenFiles)}</span>
          <button type="button" className="ghost" onClick={() => choice.onChoose(every, !allChosen)}>
            {allChosen ? t('choose.deselectAll') : t('choose.selectAll')}
          </button>
          <button type="button" className="ghost danger" onClick={choice.onDelete}>
            <Icon name="trash" />
            {t('menu.delete')}
          </button>
        </header>
      ) : (
        <header className="th">
          <b>{t('files.title')}</b>
          {summary && <span>{summary}</span>}
          {search}
        </header>
      )}
      {all.length > 0 && kinds}
      <div className={`tl${choosing ? ' choosing' : ''}`}>
        {all.length > 0 && (
          <div className="flhead">
            <span />
            <span />
            {header('name', t('files.name'))}
            <span className="uh">{t('files.usedIn')}</span>
            {header('size', t('files.size'), true)}
            {header('added', t('files.added'), true)}
            <span />
          </div>
        )}
        {groups.map(({ space, files: list }) => (
          <div key={space?.id ?? ''}>
            {space && heading(space, list)}
            {list.map((file) => (
              <FileLine
                key={file.path}
                file={file}
                today={today}
                chosen={chosen.has(file.path)}
                choosing={choosing}
                going={downloads[file.path]}
                actions={actions}
                onChoose={(on) => choice.onChoose([file.path], on)}
              />
            ))}
          </div>
        ))}
        {empty}
        {all.length > 0 && !choosing && <p className="trash-note">{t('files.note')}</p>}
      </div>
    </section>
  );
}
