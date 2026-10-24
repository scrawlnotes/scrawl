import { describe, expect, it } from 'vitest';
import { applyChatChanges, type ChatInfo, type ChatMessage, chatLink, continues, itemChip, itemLink, mentionAt, mentioned, parseChatLink, parseItemLink, personLink, plainText, withMessages } from './chat';

// What the app works out of messages (design/chat.md): mentions, plain text, runs under one
// face, and what changed put into what is kept.

const message = (over: Partial<ChatMessage>): ChatMessage => ({
  id: 'm-1',
  chat: 'ch-1',
  seq: 1,
  author: 'kaan',
  agent: null,
  body: '',
  mentions: [],
  mentionsRoom: false,
  replyTo: null,
  forwarded: null,
  files: [],
  reactions: [],
  at: Date.UTC(2026, 9, 24, 10, 0),
  edited: null,
  deleted: null,
  rev: 1,
  ...over,
});

const chat = (id: string): ChatInfo => ({
  id,
  kind: 'public',
  space: 'sp-acmeacme',
  spaceName: 'Acme',
  name: id,
  topic: '',
  general: false,
  createdBy: 'kaan',
  createdAt: 0,
  archived: null,
  members: [],
  gone: [],
  lastSeq: 0,
  last: null,
  joined: true,
  readSeq: 0,
  notify: 'mentions',
  hidden: false,
  unread: 0,
  alerts: 0,
  reads: null,
});

describe('mentions', () => {
  it('writes a person as a link, and finds who it names', () => {
    const link = personLink('Mert [Kaya]', 'person/mert 1');
    expect(link).toBe('[@Mert Kaya](scrawl:person/person%2Fmert%201)');
    expect(mentioned('scrawl:person/person%2Fmert%201')).toBe('person/mert 1');
    expect(mentioned('https://example.com')).toBeNull();
  });

  it('finds the mention being typed before the cursor, and none in the middle of a word', () => {
    expect(mentionAt('Can you look, @me', 17)).toEqual({ from: 14, query: 'me' });
    expect(mentionAt('@', 1)).toEqual({ from: 0, query: '' });
    expect(mentionAt('mail me at kaan@example', 23)).toBeNull();
    expect(mentionAt('Hi @Elif and', 12)).toBeNull();
  });
});

describe('a message as plain text', () => {
  it('drops Markdown’s marks and keeps the words, a mention as its name', () => {
    expect(plainText('**Pushed** `0.2.21` to [Coolify](https://coolify.io), _see_ [@Mert](scrawl:person/m)')).toBe('Pushed 0.2.21 to Coolify, see @Mert');
    expect(plainText('> quoted\n- one\n- two\n\n```ts\nconst a = 1;\n```')).toBe('quoted one two const a = 1;');
    expect(plainText('2 \\* 3')).toBe('2 * 3');
  });
});

describe('runs under one face', () => {
  it('runs on for the same writer within five minutes on the same day, but not a forwarded message', () => {
    const first = message({});
    expect(continues(first, message({ id: 'm-2', at: first.at + 4 * 60_000 }))).toBe(true);
    expect(continues(first, message({ id: 'm-2', at: first.at + 6 * 60_000 }))).toBe(false);
    expect(continues(first, message({ id: 'm-2', author: 'mert' }))).toBe(false);
    expect(continues(first, message({ id: 'm-2', agent: 'claude' }))).toBe(false);
    expect(continues(first, message({ id: 'm-2', forwarded: { chat: 'x', kind: 'direct', name: '', author: 'elif', authorName: 'Elif' } }))).toBe(false);
    expect(continues(message({ at: Date.UTC(2026, 9, 24, 23, 58) }), message({ id: 'm-2', at: Date.UTC(2026, 9, 25, 0, 1) }))).toBe(new Date(Date.UTC(2026, 9, 24, 23, 58)).toDateString() === new Date(Date.UTC(2026, 9, 25, 0, 1)).toDateString());
  });
});

describe('what is kept', () => {
  it('puts messages in by id and in order, a newer copy over an older one', () => {
    const list = withMessages([message({ id: 'a', seq: 2, rev: 5, body: 'new' })], [message({ id: 'b', seq: 1 }), message({ id: 'a', seq: 2, rev: 3, body: 'old' })]);
    expect(list.map((each) => [each.id, each.body])).toEqual([
      ['b', ''],
      ['a', 'new'],
    ]);
  });

  it('takes the conversations as they now are, leaves those gone, and puts each message in its own', () => {
    const kept = { chats: [chat('one'), chat('two')], messages: { one: [message({ chat: 'one' })], two: [message({ id: 'x', chat: 'two' })] }, cursor: 4 };
    const next = applyChatChanges(kept, { chats: [chat('one')], messages: [message({ id: 'm-2', chat: 'one', seq: 2, rev: 6 })], cursor: 6 });
    expect(next.chats.map((each) => each.id)).toEqual(['one']);
    expect(Object.keys(next.messages)).toEqual(['one']);
    expect(next.messages.one!.map((each) => each.seq)).toEqual([1, 2]);
    expect(next.cursor).toBe(6);
  });
});

describe('what a message points at', () => {
  it('writes a chip as a link with its name and where it is, and reads it back', () => {
    const card = { kind: 'card' as const, space: 'sp-acme1234', path: 'Product/Roadmap.board.json', id: 'c-1' };
    expect(itemLink(card)).toBe('scrawl:item/card/sp-acme1234/Product%2FRoadmap.board.json?id=c-1');
    expect(parseItemLink(itemLink(card))).toEqual(card);
    const note = { kind: 'note' as const, space: 'sp-acme1234', path: 'Release notes (0.2).md' };
    expect(parseItemLink(itemLink(note))).toEqual(note);
    expect(itemChip(card, 'SCR-41 [Agent] guide', 'Roadmap · "Review"')).toBe('[SCR-41 Agent guide](scrawl:item/card/sp-acme1234/Product%2FRoadmap.board.json?id=c-1 "Roadmap · Review")');
    expect(parseItemLink('scrawl:item/folder/sp-acme1234/x')).toBeNull();
    expect(parseItemLink('https://example.com')).toBeNull();
  });

  it('writes a message’s link by its server, conversation and id, and reads it back', () => {
    const link = chatLink('https://chat.example.com:8080', 'ch-1', 'm-2');
    expect(link).toBe('scrawl:chat/https%3A%2F%2Fchat.example.com%3A8080/ch-1/m-2');
    expect(parseChatLink(link)).toEqual({ server: 'https://chat.example.com:8080', chat: 'ch-1', message: 'm-2' });
    expect(parseChatLink('scrawl:chat/a/b')).toBeNull();
  });
});
