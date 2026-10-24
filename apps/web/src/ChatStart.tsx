import type { ChatInfo } from '@scrawlnotes/core';
import { locale, t } from '@scrawlnotes/i18n';
import { type ReactNode, useState } from 'react';
import { Face, namesOf, others, shortDay, titleOf } from './ChatFaces';
import type { ChatServer } from './chatStore';
import { Icon, type IconName } from './Icon';

// A conversation's start, and Chat with little in it (design/chat.md 25; design/mockups.html,
// Messaging, Boş and Telefon boş): a conversation opens on what it is and what to do first, as
// Slack's channel does; the lists offer the people to write to, or to invite them.

/** The people one shares a space with on a server, each with a space they share: whom a direct message can be with. */
export function teammatesOf(server: ChatServer): { id: string; name: string; space: string }[] {
  const found = new Map<string, { id: string; name: string; space: string }>();
  for (const chat of server.chats) {
    // Everyone in a space is in its general room.
    if (!chat.general) continue;
    for (const person of chat.members) if (person.id !== server.me && !found.has(person.id)) found.set(person.id, { id: person.id, name: person.name, space: chat.spaceName });
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name, locale()));
}

/** The people to write to who have no direct message with this person yet: what a list offers under its direct messages. */
export function notWrittenTo(server: ChatServer): { id: string; name: string; space: string }[] {
  const written = new Set(
    server.chats.flatMap((chat) => {
      const people = chat.kind === 'direct' && !chat.hidden ? others(chat, server.me) : [];
      return people.length === 1 ? [people[0]!.id] : [];
    }),
  );
  return teammatesOf(server).filter((person) => !written.has(person.id));
}

/** The sections of Chat's list folded on this device. */
const FOLDED = 'scrawl.chatFolded';

/**
 * Chat's sections folded on this device, as Slack's are: a server's space, or its direct messages
 * (space null). A folded one still shows the conversation open and those with something unread.
 */
export function useFolded() {
  const [folded, setFolded] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(FOLDED) ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  });
  const key = (url: string, space: string | null) => `${url}\n${space ?? 'direct'}`;
  return {
    isFolded: (url: string, space: string | null) => folded.has(key(url, space)),
    toggle: (url: string, space: string | null) =>
      setFolded((was) => {
        const now = new Set(was);
        if (!now.delete(key(url, space))) now.add(key(url, space));
        try {
          localStorage.setItem(FOLDED, JSON.stringify([...now]));
        } catch {
          // Not kept: folded while the page is open.
        }
        return now;
      }),
  };
}

/** What a folded section still shows: the conversation open, and one with something unread. */
export const staysFolded = (chat: ChatInfo, open: boolean) => open || (chat.unread > 0 && chat.notify !== 'off');

/** The spaces someone shares with this person, by name. */
function sharedSpaces(server: ChatServer, person: string): string[] {
  return server.chats.filter((chat) => chat.general && chat.members.some((each) => each.id === person)).map((chat) => chat.spaceName);
}

const listOf = (names: string[]) => new Intl.ListFormat(locale(), { type: 'conjunction' }).format(names);

/**
 * The start of a conversation, over its first message: a room's mark or the other's face, its name,
 * what it is, when it was opened, and what to do first: Invite people to its space from a general
 * room, Add people to a private room, Add a topic where there is none, for those who change the room.
 */
export function ChatIntro({ server, chat, phone = false, onInvite, onTopic, onAddPeople }: {
  server: ChatServer;
  chat: ChatInfo;
  phone?: boolean;
  onInvite: (space: string) => void;
  onTopic: () => void;
  onAddPeople: () => void;
}) {
  const people = others(chat, server.me);
  let lead: ReactNode;
  let title: string;
  let text: string;
  let small: string | null = null;
  const acts: { icon: IconName; label: string; run: () => void }[] = [];
  if (chat.kind === 'direct') {
    title = titleOf(chat, server.me);
    if (people.length === 1) {
      const person = people[0]!;
      lead = <Face id={person.id} name={person.name} size="xl" />;
      text = t('chat.introDirect', { name: person.name });
      const spaces = sharedSpaces(server, person.id);
      if (spaces.length) small = t('chat.sharesSpaces', { name: person.name.split(/\s+/)[0]!, spaces: listOf(spaces) });
    } else {
      lead = (
        <span className="ch-faces">
          {people.slice(0, 2).map((person) => (
            <Face key={person.id} id={person.id} name={person.name} size="lg" />
          ))}
        </span>
      );
      text = t('chat.introGroup', { names: title });
    }
  } else {
    lead = chat.kind === 'private' ? <Icon name="lock" /> : '#';
    title = chat.kind === 'private' ? chat.name : `#${chat.name}`;
    text = chat.general
      ? t('chat.introGeneral', { name: chat.name, space: chat.spaceName })
      : chat.kind === 'private'
        ? t('chat.introPrivate', { name: chat.name })
        : t('chat.introPublic', { name: chat.name, space: chat.spaceName });
    const day = shortDay(chat.createdAt);
    small = chat.general || chat.createdBy === server.me ? t('chat.openedOn', { day }) : t('chat.openedBy', { name: namesOf(server)(chat.createdBy), day });
    const open = chat.archived === null;
    if (open && chat.general && chat.manage && chat.space) {
      const space = chat.space;
      acts.push({ icon: 'people', label: phone ? t('chat.invitePeople') : t('chat.invitePeopleTo', { space: chat.spaceName }), run: () => onInvite(space) });
    }
    if (open && chat.kind === 'private' && chat.joined) acts.push({ icon: 'people', label: t('chat.addPeople'), run: onAddPeople });
    if (open && chat.manage && !chat.topic) acts.push({ icon: 'pen', label: t('chat.addTopic'), run: onTopic });
  }
  return (
    <div className={phone ? 'ch-intro phone' : 'ch-intro'}>
      <span className={chat.kind === 'direct' ? 'big face' : 'big'}>{lead}</span>
      <h3>{title}</h3>
      {chat.topic && <p className="topic">{chat.topic}</p>}
      <p>{text}</p>
      {small && <small>{small}</small>}
      {acts.length > 0 && (
        <div className="ias">
          {acts.map((act) => (
            <button type="button" key={act.label} className="ia" onClick={act.run}>
              <Icon name={act.icon} />
              <span>{act.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
