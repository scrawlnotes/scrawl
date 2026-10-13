import { addDays, dayOf, spaceOf, type TrashItem } from '@scrawlnotes/core';
import { sizeText } from '@scrawlnotes/editor';
import { t } from '@scrawlnotes/i18n';
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
 * a space's heading the folder in the space and when.
 */
function TrashRow({ item, today, bySpace, onRestore, onDelete }: { item: TrashItem; today: string; bySpace: boolean; onRestore: () => void; onDelete: () => void }) {
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
    <div className="trow">
      <Icon name={iconOf(item)} />
      <div className="task-body">
        <span className="trow-title">{item.title}</span>
        <div className="meta">
          {meta.map((part, i) => (
            <span key={i}>{part}</span>
          ))}
        </div>
      </div>
      <div className="task-actions">
        <button type="button" title={restore} aria-label={restore} onClick={onRestore}>
          <Icon name="restore" />
        </button>
        <button type="button" title={t('delete.forever')} aria-label={t('delete.forever')} onClick={onDelete}>
          <Icon name="trash" />
        </button>
      </div>
    </div>
  );
}

/**
 * The trash: what was deleted, by the day it was, with a way back for each item. With more than
 * one space, after the Spaces trash view of design/mockups.html: one screen still, each space's
 * deleted items under its own heading, in the sidebar's order.
 */
export function TrashView({ items, today, spaces = [], onRestore, onDelete, onEmpty }: {
  items: TrashItem[];
  today: string;
  /** Every space, the personal one first; with more than one the trash goes by space. */
  spaces?: TrashSpace[];
  onRestore: (item: TrashItem) => void;
  onDelete: (item: TrashItem) => void;
  onEmpty: () => void;
}) {
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
  const phone = isPhone();
  return (
    <section className={phone ? 'tasks mb-tasks' : 'tasks'}>
      {/* On a phone the page's large title. */}
      <header className={phone ? 'mb-head mb-trash-head' : 'th'}>
        {phone ? <h1>{t('trash.title')}</h1> : <b>{t('trash.title')}</b>}
        {items.length > 0 && <span>{t('count.items', { count: items.length })}</span>}
        {items.length > 0 && (
          <button type="button" className="ghost" onClick={onEmpty}>
            {t('trash.empty')}
          </button>
        )}
      </header>
      <div className="tl">
        {bySpace
          ? spaceGroups.map(({ space, items: spaceItems }) => (
              <div key={space.id ?? ''}>
                <div className="sec spc">
                  <Icon name="space" />
                  {space.name} <small>{spaceItems.length}</small>
                </div>
                {spaceItems.map((item) => (
                  <TrashRow key={item.path} item={item} today={today} bySpace onRestore={() => onRestore(item)} onDelete={() => onDelete(item)} />
                ))}
              </div>
            ))
          : days.map(({ day, items: dayItems }) => (
              <div key={day}>
                <div className="sec">
                  {pastDayLabel(day, today)} <small>{dayItems.length}</small>
                </div>
                {dayItems.map((item) => (
                  <TrashRow key={item.path} item={item} today={today} bySpace={false} onRestore={() => onRestore(item)} onDelete={() => onDelete(item)} />
                ))}
              </div>
            ))}
        {items.length > 0 ? (
          <p className="trash-note">{t('trash.note')}</p>
        ) : isPhone() ? (
          <Empty icon="trash" title={t('phone.emptyTrash')} text={t('phone.emptyTrashText')} />
        ) : (
          <p className="task-empty">{t('trash.nothing')}</p>
        )}
      </div>
    </section>
  );
}
