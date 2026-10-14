import type { PdfFonts, PdfNode } from '@scrawlnotes/editor';
import pdfMake from 'pdfmake/build/pdfmake';
import monoLatin from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff?url';
import monoExt from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-ext-400-normal.woff?url';
import sansBoldItalic from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-italic.woff?url';
import sansBold from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff?url';
import sansItalic from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-italic.woff?url';
import sans from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff?url';
import extBoldItalic from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-ext-600-italic.woff?url';
import extBold from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-ext-600-normal.woff?url';
import extItalic from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-ext-400-italic.woff?url';
import ext from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-ext-400-normal.woff?url';

// A note as a PDF, made here: A4 pages on white, set in the app's own type, IBM Plex Sans and
// JetBrains Mono, each in two files, its Latin letters and the rest (see `pdfContent` in the
// editor). This module and the library are loaded only when a PDF is made.

export const PDF_FONTS: PdfFonts = { sans: ['Plex', 'PlexX'], mono: ['Mono', 'MonoX'] };

const FILES: Record<string, string> = {
  'plex.woff': sans,
  'plex-i.woff': sansItalic,
  'plex-b.woff': sansBold,
  'plex-bi.woff': sansBoldItalic,
  'plexx.woff': ext,
  'plexx-i.woff': extItalic,
  'plexx-b.woff': extBold,
  'plexx-bi.woff': extBoldItalic,
  'mono.woff': monoLatin,
  'monox.woff': monoExt,
};

async function base64(url: string): Promise<string> {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

let fonts: Promise<void> | null = null;

/** The type files, read once and given to the library. */
function loadFonts(): Promise<void> {
  fonts ??= (async () => {
    const vfs: Record<string, string> = {};
    await Promise.all(Object.entries(FILES).map(async ([name, url]) => (vfs[name] = await base64(url))));
    pdfMake.addVirtualFileSystem(vfs);
    const mono = (file: string) => ({ normal: file, bold: file, italics: file, bolditalics: file });
    pdfMake.setFonts({
      Plex: { normal: 'plex.woff', bold: 'plex-b.woff', italics: 'plex-i.woff', bolditalics: 'plex-bi.woff' },
      PlexX: { normal: 'plexx.woff', bold: 'plexx-b.woff', italics: 'plexx-i.woff', bolditalics: 'plexx-bi.woff' },
      Mono: mono('mono.woff'),
      MonoX: mono('monox.woff'),
    });
  })().catch((error: unknown) => {
    fonts = null;
    throw error;
  });
  return fonts;
}

/** A PDF of `content`, named `title` in its own information, numbered at the foot of each page. */
export async function makePdf(content: PdfNode[], title: string): Promise<Blob> {
  await loadFonts();
  return pdfMake
    .createPdf({
      info: { title },
      pageSize: 'A4',
      pageMargins: [56, 56, 56, 56],
      defaultStyle: { font: 'Plex', fontSize: 11, lineHeight: 1.3, color: '#1d2026' },
      footer: (page: number, count: number) => ({ text: `${page} / ${count}`, alignment: 'center', fontSize: 8, color: '#a3a7b0', margin: [0, 24, 0, 0] }),
      content,
    })
    .getBlob();
}
