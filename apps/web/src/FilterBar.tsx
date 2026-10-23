import {
  assigneesOf,
  type Condition,
  type ConditionOp,
  DUE_RULES,
  type DueRule,
  type Field,
  GIVEN,
  isAgent,
  isComplete,
  labelColor,
  type LabelUse,
  NO_CHOICES,
  opsFor,
  opTakesValue,
  type Person,
  type PlaceChoices,
  type Priority,
  sameLabel,
  TODAY,
} from '@scrawlnotes/core';
import { locale, type MessageKey, t } from '@scrawlnotes/i18n';
import { Fragment, type KeyboardEvent, type MouseEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { hueStyle } from './choices';
import { Icon, type IconName } from './Icon';
import { useLabels } from './labels';
import { type SpacePeople, Who } from './People';
import { Sheet, SheetClose } from './sheets';
import { useAway, usePopPlace } from './TaskComposer';

// Filtering a task list where it is, and a board (design/filters.md 2): Search and Filter in its
// header. Filter's menu has what can be asked, on a board its own fields too; each opens its values
// a step in, where a click puts one on or takes it off and what is behind follows at once. What is
// picked shows as chips under the header: a chip opens its values again, × takes it off. Nothing is
// written to a file; the device keeps it.

/** What every list and board can be asked; a filter over all of them asks where too. */
type Question = 'in' | 'labels' | 'priority' | 'due' | 'assignee';

/** One question of Filter, or one of a board's fields: a row of its menu, and a chip once something is asked in it. */
export type FilterStep = Question | `field:${string}`;

/** What is picked: a list's or a board's choices, and a filter's, which looks in some folders. */
export type Choices = PlaceChoices & { folders?: string[] };

/** A place a filter can look in: a space as a whole or a folder of one, with everything inside. */
export interface FolderChoice {
  value: string;
  text: string;
  /** A space as a whole, not one of its folders. */
  space?: boolean;
}

/** Where the filtering is: a path in the space whose labels are offered, and that space's people, none in the personal space. */
export interface FilterPlace {
  path: string;
  team: SpacePeople | null;
  /** A board's own fields, asked under a line; none for a list. */
  fields?: Field[];
  /** What the board's cards hold in a field, offered among its values. */
  used?: (key: string) => string[];
  /** For a filter over everything: where it can look. */
  folders?: FolderChoice[];
  /** The labels offered, when they are every space's and not the path's space's. */
  labels?: LabelUse[];
  /** Questions not asked: a label's view does not ask for its label nor where. */
  skip?: Question[];
}

const STEP_NAME: Record<Question, MessageKey> = { in: 'filter.in', labels: 'card.labels', priority: 'filter.priority', due: 'filter.due', assignee: 'filter.assignee' };
const STEP_ICON: Record<Question, IconName> = { in: 'folder', labels: 'tag', priority: 'flag', due: 'calendar', assignee: 'person' };

/** The questions in the menu's order; In only for a filter over everything, Given to only where there are people to give work to. */
const questionsOf = (place: FilterPlace): Question[] =>
  ([...(place.folders ? (['in'] as const) : []), 'labels', 'priority', 'due', ...(place.team ? (['assignee'] as const) : [])] as Question[]).filter(
    (question) => !place.skip?.includes(question),
  );

/** A board's fields as steps of the menu; a formula still without its formula asks nothing. */
const fieldStepsOf = (place: FilterPlace): FilterStep[] => (place.fields ?? []).filter((f) => f.type !== 'formula' || f.formula).map((f) => `field:${f.key}` as const);

const isQuestion = (step: FilterStep): step is Question => !step.startsWith('field:');

/** The field a step asks about. */
const fieldOf = (step: FilterStep, place: FilterPlace) => (isQuestion(step) ? undefined : place.fields?.find((f) => f.key === step.slice(6)));

const stepName = (step: FilterStep, place: FilterPlace) => (isQuestion(step) ? t(STEP_NAME[step]) : (fieldOf(step, place)?.label ?? ''));

/** The condition the choices hold on a field; one at most for each. */
const conditionOf = (choices: Choices, key: string) => choices.fields?.find((c) => c.field === key);

/** The choices with a field's condition set anew, or taken off with null. */
function withCondition(choices: Choices, key: string, condition: Condition | null): Choices {
  const { fields: _fields, ...rest } = choices;
  const others = (choices.fields ?? []).filter((c) => c.field !== key);
  const fields = condition ? [...others, condition] : others;
  return { ...rest, ...(fields.length > 0 && { fields }) };
}

/** What is picked in one question, as the values the choices hold. */
function pickedIn(step: Question, choices: Choices): string[] {
  switch (step) {
    case 'in':
      return choices.folders ?? [];
    case 'labels':
      return choices.labels ?? [];
    case 'priority':
      return choices.priorities.map(String);
    case 'due':
      return choices.due === 'any' ? [] : [choices.due];
    case 'assignee':
      return assigneesOf(choices);
  }
}

/** The choices with one question's picks set anew; an older filter's `mine` becomes who it is given to, and what is left empty goes. */
function withPicked(choices: Choices, step: Question, picked: string[]): Choices {
  const { labels: _labels, assignees: _assignees, mine: _mine, ...rest } = choices;
  const labels = step === 'labels' ? picked : (choices.labels ?? []);
  const assignees = step === 'assignee' ? picked : assigneesOf(choices);
  return {
    ...rest,
    ...(step === 'priority' && { priorities: picked.map(Number) as Priority[] }),
    ...(step === 'due' && { due: (picked[0] as DueRule | undefined) ?? 'any' }),
    ...(step === 'in' && { folders: picked }),
    ...(labels.length > 0 && { labels }),
    ...(assignees.length > 0 && { assignees }),
  };
}

/** The choices with nothing asked in a step. */
const withNothing = (choices: Choices, step: FilterStep) => (isQuestion(step) ? withPicked(choices, step, []) : withCondition(choices, step.slice(6), null));

/** Whether something is asked in a step: a value picked, or a field's condition that says enough. */
function asks(step: FilterStep, choices: Choices): boolean {
  if (isQuestion(step)) return pickedIn(step, choices).length > 0;
  const condition = conditionOf(choices, step.slice(6));
  return !!condition && isComplete(condition);
}

/** The steps something is asked in: the chips under the header. */
export const askedSteps = (place: FilterPlace, choices: Choices) => [...questionsOf(place), ...fieldStepsOf(place)].filter((step) => asks(step, choices));

/** Whether a picked value is the one a row stands for; a label whatever its case. */
const same = (step: Question, a: string, b: string) => (step === 'labels' ? sameLabel(a, b) : a === b);

/** A row of a question's values: what is picked, how it reads and what goes before it. */
interface ValueRow {
  value: string;
  text: string;
  lead: ReactNode;
}

/** A person's name in the filter, Unnamed for one without. */
const nameOf = (person: Person) => person.name ?? t('settings.unnamed');

/**
 * The values of one question. Labels go by how much they are used, those picked when it opened
 * first; people as the person picker has them, the user first, then the agents, then no one.
 */
function valueRows(step: Question, place: FilterPlace, known: LabelUse[], first: string[]): ValueRow[] {
  switch (step) {
    case 'in':
      return (place.folders ?? []).map((folder) => ({ value: folder.value, text: folder.text, lead: <Icon name={folder.space ? 'space' : 'folder'} /> }));
    case 'labels': {
      const used = [...known].sort((a, b) => b.tasks + b.cards - (a.tasks + a.cards) || a.name.localeCompare(b.name)).map((use) => use.name);
      const names = [...first, ...used.filter((name) => !first.some((each) => sameLabel(each, name)))];
      return names.map((name) => ({ value: name, text: name, lead: <i className="lbl-dot" style={hueStyle(labelColor(name, known), name)} aria-hidden="true" /> }));
    }
    case 'priority':
      return ([1, 2, 3, 4] as Priority[]).map((n) => ({
        value: String(n),
        text: n === 4 ? t('filter.noPriority') : t('tasks.priorityN', { n }),
        lead: (
          <span className={`fx-prio p${n}`}>
            <Icon name="flag" />
          </span>
        ),
      }));
    case 'due':
      return DUE_RULES.filter((rule) => rule !== 'any').map((rule) => ({ value: rule, text: t(`filter.due.${rule}`), lead: null }));
    case 'assignee': {
      const team = place.team!;
      const others = team.people.filter((person) => person.active && person.id !== team.me);
      const humans = others.filter((person) => !isAgent(person)).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
      const agents = others.filter(isAgent).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
      const me = team.people.find((person) => person.id === team.me);
      return [
        { value: GIVEN.me, text: t('filter.me'), lead: <Who name={me?.name ?? t('filter.me')} /> },
        { value: GIVEN.others, text: t('filter.others'), lead: <span className="who none" aria-hidden="true" /> },
        ...humans.map((person) => ({ value: person.id, text: nameOf(person), lead: <Who name={person.name} /> })),
        ...agents.map((person) => ({ value: person.id, text: nameOf(person), lead: <Who name={person.agent?.client ?? person.name} agent /> })),
        { value: GIVEN.nobody, text: t('people.nobody'), lead: <span className="who none" aria-hidden="true" /> },
      ];
    }
  }
}

/** How a picked value reads on its chip. */
function valueText(step: Question, value: string, place: FilterPlace): string {
  if (step === 'in') return place.folders?.find((folder) => folder.value === value)?.text ?? value;
  if (step === 'labels') return value;
  if (step === 'priority') return value === '4' ? t('filter.noPriority') : `p${value}`;
  if (step === 'due') return t(`filter.due.${value as Exclude<DueRule, 'any'>}`);
  if (value === GIVEN.me) return t('filter.me');
  if (value === GIVEN.others) return t('filter.others');
  if (value === GIVEN.nobody) return t('people.nobody');
  const person = place.team?.people.find((each) => each.id === value);
  return person ? nameOf(person) : t('card.someone');
}

/** A day as a condition says it: Oct 12. */
const dayText = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(locale(), { month: 'short', day: 'numeric' });

/** A field's condition in words: "is more than 3", "is Acme Corp, Globex", "is before today". */
function conditionText(condition: Condition, field: Field | undefined): string {
  const op = t(`collection.op.${condition.op}`);
  if (!opTakesValue(condition.op)) return op;
  const { value } = condition;
  const words = Array.isArray(value) ? value.join(t('list.separator')) : value === TODAY ? t('collection.today') : field?.type === 'date' && typeof value === 'string' ? dayText(value) : String(value ?? '');
  return `${op} ${words}`;
}

/** What is asked in a step, in words: the values, or Any. */
function summary(step: FilterStep, choices: Choices, place: FilterPlace): string {
  if (!isQuestion(step)) {
    const condition = conditionOf(choices, step.slice(6));
    return condition && isComplete(condition) ? conditionText(condition, fieldOf(step, place)) : t('filter.any');
  }
  const picked = pickedIn(step, choices);
  if (picked.length === 0) return t(step === 'assignee' ? 'filter.anyone' : 'filter.any');
  return picked.map((value) => valueText(step, value, place)).join(t('list.separator'));
}

/** A row of a step: a question's value, or a field's condition or one of its values. */
interface StepRow {
  key: string;
  text: string;
  lead?: ReactNode;
  on: boolean;
  run: () => void;
  /** A line above it, apart from the rows before: a field's values under its conditions. */
  apart?: boolean;
}

/** What a field's condition is compared with when it is not picked from rows. */
type ValueBox = { kind: 'number' | 'text' | 'date' | 'time'; value: string; set: (value: string) => void };

/**
 * One step's rows, the same in the menu and in a phone's sheet. A question's are its values. A
 * field's are what can be asked of it, one at a time, then its values: a choice's or a link's to
 * pick, any of them matching, or a box to type one in; a day takes Today too.
 */
function useStep(step: FilterStep | null, place: FilterPlace, choices: Choices, onChange: (choices: Choices) => void, query: string, first: string[]) {
  const spaceLabels = useLabels().of(place.path);
  const known = place.labels ?? spaceLabels;
  const typed = query.trim().toLowerCase();
  if (!step) return { rows: [] as StepRow[], finds: false, box: null as ValueBox | null };
  if (isQuestion(step)) {
    const picked = pickedIn(step, choices);
    const rows = valueRows(step, place, known, first)
      .filter((row) => !typed || row.text.toLowerCase().includes(typed))
      .map((row): StepRow => {
        const on = picked.some((value) => same(step, value, row.value));
        // When it is due is one answer: picking another puts it in the first's place.
        const next = step === 'due' ? (on ? [] : [row.value]) : on ? picked.filter((value) => !same(step, value, row.value)) : [...picked, row.value];
        return { key: row.value, text: row.text, lead: row.lead, on, run: () => onChange(withPicked(choices, step, next)) };
      });
    return { rows, finds: step === 'labels' || step === 'assignee', box: null };
  }
  const field = fieldOf(step, place);
  if (!field) return { rows: [], finds: false, box: null };
  const key = field.key;
  const condition = conditionOf(choices, key);
  const set = (next: Condition | null) => onChange(withCondition(choices, key, next));
  const ops = opsFor(field.type);
  const rows: StepRow[] = ops.map((op: ConditionOp) => ({
    key: `op:${op}`,
    text: t(`collection.op.${op}`),
    on: condition?.op === op,
    // Picking the condition asked takes it off; another keeps the value typed or picked.
    run: () => set(condition?.op === op ? null : { field: key, op, ...(opTakesValue(op) && condition?.value !== undefined && { value: condition.value }) }),
  }));
  const op = condition?.op;
  if (!op || !opTakesValue(op)) return { rows, finds: false, box: null };
  const value = condition.value;
  if (field.type === 'select' || field.type === 'multi-select' || field.type === 'link') {
    const picked = Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : [];
    const offered = [...(field.type === 'link' ? [] : (field.options ?? [])), ...(place.used?.(key) ?? [])];
    const names = [...new Set([...picked, ...offered])];
    names.forEach((name, index) =>
      rows.push({
        key: `value:${name}`,
        text: name,
        on: picked.includes(name),
        run: () => set({ ...condition, value: picked.includes(name) ? picked.filter((each) => each !== name) : [...picked, name] }),
        apart: index === 0,
      }),
    );
    return { rows, finds: false, box: null };
  }
  const shown = typeof value === 'number' ? String(value) : typeof value === 'string' && value !== TODAY ? value : '';
  if (field.type === 'date') {
    rows.push({ key: 'value:today', text: t('collection.today'), on: value === TODAY, run: () => set({ ...condition, value: value === TODAY ? undefined : TODAY }), apart: true });
    return { rows, finds: false, box: { kind: 'date', value: shown, set: (day: string) => set({ ...condition, value: day || undefined }) } };
  }
  const number = field.type === 'number' || field.type === 'formula' || field.type === 'rollup';
  return {
    rows,
    finds: false,
    box: {
      kind: number ? 'number' : field.type === 'time' ? 'time' : 'text',
      value: shown,
      set: (typed: string) => set({ ...condition, value: number ? (typed === '' ? undefined : Number(typed)) : typed || undefined }),
    },
  };
}

const keepFocus = (event: MouseEvent) => event.preventDefault();

/**
 * Filter's menu, under what opened it: the questions, a board's fields under a line, or with
 * `start` one step's rows. A step has ← back to the questions; Labels and Given to have a line to
 * find by. The arrows move through the rows, Enter or a click picks, Esc closes.
 */
export function FilterMenu({ anchor, place, start, choices, onChange, onClose }: {
  anchor: HTMLElement;
  place: FilterPlace;
  start: FilterStep | null;
  choices: Choices;
  onChange: (choices: Choices) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState(start);
  const [query, setQuery] = useState('');
  const [at, setAt] = useState(0);
  // What was picked when a question opened goes first, and stays where it is while it is open.
  const [first, setFirst] = useState(() => (start && isQuestion(start) ? pickedIn(start, choices) : []));
  const pop = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const style = usePopPlace(anchor, 248, 400);
  useAway(pop, anchor, onClose);
  const questions = questionsOf(place);
  const fields = fieldStepsOf(place);
  const steps = [...questions, ...fields];
  const { rows, finds, box } = useStep(step, place, choices, onChange, query, first);
  const count = step ? rows.length : steps.length;

  useEffect(() => {
    if (finds) search.current?.focus({ preventScroll: true });
    else pop.current?.focus({ preventScroll: true });
  }, [step, finds]);

  const open = (next: FilterStep | null) => {
    setStep(next);
    setFirst(next && isQuestion(next) ? pickedIn(next, choices) : []);
    setQuery('');
    setAt(0);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // A box typed in keeps its own keys, Esc and Tab aside.
    if (event.target instanceof HTMLInputElement && event.target.classList.contains('fx-box') && event.key !== 'Escape' && event.key !== 'Tab') return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (count > 0) setAt((now) => (event.key === 'ArrowDown' ? (now + 1) % count : (now - 1 + count) % count));
    } else if (event.key === 'Enter') {
      if (step) rows[at]?.run();
      else if (steps[at]) open(steps[at]);
    } else if (event.key === 'ArrowRight' && !step && steps[at]) {
      open(steps[at]);
    } else if ((event.key === 'ArrowLeft' || event.key === 'Backspace') && step && !query) {
      open(null);
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      onClose();
    } else return;
    event.preventDefault();
    event.stopPropagation();
  };
  const stepRow = (each: FilterStep, index: number) => (
    <button
      key={each}
      type="button"
      role="menuitem"
      tabIndex={-1}
      className={index === at ? 'at' : undefined}
      onMouseDown={keepFocus}
      onMouseMove={() => index !== at && setAt(index)}
      onClick={() => open(each)}
    >
      <Icon name={isQuestion(each) ? STEP_ICON[each] : 'list'} />
      <span className="nm">{stepName(each, place)}</span>
      <small>{isQuestion(each) ? pickedIn(each, choices).length || '' : asks(each, choices) ? '1' : ''}</small>
      <span className="go" aria-hidden="true">
        ›
      </span>
    </button>
  );

  return createPortal(
    <div ref={pop} className="lbl-picker fx-menu" role="dialog" aria-label={t('filter.button')} tabIndex={-1} style={style ?? { opacity: 0 }} onKeyDown={onKeyDown}>
      {step === null ? (
        <div className="lbl-rows" role="menu">
          {questions.map((each, index) => stepRow(each, index))}
          {fields.length > 0 && (
            <>
              <div className="fx-sep" />
              <div className="fx-cap">{t('filter.fields')}</div>
              {fields.map((each, index) => stepRow(each, questions.length + index))}
            </>
          )}
        </div>
      ) : (
        <>
          <button type="button" className="fx-back" onMouseDown={keepFocus} onClick={() => open(null)}>
            <Icon name="back" />
            {stepName(step, place)}
          </button>
          {finds && (
            <input
              ref={search}
              className="lbl-search"
              aria-label={t(step === 'labels' ? 'filter.findLabel' : 'people.find')}
              placeholder={t(step === 'labels' ? 'filter.findLabel' : 'people.find')}
              autoComplete="off"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setAt(0);
              }}
            />
          )}
          <div className="lbl-rows" role="listbox" aria-label={stepName(step, place)} aria-multiselectable={step !== 'due'}>
            {rows.map((row, index) => (
              <Fragment key={row.key}>
                {row.apart && <div className="fx-sep" />}
                <button
                  type="button"
                  role="option"
                  aria-selected={row.on}
                  tabIndex={-1}
                  className={index === at ? 'at' : undefined}
                  onMouseDown={keepFocus}
                  onMouseMove={() => index !== at && setAt(index)}
                  onClick={row.run}
                >
                  {row.lead}
                  <span className="nm">{row.text}</span>
                  <span className="tick" aria-hidden="true">
                    {row.on ? '✓' : ''}
                  </span>
                </button>
              </Fragment>
            ))}
            {rows.length === 0 && <p className="lbl-none">{t(step === 'labels' && !query.trim() ? 'filter.noLabels' : 'filter.noneFound')}</p>}
          </div>
          {box && (
            <input
              className="fx-box"
              type={box.kind}
              step={box.kind === 'number' ? 'any' : undefined}
              aria-label={t('collection.value')}
              placeholder={t('collection.value')}
              value={box.value}
              onChange={(event) => box.set(event.target.value)}
            />
          )}
        </>
      )}
    </div>,
    document.body,
  );
}

/** Search in a header: what is typed narrows the list as it is typed. */
export function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="search fx-search">
      <Icon name="search" />
      <input
        type="search"
        spellCheck={false}
        aria-label={t('tasks.search')}
        placeholder={t('tasks.search')}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || !value) return;
          event.preventDefault();
          event.stopPropagation();
          onChange('');
        }}
      />
    </label>
  );
}

/** What a chip says it asks: the values, a label's with its dot, or a field's condition. */
function ChipValues({ step, choices, place }: { step: FilterStep; choices: Choices; place: FilterPlace }) {
  if (!isQuestion(step)) return <b>{summary(step, choices, place)}</b>;
  return (
    <b>
      {pickedIn(step, choices).map((value, index) => (
        <Fragment key={value}>
          {index > 0 && t('list.separator')}
          {step === 'labels' && <LabelValueDot place={place} name={value} />}
          {valueText(step, value, place)}
        </Fragment>
      ))}
    </b>
  );
}

/**
 * Filter for a header, the chips for under it and the menu either opens, all over the same choices.
 * The button says how many steps are asked; a chip opens its step's rows, × takes it off; + Filter
 * opens the questions, Clear takes everything off.
 */
export function useFilter(place: FilterPlace, choices: Choices, onChange: (choices: Choices) => void, end?: ReactNode) {
  const [open, setOpen] = useState<{ step: FilterStep | null; anchor: HTMLElement } | null>(null);
  const asked = askedSteps(place, choices);
  /** Whether the menu is open from this element. */
  const from = (element: HTMLElement | null) => !!open && open.anchor === element;
  const head = useRef<HTMLButtonElement>(null);
  const more = useRef<HTMLButtonElement>(null);
  const toggle = (step: FilterStep | null, anchor: HTMLElement) => setOpen((was) => (was?.anchor === anchor ? null : { step, anchor }));
  const button = (
    <button
      ref={head}
      type="button"
      className={asked.length > 0 ? 'ghost fbtn on' : 'ghost fbtn'}
      aria-haspopup="dialog"
      aria-expanded={from(head.current)}
      onClick={(event) => toggle(null, event.currentTarget)}
    >
      <Icon name="filter" />
      {asked.length > 0 ? t('filter.buttonCount', { count: asked.length }) : t('filter.button')}
    </button>
  );
  const chips = (asked.length > 0 || !!end) && (
    <div className="fx-bar">
      {asked.map((step) => (
        <span key={step} data-step={step} className={open?.anchor.dataset.step === step ? 'fx-chip open' : 'fx-chip'}>
          <button type="button" className="fx-what" aria-expanded={open?.anchor.dataset.step === step} onClick={(event) => toggle(step, event.currentTarget.parentElement!)}>
            {t('filter.chip', { what: stepName(step, place) })}
            <ChipValues step={step} choices={choices} place={place} />
          </button>
          <button
            type="button"
            className="fx-x"
            title={t('filter.takeOff', { what: stepName(step, place) })}
            aria-label={t('filter.takeOff', { what: stepName(step, place) })}
            onClick={() => onChange(withNothing(choices, step))}
          >
            ×
          </button>
        </span>
      ))}
      <button ref={more} type="button" className="fx-add" aria-expanded={from(more.current)} onClick={(event) => toggle(null, event.currentTarget)}>
        <Icon name="plus" />
        {t('filter.button')}
      </button>
      {asked.length > 0 && (
        <button
          type="button"
          className="fx-clear"
          onClick={() => {
            setOpen(null);
            onChange({ ...NO_CHOICES, text: choices.text });
          }}
        >
          {t('filter.clear')}
        </button>
      )}
      {end && <span className="fx-end">{end}</span>}
    </div>
  );
  const menu = open && <FilterMenu anchor={open.anchor} place={place} start={open.step} choices={choices} onChange={onChange} onClose={() => setOpen(null)} />;
  return { button, chips, menu };
}

/** A picked label's dot on its chip, in the color its space gives it, or the one every space's labels give it. */
function LabelValueDot({ place, name }: { place: FilterPlace; name: string }) {
  const spaceLabels = useLabels().of(place.path);
  return <i className="lbl-dot" style={hueStyle(labelColor(name, place.labels ?? spaceLabels), name)} aria-hidden="true" />;
}

/**
 * On a phone, what a list or a board is filtered by, under its title: a chip for each step asked,
 * which opens its rows in the sheet; × takes it off, Clear all of them. Nothing shows when nothing
 * is asked: the bar's filter button opens the sheet.
 */
export function PhoneFilterChips({ place, choices, onChange, onOpen }: {
  place: FilterPlace;
  choices: Choices;
  onChange: (choices: Choices) => void;
  onOpen: (step: FilterStep) => void;
}) {
  const asked = askedSteps(place, choices);
  if (asked.length === 0) return null;
  return (
    <div className="fx-mchips">
      {asked.map((step) => (
        <span key={step} className="fx-mchip">
          <button type="button" className="fx-what" onClick={() => onOpen(step)}>
            {t('filter.chip', { what: stepName(step, place) })}
            <b>{summary(step, choices, place)}</b>
          </button>
          <button type="button" className="fx-x" aria-label={t('filter.takeOff', { what: stepName(step, place) })} onClick={() => onChange(withNothing(choices, step))}>
            ×
          </button>
        </span>
      ))}
      <button type="button" className="fx-mclear" onClick={() => onChange({ ...NO_CHOICES, text: choices.text })}>
        {t('filter.clear')}
      </button>
    </div>
  );
}

/**
 * On a phone, Filter as a sheet: a line to find in what is filtered, then the questions and a
 * board's fields, each with what is asked in it; a touch opens its rows, ← comes back. What is
 * behind follows each touch.
 */
export function FilterSheet({ place, about, start = null, choices, onChange, onClose }: {
  place: FilterPlace;
  /** What is filtered, said beside the title. */
  about?: string;
  start?: FilterStep | null;
  choices: Choices;
  onChange: (choices: Choices) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState(start);
  const [query, setQuery] = useState('');
  const [first, setFirst] = useState(() => (start && isQuestion(start) ? pickedIn(start, choices) : []));
  const { rows, finds, box } = useStep(step, place, choices, onChange, query, first);
  const open = (next: FilterStep | null) => {
    setStep(next);
    setFirst(next && isQuestion(next) ? pickedIn(next, choices) : []);
    setQuery('');
  };
  const title = step ? stepName(step, place) : t('filter.sheet');
  const stepRow = (each: FilterStep) => (
    <button key={each} type="button" className="mb-fr" onClick={() => open(each)}>
      <Icon name={isQuestion(each) ? STEP_ICON[each] : 'list'} />
      <span className="fl">{stepName(each, place)}</span>
      <span className={asks(each, choices) ? 'val on' : 'val'}>{summary(each, choices, place)}</span>
      <Icon name="chevron" />
    </button>
  );
  const fields = fieldStepsOf(place);
  return (
    <Sheet label={title} className="mb-create fx-sheet" onClose={onClose}>
      <div className="mb-sh">
        {step && (
          <button type="button" className="fx-sback" aria-label={t('phone.back', { page: t('filter.sheet') })} onClick={() => open(null)}>
            <Icon name="back" />
          </button>
        )}
        <b>{title}</b>
        {!step && about && <small>{about}</small>}
        <SheetClose onClose={onClose} />
      </div>
      <div className="mb-form">
        {step === null ? (
          <>
            <label className="mb-search">
              <Icon name="search" />
              <input
                type="search"
                aria-label={t(place.folders ? 'filter.findBoth' : place.fields ? 'filter.findCards' : 'filter.findTasks')}
                placeholder={t(place.folders ? 'filter.findBoth' : place.fields ? 'filter.findCards' : 'filter.findTasks')}
                enterKeyHint="done"
                autoComplete="off"
                value={choices.text}
                onChange={(event) => onChange({ ...choices, text: event.target.value })}
              />
            </label>
            <div className="mb-group">{questionsOf(place).map(stepRow)}</div>
            {fields.length > 0 && (
              <>
                <div className="mb-cap">{t('filter.fields')}</div>
                <div className="mb-group">{fields.map(stepRow)}</div>
              </>
            )}
            {askedSteps(place, choices).length > 0 && (
              <div className="mb-group">
                <button type="button" className="mb-fr fx-sclear" onClick={() => onChange({ ...NO_CHOICES, text: choices.text })}>
                  {t('filter.clearFilter')}
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            {finds && (
              <label className="mb-search">
                <Icon name="search" />
                <input
                  aria-label={t(step === 'labels' ? 'filter.findLabel' : 'people.find')}
                  placeholder={t(step === 'labels' ? 'filter.findLabel' : 'people.find')}
                  enterKeyHint="done"
                  autoComplete="off"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
            )}
            <div className="mb-group">
              {rows.map((row) => (
                <Fragment key={row.key}>
                  {row.apart && <div className="fx-msep" />}
                  <button type="button" className="mb-fr pick" onClick={row.run}>
                    {row.lead}
                    <span className="in">{row.text}</span>
                    <span className="tick">{row.on && <Icon name="check" />}</span>
                  </button>
                </Fragment>
              ))}
              {rows.length === 0 && <p className="mb-none">{t(step === 'labels' && !query.trim() ? 'filter.noLabels' : 'filter.noneFound')}</p>}
            </div>
            {box && (
              <div className="mb-group">
                <label className="mb-fr">
                  <input
                    className="in"
                    type={box.kind}
                    step={box.kind === 'number' ? 'any' : undefined}
                    inputMode={box.kind === 'number' ? 'decimal' : undefined}
                    enterKeyHint="done"
                    aria-label={t('collection.value')}
                    placeholder={t('collection.value')}
                    value={box.value}
                    onChange={(event) => box.set(event.target.value)}
                  />
                </label>
              </div>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
