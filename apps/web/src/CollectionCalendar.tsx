import {
  addDays,
  atMinutes,
  collectionName,
  compareOnDay,
  monthDays,
  repeatCalendar,
  type RepeatDay,
  type CalendarRecord,
  type CalendarSettings,
  calendarRecords,
  calendarStarts,
  COLOR_TYPES,
  type Collection,
  type Condition,
  type Field,
  isComputed,
  minutesOfDay,
  movedValues,
  opsFor,
  type Record,
  recordLabel,
  type Schema,
  startingValues,
  stretchedValues,
  timeOf,
  type View,
  weekDays,
  isEmpty,
  isLink,
  type Link,
  linkTo,
} from '@scrawlnotes/core';
import { locale, t } from '@scrawlnotes/i18n';
import { type CSSProperties, type DragEvent, type MouseEvent, useEffect, useRef, useState } from 'react';
import { type CalendarBox, choiceColor, type MonthChip, MonthCalendar, PhoneHours, TimeGrid } from './Calendar';
import { type Option, Picker, useEscape } from './choices';
import { type CollectionActions, ConditionRow } from './Collection';
import { type CalendarRange } from './device';
import { Icon } from './Icon';

// A collection's Calendar view, after the Calendar mockups of stage 15 slice 3 (design/calendar.md
// 4): its records on their days and hours, by the date field it goes by, as long as its end or its
// length, in the color of a choice. Day and Week have the all-day row and the hours, Month the
// days; a record dragged takes its new day and time, its foot dragged its length; a range picked
// on the hours, or a day clicked, adds one there. Its window sets what it goes by.

const RANGES = 'scrawl.viewRanges';

/** The range each Calendar view was left on, on this device, by its collection and its id. */
function storedRanges(): { [key: string]: CalendarRange } {
  try {
    const raw = JSON.parse(localStorage.getItem(RANGES) ?? '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

/** What a calendar shows: its range, the day it is about, and how to go back and forth. */
export interface CalendarNavState {
  range: CalendarRange;
  focus: string;
  days: string[];
  month: string;
  title: string;
  choose: (range: CalendarRange) => void;
  shift: (by: number) => void;
  go: (day: string, range?: CalendarRange) => void;
}

const toDate = (day: string) => new Date(`${day}T12:00:00`);
const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const first = new Date(y, m - 1 + by, 1);
  return `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * A record's month on its calendar that repeats (design/more-apps.md 4.9): a box a day, Monday
 * first; a day done filled, today ringed, one not its day faint; a day gone by or today clicked is
 * done, one done clicked is not. Over it the values it is given, a habit's streak and best.
 */
export function DaysMonth({ collection, record, view, stats, today, actions }: {
  collection: Collection;
  record: Record;
  view: View;
  stats: { label: string; value: string; hot?: boolean }[];
  today: string;
  actions: CollectionActions;
}) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const days = monthDays(month);
  const items = new Map(repeatItems(collection, [record], view, days, today, actions.collections(), true).map((item) => [item.day, item]));
  const head = days.slice(0, 7).map((day) => toDate(day).toLocaleDateString(locale(), { weekday: 'narrow' }));
  return (
    <div className="dmonth">
      {stats.length > 0 && (
        <div className="dstats">
          {stats.map((s) => (
            <div key={s.label}>
              <b className={s.hot ? 'hot' : undefined}>{s.value}</b>
              <small>{s.label}</small>
            </div>
          ))}
        </div>
      )}
      <div className="dnav">
        <button type="button" className="ghost" aria-label={t('calendar.previous.month')} title={t('calendar.previous.month')} onClick={() => setMonth(shiftMonth(month, -1))}>
          <Icon name="back" />
        </button>
        <b>{toDate(`${month}-01`).toLocaleDateString(locale(), { month: 'long', year: 'numeric' })}</b>
        <button type="button" className="ghost" aria-label={t('calendar.next.month')} title={t('calendar.next.month')} onClick={() => setMonth(shiftMonth(month, 1))}>
          <Icon name="chevron" />
        </button>
      </div>
      <div className="dgrid">
        {head.map((d, i) => (
          <span key={`h${i}`} className="h">
            {d}
          </span>
        ))}
        {days.map((day) => {
          const n = Number(day.slice(8));
          if (day.slice(0, 7) !== month) return <span key={day} className="no" />;
          const item = items.get(day);
          const done = item?.state === 'done' || item?.state === 'skipped';
          const now = day === today ? ' now' : '';
          if (!item || day > today) return <span key={day} className={(item ? 'later' : 'off') + now}>{n}</span>;
          const label = toDate(day).toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric' });
          return (
            <button key={day} type="button" className={(done ? 'on' : '') + now} title={label} aria-label={label} aria-pressed={done} onClick={() => (done ? actions.reopenDay?.(item) : actions.skipDay?.(item))}>
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A calendar's range, kept for `key` on this device, and the day it shows, today at first. */
export function useCalendarNav(key: string, initial: CalendarRange, today: string): CalendarNavState {
  const [range, setRange] = useState<CalendarRange>(() => storedRanges()[key] ?? initial);
  const [focus, setFocus] = useState(today);
  useEffect(() => {
    setRange(storedRanges()[key] ?? initial);
    setFocus(today);
  }, [key]);
  const choose = (next: CalendarRange) => {
    setRange(next);
    try {
      localStorage.setItem(RANGES, JSON.stringify({ ...storedRanges(), [key]: next }));
    } catch {
      // Not kept; it is chosen still.
    }
  };
  const month = focus.slice(0, 7);
  const days = range === 'day' ? [focus] : weekDays(focus);
  const title =
    range === 'month'
      ? toDate(`${month}-01`).toLocaleDateString(locale(), { month: 'long', year: 'numeric' })
      : range === 'day'
        ? toDate(focus).toLocaleDateString(locale(), { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })
        : new Intl.DateTimeFormat(locale(), { month: 'short', day: 'numeric', year: 'numeric' }).formatRange(toDate(days[0]!), toDate(days[6]!));
  return {
    range,
    focus,
    days,
    month,
    title,
    choose,
    shift: (by) => setFocus(range === 'month' ? `${shiftMonth(month, by)}-01` : addDays(focus, range === 'week' ? by * 7 : by)),
    go: (day, next) => {
      setFocus(day);
      if (next) choose(next);
    },
  };
}

/** A calendar's Today, back and forth, what it shows and Day, Week and Month. */
export function CalendarNav({ nav, today }: { nav: CalendarNavState; today: string }) {
  return (
    <>
      <span className="up-month">
        <button type="button" className="up-today" onClick={() => nav.go(today)}>
          {t('day.today')}
        </button>
        <button type="button" aria-label={t(`calendar.previous.${nav.range}`)} title={t(`calendar.previous.${nav.range}`)} onClick={() => nav.shift(-1)}>
          <Icon name="back" />
        </button>
        <button type="button" aria-label={t(`calendar.next.${nav.range}`)} title={t(`calendar.next.${nav.range}`)} onClick={() => nav.shift(1)}>
          <Icon name="chevron" />
        </button>
        <span className="mn">{nav.title}</span>
      </span>
      <span className="vsw" role="tablist" aria-label={t('calendar.range')}>
        {(['day', 'week', 'month'] as const).map((each) => (
          <button key={each} type="button" role="tab" aria-selected={nav.range === each} onClick={() => nav.choose(each)}>
            {t(`calendar.${each}`)}
          </button>
        ))}
      </span>
    </>
  );
}

/** The range a Calendar view opens on: a week when it goes by a day and a time, a month by a day alone. */
export const firstRange = (schema: Schema, view: View): CalendarRange => (view.calendar?.lanes ? 'day' : schema.fields.find((f) => f.key === view.calendar?.start)?.time ? 'week' : 'month');

/** How many of the records are in what the calendar shows, said the status bar's way. */
export function calendarStatus(items: readonly CalendarRecord[], nav: CalendarNavState): string {
  const days = nav.range === 'month' ? null : new Set(nav.days);
  const count = items.filter((item) => (days ? days.has(item.start.slice(0, 10)) : item.start.slice(0, 7) === nav.month)).length;
  const what = t('count.records', { count });
  if (nav.range === 'week') return t('tasks.inWeek', { what });
  if (nav.range === 'day') return t('tasks.onDay', { what, day: toDate(nav.focus).toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric' }) });
  return t('tasks.inMonth', { what, month: toDate(`${nav.month}-01`).toLocaleDateString(locale(), { month: 'long' }) });
}

const whenWords = (value: string) => {
  const day = toDate(value.slice(0, 10)).toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric' });
  const time = timeOf(value);
  return time ? `${day}, ${time}` : day;
};

/**
 * The calendar of a Calendar view: `records` those it shows, with what is worked out among their
 * values. A record dragged, or its foot, is written with Undo; one that cannot be is only opened.
 */
export function CollectionCalendar({ collection, records, view, nav, today, actions, onOpen, onNew }: {
  collection: Collection;
  records: Record[];
  view: View;
  nav: CalendarNavState;
  today: string;
  actions: CollectionActions;
  onOpen: (id: string) => void;
  /** Adds a record with these values. */
  onNew: (values: Record['values']) => void;
}) {
  const settings = view.calendar!;
  const { dir, schema } = collection;
  const items = calendarRecords({ ...collection, records }, { ...view, conditions: [] }, today);
  const [dragging, setDragging] = useState<{ item: CalendarRecord; from: string } | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const title = (record: Record) => recordLabel(record) || t('collection.untitled');
  const colorOf = (item: CalendarRecord) => choiceColor(item.colorField, item.choice);
  const canMove = !!movedValues(schema, settings, { start: '2000-01-01', end: null }, '2000-01-02');

  const move = (item: CalendarRecord, start: string) => {
    const values = movedValues(schema, settings, item, start);
    if (values) actions.moveRecord(dir, item.record.id, values, t('calendar.moved', { name: title(item.record), when: whenWords(start) }));
  };
  const stretch = (item: CalendarRecord, end: string) => {
    const values = stretchedValues(schema, settings, item, end);
    if (values) actions.moveRecord(dir, item.record.id, values, t('calendar.stretched', { name: title(item.record), time: timeOf(end) ?? '' }));
  };
  const byKey = new Map(items.map((item) => [item.record.id, item]));
  if (settings.lanes && nav.range === 'day') {
    return <LaneDay collection={collection} records={records} items={items} day={nav.focus} lanes={settings.lanes} actions={actions} colorOf={colorOf} title={title} onOpen={onOpen} />;
  }
  if (settings.repeat) return <RepeatCalendar collection={collection} records={records} view={view} nav={nav} today={today} actions={actions} onOpen={onOpen} />;

  if (nav.range === 'month') {
    const chipsOf = (day: string): MonthChip[] =>
      items
        .filter((item) => item.start.slice(0, 10) === day)
        .map((item) => ({
          key: item.record.id,
          title: title(item.record),
          time: timeOf(item.start),
          color: colorOf(item),
          movable: canMove,
          onOpen: () => onOpen(item.record.id),
        }));
    return (
      <MonthCalendar
        month={nav.month}
        today={today}
        chipsOf={chipsOf}
        onNumber={(day) => nav.go(day, 'day')}
        onDay={(day) => onNew(startingValues(schema, settings, day, null))}
        onMove={(chip, from, to) => {
          const item = byKey.get(chip.key);
          if (item) move(item, to + item.start.slice(10));
          void from;
        }}
      />
    );
  }

  const allDay = items.filter((item) => minutesOfDay(item.start) === null);
  const boxes: CalendarBox[] = items
    .filter((item) => minutesOfDay(item.start) !== null)
    .map((item) => ({
      key: item.record.id,
      title: title(item.record),
      sub: subOf(schema, item.record),
      start: item.start,
      end: item.end,
      minutes: item.minutes,
      color: colorOf(item),
      movable: canMove,
    }));
  const resizable = !!stretchedValues(schema, settings, { start: '2000-01-01T10:00' }, '2000-01-01T11:00');
  const drop = (event: DragEvent, day: string) => {
    event.preventDefault();
    if (dragging && dragging.from !== day) move(dragging.item, day);
    setDragging(null);
    setDropOn(null);
  };
  return (
    <div className="up-week">
      <TimeGrid
        key={nav.range}
        days={nav.days}
        today={today}
        allDay={(day) => (
          <div
            key={day}
            className={['tg-ad', day === today && 'today', dropOn === day && 'drop-on'].filter(Boolean).join(' ')}
            data-day={day}
            onClick={() => onNew(startingValues(schema, settings, day, null))}
            onDragOver={(event) => {
              if (!dragging) return;
              event.preventDefault();
              if (dropOn !== day) setDropOn(day);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropOn((was) => (was === day ? null : was));
            }}
            onDrop={(event) => drop(event, day)}
          >
            {allDay
              .filter((item) => item.start.slice(0, 10) === day)
              .map((item) => (
                <button
                  key={item.record.id}
                  type="button"
                  draggable={canMove}
                  className={dragging?.item === item ? 'cal-t rec ghost' : 'cal-t rec'}
                  style={{ '--cc': colorOf(item) } as CSSProperties}
                  title={title(item.record)}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', title(item.record));
                    setDragging({ item, from: day });
                  }}
                  onDragEnd={() => {
                    setDragging(null);
                    setDropOn(null);
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpen(item.record.id);
                  }}
                >
                  <i className="sq" />
                  <span>{title(item.record)}</span>
                </button>
              ))}
          </div>
        )}
        boxes={boxes}
        onOpen={(box) => onOpen(box.key)}
        onMove={canMove ? (box, start) => byKey.get(box.key) && move(byKey.get(box.key)!, start) : undefined}
        onResize={resizable ? (box, end) => byKey.get(box.key) && stretch(byKey.get(box.key)!, end) : undefined}
        onSlot={(day, from, to) => onNew(startingValues(schema, settings, atMinutes(day, from), atMinutes(day, to)))}
      />
    </div>
  );
}

/** The hours a technician's day shows, from 7 to 19. */
const LANE_FROM = 7;
const LANE_HOURS = 12;

/**
 * A day with a row for each record its lanes link to, a technician's day each, as Jobber's
 * schedule has it (design/scrawl-apps.md 3.3): the hours across, each record a box at its time, a
 * row for those given to no one, and those with no day beside it. A box or a card dropped on a row
 * at an hour takes that row and that time, by the quarter hour.
 */
function LaneDay({ collection, records, items, day, lanes, actions, colorOf, title, onOpen }: {
  collection: Collection;
  records: Record[];
  items: CalendarRecord[];
  day: string;
  lanes: string;
  actions: CollectionActions;
  colorOf: (item: CalendarRecord) => string;
  title: (record: Record) => string;
  onOpen: (id: string) => void;
}) {
  const { dir, schema } = collection;
  const settings = collection.schema.views?.find((v) => v.calendar?.lanes === lanes)?.calendar;
  const field = schema.fields.find((f) => f.key === lanes);
  const people = (field?.collection ? actions.collection(field.collection)?.records : undefined) ?? [];
  const [dropOn, setDropOn] = useState<string | null>(null);
  const dragged = useRef<string | null>(null);
  const today = items.filter((item) => item.start.slice(0, 10) === day && minutesOfDay(item.start) !== null);
  const laneOf = (r: Record) => {
    const v = r.values[lanes];
    const link = Array.isArray(v) ? v[0] : v;
    return isLink(link) ? link.id : '';
  };
  const unscheduled = settings ? records.filter((r) => isEmpty(r.values[settings.start] ?? null)) : [];
  // Where every record has its day, as an appointment, there is nothing to drag on a row.
  const sided = !schema.fields.find((f) => f.key === settings?.start)?.required;
  // "2 appointments" by the collection's own words; "2 jobs" without them.
  const many = schema.singular ? collectionName(dir).toLowerCase() : '';
  const counted = (count: number) => (schema.singular ? (count === 1 ? `1 ${schema.singular}` : `${count} ${many}`) : t('calendar.jobs', { count }));
  const rows = [...people.map((p) => ({ id: p.id, name: recordLabel(p) || t('collection.untitled'), link: linkTo(p) as Link | null })), { id: '', name: t('calendar.unassigned'), link: null }];
  const drop = (event: DragEvent<HTMLDivElement>, row: (typeof rows)[number]) => {
    event.preventDefault();
    setDropOn(null);
    const id = dragged.current;
    dragged.current = null;
    if (!id || !settings) return;
    const box = event.currentTarget.getBoundingClientRect();
    const minutes = Math.round((((event.clientX - box.left) / box.width) * LANE_HOURS * 60) / 15) * 15 + LANE_FROM * 60;
    const start = atMinutes(day, Math.max(0, Math.min(24 * 60 - 15, minutes)));
    const item = items.find((i) => i.record.id === id);
    const moved = item ? movedValues(schema, settings, item, start) : { [settings.start]: start };
    if (!moved) return;
    const record = records.find((r) => r.id === id);
    actions.moveRecord(dir, id, { ...moved, [lanes]: row.link }, t('calendar.moved', { name: record ? title(record) : '', when: `${row.name} · ${whenWords(start)}` }));
  };
  const drag = (id: string) => (event: DragEvent) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
    dragged.current = id;
  };
  return (
    <div className={sided ? 'lane-day' : 'lane-day whole'}>
      <div className="lane-board">
        <div className="lane hd">
          <span className="nm" />
          <span className="tl">
            {Array.from({ length: LANE_HOURS }, (_, i) => (
              <i key={i}>{`${String(LANE_FROM + i).padStart(2, '0')}:00`}</i>
            ))}
          </span>
        </div>
        {rows.map((row) => {
          const mine = today.filter((item) => laneOf(item.record) === row.id);
          return (
            <div key={row.id || 'none'} className="lane">
              <span className="nm">
                <b>{row.name}</b>
                <small>{mine.length === 0 ? t('calendar.free') : counted(mine.length)}</small>
              </span>
              <div
                className={dropOn === (row.id || 'none') ? 'tl drop-on' : 'tl'}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (dropOn !== (row.id || 'none')) setDropOn(row.id || 'none');
                }}
                onDragLeave={() => setDropOn(null)}
                onDrop={(event) => drop(event, row)}
              >
                {mine.map((item) => {
                  const from = (minutesOfDay(item.start)! - LANE_FROM * 60) / (LANE_HOURS * 60);
                  const width = Math.max(item.minutes ?? 60, 30) / (LANE_HOURS * 60);
                  return (
                    <button
                      key={item.record.id}
                      type="button"
                      draggable
                      className="lane-job"
                      style={{ left: `${Math.max(0, from) * 100}%`, width: `${Math.min(width, 1 - Math.max(0, from)) * 100}%`, '--cc': colorOf(item) } as CSSProperties}
                      title={title(item.record)}
                      onDragStart={drag(item.record.id)}
                      onClick={() => onOpen(item.record.id)}
                    >
                      <b>{title(item.record)}</b>
                      <small>{[timeOf(item.start), subOf(schema, item.record)].filter(Boolean).join(' · ')}</small>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {sided && <div className="lane-side">
        <div className="blk-h">
          <span>{t('calendar.unscheduled')}</span>
          <small>{unscheduled.length}</small>
        </div>
        {unscheduled.length === 0 && <p className="blk-none">{t('calendar.noneUnscheduled')}</p>}
        {unscheduled.map((r) => (
          <button key={r.id} type="button" draggable className="lane-card" onDragStart={drag(r.id)} onClick={() => onOpen(r.id)}>
            <b>{title(r)}</b>
            <small>{subOf(schema, r) ?? t('calendar.dragOnRow')}</small>
          </button>
        ))}
      </div>}
    </div>
  );
}

/** The days a repeating calendar shows, as `nav` has them: a month's six weeks, a week, a day. */
const shownDays = (nav: CalendarNavState) => (nav.range === 'month' ? monthDays(nav.month) : nav.days);

/** A repeating calendar's days among `days` (design/gym.md 4.3), each as it went. */
export const repeatItems = (collection: Collection, records: Record[], view: View, days: string[], today: string, all: Collection[], anyDay = false): RepeatDay[] =>
  repeatCalendar({ ...collection, records }, { ...view, conditions: [] }, today, days[0]!, days[days.length - 1]!, all, anyDay);

/**
 * What a repeating calendar's day does when it is clicked: a day closed opens the record that
 * closed it, the day's workout; today's, or one gone by unwritten, offers Start, the other button
 * and the record itself; one to come opens the record.
 */
export function repeatPress(event: MouseEvent, item: RepeatDay, today: string, actions: CollectionActions, onOpen: (id: string) => void) {
  const repeat = item.view.calendar!.repeat!;
  if (item.closedBy) return actions.openRecord ? actions.openRecord(item.closedBy.collection, item.closedBy.id) : actions.show?.(item.closedBy.collection, item.closedBy.id);
  if (item.day > today) return onOpen(item.record.id);
  actions.menu(
    event,
    [
      // With no Start its one button is the day done.
      ...(repeat.start === false ? [] : [{ label: repeat.start ?? t('repeat.start'), icon: 'play' as const, run: () => actions.startDay?.(item) }]),
      ...(repeat.skip ? [{ label: repeat.skip.label, ...(repeat.start === false && { icon: 'play' as const }), run: () => actions.skipDay?.(item) }] : []),
      { label: t('collection.open'), run: () => onOpen(item.record.id), apart: true },
    ],
    { icon: 'calendar', title: recordLabel(item.record) || t('collection.untitled'), sub: whenWords(item.day) },
  );
}

/**
 * A calendar that repeats (design/gym.md 4.3): each record on the days it comes on, as each went:
 * one gone to faint and ticked, one not gone to struck through, one gone by unwritten in red, one
 * to come as it is. Nothing is dragged, and a day clicked adds nothing.
 */
function RepeatCalendar({ collection, records, view, nav, today, actions, onOpen }: {
  collection: Collection;
  records: Record[];
  view: View;
  nav: CalendarNavState;
  today: string;
  actions: CollectionActions;
  onOpen: (id: string) => void;
}) {
  const items = repeatItems(collection, records, view, shownDays(nav), today, actions.collections());
  const title = (record: Record) => recordLabel(record) || t('collection.untitled');
  const chip = (item: RepeatDay): MonthChip => ({
    key: `${item.record.id}/${item.day}`,
    title: title(item.record),
    color: choiceColor(item.colorField, item.choice),
    late: item.state === 'late',
    done: item.state === 'done',
    skipped: item.state === 'skipped',
    movable: false,
    onOpen: (event) => repeatPress(event, item, today, actions, onOpen),
  });
  const chipsOf = (day: string) => items.filter((item) => item.day === day).map(chip);
  if (nav.range === 'month') return <MonthCalendar month={nav.month} today={today} chipsOf={chipsOf} onNumber={(day) => nav.go(day, 'day')} />;
  return (
    <div className="up-week">
      <TimeGrid
        key={nav.range}
        days={nav.days}
        today={today}
        allDay={(day) => (
          <div key={day} className={day === today ? 'tg-ad today' : 'tg-ad'} data-day={day}>
            {chipsOf(day).map((each) => (
              <button
                key={each.key}
                type="button"
                className={['cal-t', each.color && 'rec', each.late && 'late', each.done && 'done', each.skipped && 'skipped'].filter(Boolean).join(' ')}
                style={each.color ? ({ '--cc': each.color } as CSSProperties) : undefined}
                title={each.title}
                onClick={(event) => (event.stopPropagation(), each.onOpen(event))}
              >
                {each.done ? <Icon name="check" /> : <i className={each.color ? 'sq' : undefined} />}
                <span>{each.title}</span>
              </button>
            ))}
          </div>
        )}
        boxes={[]}
        onOpen={() => undefined}
      />
    </div>
  );
}

/** What a record's box says under its name, on a day alone: its first person and its first link. */
function subOf(schema: Schema, record: Record): string | undefined {
  const person = schema.fields.find((f) => f.type === 'person');
  const link = schema.fields.find((f) => f.type === 'link');
  const words = [person && record.values[person.key], link && linkWords(record.values[link.key])].filter((v): v is string => typeof v === 'string' && !!v);
  return words.length > 0 ? words.join(' · ') : undefined;
}

const linkWords = (value: unknown) => {
  const first = Array.isArray(value) ? value[0] : value;
  return first && typeof first === 'object' && 'name' in first ? String((first as { name: string }).name) : typeof first === 'string' ? first : undefined;
};

/** The fields a calendar can end on: dates, and those worked out; and those it can take its length from: numbers, and those worked out. */
const endFields = (schema: Schema, start: string) => schema.fields.filter((f) => f.key !== start && (f.type === 'date' || isComputed(f.type)));
const lengthFields = (schema: Schema) => schema.fields.filter((f) => f.type === 'number' || isComputed(f.type));

/**
 * A Calendar view's window, after the Calendar view window of the mockups: its name, the date
 * field it goes by, how long a record is, the choice it is colored by, Show in Today and Upcoming,
 * and its conditions; Save keeps it in the schema file.
 */
export function CalendarViewDialog({ schema, view, showAs, records, count, onSave, onClose }: {
  schema: Schema;
  /** The view edited; null for a new one. */
  view: View | null;
  showAs: (field: Field) => Field;
  records: CollectionActions['records'];
  count: (conditions: Condition[]) => number;
  onSave: (view: View) => void;
  onClose: () => void;
}) {
  // A formula the view starts on that reads a linked record's day is not told here to give one, and stays.
  const dated = calendarStarts(schema.fields);
  const given = schema.fields.find((f) => f.key === view?.calendar?.start);
  const starts = given && !dated.includes(given) ? [...dated, given] : dated;
  const [name, setName] = useState(view?.name ?? t('calendar.calendar'));
  // A new one goes by the first date, as long as a number of minutes when there is one, in the colors of the first choice.
  const [settings, setSettings] = useState<CalendarSettings>(() => {
    if (view?.calendar) return view.calendar;
    const minutes = schema.fields.find((f) => f.type === 'number' && f.format?.style === 'duration');
    const choice = schema.fields.find((f) => f.type === 'select');
    return { start: starts[0]?.key ?? '', ...(minutes && { duration: minutes.key }), ...(choice && { color: choice.key }), upcoming: true };
  });
  const [conditions, setConditions] = useState<Condition[]>(view?.conditions ?? []);
  const backdrop = useRef<HTMLDivElement>(null);
  useEscape(backdrop, onClose);
  // The day a time is shown by the type of what it gives.
  const shownType = (f: Field) => showAs(f).type;
  const ends = endFields(schema, settings.start).filter((f) => shownType(f) === 'date');
  const lengths = lengthFields(schema).filter((f) => shownType(f) === 'number');
  const lengthOptions: Option[] = [
    ...ends.map((f) => ({ value: `end:${f.key}`, label: f.label, chip: false })),
    ...lengths.map((f) => ({ value: `duration:${f.key}`, label: f.label, chip: false })),
    { value: null, label: t('calendar.noLength'), chip: false },
  ];
  const length = settings.end ? `end:${settings.end}` : settings.duration ? `duration:${settings.duration}` : null;
  const colors = schema.fields.filter((f) => COLOR_TYPES.includes(f.type));
  const first = schema.fields.find((f) => f.type !== 'name') ?? schema.fields[0]!;
  const save = () => {
    const kept: View = {
      ...(view ?? { id: crypto.randomUUID() }),
      name: name.trim(),
      kind: 'calendar',
      calendar: settings,
      conditions,
    };
    onSave(kept);
  };
  return (
    <div ref={backdrop} className="backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="dialog cfilter calview" role="dialog" aria-label={t('calendar.viewTitle')}>
        <h2>{t('calendar.viewTitle')}</h2>
        <div className="calview-grid">
          <span>{t('collection.viewName')}</span>
          <input autoFocus aria-label={t('collection.viewName')} value={name} onChange={(event) => setName(event.target.value)} />
          <span>{t('calendar.starts')}</span>
          <Picker
            options={starts.map((f) => ({ value: f.key, label: f.label, chip: false }))}
            value={settings.start}
            label={t('calendar.starts')}
            onPick={(key) => key && setSettings(({ end, ...rest }) => ({ ...rest, start: key, ...(end && end !== key && { end }) }))}
          />
          <span>{t('calendar.length')}</span>
          <Picker
            options={lengthOptions}
            value={length}
            label={t('calendar.length')}
            text={length ? undefined : t('calendar.noLength')}
            onPick={(value) =>
              setSettings(({ end: _end, duration: _duration, ...rest }) => ({
                ...rest,
                ...(value?.startsWith('end:') && { end: value.slice(4) }),
                ...(value?.startsWith('duration:') && { duration: value.slice(9) }),
              }))
            }
          />
          <span>{t('calendar.color')}</span>
          <Picker
            options={[...colors.map((f) => ({ value: f.key, label: f.label, chip: false })), { value: null, label: t('calendar.noColor'), chip: false }]}
            value={settings.color ?? null}
            label={t('calendar.color')}
            text={settings.color ? undefined : t('calendar.noColor')}
            onPick={(key) => setSettings(({ color: _color, ...rest }) => ({ ...rest, ...(key && { color: key }) }))}
          />
          <span />
          <label className="calview-check">
            <input type="checkbox" checked={settings.upcoming !== false} onChange={(event) => setSettings({ ...settings, upcoming: event.target.checked })} />
            <span>
              <b>{t('calendar.upcoming')}</b>
              <small>{t('calendar.upcomingHelp')}</small>
            </span>
          </label>
          {settings.upcoming !== false && (
            <>
              <span />
              <label className="calview-check">
                <input type="checkbox" checked={settings.upcoming === 'today'} onChange={(event) => setSettings({ ...settings, upcoming: event.target.checked ? 'today' : true })} />
                <span>
                  <b>{t('calendar.todayOnly')}</b>
                  <small>{t('calendar.todayOnlyHelp')}</small>
                </span>
              </label>
            </>
          )}
        </div>
        <p className="dialog-hint">{conditions.length === 0 ? t('collection.noConditions') : t('collection.conditions')}</p>
        {conditions.map((condition, i) => (
          <ConditionRow
            key={i}
            schema={schema}
            condition={condition}
            records={records}
            shown={showAs}
            onChange={(next) => setConditions(conditions.map((c, j) => (j === i ? next : c)))}
            onRemove={() => setConditions(conditions.filter((_, j) => j !== i))}
          />
        ))}
        <button type="button" className="cond-add" onClick={() => setConditions([...conditions, { field: first.key, op: opsFor(showAs(first).type)[0]! }])}>
          {t('collection.addCondition')}
        </button>
        <div className="dialog-actions filter-foot">
          <span className="count">{t('collection.matching', { count: count(conditions) })}</span>
          <button type="button" onClick={onClose}>
            {t('dialog.cancel')}
          </button>
          <button type="button" className="primary" disabled={!name.trim() || !settings.start} onClick={save}>
            {t('collection.updateView')}
          </button>
        </div>
      </div>
    </div>
  );
}


/**
 * A Calendar view on a phone, after the Phone views of the Calendar mockups of stage 15 slice 3:
 * Day, the week's strip with a dot under each day that has something, the day's records with no
 * time, then its hours, swiped to the next day; a box held and dragged takes another time, or the
 * day of the strip it is left on. Month, its days with dots, and under it the day's records, those
 * with no time first.
 */
export function PhoneCollectionCalendar({ collection, records, view, nav, today, actions, onOpen }: {
  collection: Collection;
  records: Record[];
  view: View;
  nav: CalendarNavState;
  today: string;
  actions: CollectionActions;
  onOpen: (id: string) => void;
}) {
  const settings = view.calendar!;
  const { dir, schema } = collection;
  const day = nav.focus;
  // A calendar that repeats has its records on their days, each as it went (design/gym.md 4.3).
  const repeat = !!settings.repeat;
  const items: (CalendarRecord | RepeatDay)[] = repeat
    ? repeatItems(collection, records, view, nav.range === 'month' ? monthDays(nav.month) : weekDays(day), today, actions.collections())
    : calendarRecords({ ...collection, records }, { ...view, conditions: [] }, today);
  const stateOf = (item: CalendarRecord | RepeatDay) => ('state' in item ? item.state : null);
  const press = (event: MouseEvent, item: CalendarRecord | RepeatDay) => ('state' in item ? repeatPress(event, item, today, actions, onOpen) : onOpen(item.record.id));
  const [target, setTarget] = useState<string | null>(null);
  const title = (record: Record) => recordLabel(record) || t('collection.untitled');
  const colorOf = (item: CalendarRecord) => choiceColor(item.colorField, item.choice);
  const busy = new Set(items.map((item) => item.start.slice(0, 10)));
  const byKey = new Map(items.map((item) => [item.record.id, item]));
  const onDay = (each: string) => items.filter((item) => item.start.slice(0, 10) === each).sort((a, b) => compareOnDay(a.start, b.start));
  const dayWords = (each: string) => toDate(each).toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric' });

  if (nav.range === 'month') {
    const initials = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale(), { weekday: 'narrow' }));
    const list = onDay(day);
    return (
      <div className="mb-clist">
        <div className="mb-month">
          <div className="mh">
            {toDate(`${nav.month}-01`).toLocaleDateString(locale(), { month: 'long', year: 'numeric' })}
            <span>
              <button type="button" aria-label={t('phone.previousMonth')} onClick={() => nav.shift(-1)}>
                <Icon name="back" />
              </button>
              <button type="button" aria-label={t('phone.nextMonth')} onClick={() => nav.shift(1)}>
                <Icon name="chevron" />
              </button>
            </span>
          </div>
          <div className="wd" aria-hidden="true">
            {initials.map((initial, i) => (
              <span key={i}>{initial}</span>
            ))}
          </div>
          <div className="days">
            {monthDays(nav.month).map((each) => {
              const className = [each.slice(0, 7) !== nav.month && 'out', busy.has(each) && 'busy', each === today && 'today', each === day && 'on'].filter(Boolean).join(' ');
              return (
                <button key={each} type="button" className={className || undefined} aria-pressed={each === day} aria-label={dayWords(each)} onClick={() => nav.go(each)}>
                  <b>{Number(each.slice(8))}</b>
                  <i className={busy.has(each) ? undefined : 'no'} />
                </button>
              );
            })}
          </div>
        </div>
        <div className="sec">
          {dayWords(day)} {list.length > 0 && <small>{list.length}</small>}
        </div>
        {list.map((item) => (
          <button key={`${item.record.id}/${item.start}`} type="button" className={['mb-rrow', stateOf(item)].filter(Boolean).join(' ')} style={{ '--cc': colorOf(item) } as CSSProperties} onClick={(event) => press(event, item)}>
            <em>{stateOf(item) === 'done' ? <Icon name="check" /> : (timeOf(item.start) ?? t('collection.allDay'))}</em>
            <span>
              <b>{title(item.record)}</b>
              {subOf(schema, item.record) && <small>{subOf(schema, item.record)}</small>}
            </span>
          </button>
        ))}
        {list.length === 0 && <p className="mb-none">{t('tasks.nothingOnDay')}</p>}
      </div>
    );
  }

  const allDay = onDay(day).filter((item) => minutesOfDay(item.start) === null);
  const boxes: CalendarBox[] = items
    .filter((item) => minutesOfDay(item.start) !== null)
    .map((item) => ({ key: item.record.id, title: title(item.record), start: item.start, end: item.end, minutes: item.minutes, color: colorOf(item), movable: !!movedValues(schema, settings, item, item.start) }));
  const move = (box: CalendarBox, start: string) => {
    const item = byKey.get(box.key);
    const values = item && movedValues(schema, settings, item, start);
    if (item && values) actions.moveRecord(dir, item.record.id, values, t('calendar.moved', { name: box.title, when: whenWords(start) }));
  };
  return (
    <div className="mb-cday">
      <div className="mb-wstrip">
        {weekDays(day).map((each) => (
          <button
            key={each}
            type="button"
            data-day={each}
            className={[each === day && 'on', each === today && 'today', target === each && 'drop'].filter(Boolean).join(' ') || undefined}
            aria-pressed={each === day}
            aria-label={dayWords(each)}
            onClick={() => nav.go(each)}
          >
            <small>{toDate(each).toLocaleDateString(locale(), { weekday: 'narrow' })}</small>
            <b>{Number(each.slice(8))}</b>
            <i className={busy.has(each) ? undefined : 'no'} />
          </button>
        ))}
      </div>
      {allDay.length > 0 && (
        <div className="mb-allday">
          {allDay.map((item) => (
            <button key={`${item.record.id}/${item.start}`} type="button" className={['mb-chip rec', stateOf(item)].filter(Boolean).join(' ')} style={{ '--cc': colorOf(item) } as CSSProperties} onClick={(event) => press(event, item)}>
              {stateOf(item) === 'done' ? <Icon name="check" /> : <i className="sq" />}
              <span>{title(item.record)}</span>
            </button>
          ))}
        </div>
      )}
      <PhoneHours day={day} today={today} boxes={boxes} onOpen={(box) => onOpen(box.key)} onSwipe={(by) => nav.go(addDays(day, by))} onMove={move} onTarget={setTarget} />
    </div>
  );
}
