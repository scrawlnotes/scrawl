import { type Column, type PersonRef, refOf } from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import { type KeyboardEvent, useState } from 'react';
import { isPhone } from './device';
import { Dialog } from './dialogs';
import { Icon } from './Icon';
import { peopleChoices } from './mentionChoices';
import { NameOf, type SpacePeople, WhoOf } from './People';

// Notify others… (design/notifications.md 20.2): who a column tells of a card come to it. A space
// may have a hundred people: they are found by name, never listed whole; those told are under the
// box, each with × to stop. A change is written at once; there is no Save.

/** The most people a name finds at once. */
const FOUND = 6;

export function ColumnNotify({ column, board, team, members, onChange, onClose }: {
  column: Column;
  /** The board's name, under the window's title. */
  board: string;
  team: SpacePeople;
  /** Those in the space on its server; null when it is not known, and everyone shown is offered. */
  members: Set<string> | null;
  onChange: (people: PersonRef[]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [hot, setHot] = useState(0);
  const told = column.notify ?? [];
  const has = new Set(told.map((person) => person.id));
  // Found by a word of the name, as the @ list finds them; agents and those gone are not offered.
  const found = query.trim() ? peopleChoices(team.people, undefined, query.trim().toLowerCase(), members).filter((choice) => !has.has(choice.key)).slice(0, FOUND) : [];
  const picked = Math.min(hot, Math.max(0, found.length - 1));
  const add = (id: string) => {
    const person = team.people.find((each) => each.id === id);
    if (!person) return;
    onChange([...told, refOf(person)]);
    setQuery('');
    setHot(0);
  };
  const onKey = (event: KeyboardEvent) => {
    if (!found.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setHot((picked + (event.key === 'ArrowDown' ? 1 : -1) + found.length) % found.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      add(found[picked]!.key);
    }
  };
  return (
    <Dialog label={t('board.notifyOthers')} className="col-notify" onClose={onClose}>
      {/* A phone's sheet has its own ×, and its title in the middle of its head. */}
      {isPhone() ? (
        <h2>{t('board.notifyOthers')}</h2>
      ) : (
        <div className="cn-head">
          <h2>{t('board.notifyOthers')}</h2>
          <button type="button" className="x" aria-label={t('dialog.close')} title={t('dialog.close')} onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
      )}
      <p className="cn-t">{t('board.notifyTitle', { column: column.name })}</p>
      <p className="cn-sub">{board}</p>
      <div className="cn-find">
        <label className="cn-box">
          <Icon name="search" />
          <input
            autoFocus
            role="combobox"
            aria-expanded={found.length > 0}
            aria-controls="cn-found"
            aria-label={t('board.notifyFind')}
            placeholder={t('board.notifyFind')}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setHot(0);
            }}
            onKeyDown={onKey}
          />
        </label>
        {found.length > 0 && (
          <div className="cn-found" id="cn-found" role="listbox">
            {found.map((choice, i) => (
              <button type="button" role="option" aria-selected={i === picked} key={choice.key} className={i === picked ? 'r hot' : 'r'} onMouseDown={(event) => event.preventDefault()} onClick={() => add(choice.key)}>
                <WhoOf who={{ id: choice.key, name: choice.label }} people={team.people} />
                <span>{choice.label}</span>
              </button>
            ))}
          </div>
        )}
        {query.trim() && !found.length && <p className="cn-none">{t('board.notifyNobody')}</p>}
      </div>
      <div className="cn-cap">
        {t('board.notified')}
        <small>{told.length}</small>
      </div>
      {told.length ? (
        <ul className="cn-who">
          {told.map((person) => (
            <li key={person.id}>
              <WhoOf who={person} people={team.people} />
              <span className="nm">
                <NameOf who={person} people={team.people} />
                {person.id === team.me && <small> {t('board.you')}</small>}
              </span>
              <button
                type="button"
                className="x"
                aria-label={t('board.stopNotifying', { name: person.name ?? '' })}
                title={t('board.stopNotifying', { name: person.name ?? '' })}
                onClick={() => onChange(told.filter((each) => each.id !== person.id))}
              >
                <Icon name="close" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="cn-none">{t('board.notifiesNobody')}</p>
      )}
      <p className="cn-note">{t('board.notifyNote')}</p>
    </Dialog>
  );
}
