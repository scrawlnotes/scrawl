import { describe, expect, it } from 'vitest';
import { type AgentConversation, withMentions } from './chat';

// What an agent writes in a message: @Name and @room become mentions as the app writes them
// (design/chat.md, 3.5 and 9). The rest is tried through a server's /mcp (apps/server, agent.test.ts).

const room: AgentConversation = {
  id: 'ch-dev',
  name: '#dev',
  kind: 'public',
  space: { id: 'sp-acme', name: 'Acme' },
  people: [
    { id: 'p-mert', name: 'Mert Kaya' },
    { id: 'p-elif', name: 'Elif Demir' },
    { id: 'p-elif2', name: 'Elif Şahin' },
  ],
  unread: 0,
  last: null,
  archived: false,
};

describe('mentions', () => {
  it('makes @Name a mention of someone in the conversation, by the full name or a first name only one has', () => {
    expect(withMentions('@Mert Kaya and @mert, look', room)).toBe('[@Mert Kaya](scrawl:person/p-mert) and [@Mert Kaya](scrawl:person/p-mert), look');
    expect(withMentions('Thanks @Elif Şahin!', room)).toBe('Thanks [@Elif Şahin](scrawl:person/p-elif2)!');
    // Two people are Elif: the first name alone is no one's.
    expect(withMentions('@Elif, look', room)).toBe('@Elif, look');
    // Not a mention made already, nor an address, nor a name inside a word.
    expect(withMentions('[@Mert Kaya](scrawl:person/p-mert) mert@example.com @Mertcan', room)).toBe('[@Mert Kaya](scrawl:person/p-mert) mert@example.com @Mertcan');
  });

  it('makes @room everyone in a room, and leaves it in a direct message', () => {
    expect(withMentions('@room the build is green', room)).toBe('[@room](scrawl:room) the build is green');
    const direct: AgentConversation = { ...room, id: 'ch-dm', name: 'Mert Kaya', kind: 'direct', space: null, people: [{ id: 'p-mert', name: 'Mert Kaya' }] };
    expect(withMentions('@room hi @Mert', direct)).toBe('@room hi [@Mert Kaya](scrawl:person/p-mert)');
  });
});
