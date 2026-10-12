import { t } from '@scrawlnotes/i18n';
import { Fragment, type KeyboardEvent, type ReactNode, type TouchEvent, useEffect, useRef, useState } from 'react';
import type { MenuHead, MenuItem } from './dialogs';
import { Icon } from './Icon';

// The windows and menus of a phone, after the Phone create and Phone menus views of
// design/mockups.html. A window is a sheet that comes up from the bottom, its buttons at its top,
// where the keyboard never covers them; pulled down it closes. A menu is an action sheet: what it
// is about on top, Delete last and red, Cancel apart.

/** How far a sheet is pulled down before it closes when let go. */
const PULL = 90;
/** When the keyboard is up the window loses at least this much of its height. */
const KEYBOARD = 120;

/** The part of the page the phone shows: the keyboard, when up, is not in it. */
export function useViewport() {
  const read = () => {
    const view = window.visualViewport;
    return view ? { top: view.offsetTop, height: view.height } : { top: 0, height: window.innerHeight };
  };
  const [box, setBox] = useState(read);
  useEffect(() => {
    const view = window.visualViewport;
    if (!view) return;
    const update = () => setBox(read());
    view.addEventListener('resize', update);
    view.addEventListener('scroll', update);
    return () => {
      view.removeEventListener('resize', update);
      view.removeEventListener('scroll', update);
    };
  }, []);
  return { ...box, keyboard: window.innerHeight - box.height > KEYBOARD };
}

/**
 * A window on a phone: it comes up from the bottom over a dimmed page, sits above the keyboard,
 * and closes when the dim is tapped or when it is pulled down by its top.
 */
export function Sheet({ label, className, onClose, onEscape = onClose, onKeyDown, children }: {
  label: string;
  className?: string;
  onClose: () => void;
  /** What Esc does, when it is not closing. */
  onEscape?: () => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  children: ReactNode;
}) {
  const view = useViewport();
  const panel = useRef<HTMLDivElement>(null);
  const [pull, setPull] = useState<number | null>(null);
  const touch = useRef<{ y: number } | null>(null);

  useEffect(() => {
    // Take the keyboard away from the editor, unless a field inside asked for it itself.
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus({ preventScroll: true });
  }, []);

  // Pulled down by its top, or anywhere while its content is at the top and nothing is typed into.
  const start = (event: TouchEvent) => {
    const sheet = panel.current;
    if (!sheet) return;
    const point = event.touches[0]!;
    const target = event.target as HTMLElement;
    const top = point.clientY - sheet.getBoundingClientRect().top < 64;
    const scroller = target.closest('.mb-scroll, .choices');
    if (!top && (target.closest('input, textarea, select') || (scroller && scroller.scrollTop > 0) || sheet.scrollTop > 0)) return;
    touch.current = { y: point.clientY };
  };
  const move = (event: TouchEvent) => {
    if (!touch.current) return;
    const dy = event.touches[0]!.clientY - touch.current.y;
    if (pull === null && dy < 6) {
      // Moving up, or hardly at all: the sheet scrolls instead.
      if (dy < 0) touch.current = null;
      return;
    }
    setPull(Math.max(0, dy));
  };
  const end = () => {
    if (pull !== null && pull > PULL) onClose();
    touch.current = null;
    setPull(null);
  };

  return (
    <div
      className={view.keyboard ? 'mb-sheet-back kb' : 'mb-sheet-back'}
      style={{ top: view.top, height: view.height }}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={panel}
        className={className ? `mb-sheet ${className}` : 'mb-sheet'}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        style={pull ? { transform: `translateY(${pull}px)`, transition: 'none' } : undefined}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
        onTouchCancel={end}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return onKeyDown?.(event);
          event.preventDefault();
          onEscape();
        }}
      >
        <span className="mb-grab" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}

/** The × at the top right of a sheet that has no Cancel. */
export function SheetClose({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className="mb-x" aria-label={t('dialog.close')} title={t('dialog.close')} onClick={onClose}>
      <Icon name="close" />
    </button>
  );
}

/** A menu on a phone. A Delete, or anything else that takes something away, comes last and red. */
export function ActionSheet({ head, items, onClose }: { head?: MenuHead; items: MenuItem[]; onClose: () => void }) {
  const groups: MenuItem[][] = [];
  for (const item of items.filter((each) => !each.danger)) {
    if (item.apart || groups.length === 0) groups.push([]);
    groups[groups.length - 1]!.push(item);
  }
  const danger = items.filter((each) => each.danger);
  if (danger.length > 0) groups.push(danger);
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="mb-acts-back" onClick={onClose} />
      <div className="mb-acts" role="menu" aria-label={head?.title}>
        <div className="mb-card">
          {head && (
            <div className="hd">
              <Icon name={head.icon} />
              <span>
                <b>{head.title}</b>
                {head.sub && <small>{head.sub}</small>}
              </span>
            </div>
          )}
          {groups.map((group, i) => (
            <Fragment key={i}>
              {i > 0 && <div className="sep" />}
              {group.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  className={item.danger ? 'a red' : 'a'}
                  disabled={item.disabled !== undefined}
                  onClick={() => {
                    onClose();
                    item.run();
                  }}
                >
                  {item.icon && <Icon name={item.icon} />}
                  <span className="lb">
                    {item.label}
                    {item.disabled && <small>{item.disabled}</small>}
                  </span>
                  {item.value && <span className="on">{item.value}</span>}
                </button>
              ))}
            </Fragment>
          ))}
        </div>
        <div className="mb-card">
          <button type="button" className="a cancel" onClick={onClose}>
            {t('dialog.cancel')}
          </button>
        </div>
      </div>
    </>
  );
}

/** Asks before something is taken away, as an action sheet: what will happen, the action, Cancel. */
export function AskSheet({ title, message, action, danger = true, onConfirm, onClose }: {
  title: string;
  message: string;
  action: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="mb-acts-back" onClick={onClose} />
      <div className="mb-acts" role="alertdialog" aria-label={title}>
        <div className="mb-card">
          <div className="ask">
            <b>{title}</b>
            <small>{message}</small>
          </div>
          <button type="button" className={danger ? 'a red center' : 'a center'} onClick={onConfirm}>
            {action}
          </button>
        </div>
        <div className="mb-card">
          <button type="button" className="a cancel" onClick={onClose}>
            {t('dialog.cancel')}
          </button>
        </div>
      </div>
    </>
  );
}
