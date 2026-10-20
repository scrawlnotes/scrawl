import {
  type Board,
  childrenOf,
  dayOf,
  type Collection,
  columnCards,
  isComputed,
  keyOf,
  type Piece,
  sectionTasks,
  type Task,
  type TaskList,
  type Trashed,
  type TrashedEntry,
  type TrashItem,
  valueText,
} from '@scrawlnotes/core';
import { createViewer, sizeText } from '@scrawlnotes/editor';
import { t } from '@scrawlnotes/i18n';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from './dialogs';
import { Icon, type IconName } from './Icon';
import { placeLabel } from './items';
import { pieceHome } from './Trash';
import { clockTime, pastDayLabel } from './text';
import { dueLabel } from './Tasks';

// A deleted item looked at in the trash, before it is put back, after the Trash preview view: what
// it holds as it reads, read only, with Restore and Delete forever. On a computer a window in the
// middle; on a phone a page.

export interface TrashPreviewProps {
  item: TrashItem;
  today: string;
  /** What the item holds, read in the trash. */
  read: (item: TrashItem) => Promise<Trashed>;
  /** An image of a deleted note, by the place the note was. */
  resolveImage: (home: string, src: string) => string | Promise<string>;
  onRestore: () => void;
  onDelete: () => void;
}

const ENTRY_ICONS: Record<TrashedEntry['kind'], IconName> = { folder: 'folder', note: 'note', tasks: 'tasks', board: 'board', keys: 'keys', collection: 'collection', file: 'file' };

/** When it was deleted and where from, as the window's line under its name says it. */
function deletedWords(item: TrashItem, today: string): string {
  const day = dayOf(new Date(item.deleted));
  const when = `${pastDayLabel(day, today)}, ${clockTime(item.deleted)}`;
  return item.kind === 'attachment' ? t('trash.deletedAt', { when }) : t('trash.deletedFrom', { when, place: pieceHome(item) || placeLabel(item.from) || t('trash.topLevel') });
}

/** A note as it reads in the editor. */
function NoteBody({ text, home, resolveImage }: { text: string; home: string; resolveImage: TrashPreviewProps['resolveImage'] }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewer = createViewer({ parent: host.current!, doc: text, resolveImage: (src) => resolveImage(home, src) });
    return () => viewer.destroy();
  }, [text, home, resolveImage]);
  return <div ref={host} className="tp-note" />;
}

/** A list's tasks, those in no section first, then each section's, subtasks a step in. */
function TasksBody({ list, today }: { list: TaskList; today: string }) {
  const row = (task: Task, depth: number): ReactNode => (
    <div key={task.id}>
      <div className={task.done ? 'tp-task done' : 'tp-task'} style={{ paddingLeft: depth * 24 }}>
        <span className={`cb p${task.priority}`} aria-hidden="true" />
        <span className="tx">{task.title}</span>
        {task.due && <small>{dueLabel(task.due, today)}</small>}
      </div>
      {childrenOf(list.tasks, task.id).map((child) => row(child, depth + 1))}
    </div>
  );
  if (list.tasks.length === 0) return <p className="tp-none">{t('trash.previewEmpty')}</p>;
  return (
    <div className="tp-list">
      {sectionTasks(list, null).map((task) => row(task, 0))}
      {list.sections.map((section) => (
        <div key={section.id}>
          <div className="tp-head">
            {section.name} <small>{sectionTasks(list, section.id).length}</small>
          </div>
          {sectionTasks(list, section.id).map((task) => row(task, 0))}
        </div>
      ))}
    </div>
  );
}

/** A board's cards under the columns they are in. */
function BoardBody({ board }: { board: Board }) {
  if (board.cards.length === 0) return <p className="tp-none">{t('trash.previewEmpty')}</p>;
  return (
    <div className="tp-list">
      {board.columns.map((column) => {
        const cards = columnCards(board, column.id);
        return (
          cards.length > 0 && (
            <div key={column.id}>
              <div className="tp-head">
                {column.name} <small>{cards.length}</small>
              </div>
              {cards.map((card) => (
                <div key={card.id} className="tp-task">
                  <span className="key">{keyOf(board, card)}</span>
                  <span className="tx">{card.title}</span>
                </div>
              ))}
            </div>
          )
        );
      })}
    </div>
  );
}

/**
 * A task with its subtasks or a section with its tasks, as the list showed them; a card with its
 * column, description, subtasks and comments, as its panel does.
 */
function PieceBody({ piece, home, today, resolveImage }: { piece: Piece | null; home: string; today: string; resolveImage: TrashPreviewProps['resolveImage'] }) {
  if (!piece) return <p className="tp-none">{t('trash.cannotRead')}</p>;
  if (piece.kind === 'task') {
    const [top, ...under] = piece.tasks;
    const { section: _section, ...bare } = top!;
    return <TasksBody list={{ sections: [], tasks: [{ ...bare, parent: null }, ...under] }} today={today} />;
  }
  if (piece.kind === 'section') return <TasksBody list={{ sections: [piece.section], tasks: piece.tasks }} today={today} />;
  const { card } = piece;
  const comments = card.timeline.flatMap((entry) => (entry.kind === 'comment' ? [entry] : []));
  return (
    <div className="tp-list">
      <div className="tp-task">
        <span className="key">{piece.prefix ? `${piece.prefix}-${card.key}` : card.key}</span>
        <span className="tx">{t('card.status')}: {piece.column.name}</span>
        {card.due && <small>{dueLabel(card.due, today)}</small>}
      </div>
      {card.description?.trim() && (
        <>
          <div className="tp-head">{t('card.description')}</div>
          <NoteBody text={card.description} home={home} resolveImage={resolveImage} />
        </>
      )}
      {!!card.subtasks?.length && (
        <>
          <div className="tp-head">
            {t('subtasks.title')} <small>{card.subtasks.length}</small>
          </div>
          {card.subtasks.map((subtask) => (
            <div key={subtask.id} className={subtask.done ? 'tp-task done' : 'tp-task'}>
              <span className={`cb p${subtask.priority}`} aria-hidden="true" />
              <span className="tx">{subtask.title}</span>
              {subtask.due && <small>{dueLabel(subtask.due, today)}</small>}
            </div>
          ))}
        </>
      )}
      {comments.length > 0 && (
        <>
          <div className="tp-head">
            {t('card.timeline')} <small>{comments.length}</small>
          </div>
          {comments.map((entry) => (
            <div key={entry.id} className="tp-task">
              <span className="tx">{entry.text}</span>
              <small>{[entry.by, pastDayLabel(dayOf(new Date(entry.at)), today)].filter(Boolean).join(' · ')}</small>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/** A collection's records as a table: their name and code, then a few of their fields. */
function CollectionBody({ collection }: { collection: Collection }) {
  const fields = collection.schema.fields.filter((f) => !isComputed(f.type)).slice(0, 4);
  const records = [...collection.records].sort((a, b) => (a.name || a.code).localeCompare(b.name || b.code));
  if (records.length === 0) return <p className="tp-none">{t('trash.previewEmpty')}</p>;
  return (
    <div className="tp-table">
      <table>
        <thead>
          <tr>
            {fields.map((field) => (
              <th key={field.key}>{field.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id || record.path}>
              {fields.map((field) => (
                <td key={field.key}>{valueText(record.values[field.key] ?? null)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** An attached file: an image or a recording as itself; another file by its name and size. */
function AttachmentBody({ item, blob }: { item: TrashItem; blob: Blob | null }) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  if (url && blob?.type.startsWith('audio/')) return <audio className="tp-audio" controls src={url} />;
  if (url && /\.(webm|ogg|oga|opus|mp3|m4a|aac|wav|flac)$/i.test(item.title)) return <audio className="tp-audio" controls src={url} />;
  if (url) return <img className="tp-image" src={url} alt={item.title} />;
  return (
    <p className="tp-none">
      {item.title}
      {item.size !== undefined && ` · ${sizeText(item.size)}`}
      <br />
      {t(item.away ? 'trash.fileAway' : 'trash.fileNotShown')}
    </p>
  );
}

/** What a deleted item holds, by its kind. */
export function TrashContent({ item, today, read, resolveImage }: Omit<TrashPreviewProps, 'onRestore' | 'onDelete'>) {
  const [content, setContent] = useState<Trashed | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let stale = false;
    setContent(null);
    setFailed(false);
    read(item).then(
      (found) => !stale && setContent(found),
      () => !stale && setFailed(true),
    );
    return () => {
      stale = true;
    };
  }, [item, read]);
  if (failed) return <p className="tp-none">{t('trash.cannotRead')}</p>;
  if (!content) return <p className="tp-none">{t('trash.reading')}</p>;
  switch (content.kind) {
    case 'note':
      return content.text.trim() ? <NoteBody text={content.text} home={item.from} resolveImage={resolveImage} /> : <p className="tp-none">{t('trash.previewEmpty')}</p>;
    case 'tasks':
      return <TasksBody list={content.list} today={today} />;
    case 'board':
      return <BoardBody board={content.board} />;
    case 'collection':
      return <CollectionBody collection={content.collection} />;
    case 'keys':
      return (
        <div className="tp-list">
          {content.groups.map((group, i) => (
            <div key={i}>
              <div className="tp-head">{group.name ?? t('keys.noGroup')}</div>
              {group.keys.map((key, j) => (
                <div key={j} className="tp-task">
                  <span className="tx mono">{key}</span>
                  <span className="hid">••••••</span>
                </div>
              ))}
            </div>
          ))}
          <p className="tp-note-line">{t('trash.valuesHidden')}</p>
        </div>
      );
    case 'folder':
      return content.entries.length === 0 ? (
        <p className="tp-none">{t('trash.emptyFolder')}</p>
      ) : (
        <div className="tp-list">
          {content.entries.map((entry, i) => (
            <div key={i} className="tp-task" style={{ paddingLeft: entry.depth * 22 }}>
              <Icon name={ENTRY_ICONS[entry.kind]} />
              <span className="tx">{entry.name}</span>
            </div>
          ))}
        </div>
      );
    case 'attachment':
      return <AttachmentBody item={item} blob={content.blob} />;
    case 'piece':
      return <PieceBody piece={content.piece} home={item.from} today={today} resolveImage={resolveImage} />;
  }
}

/** On a computer: the window over the trash. */
export function TrashPreviewDialog(props: TrashPreviewProps & { onClose: () => void }) {
  const { item, today, onRestore, onDelete, onClose } = props;
  return (
    <Dialog label={item.title} className="trash-preview" onClose={onClose}>
      <h2>{item.title}</h2>
      <p className="tp-meta">{deletedWords(item, today)}</p>
      <div className="tp-body">
        <TrashContent {...props} />
      </div>
      <div className="dialog-actions">
        <button type="button" className="danger" onClick={onDelete}>
          {t('delete.forever')}
        </button>
        <button type="button" className="primary" onClick={onRestore}>
          {t('trash.restore')}
        </button>
      </div>
    </Dialog>
  );
}

/** On a phone: the page of a deleted item, its Restore and Delete forever at its foot. */
export function TrashPreviewPage(props: TrashPreviewProps) {
  const { item, today, onRestore, onDelete } = props;
  return (
    <div className="mb-trash-item">
      <p className="tp-meta">{deletedWords(item, today)}</p>
      <div className="tp-body">
        <TrashContent {...props} />
      </div>
      <div className="mb-foot">
        <button type="button" className="mb-btn ghost danger" onClick={onDelete}>
          {t('delete.forever')}
        </button>
        <button type="button" className="mb-btn" onClick={onRestore}>
          {t('trash.restore')}
        </button>
      </div>
    </div>
  );
}
