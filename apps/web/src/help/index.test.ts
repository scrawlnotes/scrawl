import { describe, expect, it } from 'vitest';
import { HELP, HELP_PAGES, HELP_START, helpText, isHelpPage } from './index';

const FILES = import.meta.glob<string>('./*.md', { query: '?raw', import: 'default', eager: true });
const idOf = (file: string) => file.replace(/^\.\//, '').replace(/(\.phone)?\.md$/, '');

describe('Help', () => {
  it('names each page once, and a topic with pages has no note of its own', () => {
    const ids = HELP_PAGES.map((page) => page.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const topic of HELP) if (topic.pages) expect(ids).not.toContain(topic.id);
  });

  it('has a note for every page, and every note is a page', () => {
    for (const page of HELP_PAGES) if (page.id !== HELP_START) expect(Object.keys(FILES), page.id).toContain(`./${page.id}.md`);
    for (const file of Object.keys(FILES)) {
      expect(isHelpPage(idOf(file)), file).toBe(true);
      if (file.endsWith('.phone.md')) expect(FILES[`./${idOf(file)}.md`], file).toBeDefined();
    }
  });

  it('links only to its own pages', () => {
    for (const [file, text] of Object.entries(FILES)) {
      for (const [, href] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
        if (/^(https?:|mailto:)/.test(href!)) continue;
        expect(isHelpPage(href!), `${file} → ${href}`).toBe(true);
      }
    }
  });

  it('reads a page, the phone’s own where there is one', async () => {
    expect(await helpText(HELP_START, false)).toMatch(/^# 👋 Welcome to Scrawl/);
    expect(await helpText('no-such-page', false)).toBe('');
  });
});
