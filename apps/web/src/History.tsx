import { dayOf, type Version } from '@scrawlnotes/core';
import { createViewer, type ScrawlViewer } from '@scrawlnotes/editor';
import { t } from '@scrawlnotes/i18n';
import { Fragment, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Dialog } from './dialogs';
import { Icon } from './Icon';
import { clockTime, pastDayLabel } from './text';

const MINUTE = 60_000;

/** How long ago a moment of the last day was: `just now`, `12 min ago`, `3 h ago`. */
function ago(iso: string, now: number): string | null {
  const minutes = Math.floor((now - Date.parse(iso)) / MINUTE);
  if (minutes < 1) return t('ago.now');
  if (minutes < 60) return t('ago.minutes', { count: minutes });
  return minutes < 24 * 60 ? t('ago.hours', { count: Math.floor(minutes / 60) }) : null;
}

/** Where the window gets a note's versions from. */
export interface HistorySource {
  versions(path: string): Promise<Version[]>;
  readVersion(version: Version): Promise<string>;
  resolveImage(src: string): string | Promise<string>;
}

/** Versions by day, the latest first, each with its place in the list. */
function byDay(versions: Version[] | null) {
  const days: { day: string; items: { version: Version; index: number }[] }[] = [];
  versions?.forEach((version, index) => {
    const day = dayOf(new Date(version.time));
    const last = days[days.length - 1];
    if (last?.day === day) last.items.push({ version, index });
    else days.push({ day, items: [{ version, index }] });
  });
  return days;
}

/** When a version was written, as a phone's page names it: `Today, 14:12`. */
export const versionLabel = (version: Version, today: string) => `${pastDayLabel(dayOf(new Date(version.time)), today)}, ${clockTime(version.time)}`;

/**
 * A note's versions on a phone, as a page, after the Phone note more view of design/mockups.html:
 * the note as it is now, then each day's versions, the latest first and how long ago it was.
 * `onPick` gets a version, or null for the note as it is.
 */
export function HistoryList({ path, today, source, onPick }: {
  path: string;
  today: string;
  source: HistorySource;
  onPick: (version: Version | null) => void;
}) {
  const [versions, setVersions] = useState<Version[] | null>(null);
  useEffect(() => {
    void source.versions(path).then(setVersions);
  }, [source, path]);
  const now = Date.now();
  const row = (key: string, icon: 'note' | 'clock', label: string, detail: string | null, pick: () => void) => (
    <button key={key} type="button" className="mb-row" onClick={pick}>
      <Icon name={icon} />
      <span className="tx">
        <b>{label}</b>
      </span>
      {detail && <span className="ct">{detail}</span>}
      <Icon name="chevron" />
    </button>
  );
  return (
    <>
      <div className="mb-list">{row('now', 'note', t('history.current'), null, () => onPick(null))}</div>
      {byDay(versions).map(({ day, items }) => (
        <Fragment key={day}>
          <div className="mb-sec">
            <span>{pastDayLabel(day, today)}</span>
          </div>
          <div className="mb-list">
            {items.map(({ version, index }) =>
              row(version.time, 'clock', clockTime(version.time), index === 0 ? ago(version.time, now) : null, () => onPick(version)),
            )}
          </div>
        </Fragment>
      ))}
      {versions?.length === 0 && <p className="mb-none">{t('history.none')}</p>}
    </>
  );
}

/** One earlier version of a note on a phone, as a page: the note as it was, and Restore at the foot. */
export function VersionView({ version, source, onRestore }: { version: Version; source: HistorySource; onRestore: (text: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    const viewer = createViewer({ parent: host.current!, doc: '', resolveImage: (src) => source.resolveImage(src) });
    let stale = false;
    void source.readVersion(version).then((read) => {
      if (stale) return;
      setText(read);
      viewer.show(read);
    });
    return () => {
      stale = true;
      viewer.destroy();
    };
  }, [version, source]);
  return (
    <>
      <div ref={host} className="mb-version" />
      <div className="mb-foot">
        <small>{t('history.hint')}</small>
        <button type="button" className="mb-btn" disabled={text === null} onClick={() => text !== null && onRestore(text)}>
          {t('history.restore')}
        </button>
      </div>
    </>
  );
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
  const days = byDay(versions);
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
    <Dialog label={t('history.label', { name: title })} className="history" onClose={onClose} onKeyDown={onKey}>
      <header className="history-head">
        <h2>{t('history.title')}</h2>
        <span>{title}</span>
      </header>
      <div className="history-body">
        <div ref={list} className="history-list" role="listbox" aria-label={t('history.versions')}>
          {row(-1, t('history.current'), null)}
          {days.map(({ day, items }) => (
            <div key={day}>
              <div className="history-day">{pastDayLabel(day, today)}</div>
              {items.map(({ version, index }) =>
                row(index, clockTime(version.time), index === selected ? ago(version.time, now) : null),
              )}
            </div>
          ))}
          {versions?.length === 0 && <p>{t('history.none')}</p>}
        </div>
        <div ref={preview} className="history-view" />
      </div>
      <div className="dialog-actions history-foot">
        <span>{t('history.hint')}</span>
        <button type="button" onClick={onClose}>
          {t('dialog.close')}
        </button>
        <button
          type="button"
          className="primary"
          disabled={selected < 0 || shown === null}
          onClick={() => shown !== null && onRestore(shown)}
        >
          {t('history.restore')}
        </button>
      </div>
    </Dialog>
  );
}
