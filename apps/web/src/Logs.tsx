import { addDays, dayOf } from '@scrawlnotes/core';
import { locale, type MessageKey, t } from '@scrawlnotes/i18n';
import { Fragment, type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { writeClipboard } from './Keys';
import { LOG_KEEP, type LogLine, logLines, logText, subscribeLog, timeOf } from './log';
import { saveTextFile } from './storage';

// Settings › Logs: the device's log lines, the oldest first and scrolled to the newest, each day
// under its heading; All, Warnings or Errors; Copy and Save… give the lines shown as a log file
// has them. On a phone a page of Settings, with Copy in its bar. After the Settings › Logs and
// Phone, Logs views of design/mockups.html ("Açılış").

export type LogShow = 'all' | 'warn' | 'error';

const SHOWS: { id: LogShow; label: MessageKey }[] = [
  { id: 'all', label: 'logs.all' },
  { id: 'warn', label: 'logs.warnings' },
  { id: 'error', label: 'logs.errors' },
];

/** What an empty list says, for each choice. */
const NONE: Record<LogShow, MessageKey> = { all: 'logs.empty', warn: 'logs.noWarnings', error: 'logs.noErrors' };

/** How long Copy says Copied. */
const COPIED_MS = 1500;

/** Warnings shows the errors too. */
const showsLine = (show: LogShow, line: LogLine) => show === 'all' || (show === 'warn' ? line.level !== 'info' : line.level === 'error');

/** A day's heading: Today, Yesterday, or the day, with its year when it is not this one. */
function dayLabel(day: string, today: string): string {
  if (day === today) return t('day.today');
  if (day === addDays(today, -1)) return t('day.yesterday');
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, date).toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric', ...(day.slice(0, 4) !== today.slice(0, 4) && { year: 'numeric' }) });
}

/** The lines under the day each was written on, in their order. */
function byDay(shown: readonly LogLine[]): { day: string; lines: LogLine[] }[] {
  const days: { day: string; lines: LogLine[] }[] = [];
  for (const line of shown) {
    const day = dayOf(new Date(line.at));
    const last = days.at(-1);
    if (last?.day === day) last.lines.push(line);
    else days.push({ day, lines: [line] });
  }
  return days;
}

/** The lines shown and what is done with them, for the window's section and a phone's page alike. */
export function useLogView() {
  const lines = useSyncExternalStore(subscribeLog, logLines);
  const [show, setShow] = useState<LogShow>('all');
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const shown = useMemo(() => lines.filter((line) => showsLine(show, line)), [lines, show]);
  const copy = async () => {
    if (!(await writeClipboard(logText(shown)))) return;
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
  };
  const save = () => void saveTextFile(`scrawl-${dayOf(new Date())}.log`, logText(shown), 'text/plain', 'log').catch(() => undefined);
  return { shown, show, setShow, copied, copy, save };
}

export type LogView = ReturnType<typeof useLogView>;

/**
 * Keeps what scrolls the lines at its end while it is there: at the newest when the lines are
 * shown or another choice is made, and as new lines come; scrolled up, it stays where it is.
 */
function useAtEnd(holder: RefObject<HTMLElement | null>, scroller: (holder: HTMLElement) => HTMLElement | null, show: LogShow, count: number) {
  const atEnd = useRef(true);
  const shownAs = useRef(show);
  useLayoutEffect(() => {
    const box = holder.current && scroller(holder.current);
    if (!box) return;
    const onScroll = () => {
      atEnd.current = box.scrollTop + box.clientHeight >= box.scrollHeight - 8;
    };
    box.addEventListener('scroll', onScroll);
    return () => box.removeEventListener('scroll', onScroll);
    // The box is the same for as long as the lines are shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useLayoutEffect(() => {
    const box = holder.current && scroller(holder.current);
    if (!box) return;
    if (shownAs.current !== show) atEnd.current = true;
    shownAs.current = show;
    if (atEnd.current) box.scrollTop = box.scrollHeight;
    // Asked again for each choice and each line that comes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, count]);
}

/** Settings › Logs in the window: the choice, Copy and Save… on top, the lines in a box under them, where they are kept at the foot. */
export function LogsSection() {
  const view = useLogView();
  const { shown, show } = view;
  const box = useRef<HTMLDivElement>(null);
  useAtEnd(box, (holder) => holder, show, shown.length);
  const today = dayOf(new Date());
  return (
    <>
      <div className="lg-head">
        <span className="st-label">{t('settings.logs')}</span>
        <div className="st-modes" role="radiogroup" aria-label={t('logs.show')}>
          {SHOWS.map((choice) => (
            <button
              key={choice.id}
              type="button"
              role="radio"
              aria-checked={choice.id === show}
              className={choice.id === show ? 'on' : undefined}
              onClick={() => view.setShow(choice.id)}
            >
              {t(choice.label)}
            </button>
          ))}
        </div>
        <button type="button" className="st-btn" disabled={shown.length === 0} onClick={() => void view.copy()}>
          {t(view.copied ? 'logs.copied' : 'logs.copy')}
        </button>
        <button type="button" className="st-btn" disabled={shown.length === 0} onClick={view.save}>
          {t('logs.save')}
        </button>
      </div>
      <div ref={box} className="lg-box" tabIndex={0} role="log" aria-label={t('settings.logs')}>
        {shown.length === 0 ? (
          <p className="lg-none">{t(NONE[show])}</p>
        ) : (
          byDay(shown).map((group) => (
            <Fragment key={group.day}>
              <div className="lg-day">{dayLabel(group.day, today)}</div>
              {group.lines.map((line, index) => (
                <div key={`${line.at}-${index}`} className={line.level === 'info' ? 'lg-line' : `lg-line ${line.level}`}>
                  <span className="t">{timeOf(line.at)}</span>
                  <span className={`lv ${line.level}`}>{line.level.toUpperCase()}</span>
                  <span className="src">{line.source}</span>
                  <span className="msg">{line.text}</span>
                </div>
              ))}
            </Fragment>
          ))
        )}
      </div>
      <p className="st-note">{t('logs.note', { count: LOG_KEEP })}</p>
    </>
  );
}

/** Settings › Logs on a phone: the choice on top, then each day under its heading, each line its time, level and source over what it says. Copy is in the page's bar. */
export function PhoneLogs({ view }: { view: LogView }) {
  const { shown, show } = view;
  const holder = useRef<HTMLDivElement>(null);
  useAtEnd(holder, (each) => each.closest<HTMLElement>('.mb-body'), show, shown.length);
  const today = dayOf(new Date());
  return (
    <div ref={holder} className="mb-logs">
      <div className="mb-seg three" role="tablist" aria-label={t('logs.show')}>
        {SHOWS.map((choice) => (
          <button key={choice.id} type="button" role="tab" aria-selected={choice.id === show} onClick={() => view.setShow(choice.id)}>
            {t(choice.label)}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="mb-none">{t(NONE[show])}</p>
      ) : (
        byDay(shown).map((group) => (
          <Fragment key={group.day}>
            <div className="mb-sec">{dayLabel(group.day, today)}</div>
            {group.lines.map((line, index) => (
              <div key={`${line.at}-${index}`} className="mb-log">
                <div className="h">
                  <span>{timeOf(line.at)}</span>
                  <span className={line.level}>{line.level.toUpperCase()}</span>
                  <span>{line.source}</span>
                </div>
                <p>{line.text}</p>
              </div>
            ))}
          </Fragment>
        ))
      )}
      <p className="mb-p">{t('logs.note', { count: LOG_KEEP })}</p>
    </div>
  );
}
