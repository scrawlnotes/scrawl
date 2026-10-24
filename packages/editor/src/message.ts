import { LanguageDescription } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { t } from '@scrawlnotes/i18n';
import { classHighlighter, highlightCode } from '@lezer/highlight';
import { Marked } from 'marked';

// A message as a conversation shows it (design/chat.md, 3.1): its Markdown as HTML, read and not
// edited, many of them on screen at once, so not each in an editor. Raw HTML in it is text, never
// run; a picture's address is not loaded, for a message must not reach out on its own; a web or
// mail address opens in the browser; a mention is a chip with the name it was written with; a
// note, a task or a card is a chip that opens it (3.7); a code block has its language, Copy, and
// past fifteen lines it is folded (4).

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const OUTSIDE = /^(https?:|mailto:)/i;

/** How many lines a code block shows before it is folded. */
const CODE_LINES = 15;

/** A chip's icon by what it points at, as the app draws them. */
const KIND_ICONS: { [kind: string]: string } = {
  note: '<path d="M6 3h9l4 4v14H6z"/><path d="M9.5 12h6M9.5 16h6"/>',
  tasks: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6.5"/>',
  board: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9.5 4v16M14.5 4v10"/>',
  collection: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 10h16M4 14.5h16M10 10v9"/>',
};
KIND_ICONS.task = KIND_ICONS.tasks!;
KIND_ICONS.card = KIND_ICONS.board!;
KIND_ICONS.record = KIND_ICONS.collection!;

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
      const item = /^scrawl:item\/([a-z]+)\//.exec(token.href);
      if (item) {
        const icon = KIND_ICONS[item[1]!] ?? KIND_ICONS.note!;
        return `<button type="button" class="msg-chip" data-href="${escapeHtml(token.href)}" data-kind="${escapeHtml(item[1]!)}"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icon}</svg><b>${text}</b>${token.title ? `<small>${escapeHtml(token.title)}</small>` : ''}</button>`;
      }
      if (token.href.startsWith('scrawl:chat/')) return `<a class="msg-chat" href="#" data-href="${escapeHtml(token.href)}">${text}</a>`;
      if (!OUTSIDE.test(token.href)) return text;
      return `<a href="${escapeHtml(token.href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
    code(token) {
      const lang = (token.lang ?? '').trim().split(/\s+/)[0] ?? '';
      const lines = token.text.split('\n').length;
      const long = lines > CODE_LINES;
      return (
        `<div class="msg-codebox${long ? ' long' : ''}"><div class="msg-codebar"><span>${escapeHtml(lang)}</span><button type="button" class="msg-copy" data-act="copy">${escapeHtml(t('chat.copy'))}</button></div>` +
        `<pre class="msg-code"${lang ? ` data-lang="${escapeHtml(lang)}"` : ''}><code>${escapeHtml(token.text)}</code></pre>` +
        `${long ? `<button type="button" class="msg-more" data-act="more">${escapeHtml(t('chat.showLines', { count: lines }))}</button>` : ''}</div>`
      );
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

/**
 * Colours the code blocks under `root` that name their language, as the editor colours code; the
 * language is loaded the first time one asks for it. A block coloured once is left as it is.
 */
export async function highlightCodeBlocks(root: HTMLElement) {
  for (const pre of root.querySelectorAll<HTMLElement>('pre.msg-code[data-lang]:not([data-lit])')) {
    pre.dataset.lit = '';
    const found = LanguageDescription.matchLanguageName(languages, pre.dataset.lang!, true);
    if (!found) continue;
    let support;
    try {
      support = found.support ?? (await found.load());
    } catch {
      continue;
    }
    const code = pre.textContent ?? '';
    const out = document.createElement('code');
    highlightCode(
      code,
      support.language.parser.parse(code),
      classHighlighter,
      (text, classes) => out.append(classes ? Object.assign(document.createElement('span'), { className: classes, textContent: text }) : document.createTextNode(text)),
      () => out.append('\n'),
    );
    pre.replaceChildren(out);
  }
}
