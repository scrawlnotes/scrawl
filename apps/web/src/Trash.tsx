import { addDays, dayOf, dirname, type TrashItem } from '@scrawlnotes/core';
import { Icon, type IconName } from './Icon';
import { contentsText, count } from './text';

const ICONS: Record<TrashItem['kind'], IconName> = { note: 'note', tasks: 'tasks', folder: 'folder' };
const SHORT: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

/** The day something was deleted, the way people say it: Today, Yesterday, else a date. */
function dayLabel(day: string, today: string): string {
  if (day === today) return 'Today';
  if (day === addDays(today, -1)) return 'Yesterday';
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', sameYear ? SHORT : { ...SHORT, year: 'numeric' });
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** The folder an item goes back to, as a path to read: `Scrawl / meetings`; empty for the top level. */
const placeOf = (from: string) => dirname(from).split('/').filter(Boolean).join(' / ');

function TrashRow({ item, onRestore, onDelete }: { item: TrashItem; onRestore: () => void; onDelete: () => void }) {
  const place = placeOf(item.from);
  const meta = [
    place,
    item.holds && (contentsText(item.holds) || 'Empty'),
    item.tasks !== undefined && item.tasks > 0 && count(item.tasks, 'task'),
    timeOf(item.deleted),
  ].filter(Boolean);
  const restore = `Restore to ${place || 'the top level'}`;
  return (
    <div className="trow">
      <Icon name={ICONS[item.kind]} />
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
        <button type="button" title="Delete forever" aria-label="Delete forever" onClick={onDelete}>
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
        <b>Trash</b>
        {items.length > 0 && <span>{count(items.length, 'item')}</span>}
        {items.length > 0 && (
          <button type="button" className="ghost" onClick={onEmpty}>
            Empty trash
          </button>
        )}
      </header>
      <div className="tl">
        {days.map(({ day, items: dayItems }) => (
          <div key={day}>
            <div className="sec">
              {dayLabel(day, today)} <small>{dayItems.length}</small>
            </div>
            {dayItems.map((item) => (
              <TrashRow key={item.path} item={item} onRestore={() => onRestore(item)} onDelete={() => onDelete(item)} />
            ))}
          </div>
        ))}
        {items.length > 0 ? (
          <p className="trash-note">Restore puts an item back where it was. Nothing here is deleted until you delete it.</p>
        ) : (
          <p className="task-empty">The trash is empty.</p>
        )}
      </div>
    </section>
  );
}
