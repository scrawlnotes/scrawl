import { locale, t } from '@scrawlnotes/i18n';
import { useEffect, useState } from 'react';
import { isPhone } from './device';

// What is still read as the app opens says so where it will be (design/opening.md, section 3):
// a turning ring, Loading… in a space or a folder not read yet and in a tab whose file is not,
// and under Today, Upcoming, a filter, Search and the start page the spaces still read. After
// the Açılış views of design/mockups.html.

/** A small ring that turns while something is read. */
export function Spin() {
  return <span className="spin" aria-hidden="true" />;
}

/** Which spaces are still read, by name: `Still opening Acme and Scrawl…`; null once all are. */
export function stillOpening(reading: ReadonlySet<string>, names: ReadonlyMap<string, string>): string | null {
  if (reading.size === 0) return null;
  const spaces = new Intl.ListFormat(locale(), { type: 'conjunction' }).format([...reading].map((key) => names.get(key) ?? key));
  return t('opening.still', { spaces });
}

/** How long, at most, a phone's boot screen waits for the page under it. */
const BOOT_WAIT_MS = 1500;

/**
 * The boot screen of index.html goes softly once the app is drawn under it. On a phone it waits
 * till the spaces are read and the fonts are in, 1.5 s at most, so the page does not come in pieces.
 */
export function BootGoes({ waits, read }: { waits: boolean; read: boolean }) {
  const [fonts, setFonts] = useState(false);
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!waits) return;
    void document.fonts.ready.then(() => setFonts(true));
    const timer = window.setTimeout(() => setLate(true), BOOT_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [waits]);
  const go = !waits || (read && fonts) || late;
  useEffect(() => {
    const boot = document.getElementById('boot');
    if (!go || !boot) return;
    boot.classList.add('gone');
    const timer = window.setTimeout(() => boot.remove(), 300);
    return () => window.clearTimeout(timer);
  }, [go]);
  return null;
}

/** The line under what is shown so far, while some spaces are still read; a phone waits under its boot screen instead. */
export function StillOpening({ text }: { text: string | null }) {
  if (!text || isPhone()) return null;
  return (
    <p className="still" role="status">
      <Spin />
      {text}
    </p>
  );
}

/** Widths of the rows a table or a list will have, drawn faint while it is read. */
const ROWS = [38, 26, 33, 22, 36, 29, 24, 31, 27];

/**
 * A tab whose task list, board, keys file or collection is not read yet: its name, Loading…
 * beside it, and the faint rows of what will be there. On a phone, under the page's own title,
 * a row that says Loading….
 */
export function LoadingView({ name }: { name: string }) {
  if (isPhone()) {
    return (
      <section className="tasks mb-tasks ld-view" aria-busy="true">
        <header className="mb-head">
          <h1>{name}</h1>
        </header>
        <div className="mb-row ld-row-phone">
          <Spin />
          <span>{t('opening.loading')}</span>
        </div>
      </section>
    );
  }
  return (
    <section className="tasks ld-view" aria-busy="true">
      <header className="th">
        <b>{name}</b>
        <span className="ld-wait">
          <Spin />
          {t('opening.loading')}
        </span>
      </header>
      <div className="ld-rows" aria-hidden="true">
        {ROWS.map((width, index) => (
          <div key={index} className="ld-row">
            <i style={{ width: `${width}%` }} />
            <i />
            <i />
            <i />
          </div>
        ))}
      </div>
    </section>
  );
}
