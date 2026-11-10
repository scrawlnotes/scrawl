import type { Person } from '@scrawlnotes/core';
import { describe, expect, it } from 'vitest';
import { agentChoices, peopleChoices } from './mentionChoices';

// Who @ offers in a description or a comment (design/notifications.md 2).

const person = (id: string, name: string, more: Partial<Person> = {}): Person => ({ id, name, seen: '2026-11-08T09:00:00.000Z', active: true, ...more });
const PEOPLE = [
  person('kaan', 'Kaan Arslan'),
  person('mert', 'Mert Kaya'),
  person('old-mert', 'Mert Kaya'),
  person('elif', 'Elif Demir', { active: false }),
  person('kaan:laptop', 'Claude Code (Laptop)'),
  person('ahmet', 'Ahmet Yıldız'),
];

describe('peopleChoices', () => {
  it('offers the others, not agents nor anyone made inactive, by the start of a word of the name', () => {
    expect(peopleChoices(PEOPLE, 'kaan', '').map((each) => each.key)).toEqual(['mert', 'old-mert', 'ahmet']);
    expect(peopleChoices(PEOPLE, 'kaan', 'ka').map((each) => each.key)).toEqual(['mert', 'old-mert']);
    expect(peopleChoices(PEOPLE, 'kaan', 'cl')).toEqual([]);
  });

  it('on a server, only those in the space there, each as a mention', () => {
    expect(peopleChoices(PEOPLE, 'kaan', 'me', new Set(['kaan', 'mert']))).toEqual([{ key: 'mert', label: 'Mert Kaya', insert: '[@Mert Kaya](scrawl:person/mert)' }]);
  });
});

describe('agentChoices', () => {
  it('offers the person’s agents they wake, by the start of a word of the name, as a mention of the agent', () => {
    const agents = [
      { id: 'kaan:3f9c', name: 'Claude', how: 'claude' as const, host: 'api.anthropic.com' },
      { id: 'kaan:77aa', name: 'n8n flows', how: 'other' as const, host: 'n8n.example.com' },
    ];
    expect(agentChoices(agents, 'cl', 'Your agent')).toEqual([{ key: 'kaan:3f9c', label: 'Claude', sub: 'Your agent', agent: true, insert: '[@Claude](scrawl:person/kaan%3A3f9c)' }]);
    expect(agentChoices(agents, 'fl', 'Your agent').map((each) => each.key)).toEqual(['kaan:77aa']);
  });
});
