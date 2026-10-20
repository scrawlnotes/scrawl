import {
  type Collection,
  collectionName,
  type ColumnTarget,
  guessTargets,
  isComputed,
  IMPORTED_TYPES,
  type ImportMode,
  type ImportPlan,
  planImport,
  type Record,
} from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type Option, Picker, useEscape } from './choices';
import { Icon } from './Icon';
import { collectionLabel } from './items';

// A CSV or Excel file coming into a collection, after the CSV and Excel import views of
// design/mockups.html: each column of the file goes to a field, found by its name where one
// matches, or to a new field, the notes or nowhere; rows whose name matches a record update it,
// the others are added. An Excel file of more than one sheet shows its sheets as chips.

/** Where a column goes, as its box writes it: a field's key, `add:` and a type, the notes, or nowhere. */
const SKIP = '\u0000skip';
const BODY = '\u0000body';
const valueOfTarget = (target: ColumnTarget) => ('field' in target ? target.field : 'add' in target ? `add:${target.add}` : 'body' in target ? BODY : SKIP);
const targetOfValue = (value: string): ColumnTarget =>
  value === SKIP ? { skip: true } : value === BODY ? { body: true } : value.startsWith('add:') ? { add: value.slice(4) as never } : { field: value };

export function ImportDialog({ collection, fileName, header, rows, sheets, sheet, onPickSheet, targets, onChooseFile, onImport, onClose }: {
  collection: Collection;
  fileName: string;
  header: string[];
  rows: string[][];
  /** An Excel file's sheets, with the rows each has; with more than one they are chips to choose from. */
  sheets?: { name: string; rows: number }[];
  /** The sheet whose rows these are. */
  sheet?: number;
  onPickSheet?: (sheet: number) => void;
  /** The records of every collection, by path: what a link column finds its records in. */
  targets: { [dir: string]: Record[] };
  /** Opens the file picker again, for another file. */
  onChooseFile: () => void;
  /** Writes the plan. Returns a message when it cannot. */
  onImport: (plan: ImportPlan) => Promise<string | null>;
  onClose: () => void;
}) {
  const { schema } = collection;
  // Where the columns go belongs to the rows it was chosen for: another file or sheet starts its
  // columns afresh, in the same drawing that shows it, never with another file's choices.
  const guessed = useMemo(() => guessTargets(header, rows, schema, t('collection.body')), [header, rows, schema]);
  const [chosen, setChosen] = useState<{ rows: string[][]; schema: typeof schema; columns: ColumnTarget[] } | null>(null);
  const columns = chosen?.rows === rows && chosen.schema === schema ? chosen.columns : guessed;
  const setColumns = (next: ColumnTarget[]) => setChosen({ rows, schema, columns: next });
  const [mode, setMode] = useState<ImportMode>('update');
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const backdrop = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus({ preventScroll: true });
  }, []);
  useEscape(backdrop, onClose);

  const plan = useMemo(() => planImport(collection, header, rows, columns, mode, targets), [collection, header, rows, columns, mode, targets]);
  const named = schema.fields.some((f) => f.type === 'name' || f.type === 'code');
  const fieldOptions: Option[] = schema.fields.filter((f) => !isComputed(f.type)).map((f) => ({ value: f.key, label: f.label, chip: false }));
  const options: Option[] = [
    ...fieldOptions,
    ...IMPORTED_TYPES.map((type, i) => ({ value: `add:${type}`, label: t('import.newField', { type: t(`fields.type.${type}`) }), chip: false, apart: i === 0 })),
    { value: BODY, label: t('collection.body'), chip: false, apart: true },
    { value: SKIP, label: t('import.nowhere'), chip: false },
  ];
  const run = async () => {
    if (busy.current || plan.added.length + plan.updated.length === 0) return;
    busy.current = true;
    const failed = await onImport(plan);
    busy.current = false;
    if (failed) setError(failed);
    else onClose();
  };

  return (
    <div ref={backdrop} className="backdrop card-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={panel} className="csvdlg" role="dialog" aria-label={t('import.title')} tabIndex={-1}>
        <div className="cp-head">
          <Icon name="collection" />
          <b>{t('import.title')}</b>
          <span className="where">{t('import.into', { collection: collectionLabel(collection.dir) })}</span>
          <button type="button" className="x push" title={t('dialog.close')} aria-label={t('dialog.close')} onClick={onClose}>
            ×
          </button>
        </div>
        <div className="csv-body">
          <div className="csv-file">
            <Icon name="file" />
            <span className="fname">{fileName}</span>
            <small>{sheets && sheets.length > 1 ? t('import.sheets', { count: sheets.length }) : t('import.size', { count: rows.length, columns: header.length })}</small>
            <button type="button" className="ghost" onClick={onChooseFile}>
              {t('import.another')}
            </button>
          </div>
          {sheets && sheets.length > 1 && (
            <>
              <p className="csv-h">{t('import.sheet')}</p>
              {/* Another sheet starts its columns afresh; an empty one has nothing to bring. */}
              <div className="csv-sheets" role="radiogroup" aria-label={t('import.sheet')}>
                {sheets.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={i === sheet}
                    className={i === sheet ? 'on' : s.rows === 0 ? 'empty' : undefined}
                    disabled={s.rows === 0}
                    onClick={() => i !== sheet && onPickSheet?.(i)}
                  >
                    {s.name}
                    <small>{s.rows === 0 ? t('import.sheetEmpty') : s.rows}</small>
                  </button>
                ))}
              </div>
            </>
          )}
          <p className="csv-h">{t('import.columns')}</p>
          <div className="csv-row head">
            <span>{t('import.inFile')}</span>
            <span>{t('import.firstRow')}</span>
            <span>{t('import.goesTo')}</span>
          </div>
          {header.map((name, i) => {
            const target = columns[i] ?? { skip: true };
            return (
              <div key={i} className={'skip' in target ? 'csv-row skip' : 'add' in target ? 'csv-row added' : 'csv-row'}>
                <span className="cn">{name || t('import.column', { n: i + 1 })}</span>
                <span className="cf">{rows.find((r) => (r[i] ?? '').trim())?.[i] ?? ''}</span>
                <Picker options={options} value={valueOfTarget(target)} label={t('import.goesTo')} onPick={(value) => value && setColumns(columns.map((c, j) => (j === i ? targetOfValue(value) : c)))} />
              </div>
            );
          })}
          {named && (
            <>
              <p className="csv-h">{t('import.existing')}</p>
              <label className="csv-pick">
                <input type="radio" name="import-mode" checked={mode === 'update'} onChange={() => setMode('update')} />
                {t('import.update')}
              </label>
              <label className="csv-pick">
                <input type="radio" name="import-mode" checked={mode === 'add'} onChange={() => setMode('add')} />
                {t('import.addAll')}
              </label>
            </>
          )}
          <p className="fi-note">{t('import.note')}</p>
        </div>
        <div className="rm-foot">
          {error ? <p role="alert">{error}</p> : <span className="hint">{t('import.summary', { added: plan.added.length, updated: plan.updated.length, collection: collectionName(collection.dir) })}</span>}
          <button type="button" onClick={onClose}>
            {t('dialog.cancel')}
          </button>
          <button type="button" className="primary" disabled={plan.added.length + plan.updated.length === 0} onClick={() => void run()}>
            {t('import.run', { count: rows.length })}
          </button>
        </div>
      </section>
    </div>
  );
}
