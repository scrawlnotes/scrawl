import { addDays, dayOf, spaceOf, type TrashItem } from '@scrawlnotes/core';
import { type ReactNode, useState } from 'react';
import { sizeText } from '@scrawlnotes/editor';
import { t } from '@scrawlnotes/i18n';
import { ChooseBox, groupState, useLetGo } from './choose';
import { placeLabel, trailOf } from './items';
import { isPhone } from './device';
import { Icon, type IconName } from './Icon';
import { Empty } from './sheets';
import { clockTime, contentsText, pastDayLabel } from './text';

const ICONS: Record<Exclude<TrashItem['kind'], 'attachment'>, IconName> = { note: 'note', tasks: 'tasks', board: 'board', keys: 'keys', collection: 'collection', folder: 'folder' };
const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i;
const AUDIO = /\.(webm|ogg|oga|opus|mp3|m4a|aac|wav|flac)$/i;

const iconOf = (item: TrashItem): IconName =>
  item.kind !== 'attachment' ? ICONS[item.kind] : IMAGE.test(item.title) ? 'image' : AUDIO.test(item.title) ? 'audio' : 'file';

/** A space whose deleted items are a group of the trash; `id` null is the personal space. */
export interface TrashSpace {
  id: string | null;
  name: string;
}

/**
 * The items of the trash chosen together, by path, and what is done with them. On a computer
 * rows are chosen while any is; on a phone while Select is on.
 */
export interface TrashChoice {
  chosen: ReadonlySet<string>;
  /** A phone's Select is on: a tap on a row chooses it. */
  choosing: boolean;
  onChoose: (paths: string[], on: boolean) => void;
  onRestore: () => void;
  onDelete: () => void;
}

/**
 * When an item was deleted, under a space's heading where no day heads the rows: the day, and
 * the time when it was today or yesterday: `Today, 11:35`, `Oct 1`.
 */
function whenOf(item: TrashItem, today: string): string {
  const day = dayOf(new Date(item.deleted));
  const label = pastDayLabel(day, today);
  return day >= addDays(today, -1) ? `${label}, ${clockTime(item.deleted)}` : label;
}

/**
 * A row of the trash. Under a day's heading it tells the folder with its space and the time; under
 * a space's heading the folder in the space and when. Its box at the left chooses it; while rows
 * are chosen, a click anywhere on it does.
 */
function TrashRow({ item, today, bySpace, chosen, choosing, onChoose, onOpen, onRestore, onDelete }: {
  item: TrashItem;
  today: string;
  bySpace: boolean;
  chosen: boolean;
  /** Rows are being chosen: each shows its box, and a click on one chooses it. */
  choosing: boolean;
  onChoose: (on: boolean) => void;
  /** Shows what it holds, before it is put back. */
  onOpen?: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  // An attached file goes back to the attachments, which is no place to name.
  const file = item.kind === 'attachment';
  const place = file ? '' : bySpace ? trailOf(item.from) : placeLabel(item.from);
  const meta = [
    place,
    file && t('trash.unused'),
    item.size !== undefined && sizeText(item.size),
    item.holds && (contentsText(item.holds) || t('trash.emptyFolder')),
    item.tasks !== undefined && item.tasks > 0 && t('count.tasks', { count: item.tasks }),
    item.cards !== undefined && item.cards > 0 && t('count.cards', { count: item.cards }),
    item.keys !== undefined && item.keys > 0 && t('count.keys', { count: item.keys }),
    item.records !== undefined && item.records > 0 && t('count.records', { count: item.records }),
    bySpace ? whenOf(item, today) : clockTime(item.deleted),
  ].filter(Boolean);
  const restore = file ? t('trash.restore') : t('trash.restoreTo', { place: place || t('trash.topLevel') });
  return (
    <div className={`trow choosable${chosen ? ' chosen' : ''}`} onClick={choosing ? () => onChoose(!chosen) : isPhone() ? onOpen : undefined}>
      <ChooseBox state={chosen} label={t('choose.row', { name: item.title })} onChange={onChoose} />
      <Icon name={iconOf(item)} />
      <div className="task-body">
        {onOpen && !choosing && !isPhone() ? (
          <button type="button" className="trow-title open" title={t('trash.look')} onClick={onOpen}>
            {item.title}
          </button>
        ) : (
          <span className="trow-title">{item.title}</span>
        )}
        <div className="meta">
          {meta.map((part, i) => (
            <span key={i}>{part}</span>
          ))}
        </div>
      </div>
      {!choosing && (
        <div className="task-actions" onClick={(event) => event.stopPropagation()}>
          <button type="button" title={restore} aria-label={restore} onClick={onRestore}>
            <Icon name="restore" />
          </button>
          <button type="button" title={t('delete.forever')} aria-label={t('delete.forever')} onClick={onDelete}>
            <Icon name="trash" />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The trash: what was deleted, by the day it was, with a way back for each item. With more than
 * one space, after the Spaces trash view of design/mockups.html: one screen still, each space's
 * deleted items under its own heading, in the sidebar's order. A heading folds its group, as a
 * task list's section does, so that a long one does not hide the next. Rows are chosen together
 * after the Trash select view: on a computer the bar over them takes the heading's place.
 */
export function TrashView({ items, today, spaces = [], choice, onOpen, onRestore, onDelete, onEmpty }: {
  items: TrashItem[];
  today: string;
  /** Every space, the personal one first; with more than one the trash goes by space. */
  spaces?: TrashSpace[];
  choice: TrashChoice;
  /** Shows what an item holds, before it is put back. */
  onOpen?: (item: TrashItem) => void;
  onRestore: (item: TrashItem) => void;
  onDelete: (item: TrashItem) => void;
  onEmpty: () => void;
}) {
  const phone = isPhone();
  const { chosen } = choice;
  // The groups folded, by their space's id or their day, while the trash is open.
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const fold = (key: string) =>
    setFolded((now) => {
      const next = new Set(now);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  /** A group's heading: its arrow and its name fold it; its box chooses its rows. */
  const heading = (key: string, name: string, group: TrashItem[], icon?: ReactNode) => {
    const open = !folded.has(key);
    return (
      <div className={['sec', 'fold', icon && 'spc', phone && 'mb-tsec', !open && 'closed'].filter(Boolean).join(' ')}>
        <button type="button" className="chev" aria-expanded={open} aria-label={t(open ? 'sections.fold' : 'sections.unfold', { name })} onClick={() => fold(key)}>
          {phone ? <Icon name="chevron" /> : open ? '▾' : '▸'}
        </button>
        {groupBox(group, name)}
        {icon}
        <button type="button" className="sec-name trash-fold" onClick={() => fold(key)}>
          {name}
        </button>
        <small>{group.length}</small>
      </div>
    );
  };
  const count = items.filter((item) => chosen.has(item.path)).length;
  // On a computer, choosing one row is choosing: every row shows its box.
  const choosing = phone ? choice.choosing : count > 0;
  const every = items.map((item) => item.path);
  useLetGo(!phone && count > 0, () => choice.onChoose(every, false));
  const bySpace = spaces.length > 1;
  const spaceGroups = bySpace
    ? spaces.map((space) => ({ space, items: items.filter((item) => spaceOf(item.path) === space.id) })).filter((group) => group.items.length > 0)
    : [];
  // The items come latest first, so each day's group comes out in order too.
  const days: { day: string; items: TrashItem[] }[] = [];
  for (const item of items) {
    const day = dayOf(new Date(item.deleted));
    const last = days[days.length - 1];
    if (last?.day === day) last.items.push(item);
    else days.push({ day, items: [item] });
  }
  const rows = (group: TrashItem[], bySpaceRows: boolean) =>
    group.map((item) => (
      <TrashRow
        key={item.path}
        item={item}
        today={today}
        bySpace={bySpaceRows}
        chosen={chosen.has(item.path)}
        choosing={choosing}
        onChoose={(on) => choice.onChoose([item.path], on)}
        {...(onOpen && { onOpen: () => onOpen(item) })}
        onRestore={() => onRestore(item)}
        onDelete={() => onDelete(item)}
      />
    ));
  // A group's heading has a box for all of its rows while rows are chosen on a computer.
  const groupBox = (group: TrashItem[], name: string) =>
    choosing && !phone ? (
      <ChooseBox
        state={groupState(
          group.map((item) => item.path),
          chosen,
        )}
        label={t('choose.group', { name })}
        onChange={(on) =>
          choice.onChoose(
            group.map((item) => item.path),
            on,
          )
        }
      />
    ) : null;
  const allChosen = count === items.length;
  return (
    <section className={phone ? 'tasks mb-tasks' : 'tasks'}>
      {/* On a phone the page's large title; Select and its bars are the page's own. */}
      {!phone && count > 0 ? (
        <header className="th chosen-bar">
          <button type="button" className="let-go" title={t('choose.letGo')} aria-label={t('choose.letGo')} onClick={() => choice.onChoose(every, false)}>
            <Icon name="close" />
          </button>
          <b>{t('choose.selected', { count })}</b>
          <button type="button" className="ghost push" onClick={() => choice.onChoose(every, !allChosen)}>
            {allChosen ? t('choose.deselectAll') : t('choose.selectAll')}
          </button>
          <button type="button" className="ghost" onClick={choice.onRestore}>
            <Icon name="restore" />
            {t('trash.restore')}
          </button>
          <button type="button" className="ghost danger" onClick={choice.onDelete}>
            <Icon name="trash" />
            {t('delete.forever')}
          </button>
        </header>
      ) : (
        <header className={phone ? 'mb-head mb-trash-head' : 'th'}>
          {phone ? <h1>{t('trash.title')}</h1> : <b>{t('trash.title')}</b>}
          {items.length > 0 && <span>{t('count.items', { count: items.length })}</span>}
          {items.length > 0 && !choosing && (
            <button type="button" className="ghost" onClick={onEmpty}>
              {t('trash.empty')}
            </button>
          )}
        </header>
      )}
      <div className={`tl${choosing ? ' choosing' : ''}`}>
        {bySpace
          ? spaceGroups.map(({ space, items: spaceItems }) => (
              <div key={space.id ?? ''}>
                {heading(`space:${space.id ?? ''}`, space.name, spaceItems, <Icon name="space" />)}
                {!folded.has(`space:${space.id ?? ''}`) && rows(spaceItems, true)}
              </div>
            ))
          : days.map(({ day, items: dayItems }) => (
              <div key={day}>
                {heading(`day:${day}`, pastDayLabel(day, today), dayItems)}
                {!folded.has(`day:${day}`) && rows(dayItems, false)}
              </div>
            ))}
        {items.length > 0 ? (
          !choosing && <p className="trash-note">{t('trash.note')}</p>
        ) : isPhone() ? (
          <Empty icon="trash" title={t('phone.emptyTrash')} text={t('phone.emptyTrashText')} />
        ) : (
          <p className="task-empty">{t('trash.nothing')}</p>
        )}
      </div>
    </section>
  );
}
