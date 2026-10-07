import { dayOf, dirname, type TrashItem } from '@scrawlnotes/core';
import { sizeText } from '@scrawlnotes/editor';
import { t } from '@scrawlnotes/i18n';
import { Icon, type IconName } from './Icon';
import { clockTime, contentsText, pastDayLabel } from './text';

const ICONS: Record<Exclude<TrashItem['kind'], 'attachment'>, IconName> = { note: 'note', tasks: 'tasks', board: 'board', keys: 'keys', folder: 'folder' };
const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i;
const AUDIO = /\.(webm|ogg|oga|opus|mp3|m4a|aac|wav|flac)$/i;

const iconOf = (item: TrashItem): IconName =>
  item.kind !== 'attachment' ? ICONS[item.kind] : IMAGE.test(item.title) ? 'image' : AUDIO.test(item.title) ? 'audio' : 'file';

/** The folder an item goes back to, as a path to read: `Scrawl / meetings`; empty for the top level. */
const placeOf = (from: string) => dirname(from).split('/').filter(Boolean).join(' / ');

function TrashRow({ item, onRestore, onDelete }: { item: TrashItem; onRestore: () => void; onDelete: () => void }) {
  // An attached file goes back to the attachments, which is no place to name.
  const file = item.kind === 'attachment';
  const place = file ? '' : placeOf(item.from);
  const meta = [
    place,
    file && t('trash.unused'),
    item.size !== undefined && sizeText(item.size),
    item.holds && (contentsText(item.holds) || t('trash.emptyFolder')),
    item.tasks !== undefined && item.tasks > 0 && t('count.tasks', { count: item.tasks }),
    item.cards !== undefined && item.cards > 0 && t('count.cards', { count: item.cards }),
    item.keys !== undefined && item.keys > 0 && t('count.keys', { count: item.keys }),
    clockTime(item.deleted),
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

/** The trash: what was deleted, by the day it was, with a way back for each item. */
export function TrashView({ items, today, onRestore, onDelete, onEmpty }: {
  items: TrashItem[];
  today: string;
  onRestore: (item: TrashItem) => void;
  onDelete: (item: TrashItem) => void;
  onEmpty: () => void;
}) {
  // The items come latest first, so each day's group comes out in order too.
  const days: { day: string; items: TrashItem[] }[] = [];
  for (const item of items) {
    const day = dayOf(new Date(item.deleted));
    const last = days[days.length - 1];
    if (last?.day === day) last.items.push(item);
    else days.push({ day, items: [item] });
  }
  return (
    <section className="tasks">
      <header className="th">
        <b>{t('trash.title')}</b>
        {items.length > 0 && <span>{t('count.items', { count: items.length })}</span>}
        {items.length > 0 && (
          <button type="button" className="ghost" onClick={onEmpty}>
            {t('trash.empty')}
          </button>
        )}
      </header>
      <div className="tl">
        {days.map(({ day, items: dayItems }) => (
          <div key={day}>
            <div className="sec">
              {pastDayLabel(day, today)} <small>{dayItems.length}</small>
            </div>
            {dayItems.map((item) => (
              <TrashRow key={item.path} item={item} onRestore={() => onRestore(item)} onDelete={() => onDelete(item)} />
            ))}
          </div>
        ))}
        {items.length > 0 ? (
          <p className="trash-note">{t('trash.note')}</p>
        ) : (
          <p className="task-empty">{t('trash.nothing')}</p>
        )}
      </div>
    </section>
  );
}
