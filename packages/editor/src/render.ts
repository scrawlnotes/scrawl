import { Marked } from 'marked';

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Line breaks are kept as typed, and raw HTML in a note is shown as text, never run.
const marked = new Marked({ gfm: true, breaks: true });
marked.use({ renderer: { html: (token) => escapeHtml(token.text) } });

/** Renders Markdown to HTML, for the clipboard. */
export function renderHtml(markdown: string): string {
  return marked.parse(markdown, { async: false });
}

/** Renders the inline formatting of one piece of text, such as a table cell. */
export function renderInline(markdown: string): string {
  return marked.parseInline(markdown, { async: false });
}
