import type { ChatInfo } from '@scrawlnotes/core';
import { locale, t } from '@scrawlnotes/i18n';
import type { ReactNode } from 'react';
import type { ChatServer } from './chatStore';
import { Icon } from './Icon';

// What Chat's windows show of people and conversations alike: a face in its colour with its dot,
// what a conversation is called and the mark before its name, someone's name by id, and times.

/** A day as a message's link back names it: Oct 24, and the year when it is not this one. */
export function shortDay(at: number): string {
  const day = new Date(at);
  return day.toLocaleDateString(locale(), { month: 'short', day: 'numeric', ...(day.getFullYear() !== new Date().getFullYear() && { year: 'numeric' }) });
}

/** Someone's name in a conversation, from the people the server named; Someone when it named them nowhere. */
export function namesOf(server: ChatServer): (id: string) => string {
  const names = new Map<string, string>();
  for (const chat of server.chats) for (const person of chat.members) names.set(person.id, person.name);
  return (id) => names.get(id) || t('card.someone');
}

/** What a conversation is called in the list and over it: a room's name, or the others in a direct message. */
export function titleOf(chat: ChatInfo, me: string): string {
  if (chat.kind !== 'direct') return chat.name;
  const others = chat.members.filter((person) => person.id !== me);
  if (others.length === 1) return others[0]!.name;
  return others.map((person) => person.name.split(/\s+/)[0]).join(', ');
}

export const others = (chat: ChatInfo, me: string) => chat.members.filter((person) => person.id !== me);

/** A face's colour, the same for someone wherever they show. */
export function hueOf(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return Math.abs(hash) % 6;
}

/** A person's round face with their initial; an agent's is a square (design/chat.md, 9). */
export function Face({ id, name, size = 'md', online = false, agent = false }: { id: string; name: string; size?: 'sm' | 'xs' | 'md' | 'lg' | 'xl'; online?: boolean; agent?: boolean }) {
  return (
    <span className={`ch-face ${size} ${agent ? 'ag' : `h${hueOf(id)}`}`} aria-hidden="true">
      {(name.trim()[0] ?? '?').toUpperCase()}
      {online && <i />}
    </span>
  );
}

export const timeOf = (at: number) => new Date(at).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' });

/** What goes before a conversation's name in a list: the other's face with its dot, two faces, a lock or #. */
export function leadOf(chat: ChatInfo, server: ChatServer): ReactNode {
  const people = others(chat, server.me);
  if (chat.kind === 'private') return <Icon name="lock" />;
  if (chat.kind !== 'direct') return <span className="hs">#</span>;
  if (people.length === 1) return <Face id={people[0]!.id} name={people[0]!.name} size="sm" online={server.active.includes(people[0]!.id)} />;
  return (
    <span className="ch-faces">
      {people.slice(0, 2).map((person) => (
        <Face key={person.id} id={person.id} name={person.name} size="xs" />
      ))}
    </span>
  );
}
