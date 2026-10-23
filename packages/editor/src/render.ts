import { t } from '@scrawlnotes/i18n';
import { Lexer, Marked, type MarkedOptions, type Token, type Tokens } from 'marked';
import type { CalloutType } from './callout';

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A callout's marker, as the first line of its quote's first paragraph. */
const CALLOUT = /^\[!(note|tip|important|warning|caution)\][ \t]*(?:\n|$)/i;

/** A quote that is a callout (callout.ts): its kind, and what is in it without the marker line. */
export interface CalloutToken extends Tokens.Blockquote {
  callout?: { type: CalloutType; tokens: Token[] };
}

/**
 * Marks the callouts among a note's top-level blocks, for a renderer to draw. Only the top
 * level has them, and only with something after the marker, as the editor reads them.
 */
export function markCallouts(tokens: Token[], options: MarkedOptions): Token[] {
  for (const token of tokens) {
    if (token.type !== 'blockquote') continue;
    const quote = token as CalloutToken;
    const first = quote.tokens[0];
    if (first?.type !== 'paragraph') continue;
    const text = (first as Tokens.Paragraph).text;
    const marker = CALLOUT.exec(text);
    if (!marker) continue;
    const rest = text.slice(marker[0].length);
    const inside = quote.tokens.slice(1);
    if (rest.trim()) inside.unshift({ type: 'paragraph', raw: rest, text: rest, tokens: Lexer.lexInline(rest, options) } as Tokens.Paragraph);
    if (inside.length) quote.callout = { type: marker[1]!.toLowerCase() as CalloutType, tokens: inside };
  }
  return tokens;
}

// Line breaks are kept as typed, and raw HTML in a note is shown as text, never run. A callout
// goes as a quote with its kind in bold, which Word and mail keep.
const marked = new Marked({ gfm: true, breaks: true });
marked.use({
  renderer: {
    html: (token) => escapeHtml(token.text),
    blockquote(token) {
      const callout = (token as CalloutToken).callout;
      if (!callout) return false;
      return `<blockquote>\n<p><strong>${escapeHtml(t(`callout.${callout.type}`))}</strong></p>\n${this.parser.parse(callout.tokens)}</blockquote>\n`;
    },
  },
});

/** Renders Markdown to HTML, for the clipboard. */
export function renderHtml(markdown: string): string {
  return marked.parser(markCallouts(marked.lexer(markdown), marked.defaults));
}

/** Renders the inline formatting of one piece of text, such as a table cell. */
export function renderInline(markdown: string): string {
  return marked.parseInline(markdown, { async: false });
}
