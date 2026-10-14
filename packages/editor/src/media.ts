import { EditorSelection, type Transaction } from '@codemirror/state';
import { EditorView, WidgetType } from '@codemirror/view';
import { t } from '@scrawlnotes/i18n';

/** How a note reaches the files attached to it. All of it is optional; without it the widgets only show. */
export interface MediaOptions {
  /** Opens an attached file with the program the system uses for it. */
  openFile?: (src: string) => void;
  /** Shows an attached file selected in its folder, in the system's file manager. */
  revealFile?: (src: string) => void;
  /** An attached file's size in bytes, when it is known. */
  fileSize?: (src: string) => number | undefined;
  /** An address the browser can play an attached recording from. */
  resolveAudio?: (src: string) => Promise<string>;
  /** Shows the menu of a right click at the pointer, drawn like the host's other menus; `about` says what it is the menu of. */
  showMenu?: (at: { x: number; y: number }, items: ItemAction[], about?: ItemAbout) => void;
  /**
   * A touch screen. A tap on an image or a file opens it instead of selecting it, and holding an
   * image, a file or a recording opens its menu; neither brings up the keyboard.
   */
  touch?: boolean;
  /**
   * An attached file left in the cloud, over this device's limit: its size there, and an image's
   * width and height where they are known. Null when the file is here.
   */
  away?: (src: string) => AwayFileInfo | null;
  /** Brings an attached file left in the cloud here; true once it is. */
  download?: (src: string) => Promise<boolean>;
  /**
   * Tells how a download of an attached file goes: how many of its bytes came, at once if it is
   * already on its way, and null when it ends. Returns what stops telling.
   */
  watchDownload?: (src: string, tell: (done: number | null) => void) => () => void;
}

/** What is known of an attached file left in the cloud. */
export interface AwayFileInfo {
  size: number;
  width?: number;
  height?: number;
}

/** What an image, file or recording is, for the head of its menu. */
export interface ItemAbout {
  kind: 'image' | 'file' | 'audio';
  /** Its file's name. */
  name: string;
  /** Its size in bytes, when it is known. */
  size?: number;
}

/** How long a finger rests on an item before its menu opens. */
const HOLD_MS = 450;
/** How far a finger moves before it is scrolling rather than holding. */
const SLOP = 8;

/** Something that can be done with an image, file or recording in a note. */
export interface ItemAction {
  kind: 'open' | 'reveal' | 'delete';
  label: string;
  run: () => void;
}

const ATTACHMENTS = '_attachments/';
const AUDIO = /\.(webm|ogg|oga|opus|mp3|m4a|aac|wav|flac)$/i;

/** The attachment a link points to, as its path in the vault; null for a link to anywhere else. */
export function attachmentOf(href: string): string | null {
  let path: string;
  try {
    path = decodeURIComponent(href);
  } catch {
    path = href;
  }
  return path.startsWith(ATTACHMENTS) && path.length > ATTACHMENTS.length ? path : null;
}

export const isAudio = (src: string) => AUDIO.test(src);

/** Where a Markdown link or image points: `](address)` or `](<address with spaces>)`. */
const DESTINATION = /\]\(\s*(?:<([^>\n]*)>|([^\s)]+))/g;

/** The attached files that the links and images in `text` point to. */
export function attachmentsIn(text: string): Set<string> {
  const found = new Set<string>();
  for (const m of text.matchAll(DESTINATION)) {
    const src = attachmentOf(m[1] ?? m[2] ?? '');
    if (src) found.add(src);
  }
  return found;
}

/**
 * The attached files a change stopped linking to and started linking to, judged by the lines it
 * touched. A file moved within the note is in neither.
 */
export function attachmentChanges(tr: Transaction): { removed: string[]; added: string[] } {
  const before = new Set<string>();
  const after = new Set<string>();
  const { doc: a } = tr.startState;
  const { doc: b } = tr.state;
  tr.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    for (const src of attachmentsIn(a.sliceString(a.lineAt(fromA).from, a.lineAt(toA).to))) before.add(src);
    for (const src of attachmentsIn(b.sliceString(b.lineAt(fromB).from, b.lineAt(toB).to))) after.add(src);
  });
  return { removed: [...before].filter((src) => !after.has(src)), added: [...after].filter((src) => !before.has(src)) };
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string) => {
  const node = document.createElement(tag);
  node.className = className;
  return node;
};

const FILE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>';

/** A file size as people read it: `840 KB`, `2.4 MB`. */
export function sizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

const clock = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Lets the editor see a drag that starts on a widget, for its drop cursor and for `widgetMoves`.
 * Every other event inside the widget is the widget's own.
 */
export const onlyDrags = (event: Event) => event.type !== 'dragstart' && event.type !== 'dragend';

/** The widget being dragged in a note, by the Markdown it stands for. */
let dragged: { view: EditorView; from: number; to: number } | null = null;

/** Remembers which widget a drag started on; `widgetMoves` moves it where it is dropped. */
export function dragWidget(view: EditorView, dom: HTMLElement, length: number) {
  const from = view.posAtDOM(dom);
  dragged = { view, from, to: from + length };
}

/**
 * Moves a dragged image, file or recording to where it is dropped in its note, as one step that
 * undo takes back. The browser offers a dragged image as a file too; it is not copied again.
 */
export const widgetMoves = EditorView.domEventHandlers({
  dragover(event, view) {
    if (dragged?.view !== view) return false;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    return false;
  },
  drop(event, view) {
    if (dragged?.view !== view) return false;
    const { from, to } = dragged;
    dragged = null;
    event.preventDefault();
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null || (pos >= from && pos <= to)) return true;
    const changes = view.state.changes([{ from, to }, { from: pos, insert: view.state.sliceDoc(from, to) }]);
    view.dispatch({
      changes,
      selection: { anchor: changes.mapPos(pos, -1), head: changes.mapPos(pos, 1) },
      scrollIntoView: true,
      userEvent: 'move.drop',
    });
    view.focus();
    return true;
  },
  dragend() {
    dragged = null;
    return false;
  },
});

/** Selects the Markdown a widget stands for, so that the widget is selected as one unit. */
export function selectWidget(view: EditorView, dom: HTMLElement, length: number) {
  const from = view.posAtDOM(dom);
  view.dispatch({ selection: EditorSelection.range(from, from + length) });
  view.focus();
}

/** Takes the Markdown a widget stands for out of the note, as one step that undo takes back. On a touch screen it brings up no keyboard. */
function removeWidget(view: EditorView, dom: HTMLElement, length: number, focus: boolean) {
  const from = view.posAtDOM(dom);
  view.dispatch({ changes: { from, to: from + length }, selection: { anchor: from }, scrollIntoView: true, userEvent: 'delete' });
  if (focus) view.focus();
}

const ACTION_ICONS: Record<ItemAction['kind'], string> = {
  open: '<path d="M14 4h6v6M20 4l-8.5 8.5M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  reveal: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  delete: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7"/><path d="M10.5 10.5v5.5M13.5 10.5v5.5"/>',
};

/** The bar a selected item shows, after the Item menu view of design/mockups.html (direction A). */
function itemBar(actions: ItemAction[]): HTMLElement {
  const bar = el('span', 'cm-sl-itembar');
  bar.setAttribute('role', 'toolbar');
  for (const action of actions) {
    if (action.kind === 'delete' && bar.childElementCount > 0) bar.append(el('i', 'cm-sl-itembar-gap'));
    const button = el('button', 'cm-sl-itembar-button');
    button.type = 'button';
    button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ACTION_ICONS[action.kind]}</svg>`;
    button.append(action.label);
    // The note keeps its selection and its focus while a button is pressed.
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      action.run();
    });
    bar.append(button);
  }
  bar.addEventListener('dblclick', (event) => event.stopPropagation());
  return bar;
}

/** An item's DOM, with what is needed to show a change of selection without drawing it again. */
type ItemDom = HTMLElement & { itemKey?: string; itemBody?: HTMLElement };

/**
 * An image, file or recording in a note. A click selects it as one unit. Selected on its own, it
 * shows a bar of what can be done with it, which a right click offers as a menu too.
 */
export abstract class ItemWidget extends WidgetType {
  /** The class of the widget's outer element. */
  protected rootClass = 'cm-sl-item';
  /** The class the item has while it is selected. */
  protected abstract readonly selectedClass: string;
  /** What kind of item it is, for the head of its menu. */
  protected abstract readonly kind: ItemAbout['kind'];

  constructor(
    readonly src: string,
    /** Length of the Markdown the widget stands for. */
    readonly length: number,
    /** Inside a selection. */
    readonly selected: boolean,
    /** The selection is this item and nothing else. */
    readonly active: boolean,
    readonly options: MediaOptions,
    /** Counts the times the note's files came back; each draws the items anew, to show them. */
    readonly version: number,
  ) {
    super();
  }

  /** What tells one item from another, the selection left out. */
  protected abstract key(): string;
  /** What has to change for the item to be drawn anew. */
  private identity() {
    return `${this.key()}\n${this.version}`;
  }
  /** Draws the item itself, the part that is outlined when it is selected. */
  protected abstract body(view: EditorView, root: HTMLElement): HTMLElement;
  /** Opens the item; null when it has nothing to open it with. */
  protected abstract opener(): (() => void) | null;
  /** The attached file the item shows, for Show in folder; null for an image from the web. */
  protected abstract file(): string | null;

  eq(other: ItemWidget) {
    return other.identity() === this.identity() && other.selected === this.selected && other.active === this.active;
  }

  private actions(view: EditorView, root: HTMLElement): ItemAction[] {
    const open = this.opener();
    const file = this.file();
    const reveal = this.options.revealFile;
    const actions: ItemAction[] = [];
    if (open) actions.push({ kind: 'open', label: t('editor.item.open'), run: open });
    if (file && reveal) actions.push({ kind: 'reveal', label: t('editor.item.reveal'), run: () => reveal(file) });
    actions.push({ kind: 'delete', label: t('editor.item.delete'), run: () => removeWidget(view, root, this.length, !this.options.touch) });
    return actions;
  }

  /** What the item is, for the head of its menu: its kind, its file's name and its size. */
  private about(): ItemAbout {
    let name = this.src.slice(this.src.lastIndexOf('/') + 1);
    try {
      name = decodeURIComponent(name);
    } catch {
      // Shown as it is written.
    }
    const file = this.file();
    return { kind: this.kind, name, size: file ? this.options.fileSize?.(file) : undefined };
  }

  /**
   * On a touch screen a finger resting on the item opens its menu, as a right click does; the tap
   * that ends it does nothing else.
   */
  private holdForMenu(view: EditorView, body: HTMLElement, show: () => void) {
    let at: { x: number; y: number; timer: number; fired: boolean } | null = null;
    const stop = () => {
      if (at) window.clearTimeout(at.timer);
    };
    body.addEventListener(
      'touchstart',
      (event) => {
        if (view.state.readOnly || event.touches.length > 1) return;
        const point = event.touches[0]!;
        stop();
        at = { x: point.clientX, y: point.clientY, fired: false, timer: window.setTimeout(() => at && ((at.fired = true), show()), HOLD_MS) };
      },
      { passive: true },
    );
    body.addEventListener(
      'touchmove',
      (event) => {
        const point = event.touches[0]!;
        if (at && !at.fired && Math.hypot(point.clientX - at.x, point.clientY - at.y) > SLOP) {
          stop();
          at = null;
        }
      },
      { passive: true },
    );
    body.addEventListener('touchend', (event) => {
      stop();
      if (at?.fired) event.preventDefault();
      at = null;
    });
    body.addEventListener('touchcancel', () => {
      stop();
      at = null;
    });
  }

  toDOM(view: EditorView) {
    const root: ItemDom = el('span', this.rootClass);
    const body = this.body(view, root);
    root.append(body);
    root.itemKey = this.identity();
    root.itemBody = body;
    // Pressing and moving drags the item to another place in the note. A note that is only shown,
    // like an earlier version, has nothing to do with its items but look at them.
    body.draggable = !view.state.readOnly;
    body.addEventListener('dragstart', () => dragWidget(view, root, this.length));
    body.addEventListener('contextmenu', (event) => {
      const show = this.options.showMenu;
      if (!show || view.state.readOnly) return;
      event.preventDefault();
      // On a touch screen the item is not selected: that would bring up the keyboard.
      if (!this.options.touch) selectWidget(view, root, this.length);
      show({ x: event.clientX, y: event.clientY }, this.actions(view, root), this.about());
    });
    const show = this.options.showMenu;
    if (this.options.touch && show) this.holdForMenu(view, body, () => show({ x: 0, y: 0 }, this.actions(view, root), this.about()));
    this.showSelection(view, root);
    return root;
  }

  /** A change of selection only changes the outline and the bar, so a playing recording plays on. */
  updateDOM(dom: HTMLElement, view: EditorView) {
    if ((dom as ItemDom).itemKey !== this.identity()) return false;
    this.showSelection(view, dom);
    return true;
  }

  private showSelection(view: EditorView, root: ItemDom) {
    root.itemBody?.classList.toggle(this.selectedClass, this.selected || this.active);
    root.querySelector(':scope > .cm-sl-itembar')?.remove();
    if (this.active && !view.state.readOnly) {
      const bar = itemBar(this.actions(view, root));
      root.append(bar);
      this.placeBar(view, root, bar);
    }
  }

  /** Lets an item place its bar once it is shown. */
  protected placeBar(_view: EditorView, _root: HTMLElement, _bar: HTMLElement) {}

  ignoreEvent(event: Event) {
    return onlyDrags(event);
  }
}

/** An attached file: its name and size. A click selects it, a double click opens it. */
export class FileWidget extends ItemWidget {
  protected readonly selectedClass = 'cm-sl-file-selected';
  protected readonly kind = 'file';

  constructor(
    src: string,
    readonly name: string,
    length: number,
    selected: boolean,
    active: boolean,
    options: MediaOptions,
    version: number,
  ) {
    super(src, length, selected, active, options, version);
  }
  protected key() {
    return `${this.src}\n${this.name}\n${this.length}`;
  }
  protected opener() {
    const open = this.options.openFile;
    return open ? () => open(this.src) : null;
  }
  protected file() {
    return this.src;
  }
  protected body(view: EditorView, root: HTMLElement) {
    const chip = el('span', 'cm-sl-file');
    chip.title = t('editor.openHint', { name: this.name });
    chip.innerHTML = FILE_ICON;
    chip.append(this.name);
    const bytes = this.options.fileSize?.(this.src);
    if (bytes !== undefined) chip.append(Object.assign(el('small', ''), { textContent: sizeText(bytes) }));
    // On a touch screen a tap opens it.
    chip.addEventListener('click', () => (this.options.touch ? this.opener()?.() : selectWidget(view, root, this.length)));
    chip.addEventListener('dblclick', () => this.opener()?.());
    return chip;
  }
}

const BARS = 24;

/** The loudness of a recording in `BARS` steps, from 0 to 1, and how long it is. */
interface Wave {
  peaks: number[];
  duration: number;
}

const waves = new Map<string, Promise<Wave>>();

function waveOf(src: string, url: Promise<string>): Promise<Wave> {
  let wave = waves.get(src);
  if (!wave) {
    wave = (async () => {
      const data = await (await fetch(await url)).arrayBuffer();
      const buffer = await new OfflineAudioContext(1, 1, 8000).decodeAudioData(data);
      const samples = buffer.getChannelData(0);
      const step = Math.max(1, Math.floor(samples.length / BARS));
      const peaks = Array.from({ length: BARS }, (_, i) => {
        let peak = 0;
        for (let j = i * step; j < Math.min(samples.length, (i + 1) * step); j++) peak = Math.max(peak, Math.abs(samples[j]!));
        return peak;
      });
      const loudest = Math.max(...peaks, 0.01);
      return { peaks: peaks.map((p) => p / loudest), duration: buffer.duration };
    })();
    // A recording that cannot be read is tried again the next time it is shown.
    wave.catch(() => waves.delete(src));
    waves.set(src, wave);
  }
  return wave;
}

/** Only one recording plays at a time. */
let playing: HTMLAudioElement | null = null;

/**
 * An attached recording: a play button, its waveform, which fills as it plays, and its length.
 * The button plays it and the waveform plays it from where it is clicked; a click anywhere else
 * selects it.
 */
export class AudioWidget extends ItemWidget {
  protected readonly selectedClass = 'cm-sl-audio-selected';
  protected readonly kind = 'audio';

  constructor(
    src: string,
    readonly label: string,
    length: number,
    selected: boolean,
    active: boolean,
    options: MediaOptions,
    version: number,
  ) {
    super(src, length, selected, active, options, version);
  }
  protected key() {
    return `${this.src}\n${this.label}\n${this.length}`;
  }
  protected opener() {
    return null;
  }
  protected file() {
    return this.src;
  }
  protected body(view: EditorView, root: HTMLElement) {
    const player = el('span', 'cm-sl-audio');
    const play = el('button', 'cm-sl-audio-play');
    play.type = 'button';
    play.setAttribute('aria-label', t('editor.play', { name: this.label }));
    const bars = Array.from({ length: BARS }, () => el('i', ''));
    const wave = el('span', 'cm-sl-audio-wave');
    wave.append(...bars);
    const time = el('span', 'cm-sl-audio-time');
    time.textContent = this.label;
    player.append(play, wave, time);

    const resolve = this.options.resolveAudio;
    let duration = 0;
    let audio: HTMLAudioElement | null = null;
    const url = resolve ? resolve(this.src) : Promise.resolve(this.src);
    void waveOf(this.src, url).then(
      (found) => {
        duration = found.duration;
        found.peaks.forEach((peak, i) => (bars[i]!.style.height = `${Math.round(3 + peak * 13)}px`));
        if (!audio) time.textContent = `${this.label} · ${clock(duration)}`;
      },
      () => undefined,
    );
    const show = () => {
      if (!audio) return;
      const total = duration || (Number.isFinite(audio.duration) ? audio.duration : 0);
      const played = total ? audio.currentTime / total : 0;
      bars.forEach((bar, i) => bar.classList.toggle('on', i < Math.round(played * BARS)));
      time.textContent = `${clock(audio.currentTime)} / ${clock(total)}`;
    };
    const stopped = () => {
      player.classList.remove('cm-sl-audio-playing');
      play.setAttribute('aria-label', t('editor.play', { name: this.label }));
    };
    const start = async () => {
      if (!audio) {
        audio = new Audio(await url);
        audio.addEventListener('timeupdate', show);
        audio.addEventListener('pause', stopped);
        // Played to the end, it reads as it did before it was played.
        audio.addEventListener('ended', () => {
          audio!.currentTime = 0;
          for (const bar of bars) bar.classList.remove('on');
          time.textContent = `${this.label} · ${clock(duration || audio!.duration)}`;
        });
      }
      if (playing && playing !== audio) playing.pause();
      playing = audio;
      await audio.play();
      player.classList.add('cm-sl-audio-playing');
      play.setAttribute('aria-label', t('editor.pause', { name: this.label }));
    };
    (root as HTMLElement & { audio?: () => HTMLAudioElement | null }).audio = () => audio;

    player.addEventListener('click', (event) => {
      if (event.target === play || play.contains(event.target as Node)) {
        if (audio && !audio.paused) audio.pause();
        else void start();
      } else if (wave.contains(event.target as Node)) {
        // A click on the waveform plays from there.
        const box = wave.getBoundingClientRect();
        const at = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
        void start().then(() => {
          const total = duration || audio!.duration;
          if (Number.isFinite(total)) audio!.currentTime = at * total;
        });
      } else if (!this.options.touch) {
        selectWidget(view, root, this.length);
      }
    });
    return player;
  }
  destroy(dom: HTMLElement) {
    (dom as HTMLElement & { audio?: () => HTMLAudioElement | null }).audio?.()?.pause();
  }
}
