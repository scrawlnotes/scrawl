import { addDays, type Collection, isLink, type Link, linkTo, type Record, recordLabel, type View, weekDays } from '@scrawlnotes/core';
import { locale, t } from '@scrawlnotes/i18n';
import { type KeyboardEvent, useState } from 'react';
import type { CollectionActions } from './Collection';

// A week of a collection's records as Harvest's timesheet has it (design/scrawl-apps.md 3.3): a
// row for each record they link to, a column a day, in each cell what they come to that day,
// typed in it. A cell of one record changes it, an empty one adds one, a cell of several only
// says what they come to. + Add row picks another; Copy last week brings last week's rows.

/** Hours as a sheet writes them: 2.5 as 2:30. */
export function hoursText(hours: number): string {
  if (!hours) return '';
  const minutes = Math.round(hours * 60);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

/** What is typed in a cell as hours: "2:30", "2.5", "2,5"; null for what is not a number. */
export function readHours(text: string): number | null {
  const typed = text.trim();
  if (!typed) return 0;
  const clock = /^(\d+):(\d{1,2})$/.exec(typed);
  if (clock) return Number(clock[1]) + Number(clock[2]) / 60;
  const n = Number(typed.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

export function Sheet({ collection, records, view, today, actions, onOpen }: {
  collection: Collection;
  records: Record[];
  view: View;
  today: string;
  actions: CollectionActions;
  onOpen: (id: string) => void;
}) {
  const { row, day, value } = view.sheet!;
  const { dir, schema } = collection;
  const field = schema.fields.find((f) => f.key === row);
  const choices = (field?.collection ? actions.records(field.collection) : undefined) ?? [];
  const [focus, setFocus] = useState(today);
  const [added, setAdded] = useState<Link[]>([]);
  const [typing, setTyping] = useState<{ key: string; text: string } | null>(null);
  const days = weekDays(focus);
  const linkOf = (r: Record): Link | null => {
    const v = r.values[row];
    const first = Array.isArray(v) ? v[0] : v;
    return isLink(first) ? first : null;
  };
  const dayOf = (r: Record) => (typeof r.values[day] === 'string' ? (r.values[day] as string).slice(0, 10) : '');
  const amount = (r: Record) => (typeof r.values[value] === 'number' ? (r.values[value] as number) : 0);
  const inWeek = (list: string[]) => records.filter((r) => list.includes(dayOf(r)));
  const week = inWeek(days);
  const rows = new Map<string, Link>();
  for (const r of week) {
    const link = linkOf(r);
    if (link) rows.set(link.id, link);
  }
  for (const link of added) rows.set(link.id, link);
  const lastWeek = inWeek(weekDays(addDays(focus, -7)))
    .map(linkOf)
    .filter((l): l is Link => !!l && !rows.has(l.id));
  const cell = (link: Link, d: string) => week.filter((r) => linkOf(r)?.id === link.id && dayOf(r) === d);
  const sum = (list: Record[]) => list.reduce((n, r) => n + amount(r), 0);
  const total = sum(week);
  const write = (link: Link, d: string, text: string) => {
    setTyping(null);
    const hours = readHours(text);
    const there = cell(link, d);
    if (hours === null || there.length > 1) return;
    if (there.length === 0) {
      if (hours > 0) void actions.addRecord(dir, { values: { [row]: link, [day]: d, [value]: hours } }).then((failed) => failed && actions.say?.(failed));
    } else if (hours === 0) actions.removeRecord(dir, there[0]!);
    else if (hours !== amount(there[0]!)) void actions.updateRecord(dir, there[0]!.id, { values: { [value]: hours } }).then((failed) => failed && actions.say?.(failed));
  };
  const keys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur();
    if (event.key === 'Escape') {
      setTyping(null);
      event.currentTarget.blur();
    }
  };
  const dayName = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric' });
  const range = `${new Date(`${days[0]}T12:00:00`).toLocaleDateString(locale(), { month: 'short', day: 'numeric' })} – ${new Date(`${days[6]}T12:00:00`).toLocaleDateString(locale(), { month: 'short', day: 'numeric' })}`;
  return (
    <div className="sheet">
      <div className="sheet-nav">
        <button type="button" className="txtbtn" aria-label={t('calendar.previous.week')} onClick={() => setFocus(addDays(focus, -7))}>
          ‹
        </button>
        <span>{range}</span>
        <button type="button" className="txtbtn" aria-label={t('calendar.next.week')} onClick={() => setFocus(addDays(focus, 7))}>
          ›
        </button>
        {!days.includes(today) && (
          <button type="button" className="txtbtn" onClick={() => setFocus(today)}>
            {t('sheet.thisWeek')}
          </button>
        )}
        <small>{t('sheet.total', { hours: hoursText(total) || '0:00' })}</small>
      </div>
      <div className="sheet-grid" role="table" aria-label={view.name}>
        <div className="r head" role="row">
          <span>{field?.label}</span>
          {days.map((d) => (
            <span key={d} className={d === today ? 'today' : undefined}>
              {dayName(d)}
            </span>
          ))}
          <span>{t('sheet.totalHead')}</span>
        </div>
        {[...rows.values()].map((link) => (
          <div key={link.id} className="r" role="row">
            <span className="tt">
              <b>{recordLabel(link)}</b>
            </span>
            {days.map((d) => {
              const there = cell(link, d);
              const key = `${link.id}|${d}`;
              const shown = typing?.key === key ? typing.text : hoursText(sum(there));
              return (
                <span key={d}>
                  {there.length > 1 ? (
                    <button type="button" className="sk-many" title={t('sheet.many', { count: there.length })} onClick={() => onOpen(there[0]!.id)}>
                      {hoursText(sum(there))}
                    </button>
                  ) : (
                    <input
                      className={[d === today && 'today', !shown && 'empty'].filter(Boolean).join(' ')}
                      inputMode="decimal"
                      aria-label={`${recordLabel(link)} · ${dayName(d)}`}
                      value={shown}
                      onFocus={() => setTyping({ key, text: hoursText(sum(there)) })}
                      onChange={(event) => setTyping({ key, text: event.target.value })}
                      onBlur={(event) => write(link, d, event.target.value)}
                      onKeyDown={keys}
                    />
                  )}
                </span>
              );
            })}
            <span className="num">{hoursText(sum(week.filter((r) => linkOf(r)?.id === link.id)))}</span>
          </div>
        ))}
        <div className="r foot" role="row">
          <span className="adds">
            <select
              aria-label={t('sheet.addRow')}
              value=""
              onChange={(event) => {
                const picked = choices.find((r) => r.id === event.target.value);
                if (picked) setAdded([...added, linkTo(picked)]);
              }}
            >
              <option value="">{t('sheet.addRow')}</option>
              {choices
                .filter((r) => !rows.has(r.id))
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {recordLabel(r)}
                  </option>
                ))}
            </select>
            {lastWeek.length > 0 && (
              <button type="button" className="txtbtn" onClick={() => setAdded([...added, ...lastWeek])}>
                {t('sheet.copyLastWeek')}
              </button>
            )}
          </span>
          {days.map((d) => (
            <span key={d} className="num">
              {hoursText(sum(week.filter((r) => dayOf(r) === d)))}
            </span>
          ))}
          <span className="num">{hoursText(total)}</span>
        </div>
      </div>
    </div>
  );
}
