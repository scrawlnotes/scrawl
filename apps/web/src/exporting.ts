import { basename, momentOf } from '@scrawlnotes/core';
import { attachmentsIn, exportHtml, type OutFile, type OutFiles, pdfContent, sizeText } from '@scrawlnotes/editor';
import { strToU8, zipSync } from 'fflate';
import { fileTitle, kindOf } from './Files';

// A note going out as a file (PLAN 4.7, the Export views of design/mockups.html): a PDF, one HTML
// file with its images and recordings in it, or its Markdown, with its files in a .zip when it
// has any. The file is named after the note.

export type ExportFormat = 'pdf' | 'html' | 'md';

export interface Exported {
  /** The file's name: the note's, with what a file name cannot have taken out. */
  name: string;
  blob: Blob;
  extension: string;
}

/** A file name from a note's name: without the characters a file name cannot have. */
export function fileNameOf(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Note';
}

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

const PNG = /\.png$/i;
const JPEG = /\.jpe?g$/i;

/** An image as a PDF can hold it, a PNG or a JPEG as it is and any other drawn into a PNG, with its size; none for one that cannot be read. */
async function pdfImage(blob: Blob, name: string): Promise<{ data: string; width: number; height: number } | undefined> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const width = image.naturalWidth || 800;
    const height = image.naturalHeight || 600;
    if (PNG.test(name)) return { data: await dataUrl(new Blob([blob], { type: 'image/png' })), width, height };
    if (JPEG.test(name)) return { data: await dataUrl(new Blob([blob], { type: 'image/jpeg' })), width, height };
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')?.drawImage(image, 0, 0, width, height);
    return { data: canvas.toDataURL('image/png'), width, height };
  } catch {
    return undefined;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A note's text and the files it links to, as a file of the format asked for. */
export async function exportNote(source: { text: string; files: Map<string, Blob> }, name: string, format: ExportFormat): Promise<Exported> {
  const base = fileNameOf(name);
  if (format === 'md') {
    if (source.files.size === 0) return { name: `${base}.md`, blob: new Blob([source.text], { type: 'text/markdown' }), extension: 'md' };
    // The files keep the place the note's links give them, beside it.
    const entries: Record<string, Uint8Array> = { [`${base}.md`]: strToU8(source.text) };
    for (const [src, blob] of source.files) entries[src] = new Uint8Array(await blob.arrayBuffer());
    return { name: `${base}.zip`, blob: new Blob([zipSync(entries, { level: 0 })], { type: 'application/zip' }), extension: 'zip' };
  }
  const files: OutFiles = new Map();
  for (const src of attachmentsIn(source.text)) {
    const file = basename(src);
    const moment = momentOf(file);
    const kind = kindOf({ name: file });
    const blob = source.files.get(src);
    let shown: { data: string; width?: number; height?: number } | undefined;
    if (blob && kind === 'image') shown = format === 'pdf' ? await pdfImage(blob, file) : { data: await dataUrl(blob) };
    else if (blob && kind === 'audio' && format === 'html') shown = { data: await dataUrl(blob) };
    const out: OutFile = { kind, title: fileTitle({ name: file, named: moment !== null, added: moment }), size: blob ? sizeText(blob.size) : '', ...shown };
    files.set(src, out);
  }
  if (format === 'html') return { name: `${base}.html`, blob: new Blob([exportHtml(source.text, name, files)], { type: 'text/html' }), extension: 'html' };
  const { makePdf, PDF_FONTS } = await import('./pdf');
  return { name: `${base}.pdf`, blob: await makePdf(pdfContent(source.text, name, files, PDF_FONTS), name), extension: 'pdf' };
}
