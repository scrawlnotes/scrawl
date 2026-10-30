import { addDays, type Collection, isLink, optionColor, type Record, recordLabel, recordTitle, valueText, type View } from '@scrawlnotes/core';
import { locale, t } from '@scrawlnotes/i18n';
import { Fragment, type PointerEvent, useRef, useState } from 'react';
import { hueStyle } from './choices';
import type { CollectionActions } from './Collection';

// A collection's records on a timeline as Linear and monday have it (design/more-apps.md 3.4): a
// row each, a bar from its start to its end in its color, its marks (a project's milestones) as
// diamonds, today a line. A bar dragged moves both its days, its end dragged moves its end, with
// Undo; a click opens the record. Weeks, months or quarters across; on a phone, its months only.
// With `rows`, a row for each it links to, its records bars on it, as Timetastic's wall chart: who
// is away, two weeks or a month from this Monday, a day a column, the weekend shaded.

type Range = 'weeks' | 'months' | 'quarters' | 'week' | 'two' | 'month';
const SPANS: { [range in Range]: { days: number; back: number } } = {
  weeks: { days: 91, back: 21 },
  months: { days: 182, back: 30 },
  quarters: { days: 365, back: 60 },
  week: { days: 7, back: 0 },
  two: { days: 14, back: 0 },
  month: { days: 35, back: 0 },
};

/** Days from `a` to `b`, both `YYYY-MM-DD`. */
const between = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
const dayOf = (value: unknown) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : '');

export function Timeline({ collection, records, view, today, actions, onOpen, phone }: {
  collection: Collection;
  records: Record[];
  view: View;
  today: string;
  actions: CollectionActions;
  onOpen: (id: string) => void;
  phone?: boolean;
}) {
  const { start, end, color, marks, late, rows: rowsBy } = view.timeline!;
  const { dir, schema } = collection;
  const ranges: Range[] = rowsBy ? ['two', 'month'] : ['weeks', 'months', 'quarters'];
  const [picked, setRange] = useState<Range>(ranges[0]!);
  // On a phone, a week of days fits; else its months.
  const range = phone ? (rowsBy ? 'week' : ranges[0]!) : picked;
  const days = range === 'week' || range === 'two' || range === 'month';
  const lane = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; edge: boolean; x: number; days: number } | null>(null);
  const span = SPANS[range];
  // From a Monday a few weeks back, so what was just done shows too.
  const back = addDays(today, -span.back);
  // A phone's week is from today: what is coming fits.
  const from = range === 'week' ? today : addDays(back, -((new Date(`${back}T12:00:00Z`).getUTCDay() + 6) % 7));
  const at = (day: string) => Math.max(0, Math.min(100, (between(from, day) / span.days) * 100));
  const movable = (key: string) => schema.fields.find((f) => f.key === key)?.type === 'date';
  const colorField = color ? schema.fields.find((f) => f.key === color) : undefined;
  const sub = (view.columns ?? []).slice(0, 2);
  const fieldOf = (key: string) => schema.fields.find((f) => f.key === key);
  const rows = records
    .filter((r) => dayOf(r.values[start]) || dayOf(r.values[end]))
    .sort((a, b) => (dayOf(a.values[start]) || dayOf(a.values[end])).localeCompare(dayOf(b.values[start]) || dayOf(b.values[end])));
  const markRecords = marks ? (actions.records(marks.collection) ?? []) : [];
  // A row for each record, or with `rows` for each it links to, its records bars on it: who is away.
  const groups: { key: string; name: string; records: Record[] }[] = [];
  for (const r of rows) {
    const link = rowsBy ? [r.values[rowsBy]].flat()[0] : null;
    const key = rowsBy ? (isLink(link) ? link.id || link.name : '') : r.id;
    const held = groups.find((g) => g.key === key);
    if (held) held.records.push(r);
    else groups.push({ key, name: rowsBy ? (isLink(link) ? link.name : t('timeline.nobody')) : recordTitle(r), records: [r] });
  }
  if (rowsBy) groups.sort((a, b) => a.name.localeCompare(b.name));
  // The ticks across: a week's Monday, a month's first day, its name over them; by the day, each day.
  const ticks: { day: string; label: string; month: boolean }[] = [];
  const weekend: string[] = [];
  for (let i = 0; i <= span.days; i++) {
    const day = addDays(from, i);
    const date = new Date(`${day}T12:00:00Z`);
    if (date.getUTCDate() === 1 || (days && i === 0)) ticks.push({ day, label: date.toLocaleDateString(locale(), { month: phone || range !== 'weeks' ? 'short' : 'long', timeZone: 'UTC' }), month: true });
    if (days && i < span.days) {
      if (date.getUTCDay() % 6 === 0) weekend.push(day);
      if (range !== 'month' || date.getUTCDay() === 1) ticks.push({ day, label: range !== 'month' ? `${date.toLocaleDateString(locale(), { weekday: 'narrow', timeZone: 'UTC' })} ${date.getUTCDate()}` : String(date.getUTCDate()), month: false });
    } else if (!phone && range === 'weeks' && date.getUTCDay() === 1) ticks.push({ day, label: String(date.getUTCDate()), month: false });
  }
  const dayWidth = () => (lane.current ? lane.current.getBoundingClientRect().width / span.days : 1);
  const down = (event: PointerEvent, record: Record, edge: boolean) => {
    if (event.button !== 0 || !movable(end) || (!edge && !movable(start))) return;
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setDrag({ id: record.id, edge, x: event.clientX, days: 0 });
  };
  const move = (event: PointerEvent) => drag && setDrag({ ...drag, days: Math.round((event.clientX - drag.x) / dayWidth()) });
  const up = (record: Record) => {
    const moved = drag;
    setDrag(null);
    if (!moved || moved.id !== record.id) return;
    if (moved.days === 0) return onOpen(record.id);
    const s = dayOf(record.values[start]);
    const e = dayOf(record.values[end]);
    const values: Record['values'] = moved.edge ? { [end]: addDays(e || s, moved.days) } : { ...(s && { [start]: addDays(s, moved.days) }), ...(e && { [end]: addDays(e, moved.days) }) };
    const until = (values[end] as string | undefined) ?? e;
    actions.moveRecord(dir, record.id, values, t('calendar.moved', { name: recordLabel(record), when: new Date(`${until}T12:00:00Z`).toLocaleDateString(locale(), { month: 'short', day: 'numeric', timeZone: 'UTC' }) }));
  };
  return (
    <div className={phone ? 'tline ph' : 'tline'}>
      {!phone && (
        <div className="tl-ranges" role="tablist">
          {ranges.map((r) => (
            <button key={r} type="button" role="tab" aria-selected={r === range} className={r === range ? 'on' : ''} onClick={() => setRange(r)}>
              {t(`timeline.${r}`)}
            </button>
          ))}
        </div>
      )}
      <div className="tl-grid">
        <div className="tl-r hd">
          <span className="nm" />
          <div className="lane" ref={lane}>
            {ticks.map((tick) => (
              <span key={`${tick.day}${tick.month}`} className={tick.month ? 'tk m' : 'tk'} style={{ left: `${at(tick.day)}%` }}>
                {tick.label}
              </span>
            ))}
            <span className="now" style={{ left: `${at(today)}%` }} />
          </div>
        </div>
        {groups.length === 0 && <p className="tl-empty">{t('timeline.empty')}</p>}
        {groups.map((group) => {
          const record = group.records[0]!;
          const said = rowsBy
            ? []
            : sub
                .map((key) => {
                  const field = fieldOf(key);
                  const value = record.values[key];
                  return field && value !== undefined && value !== null && value !== '' ? valueText(value) : '';
                })
                .filter(Boolean);
          return (
            <div key={group.key} className="tl-r">
              <button type="button" className="nm" onClick={() => onOpen(record.id)}>
                <b>{group.name}</b>
                {said.length > 0 && <small>{said.join(' · ')}</small>}
              </button>
              <div className="lane">
                {weekend.map((day) => (
                  <span key={day} className="we" style={{ left: `${at(day)}%`, width: `${100 / span.days}%` }} />
                ))}
                {group.records.map((one) => {
                  const s0 = dayOf(one.values[start]) || dayOf(one.values[end]);
                  const e0 = dayOf(one.values[end]) || s0;
                  const shift = drag?.id === one.id ? drag.days : 0;
                  const s = drag?.edge ? s0 : addDays(s0, shift);
                  const e = addDays(e0, shift);
                  const tone = colorField ? valueText(one.values[colorField.key] ?? null) : '';
                  const hue = colorField ? hueStyle(optionColor(colorField, tone), tone || recordLabel(one)) : undefined;
                  const over = late && one.values[late] === true && e < today;
                  return (
                    <Fragment key={one.id}>
                      <span
                        className={['bar', s < from && 'cut', between(from, e) > span.days && 'out', drag?.id === one.id && 'dragging'].filter(Boolean).join(' ')}
                        // A day is a whole day: a bar ends at the end of its last.
                        style={{ ...hue, left: `${at(s)}%`, width: `${Math.max(0.6, at(addDays(e, rowsBy ? 1 : 0)) - at(s))}%` }}
                        title={rowsBy ? `${tone ? `${tone} · ` : ''}${s}${e !== s ? ` – ${e}` : ''}` : recordLabel(one)}
                        onPointerDown={(event) => down(event, one, false)}
                        onPointerMove={move}
                        onPointerUp={() => up(one)}
                        onPointerCancel={() => setDrag(null)}
                      >
                        {rowsBy && tone && <span className="tx">{tone}</span>}
                        {!phone && movable(end) && <span className="h" onPointerDown={(event) => down(event, one, true)} onPointerMove={move} onPointerUp={() => up(one)} />}
                      </span>
                      {over && <span className="over" style={{ left: `${at(e)}%`, width: `${at(today) - at(e)}%` }} />}
                    </Fragment>
                  );
                })}
                {(marks ? markRecords.filter((m) => {
                  const link = m.values[marks.link];
                  return (Array.isArray(link) ? link : [link]).some((l) => isLink(l) && l.id === record.id);
                }) : []).map((m) => {
                  const day = dayOf(m.values[marks!.date]);
                  if (!day || day < from || between(from, day) > span.days) return null;
                  return <span key={m.id} className={marks!.done && m.values[marks!.done] === true ? 'ms done' : 'ms'} style={{ left: `${at(day)}%` }} title={`${recordLabel(m)} · ${day}`} />;
                })}
                <span className="now" style={{ left: `${at(today)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
