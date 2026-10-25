import { type Field, labelColor, type LabelUse, OPTION_COLORS, type OptionColor, optionColor, sameLabel } from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import {
  createContext,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { hueStyle } from './choices';
import { pageBox, pageWindow } from './device';
import { ConfirmDialog, ContextMenu, Dialog, type MenuItem } from './dialogs';
import { Icon } from './Icon';
import { Sheet, SheetClose } from './sheets';

// The labels of tasks and cards (design/labels.md): free words that a space's tasks and cards
// share, each in one of the nine colors of a collection's choices. One picker puts them on: on a
// computer under the button or the field that opened it, on a phone in a sheet. Labels, opened
// from the picker, renames them, colors them and deletes them.

/** What the app does with the labels of a space, each by a path in that space. */
export interface Labels {
  /** The labels of the space a path is in, by name, each with its color and how many tasks and cards have it. */
  of: (path: string) => LabelUse[];
  /** Keeps a label made from the picker or with @ in the space's file. */
  add: (path: string, name: string) => void;
  color: (path: string, name: string, color: OptionColor) => void;
  /** Renames a label everywhere in the space, or takes it off everything with `to` null. */
  relabel: (path: string, from: string, to: string | null) => void;
  /** Opens Labels for the space a path is in. */
  edit: (path: string) => void;
}

const nothing = () => undefined;
export const LabelsContext = createContext<Labels>({ of: () => [], add: nothing, color: nothing, relabel: nothing, edit: nothing });

export const useLabels = () => useContext(LabelsContext);

/** How a label of the space a path is in is colored. */
export function useLabelStyle(path: string): (name: string) => CSSProperties {
  const known = useLabels().of(path);
  return (name) => hueStyle(labelColor(name, known), name);
}

/** A label as a chip in its color; `mb-lbl` on a phone. */
export function LabelChip({ path, name, className = 'lbl' }: { path: string; name: string; className?: string }) {
  const style = useLabelStyle(path);
  return (
    <span className={className} style={style(name)}>
      {name}
    </span>
  );
}

/** A label of the space a path is in as its dot in its color, for a chip that has many. */
export function LabelDot({ path, name }: { path: string; name: string }) {
  const style = useLabelStyle(path);
  return <i className="lbl-dot" style={style(name)} title={name} aria-label={name} />;
}

/** A label's dot in its color, for a row of a list; with none, the color its text gives it, as a collection's choices have. */
const Dot = ({ color, name }: { color?: OptionColor; name: string }) => <i className="lbl-dot" style={hueStyle(color, name)} aria-hidden="true" />;

/**
 * What the picker offers when it is not a space's labels: a collection's or a board's field's
 * choices, in their order, each in the color the field gives it, else the one its text gives it.
 */
export interface LabelChoice {
  name: string;
  color?: OptionColor;
}

/**
 * A multi-select's choices for the picker: its options, then what the other records or cards hold
 * that is none of them, the most used first (a tag written in one is offered in the next).
 */
export function fieldChoices(field: Field, used: string[]): LabelChoice[] {
  const options = field.options ?? [];
  return [...options, ...used.filter((value) => !options.includes(value))].map((name) => ({ name, color: optionColor(field, name) }));
}

/** A label's color among what is offered: a field's choice keeps the one its text gives it when it has none. */
function colorIn(known: (LabelUse | LabelChoice)[], name: string, given: boolean): OptionColor | undefined {
  if (!given) return labelColor(name, known);
  return known.find((each) => each.name === name)?.color;
}

/** How many tasks and cards have a label. */
export function usesText(use: Pick<LabelUse, 'tasks' | 'cards'>): string {
  const parts = [use.tasks > 0 && t('count.tasks', { count: use.tasks }), use.cards > 0 && t('count.cards', { count: use.cards })].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : t('labels.notUsed');
}

/** How many tasks and cards have a label, in a sentence. */
function usesSentence(use: Pick<LabelUse, 'tasks' | 'cards'>): string {
  const tasks = t('count.tasks', { count: use.tasks });
  const cards = t('count.cards', { count: use.cards });
  return use.tasks > 0 && use.cards > 0 ? t('labels.both', { tasks, cards }) : use.tasks > 0 ? tasks : cards;
}

/** A row of the picker: a label, or one to make from what is typed. */
type PickRow = { name: string; color?: OptionColor; create?: true };

/**
 * The rows the picker shows: the picked labels first, then the others, the most used first; a
 * field's choices all in their own order, a week's days Mon to Sun, the picked ticked where they are. The order is the one it opened with, so that nothing moves
 * while it is open; one made is added at the end. What is typed narrows it, and a word no label is
 * yet can be made one.
 */
function usePickRows(known: (LabelUse | LabelChoice)[], picked: string[], query: string, given = false) {
  const [order, setOrder] = useState(() => {
    if (given) return [...known.map((use) => use.name), ...picked.filter((name) => !known.some((use) => sameLabel(use.name, name)))];
    const rest = known.filter((use) => !picked.some((name) => sameLabel(name, use.name)));
    if (!given) rest.sort((a, b) => uses(b) - uses(a) || a.name.localeCompare(b.name));
    return [...picked, ...rest.map((use) => use.name)];
  });
  const typed = query.trim();
  const rows: PickRow[] = order
    .filter((name) => name.toLowerCase().includes(typed.toLowerCase()))
    .map((name) => ({ name, color: colorIn(known, name, given) }));
  if (typed && !order.some((name) => sameLabel(name, typed))) rows.push({ name: typed, color: colorIn(known, typed, given), create: true });
  const made = (name: string) => setOrder((now) => (now.some((each) => sameLabel(each, name)) ? now : [...now, name]));
  return { rows, made };
}

/** How many tasks and cards have a label; a field's choice counts none. */
const uses = (each: LabelUse | LabelChoice) => ('tasks' in each ? each.tasks + each.cards : 0);

/** Picked labels with one put on or taken off; a field's choices kept in the field's order, Mon, Wed, Fri however they were picked. */
const toggled = (picked: string[], name: string, choices?: (LabelUse | LabelChoice)[]) => {
  const next = picked.some((each) => sameLabel(each, name)) ? picked.filter((each) => !sameLabel(each, name)) : [...picked, name];
  if (!choices) return next;
  const at = (label: string) => {
    const i = choices.findIndex((use) => sameLabel(use.name, label));
    return i < 0 ? choices.length : i;
  };
  return [...next].sort((a, b) => at(a) - at(b));
};

/** How close to the window's edges the picker may come. */
const EDGE = 8;

/**
 * The picker on a computer, over everything else, under what opened it or above it when there is
 * more room there: a line to find by, the labels with the picked ones ticked, Create for a word no
 * label is yet, and Edit labels at its foot. A click or Enter puts a label on or takes it off and
 * the picker stays; Esc, Tab or a click elsewhere closes it.
 */
export function LabelPop({ anchor, path, picked, known: given, edit = true, placeholder = t('labels.find'), createText = (name) => t('labels.create', { label: name }), onCreate, onChange, onClose }: {
  anchor: RefObject<HTMLElement | null>;
  /** Where the labelled thing is: its space's labels are the ones picked from. */
  path: string;
  picked: string[];
  /** The labels to pick from, when they are not the space's: a collection's choices. */
  known?: LabelChoice[];
  /** Edit labels at the foot; not where the labels are a collection field's choices. */
  edit?: boolean;
  placeholder?: string;
  createText?: (name: string) => string;
  /** What making a label does besides putting it on; by default the space keeps it. */
  onCreate?: (name: string) => void;
  onChange: (labels: string[]) => void;
  /** Closes the picker; with `true` what opened it gets the focus back. */
  onClose: (refocus: boolean) => void;
}) {
  const labels = useLabels();
  const known = given ?? labels.of(path);
  const [query, setQuery] = useState('');
  const [at, setAt] = useState(-1);
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  /** How tall the picker is with every label in view, measured when it opens. */
  const natural = useRef(0);
  const { rows, made } = usePickRows(known, picked, query, !!given);

  // Under its anchor, or above it when there is more room above; never past the window's edges.
  // Below, it hangs from the anchor and shrinks as the rows are filtered. Above, it keeps the
  // height it opened with, so that the search does not move while something is typed.
  useLayoutEffect(() => {
    if (!natural.current && box.current && list.current) {
      natural.current = box.current.offsetHeight - list.current.clientHeight + list.current.scrollHeight;
    }
    const measure = () => {
      const field = anchor.current && pageBox(anchor.current);
      if (!field) return;
      const page = pageWindow();
      const below = page.height - field.bottom - EDGE - 4;
      const above = field.top - EDGE - 4;
      const width = Math.max(field.width, 236);
      // A small button's picker hangs from its right edge when the window has no room on its left.
      const left = Math.max(EDGE, Math.min(field.left, page.width - width - EDGE));
      setPlace(
        below >= Math.min(natural.current, 220) || below >= above
          ? { left, width, top: field.bottom + 4, maxHeight: below }
          : { left, width, bottom: page.height - field.top + 4, height: Math.min(natural.current, above) },
      );
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [anchor, picked]);

  // A press anywhere else closes it; a press on what opened it is that one's own toggle.
  useEffect(() => {
    const away = (event: globalThis.MouseEvent) => {
      const target = event.target as Node;
      if (!box.current?.contains(target) && !anchor.current?.contains(target)) onClose(false);
    };
    window.addEventListener('mousedown', away);
    return () => window.removeEventListener('mousedown', away);
  }, [anchor, onClose]);

  useEffect(() => {
    search.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    list.current?.querySelector('.at')?.scrollIntoView({ block: 'nearest' });
  }, [at]);

  const choose = (row: PickRow) => {
    if (row.create) {
      (onCreate ?? ((name: string) => labels.add(path, name)))(row.name);
      made(row.name);
      onChange([...picked, row.name]);
    } else {
      onChange(toggled(picked, row.name, given));
    }
    setQuery('');
    setAt(-1);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (rows.length === 0) return;
      const last = rows.length - 1;
      setAt((current) => (event.key === 'ArrowDown' ? (current >= last ? 0 : current + 1) : current <= 0 ? last : current - 1));
    } else if (event.key === 'Enter') {
      const row = rows[at];
      if (row) choose(row);
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      onClose(true);
    } else return;
    event.preventDefault();
    event.stopPropagation();
  };

  return createPortal(
    <div
      ref={box}
      className="lbl-picker"
      role="dialog"
      aria-label={t('card.labels')}
      // Before it is placed it is measured where it is, unseen but able to take the focus.
      style={place ?? { opacity: 0 }}
    >
      <input
        ref={search}
        className="lbl-search"
        role="combobox"
        aria-label={placeholder}
        aria-controls="label-rows"
        aria-expanded
        aria-activedescendant={at >= 0 ? `label-row-${at}` : undefined}
        autoComplete="off"
        placeholder={placeholder}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          // What is typed picks the first row, so Enter takes it.
          setAt(event.target.value.trim() ? 0 : -1);
        }}
        onKeyDown={onKeyDown}
      />
      <div ref={list} className="lbl-rows" id="label-rows" role="listbox" aria-multiselectable>
        {rows.map((row, index) => (
          <button
            key={row.create ? '\u0000create' : row.name}
            id={`label-row-${index}`}
            type="button"
            role="option"
            aria-selected={!row.create && picked.some((name) => sameLabel(name, row.name))}
            tabIndex={-1}
            className={[index === at && 'at', row.create && 'new'].filter(Boolean).join(' ') || undefined}
            onMouseDown={(event) => event.preventDefault()}
            onMouseMove={() => index !== at && setAt(index)}
            onClick={() => choose(row)}
          >
            {row.create ? (
              <>
                <Icon name="plus" />
                <span className="nm">{createText(row.name)}</span>
              </>
            ) : (
              <>
                <Dot color={row.color} name={row.name} />
                <span className="nm">{row.name}</span>
                <span className="tick" aria-hidden="true">
                  {picked.some((name) => sameLabel(name, row.name)) ? '✓' : ''}
                </span>
              </>
            )}
          </button>
        ))}
        {rows.length === 0 && <p className="lbl-none">{t('labels.none')}</p>}
      </div>
      {edit && (
        <button
          type="button"
          className="lbl-edit"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onClose(false);
            labels.edit(path);
          }}
        >
          <Icon name="pen" />
          {t('labels.edit')}
        </button>
      )}
    </div>,
    document.body,
  );
}

/**
 * Labels as a field of a form, the card's or a record's: the chips in a box like the other
 * fields; a click on it, or Enter, opens the picker under it.
 */
export function LabelsField({ id, path, labels, known, edit, placeholder, createText, onCreate, onChange }: {
  id?: string;
  path: string;
  labels: string[];
  known?: LabelChoice[];
  edit?: boolean;
  placeholder?: string;
  createText?: (name: string) => string;
  onCreate?: (name: string) => void;
  onChange: (labels: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const field = useRef<HTMLButtonElement>(null);
  const all = useLabels().of(path);
  const colors = known ?? all;
  return (
    <>
      <button ref={field} id={id} type="button" className="lbl-field" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
        {labels.length > 0 ? (
          labels.map((name) => (
            <span key={name} className="lbl" style={hueStyle(colorIn(colors, name, !!known), name)}>
              {name}
            </span>
          ))
        ) : (
          <span className="lbl-empty">{t('card.addLabel')}</span>
        )}
      </button>
      {open && (
        <LabelPop
          anchor={field}
          path={path}
          picked={labels}
          known={known}
          edit={edit}
          placeholder={placeholder}
          createText={createText}
          onCreate={onCreate}
          onChange={onChange}
          onClose={(refocus) => {
            setOpen(false);
            if (refocus) field.current?.focus();
          }}
        />
      )}
    </>
  );
}

/**
 * The picker on a phone, as a sheet: a line to find by, the labels with the picked ones ticked,
 * Create for a word no label is yet, and Edit labels at its end. A touch puts a label on or takes
 * it off; what is typed is made a label with the keyboard's Done too.
 */
export function LabelSheet({ path, about, title = t('card.labels'), labels, known: given, edit = true, placeholder = t('labels.find'), createText = (name) => t('labels.create', { label: name }), onCreate, onChange, onClose }: {
  path: string;
  /** What is being labelled, said beside the title. */
  about?: string;
  title?: string;
  labels: string[];
  known?: LabelChoice[];
  edit?: boolean;
  placeholder?: string;
  createText?: (name: string) => string;
  onCreate?: (name: string) => void;
  onChange: (labels: string[]) => void;
  onClose: () => void;
}) {
  const all = useLabels();
  const known = given ?? all.of(path);
  const [picked, setPicked] = useState(labels);
  const [query, setQuery] = useState('');
  const { rows, made } = usePickRows(known, labels, query, !!given);
  const change = (next: string[]) => {
    setPicked(next);
    onChange(next);
  };
  const choose = (row: PickRow) => {
    if (row.create) {
      (onCreate ?? ((name: string) => all.add(path, name)))(row.name);
      made(row.name);
      change([...picked, row.name]);
    } else change(toggled(picked, row.name, given));
    setQuery('');
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const first = rows[0];
    if (query.trim() && first) choose(first);
  };
  return (
    <Sheet label={title} className="mb-create lbl-sheet" onClose={onClose}>
      <div className="mb-sh">
        <b>{title}</b>
        {about && <small>{about}</small>}
        <SheetClose onClose={onClose} />
      </div>
      <form className="mb-form" onSubmit={submit}>
        <label className="mb-search">
          <Icon name="search" />
          <input aria-label={placeholder} placeholder={placeholder} enterKeyHint="done" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <div className="mb-group">
          {rows.map((row) => (
            <button key={row.create ? '\u0000create' : row.name} type="button" className={row.create ? 'mb-fr pick new' : 'mb-fr pick'} onClick={() => choose(row)}>
              {row.create ? <Icon name="plus" /> : <Dot color={row.color} name={row.name} />}
              <span className="in">{row.create ? createText(row.name) : row.name}</span>
              {!row.create && <span className="tick">{picked.some((name) => sameLabel(name, row.name)) && <Icon name="check" />}</span>}
            </button>
          ))}
          {rows.length === 0 && <p className="mb-none">{t('labels.none')}</p>}
        </div>
        {edit && (
          <div className="mb-group">
            <button
              type="button"
              className="mb-fr"
              onClick={() => {
                onClose();
                all.edit(path);
              }}
            >
              <Icon name="pen" />
              <span className="fl">{t('labels.editPhone')}</span>
              <Icon name="chevron" />
            </button>
          </div>
        )}
      </form>
    </Sheet>
  );
}

/** A label's new name, asked before it is joined to one the space has. */
type Joining = { from: string; to: string };

/**
 * Labels on a computer: the space's labels by name, each with its color, how many tasks and cards
 * have it, and its menu. A click on the name renames it in place, on the dot picks its color; its
 * menu has Rename, Color and Delete. Add label at the end makes one.
 */
export function LabelsWindow({ path, onClose }: { path: string; onClose: () => void }) {
  const labels = useLabels();
  const uses = labels.of(path);
  const [renaming, setRenaming] = useState<{ name: string; typed: string } | null>(null);
  const [coloring, setColoring] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ name: string; at: { x: number; y: number } } | null>(null);
  const [joining, setJoining] = useState<Joining | null>(null);
  const [deleting, setDeleting] = useState<LabelUse | null>(null);

  const rename = (from: string, typed: string) => {
    setRenaming(null);
    const to = typed.trim();
    if (!to || to === from) return;
    if (!sameLabel(from, to) && uses.some((use) => sameLabel(use.name, to))) setJoining({ from, to: uses.find((use) => sameLabel(use.name, to))!.name });
    else labels.relabel(path, from, to);
  };
  const add = (typed: string) => {
    setAdding(null);
    if (typed.trim()) labels.add(path, typed);
  };
  const items = (use: LabelUse): MenuItem[] => [
    { label: t('labels.rename'), run: () => setRenaming({ name: use.name, typed: use.name }) },
    { label: t('labels.color'), run: () => setColoring(use.name) },
    { label: t('labels.delete'), danger: true, apart: true, run: () => setDeleting(use) },
  ];
  // Esc puts away what is open in the window before it closes the window.
  const escape = () => {
    if (coloring) setColoring(null);
    else if (renaming) setRenaming(null);
    else if (adding !== null) setAdding(null);
    else onClose();
  };

  return (
    <>
      <Dialog label={t('labels.title')} className="labels-dlg" onClose={onClose} onEscape={escape}>
        <h2>{t('labels.title')}</h2>
        <p className="labels-note">{t('labels.note')}</p>
        <div className="labels-list">
          {uses.map((use) => (
            <div key={use.name} className={menu?.name === use.name ? 'labels-row menu' : 'labels-row'}>
              <button
                type="button"
                className={coloring === use.name ? 'labels-dot on' : 'labels-dot'}
                aria-label={t('labels.colorOf', { label: use.name })}
                title={t('labels.color')}
                onClick={() => setColoring(coloring === use.name ? null : use.name)}
              >
                <Dot color={use.color} name={use.name} />
              </button>
              {renaming?.name === use.name ? (
                <NameInput value={renaming.typed} onChange={(typed) => setRenaming({ name: use.name, typed })} onDone={(typed) => rename(use.name, typed)} onCancel={() => setRenaming(null)} />
              ) : (
                <button type="button" className="labels-name" title={t('labels.rename')} onClick={() => setRenaming({ name: use.name, typed: use.name })}>
                  {use.name}
                </button>
              )}
              <small>{usesText(use)}</small>
              <button
                type="button"
                className="labels-more"
                aria-label={t('labels.menu', { label: use.name })}
                title={t('side.more')}
                onClick={(event: MouseEvent) => {
                  const box = event.currentTarget.getBoundingClientRect();
                  setMenu({ name: use.name, at: { x: box.right - 4, y: box.bottom + 2 } });
                }}
              >
                ···
              </button>
              {coloring === use.name && (
                <Palette
                  name={use.name}
                  current={use.color}
                  onPick={(color) => {
                    labels.color(path, use.name, color);
                    setColoring(null);
                  }}
                  onClose={() => setColoring(null)}
                />
              )}
            </div>
          ))}
          {adding !== null ? (
            <div className="labels-row adding">
              <span className="labels-dot">
                <Icon name="plus" />
              </span>
              <NameInput value={adding} placeholder={t('labels.addName')} onChange={setAdding} onDone={add} onCancel={() => setAdding(null)} />
            </div>
          ) : (
            <button type="button" className="labels-add" onClick={() => setAdding('')}>
              <Icon name="plus" />
              {t('labels.add')}
            </button>
          )}
        </div>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            {t('dialog.close')}
          </button>
        </div>
      </Dialog>
      {menu && (
        <ContextMenu
          at={menu.at}
          items={items(uses.find((use) => use.name === menu.name) ?? { name: menu.name, color: 'gray', tasks: 0, cards: 0 })}
          onClose={() => setMenu(null)}
        />
      )}
      {joining && (
        <ConfirmDialog
          title={t('labels.joinTitle', { label: joining.to })}
          message={t('labels.joinMessage', { from: joining.from, label: joining.to })}
          action={t('labels.join')}
          onConfirm={() => {
            labels.relabel(path, joining.from, joining.to);
            setJoining(null);
          }}
          onClose={() => setJoining(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={t('labels.deleteTitle', { label: deleting.name })}
          message={deleting.tasks + deleting.cards > 0 ? t('labels.deleteMessage', { uses: usesSentence(deleting) }) : t('labels.deleteUnused')}
          action={t('labels.delete')}
          danger
          onConfirm={() => {
            labels.relabel(path, deleting.name, null);
            setDeleting(null);
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}

/** A label's name typed in place: Enter or leaving it keeps it, Esc does not. */
function NameInput({ value, placeholder, onChange, onDone, onCancel }: {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onDone: (value: string) => void;
  onCancel: () => void;
}) {
  return (
    <input
      className="labels-input"
      aria-label={placeholder ?? t('labels.rename')}
      placeholder={placeholder}
      autoFocus
      autoComplete="off"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => onDone(value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onDone(value);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }
      }}
    />
  );
}

/** The nine colors under a label's dot; a click picks one. */
function Palette({ name, current, onPick, onClose }: { name: string; current: OptionColor; onPick: (color: OptionColor) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (event: globalThis.MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!box.current?.contains(target) && !target.closest('.labels-dot.on')) onClose();
    };
    window.addEventListener('mousedown', away);
    return () => window.removeEventListener('mousedown', away);
  }, [onClose]);
  return (
    <div ref={box} className="labels-pal" role="listbox" aria-label={t('labels.colorOf', { label: name })}>
      {OPTION_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="option"
          aria-selected={color === current}
          aria-label={color}
          title={color}
          className={color === current ? 'on' : undefined}
          style={hueStyle(color, name)}
          onClick={() => onPick(color)}
        />
      ))}
    </div>
  );
}

/**
 * Labels on a phone, as a page: the space's labels by name, each with its color and how many tasks
 * and cards have it; a touch opens its sheet, where it is renamed, colored or deleted. Add label
 * at the end opens the same sheet for a new one.
 */
export function LabelsPage({ path }: { path: string }) {
  const labels = useLabels();
  const uses = labels.of(path);
  const [open, setOpen] = useState<LabelUse | 'new' | null>(null);
  return (
    <div className="mb-form labels-page">
      {uses.length > 0 && (
        <div className="mb-group">
          {uses.map((use) => (
            <button key={use.name} type="button" className="mb-fr" onClick={() => setOpen(use)}>
              <Dot color={use.color} name={use.name} />
              <span className="fl">{use.name}</span>
              <span className="val">{usesText(use)}</span>
              <Icon name="chevron" />
            </button>
          ))}
        </div>
      )}
      <div className="mb-group">
        <button type="button" className="mb-fr add" onClick={() => setOpen('new')}>
          <Icon name="plus" />
          <span className="fl">{t('labels.add')}</span>
        </button>
      </div>
      {open && <LabelEditSheet path={path} use={open === 'new' ? null : open} uses={uses} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** One label on a phone: its name, its color and Delete; Save keeps them. A new one has no Delete. */
function LabelEditSheet({ path, use, uses, onClose }: { path: string; use: LabelUse | null; uses: LabelUse[]; onClose: () => void }) {
  const labels = useLabels();
  const [name, setName] = useState(use?.name ?? '');
  const [color, setColor] = useState<OptionColor | null>(use?.color ?? null);
  const [asking, setAsking] = useState<'join' | 'delete' | null>(null);
  const typed = name.trim();
  const shown: OptionColor = color ?? labelColor(typed, uses);
  const other = typed && uses.find((each) => (!use || !sameLabel(each.name, use.name)) && sameLabel(each.name, typed));
  const save = () => {
    if (!typed) return;
    if (!use) {
      if (!other) {
        labels.add(path, typed);
        if (color) labels.color(path, typed, color);
      }
      return onClose();
    }
    if (other) return setAsking('join');
    if (typed !== use.name) labels.relabel(path, use.name, typed);
    if (color && color !== use.color) labels.color(path, typed, color);
    onClose();
  };
  if (asking === 'join' && use && other) {
    return (
      <ConfirmDialog
        title={t('labels.joinTitle', { label: other.name })}
        message={t('labels.joinMessage', { from: use.name, label: other.name })}
        action={t('labels.join')}
        onConfirm={() => {
          labels.relabel(path, use.name, other.name);
          onClose();
        }}
        onClose={() => setAsking(null)}
      />
    );
  }
  if (asking === 'delete' && use) {
    return (
      <ConfirmDialog
        title={t('labels.deleteTitle', { label: use.name })}
        message={use.tasks + use.cards > 0 ? t('labels.deleteMessage', { uses: usesSentence(use) }) : t('labels.deleteUnused')}
        action={t('labels.delete')}
        danger
        onConfirm={() => {
          labels.relabel(path, use.name, null);
          onClose();
        }}
        onClose={() => setAsking(null)}
      />
    );
  }
  return (
    <Sheet label={t('labels.label')} className="mb-create labels-sheet" onClose={onClose}>
      <div className="mb-sh three">
        <button type="button" className="cancel" onClick={onClose}>
          {t('dialog.cancel')}
        </button>
        <b>{use ? t('labels.label') : t('labels.add')}</b>
        <button type="button" className="ok" disabled={!typed} onClick={save}>
          {t('settings.save')}
        </button>
      </div>
      <form
        className="mb-form"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <div className="mb-group">
          <input className="labels-mname" aria-label={t('labels.name')} placeholder={t('labels.addName')} autoComplete="off" enterKeyHint="done" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="mb-cap">{t('labels.color')}</div>
        <div className="mb-group">
          <div className="labels-mpal" role="listbox" aria-label={t('labels.color')}>
            {OPTION_COLORS.map((each) => (
              <button
                key={each}
                type="button"
                role="option"
                aria-selected={each === shown}
                aria-label={each}
                title={each}
                className={each === shown ? 'on' : undefined}
                style={hueStyle(each, typed)}
                onClick={() => setColor(each)}
              />
            ))}
          </div>
        </div>
        {use && (
          <>
            <p className="labels-uses">{use.tasks + use.cards > 0 ? t('labels.on', { uses: usesSentence(use) }) : t('labels.deleteUnused')}</p>
            <div className="mb-group">
              <button type="button" className="mb-fr labels-del" onClick={() => setAsking('delete')}>
                {t('labels.deleteLabel')}
              </button>
            </div>
          </>
        )}
      </form>
    </Sheet>
  );
}

/** The `@word` before the caret in a name being typed, where a label is being asked for: where its `@` is, and the word. */
export function atWord(text: string, caret: number): { start: number; query: string } | null {
  const found = /(^|\s)@([^\s@]*)$/.exec(text.slice(0, caret));
  return found ? { start: caret - found[2]!.length - 1, query: found[2]! } : null;
}

/** A name with the `@word` at `start` taken out, and the caret where it was. */
function withoutWord(text: string, start: number, end: number): { text: string; caret: number } {
  const before = text.slice(0, start);
  const after = text.slice(end);
  // One space stays between the words on either side; none at the start or the end.
  const joined = before.endsWith(' ') && after.startsWith(' ') ? before + after.slice(1) : before + after;
  return { text: start === 0 ? joined.replace(/^ /, '') : joined, caret: Math.min(start, joined.length) };
}

/** How many labels the list under a name shows at most. */
const AT_ROWS = 8;

/**
 * `@` in a task's name, as in Todoist: typing `@` at the start of a word opens the space's labels
 * under the name, narrowed by what follows it, with Create for a word no label is yet. Enter, Tab
 * or a click puts the label on and takes `@word` out of the name; Esc closes the list and leaves
 * the word as it is typed, as a space after it does. While the list is open Enter is the list's.
 * Give the field `onSelect={at.track}`, call `at.keyDown` first in its own keys, and show `at.list`.
 */
export function useAtLabels({ path, field, value, onValue, picked, onPick, inline = false }: {
  /** Where the task is or goes: its space's labels are offered. */
  path: string;
  field: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onValue: (value: string) => void;
  /** The labels the task has already: they are not offered again. */
  picked: string[];
  onPick: (name: string) => void;
  /** On a phone the list is under the name, in the sheet, not over everything. */
  inline?: boolean;
}) {
  const labels = useLabels();
  const known = labels.of(path);
  const [caret, setCaret] = useState<number | null>(null);
  const [closedAt, setClosedAt] = useState<number | null>(null);
  const [at, setAt] = useState(0);
  // Where the caret is: the field's own while it has the keyboard, as it is drawn again after each change.
  const element = field.current;
  const live = element && document.activeElement === element ? element.selectionStart : caret;
  const word = live === null ? null : atWord(value, Math.min(live, value.length));
  const query = word?.query.toLowerCase() ?? '';
  const left = known.filter((use) => !picked.some((name) => sameLabel(name, use.name)) && use.name.toLowerCase().includes(query));
  // The ones that start with what is typed first, then the most used.
  left.sort((a, b) => Number(b.name.toLowerCase().startsWith(query)) - Number(a.name.toLowerCase().startsWith(query)) || b.tasks + b.cards - (a.tasks + a.cards) || a.name.localeCompare(b.name));
  const rows: PickRow[] = left.slice(0, AT_ROWS).map((use) => ({ name: use.name, color: use.color }));
  if (word?.query && !known.some((use) => sameLabel(use.name, word.query)) && !picked.some((name) => sameLabel(name, word.query))) {
    rows.push({ name: word.query, color: labelColor(word.query, known), create: true });
  }
  const open = word !== null && closedAt !== word.start && rows.length > 0;
  const shown = Math.min(at, rows.length - 1);

  const pick = (row: PickRow) => {
    if (!word || live === null) return;
    if (row.create) labels.add(path, row.name);
    const next = withoutWord(value, word.start, Math.min(live, value.length));
    onValue(next.text);
    onPick(row.name);
    setAt(0);
    setCaret(next.caret);
    requestAnimationFrame(() => {
      field.current?.focus();
      field.current?.setSelectionRange(next.caret, next.caret);
    });
  };
  /** The field's keys, while the list is open; true when one was the list's. */
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!open || event.nativeEvent.isComposing) return false;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const last = rows.length - 1;
      setAt(event.key === 'ArrowDown' ? (shown >= last ? 0 : shown + 1) : shown <= 0 ? last : shown - 1);
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      pick(rows[shown]!);
    } else if (event.key === 'Escape') {
      setClosedAt(word!.start);
    } else return false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  };
  const track = (event: { currentTarget: HTMLTextAreaElement }) => {
    setCaret(event.currentTarget.selectionStart);
    setAt(0);
  };
  const list = open ? (
    inline ? (
      <div className="lbl-at inline" role="listbox" aria-label={t('card.labels')}>
        {rows.map((row, index) => (
          <AtRow key={row.create ? '\u0000create' : row.name} row={row} on={index === shown} onPick={() => pick(row)} />
        ))}
      </div>
    ) : (
      <AtPop field={field}>
        {rows.map((row, index) => (
          <AtRow key={row.create ? '\u0000create' : row.name} row={row} on={index === shown} onHover={() => setAt(index)} onPick={() => pick(row)} />
        ))}
      </AtPop>
    )
  ) : null;
  return { keyDown, track, list, open };
}

function AtRow({ row, on, onHover, onPick }: { row: PickRow; on: boolean; onHover?: () => void; onPick: () => void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={on}
      tabIndex={-1}
      className={[on && 'at', row.create && 'new'].filter(Boolean).join(' ') || undefined}
      // The name keeps the keyboard.
      onMouseDown={(event) => event.preventDefault()}
      onMouseMove={onHover}
      onClick={onPick}
    >
      {row.create ? <Icon name="plus" /> : <Dot color={row.color} name={row.name} />}
      <span className="nm">{row.create ? t('labels.create', { label: row.name }) : row.name}</span>
    </button>
  );
}

/** The `@` list on a computer: under the name being typed, over everything else. */
function AtPop({ field, children }: { field: RefObject<HTMLTextAreaElement | null>; children: ReactNode }) {
  const [place, setPlace] = useState<CSSProperties | null>(null);
  useLayoutEffect(() => {
    const box = field.current && pageBox(field.current);
    if (!box) return;
    const page = pageWindow();
    const width = 220;
    setPlace({ top: box.bottom + 4, left: Math.max(EDGE, Math.min(box.left, page.width - width - EDGE)), width });
  }, [field]);
  return createPortal(
    <div className="lbl-picker lbl-at" role="listbox" aria-label={t('card.labels')} style={place ?? { opacity: 0 }}>
      <div className="lbl-rows">{children}</div>
    </div>,
    document.body,
  );
}
