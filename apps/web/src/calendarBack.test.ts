import type { Board, Collection, Task } from '@scrawlnotes/core';
import { describe, expect, it } from 'vitest';
import { writeBack } from './calendarBack';
import type { Session } from './session';

// What the calendar changed, written in Scrawl (design/outlook-calendar.md 2.3): titles without the
// card's key, days, a removed event's work to the trash, and one undo for it all.

function session() {
  const calls: unknown[][] = [];
  const stub = {
    updateTask: (...args: unknown[]) => void calls.push(['updateTask', ...args]),
    updateCard: (...args: unknown[]) => void calls.push(['updateCard', ...args]),
    removeTask: async (...args: unknown[]) => {
      calls.push(['removeTask', ...args]);
      return async () => void calls.push(['putBack', ...args]);
    },
    removeCard: async () => async () => undefined,
    changeCardSubtasks: () => undefined,
    changeRecordSubtasks: async () => null,
    updateRecord: async () => null,
    trashRecord: async () => undefined,
  };
  return { session: stub as unknown as Session, calls };
}

const data = {
  tasks: { 'Inbox.tasks.json': [{ id: 't1', title: 'Pay the bill', due: '2026-11-09' } as Task, { id: 't2', title: 'Old', due: '2026-11-09' } as Task] },
  boards: { 'Roadmap.board.json': { prefix: 'ROA', columns: [], cards: [{ id: 'c1', key: 12, title: 'Fix the login', due: '2026-11-09' }] } as unknown as Board },
  collections: {} as Record<string, Collection>,
};

describe('What comes back from the calendar', () => {
  it('renames and moves a task, takes the card’s key off its title, and trashes work removed there', async () => {
    const { session: stub, calls } = session();
    const result = await writeBack(
      stub,
      data,
      [
        { id: 'task:Inbox.tasks.json#t1', title: 'Pay the electricity bill', day: '2026-11-12' },
        { id: 'card:Roadmap.board.json#c1', title: 'ROA-12 Fix the login page' },
        { id: 'record:Clinic/Visits#gone', day: '2026-11-10' },
      ],
      ['task:Inbox.tasks.json#t2'],
    );
    expect(calls).toEqual([
      ['updateTask', 'Inbox.tasks.json', 't1', { title: 'Pay the electricity bill', due: '2026-11-12' }],
      ['updateCard', 'Roadmap.board.json', 'c1', { title: 'Fix the login page' }],
      ['removeTask', 'Inbox.tasks.json', 't2'],
    ]);
    expect(result.count).toBe(3);
    expect(result.skipped).toEqual(['record:Clinic/Visits#gone']);
    await result.undo();
    expect(calls.slice(3)).toEqual([
      ['putBack', 'Inbox.tasks.json', 't2'],
      ['updateCard', 'Roadmap.board.json', 'c1', { title: 'Fix the login', due: '2026-11-09' }],
      ['updateTask', 'Inbox.tasks.json', 't1', { title: 'Pay the bill', due: '2026-11-09' }],
    ]);
  });
});
