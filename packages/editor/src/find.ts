import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  SearchQuery,
  setSearchQuery,
} from '@codemirror/search';
import type { EditorState } from '@codemirror/state';
import type { EditorView, Panel } from '@codemirror/view';
import { t } from '@scrawlnotes/i18n';

const PUNCTUATION = /[!-/:-@[-`{-~]/;
const REGEX_SYNTAX = /[\\^$.*+?()[\]{}|/]/;
const MAX_COUNTED = 999;

/**
 * A regular expression source that finds `text` as it reads on screen. A character that was
 * typed literally is stored with a backslash in front (`\*`), which the search has to allow for.
 */
export function literalPattern(text: string): string {
  return [...text]
    .map((ch) => (PUNCTUATION.test(ch) ? `\\\\?${REGEX_SYNTAX.test(ch) ? `\\${ch}` : ch}` : ch))
    .join('');
}

function countMatches(state: EditorState): { total: number; current: number } {
  const query = getSearchQuery(state);
  let total = 0;
  let current = 0;
  if (query.search && query.valid) {
    const { from, to } = state.selection.main;
    const cursor = query.getCursor(state);
    for (let match = cursor.next(); !match.done && total < MAX_COUNTED; match = cursor.next()) {
      total++;
      if (match.value.from === from && match.value.to === to) current = total;
    }
  }
  return { total, current };
}

// What was last searched for and how, so that reopening the panel continues where it was.
const last = { term: '', matchCase: false, wholeWord: false };

function element<K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tag: K, className?: string) {
  const el = parent.appendChild(document.createElement(tag));
  if (className) el.className = className;
  return el;
}

/**
 * The find and replace panel at the bottom of the editor, laid out the usual way: a row to
 * find, and under it a row to replace.
 */
export function findPanel(view: EditorView): Panel {
  const dom = document.createElement('div');
  dom.className = 'cm-sl-find';
  const findRow = element(dom, 'div', 'cm-sl-find-row');
  const replaceRow = element(dom, 'div', 'cm-sl-find-row');

  const button = (parent: HTMLElement, label: string, title: string, run: () => void) => {
    const el = element(parent, 'button');
    el.type = 'button';
    el.textContent = label;
    el.title = title;
    el.addEventListener('click', run);
    return el;
  };

  const selected = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);
  const find = element(findRow, 'input');
  find.placeholder = t('find.find');
  find.setAttribute('aria-label', t('find.find'));
  find.value = selected && !selected.includes('\n') ? selected : last.term;
  const count = element(findRow, 'span', 'cm-sl-find-count');
  button(findRow, '↑', t('find.previous'), () => findPrevious(view));
  button(findRow, '↓', t('find.next'), () => findNext(view));

  const toggle = (label: string, title: string, key: 'matchCase' | 'wholeWord') => {
    const el = button(findRow, label, title, () => {
      last[key] = !last[key];
      el.setAttribute('aria-pressed', String(last[key]));
      commit();
    });
    el.setAttribute('aria-pressed', String(last[key]));
  };
  toggle('Aa', t('find.matchCase'), 'matchCase');
  toggle(t('find.word'), t('find.wholeWord'), 'wholeWord');

  const close = () => {
    closeSearchPanel(view);
    view.focus();
  };
  button(findRow, '×', t('find.close'), close).classList.add('cm-sl-find-close');

  const replace = element(replaceRow, 'input');
  replace.placeholder = t('find.replaceWith');
  replace.setAttribute('aria-label', t('find.replaceWith'));
  button(replaceRow, t('find.replace'), t('find.replaceTitle'), () => replaceNext(view));
  button(replaceRow, t('find.replaceAll'), t('find.replaceAllTitle'), () => replaceAll(view));

  const commit = () => {
    last.term = find.value;
    const query = new SearchQuery({
      search: literalPattern(find.value),
      regexp: true,
      caseSensitive: last.matchCase,
      wholeWord: last.wholeWord,
      // `$` has a meaning in a regular expression replacement; here it is just a character.
      replace: replace.value.replace(/\$/g, '$$$$'),
    });
    view.dispatch({ effects: setSearchQuery.of(query) });
  };
  const showCount = (state: EditorState) => {
    const { total, current } = countMatches(state);
    const many = total >= MAX_COUNTED ? `${MAX_COUNTED}+` : String(total);
    count.textContent = !find.value ? '' : total === 0 ? t('find.none') : current ? t('find.position', { current, total: many }) : many;
  };

  find.addEventListener('input', commit);
  replace.addEventListener('input', commit);
  dom.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
    else if (event.key === 'Enter' && event.target === find) (event.shiftKey ? findPrevious : findNext)(view);
    else if (event.key === 'Enter' && event.target === replace) replaceNext(view);
    else return;
    event.preventDefault();
  });

  return {
    dom,
    top: false,
    mount() {
      find.focus();
      find.select();
      // The panel is mounted in the middle of an editor update; the query can only be set after it.
      queueMicrotask(commit);
    },
    update: (update) => showCount(update.state),
  };
}
