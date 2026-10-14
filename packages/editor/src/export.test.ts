import { describe, expect, it } from 'vitest';
import { exportHtml, fontRuns, type OutFiles, pdfContent, titled } from './export';

const fonts = { sans: ['Sans', 'SansX'], mono: ['Mono', 'MonoX'] } as { sans: [string, string]; mono: [string, string] };
const files: OutFiles = new Map([
  ['_attachments/roof photo.png', { kind: 'image', title: 'roof photo.png', size: '1.2 MB', data: 'data:image/png;base64,AAA', width: 320, height: 160 }],
  ['_attachments/2026-10-06-144000.webm', { kind: 'audio', title: 'Recording · Oct 6, 14:40', size: '303 KB', data: 'data:audio/webm;base64,BBB' }],
  ['_attachments/scope.pdf', { kind: 'file', title: 'scope.pdf', size: '2.3 MB' }],
]);

/** Every text a PDF content has, in order. */
const words = (node: unknown): string =>
  Array.isArray(node) ? node.map(words).join('') : node && typeof node === 'object' ? Object.entries(node).filter(([key]) => ['text', 'stack', 'columns', 'ul', 'ol', 'table', 'body'].includes(key)).map(([, value]) => words(value)).join('') : typeof node === 'string' ? node : '';

describe('export', () => {
  it('gives a note its title: its first line when that is its name, else its name over it', () => {
    expect(titled('Client call\n\nText', 'Client call')).toBe('# Client call\n\nText');
    expect(titled('## Plan\nText', 'Plan')).toBe('## Plan\nText');
    expect(titled('Text first', 'Notes')).toBe('# Notes\n\nText first');
    expect(titled('', 'Empty')).toBe('# Empty\n');
  });

  it('writes one HTML file: images and recordings in it, other files by name and size, raw HTML as text', () => {
    const html = exportHtml('Site visit\n\n![](_attachments/roof%20photo.png)\n![](_attachments/2026-10-06-144000.webm)\n[scope](<_attachments/scope.pdf>) and [a site](https://example.com)\n\n<b>raw</b>', 'Site visit', files);
    expect(html).toContain('<title>Site visit</title>');
    expect(html).toContain('<h1>Site visit</h1>');
    expect(html).toContain('<img src="data:image/png;base64,AAA" alt="">');
    expect(html).toContain('<audio controls src="data:audio/webm;base64,BBB"></audio>');
    expect(html).toContain('<span class="file">scope.pdf<small>2.3 MB</small></span>');
    expect(html).toContain('<a href="https://example.com">a site</a>');
    expect(html).toContain('&lt;b&gt;raw&lt;/b&gt;');
  });

  it('sets a run of text in the file that has its letters', () => {
    expect(fontRuns('Şirket ılık', ['L', 'X'])).toEqual([
      { text: 'Ş', font: 'X' },
      { text: 'irket ılık', font: 'L' },
    ]);
  });

  it('makes a PDF of the note: title, text, lists with boxes, code, and an image between lines', () => {
    const content = pdfContent(
      'Plan\n\nSee **this** and `code`\n![](_attachments/roof%20photo.png)\nafter it\n\n- [ ] open\n- [x] done\n\n```\n  indented\n```\n\n[scope](_attachments/scope.pdf)',
      'Plan',
      files,
      fonts,
    );
    expect(content[0]).toMatchObject({ fontSize: 20, text: [{ text: 'Plan', bold: true, font: 'Sans' }] });
    expect(words(content[1])).toBe('See this and code');
    expect(content[1]).toMatchObject({ text: [{ text: 'See ' }, { text: 'this', bold: true }, { text: ' and ' }, { text: 'code', font: 'Mono' }] });
    expect(content[2]).toEqual({ image: 'data:image/png;base64,AAA', width: 240, margin: [0, 4, 0, 10] });
    expect(words(content[3])).toBe('after it');
    expect(content[4]).toMatchObject({ type: 'none' });
    expect(words(content[4])).toBe('opendone');
    expect(content[5]).toMatchObject({ table: { body: [[{ text: [{ text: '  indented', font: 'Mono' }], preserveLeadingSpaces: true }]] } });
    expect(words(content[6])).toBe(' scope.pdf 2.3 MB ');
  });

  it('shows an image no larger than it is, no wider than the text and no higher than most of a page', () => {
    const image = (width: number, height: number) =>
      pdfContent('![](_attachments/a.png)', 'A', new Map([['_attachments/a.png', { kind: 'image', title: 'a.png', size: '1 KB', data: 'data:x', width, height }]]), fonts)[1];
    expect(image(320, 160)).toMatchObject({ width: 240 });
    expect(image(2000, 1000)).toMatchObject({ width: 483 });
    expect(image(400, 2000)).toMatchObject({ width: 112 });
  });
});
