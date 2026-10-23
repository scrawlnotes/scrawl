import { type Card, isAgent, isAgentId, ownerName, ownerOf, type Person, type PersonRef, refName, refOf, workersOf } from '@scrawlnotes/core';
import { locale, t } from '@scrawlnotes/i18n';
import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { pageBox, pageWindow } from './device';

// Giving a task or a card to someone, after the Assign and Card assign views of
// design/mockups.html: the people of its space, found as they are typed, with Nobody first, and
// its agents under them; who it is given to shows on its row by a round initial and a first name.
// An agent shows as a square with its client's first letter, its name with whose it is after it,
// faint, wherever it shows (design/activity.md 4).

/** The people of a space beside the personal one, where tasks and cards are given to someone. */
export interface SpacePeople {
  /** What the space is called. */
  name: string;
  people: Person[];
  /** The user's id, said "you" in the list. */
  me?: string;
}

/** An agent's own row among a space's people, once it has written itself in. */
const rowOf = (id: string | undefined, people: Person[]) => (id ? people.find((person) => person.id === id) : undefined);

/**
 * Whose an agent is, by first name, as the screens show it after its name: "Kaan". None for a
 * person, and none for an agent the space's people do not have, whose name says it as written.
 */
export function ownerFirst(ref: { id?: string }, people: Person[] = []): string | undefined {
  const row = isAgentId(ref.id) ? rowOf(ref.id, people) : undefined;
  return row ? ownerName(row, people)?.split(/\s+/)[0] : undefined;
}

/** What someone given a task is called now: an agent with whose it is; Unnamed for a person without a name. */
export function assigneeLabel(ref: PersonRef, people: Person[] = []): string {
  const name = refName(ref, people) ?? t('settings.unnamed');
  const owner = ownerFirst(ref, people);
  return owner ? `${name} · ${owner}` : name;
}

/** The letter someone shows by: a person's initial, an agent's client's; `?` for one without a name. */
export const initialOf = (ref: PersonRef, people: Person[] = []) => (rowOf(ref.id, people)?.agent?.client ?? refName(ref, people) ?? '?').slice(0, 1).toUpperCase();

/** A round initial: of a person, or `?` for one without a name; an agent's is a square. */
export function Who({ name, agent = false }: { name: string | undefined; agent?: boolean }) {
  return (
    <span className={agent ? 'who bot' : 'who'} aria-hidden="true">
      {name ? name.slice(0, 1).toUpperCase() : '?'}
    </span>
  );
}

/** The face of whoever a reference is: a person's round initial, an agent's square; `small` beside another on a card's face. */
export function WhoOf({ who, people = [], small = false }: { who: PersonRef; people?: Person[]; small?: boolean }) {
  return (
    <span className={`who${isAgentId(who.id) ? ' bot' : ''}${small ? ' sm' : ''}`} aria-hidden="true" title={small ? assigneeLabel(who, people) : undefined}>
      {initialOf(who, people)}
    </span>
  );
}

/** Someone's name as it shows: a person's, the first word alone with `first`; an agent's, with whose it is after it, faint. */
export function NameOf({ who, people = [], first = false }: { who: PersonRef; people?: Person[]; first?: boolean }) {
  const name = refName(who, people);
  const owner = ownerFirst(who, people);
  if (owner) {
    return (
      <>
        {name}
        <span className="of"> · {owner}</span>
      </>
    );
  }
  return <>{name ? (first && !isAgentId(who.id) ? name.split(/\s+/)[0] : name) : t('settings.unnamed')}</>;
}

/** The name of someone given a task, as a row shows them: a person's first name, an agent's name and whose it is; Unnamed for one without a name. */
export function firstName(ref: PersonRef, people: Person[] = []): string {
  if (isAgentId(ref.id)) return assigneeLabel(ref, people);
  return refName(ref, people)?.split(/\s+/)[0] ?? t('settings.unnamed');
}

/** Who a task or a card is given to, on its row: their initial and first name; an agent's square, name and whose it is. */
export function AssigneeChip({ assignee, people }: { assignee: PersonRef; people?: Person[] }) {
  return (
    <span className="assignee" title={assigneeLabel(assignee, people ?? [])}>
      <WhoOf who={assignee} people={people} />
      <span>
        <NameOf who={assignee} people={people} first />
      </span>
    </span>
  );
}

/** On a card's face: who it is given to, and before them a small square for each agent that worked on it, up to three. */
export function CardWho({ card, people = [] }: { card: Pick<Card, 'assignee' | 'workedOn'>; people?: Person[] }) {
  const agents = workersOf(card as Card)
    .filter((worker) => isAgentId(worker.id) && worker.id !== card.assignee?.id)
    .slice(0, 3);
  if (!card.assignee && agents.length === 0) return null;
  return (
    <span className="whos">
      {agents.map((worker) => (
        <WhoOf key={worker.id} who={{ id: worker.id, name: worker.name }} people={people} small />
      ))}
      {card.assignee && (
        <span title={assigneeLabel(card.assignee, people)}>
          <WhoOf who={card.assignee} people={people} />
        </span>
      )}
    </span>
  );
}

/** Whether a card has anything for its face's people: who it is given to, or an agent that worked on it. */
export const hasCardWho = (card: Pick<Card, 'assignee' | 'workedOn'>) => !!card.assignee || !!card.workedOn?.some((worker) => isAgentId(worker.id));

/** "Jonas Weber and Ayşe are inactive and not offered": the people a picker leaves out, by name. */
function inactiveNote(people: Person[]): string | null {
  const names = people.filter((person) => !person.active && !isAgent(person)).map((person) => person.name ?? t('settings.unnamed'));
  if (names.length === 0) return null;
  return t('people.inactive', { count: names.length, names: new Intl.ListFormat(locale(), { type: 'conjunction' }).format(names) });
}

type Row = { nobody: true } | { person: Person };

/**
 * The people a task or a card can be given to, under the button that opened it: Nobody, then
 * the active people of its space, the user said "you", then its agents, each with whose it is,
 * the user's first; typed text finds them by name or email, an agent by whose it is too. The
 * arrows move through them, Enter or a click gives it, Esc closes. Under them, who is left out
 * for being inactive.
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
  const whose = (agent: Person) => ownerName(agent, team.people) ?? '';
  const found = (person: Person) =>
    !q || [person.name ?? t('settings.unnamed'), person.email ?? '', isAgent(person) ? whose(person) : ''].some((text) => text.toLowerCase().includes(q));
  const humans = team.people
    .filter((person) => person.active && !isAgent(person) && found(person))
    .sort((a, b) => rank(a) - rank(b) || (a.name ?? '').localeCompare(b.name ?? ''));
  const agents = team.people
    .filter((person) => person.active && isAgent(person) && found(person))
    .sort((a, b) => Number(ownerOf(b.id) === team.me) - Number(ownerOf(a.id) === team.me) || whose(a).localeCompare(whose(b)) || (a.name ?? '').localeCompare(b.name ?? ''));
  const offered = [...humans, ...agents];
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
        ) : isAgent(r.person) ? (
          <div key={r.person.id} className="rg-list">
            {r.person === agents[0] && <div className="rg">{t('people.agents')}</div>}
            {row(
              r,
              i,
              <>
                <Who name={r.person.agent?.client ?? r.person.name} agent />
                <b>{r.person.name ?? r.person.agent?.client ?? t('agents.unnamedAgent')}</b>
                <small>{ownerOf(r.person.id) === team.me ? t('people.yours') : t('people.whose', { name: whose(r.person).split(/\s+/)[0] || t('card.someone') })}</small>
              </>,
            )}
          </div>
        ) : (
          <div key={r.person.id} className="rg-list">
            {r.person === humans[0] && <div className="rg">{t('people.in', { space: team.name })}</div>}
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
        {agents.length > 0 || team.people.some(isAgent) ? t('people.everyoneAndAgents', { space: team.name }) : t('people.everyone', { space: team.name })}
        {note && ` ${note}`}
      </p>
    </div>,
    document.body,
  );
}
