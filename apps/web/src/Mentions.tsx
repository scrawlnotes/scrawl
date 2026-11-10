import { mentionAt, spaceOf } from '@scrawlnotes/core';
import type { ScrawlEditor } from '@scrawlnotes/editor';
import { t } from '@scrawlnotes/i18n';
import { type KeyboardEvent, type ReactNode, type RefObject, useState } from 'react';
import { createPortal } from 'react-dom';
import { Face } from './ChatFaces';
import { store } from './chatStore';
import { isPhone } from './device';
import { agentChoices, type MentionChoice, peopleChoices } from './mentionChoices';
import type { SpacePeople } from './People';
import { useWakeable } from './wakeable';

// The @ list (design/chat.md 3.5, design/notifications.md 2): typing @ where the cursor is lists
// the people who can be mentioned, narrowed as the name is typed; the arrows move, Enter or Tab
// picks, Escape closes; the one picked goes in as a mention's link, `[@Mert Kaya](scrawl:person/<id>)`,
// which the editor shows as a chip. Chat's box, a card's or a task's description and a card's
// comments have it, each in an editor of its own.

interface Typed {
  from: number;
  to: number;
  query: string;
  /** The choice the arrows are on. */
  at: number;
}


/**
 * The @ list of an editor: `choicesFor` gives what is offered for the words typed after @. The box
 * calls `look` as its words or its cursor change, and gives its keys to `onKeyDown` first.
 */
export function useMentions(editor: RefObject<ScrawlEditor | null>, choicesFor: (query: string) => MentionChoice[]) {
  const [typed, setTyped] = useState<Typed | null>(null);
  const look = () => {
    const view = editor.current?.view;
    if (!view) return setTyped(null);
    const head = view.state.selection.main.head;
    const line = view.state.doc.lineAt(head);
    const found = mentionAt(line.text, head - line.from);
    setTyped((was) => (found ? { from: line.from + found.from, to: head, query: found.query, at: was && was.from === line.from + found.from ? was.at : 0 } : null));
  };
  const choices = typed ? choicesFor(typed.query.toLowerCase()) : [];
  const open = typed !== null && choices.length > 0;
  const picked = typed ? Math.min(typed.at, Math.max(0, choices.length - 1)) : 0;
  const choose = (choice: MentionChoice) => {
    const view = editor.current?.view;
    if (!view || !typed) return;
    const insert = `${choice.insert} `;
    view.dispatch({ changes: { from: typed.from, to: typed.to, insert }, selection: { anchor: typed.from + insert.length } });
    setTyped(null);
    view.focus();
  };
  /** @ where the cursor is, apart from a word before it: the list opens. */
  const start = () => {
    const view = editor.current?.view;
    if (!view) return;
    const head = view.state.selection.main.head;
    const before = view.state.doc.sliceString(Math.max(0, head - 1), head);
    const insert = before && !/\s/.test(before) ? ' @' : '@';
    view.dispatch({ changes: { from: head, insert }, selection: { anchor: head + insert.length } });
    view.focus();
    window.setTimeout(look);
  };
  /** A key while the list is open: the list's own, which goes no further. Whether it was. */
  const onKeyDown = (event: KeyboardEvent): boolean => {
    if (!open || !typed) return false;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setTyped({ ...typed, at: (picked + step + choices.length) % choices.length });
      return true;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      choose(choices[picked]!);
      return true;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setTyped(null);
      return true;
    }
    return false;
  };
  /** Where the @ is on screen, for a list shown at it. */
  const caret = () => (typed ? (editor.current?.view.coordsAtPos(typed.from) ?? null) : null);
  return { open, choices, picked, look, choose, start, onKeyDown, caret, close: () => setTyped(null) };
}

/**
 * The list. Chat's sits over its box, where its own style puts it; one of a description or a
 * comment opens under the @, or over it when there is no room under it (a phone's keyboard).
 */
export function MentionList({ caption, choices, picked, onChoose, face, at }: {
  caption: string;
  choices: MentionChoice[];
  picked: number;
  onChoose: (choice: MentionChoice) => void;
  face: (choice: MentionChoice) => ReactNode;
  at?: { left: number; top: number; bottom: number } | null;
}) {
  // On a phone across the screen, its rows tall enough for a finger.
  const phone = isPhone();
  const list = (style?: React.CSSProperties) => (
    <div className={at ? (phone ? 'ch-pop at-caret phone' : 'ch-pop at-caret') : 'ch-pop'} role="listbox" style={style}>
      <div className="cap">{caption}</div>
      {choices.map((choice, i) => (
        <button
          type="button"
          role="option"
          aria-selected={i === picked}
          key={choice.key}
          className={i === picked ? 'r hot' : 'r'}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChoose(choice)}
        >
          {face(choice)}
          <span>{choice.label}</span>
          {choice.sub && <small>{choice.sub}</small>}
        </button>
      ))}
    </div>
  );
  if (at === undefined) return list();
  if (!at) return null;
  // Its rows and the caption: whether it fits under the @, in what is seen of the window.
  const height = 30 + choices.length * (phone ? 44 : 30);
  const seen = window.visualViewport?.height ?? window.innerHeight;
  const under = at.bottom + 4 + height <= seen;
  const side = phone ? { left: 8, right: 8, width: 'auto' } : { left: Math.max(8, Math.min(at.left - 8, window.innerWidth - 300)) };
  return createPortal(list(under ? { ...side, top: at.bottom + 4 } : { ...side, top: Math.max(8, at.top - 4 - height) }), document.body);
}

/** Those in a space on its server, as its general room has everyone in it; null for a space on no server here. */
function membersOf(space: string | null): Set<string> | null {
  const general = space ? store.read().servers.flatMap((server) => server.chats).find((chat) => chat.general && chat.space === space) : undefined;
  return general ? new Set(general.members.map((person) => person.id).filter((id) => !general.gone.includes(id))) : null;
}

/** The server a space is on here, by its general room; null for a space on no server. */
function serverOf(space: string | null): string | null {
  return (space && store.read().servers.find((server) => server.chats.some((chat) => chat.general && chat.space === space))?.url) || null;
}

/**
 * The @ list of a task's or a card's description or a card's comment, of the list or the board at
 * `home`: the people of its space, then on a server the person's agents they wake.
 */
export function useSpaceMentions(editor: RefObject<ScrawlEditor | null>, team: SpacePeople | null, home: string) {
  const agents = useWakeable(serverOf(spaceOf(home)));
  return useMentions(editor, (query) => (team ? [...peopleChoices(team.people, team.me, query, membersOf(spaceOf(home))), ...agentChoices(agents, query, t('mention.yourAgent'))] : []));
}

/** That list, at the @, when it is open. */
export function SpaceMentionList({ mentions, team }: { mentions: ReturnType<typeof useMentions>; team: SpacePeople | null }) {
  if (!mentions.open || !team) return null;
  return (
    <MentionList
      caption={t('mention.people', { space: team.name })}
      choices={mentions.choices}
      picked={mentions.picked}
      onChoose={mentions.choose}
      face={(choice) => <Face id={choice.key} name={choice.label} size="sm" agent={choice.agent} />}
      at={mentions.caret()}
    />
  );
}
