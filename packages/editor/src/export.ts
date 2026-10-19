import { Marked, type Token, type Tokens } from 'marked';
import { readImageAlt } from './imageWidth';

// A note going out as a file, after the Export views of design/mockups.html (PLAN 4.7): as one
// HTML file with its images and recordings in it, or as the content of a PDF. Both read the note
// as it is written, on white, in the app's type; a tag or a link is text, an image is shown, a
// recording and any other file by its name and size. A note whose first line is its name has
// that line as its title; one that does not start with a heading gets its name over it.

/** An attached file a note links to, made ready to go out with it. */
export interface OutFile {
  kind: 'image' | 'audio' | 'file';
  /** What it is called: its name, or for one named by the moment it came, `Recording · Oct 6, 14:40`. */
  title: string;
  /** How large it is, in words: `2.3 MB`. */
  size: string;
  /** Its content as a data address; for a PDF an image's is a PNG or a JPEG. Unset for one that is not here. */
  data?: string;
  /** An image's size in pixels, where known: a PDF shows it no larger. */
  width?: number;
  height?: number;
}

/** The attached files a note links to, by their address as the note has it, decoded: `_attachments/a b.png`. */
export type OutFiles = Map<string, OutFile>;

const decode = (href: string) => {
  try {
    return decodeURIComponent(href);
  } catch {
    return href;
  }
};
const fileAt = (files: OutFiles, href: string) => files.get(decode(href));

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The note with its title: its first line made a heading when it is its name, else its name put over it. */
export function titled(markdown: string, name: string): string {
  const lines = markdown.split('\n');
  const first = lines.findIndex((line) => line.trim() !== '');
  if (first < 0) return `# ${name}\n`;
  const line = lines[first]!.trim();
  if (/^#{1,6}\s/.test(line)) return markdown;
  if (line.toLowerCase() === name.trim().toLowerCase()) {
    lines[first] = `# ${line}`;
    return lines.join('\n');
  }
  return `# ${name}\n\n${markdown}`;
}

const STYLE = `
body { margin: 0; background: #fff; color: #1d2026; font: 16px/1.6 "IBM Plex Sans", -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width: 720px; margin: 0 auto; padding: 48px 24px 64px; }
h1 { margin: 0 0 18px; font-size: 28px; line-height: 1.25; }
h2 { margin: 30px 0 10px; font-size: 22px; line-height: 1.3; }
h3 { margin: 24px 0 8px; font-size: 18px; }
h4, h5, h6 { margin: 20px 0 6px; font-size: 16px; }
p, ul, ol, blockquote, pre, table { margin: 0 0 14px; }
a { color: #a8690c; }
code { padding: 1px 4px; border-radius: 3px; background: #eef0f3; font: 14px "JetBrains Mono", ui-monospace, Consolas, monospace; }
pre { padding: 12px 14px; border-radius: 6px; background: #f3f4f6; overflow: auto; }
pre code { padding: 0; background: none; }
blockquote { padding-left: 14px; border-left: 3px solid #d9dce3; color: #4b505a; }
li:has(> input[type="checkbox"]) { list-style: none; }
li > input[type="checkbox"] { margin: 0 8px 0 -22px; }
img { display: block; max-width: 100%; height: auto; margin: 6px 0; border-radius: 4px; }
audio { display: block; width: 100%; max-width: 420px; margin: 6px 0; }
table { border-collapse: collapse; }
th, td { padding: 5px 10px; border: 1px solid #d9dce3; text-align: left; }
th { background: #f3f4f6; }
hr { margin: 22px 0; border: 0; border-top: 1px solid #d9dce3; }
.file { display: inline-flex; gap: 8px; padding: 2px 10px; border: 1px solid #d9dce3; border-radius: 5px; color: #4b505a; font-size: 14px; }
.file small { color: #8a8f99; font-size: 14px; }
`;

const fileChip = (file: OutFile) => `<span class="file">${escapeHtml(file.title)}<small>${escapeHtml(file.size)}</small></span>`;

/** The note as one HTML file: its images and recordings in it, any other file by its name and size. */
export function exportHtml(markdown: string, name: string, files: OutFiles): string {
  const out = new Marked({ gfm: true, breaks: true });
  out.use({
    renderer: {
      // Raw HTML in a note is shown as text, never run.
      html: (token) => escapeHtml(token.text),
      image(token) {
        const file = fileAt(files, token.href);
        if (!file) return false;
        if (file.kind === 'image' && file.data) {
          const { label, width } = readImageAlt(token.text);
          return `<img src="${file.data}" alt="${escapeHtml(label)}"${width === null ? '' : ` style="width: ${width}px"`}>`;
        }
        if (file.kind === 'audio' && file.data) return `<audio controls src="${file.data}"></audio>`;
        return fileChip(file);
      },
      link(token) {
        const file = fileAt(files, token.href);
        if (!file) return false;
        if (file.kind === 'image' && file.data) return `<img src="${file.data}" alt="">`;
        if (file.kind === 'audio' && file.data) return `<audio controls src="${file.data}"></audio>`;
        return fileChip(file);
      },
    },
  });
  const body = out.parse(titled(markdown, name), { async: false });
  return `<!doctype html>\n<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(name)}</title><style>${STYLE}</style></head>\n<body><main>\n${body}</main></body></html>\n`;
}

// ---------- PDF ----------

/** A piece of a PDF's content, as the PDF library reads it. */
export type PdfNode = { [key: string]: unknown };

/**
 * The type a PDF is set in comes in two files each, as the app's does: one for the Latin letters,
 * one for the rest of them (ş, ğ, İ). A run of text is cut where it goes from one to the other.
 */
export interface PdfFonts {
  sans: [latin: string, extended: string];
  mono: [latin: string, extended: string];
}

/** Whether the Latin file has the character, by the ranges it is cut to. */
function inLatin(code: number): boolean {
  return (
    code <= 0xff ||
    code === 0x131 ||
    code === 0x152 ||
    code === 0x153 ||
    code === 0x2bb ||
    code === 0x2bc ||
    code === 0x2c6 ||
    code === 0x2da ||
    code === 0x2dc ||
    code === 0x304 ||
    code === 0x308 ||
    code === 0x329 ||
    (code >= 0x2000 && code <= 0x206f) ||
    code === 0x20ac ||
    code === 0x2122 ||
    code === 0x2191 ||
    code === 0x2193 ||
    code === 0x2212 ||
    code === 0x2215 ||
    code === 0xfeff ||
    code === 0xfffd
  );
}

/** A text cut into runs, each set in the file of its family that has its letters. */
export function fontRuns(text: string, family: [string, string]): { text: string; font: string }[] {
  const runs: { text: string; font: string }[] = [];
  for (const ch of text) {
    const font = inLatin(ch.codePointAt(0)!) ? family[0] : family[1];
    const last = runs[runs.length - 1];
    if (last && last.font === font) last.text += ch;
    else runs.push({ text: ch, font });
  }
  return runs;
}

interface Look {
  bold?: boolean;
  italics?: boolean;
  mono?: boolean;
  strike?: boolean;
  link?: string;
  color?: string;
}

/** The width of an A4 page's text, in points, between margins of 56. */
export const PDF_WIDTH = 483;
/** The most an image is high on a page, in points. */
const PDF_IMAGE_HEIGHT = 560;

/**
 * How large an image is on a page: as large as it is (a pixel is ¾ of a point), or as wide as the
 * note has it; no wider than the text and no higher than most of a page.
 */
function imageSize(file: OutFile, shown: number | null = null): PdfNode {
  if (!file.width || !file.height) return shown === null ? { fit: [PDF_WIDTH, PDF_IMAGE_HEIGHT] } : { fit: [Math.min(PDF_WIDTH, shown * 0.75), PDF_IMAGE_HEIGHT] };
  const width = (shown ?? file.width) * 0.75;
  const height = width * (file.height / file.width);
  const scale = Math.min(1, PDF_WIDTH / width, PDF_IMAGE_HEIGHT / height);
  return { width: Math.round(width * scale * 100) / 100 };
}
const SIZES = [0, 20, 16, 13.5, 12, 11.5, 11];
const GREY = '#8a8f99';

/** The note's content in a PDF: headings, paragraphs, lists with their boxes, quotes, code, tables, images. */
export function pdfContent(markdown: string, name: string, files: OutFiles, fonts: PdfFonts): PdfNode[] {
  const lexer = new Marked({ gfm: true, breaks: true });
  const tokens = lexer.lexer(titled(markdown, name));

  const text = (value: string, look: Look): PdfNode[] =>
    fontRuns(value, look.mono ? fonts.mono : fonts.sans).map((run) => ({
      text: run.text,
      font: run.font,
      ...(look.bold && { bold: true }),
      ...(look.italics && { italics: true }),
      ...(look.mono && { fontSize: 9.5, background: '#eef0f3' }),
      ...(look.strike && { decoration: 'lineThrough' }),
      ...(look.link && { link: look.link, color: '#a8690c' }),
      ...(look.color && { color: look.color }),
    }));
  const chip = (file: OutFile, look: Look): PdfNode[] => [
    ...text(` ${file.title} `, { ...look, color: '#4b505a' }),
    ...text(`${file.size} `, { ...look, color: GREY }),
  ];

  /** Inline pieces; an image found among them is handed to `onImage` and leaves a gap in the text. */
  const inline = (list: Token[], look: Look, onImage?: (file: OutFile, width: number | null) => void): PdfNode[] =>
    list.flatMap((token): PdfNode[] => {
      switch (token.type) {
        case 'text':
        case 'escape': {
          const each = token as Tokens.Text;
          return each.tokens?.length ? inline(each.tokens, look, onImage) : text(each.text, look);
        }
        case 'strong':
          return inline((token as Tokens.Strong).tokens, { ...look, bold: true }, onImage);
        case 'em':
          return inline((token as Tokens.Em).tokens, { ...look, italics: true }, onImage);
        case 'del':
          return inline((token as Tokens.Del).tokens, { ...look, strike: true }, onImage);
        case 'codespan':
          return text((token as Tokens.Codespan).text, { ...look, mono: true });
        case 'br':
          return [{ text: '\n' }];
        case 'html':
          return text((token as Tokens.HTML).text, look);
        case 'checkbox':
          return [];
        case 'image':
        case 'link': {
          const each = token as Tokens.Link | Tokens.Image;
          const file = fileAt(files, each.href);
          if (file?.kind === 'image' && file.data && onImage) {
            onImage(file, token.type === 'image' ? readImageAlt((token as Tokens.Image).text).width : null);
            return [];
          }
          if (file) return chip(file, look);
          if (token.type === 'image') return text((token as Tokens.Image).text || each.href, { ...look, color: GREY });
          return inline(each.tokens, { ...look, link: each.href });
        }
        default:
          return 'text' in token && typeof token.text === 'string' ? text(token.text, look) : [];
      }
    });

  /** A paragraph's text, cut where an image of its own stands between its lines. */
  const paragraph = (list: Token[], look: Look, margin: number[]): PdfNode[] => {
    const blocks: PdfNode[] = [];
    let pieces: PdfNode[] = [];
    const flush = () => {
      // A line break left at either end of a piece around an image is not a line of its own.
      while (pieces.length && (pieces[0] as { text?: string }).text === '\n') pieces.shift();
      while (pieces.length && (pieces[pieces.length - 1] as { text?: string }).text === '\n') pieces.pop();
      if (pieces.some((piece) => String((piece as { text?: string }).text ?? '').trim() !== '')) blocks.push({ text: pieces, margin });
      pieces = [];
    };
    const onImage = (file: OutFile, width: number | null) => {
      flush();
      blocks.push({ image: file.data, ...imageSize(file, width), margin: [0, 4, 0, 10] });
    };
    for (const token of list) pieces.push(...inline([token], look, onImage));
    flush();
    return blocks;
  };

  const box = (checked: boolean): PdfNode => ({
    width: 15,
    canvas: [
      { type: 'rect', x: 0, y: 3, w: 9, h: 9, r: 2, lineWidth: 1, lineColor: GREY, ...(checked && { color: GREY }) },
      ...(checked ? [{ type: 'polyline', lineWidth: 1.3, lineColor: '#ffffff', points: [{ x: 2.2, y: 7.6 }, { x: 4, y: 9.4 }, { x: 7, y: 5.6 }] }] : []),
    ],
  });

  const blocks = (list: Token[], look: Look = {}): PdfNode[] =>
    list.flatMap((token): PdfNode[] => {
      switch (token.type) {
        case 'heading': {
          const each = token as Tokens.Heading;
          const size = SIZES[each.depth] ?? 11;
          return [{ text: inline(each.tokens, { ...look, bold: true }), fontSize: size, lineHeight: 1.2, margin: [0, each.depth === 1 ? 0 : 10, 0, each.depth === 1 ? 10 : 5] }];
        }
        case 'paragraph':
        case 'text': {
          const each = token as Tokens.Paragraph;
          return paragraph(each.tokens ?? [{ type: 'text', raw: each.text, text: each.text } as Tokens.Text], look, [0, 0, 0, 7]);
        }
        case 'list': {
          const each = token as Tokens.List;
          const items = each.items.map((item) => {
            const done = item.task && item.checked === true;
            const content = item.tokens.flatMap((part) =>
              part.type === 'list' ? blocks([part], look) : part.type === 'checkbox' ? [] : paragraph((part as Tokens.Text).tokens ?? [part], done ? { ...look, color: GREY } : look, [0, 0, 0, 2]),
            );
            if (!item.task) return { stack: content };
            return { columns: [box(done), { stack: content, width: '*' }], columnGap: 3 };
          });
          const tasks = each.items.some((item) => item.task);
          const margin = [0, 0, 0, 7];
          if (tasks) return [{ ul: items, type: 'none', margin }];
          return [each.ordered ? { ol: items, start: each.start === '' ? 1 : each.start, margin } : { ul: items, margin }];
        }
        case 'code': {
          const each = token as Tokens.Code;
          return [
            {
              table: { widths: ['*'], body: [[{ text: fontRuns(each.text, fonts.mono).map((run) => ({ ...run, fontSize: 9.5 })), preserveLeadingSpaces: true, fillColor: '#f3f4f6' }]] },
              layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 9, paddingRight: () => 9, paddingTop: () => 7, paddingBottom: () => 7 },
              margin: [0, 2, 0, 9],
            },
          ];
        }
        case 'blockquote': {
          const each = token as Tokens.Blockquote;
          return [
            {
              table: { widths: ['*'], body: [[{ stack: blocks(each.tokens, { ...look, color: '#4b505a' }) }]] },
              layout: { hLineWidth: () => 0, vLineWidth: (i: number) => (i === 0 ? 2.5 : 0), vLineColor: () => '#d9dce3', paddingLeft: () => 11, paddingTop: () => 0, paddingBottom: () => 0 },
              margin: [0, 0, 0, 7],
            },
          ];
        }
        case 'table': {
          const each = token as Tokens.Table;
          const cell = (value: Tokens.TableCell, head: boolean) => ({
            text: inline(value.tokens, head ? { ...look, bold: true } : look),
            ...(head && { fillColor: '#f3f4f6' }),
            ...(value.align && { alignment: value.align }),
          });
          return [
            {
              table: { headerRows: 1, body: [each.header.map((value) => cell(value, true)), ...each.rows.map((row) => row.map((value) => cell(value, false)))] },
              layout: { hLineColor: () => '#d9dce3', vLineColor: () => '#d9dce3', hLineWidth: () => 0.6, vLineWidth: () => 0.6, paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 3, paddingBottom: () => 3 },
              margin: [0, 2, 0, 9],
            },
          ];
        }
        case 'hr':
          return [{ canvas: [{ type: 'line', x1: 0, y1: 0, x2: PDF_WIDTH, y2: 0, lineWidth: 0.6, lineColor: '#d9dce3' }], margin: [0, 8, 0, 12] }];
        case 'html':
          return [{ text: text((token as Tokens.HTML).text, look), margin: [0, 0, 0, 7] }];
        default:
          return [];
      }
    });

  return blocks(tokens);
}
