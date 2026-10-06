import { describe, expect, it } from 'vitest';
import { pageTitle } from './links';

describe('pageTitle', () => {
  it('takes the title a page gives for sharing over its <title>', () => {
    const html = `<html><head><title>Docs | Site</title>
      <meta name="twitter:title" content="Twitter title">
      <meta content="Open Graph title" property="og:title"></head></html>`;
    expect(pageTitle(html)).toBe('Open Graph title');
    expect(pageTitle(html.replace(/<meta content[^>]*>/, ''))).toBe('Twitter title');
  });

  it('falls back to <title>, with entities decoded and spaces collapsed', () => {
    expect(pageTitle('<title data-x="1">\n  Tom &amp; Jerry &#8211; the &quot;pilot&quot; &#x1F600;\n</title>')).toBe(
      'Tom & Jerry – the "pilot" 😀',
    );
  });

  it('has no title for a page without one', () => {
    expect(pageTitle('<html><body>no head</body></html>')).toBeNull();
    expect(pageTitle('<title>   </title>')).toBeNull();
  });

  it('shortens a very long title', () => {
    const title = pageTitle(`<title>${'word '.repeat(60)}</title>`)!;
    expect(title.length).toBeLessThanOrEqual(160);
    expect(title.endsWith('…')).toBe(true);
  });
});
