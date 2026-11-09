import { describe, expect, it } from 'vitest';
import { personLink } from './sync/chat';
import { publicHost, readWakeHeaders, WAKE_MASK, wakeAddressOk, type WakeEvent, wakeHeaderWords, wakeText } from './wake';

// Waking an agent (design/agent-wake.md): the address and headers as written, and the words the agent reads.

const base = {
  server: 'https://scrawl.example.com',
  agent: { id: 'a1:3f9c', name: 'Claude' },
  from: { id: 'a1', name: 'Kaan Arslan' },
  at: '2026-11-09T10:12:00.000Z',
  space: { id: 's4', name: 'Scrawl' },
};

describe('the address', () => {
  it('takes a public https address, and nothing on the loopback, a home network or a bare IP', () => {
    expect(wakeAddressOk('https://api.anthropic.com/v1/claude_code/routines/trig_01/fire')).toBe(true);
    for (const bad of ['http://api.anthropic.com/hook', 'https://localhost/hook', 'https://192.168.1.20:5678/webhook', 'https://[::1]/x', 'https://0x7f000001/x', 'https://n8n/x', 'https://nas.local/x', 'https://user:pw@example.com/x', 'not an address']) {
      expect(wakeAddressOk(bad), bad).toBe(false);
    }
    expect(publicHost('n8n.example.com')).toBe(true);
    expect(publicHost('10.0.0.5')).toBe(false);
  });
});

describe('the headers', () => {
  it('reads one Name: value a line, blank lines left out', () => {
    expect(readWakeHeaders('Authorization: Bearer sk-ant-oat01-x\n\nanthropic-version: 2023-06-01\n')).toEqual({
      headers: [
        ['Authorization', 'Bearer sk-ant-oat01-x'],
        ['anthropic-version', '2023-06-01'],
      ],
    });
  });

  it('says which line is wrong and why', () => {
    const missing = readWakeHeaders('Authorization: Bearer x\nX-Scrawl secret');
    expect(missing).toEqual({ line: 2, why: 'form' });
    expect(wakeHeaderWords(missing as { line: number; why: 'form' })).toBe('Line 2: a header is Name: value');
    expect(readWakeHeaders('Content-Type: text/plain')).toEqual({ line: 1, why: 'own', name: 'Content-Type' });
    expect(readWakeHeaders(Array.from({ length: 11 }, (_, i) => `X-${i}: ${i}`).join('\n'))).toEqual({ line: 11, why: 'many' });
  });

  it('keeps the saved value of a header left hidden, and wants one never saved', () => {
    const kept = [['Authorization', 'Bearer secret']] as const;
    expect(readWakeHeaders(`Authorization: ${WAKE_MASK}\nanthropic-version: 2023-06-01`, kept)).toEqual({
      headers: [
        ['Authorization', 'Bearer secret'],
        ['anthropic-version', '2023-06-01'],
      ],
    });
    expect(readWakeHeaders(`X-Token: ${WAKE_MASK}`, kept)).toEqual({ line: 1, why: 'again', name: 'X-Token' });
  });
});

describe('what the agent reads', () => {
  it('in a room: who wrote what where, how to read the conversation and answer the message', () => {
    const event: WakeEvent = { ...base, kind: 'mention', chat: { id: 'c7', kind: 'public', name: '#dev', message: 'm81' } };
    expect(wakeText(event, `${personLink('Claude', 'a1:3f9c')} why does the build fail on main?`)).toBe(
      'Kaan Arslan wrote to you in #dev (space Scrawl) on the Scrawl server scrawl.example.com:\n\n' +
        '> @Claude why does the build fail on main?\n\n' +
        'Read the conversation with `messages` (in: "#dev", space: "Scrawl"), do what Kaan asks, and answer with `send_message` (to: "#dev", space: "Scrawl", replyTo: "m81"), writing @Kaan in it.',
    );
  });

  it('an answer in a direct message: by its id', () => {
    const event: WakeEvent = { ...base, space: null, kind: 'reply', chat: { id: 'c9', kind: 'direct', name: 'Mert Kaya', message: 'm90' } };
    expect(wakeText(event, 'Check the phone too.')).toBe(
      'Kaan Arslan answered your message in the direct message with Mert Kaya on the Scrawl server scrawl.example.com:\n\n> Check the phone too.\n\n' +
        'Read the conversation with `messages` (in: "c9"), do what Kaan asks, and answer with `send_message` (to: "c9", replyTo: "m90"), writing @Kaan in it.',
    );
  });

  it('a card given, and a mention in its comment', () => {
    const card = { id: 'card1', key: 'ROA-12', title: 'Fix the login', board: 'Roadmap' };
    expect(wakeText({ ...base, kind: 'assign', card })).toBe(
      'Kaan Arslan gave you ROA-12 "Fix the login" on the board Roadmap (space Scrawl) on the Scrawl server scrawl.example.com.\n\n' +
        'Read it with `cards` (board: "Roadmap", card: "ROA-12", space: "Scrawl"), do it, and say what you did and what is left with `comment` (board: "Roadmap", card: "ROA-12", space: "Scrawl"), writing @Kaan in it.',
    );
    expect(wakeText({ ...base, kind: 'mention', card: { ...card, comment: 'cm1' } }, '@Claude this too\n\nand that')).toBe(
      'Kaan Arslan mentioned you in a comment on ROA-12 "Fix the login" on the board Roadmap (space Scrawl) on the Scrawl server scrawl.example.com:\n\n> @Claude this too\n>\n> and that\n\n' +
        'Read the card with `cards` (board: "Roadmap", card: "ROA-12", space: "Scrawl"), do what Kaan asks, and answer with `comment` (board: "Roadmap", card: "ROA-12", space: "Scrawl"), writing @Kaan in it.',
    );
  });

  it('a task given: finish it, and tell in its description', () => {
    expect(wakeText({ ...base, kind: 'assign', task: { id: 't1', title: 'Collect the feedback', list: 'Tasks' } })).toBe(
      'Kaan Arslan gave you the task "Collect the feedback" in the list Tasks (space Scrawl) on the Scrawl server scrawl.example.com.\n\n' +
        'Read it with `tasks` (list: "Tasks", space: "Scrawl"), do it, and finish it with `save_task` (list: "Tasks", space: "Scrawl", id: "t1", done: true). Anything to tell Kaan goes in its description with `save_task`, writing @Kaan in it.',
    );
  });

  it('quotes 4,000 characters at most', () => {
    const text = wakeText({ ...base, kind: 'mention', chat: { id: 'c7', kind: 'public', name: '#dev', message: 'm81' } }, 'x'.repeat(5000));
    expect(text).toContain(`> ${'x'.repeat(3999)}…\n`);
    expect(text).not.toContain('x'.repeat(4000));
  });
});
