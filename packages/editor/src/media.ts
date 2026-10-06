import { EditorSelection } from '@codemirror/state';
import { type EditorView, WidgetType } from '@codemirror/view';
import { t } from '@scrawlnotes/i18n';

/** How a note reaches the files attached to it. All of it is optional; without it the widgets only show. */
export interface MediaOptions {
  /** Opens an attached file with the program the system uses for it. */
  openFile?: (src: string) => void;
  /** An attached file's size in bytes, when it is known. */
  fileSize?: (src: string) => number | undefined;
  /** An address the browser can play an attached recording from. */
  resolveAudio?: (src: string) => Promise<string>;
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

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string) => {
  const node = document.createElement(tag);
  node.className = className;
  return node;
};

const FILE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>';

function sizeText(bytes: number): string {
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

/** Selects the widget's whole link when it is clicked with Shift, so it can be cut or copied as one. */
function selectOnShift(view: EditorView, dom: HTMLElement, length: number, event: MouseEvent): boolean {
  if (!event.shiftKey) return false;
  const from = view.posAtDOM(dom);
  view.dispatch({ selection: EditorSelection.range(from, from + length) });
  view.focus();
  return true;
}

/** An attached file: its name and size; a click opens it. */
export class FileWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly name: string,
    /** Length of the Markdown the widget stands for. */
    readonly length: number,
    readonly selected: boolean,
    readonly options: MediaOptions,
  ) {
    super();
  }
  eq(other: FileWidget) {
    return other.src === this.src && other.name === this.name && other.length === this.length && other.selected === this.selected;
  }
  toDOM(view: EditorView) {
    const chip = el('span', this.selected ? 'cm-sl-file cm-sl-file-selected' : 'cm-sl-file');
    chip.title = t('editor.open', { name: this.name });
    chip.innerHTML = FILE_ICON;
    chip.append(this.name);
    const bytes = this.options.fileSize?.(this.src);
    if (bytes !== undefined) chip.append(Object.assign(el('small', ''), { textContent: sizeText(bytes) }));
    chip.addEventListener('mousedown', (event) => {
      event.preventDefault();
      if (!selectOnShift(view, chip, this.length, event)) this.options.openFile?.(this.src);
    });
    return chip;
  }
  ignoreEvent() {
    return true;
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

/** An attached recording: a play button, its waveform, which fills as it plays, and its length. */
export class AudioWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly label: string,
    readonly length: number,
    readonly selected: boolean,
    readonly options: MediaOptions,
  ) {
    super();
  }
  eq(other: AudioWidget) {
    return other.src === this.src && other.label === this.label && other.length === this.length && other.selected === this.selected;
  }
  toDOM(view: EditorView) {
    const root = el('span', this.selected ? 'cm-sl-audio cm-sl-audio-selected' : 'cm-sl-audio');
    const play = el('button', 'cm-sl-audio-play');
    play.type = 'button';
    play.setAttribute('aria-label', t('editor.play', { name: this.label }));
    const bars = Array.from({ length: BARS }, () => el('i', ''));
    const wave = el('span', 'cm-sl-audio-wave');
    wave.append(...bars);
    const time = el('span', 'cm-sl-audio-time');
    time.textContent = this.label;
    root.append(play, wave, time);

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
      root.classList.remove('cm-sl-audio-playing');
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
      root.classList.add('cm-sl-audio-playing');
      play.setAttribute('aria-label', t('editor.pause', { name: this.label }));
    };
    (root as HTMLElement & { audio?: () => HTMLAudioElement | null }).audio = () => audio;

    root.addEventListener('mousedown', (event) => {
      event.preventDefault();
      if (selectOnShift(view, root, this.length, event)) return;
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
      }
    });
    return root;
  }
  destroy(dom: HTMLElement) {
    (dom as HTMLElement & { audio?: () => HTMLAudioElement | null }).audio?.()?.pause();
  }
  ignoreEvent() {
    return true;
  }
}
