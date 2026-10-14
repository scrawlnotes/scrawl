import {
  type Board,
  boardName,
  cardValue,
  type Collection,
  collectionName,
  dirname,
  type Findable,
  type FindKind,
  type Found,
  INBOX,
  INBOX_TASKS,
  keysName,
  listName,
  localPath,
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
        .map((field) => [field.label, valueText(cardValue(board, card, field))] as const)
        .filter(([, value]) => value !== '')
        .map(([label, value]) => `${label}: ${value}`);
      const comments = card.timeline.flatMap((entry) => (entry.kind === 'comment' ? [entry.text] : []));
      things.push({
        kind: 'card',
        name: card.title,
        key: `${board.prefix}-${card.key}`,
        text: [card.description ?? '', ...comments, ...fields, ...(card.labels ?? [])].filter(Boolean).join('\n'),
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
        .map((field) => [field.label, valueText(record.values[field.key])] as const)
        .filter(([, value]) => value !== '')
        .map(([label, value]) => `${label}: ${value}`);
      things.push({
        kind: 'record',
        name: recordTitle(record),
        key: record.name ? record.code : '',
        text: [...fields, record.body].filter(Boolean).join('\n'),
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

/**
 * The search window on a computer, near the top of the app: the box alone until something is
 * typed, then what was found under it. The arrow keys move through it, Enter opens, Esc closes;
 * a click opens too.
 */
export function SearchWindow({ things, onPick, onClose }: { things: Thing[] | null; onPick: (found: Found<Thing>) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const found = useSearch(things, query);
  const shown = found.slice(0, SHOWN);
  const typed = query.trim() !== '';
  useEffect(() => setSelected(0), [query]);
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
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') onClose();
    else if (event.key === 'ArrowDown') setSelected((at) => Math.min(at + 1, shown.length - 1));
    else if (event.key === 'ArrowUp') setSelected((at) => Math.max(at - 1, 0));
    else if (event.key === 'Enter' && shown[selected]) onPick(shown[selected]!);
    else return;
    event.preventDefault();
  };
  return (
    <div className="backdrop sx-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={box} className="sx" role="dialog" aria-label={t('search.title')} onKeyDown={onKey}>
        <div className="sx-q">
          <Icon name="search" />
          <input
            ref={input}
            autoFocus
            role="combobox"
            aria-expanded={typed}
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
        {typed &&
          (!things ? (
            <p className="sx-none">{t('search.reading')}</p>
          ) : shown.length === 0 ? (
            <p className="sx-none">{t('search.nothing', { query: query.trim() })}</p>
          ) : (
            <div ref={list} id="sx-list" className="sx-list" role="listbox" aria-label={t('search.title')}>
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
                  onClick={() => onPick(each)}
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
            </div>
          ))}
      </div>
    </div>
  );
}

/**
 * The Search tab on a phone: the box under the title, and what was found under it, a row each
 * with what it is and where under its name. Cancel takes back what was typed and the keyboard.
 */
export function PhoneSearch({ things, query, onQuery, onPick }: {
  things: Thing[] | null;
  query: string;
  onQuery: (query: string) => void;
  onPick: (found: Found<Thing>) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const found = useSearch(things, query);
  const shown = found.slice(0, SHOWN);
  const typed = query.trim() !== '';
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
      {!typed ? (
        <p className="mb-p say">{t('search.about')}</p>
      ) : !things ? (
        <p className="mb-p say">{t('search.reading')}</p>
      ) : shown.length === 0 ? (
        <p className="mb-p say">{t('search.nothing', { query: query.trim() })}</p>
      ) : (
        <div className="mb-sx-list">
          {shown.map((each, index) => (
            <button key={index} type="button" className="mb-sxr" onClick={() => onPick(each)}>
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
    </div>
  );
}
