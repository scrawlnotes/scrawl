import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { headingsOf } from './headings';

const of = (doc: string) => headingsOf(EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] }));

describe('headingsOf', () => {
  it('gives the ## headings in order, where each starts', () => {
    const doc = '# Title\n\n## One\n\ntext\n\n## Two ##\n';
    expect(of(doc)).toEqual([
      { text: 'One', from: doc.indexOf('## One') },
      { text: 'Two', from: doc.indexOf('## Two') },
    ]);
  });

  it('leaves out other levels, code blocks and quotes', () => {
    const doc = '# Title\n\n### Small\n\n```\n## Not one\n```\n\n> ## Quoted\n\n> [!NOTE]\n> ## In a callout\n\n## Real\n';
    expect(of(doc).map((h) => h.text)).toEqual(['Real']);
  });

  it('drops a leading emoji', () => {
    expect(of('## 💾 Your notes are on this device\n\n## 🗄️ Scrawl server\n\n## ☁️ OneDrive\n').map((h) => h.text)).toEqual([
      'Your notes are on this device',
      'Scrawl server',
      'OneDrive',
    ]);
  });
});
