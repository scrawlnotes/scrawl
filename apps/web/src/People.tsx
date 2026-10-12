import { type Person, type PersonRef, refName, refOf } from '@scrawlnotes/core';
import { locale, t } from '@scrawlnotes/i18n';
import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { pageBox, pageWindow } from './device';

// Giving a task or a card to someone, after the Assign and Card assign views of
// design/mockups.html: the people of its space, found as they are typed, with Nobody first; who
// it is given to shows on its row by a round initial and a first name.

/** The people of a space beside the personal one, where tasks and cards are given to someone. */
export interface SpacePeople {
  /** What the space is called. */
  name: string;
  people: Person[];
  /** The user's id, said "you" in the list. */
  me?: string;
}

/** What someone given a task is called now; Unnamed when they have no name. */
export const assigneeLabel = (ref: PersonRef, people: Person[] = []) => refName(ref, people) ?? t('settings.unnamed');

/** The initial someone given a task shows by; `?` for one without a name. */
export const initialOf = (ref: PersonRef, people: Person[] = []) => (refName(ref, people) ?? '?').slice(0, 1).toUpperCase();

/** A round initial: of a person, or `?` for one without a name. */
export function Who({ name }: { name: string | undefined }) {
  return (
    <span className="who" aria-hidden="true">
      {name ? name.slice(0, 1).toUpperCase() : '?'}
    </span>
  );
}

/** Who a task or a card is given to, on its row: their initial and first name. */
export function AssigneeChip({ assignee, people }: { assignee: PersonRef; people?: Person[] }) {
  const name = refName(assignee, people ?? []);
  return (
    <span className="assignee" title={name ?? t('settings.unnamed')}>
      <Who name={name} />
      <span>{name ? name.split(/\s+/)[0] : t('settings.unnamed')}</span>
    </span>
  );
}

/** "Jonas Weber and Ayşe are inactive and not offered": the people a picker leaves out, by name. */
function inactiveNote(people: Person[]): string | null {
  const names = people.filter((person) => !person.active).map((person) => person.name ?? t('settings.unnamed'));
  if (names.length === 0) return null;
  return t('people.inactive', { count: names.length, names: new Intl.ListFormat(locale(), { type: 'conjunction' }).format(names) });
}

type Row = { nobody: true } | { person: Person };

/**
 * The people a task or a card can be given to, under the button that opened it: Nobody, then
 * the active people of its space, the user said "you"; typed text finds them by name or email.
 * The arrows move through them, Enter or a click gives it, Esc closes. Under them, who is left
 * out for being inactive.
 */
export function PersonPicker({ anchor, team, current, width = 310, onPick, onClose }: {
  anchor: HTMLElement;
  team: SpacePeople;
  current: PersonRef | null;
  width?: number;
  onPick: (assignee: PersonRef | null) => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState('');
  // The row the keys are on: at first the one given to now, Nobody when no one is.
  const [moved, setAt] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const q = typed.trim().toLowerCase();
  const rank = (person: Person) => (person.id === team.me ? 0 : person.name ? 1 : 2);
  const offered = team.people
    .filter((person) => person.active)
    .filter((person) => !q || (person.name ?? t('settings.unnamed')).toLowerCase().includes(q) || (person.email ?? '').toLowerCase().includes(q))
    .sort((a, b) => rank(a) - rank(b) || (a.name ?? '').localeCompare(b.name ?? ''));
  const rows: Row[] = [...(q ? [] : [{ nobody: true as const }]), ...offered.map((person) => ({ person }))];
  const given = (r: Row) => ('nobody' in r ? !current : current?.id === r.person.id);
  const at = moved ?? Math.max(0, rows.findIndex(given));
  const pick = (row: Row | undefined) => {
    if (!row) return;
    onPick('nobody' in row ? null : refOf(row.person));
  };
  // Under the button, or over it when there is more room there.
  useLayoutEffect(() => {
    const button = pageBox(anchor);
    const page = pageWindow();
    const left = Math.max(8, Math.min(button.right - width, page.width - width - 8));
    const below = page.height - button.bottom;
    setPlace(below < 280 && button.top > below ? { bottom: page.height - button.top + 4, left, width } : { top: button.bottom + 4, left, width });
  }, [anchor, width]);
  useEffect(() => {
    const away = (event: globalThis.MouseEvent) => {
      const target = event.target as Node;
      if (!box.current?.contains(target) && !anchor.contains(target)) close.current();
    };
    window.addEventListener('mousedown', away);
    return () => window.removeEventListener('mousedown', away);
  }, [anchor]);
  useEffect(() => {
    if (at > rows.length - 1) setAt(Math.max(0, rows.length - 1));
  }, [rows.length, at]);
  const row = (r: Row, i: number, label: ReactNode) => (
    <button
      key={'nobody' in r ? 'nobody' : r.person.id}
      type="button"
      role="option"
      aria-selected={i === at}
      tabIndex={-1}
      className={`rr${i === at ? ' at' : ''}${'person' in r && !r.person.name ? ' dim' : ''}${given(r) ? ' on' : ''}`}
      onMouseDown={(event) => event.preventDefault()}
      onMouseMove={() => i !== at && setAt(i)}
      onClick={() => pick(r)}
    >
      {label}
    </button>
  );
  const note = inactiveNote(team.people);
  return createPortal(
    <div ref={box} className="opt-list rpick ppick" role="listbox" aria-label={t('people.assign')} style={place ?? { opacity: 0 }}>
      <input
        autoFocus
        aria-label={t('people.find')}
        placeholder={t('people.find')}
        value={typed}
        onChange={(event) => {
          setTyped(event.target.value);
          setAt(0);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') setAt(at >= rows.length - 1 ? 0 : at + 1);
          else if (event.key === 'ArrowUp') setAt(at <= 0 ? rows.length - 1 : at - 1);
          else if (event.key === 'Enter') pick(rows[at]);
          else if (event.key === 'Escape') onClose();
          else return;
          event.preventDefault();
          event.stopPropagation();
        }}
      />
      {rows.map((r, i) =>
        'nobody' in r ? (
          row(
            r,
            i,
            <>
              <span className="who none" aria-hidden="true" />
              <b>{t('people.nobody')}</b>
            </>,
          )
        ) : (
          <div key={r.person.id} className="rg-list">
            {i === (q ? 0 : 1) && <div className="rg">{t('people.in', { space: team.name })}</div>}
            {row(
              r,
              i,
              <>
                <Who name={r.person.name} />
                <b>{r.person.name ?? t('settings.unnamed')}</b>
                <small>{r.person.id === team.me ? t('settings.itsYou') : (r.person.email ?? '')}</small>
              </>,
            )}
          </div>
        ),
      )}
      {offered.length === 0 && q && <p className="rnone">{t('people.noneFound')}</p>}
      <p className="pnote">
        {t('people.everyone', { space: team.name })}
        {note && ` ${note}`}
      </p>
    </div>,
    document.body,
  );
}
