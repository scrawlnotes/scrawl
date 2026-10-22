import { type SheetCell, sheetDate, sheetNumber, sheetRows, sheetSerial } from '@scrawlnotes/core';
import type { CellObject, WorkSheet } from 'xlsx';

// An Excel file (.xlsx, .xls) coming into a collection: its sheets, each as the heading and the
// rows the import window takes, as a CSV file's are. A cell brings its value, not what it shows: a
// formula its result, a number without its format, a day as a day. And a collection going out as
// one. The library that reads and writes the file is loaded only when one is.

export interface Sheet {
  name: string;
  header: string[];
  rows: string[][];
}

/** Whether the file is one that `readSheets` reads, by its name. */
export const isSpreadsheet = (name: string) => /\.xlsx?$/i.test(name);

export async function readSheets(file: File): Promise<Sheet[]> {
  const XLSX = await import('xlsx');
  // The number formats come along: a number is a day or a time only by its format.
  const book = XLSX.read(await file.arrayBuffer(), { type: 'array', cellNF: true, cellHTML: false });
  const date1904 = !!book.Workbook?.WBProps?.date1904;
  const text = (cell: CellObject | undefined): string => {
    if (!cell || cell.v === undefined || cell.v === null) return '';
    switch (cell.t) {
      case 'n':
        return typeof cell.z === 'string' && XLSX.SSF.is_date(cell.z) ? sheetDate(cell.v as number, date1904) : sheetNumber(cell.v as number);
      case 'b':
        return cell.v ? 'yes' : 'no';
      case 'd': {
        const d = cell.v as Date;
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
      // An error (#N/A, #DIV/0!) is no value.
      case 'e':
        return '';
      default:
        return String(cell.v);
    }
  };
  return book.SheetNames.map((name) => {
    const sheet = book.Sheets[name];
    const ref = sheet?.['!ref'];
    if (!sheet || !ref) return { name, header: [], rows: [] };
    const range = XLSX.utils.decode_range(ref);
    const rows: string[][] = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
      const row: string[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) row.push(text(sheet[XLSX.utils.encode_cell({ r, c })] as CellObject | undefined));
      rows.push(row);
    }
    const [header = [], ...rest] = sheetRows(rows);
    return { name, header, rows: rest };
  });
}

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** A sheet's name as Excel allows it: without `\ / ? * [ ] :`, 31 letters at most. */
const sheetName = (name: string) => name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet1';

/** How many letters a cell shows, for its column's width: its longest line. */
function shownLength(value: SheetCell): number {
  if (typeof value === 'object') return 'day' in value ? value.day.length + 2 : 'number' in value ? String(Math.round(value.number)).length + 6 : value.text.length;
  return Math.max(...String(value).split('\n').map((line) => line.length));
}

/**
 * Rows as an Excel file of one sheet named `name`: numbers as numbers, in their format where they
 * have one (`"₺"#,##0.00`), days as days shown as the
 * reader's own Excel shows a short date, flags as TRUE and FALSE, an address that opens; each
 * column as wide as what is in it, within bounds, and a filter on the heading.
 */
export async function writeSheet(name: string, rows: SheetCell[][]): Promise<Blob> {
  const XLSX = await import('xlsx');
  const sheet: WorkSheet = {};
  const widths: number[] = [];
  rows.forEach((row, r) =>
    row.forEach((value, c) => {
      widths[c] = Math.max(widths[c] ?? 0, shownLength(value));
      if (value === '') return;
      const at = XLSX.utils.encode_cell({ r, c });
      if (typeof value === 'number') sheet[at] = { t: 'n', v: value };
      else if (typeof value === 'boolean') sheet[at] = { t: 'b', v: value };
      // `m/d/yy` is Excel's own short date, which each reader sees in the way of their country; with its time, `m/d/yy h:mm`.
      else if (typeof value === 'object' && 'day' in value) sheet[at] = { t: 'n', v: sheetSerial(value.day), z: value.day.length > 10 ? 'm/d/yy h:mm' : 'm/d/yy' };
      // A number keeps its format: money with its symbol, a share as one.
      else if (typeof value === 'object' && 'number' in value) sheet[at] = { t: 'n', v: value.number, z: value.format };
      else if (typeof value === 'object') sheet[at] = { t: 's', v: value.text, l: { Target: value.href } };
      else sheet[at] = { t: 's', v: value };
    }),
  );
  const range = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rows.length - 1, 0), c: Math.max(widths.length - 1, 0) } });
  sheet['!ref'] = range;
  sheet['!autofilter'] = { ref: range };
  sheet['!cols'] = widths.map((w) => ({ wch: Math.min(60, Math.max(8, w + 2)) }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName(name));
  return new Blob([XLSX.write(book, { type: 'array', bookType: 'xlsx', compression: true })], { type: XLSX_TYPE });
}
