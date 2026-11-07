import { ensureSyntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';

/** A `##` heading of a note: its words, and where its line starts. */
export interface Heading {
  text: string;
  from: number;
}

// The emoji a heading may start with ("💾 Your notes…"), with its variation selector and joiners.
const LEADING_EMOJI = /^(?:[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}️‍⃣])+\s*/u;

/**
 * The note's `##` headings in order, for a page's On this page: only those of the note itself, not
 * one in a quote or a callout, and none in a code block; their words without a leading emoji.
 */
export function headingsOf(state: EditorState): Heading[] {
  const tree = ensureSyntaxTree(state, state.doc.length, 500);
  if (!tree) return [];
  const out: Heading[] = [];
  const top = tree.topNode.firstChild;
  for (let node = top; node; node = node.nextSibling) {
    if (node.name !== 'ATXHeading2') continue;
    const text = state
      .sliceDoc(node.from, node.to)
      .replace(/^##\s*/, '')
      .replace(/\s+#+\s*$/, '')
      .replace(LEADING_EMOJI, '')
      .trim();
    if (text) out.push({ text, from: node.from });
  }
  return out;
}
