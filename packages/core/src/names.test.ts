import { describe, expect, it } from 'vitest';
import { collectionName } from './collection';
import { keysName } from './keys';
import { fileNameOf, shownName } from './names';
import { boardName, listName } from './vault';

describe('names with what a file name does not take', () => {
  it('keep each as a look-alike in the file, and show it back as typed', () => {
    const typed = 'Q3/Q4: what? "now" <a|b> \\ *';
    const file = fileNameOf(typed);
    expect(file).not.toMatch(/[\\/:*?"<>|]/);
    expect(shownName(file)).toBe(typed);
    expect(fileNameOf('Ne yapmalı?')).toBe('Ne yapmalı？');
  });

  it('show back in every kind’s name', () => {
    expect(listName('Work/Ne yapmalı？.tasks.json')).toBe('Ne yapmalı?');
    expect(boardName('Q3∕Q4 plan.board.json')).toBe('Q3/Q4 plan');
    expect(keysName('Prod꞉ EU.env')).toBe('Prod: EU');
    expect(collectionName('CRM/Leads ǀ 2026')).toBe('Leads | 2026');
  });
});
