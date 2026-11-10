import { isAgent, type Person, personLink } from '@scrawlnotes/core';
import type { WakeableAgent } from './wakeable';

// What the @ list offers (Mentions.tsx), apart from the screen, to be tried on its own.

export interface MentionChoice {
  key: string;
  label: string;
  sub?: string;
  /** What goes in for it. */
  insert: string;
  /** An agent: its face is square. */
  agent?: boolean;
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

/** The person's agents they wake (design/agent-wake.md 3.3), after the people: a word of the name starting with what is typed; `sub` says whose. */
export function agentChoices(agents: WakeableAgent[], query: string, sub: string): MentionChoice[] {
  return agents
    .filter((agent) => agent.name.toLowerCase().split(/\s+/).some((word) => word.startsWith(query)))
    .map((agent) => ({ key: agent.id, label: agent.name, sub, agent: true, insert: personLink(agent.name, agent.id) }));
}
