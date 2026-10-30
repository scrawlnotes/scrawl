import { addDays, type Collection, isLink, optionColor, type Record, recordLabel, recordTitle, valueText, type View } from '@scrawlnotes/core';
import { locale, t } from '@scrawlnotes/i18n';
import { type PointerEvent, useRef, useState } from 'react';
import { hueStyle } from './choices';
import type { CollectionActions } from './Collection';

// A collection's records on a timeline as Linear and monday have it (design/more-apps.md 3.4): a
// row each, a bar from its start to its end in its color, its marks (a project's milestones) as
// diamonds, today a line. A bar dragged moves both its days, its end dragged moves its end, with
// Undo; a click opens the record. Weeks, months or quarters across; on a phone, its months only.

type Range = 'weeks' | 'months' | 'quarters';
const SPANS: { [range in Range]: { days: number; back: number } } = { weeks: { days: 91, back: 21 }, months: { days: 182, back: 30 }, quarters: { days: 365, back: 60 } };

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
  const { start, end, color, marks, late } = view.timeline!;
  const { dir, schema } = collection;
  const [range, setRange] = useState<Range>('weeks');
  const lane = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; edge: boolean; x: number; days: number } | null>(null);
  const span = SPANS[phone ? 'weeks' : range];
  // From a Monday a few weeks back, so what was just done shows too.
  const back = addDays(today, -span.back);
  const from = addDays(back, -((new Date(`${back}T12:00:00Z`).getUTCDay() + 6) % 7));
  const at = (day: string) => Math.max(0, Math.min(100, (between(from, day) / span.days) * 100));
  const movable = (key: string) => schema.fields.find((f) => f.key === key)?.type === 'date';
  const colorField = color ? schema.fields.find((f) => f.key === color) : undefined;
  const sub = (view.columns ?? []).slice(0, 2);
  const fieldOf = (key: string) => schema.fields.find((f) => f.key === key);
  const rows = records
    .filter((r) => dayOf(r.values[start]) || dayOf(r.values[end]))
    .sort((a, b) => (dayOf(a.values[start]) || dayOf(a.values[end])).localeCompare(dayOf(b.values[start]) || dayOf(b.values[end])));
  const markRecords = marks ? (actions.records(marks.collection) ?? []) : [];
  // The ticks across: a week's Monday, a month's first day, its name over them.
  const ticks: { day: string; label: string; month: boolean }[] = [];
  for (let i = 0; i <= span.days; i++) {
    const day = addDays(from, i);
    const date = new Date(`${day}T12:00:00Z`);
    if (date.getUTCDate() === 1) ticks.push({ day, label: date.toLocaleDateString(locale(), { month: phone || range !== 'weeks' ? 'short' : 'long', timeZone: 'UTC' }), month: true });
    if (!phone && range === 'weeks' && date.getUTCDay() === 1) ticks.push({ day, label: String(date.getUTCDate()), month: false });
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
          {(['weeks', 'months', 'quarters'] as const).map((r) => (
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
        {rows.length === 0 && <p className="tl-empty">{t('timeline.empty')}</p>}
        {rows.map((record) => {
          const s0 = dayOf(record.values[start]) || dayOf(record.values[end]);
          const e0 = dayOf(record.values[end]) || s0;
          const shift = drag?.id === record.id ? drag.days : 0;
          const s = drag?.edge ? s0 : addDays(s0, shift);
          const e = addDays(e0, shift);
          const tone = colorField ? valueText(record.values[colorField.key] ?? null) : '';
          const hue = colorField ? hueStyle(optionColor(colorField, tone), tone || recordLabel(record)) : undefined;
          const over = late && record.values[late] === true && e < today;
          const said = sub.map((key) => {
            const field = fieldOf(key);
            const value = record.values[key];
            return field && value !== undefined && value !== null && value !== '' ? valueText(value) : '';
          }).filter(Boolean);
          const own = marks ? markRecords.filter((m) => {
            const link = m.values[marks.link];
            return (Array.isArray(link) ? link : [link]).some((l) => isLink(l) && l.id === record.id);
          }) : [];
          return (
            <div key={record.id} className="tl-r">
              <button type="button" className="nm" onClick={() => onOpen(record.id)}>
                <b>{recordTitle(record)}</b>
                {said.length > 0 && <small>{said.join(' · ')}</small>}
              </button>
              <div className="lane">
                <span
                  className={['bar', s < from && 'cut', between(from, e) > span.days && 'out', drag?.id === record.id && 'dragging'].filter(Boolean).join(' ')}
                  style={{ ...hue, left: `${at(s)}%`, width: `${Math.max(0.6, at(e) - at(s))}%` }}
                  title={recordLabel(record)}
                  onPointerDown={(event) => down(event, record, false)}
                  onPointerMove={move}
                  onPointerUp={() => up(record)}
                  onPointerCancel={() => setDrag(null)}
                >
                  {!phone && movable(end) && <span className="h" onPointerDown={(event) => down(event, record, true)} onPointerMove={move} onPointerUp={() => up(record)} />}
                </span>
                {over && <span className="over" style={{ left: `${at(e)}%`, width: `${at(today) - at(e)}%` }} />}
                {own.map((m) => {
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
