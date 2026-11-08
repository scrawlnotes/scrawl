import { dayIn, type OutlookEvent, timedOn } from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import { type CSSProperties, useState } from 'react';
import type { CalendarBox } from './Calendar';
import { isPhone } from './device';
import { Icon } from './Icon';
import { connectOutlook, openOutlookEvent, outlookColor, useOutlook, useOutlookDay } from './outlook';

// Outlook's events where Scrawl shows a day (design/outlook-calendar.md 2.4, design/mockups.html ›
// Outlook takvimi): at the head of Today and of each day of Upcoming's List in a box, in the
// calendar hollow in their calendar's color. Read only: a click opens one in Outlook.

const pad = (n: number) => String(n).padStart(2, '0');
const clockOf = (stamp: string) => stamp.slice(11, 16);

/** Whether an event is over: on a day gone by, or today with its end gone by. */
export function isOver(event: OutlookEvent, day: string, today: string): boolean {
  if (day !== today) return day < today;
  if (!event.end || !timedOn(event, day) || event.lastDay > day) return false;
  const now = new Date();
  return event.end <= `${dayIn(now)}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

const titleOf = (event: OutlookEvent) => event.title || t('outlook.noTitle');
const colorStyle = (event: OutlookEvent) => ({ '--cc': outlookColor(event) }) as CSSProperties;

/** Its time on `day`, `09:30–10:00`, or all day. */
function whenOn(event: OutlookEvent, day: string, short: boolean): string {
  if (!timedOn(event, day)) return t('outlook.allDay');
  const end = event.end && event.end.slice(0, 10) === day ? clockOf(event.end) : '24:00';
  return short ? clockOf(event.start!) : `${clockOf(event.start!)}–${end}`;
}

/**
 * A day's events in a box: on a computer two columns read down, by their time, more than six as
 * five and +N more; on a phone a group of rows. `warn`: the line that asks to sign in again, in
 * the box's place, when Outlook's sign-in ran out. `narrow`: one column, all of them, as in a day's window.
 */
export function EventBox({ day, today, warn = false, narrow = false }: { day: string; today: string; warn?: boolean; narrow?: boolean }) {
  const outlook = useOutlook();
  const events = useOutlookDay(day);
  const [all, setAll] = useState(false);
  if (warn && outlook.status === 'signin' && outlook.choice.events) {
    return (
      <div className="ol-warn">
        <Icon name="warn" />
        <span>{t('outlook.signInAgain')}</span>
        <button type="button" className="st-btn" disabled={outlook.connecting} onClick={() => void connectOutlook()}>
          {t('outlook.signIn')}
        </button>
      </div>
    );
  }
  if (events.length === 0) return null;
  if (isPhone()) {
    return (
      <div className="ol-mevs">
        {events.map((event) => (
          <button key={`${event.calendar}|${event.id}`} type="button" className={isOver(event, day, today) ? 'ol-mev past' : 'ol-mev'} style={colorStyle(event)} onClick={() => openOutlookEvent(event)}>
            <em>{whenOn(event, day, true)}</em>
            <b>{titleOf(event)}</b>
            <Icon name="open" />
          </button>
        ))}
      </div>
    );
  }
  const folded = !all && !narrow && events.length > 6;
  const shown = folded ? events.slice(0, 5) : events;
  return (
    <div className={narrow ? 'ol-evs narrow' : 'ol-evs'} style={narrow ? undefined : { gridTemplateRows: `repeat(${Math.ceil((folded ? 6 : events.length) / 2)}, auto)` }}>
      {shown.map((event) => (
        <button
          key={`${event.calendar}|${event.id}`}
          type="button"
          className={isOver(event, day, today) ? 'ol-ev past' : 'ol-ev'}
          style={colorStyle(event)}
          title={t('outlook.open')}
          onClick={() => openOutlookEvent(event)}
        >
          <em>{whenOn(event, day, false)}</em>
          <span>{titleOf(event)}</span>
          <Icon name="open" />
        </button>
      ))}
      {folded && (
        <button type="button" className="ol-ev more" onClick={() => setAll(true)}>
          <em />
          <span>{t('outlook.more', { count: events.length - 5 })}</span>
        </button>
      )}
    </div>
  );
}

const BOX = 'outlook:';

/** The events with a time on `days`, as boxes of the calendar's hours: hollow, not moved. */
export function eventBoxes(events: readonly OutlookEvent[], days: readonly string[], today: string): CalendarBox[] {
  return events
    .filter((event) => days.includes(event.day) && timedOn(event, event.day))
    .map((event) => ({
      key: `${BOX}${event.calendar}|${event.id}|${event.day}`,
      title: titleOf(event),
      start: event.start!,
      end: event.end ?? null,
      color: outlookColor(event),
      movable: false,
      outlook: true,
      faint: isOver(event, event.day, today),
    }));
}

/** Opens the event a box is of; false for a box that is not one. */
export function openEventBox(box: CalendarBox, events: readonly OutlookEvent[]): boolean {
  if (!box.key.startsWith(BOX)) return false;
  const event = events.find((each) => box.key === `${BOX}${each.calendar}|${each.id}|${each.day}`);
  if (event) openOutlookEvent(event);
  return true;
}

/** An event on a day of the month: its time with a hollow mark, or all day with a hollow edge. */
export function EventChip({ event, day, today }: { event: OutlookEvent; day: string; today: string }) {
  const timed = timedOn(event, day);
  return (
    <button
      type="button"
      className={['cal-t', timed ? 'timed ol' : 'ol all', isOver(event, day, today) && 'past'].filter(Boolean).join(' ')}
      style={colorStyle(event)}
      title={titleOf(event)}
      onClick={(click) => {
        click.stopPropagation();
        openOutlookEvent(event);
      }}
    >
      {timed ? <em>{clockOf(event.start!)}</em> : <i />}
      <span>{titleOf(event)}</span>
    </button>
  );
}

/** The all-day events of a day, in the all-day row of the hours: chips with a hollow edge. */
export function AllDayEvents({ events, day, today }: { events: readonly OutlookEvent[]; day: string; today: string }) {
  return (
    <>
      {events
        .filter((event) => !timedOn(event, day))
        .map((event) => (
          <button key={`${event.calendar}|${event.id}`} type="button" className={isOver(event, day, today) ? 'cal-t ol all past' : 'cal-t ol all'} style={colorStyle(event)} title={t('outlook.open')} onClick={() => openOutlookEvent(event)}>
            <i />
            <span>{titleOf(event)}</span>
          </button>
        ))}
    </>
  );
}
