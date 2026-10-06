import { dayOf, type Version } from '@scrawlnotes/core';
import { createViewer, type ScrawlViewer } from '@scrawlnotes/editor';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Dialog } from './dialogs';
import { clockTime, pastDayLabel } from './text';

const MINUTE = 60_000;

/** How long ago a moment of the last day was: `just now`, `12 min ago`, `3 h ago`. */
function ago(iso: string, now: number): string | null {
  const minutes = Math.floor((now - Date.parse(iso)) / MINUTE);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  return minutes < 24 * 60 ? `${Math.floor(minutes / 60)} h ago` : null;
}

/** Where the window gets a note's versions from. */
export interface HistorySource {
  versions(path: string): Promise<Version[]>;
  readVersion(version: Version): Promise<string>;
  resolveImage(src: string): string;
}

/**
 * A note's earlier versions: the list on the left, the chosen one on the right as the editor
 * shows it, and a way to put it back.
 */
export function HistoryDialog({ path, title, current, today, source, onRestore, onClose }: {
  path: string;
  title: string;
  /** The note's text as it is now. */
  current: string;
  today: string;
  source: HistorySource;
  onRestore: (text: string) => void;
  onClose: () => void;
}) {
  const [versions, setVersions] = useState<Version[] | null>(null);
  /** The version shown, by its place in `versions`; -1 is the note as it is now. */
  const [selected, setSelected] = useState(-1);
  /** The text shown, once it is read. */
  const [shown, setShown] = useState<string | null>(current);
  const preview = useRef<HTMLDivElement>(null);
  const viewer = useRef<ScrawlViewer | null>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void source.versions(path).then((found) => {
      setVersions(found);
      // The latest earlier version is the one most often wanted back.
      if (found.length > 0) setSelected(0);
    });
  }, [source, path]);

  useEffect(() => {
    viewer.current = createViewer({ parent: preview.current!, doc: current, resolveImage: (src) => source.resolveImage(src) });
    return () => viewer.current?.destroy();
  }, [current, source]);

  useEffect(() => {
    const version = selected >= 0 ? versions?.[selected] : undefined;
    if (!version) {
      setShown(current);
      viewer.current?.show(current);
      return;
    }
    let stale = false;
    setShown(null);
    void source.readVersion(version).then((text) => {
      if (stale) return;
      setShown(text);
      viewer.current?.show(text);
    });
    return () => {
      stale = true;
    };
  }, [selected, versions, current, source]);

  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const count = versions?.length ?? 0;
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') setSelected((i) => Math.min(i + 1, count - 1));
    else if (event.key === 'ArrowUp') setSelected((i) => Math.max(i - 1, -1));
    else return;
    event.preventDefault();
  };

  // Latest first, so each day's group comes out in order.
  const days: { day: string; items: { version: Version; index: number }[] }[] = [];
  versions?.forEach((version, index) => {
    const day = dayOf(new Date(version.time));
    const last = days[days.length - 1];
    if (last?.day === day) last.items.push({ version, index });
    else days.push({ day, items: [{ version, index }] });
  });
  const now = Date.now();
  const row = (index: number, label: string, detail: string | null) => (
    <button
      key={index}
      type="button"
      role="option"
      aria-selected={index === selected}
      tabIndex={-1}
      onClick={() => setSelected(index)}
    >
      <span>{label}</span>
      {detail && <small>{detail}</small>}
    </button>
  );

  return (
    <Dialog label={`History of ${title}`} className="history" onClose={onClose} onKeyDown={onKey}>
      <header className="history-head">
        <h2>History</h2>
        <span>{title}</span>
      </header>
      <div className="history-body">
        <div ref={list} className="history-list" role="listbox" aria-label="Versions">
          {row(-1, 'Current version', null)}
          {days.map(({ day, items }) => (
            <div key={day}>
              <div className="history-day">{pastDayLabel(day, today)}</div>
              {items.map(({ version, index }) =>
                row(index, clockTime(version.time), index === selected ? ago(version.time, now) : null),
              )}
            </div>
          ))}
          {versions?.length === 0 && <p>No earlier versions yet. One is kept at most every ten minutes while you write.</p>}
        </div>
        <div ref={preview} className="history-view" />
      </div>
      <div className="dialog-actions history-foot">
        <span>Restoring keeps the current text as a version too.</span>
        <button type="button" onClick={onClose}>
          Close
        </button>
        <button
          type="button"
          className="primary"
          disabled={selected < 0 || shown === null}
          onClick={() => shown !== null && onRestore(shown)}
        >
          Restore this version
        </button>
      </div>
    </Dialog>
  );
}
