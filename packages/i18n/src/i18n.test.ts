import { afterEach, describe, expect, it } from 'vitest';
import { en } from './en';
import { locale, setLanguage, t } from './index';

describe('t', () => {
  afterEach(() => setLanguage('en-US', {}));

  it('fills the places of a message', () => {
    expect(t('trash.restoreTo', { place: 'Work' })).toBe('Restore to Work');
    expect(t('status.position', { line: 12, col: 3 })).toBe('Ln 12, Col 3');
  });

  it('picks the plural form by count and writes the number for the language', () => {
    expect(t('count.notes', { count: 1 })).toBe('1 note');
    expect(t('count.notes', { count: 1200 })).toBe('1,200 notes');
    expect(t('delete.emptyText', { count: 1 })).toMatch(/^The item/);
  });

  it('falls back to English for what a dictionary lacks', () => {
    setLanguage('tr-TR', { 'count.notes': { other: '{count} not' } });
    expect(locale()).toBe('tr-TR');
    expect(t('count.notes', { count: 1200 })).toBe('1.200 not');
    expect(t('side.trash')).toBe(en['side.trash']);
  });

  it('leaves a place without a value as it is', () => {
    expect(t('trash.restoreTo')).toBe('Restore to {place}');
  });
});
