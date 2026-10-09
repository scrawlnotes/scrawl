import { languages, setLanguage } from '@scrawlnotes/i18n';
import { paletteOf, type Shade, shadeOf, themeById } from './themes';

// What this device remembers about the app, apart from any space: the mode, the theme and the
// language. Storage can be missing or refuse (a private window); the app then starts with what is
// usual.

/** Light or dark as chosen: the device's own setting, or one of them whatever the device uses. */
export type Mode = 'system' | 'light' | 'dark';

const MODE = 'scrawl.mode';
const THEME = 'scrawl.theme';
const LANGUAGE = 'scrawl.language';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Not kept; the choice holds until the app closes.
  }
}

export function loadMode(): Mode {
  const value = read(MODE);
  return value === 'light' || value === 'dark' ? value : 'system';
}

export const saveMode = (mode: Mode) => write(MODE, mode === 'system' ? null : mode);

/** The theme kept on this device; the first one when none is, or it is no longer there. */
export const loadTheme = () => themeById(read(THEME) ?? '').id;

export const saveTheme = (id: string) => write(THEME, id);

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

/** Whether the device is light or dark right now. */
export const systemShade = (): Shade => (darkQuery().matches ? 'dark' : 'light');

export const shadeOfMode = (mode: Mode, system: Shade): Shade => (mode === 'system' ? system : mode);

/** Calls back each time the device turns light or dark. */
export function onSystemShade(listener: () => void): () => void {
  const query = darkQuery();
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

/** Paints the interface in a theme, in its light or dark side. */
export function applyTheme(id: string, shade: Shade) {
  const theme = themeById(id);
  const root = document.documentElement;
  // Some things are drawn differently on light and on dark, apart from their colours.
  root.dataset.theme = shadeOf(theme, shade);
  const palette = paletteOf(theme, shade);
  for (const [name, colour] of Object.entries(palette)) root.style.setProperty(`--sl-${name}`, colour);
  // On a phone the bar above the app takes the colour of the tab bar under it.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', palette.side);
}

/** The language the interface is shown in, as kept on this device. */
export const languageTag = () => read(LANGUAGE) ?? languages[0]!.tag;

/** Shows the interface in the language kept on this device, before anything is drawn. */
export function applyLanguage() {
  const kept = languages.find((language) => language.tag === languageTag());
  if (kept && kept !== languages[0]) setLanguage(kept.tag, kept.dictionary);
}

/** Keeps another language; every word on screen changes, so the app starts again in it. */
export function chooseLanguage(tag: string) {
  write(LANGUAGE, tag === languages[0]!.tag ? null : tag);
  window.location.reload();
}
