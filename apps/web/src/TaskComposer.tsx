import {
  addDays,
  listName,
  type NewTask,
  type Priority,
  type Record as CollectionRecord,
  spaceOf,
  type TaskRecord,
} from '@scrawlnotes/core';
import { locale, t } from '@scrawlnotes/i18n';
import { type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactElement, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { pageBox, pageWindow } from './device';
import { listCrumb, type MenuItem, placesShown, type TaskPlaceChoice } from './dialogs';
import { AttachButton, type DescriptionHost, DescriptionField } from './Description';
import { LabelDot, LabelPop, useAtLabels } from './labels';
import { Icon, type IconName } from './Icon';
import { listLabel, spaceLabel } from './items';
import { MonthGrid, useMonth } from './MonthGrid';
import { priorityItems } from './PhoneTasks';
import { nextWeek, RecordPicker, TitleField, toDate } from './Tasks';

// Adding a task on a computer, after the List, add views of the Upcoming mockups: its name and
// description, then chips for its date, priority and record, and at the foot the list it goes in,
// Cancel and Add task. The date opens the quick days and the month, so that any day can be set; the
// list opens every list and section of every space, found by typing.

/** A day as a date: `Mon, Oct 19`, with its year when it is not this year's. */
export function dateWords(day: string, today: string): string {
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return toDate(day).toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** A day on a chip: Today, Tomorrow, else the date. */
const chipDay = (day: string, today: string) => (day === today ? t('day.today') : day === addDays(today, 1) ? t('day.tomorrow') : dateWords(day, today));

const weekday = (day: string) => toDate(day).toLocaleDateString(locale(), { weekday: 'short' });

/** Where a task goes, as its button says it: its list, and its section after it. */
function placeName(places: TaskPlaceChoice[], list: string, section: string | null): string {
  const name = listLabel(list);
  const sectionName = section ? places.find((p) => p.list === list && p.section === section)?.label : undefined;
  return sectionName ? `${name} · ${sectionName}` : name;
}

/**
 * Where a picker opens: under the button that opened it, or over it where there is more room
 * below than it needs; as high as it needs, at most, and never off the window.
 */
export function usePopPlace(anchor: HTMLElement, width: number, tall: number): CSSProperties | null {
  const [place, setPlace] = useState<CSSProperties | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const button = pageBox(anchor);
      const page = pageWindow();
      const below = page.height - button.bottom - 12;
      const above = button.top - 12;
      const up = below < tall && above > below;
      const left = Math.max(8, Math.min(button.left, page.width - width - 8));
      setPlace({ left, width, maxHeight: Math.min(tall, up ? above : below), ...(up ? { bottom: page.height - button.top + 4 } : { top: button.bottom + 4 }) });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [anchor, width, tall]);
  return place;
}

/** A press anywhere but on the picker or the button that opened it closes the picker. */
export function useAway(pop: RefObject<HTMLElement | null>, anchor: HTMLElement, onClose: () => void) {
  const latest = useRef(onClose);
  latest.current = onClose;
  useEffect(() => {
    const away = (event: globalThis.MouseEvent) => {
      const target = event.target as Node;
      if (!pop.current?.contains(target) && !anchor.contains(target)) latest.current();
    };
    window.addEventListener('mousedown', away);
    return () => window.removeEventListener('mousedown', away);
  }, [pop, anchor]);
}

/**
 * A day, picked under the button that opened it, after the Add, date view of the Upcoming
 * mockups: Today, Tomorrow, Next week and No date, each with its day, then the month to pick any
 * other. What is set is lit; nothing is when `current` is left out, as for moving many at once.
 */
export function DatePop({ anchor, current, today, onPick, onClose }: {
  anchor: HTMLElement;
  current?: string | null;
  today: string;
  onPick: (day: string | null) => void;
  onClose: () => void;
}) {
  const pop = useRef<HTMLDivElement>(null);
  const place = usePopPlace(anchor, 264, 390);
  const [month, setMonth] = useMonth(current ?? today);
  useAway(pop, anchor, onClose);
  // The keyboard comes with it, to the day set or else Today.
  useEffect(() => {
    pop.current?.querySelector<HTMLElement>('.opt.on, .g .on, .opt')?.focus();
  }, []);
  const quick = (icon: IconName, label: string, day: string | null, side: string) => (
    <button type="button" className={day === current ? 'opt on' : 'opt'} aria-pressed={day === current} onClick={() => onPick(day)}>
      <Icon name={icon} />
      <span>{label}</span>
      <small>{side}</small>
    </button>
  );
  const tomorrow = addDays(today, 1);
  const monday = nextWeek(today);
  return createPortal(
    <div
      ref={pop}
      className="pick-pop day-pop"
      role="dialog"
      aria-label={t('tasks.date')}
      style={place ?? { opacity: 0 }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      {quick('sun', t('day.today'), today, weekday(today))}
      {quick('rise', t('day.tomorrow'), tomorrow, weekday(tomorrow))}
      {quick('week', t('tasks.nextWeek'), monday, dateWords(monday, today))}
      {quick('noDate', t('tasks.noDate'), null, '')}
      <div className="mini-cal">
        <MonthGrid month={month} onMonth={setMonth} today={today} current={current ?? null} onPick={onPick} />
      </div>
    </div>,
    document.body,
  );
}

/**
 * The list a task goes in, picked under the button that opened it, after the Add, list view of the
 * Upcoming mockups: every list of every space, each space's under its name, the personal one first
 * with Inbox at its top; a list's sections under it. A list shows the folders it is in, so that two
 * of the same name are told apart. Typing finds a list by its name or its folders, or a section.
 */
export function PlacePop({ anchor, places, current, onPick, onClose }: {
  anchor: HTMLElement;
  places: TaskPlaceChoice[];
  current: { list: string; section: string | null };
  onPick: (place: TaskPlaceChoice) => void;
  onClose: () => void;
}) {
  const pop = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const place = usePopPlace(anchor, 320, 380);
  const [typed, setTyped] = useState('');
  const [at, setAt] = useState<number | null>(null);
  useAway(pop, anchor, onClose);

  const shown = placesShown(places, typed);
  const isCurrent = (p: TaskPlaceChoice) => p.list === current.list && p.section === current.section;
  const selected = Math.min(at ?? Math.max(0, shown.findIndex(isCurrent)), shown.length - 1);
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selected, typed]);

  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') setAt(Math.min(selected + 1, shown.length - 1));
    else if (event.key === 'ArrowUp') setAt(Math.max(selected - 1, 0));
    else if (event.key === 'Enter') {
      if (shown[selected]) onPick(shown[selected]);
    } else if (event.key === 'Escape' || event.key === 'Tab') onClose();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  let group: string | null | undefined;
  const rows = shown.flatMap((p, i) => {
    const out: ReactElement[] = [];
    const space = spaceOf(p.list);
    if (space !== group) {
      group = space;
      out.push(
        <div key={`group:${space ?? ''}`} className="group" role="presentation">
          {spaceLabel(space)}
        </div>,
      );
    }
    const crumb = p.section === null ? listCrumb(p.list) : '';
    out.push(
      <button
        key={`${p.list}\n${p.section ?? ''}`}
        type="button"
        role="option"
        className={p.section === null ? 'folder' : 'sub'}
        aria-selected={i === selected}
        tabIndex={-1}
        onMouseDown={(event) => event.preventDefault()}
        onMouseMove={() => i !== selected && setAt(i)}
        onClick={() => onPick(p)}
      >
        {p.section === null && <Icon name="tasks" />}
        <span className="nm">{p.section === null ? listName(p.list) : p.label}</span>
        {crumb && <small className="crumb">{crumb}</small>}
        {isCurrent(p) && <span className="here">✓</span>}
      </button>,
    );
    return out;
  });

  return createPortal(
    <div ref={pop} className="lbl-picker folder-pop place-pop" style={place ?? { opacity: 0 }}>
      <input
        className="lbl-search"
        autoFocus
        placeholder={t('tasks.findPlace')}
        aria-label={t('tasks.findPlace')}
        value={typed}
        onChange={(event) => {
          setTyped(event.target.value);
          setAt(0);
        }}
        onKeyDown={onKey}
      />
      <div ref={list} className="choices folder-groups" role="listbox" aria-label={t('moveTask.places')}>
        {rows}
        {shown.length === 0 && <p>{t('moveTask.none')}</p>}
      </div>
    </div>,
    document.body,
  );
}

/** Where adding starts: the day set, and the list and section it goes in. */
export interface ComposerStart {
  due: string | null;
  list: string;
  section: string | null;
  /** In a filtered list, what a new task starts with so that it shows there. */
  priority?: Priority;
  labels?: string[];
}

/**
 * A new task, typed where it will show: its name and description, its date, priority, labels and
 * record as chips with Attach after them, the list it goes in, Cancel and Add task. Add task, or Enter
 * in the name or the description, adds it and keeps the row with the same date and list for the next
 * one; Ctrl+Enter is a new line in the description. `@` in the name puts a label on it. A record is one of the list's space, as a
 * task's links do not reach another space.
 */
export function TaskComposer({ start, today, places, recordChoices, recordName, menu, description: host, onAdd, onClose }: {
  start: ComposerStart;
  today: string;
  places: TaskPlaceChoice[];
  recordChoices: () => { dir: string; records: CollectionRecord[] }[];
  recordName: (record: TaskRecord) => string;
  menu: (event: MouseEvent, items: MenuItem[]) => void;
  description: DescriptionHost;
  onAdd: (list: string, task: NewTask) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // The description's editor is made anew once a task is added, and for a list in another
  // space, whose attachments its files go to; what was written comes along.
  const [added, setAdded] = useState(0);
  const [due, setDue] = useState(start.due);
  const [priority, setPriority] = useState<Priority>(start.priority ?? 4);
  const [record, setRecord] = useState<TaskRecord | null>(null);
  const [labels, setLabels] = useState<string[]>(start.labels ?? []);
  const [place, setPlace] = useState({ list: start.list, section: start.section });
  const [open, setOpen] = useState<{ kind: 'date' | 'place' | 'record' | 'labels'; anchor: HTMLElement } | null>(null);
  const titleField = useRef<HTMLTextAreaElement>(null);
  const labelsChip = useRef<HTMLElement | null>(null);
  labelsChip.current = open?.kind === 'labels' ? open.anchor : null;
  const attacher = useRef<((files: File[]) => void) | null>(null);
  const at = useAtLabels({ path: place.list, field: titleField, value: title, onValue: setTitle, picked: labels, onPick: (name) => setLabels((now) => [...now, name]) });

  const toggle = (kind: 'date' | 'place' | 'record' | 'labels', anchor: HTMLElement) => setOpen((was) => (was?.kind === kind ? null : { kind, anchor }));
  // A picker closed, by a pick or not, gives the keyboard back to the name.
  const shut = () => {
    setOpen(null);
    titleField.current?.focus();
  };
  const add = () => {
    if (!title.trim()) return;
    onAdd(place.list, { title, description: description.trim() || undefined, section: place.section, due, priority, record, ...(labels.length > 0 && { labels }) });
    setTitle('');
    setDescription('');
    setLabels(start.labels ?? []);
    setAdded((n) => n + 1);
    titleField.current?.focus();
  };
  const choosePlace = (chosen: TaskPlaceChoice) => {
    setPlace({ list: chosen.list, section: chosen.section });
    if (record && spaceOf(record.collection) !== spaceOf(chosen.list)) setRecord(null);
  };
  // The priorities open under their chip, also when it is pressed from the keyboard.
  const priorityMenu = (event: MouseEvent<HTMLButtonElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const under = { clientX: box.left, clientY: box.bottom + 4, preventDefault: () => event.preventDefault() } as MouseEvent;
    menu(under, priorityItems(priority, setPriority));
  };
  // Pressing a button at the foot leaves the keyboard in the name.
  const keepTyping = (event: MouseEvent) => event.preventDefault();

  return (
    <div
      className="task-composer"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || open) return;
        event.preventDefault();
        onClose();
      }}
    >
      <div className="r1">
        <span className="cb" />
        <TitleField
          ref={titleField}
          className="tt-edit"
          aria-label={t('tasks.name')}
          placeholder={t('tasks.name')}
          autoFocus
          value={title}
          onChange={setTitle}
          onSelect={at.track}
          onKeyDown={(event) => {
            if (at.keyDown(event) || event.key !== 'Enter') return;
            event.preventDefault();
            add();
          }}
        />
      </div>
      {at.list}
      <DescriptionField
        key={`${spaceOf(place.list) ?? ''}:${added}`}
        home={place.list}
        value={description}
        hint={t('tasks.description')}
        host={host}
        onChange={setDescription}
        onEnter={add}
        attacher={attacher}
      />
      <div className="chips">
        <button
          type="button"
          className={['chip', due && 'on', due && due < today && 'late'].filter(Boolean).join(' ')}
          aria-haspopup="dialog"
          aria-expanded={open?.kind === 'date'}
          onClick={(event) => toggle('date', event.currentTarget)}
        >
          <Icon name="calendar" />
          {due ? chipDay(due, today) : t('tasks.date')}
        </button>
        <button type="button" className={priority === 4 ? 'chip' : `chip on p${priority}`} aria-haspopup="menu" onClick={priorityMenu}>
          <Icon name="flag" />
          {priority === 4 ? t('tasks.priority') : t('tasks.priorityShort', { n: priority })}
        </button>
        <button
          type="button"
          className={labels.length > 0 ? 'chip lbc' : 'chip'}
          aria-haspopup="dialog"
          aria-expanded={open?.kind === 'labels'}
          onClick={(event) => toggle('labels', event.currentTarget)}
        >
          <Icon name="tag" />
          {labels.length > 0 ? labels.map((name) => (
              <span key={name} className="dn">
                <LabelDot path={place.list} name={name} />
                {name}
              </span>
            )) : <span>{t('tasks.labels')}</span>}
        </button>
        <button
          type="button"
          className={record ? 'chip on' : 'chip'}
          aria-haspopup="listbox"
          aria-expanded={open?.kind === 'record'}
          onClick={(event) => toggle('record', event.currentTarget)}
        >
          <Icon name="collection" />
          <span>{record ? recordName(record) : t('tasks.record')}</span>
        </button>
        <AttachButton className="chip ic" iconOnly onFiles={(files) => attacher.current?.(files)} />
      </div>
      <div className="foot">
        <button
          type="button"
          className="where"
          aria-haspopup="listbox"
          aria-expanded={open?.kind === 'place'}
          aria-label={`${t('tasks.place')}: ${placeName(places, place.list, place.section)}`}
          onClick={(event) => toggle('place', event.currentTarget)}
        >
          <Icon name="tasks" />
          <span>{placeName(places, place.list, place.section)}</span>
          <span className="chev">
            <Icon name="chevron" />
          </span>
        </button>
        <button type="button" className="ghost" onMouseDown={keepTyping} onClick={onClose}>
          {t('dialog.cancel')}
        </button>
        <button type="button" className="primary" disabled={!title.trim()} onMouseDown={keepTyping} onClick={add}>
          {t('tasks.add')}
        </button>
      </div>
      {open?.kind === 'date' && (
        <DatePop
          anchor={open.anchor}
          current={due}
          today={today}
          onPick={(day) => {
            setDue(day);
            shut();
          }}
          onClose={shut}
        />
      )}
      {open?.kind === 'place' && (
        <PlacePop
          anchor={open.anchor}
          places={places}
          current={place}
          onPick={(chosen) => {
            choosePlace(chosen);
            shut();
          }}
          onClose={shut}
        />
      )}
      {open?.kind === 'labels' && <LabelPop anchor={labelsChip} path={place.list} picked={labels} onChange={setLabels} onClose={shut} />}
      {open?.kind === 'record' && (
        <RecordPicker
          anchor={open.anchor}
          current={record}
          choices={recordChoices().filter((choice) => spaceOf(choice.dir) === spaceOf(place.list))}
          align="left"
          onPick={(chosen) => {
            setRecord(chosen);
            shut();
          }}
          onClose={shut}
        />
      )}
    </div>
  );
}
