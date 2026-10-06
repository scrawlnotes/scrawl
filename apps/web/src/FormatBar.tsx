import type { FormatState } from '@scrawlnotes/editor';
import { type KeyboardEvent, type MouseEvent, useEffect, useRef, useState } from 'react';
import type { FormatAction } from './session';

interface Props {
  /** Formatting at the cursor, or null when no note is being edited. */
  format: FormatState | null;
  onFormat: (action: FormatAction) => void;
  onLink: (url: string) => void;
}

interface Item {
  action: FormatAction;
  label: string;
  title: string;
  active?: (format: FormatState) => boolean;
  className?: string;
}

const groups: Item[][] = [
  [
    { action: 'bold', label: 'B', title: 'Bold', active: (f) => f.bold, className: 'fmt-bold' },
    { action: 'italic', label: 'I', title: 'Italic', active: (f) => f.italic, className: 'fmt-italic' },
    { action: 'strike', label: 'S', title: 'Strikethrough', active: (f) => f.strike, className: 'fmt-strike' },
    { action: 'code', label: '</>', title: 'Code', active: (f) => f.code },
  ],
  [
    { action: 'h1', label: 'H1', title: 'Heading 1', active: (f) => f.heading === 1 },
    { action: 'h2', label: 'H2', title: 'Heading 2', active: (f) => f.heading === 2 },
    { action: 'h3', label: 'H3', title: 'Heading 3', active: (f) => f.heading === 3 },
  ],
  [
    { action: 'list', label: 'List', title: 'Bullet list', active: (f) => f.list },
    { action: 'quote', label: 'Quote', title: 'Quote', active: (f) => f.quote },
    { action: 'codeBlock', label: 'Code block', title: 'Code block', active: (f) => f.codeBlock },
  ],
  [
    { action: 'nextMatch', label: 'Next match', title: 'Also select the next match (Ctrl+D)' },
    { action: 'allMatches', label: 'All matches', title: 'Select every match of the selection' },
    { action: 'cursorBelow', label: 'Cursor below', title: 'Add a cursor on the line below (Ctrl+Alt+Down)' },
  ],
];

// The bar must not take the focus (and with it the selection) away from the editor.
const keepEditorFocus = (event: MouseEvent) => {
  if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
};

/** The formatting controls: a fixed row above the editor that acts on the selection or the word at the cursor. */
export function FormatBar({ format, onFormat, onLink }: Props) {
  const [linking, setLinking] = useState(false);
  const [url, setUrl] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (linking) input.current?.focus();
  }, [linking]);

  const startLink = () => {
    setUrl(format?.link?.url ?? '');
    setLinking(true);
  };
  const finishLink = (value: string | null) => {
    setLinking(false);
    if (value !== null) onLink(value.trim());
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Enter') finishLink(url);
    else if (event.key === 'Escape') finishLink(null);
  };

  if (linking) {
    return (
      <div className="fmt" onMouseDown={keepEditorFocus}>
        <input
          id="link-address"
          ref={input}
          type="url"
          aria-label="Link address"
          placeholder="Paste or type a link, then press Enter"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={onKey}
        />
        <button type="button" onClick={() => finishLink(url)}>
          Apply
        </button>
        {format?.link && (
          <button type="button" onClick={() => finishLink('')}>
            Remove link
          </button>
        )}
        <button type="button" onClick={() => finishLink(null)}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="fmt" role="toolbar" aria-label="Formatting" onMouseDown={keepEditorFocus}>
      {groups.map((items, i) => (
        <div className="fmt-group" key={i}>
          {items.map((item) => (
            <button
              key={item.action}
              type="button"
              className={item.className}
              title={item.title}
              disabled={!format}
              aria-pressed={(format && item.active?.(format)) ?? false}
              onClick={() => onFormat(item.action)}
            >
              {item.label}
            </button>
          ))}
          {i === 0 && (
            <button type="button" title="Link" disabled={!format} aria-pressed={!!format?.link} onClick={startLink}>
              Link
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
