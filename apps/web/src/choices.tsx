import { type Field, type OptionColor, optionColor } from '@scrawlnotes/core';
import { type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Choices as chips and the lists they are picked from, for a collection's records and its Fields
// window: a list opens under its box, as a card's status list does, and Esc closes it first.

/** A label's colour, the same every time it is seen: a hue from its letters. */
export function labelHue(label: string): number {
  let hash = 0;
  for (const char of label) hash = (hash * 31 + char.codePointAt(0)!) % 360;
  return hash;
}

/** How close to the window's edge a list may come. */
const EDGE = 8;

/** Each color of a choice as a hue and a saturation. */
const HUES: { [color in OptionColor]: [number, number] } = {
  gray: [220, 8],
  red: [2, 70],
  orange: [26, 75],
  yellow: [44, 75],
  green: [140, 45],
  teal: [174, 50],
  blue: [214, 70],
  purple: [268, 55],
  pink: [328, 60],
};

/** A choice as a chip, in the color the schema gives it, else colored by its text as a card's labels are. */
export function Chip({ text, color, children }: { text: string; color?: OptionColor; children?: ReactNode }) {
  return (
    <span className="lbl" style={hueStyle(color, text)}>
      {text}
      {children}
    </span>
  );
}

export interface Option {
  value: string | null;
  label: string;
  /** Shown as a chip, colored by its text unless `color` says; the empty choice and "add" are plain. */
  chip: boolean;
  color?: OptionColor;
  /** A line above it, apart from the choices before it. */
  apart?: boolean;
  /** What it is for, said after it. */
  hint?: string;
  /** Shown faint, and not picked. */
  disabled?: boolean;
}

/** The choices of a field as options, in the colors the schema gives them. */
export const choiceOptions = (field: Field, values: string[]): Option[] => values.map((o) => ({ value: o, label: o, chip: true, color: optionColor(field, o) }));

/** Keys the list handles while a box keeps the keyboard; the box passes them on. */
export const LIST_KEYS = ['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'];

/**
 * The choices of a field, under its box, or above it when there is more room there, as a card's
 * status list is. The arrow keys move through it, Enter picks, Esc closes. The box that opened it
 * keeps the keyboard and hands these keys over through `keys`.
 */
export function OptionList({ anchor, options, current, label, keys, onPick, onClose, width = 220, end = false, className }: {
  anchor: RefObject<HTMLElement | null>;
  options: Option[];
  /** The values chosen now, ticked. */
  current: string[];
  label: string;
  keys: RefObject<((event: KeyboardEvent) => void) | null>;
  onPick: (value: string | null) => void;
  onClose: () => void;
  /** The least width of the list; it is as wide as its box when that is wider. */
  width?: number;
  /** Lined up with the box's right edge rather than its left. */
  end?: boolean;
  className?: string;
}) {
  const [at, setAt] = useState(() => Math.max(0, options.findIndex((o) => o.value !== null && current.includes(o.value))));
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const latest = useRef({ options, at, onPick, onClose });
  latest.current = { options, at, onPick, onClose };

  useLayoutEffect(() => {
    const measure = () => {
      const field = anchor.current?.getBoundingClientRect();
      const height = box.current?.offsetHeight ?? 0;
      if (!field) return;
      const below = window.innerHeight - field.bottom - EDGE - 4;
      const above = field.top - EDGE - 4;
      const wide = Math.max(field.width, width);
      const left = Math.max(EDGE, Math.min(end ? field.right - wide : field.left, window.innerWidth - wide - EDGE));
      setPlace(below >= height || below >= above ? { left, width: wide, top: field.bottom + 4 } : { left, width: wide, bottom: window.innerHeight - field.top + 4 });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [anchor, options.length, width, end]);

  useEffect(() => {
    const away = (event: globalThis.MouseEvent) => {
      const target = event.target as Node;
      if (!box.current?.contains(target) && !anchor.current?.contains(target)) latest.current.onClose();
    };
    window.addEventListener('mousedown', away);
    return () => window.removeEventListener('mousedown', away);
  }, [anchor]);

  useEffect(() => {
    if (at > options.length - 1) setAt(Math.max(0, options.length - 1));
  }, [options.length, at]);

  useEffect(() => {
    keys.current = (event) => {
      const { options: now, at: here, onPick: pick, onClose: close } = latest.current;
      // The arrows step over what cannot be picked.
      const step = (by: number) => {
        let next = here;
        for (let n = 0; n < now.length; n++) {
          next = (next + by + now.length) % now.length;
          if (!now[next]?.disabled) return setAt(next);
        }
      };
      if (event.key === 'ArrowDown') step(1);
      else if (event.key === 'ArrowUp') step(-1);
      else if (event.key === 'Enter') {
        const option = now[here];
        if (option && !option.disabled) pick(option.value);
      } else if (event.key === 'Escape' || event.key === 'Tab') close();
      else return;
      event.preventDefault();
      event.stopPropagation();
    };
    return () => {
      keys.current = null;
    };
  }, [keys]);

  return createPortal(
    <div ref={box} className={className ? `lbl-picker st-picker opt-list ${className}` : 'lbl-picker st-picker opt-list'} role="listbox" aria-label={label} style={place ?? { opacity: 0 }}>
      {options.map((option, index) => {
        const on = option.value !== null && current.includes(option.value);
        return (
          <button
            key={option.value ?? '\u0000'}
            type="button"
            role="option"
            aria-selected={on}
            aria-disabled={option.disabled || undefined}
            tabIndex={-1}
            className={[index === at && !option.disabled && 'at', option.apart && 'apart', option.disabled && 'off'].filter(Boolean).join(' ') || undefined}
            onMouseDown={(event) => event.preventDefault()}
            onMouseMove={() => index !== at && !option.disabled && setAt(index)}
            onClick={() => !option.disabled && onPick(option.value)}
          >
            <span className="nm">{option.chip ? <Chip text={option.label} color={option.color} /> : <span className={option.value === null ? 'none' : undefined}>{option.label}</span>}</span>
            {option.hint && <small className="hint">{option.hint}</small>}
            <span className="tick">{on ? '✓' : ''}</span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

/** What a box that opens a list does with the keys: the list's while it is open, opening it while it is not. */
export function boxKeys(open: boolean, setOpen: (open: boolean) => void, keys: RefObject<((event: KeyboardEvent) => void) | null>) {
  return (event: KeyboardEvent) => {
    if (open && LIST_KEYS.includes(event.key)) keys.current?.(event);
    else if (!open && (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      setOpen(true);
    }
  };
}

/** One choice from a list, as a box that opens the list under it; the box shows the choice, or `text` when it is given. */
export function Picker({ options, value, label, text, onPick, className }: {
  options: Option[];
  value: string | null;
  label: string;
  text?: string;
  /** Null for the empty choice, where the list has one. */
  onPick: (value: string | null) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLButtonElement>(null);
  const keys = useRef<((event: KeyboardEvent) => void) | null>(null);
  // Nothing chosen shows the box's own label, not the empty choice's.
  const current = value === null ? undefined : options.find((o) => o.value === value);
  return (
    <>
      <button
        ref={box}
        type="button"
        className={className ? `st-field ${className}` : 'st-field'}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen(!open)}
        onKeyDown={boxKeys(open, setOpen, keys)}
      >
        <span className="nm">{text ?? (current ? (current.chip ? <Chip text={current.label} color={current.color} /> : current.label) : <span className="none">{label}</span>)}</span>
        <span className="dd" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <OptionList
          anchor={box}
          options={options}
          current={value ? [value] : []}
          label={label}
          keys={keys}
          onPick={(picked) => {
            setOpen(false);
            onPick(picked);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** Several choices from a list: the ones picked as chips in the box, the list stays open while picking. */
export function MultiPicker({ options, picked, label, onChange, className }: {
  options: Option[];
  picked: string[];
  label: string;
  onChange: (picked: string[]) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLButtonElement>(null);
  const keys = useRef<((event: KeyboardEvent) => void) | null>(null);
  return (
    <>
      <button
        ref={box}
        type="button"
        className={className ? `st-field multi ${className}` : 'st-field multi'}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen(!open)}
        onKeyDown={boxKeys(open, setOpen, keys)}
      >
        <span className="nm">
          {picked.length === 0 ? (
            <span className="none">{label}</span>
          ) : (
            picked.map((p) => {
              const option = options.find((o) => o.value === p);
              return option?.chip ? <Chip key={p} text={p} color={option.color} /> : <span key={p} className="lnk">{option?.label ?? p}</span>;
            })
          )}
        </span>
        <span className="dd" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <OptionList
          anchor={box}
          options={options}
          current={picked}
          label={label}
          keys={keys}
          onPick={(value) => value !== null && onChange(picked.includes(value) ? picked.filter((p) => p !== value) : [...picked, value])}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/**
 * Esc closes the window `within` holds, wherever the keyboard is, in it or nowhere after what had
 * it went away; only the window on top does, and not while a list is open, which Esc closes first.
 * With `on` false it does nothing, for a window whose keys something else handles.
 */
export function useEscape(within: RefObject<HTMLElement | null>, onEscape: () => void, on = true) {
  const latest = useRef({ onEscape, on });
  latest.current = { onEscape, on };
  useEffect(() => {
    const key = (event: globalThis.KeyboardEvent) => {
      if (!latest.current.on || event.key !== 'Escape' || event.defaultPrevented || document.querySelector('.opt-list')) return;
      const windows = document.querySelectorAll('.backdrop');
      if (windows[windows.length - 1] !== within.current) return;
      event.preventDefault();
      latest.current.onEscape();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [within]);
}

/** The style that gives a chip or a swatch its color: the one named, else one from its text. */
export function hueStyle(color: OptionColor | undefined, text: string): CSSProperties {
  const [hue, saturation] = color ? HUES[color] : [labelHue(text), 60];
  return { '--lh': hue, '--ls': `${saturation}%` } as CSSProperties;
}
