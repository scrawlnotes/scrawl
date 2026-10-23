import type { FormatState } from '@scrawlnotes/editor';
import { type MessageKey, t } from '@scrawlnotes/i18n';
import { Fragment, type KeyboardEvent, type MouseEvent, useEffect, useRef, useState } from 'react';
import { OptionList } from './choices';
import { choiceHint, type LinkChoice, matchChoices } from './linkChoices';
import type { FormatAction } from './session';

interface Props {
  /** Formatting at the cursor, or null when no note is being edited. */
  format: FormatState | null;
  onFormat: (action: FormatAction) => void;
  /** Links the selection to an address; `text` is the link's text when nothing is selected. */
  onLink: (url: string, text?: string) => void;
  /** What the note can link to in its space, offered as the address is typed. */
  linkChoices: LinkChoice[];
  /** How the note writes a link to one of them. */
  linkHref: (choice: LinkChoice) => string;
  /** When the recording started, while one is going on. */
  recording: { since: number } | null;
  /** Why the microphone could not be used, for a moment. */
  recordError: string | null;
  onRecord: () => void;
  onStop: () => void;
  /** Makes a task from the selection, or from the line the cursor is on. */
  onToTask: () => void;
  onToCard: () => void;
  /** The keys that do the same, to show in the button's tooltip. */
  toTaskKeys: string;
  /** An image from a file, into the note at the cursor. */
  onImage: () => void;
  /** Find and replace in the note. */
  onFind: () => void;
  /** Opens the callout's kinds under the Callout button, at `at`. */
  onCallout: (at: { x: number; y: number }) => void;
}

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** The recording going on: a blinking dot, how long it has run, and the button that ends it. */
function Recording({ since, onStop }: { since: number; onStop: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="fmt-rec" role="status">
      <i />
      <span>{clock(now - since)}</span>
      <small>{t('format.recording')}</small>
      <button type="button" className="fmt-stop" title={t('format.stopTitle')} onClick={onStop}>
        {t('format.stop')}
      </button>
    </div>
  );
}

// Button faces that read the same in every language.
type Mark = 'B' | 'I' | 'S' | '</>' | 'H1' | 'H2' | 'H3';
const MARKS: ReadonlySet<string> = new Set<Mark>(['B', 'I', 'S', '</>', 'H1', 'H2', 'H3']);

interface Item {
  action: FormatAction;
  /** Shown on the button: a mark, or a key into the dictionary. */
  label: Mark | MessageKey;
  title: MessageKey;
  active?: (format: FormatState) => boolean;
  className?: string;
}

const groups: Item[][] = [
  [
    { action: 'bold', label: 'B', title: 'format.bold', active: (f) => f.bold, className: 'fmt-bold' },
    { action: 'italic', label: 'I', title: 'format.italic', active: (f) => f.italic, className: 'fmt-italic' },
    { action: 'strike', label: 'S', title: 'format.strike', active: (f) => f.strike, className: 'fmt-strike' },
    { action: 'code', label: '</>', title: 'format.code', active: (f) => f.code },
  ],
  [
    { action: 'h1', label: 'H1', title: 'format.h1', active: (f) => f.heading === 1 },
    { action: 'h2', label: 'H2', title: 'format.h2', active: (f) => f.heading === 2 },
    { action: 'h3', label: 'H3', title: 'format.h3', active: (f) => f.heading === 3 },
  ],
  [
    { action: 'list', label: 'format.list', title: 'format.listTitle', active: (f) => f.list },
    { action: 'ordered', label: 'format.ordered', title: 'format.orderedTitle', active: (f) => f.ordered },
    { action: 'indent', label: 'format.indent', title: 'format.indentTitle' },
    { action: 'outdent', label: 'format.outdent', title: 'format.outdentTitle' },
    { action: 'quote', label: 'format.quote', title: 'format.quote', active: (f) => f.quote },
    { action: 'codeBlock', label: 'format.codeBlock', title: 'format.codeBlock', active: (f) => f.codeBlock },
  ],
  [
    { action: 'nextMatch', label: 'format.nextMatch', title: 'format.nextMatchTitle' },
    { action: 'allMatches', label: 'format.allMatches', title: 'format.allMatchesTitle' },
    { action: 'cursorBelow', label: 'format.cursorBelow', title: 'format.cursorBelowTitle' },
  ],
];

// The bar must not take the focus (and with it the selection) away from the editor.
const keepEditorFocus = (event: MouseEvent) => {
  if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
};

/** The formatting controls: a fixed row above the editor that acts on the selection or the word at the cursor. */
export function FormatBar({ format, onFormat, onLink, linkChoices, linkHref, recording, recordError, onRecord, onStop, onToTask, onToCard, toTaskKeys, onImage, onFind, onCallout }: Props) {
  const [linking, setLinking] = useState(false);
  // Whether the bar goes on past the right edge of a narrow window.
  const bar = useRef<HTMLDivElement>(null);
  const [moreRight, setMoreRight] = useState(false);
  const measure = () => {
    const element = bar.current;
    if (element) setMoreRight(element.scrollLeft + element.clientWidth < element.scrollWidth - 1);
  };
  useEffect(() => {
    const element = bar.current;
    if (!element) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [linking, recording]);
  const [url, setUrl] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (linking) input.current?.focus();
  }, [linking]);

  // As the address is typed, what in the space it may name is offered under it; Esc closes the list first.
  const [offering, setOffering] = useState(false);
  const keys = useRef<((event: KeyboardEvent) => void) | null>(null);
  const offered = linking && offering ? matchChoices(linkChoices, url) : [];

  const startLink = () => {
    setUrl(format?.link?.url ?? '');
    setOffering(false);
    setLinking(true);
  };
  const finishLink = (value: string | null) => {
    setLinking(false);
    if (value !== null) onLink(value.trim());
  };
  const pick = (path: string | null) => {
    const choice = offered.find((c) => c.path === path);
    if (!choice) return;
    setLinking(false);
    onLink(linkHref(choice), choice.title);
  };
  const onKey = (event: KeyboardEvent) => {
    if (offered.length > 0) {
      keys.current?.(event);
      if (event.defaultPrevented) return;
    }
    if (event.key === 'Enter') {
      // The note takes the focus back at once, and the key would go on into it as a new line.
      event.preventDefault();
      finishLink(url);
    } else if (event.key === 'Escape') finishLink(null);
  };

  if (linking) {
    return (
      <div className="fmt" onMouseDown={keepEditorFocus}>
        <input
          id="link-address"
          ref={input}
          type="url"
          aria-label={t('format.linkAddress')}
          placeholder={t('format.linkPlaceholder')}
          value={url}
          autoComplete="off"
          onChange={(event) => {
            setUrl(event.target.value);
            setOffering(true);
          }}
          onKeyDown={onKey}
        />
        {offered.length > 0 && (
          <OptionList
            anchor={input}
            options={offered.map((c) => ({ value: c.path, label: c.title, hint: choiceHint(c), chip: false }))}
            current={[]}
            label={t('format.linkAddress')}
            keys={keys}
            width={360}
            className="link-choices"
            onPick={pick}
            onClose={() => setOffering(false)}
          />
        )}
        <button type="button" onClick={() => finishLink(url)}>
          {t('format.apply')}
        </button>
        {format?.link && !format.link.bare && (
          <button type="button" onClick={() => finishLink('')}>
            {t('format.removeLink')}
          </button>
        )}
        <button type="button" onClick={() => finishLink(null)}>
          {t('dialog.cancel')}
        </button>
        {recording && <Recording since={recording.since} onStop={onStop} />}
      </div>
    );
  }

  return (
    <div
      ref={bar}
      className={moreRight ? 'fmt more-right' : 'fmt'}
      role="toolbar"
      aria-label={t('format.label')}
      onMouseDown={keepEditorFocus}
      onScroll={measure}
      // A mouse wheel scrolls the bar sideways when it does not fit, as it does the tabs.
      onWheel={(event) => {
        if (!event.shiftKey && event.deltaY) event.currentTarget.scrollLeft += event.deltaY;
      }}
    >
      <div className="fmt-group">
        <button type="button" disabled={!format} onClick={() => onFormat('undo')}>
          {t('format.undo')}
        </button>
        <button type="button" disabled={!format} onClick={() => onFormat('redo')}>
          {t('format.redo')}
        </button>
      </div>
      {groups.map((items, i) => (
        <div className="fmt-group" key={i}>
          {items[0]?.action === 'nextMatch' && (
            <button type="button" title={t('format.findTitle')} disabled={!format} onClick={onFind}>
              {t('format.find')}
            </button>
          )}
          {items.map((item) => (
            <Fragment key={item.action}>
              <button
                type="button"
                className={item.className}
                title={t(item.title)}
                disabled={!format}
                aria-pressed={(format && item.active?.(format)) ?? false}
                onClick={() => onFormat(item.action)}
              >
                {MARKS.has(item.label) ? item.label : t(item.label as MessageKey)}
              </button>
              {/* Beside Quote: its kinds open in a menu under it. */}
              {item.action === 'quote' && (
                <button
                  type="button"
                  title={t('format.calloutTitle')}
                  disabled={!format}
                  aria-haspopup="menu"
                  aria-pressed={!!format?.callout}
                  onClick={(event) => {
                    const box = event.currentTarget.getBoundingClientRect();
                    onCallout({ x: box.left, y: box.bottom + 4 });
                  }}
                >
                  {t('format.callout')}
                </button>
              )}
            </Fragment>
          ))}
          {i === 0 && (
            <button type="button" title={t('format.link')} disabled={!format} aria-pressed={!!format?.link} onClick={startLink}>
              {t('format.link')}
            </button>
          )}

        </div>
      ))}
      {/* What goes into the note, beside the recording. */}
      <div className="fmt-group">
        <button type="button" title={t('format.imageTitle')} disabled={!format} onClick={onImage}>
          {t('format.image')}
        </button>
        <button type="button" title={t('format.table')} disabled={!format} onClick={() => onFormat('table')}>
          {t('format.table')}
        </button>
        <button type="button" title={t('format.divider')} disabled={!format} onClick={() => onFormat('divider')}>
          {t('format.divider')}
        </button>
      </div>
      {!recording && (
        <div className="fmt-group">
          <button type="button" title={t('format.recordTitle')} disabled={!format} onClick={onRecord}>
            {t('format.record')}
          </button>
        </div>
      )}
      {recording && <Recording since={recording.since} onStop={onStop} />}
      {/* Last: they take the text elsewhere, rather than shape it. */}
      <div className="fmt-group">
        <button type="button" title={t('format.toTaskTitle', { keys: toTaskKeys })} disabled={!format} onClick={onToTask}>
          {t('format.toTask')}
        </button>
        <button type="button" title={t('format.toCardTitle')} disabled={!format} onClick={onToCard}>
          {t('format.toCard')}
        </button>
      </div>
      {recordError && !recording && (
        <span className="fmt-error" role="alert">
          {recordError}
        </span>
      )}
    </div>
  );
}
