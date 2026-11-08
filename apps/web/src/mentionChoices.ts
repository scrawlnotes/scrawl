import { isAgent, type Person, personLink } from '@scrawlnotes/core';

// What the @ list offers (Mentions.tsx), apart from the screen, to be tried on its own.

export interface MentionChoice {
  key: string;
  label: string;
  sub?: string;
  /** What goes in for it. */
  insert: string;
}

/**
 * A space's people as @ offers them: not this person, no agent, no one made inactive; on a server
 * only those in the space there (`members`); a word of the name starting with what is typed.
 */
export function peopleChoices(people: Person[], me: string | undefined, query: string, members: Set<string> | null = null): MentionChoice[] {
  return people
    .filter((person) => person.id !== me && !isAgent(person) && person.active && (!members || members.has(person.id)) && person.name?.toLowerCase().split(/\s+/).some((word) => word.startsWith(query)))
    .map((person) => ({ key: person.id, label: person.name!, insert: personLink(person.name!, person.id) }));
}
