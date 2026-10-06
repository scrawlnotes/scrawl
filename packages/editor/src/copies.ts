import { type EditorState, type Extension, StateEffect, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { t } from '@scrawlnotes/i18n';

/** A file being copied into a note, shown where it will land. It is not in the note's text until it is there. */
export interface Copy {
  id: string;
  name: string;
  image: boolean;
  /** Its size in bytes. */
  total: number;
  /** How much of it is copied. */
  written: number;
  /** Hidden at first: a copy that is over within a moment never shows. */
  shown: boolean;
  cancel: () => void;
}

/** Shows a copy at `pos`. */
export const addCopy = StateEffect.define<{ copy: Copy; pos: number }>({ map: (v, m) => ({ ...v, pos: m.mapPos(v.pos, 1) }) });
export const showCopy = StateEffect.define<string>();
export const copyProgress = StateEffect.define<{ id: string; written: number }>();
/** Takes a copy away, because it is done, stopped or failed. */
export const dropCopy = StateEffect.define<string>();

const ICONS = {
  image:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M5 17l4.5-4.5 3 3 2.5-2.5L20 18"/></svg>',
  file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>',
};

const UNITS = ['B', 'KB', 'MB', 'GB'];

/** How far a copy is, both numbers in the unit of the whole: `12.4 / 42.9 MB`. */
export function progressText(written: number, total: number): string {
  let unit = 0;
  while (unit < UNITS.length - 1 && total >= 1024 ** (unit + 1)) unit++;
  const show = (bytes: number) => {
    const value = bytes / 1024 ** unit;
    return unit === 0 ? String(bytes) : value.toFixed(1).replace(/\.0$/, '');
  };
  return `${show(written)} / ${show(total)} ${UNITS[unit]}`;
}

class CopyWidget extends WidgetType {
  constructor(readonly copy: Copy) {
    super();
  }
  eq(other: CopyWidget) {
    return other.copy === this.copy;
  }
  toDOM() {
    const chip = document.createElement('span');
    chip.className = 'cm-sl-copying';
    chip.innerHTML = this.copy.image ? ICONS.image : ICONS.file;
    chip.append(this.copy.name);
    const amount = chip.appendChild(document.createElement('small'));
    const cancel = chip.appendChild(document.createElement('button'));
    cancel.type = 'button';
    cancel.className = 'cm-sl-copying-cancel';
    cancel.textContent = '×';
    cancel.title = t('copy.cancel');
    cancel.setAttribute('aria-label', t('copy.cancelName', { name: this.copy.name }));
    const copy = this.copy;
    cancel.addEventListener('mousedown', (event) => event.preventDefault());
    cancel.addEventListener('click', () => copy.cancel());
    const bar = chip.appendChild(document.createElement('span'));
    bar.className = 'cm-sl-copying-bar';
    bar.appendChild(document.createElement('i'));
    this.updateDOM(chip);
    return chip;
  }
  /** Progress changes the chip in place, so the pointer stays on its button. */
  updateDOM(dom: HTMLElement) {
    const { written, total, shown } = this.copy;
    dom.hidden = !shown;
    dom.querySelector('small')!.textContent = progressText(written, total);
    (dom.querySelector('.cm-sl-copying-bar i') as HTMLElement).style.width = `${total ? (written / total) * 100 : 100}%`;
    return true;
  }
  ignoreEvent() {
    return true;
  }
}

// Copies dropped together land in the order they were dropped.
let order = 0;

const copies = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(set, tr) {
    set = set.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(addCopy)) {
        const widget = Decoration.widget({ widget: new CopyWidget(effect.value.copy), side: 1 + order++, kind: 'copy', id: effect.value.copy.id });
        set = set.update({ add: [widget.range(effect.value.pos)] });
      } else if (effect.is(dropCopy)) {
        set = set.update({ filter: (_from, _to, deco) => deco.spec.id !== effect.value });
      } else if (effect.is(showCopy) || effect.is(copyProgress)) {
        const id = effect.is(showCopy) ? effect.value : effect.value.id;
        const changed: { from: number; deco: Decoration }[] = [];
        set.between(0, tr.state.doc.length, (from, _to, deco) => {
          if (deco.spec.id !== id) return;
          const before = (deco.spec.widget as CopyWidget).copy;
          const copy = effect.is(showCopy) ? { ...before, shown: true } : { ...before, written: (effect.value as { written: number }).written };
          changed.push({ from, deco: Decoration.widget({ ...deco.spec, widget: new CopyWidget(copy) }) });
        });
        set = set.update({
          filter: (_from, _to, deco) => deco.spec.id !== id,
          add: changed.map(({ from, deco }) => deco.range(from)),
        });
      }
    }
    return set;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** Where a copy will land now, after the edits made while it was copied; null when it is gone. */
export function copyPosition(state: EditorState, id: string): number | null {
  let pos: number | null = null;
  state.field(copies, false)?.between(0, state.doc.length, (from, _to, deco) => {
    if (deco.spec.id === id) pos = from;
  });
  return pos;
}

/** Whether another copy waits right where `id` lands, so that the two get a line each. */
export function copyFollows(state: EditorState, id: string): boolean {
  const at = copyPosition(state, id);
  let found = false;
  let after = false;
  state.field(copies, false)?.between(at ?? 0, at ?? 0, (from, _to, deco) => {
    if (from !== at) return;
    if (deco.spec.id === id) found = true;
    else if (found) after = true;
  });
  return after;
}

export const copiesField: Extension = copies;
