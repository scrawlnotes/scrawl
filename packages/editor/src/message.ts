import { Marked } from 'marked';

// A message as a conversation shows it (design/chat.md, 3.1): its Markdown as HTML, read and not
// edited, many of them on screen at once, so not each in an editor. Raw HTML in it is text, never
// run; a picture's address is not loaded, for a message must not reach out on its own; a web or
// mail address opens in the browser; a mention is a chip with the name it was written with.

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const OUTSIDE = /^(https?:|mailto:)/i;

const reader = new Marked({ gfm: true, breaks: true });
reader.use({
  renderer: {
    html: (token) => escapeHtml(token.text),
    image: (token) => escapeHtml(token.text || token.href),
    link(token) {
      const text = this.parser.parseInline(token.tokens);
      const person = /^scrawl:person\/(.+)$/.exec(token.href);
      if (person) return `<span class="msg-at" data-person="${escapeHtml(person[1]!)}">${text}</span>`;
      if (token.href === 'scrawl:room') return `<span class="msg-at room">${text}</span>`;
      if (!OUTSIDE.test(token.href)) return text;
      return `<a href="${escapeHtml(token.href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
    code(token) {
      const lang = (token.lang ?? '').trim().split(/\s+/)[0] ?? '';
      return `<pre class="msg-code"${lang ? ` data-lang="${escapeHtml(lang)}"` : ''}><code>${escapeHtml(token.text)}</code></pre>`;
    },
    heading(token) {
      return `<p class="msg-h">${this.parser.parseInline(token.tokens)}</p>`;
    },
  },
});

/** A message's Markdown as HTML for its conversation. */
export function messageHtml(markdown: string): string {
  return reader.parse(markdown, { async: false });
}
