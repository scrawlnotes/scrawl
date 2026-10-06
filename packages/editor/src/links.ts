import { syntaxTree } from '@codemirror/language';
import type { EditorState, Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import { MARKDOWN_TYPE } from './clipboard';
import { setLink } from './commands';
import { sourceMode } from './livePreview';

const URL_ONLY = /^https?:\/\/[^\s<>]+$/i;

/** The web address that pasted text is made of, alone; null for any other text. */
export function pastedUrl(text: string): string | null {
  const url = text.trim();
  return URL_ONLY.test(url) ? url : null;
}

/** Text as it is written between a link's brackets: punctuation that Markdown would read gets a backslash. */
export const linkText = (text: string) => text.replace(/[\\`*_~[\]<>]/g, '\\$&');

const UNSAFE_IN_TEXT: Record<string, string> = { '[': '%5B', ']': '%5D', '`': '%60' };

/**
 * A web address as a link's text. Markdown reads an address there as an address, where a
 * backslash would show; only what would end the text is written as an escape code instead.
 */
const urlText = (url: string) => url.replace(/[[\]`]/g, (c) => UNSAFE_IN_TEXT[c]!);

const UNSAFE_IN_ADDRESS: Record<string, string> = { '(': '%28', ')': '%29', ' ': '%20', '<': '%3C', '>': '%3E' };

/** An address as it is written between a link's parentheses, where a parenthesis would end it. */
export const linkAddress = (url: string) => url.replace(/[() <>]/g, (c) => UNSAFE_IN_ADDRESS[c]!);

// Where a pasted address stays text: code shows what was written, and a link cannot hold a link.
const NO_LINK_IN = new Set(['InlineCode', 'FencedCode', 'CodeBlock', 'Link', 'Image', 'URL']);

/** Whether `pos` lies within code or a link; right at either edge of one counts as outside. */
function inside(state: EditorState, pos: number): boolean {
  const tree = syntaxTree(state);
  for (const side of [-1, 1] as const) {
    for (let node: SyntaxNode | null = tree.resolveInner(pos, side); node; node = node.parent) {
      if (NO_LINK_IN.has(node.name) && node.from < pos && pos < node.to) return true;
    }
  }
  return false;
}

/**
 * A pasted web address becomes a link. Over selected text it links that text; at the cursor
 * the address itself is the text.
 */
export function linkPaste(): Extension {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const data = event.clipboardData;
      if (!data || data.files.length > 0 || data.types.includes(MARKDOWN_TYPE)) return false;
      const { state } = view;
      const main = state.selection.main;
      if (state.field(sourceMode, false) || state.selection.ranges.length > 1 || inside(state, main.from)) return false;
      const url = pastedUrl(data.getData('text/plain'));
      if (!url) return false;
      event.preventDefault();
      if (!main.empty) return setLink(linkAddress(url))(view);
      const insert = pastedLink(url);
      view.dispatch({
        changes: { from: main.from, insert },
        selection: { anchor: main.from + insert.length },
        scrollIntoView: true,
        // Not `input.paste`: the link syntax is ours and must not be escaped as typed text.
        userEvent: 'input.link',
      });
      return true;
    },
  });
}

/** The Markdown of the link a pasted address becomes. */
export const pastedLink = (url: string) => `[${urlText(url)}](${linkAddress(url)})`;
