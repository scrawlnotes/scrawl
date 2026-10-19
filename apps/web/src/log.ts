// The device's log: what happened here, a line each, as a log has it: when, how bad, which part
// of the app wrote it, and what. Kept in the browser's storage, the last 1,000 lines, and never
// synced; Settings › Logs shows them, and Copy and Save give them as text. See design/opening.md,
// section 10.

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogLine {
  /** When it was written, as `Date.now()` has it. */
  at: number;
  level: LogLevel;
  /** The part of the app that wrote it: `opening` for now. */
  source: string;
  text: string;
}

const KEY = 'scrawl.log';
/** How many lines are kept: the oldest goes as a new one comes. */
export const LOG_KEEP = 1000;

const LEVELS: LogLevel[] = ['info', 'warn', 'error'];

function read(): LogLine[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(data)) return [];
    return data.filter(
      (line): line is LogLine =>
        !!line && typeof line === 'object' && typeof line.at === 'number' && LEVELS.includes(line.level) && typeof line.source === 'string' && typeof line.text === 'string',
    );
  } catch {
    return [];
  }
}

let lines: LogLine[] | null = null;
const listeners = new Set<() => void>();
const tell = () => {
  for (const listener of listeners) listener();
};

/** The lines kept, the oldest first; the same list until one is written. */
export function logLines(): readonly LogLine[] {
  return (lines ??= read());
}

export function subscribeLog(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Another tab of the app writes to the same lines.
window.addEventListener('storage', (event) => {
  if (event.key !== KEY) return;
  lines = null;
  tell();
});

/** Writes a line. What another tab wrote meanwhile is read first, so that none of it is lost. */
export function log(level: LogLevel, source: string, text: string) {
  lines = [...read(), { at: Date.now(), level, source, text }].slice(-LOG_KEEP);
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    // Not kept: it is shown until the page closes.
  }
  tell();
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** The time of a line on this device's clock: `08:12:12.112`. */
export function timeOf(at: number): string {
  const date = new Date(at);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

/** A line as a log file has it: `2026-10-19 08:12:12.112  WARN   opening  Opened in 38.2 s`. */
export function lineText(line: LogLine): string {
  const date = new Date(line.at);
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${day} ${timeOf(line.at)}  ${line.level.toUpperCase().padEnd(5)}  ${line.source.padEnd(8)} ${line.text}`;
}

/** Lines as a log file has them, one a row. */
export const logText = (shown: readonly LogLine[]) => shown.map(lineText).join('\n') + '\n';
