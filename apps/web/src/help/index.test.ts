import { describe, expect, it } from 'vitest';
import { HELP, HELP_PAGES, HELP_START, helpText, type HelpTopic, helpTrailOf, isHelpPage } from './index';

/** Every topic, the ones in a topic too. */
const allTopics = (topics: HelpTopic[]): HelpTopic[] => topics.flatMap((topic) => [topic, ...allTopics(topic.topics ?? [])]);

const FILES = import.meta.glob<string>('./*.md', { query: '?raw', import: 'default', eager: true });
const idOf = (file: string) => file.replace(/^\.\//, '').replace(/(\.phone)?\.md$/, '');

describe('Help', () => {
  it('names each page once, and a topic with pages has no note of its own', () => {
    const ids = HELP_PAGES.map((page) => page.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const topic of allTopics(HELP)) if (topic.pages || topic.topics) expect(ids).not.toContain(topic.id);
  });

  it('keeps Business and Personal apps under Apps, after its own pages', () => {
    const apps = HELP.find((topic) => topic.id === 'apps')!;
    expect(apps.topics?.map((topic) => topic.id)).toEqual(['business', 'personal']);
    expect(HELP.map((topic) => topic.id)).not.toContain('business');
    expect(helpTrailOf('gym').map((topic) => topic.id)).toEqual(['apps', 'personal']);
    expect(helpTrailOf('notes')).toEqual([]);
    const at = (id: string) => HELP_PAGES.findIndex((page) => page.id === id);
    expect(at('apps-building') + 1).toBe(at('crm'));
    expect(at('reading') + 1).toBe(at('search'));
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
