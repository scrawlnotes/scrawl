import {
  type Board,
  boardName,
  cardValue,
  type Collection,
  collectionName,
  dirname,
  type Findable,
  fold,
  type FindKind,
  type Found,
  INBOX,
  INBOX_TASKS,
  keysName,
  listName,
  localPath,
  nameMatch,
  recordTitle,
  search,
  searchIndex,
  type Span,
  spaceOf,
  type Task,
  type TaskFilter,
  type TreeNode,
  valueText,
} from '@scrawlnotes/core';
import { sizeText } from '@scrawlnotes/editor';
import { type MessageKey, t } from '@scrawlnotes/i18n';
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { fileTitle, kindOf } from './Files';
import { Icon, type IconName } from './Icon';
import { boardOf, collectionTab, filterTab, keysOf, listHeading, spaceLabel, tasksOf } from './items';
import type { FileRow, SpaceView } from './session';
import { dueLabel } from './Tasks';

// Searching everywhere, after the Search views of design/mockups.html (PLAN 4.2): one window that
// finds anything by its name or its text and opens it. The results are one list, the best match
// first; each says what it is and where, and a thing found by its text shows the line. On a
// computer it opens from Search at the top of the sidebar; on a phone it is the Search tab.

/** How something found is opened. */
export type Target =
  | { kind: 'note'; path: string }
  | { kind: 'task'; list: string; id: string; subtask: boolean }
  | { kind: 'card'; board: string; id: string }
  | { kind: 'record'; dir: string; id: string }
  | { kind: 'file'; file: FileRow }
  | { kind: 'tab'; id: string }
  | { kind: 'folder'; path: string }
  | { kind: 'space'; id: string | null };

/** Something the search finds, with what its row shows. */
export interface Thing extends Findable {
  target: Target;
  icon: IconName;
  /** Where it is: its space and folders, its list and day, its board and column. */
  where: string;
  /** A task's priority, for its circle. */
  priority?: number;
}

/** What is searched: everything the app has read, the notes' texts and the attached files. */
export interface SearchData {
  tree: TreeNode[];
  spaces: SpaceView[];
  titles: Record<string, string>;
  tasks: Record<string, Task[]>;
  boards: Record<string, Board>;
  collections: Record<string, Collection>;
  filters: TaskFilter[];
  texts: Map<string, string>;
  files: FileRow[];
  today: string;
}

/** The fields whose values are read as text: not numbers, days, boxes or what is worked out. */
const UNREAD = new Set(['number', 'date', 'checkbox', 'formula', 'name', 'code']);

/** Where a path is: its space, when there are spaces, and its folders: `Acme › Sales`. */
function trailOf(path: string, named: boolean): string {
  const space = spaceOf(path);
  const folders = dirname(localPath(path))
    .split('/')
    .filter(Boolean)
    .map((folder, index) => (index === 0 && folder === INBOX ? t('side.inbox') : folder));
  const head = space ? spaceLabel(space) : named ? spaceLabel(null) : null;
  return [head, ...folders].filter(Boolean).join(' › ');
}

const joined = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' · ');

/** Everything to be found, from what the app has read. */
export function thingsOf(data: SearchData): Thing[] {
  const named = data.spaces.length > 0;
  const things: Thing[] = [];
  const visit = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      const where = trailOf(node.path, named);
      const name = data.titles[node.path] ?? node.title ?? node.name;
      if (node.kind === 'note') things.push({ kind: 'note', name, text: data.texts.get(node.path) ?? '', target: { kind: 'note', path: node.path }, icon: 'note', where });
      else if (node.kind === 'tasks') things.push({ kind: 'tasks', name, target: { kind: 'tab', id: tasksOf(node.path) }, icon: 'tasks', where });
      else if (node.kind === 'board') things.push({ kind: 'board', name, target: { kind: 'tab', id: boardOf(node.path) }, icon: 'board', where });
      else if (node.kind === 'keys') things.push({ kind: 'keys', name: keysName(node.path), target: { kind: 'tab', id: keysOf(node.path) }, icon: 'keys', where });
      else if (node.kind === 'collection') things.push({ kind: 'collection', name: collectionName(node.path), target: { kind: 'tab', id: collectionTab(node.path) }, icon: 'collection', where });
      else if (node.kind === 'folder') {
        if (node.path !== INBOX) things.push({ kind: 'folder', name: node.name, target: { kind: 'folder', path: node.path }, icon: 'folder', where });
        visit(node.children ?? []);
      }
    }
  };
  visit(data.tree);
  for (const space of data.spaces) {
    things.push({ kind: 'space', name: space.name, target: { kind: 'space', id: space.id }, icon: 'space', where: '' });
    visit(space.tree);
  }
  for (const [list, tasks] of Object.entries(data.tasks)) {
    const heading = list === INBOX_TASKS ? t('side.inbox') : listHeading(list);
    for (const task of tasks) {
      things.push({
        kind: 'task',
        name: task.title,
        text: task.description ?? '',
        done: task.done,
        target: { kind: 'task', list, id: task.id, subtask: task.parent !== null },
        icon: 'tasks',
        where: joined(heading, task.due && !task.done && dueLabel(task.due, data.today)),
        priority: task.priority,
      });
    }
  }
  for (const [path, board] of Object.entries(data.boards)) {
    const columns = new Map(board.columns.map((column) => [column.id, column]));
    for (const card of board.cards) {
      const column = columns.get(card.column);
      const fields = (board.fields ?? [])
        .filter((field) => !UNREAD.has(field.type))
        .map((field): [string, string] => [field.label, valueText(cardValue(board, card, field))])
        .filter(([, value]) => value !== '');
      if (card.labels?.length) fields.push([t('card.labels'), card.labels.join(', ')]);
      const comments = card.timeline.flatMap((entry) => (entry.kind === 'comment' ? [entry.text] : []));
      things.push({
        kind: 'card',
        name: card.title,
        key: `${board.prefix}-${card.key}`,
        text: [card.description ?? '', ...comments].filter(Boolean).join('\n'),
        fields,
        done: column?.kind === 'done' || column?.kind === 'dropped',
        target: { kind: 'card', board: path, id: card.id },
        icon: 'board',
        where: joined(boardName(path), column?.name),
      });
    }
  }
  for (const [dir, collection] of Object.entries(data.collections)) {
    const where = joined(collectionName(dir), trailOf(dir, named));
    for (const record of collection.records) {
      const fields = collection.schema.fields
        .filter((field) => !UNREAD.has(field.type))
        .map((field): [string, string] => [field.label, valueText(record.values[field.key])])
        .filter(([, value]) => value !== '');
      things.push({
        kind: 'record',
        name: recordTitle(record),
        key: record.name ? record.code : '',
        text: record.body,
        fields,
        target: { kind: 'record', dir, id: record.id },
        icon: 'collection',
        where,
      });
    }
  }
  for (const filter of data.filters) {
    things.push({ kind: 'filter', name: filter.name, target: { kind: 'tab', id: filterTab(filter.id) }, icon: 'filter', where: filter.folder ? trailOf(`${filter.folder}/x`, named) : t('side.inbox') });
  }
  for (const file of data.files) {
    const use = file.uses.find((each) => !each.inTrash);
    const kind = kindOf(file);
    things.push({
      kind: 'file',
      name: fileTitle(file),
      target: { kind: 'file', file },
      icon: kind === 'audio' ? 'audio' : kind,
      where: joined(use && t('search.in', { name: use.card ? `${use.title} ${use.card.title}` : use.title }), sizeText(file.size)),
    });
  }
  return things;
}

/** The most rows the list shows; more words find fewer. */
const SHOWN = 50;

// The searches made last on this device: what was typed when something found was opened, the
// latest first, each once. They stay on this device, as Recent does on a phone.
const RECENT = 'scrawl.recentSearches';
/** How many searches are kept. */
const KEPT = 10;

function loadRecent(): string[] {
  try {
    const kept = JSON.parse(localStorage.getItem(RECENT) ?? '[]') as unknown;
    return Array.isArray(kept) ? kept.filter((each): each is string => typeof each === 'string').slice(0, KEPT) : [];
  } catch {
    return [];
  }
}

function saveRecent(searches: string[]) {
  try {
    if (searches.length === 0) localStorage.removeItem(RECENT);
    else localStorage.setItem(RECENT, JSON.stringify(searches));
  } catch {
    // Not kept: they hold while the app is open.
  }
}

/** The searches made last, with a search added on top, one taken away, and all of them forgotten. */
function useRecentSearches() {
  const [searches, setSearches] = useState(loadRecent);
  const latest = useRef(searches);
  // Kept at once: the window closes as something found opens, before it would be drawn again.
  const change = (next: (current: string[]) => string[]) => {
    const changed = next(latest.current);
    latest.current = changed;
    saveRecent(changed);
    setSearches(changed);
  };
  return {
    searches,
    /** The same search typed again, whatever its case or accents, moves to the top. */
    add: (query: string) => {
      const search = query.trim();
      if (search) change((current) => [search, ...current.filter((each) => fold(each) !== fold(search))].slice(0, KEPT));
    },
    remove: (search: string) => change((current) => current.filter((each) => each !== search)),
    clear: () => change(() => []),
  };
}

/** What was typed, searched; the same words searched again as more is typed. */
export function useSearch(things: Thing[] | null, query: string): Found<Thing>[] {
  const index = useMemo(() => (things ? searchIndex(things) : null), [things]);
  return useMemo(() => (index ? search(index, query) : []), [index, query]);
}

/** A string with the words found in it marked. */
export function Marked({ text, spans }: { text: string; spans: Span[] }) {
  if (spans.length === 0) return <>{text}</>;
  const parts: ReactNode[] = [];
  let at = 0;
  spans.forEach(([from, to], index) => {
    if (from > at) parts.push(text.slice(at, from));
    parts.push(<mark key={index}>{text.slice(from, to)}</mark>);
    at = to;
  });
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

/** What each kind of thing is called at the end of its row. */
const KIND_WORDS: Record<FindKind, MessageKey> = {
  note: 'search.kind.note',
  task: 'search.kind.task',
  card: 'search.kind.card',
  record: 'search.kind.record',
  file: 'search.kind.file',
  tasks: 'search.kind.tasks',
  board: 'search.kind.board',
  collection: 'search.kind.collection',
  keys: 'search.kind.keys',
  filter: 'search.kind.filter',
  folder: 'search.kind.folder',
  space: 'search.kind.space',
};
const kindWord = (thing: Thing) => t(KIND_WORDS[thing.kind]);

/** A task's circle, as its list draws it; or the icon of what was found. */
function Lead({ thing }: { thing: Thing }) {
  if (thing.kind === 'task') return <span className={`cb p${thing.priority ?? 4}${thing.done ? ' done' : ''}`} aria-hidden="true" />;
  return <Icon name={thing.icon} />;
}

/** A card's key before its name, a record's code; then the name, the words found marked. */
function Name({ found }: { found: Found<Thing> }) {
  const { item } = found;
  return (
    <>
      {item.key && item.kind === 'card' && (
        <span className="key">
          <Marked text={item.key} spans={found.inKey} />
        </span>
      )}
      <span className={item.done ? 'nm done' : 'nm'}>
        <Marked text={item.name} spans={found.inName} />
      </span>
    </>
  );
}

/** What the tabs over the list narrow it to: everything, or one kind. */
export type SearchTab = 'all' | 'note' | 'task' | 'card' | 'record' | 'file';
const TABS: { tab: SearchTab; label: MessageKey }[] = [
  { tab: 'all', label: 'search.all' },
  { tab: 'note', label: 'search.notes' },
  { tab: 'task', label: 'search.tasks' },
  { tab: 'card', label: 'search.cards' },
  { tab: 'record', label: 'search.records' },
  { tab: 'file', label: 'search.files' },
];
const inTab = (tab: SearchTab) => (found: Found<Thing>) => tab === 'all' || found.item.kind === tab;

/** Something the app does, offered at the foot of the list: Create, New note, Settings, Sync now. */
export interface SearchAction {
  id: string;
  label: string;
  icon: IconName;
  /** Offered with the box empty too, under the searches made last. */
  first?: boolean;
  run: () => void;
}

/** The actions whose names have the words typed, with where; with nothing typed, the ones offered first. */
function actionsFor(actions: SearchAction[], query: string): { action: SearchAction; marks: Span[] }[] {
  if (query.trim() === '') return actions.filter((action) => action.first).map((action) => ({ action, marks: [] }));
  return actions.flatMap((action) => {
    const marks = nameMatch(action.label, query);
    return marks ? [{ action, marks }] : [];
  });
}

/** The tabs over the list; a click on one, or the arrow keys at an end of what is typed, choose it. */
function Tabs({ tab, onTab, className }: { tab: SearchTab; onTab: (tab: SearchTab) => void; className: string }) {
  return (
    <div className={className} role="tablist" aria-label={t('search.title')}>
      {TABS.map((each) => (
        <button
          key={each.tab}
          type="button"
          role="tab"
          aria-selected={each.tab === tab}
          tabIndex={-1}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onTab(each.tab)}
        >
          {t(each.label)}
        </button>
      ))}
    </div>
  );
}

type Row = { kind: 'found'; found: Found<Thing> } | { kind: 'past'; search: string } | { kind: 'action'; action: SearchAction; marks: Span[] };

/**
 * The search window on a computer, near the top of the app: the box, the tabs, and under them
 * what was found, or with nothing typed the searches made last; the actions at the foot. The
 * arrow keys move through it, and left and right at an end of what is typed change the tab; Enter
 * opens, Esc closes; a click opens too.
 */
export function SearchWindow({ things, actions, onPick, onClose }: {
  things: Thing[] | null;
  actions: SearchAction[];
  onPick: (found: Found<Thing>) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<SearchTab>('all');
  const [selected, setSelected] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const all = useSearch(things, query);
  const found = all.filter(inTab(tab));
  const shown = found.slice(0, SHOWN);
  const typed = query.trim() !== '';
  const recent = useRecentSearches();
  const offered = tab === 'all' ? actionsFor(actions, query) : [];
  // One list for the arrow keys: what was found or the searches made last, then the actions.
  const rows: Row[] = [
    ...(typed ? shown.map((each): Row => ({ kind: 'found', found: each })) : recent.searches.map((search): Row => ({ kind: 'past', search }))),
    ...offered.map(({ action, marks }): Row => ({ kind: 'action', action, marks })),
  ];
  useEffect(() => setSelected(0), [query, tab]);
  /** Opens what was found, and keeps what was typed among the searches made last. */
  const pick = (each: Found<Thing>) => {
    recent.add(query);
    onPick(each);
  };
  const searchAgain = (search: string) => {
    setQuery(search);
    input.current?.focus();
  };
  const act = (action: SearchAction) => {
    onClose();
    action.run();
  };
  const run = (row: Row) => (row.kind === 'found' ? pick(row.found) : row.kind === 'past' ? searchAgain(row.search) : act(row.action));
  // The keyboard stays in the box while the window is open: a note opened just before it would
  // otherwise take it back, and the arrow keys would move in the note.
  useEffect(() => {
    const keep = (event: FocusEvent) => {
      if (!(event.target instanceof Node) || !box.current?.contains(event.target)) input.current?.focus();
    };
    document.addEventListener('focusin', keep);
    return () => document.removeEventListener('focusin', keep);
  }, []);
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selected]);
  const step = (by: number) => setTab((current) => TABS[Math.min(TABS.length - 1, Math.max(0, TABS.findIndex((each) => each.tab === current) + by))]!.tab);
  const onKey = (event: KeyboardEvent) => {
    const field = input.current;
    const atStart = !field || (field.selectionStart === 0 && field.selectionEnd === 0);
    const atEnd = !field || (field.selectionStart === field.value.length && field.selectionEnd === field.value.length);
    if (event.key === 'Escape') onClose();
    else if (event.key === 'ArrowDown') setSelected((at) => Math.min(at + 1, rows.length - 1));
    else if (event.key === 'ArrowUp') setSelected((at) => Math.max(at - 1, 0));
    // An arrow that would not move in what is typed changes the tab instead.
    else if (event.key === 'ArrowLeft' && atStart && !event.shiftKey) step(-1);
    else if (event.key === 'ArrowRight' && atEnd && !event.shiftKey) step(1);
    else if (event.key === 'Enter' && rows[selected]) run(rows[selected]!);
    else return;
    event.preventDefault();
  };
  const actionRows = offered.map(({ action, marks }, index) => {
    const at = rows.length - offered.length + index;
    return (
      <button
        key={action.id}
        type="button"
        role="option"
        aria-selected={at === selected}
        className={at === selected ? 'sx-act on' : 'sx-act'}
        tabIndex={-1}
        onMouseMove={() => at !== selected && setSelected(at)}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => act(action)}
      >
        <Icon name={action.icon} />
        <span>
          <Marked text={action.label} spans={marks} />
        </span>
      </button>
    );
  });
  const actionsPart = offered.length > 0 && (
    <>
      <div className="sx-head">
        <span>{t('search.actions')}</span>
      </div>
      {actionRows}
    </>
  );
  return (
    <div className="backdrop sx-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={box} className="sx" role="dialog" aria-label={t('search.title')} onKeyDown={onKey}>
        <div className="sx-q">
          <Icon name="search" />
          <input
            ref={input}
            autoFocus
            role="combobox"
            aria-expanded={rows.length > 0}
            aria-controls="sx-list"
            aria-label={t('search.title')}
            placeholder={t('search.placeholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {typed && things && found.length > 0 && <span className="n">{t('search.results', { count: found.length })}</span>}
          <button type="button" className="x" title={t('dialog.close')} aria-label={t('dialog.close')} onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <Tabs tab={tab} onTab={setTab} className="sx-tabs" />
        {typed ? (
          !things ? (
            <p className="sx-none">{t('search.reading')}</p>
          ) : (
            <div ref={list} id="sx-list" className="sx-list" role="listbox" aria-label={t('search.title')}>
              {shown.length === 0 && <p className="sx-none in">{t('search.nothing', { query: query.trim() })}</p>}
              {shown.map((each, index) => (
                <button
                  key={index}
                  type="button"
                  role="option"
                  aria-selected={index === selected}
                  className={index === selected ? 'sx-r on' : 'sx-r'}
                  tabIndex={-1}
                  onMouseMove={() => index !== selected && setSelected(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(each)}
                >
                  <Lead thing={each.item} />
                  <span className="l1">
                    <Name found={each} />
                    {each.item.where && <span className="wh">{each.item.where}</span>}
                  </span>
                  <span className="kd">{kindWord(each.item)}</span>
                  {each.line && (
                    <span className="snip">
                      <Marked text={each.line.text} spans={each.line.marks} />
                    </span>
                  )}
                </button>
              ))}
              {found.length > SHOWN && <p className="sx-more">{t('search.narrow', { count: SHOWN })}</p>}
              {actionsPart}
            </div>
          )
        ) : (
          (recent.searches.length > 0 || offered.length > 0) && (
            <div ref={list} id="sx-list" className="sx-list" role="listbox" aria-label={t('search.recent')}>
              {recent.searches.length > 0 && (
                <div className="sx-head">
                  <span>{t('search.recent')}</span>
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={recent.clear}>
                    {t('search.clearRecent')}
                  </button>
                </div>
              )}
              {recent.searches.map((search, index) => (
                <div
                  key={search}
                  role="option"
                  aria-selected={index === selected}
                  className={index === selected ? 'sx-past on' : 'sx-past'}
                  onMouseMove={() => index !== selected && setSelected(index)}
                >
                  <button type="button" className="q" tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onClick={() => searchAgain(search)}>
                    <Icon name="clock" />
                    <span>{search}</span>
                  </button>
                  <button
                    type="button"
                    className="forget"
                    tabIndex={-1}
                    title={t('search.forget', { query: search })}
                    aria-label={t('search.forget', { query: search })}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => recent.remove(search)}
                  >
                    <Icon name="close" />
                  </button>
                </div>
              ))}
              {actionsPart}
            </div>
          )
        )}
      </div>
    </div>
  );
}

/**
 * The Search tab on a phone: the box under the title, the tabs under it, and what was found under
 * them, a row each with what it is and where under its name; with nothing typed the searches made
 * last. The actions come at the foot. Cancel takes back what was typed and the keyboard.
 */
export function PhoneSearch({ things, actions, query, onQuery, onPick }: {
  things: Thing[] | null;
  actions: SearchAction[];
  query: string;
  onQuery: (query: string) => void;
  onPick: (found: Found<Thing>) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [tab, setTab] = useState<SearchTab>('all');
  const all = useSearch(things, query);
  const found = all.filter(inTab(tab));
  const shown = found.slice(0, SHOWN);
  const typed = query.trim() !== '';
  const recent = useRecentSearches();
  const offered = tab === 'all' ? actionsFor(actions, query) : [];
  const pick = (each: Found<Thing>) => {
    recent.add(query);
    onPick(each);
  };
  const actionsPart = offered.length > 0 && (
    <>
      <div className="mb-sec">
        <span>{t('search.actions')}</span>
      </div>
      <div className="mb-sx-list">
        {offered.map(({ action, marks }) => (
          <button key={action.id} type="button" className="mb-sx-act" onClick={action.run}>
            <Icon name={action.icon} />
            <span>
              <Marked text={action.label} spans={marks} />
            </span>
          </button>
        ))}
      </div>
    </>
  );
  return (
    <div className="mb-sx">
      <form
        className={focused || query ? 'mb-sxbar on' : 'mb-sxbar'}
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          input.current?.blur();
        }}
      >
        <label className="mb-searchbar">
          <Icon name="search" />
          <input
            ref={input}
            type="search"
            enterKeyHint="search"
            aria-label={t('search.title')}
            placeholder={t('search.title')}
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
          {query && (
            <button type="button" className="clr" aria-label={t('search.clear')} onMouseDown={(event) => event.preventDefault()} onClick={() => onQuery('')}>
              <Icon name="close" />
            </button>
          )}
        </label>
        {(focused || query) && (
          <button
            type="button"
            className="cancel"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onQuery('');
              input.current?.blur();
            }}
          >
            {t('dialog.cancel')}
          </button>
        )}
      </form>
      <Tabs tab={tab} onTab={setTab} className="mb-views mb-sx-tabs" />
      {!typed ? (
        <>
          {recent.searches.length > 0 ? (
            <>
              <div className="mb-sec mb-sx-recent">
                <span>{t('search.recent')}</span>
                <button type="button" className="clear" onClick={recent.clear}>
                  {t('search.clearRecent')}
                </button>
              </div>
              <div className="mb-sx-list">
                {recent.searches.map((search) => (
                  <div key={search} className="mb-sx-past">
                    <button type="button" className="q" onClick={() => onQuery(search)}>
                      <Icon name="clock" />
                      <span>{search}</span>
                    </button>
                    <button type="button" className="forget" aria-label={t('search.forget', { query: search })} onClick={() => recent.remove(search)}>
                      <Icon name="close" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="mb-p say">{t('search.about')}</p>
          )}
          {actionsPart}
        </>
      ) : !things ? (
        <p className="mb-p say">{t('search.reading')}</p>
      ) : (
        <>
          {shown.length === 0 && <p className="mb-p say">{t('search.nothing', { query: query.trim() })}</p>}
          {shown.length > 0 && (
            <div className="mb-sx-list">
              {shown.map((each, index) => (
                <button key={index} type="button" className="mb-sxr" onClick={() => pick(each)}>
                  <Lead thing={each.item} />
                  <span className="tx">
                    <b>
                      <Name found={each} />
                    </b>
                    <small>{joined(kindWord(each.item), each.item.where)}</small>
                    {each.line && (
                      <small className="snip">
                        <Marked text={each.line.text} spans={each.line.marks} />
                      </small>
                    )}
                  </span>
                </button>
              ))}
              {found.length > SHOWN && <p className="mb-p">{t('search.narrow', { count: SHOWN })}</p>}
            </div>
          )}
          {actionsPart}
        </>
      )}
    </div>
  );
}
