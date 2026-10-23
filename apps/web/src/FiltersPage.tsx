import { labelColor, type LabelUse, type TaskFilter } from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import { type FormEvent, type MouseEvent, type ReactNode, useState } from 'react';
import { hueStyle } from './choices';
import { isPhone } from './device';
import { Dialog } from './dialogs';
import { Icon } from './Icon';
import { useHold } from './Phone';
import { TaskPage } from './Tasks';

// Filters & Labels (design/filters.md 4), as Todoist's: the saved filters, the ready ones among
// them, then the labels of each space under its name. A row opens its filter or its label's view;
// a filter's ··· and its right click have Rename and Delete. + adds a filter; Edit labels opens a
// space's Labels.

/** The labels of one space, as the page lists them under its name. */
export interface LabelGroup {
  /** The space's id; null for the personal one. */
  space: string | null;
  name: string;
  /** A path in the space, which its Labels opens for. */
  path: string;
  labels: LabelUse[];
}

export function FiltersAndLabels({ filters, counts, groups, labelCount, onOpenFilter, onOpenLabel, onAdd, onFilterMenu, onFilterHold, onEditLabels }: {
  filters: TaskFilter[];
  /** How many open tasks and cards each filter shows, by the filter's id. */
  counts: Record<string, number>;
  groups: LabelGroup[];
  /** How many open tasks and cards a label's view shows. */
  labelCount: (group: LabelGroup, label: string) => number;
  onOpenFilter: (filter: TaskFilter) => void;
  onOpenLabel: (group: LabelGroup, label: string) => void;
  onAdd: () => void;
  onFilterMenu: (event: MouseEvent, filter: TaskFilter) => void;
  /** On a phone: a filter's row held, for its menu. */
  onFilterHold: (filter: TaskFilter) => void;
  onEditLabels: (group: LabelGroup) => void;
}) {
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set());
  const fold = (key: string) => setFolded((was) => (was.has(key) ? new Set([...was].filter((each) => each !== key)) : new Set([...was, key])));
  // On a phone, after the Filters & Labels phone of design/mockups.html: Browse's sections and rows,
  // + in the bar above (Phone.tsx), a filter's menu by holding its row.
  if (isPhone()) {
    return (
      <TaskPage title={t('filters.title')}>
        <div className="mb-sec">
          <span>{t('filters.filters')}</span>
        </div>
        <div className="mb-list">
          {filters.map((filter) => (
            <PhoneRow key={filter.id} lead={<Icon name="filter" />} name={filter.name} count={counts[filter.id] ?? 0} onClick={() => onOpenFilter(filter)} onHold={() => onFilterHold(filter)} />
          ))}
        </div>
        {groups.map((group) => (
          <div key={group.space ?? ''}>
            <div className="mb-sec fl-msec">
              <span>{t('filters.labels')}</span>
              <small>{group.name}</small>
              <button type="button" className="fl-act" onClick={() => onEditLabels(group)}>
                {t('filters.editLabels')}
              </button>
            </div>
            <div className="mb-list">
              {group.labels.map((use) => (
                <PhoneRow
                  key={use.name}
                  lead={<i className="lbl-dot" style={hueStyle(labelColor(use.name, group.labels), use.name)} aria-hidden="true" />}
                  name={use.name}
                  count={labelCount(group, use.name)}
                  onClick={() => onOpenLabel(group, use.name)}
                />
              ))}
            </div>
            {group.labels.length === 0 && <p className="mb-none">{t('filters.noLabels')}</p>}
          </div>
        ))}
      </TaskPage>
    );
  }
  const head = (key: string, name: string, sub: string | null, action: ReactNode) => (
    <div className={folded.has(key) ? 'sec fold fl-head closed' : 'sec fold fl-head'}>
      <button type="button" className="chev" aria-expanded={!folded.has(key)} aria-label={t(folded.has(key) ? 'sections.unfold' : 'sections.fold', { name })} onClick={() => fold(key)}>
        {folded.has(key) ? '▸' : '▾'}
      </button>
      <button type="button" className="fl-name" onClick={() => fold(key)}>
        {name}
        {sub && <small>{sub}</small>}
      </button>
      {action}
    </div>
  );
  const row = (key: string, lead: ReactNode, name: string, count: number, open: () => void, menu?: (event: MouseEvent) => void) => (
    <div key={key} className="fl-row" onContextMenu={menu}>
      <button type="button" className="fl-main" onClick={open}>
        {lead}
        <span className="nm">{name}</span>
        <small>{count || ''}</small>
      </button>
      {menu && (
        <button type="button" className="more" title={t('filters.menu')} aria-label={t('filters.menu')} onClick={menu}>
          ···
        </button>
      )}
    </div>
  );
  return (
    <TaskPage title={t('filters.title')}>
      <div className="fl-page">
        {head(
          'filters',
          t('filters.filters'),
          null,
          <button type="button" className="fl-act" title={t('filters.add')} aria-label={t('filters.add')} onClick={onAdd}>
            <Icon name="plus" />
          </button>,
        )}
        {!folded.has('filters') &&
          filters.map((filter) =>
            row(
              filter.id,
              <Icon name="filter" />,
              filter.name,
              counts[filter.id] ?? 0,
              () => onOpenFilter(filter),
              (event) => onFilterMenu(event, filter),
            ),
          )}
        {groups.map((group) => {
          const key = `labels:${group.space ?? ''}`;
          return (
            <div key={key}>
              {head(
                key,
                t('filters.labels'),
                group.name,
                <button type="button" className="fl-act text" onClick={() => onEditLabels(group)}>
                  {t('filters.editLabels')}
                </button>,
              )}
              {!folded.has(key) &&
                group.labels.map((use) =>
                  row(use.name, <i className="lbl-dot" style={hueStyle(labelColor(use.name, group.labels), use.name)} aria-hidden="true" />, use.name, labelCount(group, use.name), () => onOpenLabel(group, use.name)),
                )}
              {!folded.has(key) && group.labels.length === 0 && <p className="task-empty">{t('filters.noLabels')}</p>}
            </div>
          );
        })}
      </div>
    </TaskPage>
  );
}

/** A phone's row: what it is, its name, how many it shows, and a chevron. */
function PhoneRow({ lead, name, count, onClick, onHold }: { lead: ReactNode; name: string; count: number; onClick: () => void; onHold?: () => void }) {
  const hold = useHold(onHold && (() => onHold()));
  return (
    <button type="button" className="mb-row" onClick={onClick} {...hold}>
      {lead}
      <span className="tx">
        <b>{name}</b>
      </span>
      {count > 0 && <span className="ct">{count}</span>}
      <Icon name="chevron" />
    </button>
  );
}

/** Save as filter: its name, made of what it picks until another is typed. */
export function SaveFilterDialog({ name, onSave, onClose }: { name: string; onSave: (name: string) => void; onClose: () => void }) {
  const [value, setValue] = useState(name);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave(value.trim() || name);
  };
  return (
    <Dialog label={t('filters.saveAs')} className="new-item" onClose={onClose}>
      <h2>{t('filters.saveAs')}</h2>
      <form onSubmit={submit}>
        <div className="dialog-body">
          <label className="field">
            <span>{t('create.name')}</span>
            <input autoFocus value={value} onFocus={(event) => event.target.select()} onChange={(event) => setValue(event.target.value)} />
          </label>
        </div>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            {t('dialog.cancel')}
          </button>
          <button type="submit" className="primary">
            {t('filters.save')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
