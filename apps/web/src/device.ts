import { languages, setLanguage } from '@scrawlnotes/i18n';
import { paletteOf, type Shade, shadeOf, themeById } from './themes';

// What this device remembers about the app, apart from any space: the mode, the theme, the size
// and the language. Storage can be missing or refuse (a private window); the app then starts with
// what is usual.

/** Light or dark as chosen: the device's own setting, or one of them whatever the device uses. */
export type Mode = 'system' | 'light' | 'dark';

const MODE = 'scrawl.mode';
const THEME = 'scrawl.theme';
const LANGUAGE = 'scrawl.language';
const SIZE = { phone: 'scrawl.sizePhone', computer: 'scrawl.sizeComputer' } as const;

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

/** Where the size comes from: a phone's, or a computer's (a browser, the desktop app, a tablet). */
export type SizeKind = keyof typeof SIZE;

/** The sizes to choose from, in percent of the computer's own. */
export const SIZES = [90, 100, 110, 125, 140, 160] as const;

/** A phone has a layout of its own, drawn for a finger, so it starts at its own size too. */
const DEFAULT_SIZE: Record<SizeKind, number> = { phone: 100, computer: 100 };

/** A touch screen that is narrow either way it is held. */
export const isPhone = () => window.matchMedia('(pointer: coarse)').matches && Math.min(window.screen.width, window.screen.height) < 600;

export const thisSizeKind = (): SizeKind => (isPhone() ? 'phone' : 'computer');

export function loadSize(kind: SizeKind): number {
  const value = Number(read(SIZE[kind]));
  return (SIZES as readonly number[]).includes(value) ? value : DEFAULT_SIZE[kind];
}

export const saveSize = (kind: SizeKind, size: number) => write(SIZE[kind], size === DEFAULT_SIZE[kind] ? null : String(size));

/**
 * Draws the whole app larger or smaller, everything in step. A phone is told it is narrower than
 * it is, so that its browser scales everything up to fill it, the way it does any page; turned
 * sideways it is told again. A computer zooms the page.
 */
export function applySize() {
  const scale = loadSize(thisSizeKind()) / 100;
  const viewport = document.querySelector('meta[name="viewport"]');
  if (isPhone()) {
    document.documentElement.style.zoom = '';
    const sideways = window.matchMedia('(orientation: landscape)').matches;
    const across = sideways ? Math.max(window.screen.width, window.screen.height) : Math.min(window.screen.width, window.screen.height);
    viewport?.setAttribute('content', scale === 1 ? 'width=device-width, initial-scale=1.0, viewport-fit=cover' : `width=${Math.round(across / scale)}, viewport-fit=cover`);
    return;
  }
  viewport?.setAttribute('content', 'width=device-width, initial-scale=1.0, viewport-fit=cover');
  document.documentElement.style.zoom = scale === 1 ? '' : String(scale);
}

/** How much a computer's page is zoomed by its size; a phone's is not, it scales in its own way. */
export const pageZoom = () => Number(document.documentElement.style.zoom) || 1;

/**
 * A zoomed page is drawn larger than its own pixels: what the screen gives (a pointer, a box, the
 * window) is that much larger than what the page sets with CSS. These turn the screen's into the
 * page's, so that what is placed by them lands where it is meant to.
 */
export const onPage = (screen: number) => screen / pageZoom();

/** The box of an element in the page's own pixels. */
export function pageBox(element: Element) {
  const box = element.getBoundingClientRect();
  const zoom = pageZoom();
  return { left: box.left / zoom, top: box.top / zoom, right: box.right / zoom, bottom: box.bottom / zoom, width: box.width / zoom, height: box.height / zoom };
}

/** The window's width and height in the page's own pixels. */
export const pageWindow = () => ({ width: onPage(window.innerWidth), height: onPage(window.innerHeight) });

/** Sizes the app again each time a phone is turned. */
export function onTurn(listener: () => void): () => void {
  const query = window.matchMedia('(orientation: landscape)');
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
