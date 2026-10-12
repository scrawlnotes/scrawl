import type { FormatState, LinkTap } from '@scrawlnotes/editor';
import { t } from '@scrawlnotes/i18n';
import { type FormEvent, type MouseEvent, type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon';
import type { FormatAction } from './session';
import { Sheet } from './sheets';

// A note on a phone, after the Phone note views of design/mockups.html. Typing brings up the
// format bar on the keyboard: Undo and Redo first, then the marks and the link, the headings, the
// blocks, To task and To card, an image and a recording; it scrolls sideways. A recording going
// on shows its time and Stop at the bar's start, and writing goes on. A link tapped shows Open,
// Edit and Copy above it; Edit opens its address in a sheet.

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// The bar must not take the focus, and with it the keyboard, away from the note.
const keepFocus = (event: MouseEvent) => event.preventDefault();

/** Whether the note in `holder` is being typed in: its text has the focus. */
function useTyping(bar: RefObject<HTMLElement | null>) {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const check = () => {
      const active = document.activeElement;
      const holder = bar.current?.parentElement;
      setTyping(!!active && !!holder?.contains(active) && !!active.closest('.cm-content'));
    };
    // Focus moves after `focusout`; it is looked at once it has landed.
    const later = () => window.setTimeout(check);
    document.addEventListener('focusin', check);
    document.addEventListener('focusout', later);
    check();
    return () => {
      document.removeEventListener('focusin', check);
      document.removeEventListener('focusout', later);
    };
  }, [bar]);
  return typing;
}

/** A recording going on: its dot, how long it has run and Stop. */
function Recording({ since, onStop }: { since: number; onStop: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <span className="mb-rec" role="status">
      <i />
      {clock(now - since)}
      <button type="button" onClick={onStop}>
        {t('format.stop')}
      </button>
    </span>
  );
}

interface Button {
  action: FormatAction | 'link' | 'toTask' | 'toCard' | 'image' | 'record';
  /** An icon, or a face that reads the same in every language. */
  face: IconName | 'B' | 'I' | 'S' | '</>' | 'H1' | 'H2' | 'H3';
  /** What it says, for a screen reader and in words where there is no icon. */
  label: string;
  on?: (format: FormatState) => boolean;
  className?: string;
}

const FACES: ReadonlySet<string> = new Set(['B', 'I', 'S', '</>', 'H1', 'H2', 'H3']);

/** The format bar of a phone: on the keyboard while the note is typed in, or while a recording goes on. */
export function PhoneFormatBar({ format, recording, recordError, onFormat, onLink, onImage, onRecord, onStop, onToTask, onToCard }: {
  format: FormatState | null;
  recording: { since: number } | null;
  recordError: string | null;
  onFormat: (action: FormatAction) => void;
  onLink: () => void;
  onImage: () => void;
  onRecord: () => void;
  onStop: () => void;
  onToTask: () => void;
  onToCard: () => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const typing = useTyping(bar);
  const [more, setMore] = useState({ left: false, right: false });
  const measure = () => {
    const element = bar.current;
    if (element) setMore({ left: element.scrollLeft > 1, right: element.scrollLeft + element.clientWidth < element.scrollWidth - 1 });
  };
  useEffect(() => {
    const element = bar.current;
    if (!element) return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const groups: Button[][] = [
    [
      { action: 'undo', face: 'undo', label: t('format.undo') },
      { action: 'redo', face: 'redo', label: t('format.redo') },
    ],
    [
      { action: 'bold', face: 'B', label: t('format.bold'), on: (f) => f.bold, className: 'bold' },
      { action: 'italic', face: 'I', label: t('format.italic'), on: (f) => f.italic, className: 'italic' },
      { action: 'strike', face: 'S', label: t('format.strike'), on: (f) => f.strike, className: 'strike' },
      { action: 'code', face: '</>', label: t('format.code'), on: (f) => f.code },
      { action: 'link', face: 'link', label: t('format.link'), on: (f) => !!f.link },
    ],
    [
      { action: 'h1', face: 'H1', label: t('format.h1'), on: (f) => f.heading === 1 },
      { action: 'h2', face: 'H2', label: t('format.h2'), on: (f) => f.heading === 2 },
      { action: 'h3', face: 'H3', label: t('format.h3'), on: (f) => f.heading === 3 },
    ],
    [
      { action: 'list', face: 'list', label: t('format.listTitle'), on: (f) => f.list },
      { action: 'quote', face: 'quote', label: t('format.quote'), on: (f) => f.quote },
      { action: 'codeBlock', face: 'codeBlock', label: t('format.codeBlock'), on: (f) => f.codeBlock },
    ],
    [
      { action: 'toTask', face: 'tasks', label: t('format.toTask'), className: 'text' },
      { action: 'toCard', face: 'board', label: t('format.toCard'), className: 'text' },
    ],
    [
      { action: 'image', face: 'image', label: t('slash.image') },
      ...(recording ? [] : [{ action: 'record', face: 'audio', label: t('format.record') } as Button]),
    ],
  ];
  const run = (action: Button['action']) => {
    if (action === 'link') onLink();
    else if (action === 'toTask') onToTask();
    else if (action === 'toCard') onToCard();
    else if (action === 'image') onImage();
    else if (action === 'record') onRecord();
    else onFormat(action);
  };
  const shown = typing || !!recording;
  return (
    <div
      ref={bar}
      className={['mb-fbar', shown ? '' : 'off', more.left ? 'more-left' : '', more.right ? 'more-right' : ''].filter(Boolean).join(' ')}
      role="toolbar"
      aria-label={t('format.label')}
      aria-hidden={!shown}
      onMouseDown={keepFocus}
      onScroll={measure}
    >
      {recording && <Recording since={recording.since} onStop={onStop} />}
      {recordError && !recording && (
        <span className="mb-rec-error" role="alert">
          {recordError}
        </span>
      )}
      {groups.map((group, i) => (
        <span key={i} className="g">
          {group.map((button) => (
            <button
              key={button.action}
              type="button"
              className={[button.className, FACES.has(button.face) ? 'word' : ''].filter(Boolean).join(' ') || undefined}
              aria-label={button.label}
              title={button.label}
              disabled={!format}
              aria-pressed={button.on ? ((format && button.on(format)) ?? false) : undefined}
              tabIndex={shown ? 0 : -1}
              onClick={() => run(button.action)}
            >
              {button.className === 'text' ? button.label : FACES.has(button.face) ? button.face : <Icon name={button.face as IconName} />}
            </button>
          ))}
        </span>
      ))}
    </div>
  );
}

/** A link's address in a sheet: Cancel, Apply, and Remove link for a link there already. */
export function LinkSheet({ url, linked, onApply, onClose }: {
  url: string;
  /** Whether the text is a link already: it can then be taken away. */
  linked: boolean;
  onApply: (url: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(url);
  const apply = (event?: FormEvent) => {
    event?.preventDefault();
    onApply(value.trim());
  };
  return (
    <Sheet label={t('format.link')} className="mb-create" onClose={onClose}>
      <div className="mb-sh three">
        <button type="button" className="cancel" onClick={onClose}>
          {t('dialog.cancel')}
        </button>
        <b>{t('format.link')}</b>
        <button type="button" className="ok" onClick={() => apply()}>
          {t('format.apply')}
        </button>
      </div>
      <form className="mb-form" onSubmit={apply}>
        <div className="mb-group">
          <label className="mb-fr">
            <input
              className="in"
              type="url"
              inputMode="url"
              enterKeyHint="done"
              autoFocus
              aria-label={t('format.linkAddress')}
              placeholder={t('format.linkPlaceholder')}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
        </div>
        {linked && (
          <div className="mb-group apart">
            <button type="button" className="mb-fr red" onClick={() => onApply('')}>
              {t('format.removeLink')}
            </button>
          </div>
        )}
      </form>
    </Sheet>
  );
}

/** What can be done with a link tapped: Open, Edit and Copy, above it, or under it near the top. */
export function LinkActions({ link, onOpen, onEdit, onCopy, onClose }: {
  link: LinkTap;
  onOpen: () => void;
  onEdit: () => void;
  onCopy: () => void;
  onClose: () => void;
}) {
  const pop = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const element = pop.current;
    if (!element) return;
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const middle = link.box.left + link.box.width / 2;
    const left = Math.min(Math.max(8, middle - width / 2), window.innerWidth - width - 8);
    const above = link.box.top - height - 8;
    setPlace({ left, top: above > 56 ? above : link.box.bottom + 8 });
  }, [link]);
  // Scrolling moves the link away from it.
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, [onClose]);
  const act = (run: () => void) => () => {
    onClose();
    run();
  };
  const item = (icon: IconName, label: string, run: () => void): ReactNode => (
    <button type="button" onClick={act(run)}>
      <Icon name={icon} />
      {label}
    </button>
  );
  return (
    <>
      {/* A new touch anywhere else closes it; the tap that opened it does not. */}
      <div className="mb-pop-back" onPointerDown={onClose} />
      <div ref={pop} className="mb-pop" role="menu" style={place ?? { visibility: 'hidden' }}>
        {item('open', t('phone.openLink'), onOpen)}
        <i />
        {item('pen', t('phone.editLink'), onEdit)}
        <i />
        {item('copy', t('phone.copyLink'), onCopy)}
      </div>
    </>
  );
}
