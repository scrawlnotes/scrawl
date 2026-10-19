import { isPhone } from './device';
import { log } from './log';
import { APP_VERSION } from './pwa';
import { isDesktop } from './storage';

// How long the app takes to open, written to the device's log a step a line: the page going to
// Microsoft and back to renew the sign-in, the page's code, the sign-in, the shell drawn, each
// step of reading the spaces, the first tab, and the whole of it with its longest step. Only
// the first opening of a page is measured. See design/opening.md, section 10.

const SOURCE = 'opening';
/** An opening longer than this is a warning, so that Warnings shows the slow ones. */
const SLOW_MS = 5000;

export const seconds = (ms: number) => `${(Math.max(0, ms) / 1000).toFixed(1)} s`;

/** The steps measured so far, for the longest. */
const steps: { name: string; ms: number }[] = [];
/** The page that went to Microsoft: how long it was open before it left. */
let before = 0;
/** How long the page was away at Microsoft. */
let away = 0;
let drawn = false;
let done = false;

/** Before the page goes to Microsoft to renew the sign-in: says so; returns how long it was open, for the page that comes back. */
export function openingLeaves(hoursOld: number): number {
  log('info', SOURCE, `Sign-in is ${hoursOld} h old: renewing with Microsoft`);
  return performance.now();
}

const where = () => (isDesktop ? 'desktop' : isPhone() ? 'web, phone' : 'web');

/**
 * As the page's code runs: how long it was at Microsoft, when it comes back from renewing the
 * sign-in (the page that left said Opening already), and how long the code took to come.
 */
export function openingBegins(back: { leftAt: number; before: number } | null) {
  if (back) {
    before = back.before;
    away = performance.timeOrigin - back.leftAt;
    steps.push({ name: 'Microsoft', ms: away });
    log('info', SOURCE, `Back from Microsoft after ${seconds(away)}`);
  } else {
    log('info', SOURCE, `Opening Scrawl ${APP_VERSION} (${where()})`);
  }
  const page = performance.now();
  steps.push({ name: 'Page', ms: page });
  log('info', SOURCE, `Page loaded in ${seconds(page)}`);
}

/** The sign-in that came back from Microsoft became tokens, or did not. */
export function openingSignedIn(ms: number, failure?: string) {
  steps.push({ name: 'Sign-in', ms });
  if (failure === undefined) log('info', SOURCE, `Signed in to OneDrive in ${seconds(ms)}`);
  else log('warn', SOURCE, `Signing in to OneDrive failed after ${seconds(ms)}: ${failure}`);
}

/** Microsoft answered the renewal, or another sign-in, with an error. */
export function openingRefused(renewing: boolean, reason: string) {
  log('warn', SOURCE, `${renewing ? 'Renewing' : 'Signing in'} with Microsoft failed: ${reason}`);
}

/** The app is drawn, its sidebar and tabs still empty. */
export function openingDrawn() {
  if (drawn || done) return;
  drawn = true;
  log('info', SOURCE, `Shell drawn at ${seconds(performance.now())}`);
}

/** Opening went wrong: the app says why, with a way to try again. */
export function openingFailed(error: string) {
  if (done) return;
  done = true;
  log('error', SOURCE, `Opening failed after ${seconds(before + away + performance.now())}: ${error}`);
}

/** The steps of one start of the session; one that was stopped (`live` false) or came after the first writes nothing. */
export interface OpeningMeasure {
  /** Runs a step and writes its line, `text` saying what it did in the time it took. */
  time<T>(name: string, run: () => Promise<T>, text: (result: T, took: string) => string): Promise<T>;
  /** Writes how long the whole opening took and its longest step. */
  finish(): void;
}

export function openingMeasure(live: () => boolean): OpeningMeasure {
  const writes = () => !done && live();
  return {
    async time(name, run, text) {
      const start = performance.now();
      const result = await run();
      if (!writes()) return result;
      const ms = performance.now() - start;
      steps.push({ name, ms });
      log('info', SOURCE, text(result, seconds(ms)));
      return result;
    },
    finish() {
      if (!writes()) return;
      done = true;
      const total = before + away + performance.now();
      const longest = steps.reduce<{ name: string; ms: number } | null>((most, step) => (!most || step.ms > most.ms ? step : most), null);
      log(total > SLOW_MS ? 'warn' : 'info', SOURCE, `Opened in ${seconds(total)}${longest ? `; longest: ${longest.name} ${seconds(longest.ms)}` : ''}`);
    },
  };
}
