import { describe, expect, it } from 'vitest';
import { exportHtml, type OutFiles, pdfContent } from './export';
import { IMAGE_SIZES, readImageAlt, sizeOfWidth, writtenImageAlt } from './imageWidth';

describe('an image’s width', () => {
  it('is read from its alt text the way Obsidian writes it', () => {
    expect(readImageAlt('roof|400')).toEqual({ label: 'roof', width: 400 });
    expect(readImageAlt('|240')).toEqual({ label: '', width: 240 });
    expect(readImageAlt('roof | 400x300')).toEqual({ label: 'roof', width: 400 });
    expect(readImageAlt('roof')).toEqual({ label: 'roof', width: null });
    expect(readImageAlt('a|b')).toEqual({ label: 'a|b', width: null });
    expect(readImageAlt('tiny|3').width).toBe(48);
  });

  it('is written back, and none leaves the label alone', () => {
    expect(writtenImageAlt('roof', 412.6)).toBe('roof|413');
    expect(writtenImageAlt('roof', null)).toBe('roof');
    expect(sizeOfWidth(IMAGE_SIZES.medium)).toBe('medium');
    expect(sizeOfWidth(300)).toBeNull();
  });

  it('goes out with the note', () => {
    const files: OutFiles = new Map([['_attachments/roof.png', { kind: 'image', title: 'roof.png', size: '1 MB', data: 'data:image/png;base64,AAA', width: 1200, height: 600 }]]);
    expect(exportHtml('![roof|400](_attachments/roof.png)', 'n', files)).toContain('<img src="data:image/png;base64,AAA" alt="roof" style="width: 400px">');
    const fonts = { sans: ['S', 'X'], mono: ['M', 'X'] } as { sans: [string, string]; mono: [string, string] };
    const image = (markdown: string) => JSON.stringify(pdfContent(markdown, 'n', files, fonts)).match(/"image":"[^"]+","width":([\d.]+)/)?.[1];
    expect(image('![roof|400](_attachments/roof.png)')).toBe('300');
    expect(image('![roof](_attachments/roof.png)')).toBe('483');
  });
});
