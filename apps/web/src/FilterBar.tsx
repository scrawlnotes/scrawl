import { assigneesOf, DUE_RULES, type DueRule, GIVEN, isAgent, labelColor, type LabelUse, NO_CHOICES, type Person, type PlaceChoices, type Priority, sameLabel } from '@scrawlnotes/core';
import { type MessageKey, t } from '@scrawlnotes/i18n';
import { Fragment, type KeyboardEvent, type MouseEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { hueStyle } from './choices';
import { Icon, type IconName } from './Icon';
import { useLabels } from './labels';
import { type SpacePeople, Who } from './People';
import { Sheet, SheetClose } from './sheets';
import { useAway, usePopPlace } from './TaskComposer';

// Filtering a task list where it is, and a board (design/filters.md 2): Search and Filter in its
// header. Filter's menu has what can be asked; each opens its values a step in, where a click puts
// one on or takes it off and the list behind follows at once. What is picked shows as chips under
// the header: a chip opens its values again, × takes it off. Nothing is written to a file; the
// device keeps it.

/** One question of Filter: a row of its menu, and a chip once something is picked in it. */
export type FilterStep = 'labels' | 'priority' | 'due' | 'assignee';

/** Where the filtering is: a path in the space whose labels are offered, and that space's people, none in the personal space. */
export interface FilterPlace {
  path: string;
  team: SpacePeople | null;
}

const STEP_NAME: Record<FilterStep, MessageKey> = { labels: 'card.labels', priority: 'filter.priority', due: 'filter.due', assignee: 'filter.assignee' };
const STEP_ICON: Record<FilterStep, IconName> = { labels: 'tag', priority: 'flag', due: 'calendar', assignee: 'person' };

/** The questions in the menu's order; Given to only where there are people to give work to. */
const stepsOf = (place: FilterPlace): FilterStep[] => ['labels', 'priority', 'due', ...(place.team ? (['assignee'] as const) : [])];

/** What is picked in one question, as the values the choices hold. */
function pickedIn(step: FilterStep, choices: PlaceChoices): string[] {
  switch (step) {
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
function withPicked(choices: PlaceChoices, step: FilterStep, picked: string[]): PlaceChoices {
  const { labels: _labels, assignees: _assignees, mine: _mine, ...rest } = choices;
  const labels = step === 'labels' ? picked : (choices.labels ?? []);
  const assignees = step === 'assignee' ? picked : assigneesOf(choices);
  return {
    ...rest,
    ...(step === 'priority' && { priorities: picked.map(Number) as Priority[] }),
    ...(step === 'due' && { due: (picked[0] as DueRule | undefined) ?? 'any' }),
    ...(labels.length > 0 && { labels }),
    ...(assignees.length > 0 && { assignees }),
  };
}

/** Whether a picked value is the one a row stands for; a label whatever its case. */
const same = (step: FilterStep, a: string, b: string) => (step === 'labels' ? sameLabel(a, b) : a === b);

/** The questions something is picked in: the chips under the header. */
export const askedSteps = (place: FilterPlace, choices: PlaceChoices) => stepsOf(place).filter((step) => pickedIn(step, choices).length > 0);

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
function valueRows(step: FilterStep, place: FilterPlace, known: LabelUse[], first: string[]): ValueRow[] {
  switch (step) {
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
function valueText(step: FilterStep, value: string, place: FilterPlace): string {
  if (step === 'labels') return value;
  if (step === 'priority') return value === '4' ? t('filter.noPriority') : `p${value}`;
  if (step === 'due') return t(`filter.due.${value as Exclude<DueRule, 'any'>}`);
  if (value === GIVEN.me) return t('filter.me');
  if (value === GIVEN.others) return t('filter.others');
  if (value === GIVEN.nobody) return t('people.nobody');
  const person = place.team?.people.find((each) => each.id === value);
  return person ? nameOf(person) : t('card.someone');
}

const keepFocus = (event: MouseEvent) => event.preventDefault();

/**
 * Filter's menu, under what opened it: the questions, or with `start` one question's values. A
 * question's values have ← back to the questions; Labels and Given to have a line to find by. The
 * arrows move through the rows, Enter or a click picks, Esc closes.
 */
export function FilterMenu({ anchor, place, start, choices, onChange, onClose }: {
  anchor: HTMLElement;
  place: FilterPlace;
  start: FilterStep | null;
  choices: PlaceChoices;
  onChange: (choices: PlaceChoices) => void;
  onClose: () => void;
}) {
  const known = useLabels().of(place.path);
  const [step, setStep] = useState(start);
  const [query, setQuery] = useState('');
  const [at, setAt] = useState(0);
  // What was picked when a question opened goes first, and stays where it is while it is open.
  const [first, setFirst] = useState(() => (start ? pickedIn(start, choices) : []));
  const pop = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const style = usePopPlace(anchor, 248, 380);
  useAway(pop, anchor, onClose);
  const steps = stepsOf(place);
  const finds = step === 'labels' || step === 'assignee';
  const typed = query.trim().toLowerCase();
  const rows = step ? valueRows(step, place, known, first).filter((row) => !typed || row.text.toLowerCase().includes(typed)) : [];
  const picked = step ? pickedIn(step, choices) : [];
  const count = step ? rows.length : steps.length;

  useEffect(() => {
    if (finds) search.current?.focus({ preventScroll: true });
    else pop.current?.focus({ preventScroll: true });
  }, [step, finds]);

  const open = (next: FilterStep | null) => {
    setStep(next);
    setFirst(next ? pickedIn(next, choices) : []);
    setQuery('');
    setAt(0);
  };
  const pick = (row: ValueRow) => {
    if (!step) return;
    const on = picked.some((value) => same(step, value, row.value));
    // When it is due is one answer: picking another puts it in the first's place.
    const next = step === 'due' ? (on ? [] : [row.value]) : on ? picked.filter((value) => !same(step, value, row.value)) : [...picked, row.value];
    onChange(withPicked(choices, step, next));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (count > 0) setAt((now) => (event.key === 'ArrowDown' ? (now + 1) % count : (now - 1 + count) % count));
    } else if (event.key === 'Enter') {
      if (step) {
        const row = rows[at];
        if (row) pick(row);
      } else if (steps[at]) open(steps[at]);
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

  return createPortal(
    <div ref={pop} className="lbl-picker fx-menu" role="dialog" aria-label={t('filter.button')} tabIndex={-1} style={style ?? { opacity: 0 }} onKeyDown={onKeyDown}>
      {step === null ? (
        <div className="lbl-rows" role="menu">
          {steps.map((each, index) => (
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
              <Icon name={STEP_ICON[each]} />
              <span className="nm">{t(STEP_NAME[each])}</span>
              <small>{pickedIn(each, choices).length || ''}</small>
              <span className="go" aria-hidden="true">
                ›
              </span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <button type="button" className="fx-back" onMouseDown={keepFocus} onClick={() => open(null)}>
            <Icon name="back" />
            {t(STEP_NAME[step])}
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
          <div className="lbl-rows" role="listbox" aria-label={t(STEP_NAME[step])} aria-multiselectable={step !== 'due'}>
            {rows.map((row, index) => {
              const on = picked.some((value) => same(step, value, row.value));
              return (
                <button
                  key={row.value}
                  type="button"
                  role="option"
                  aria-selected={on}
                  tabIndex={-1}
                  className={index === at ? 'at' : undefined}
                  onMouseDown={keepFocus}
                  onMouseMove={() => index !== at && setAt(index)}
                  onClick={() => pick(row)}
                >
                  {row.lead}
                  <span className="nm">{row.text}</span>
                  <span className="tick" aria-hidden="true">
                    {on ? '✓' : ''}
                  </span>
                </button>
              );
            })}
            {rows.length === 0 && <p className="lbl-none">{t(step === 'labels' && !typed ? 'filter.noLabels' : 'filter.noneFound')}</p>}
          </div>
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

/**
 * Filter for a header, the chips for under it and the menu either opens, all over the same choices.
 * The button says how many questions are asked; a chip opens its question's values, × takes it
 * off; + Filter opens the questions, Clear takes everything off.
 */
export function useFilter(place: FilterPlace, choices: PlaceChoices, onChange: (choices: PlaceChoices) => void) {
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
  const chips = asked.length > 0 && (
    <div className="fx-bar">
      {asked.map((step) => (
        <span key={step} data-step={step} className={open?.anchor.dataset.step === step ? 'fx-chip open' : 'fx-chip'}>
          <button type="button" className="fx-what" aria-expanded={open?.anchor.dataset.step === step} onClick={(event) => toggle(step, event.currentTarget.parentElement!)}>
            {t('filter.chip', { what: t(STEP_NAME[step]) })}
            <b>
              {pickedIn(step, choices).map((value, index) => (
                <Fragment key={value}>
                  {index > 0 && t('list.separator')}
                  {step === 'labels' && <LabelValueDot path={place.path} name={value} />}
                  {valueText(step, value, place)}
                </Fragment>
              ))}
            </b>
          </button>
          <button
            type="button"
            className="fx-x"
            title={t('filter.takeOff', { what: t(STEP_NAME[step]) })}
            aria-label={t('filter.takeOff', { what: t(STEP_NAME[step]) })}
            onClick={() => onChange(withPicked(choices, step, []))}
          >
            ×
          </button>
        </span>
      ))}
      <button ref={more} type="button" className="fx-add" aria-expanded={from(more.current)} onClick={(event) => toggle(null, event.currentTarget)}>
        <Icon name="plus" />
        {t('filter.button')}
      </button>
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
    </div>
  );
  const menu = open && <FilterMenu anchor={open.anchor} place={place} start={open.step} choices={choices} onChange={onChange} onClose={() => setOpen(null)} />;
  return { button, chips, menu };
}

/** A picked label's dot on its chip, in the color its space gives it. */
function LabelValueDot({ path, name }: { path: string; name: string }) {
  const known = useLabels().of(path);
  return <i className="lbl-dot" style={hueStyle(labelColor(name, known), name)} aria-hidden="true" />;
}

/** What is picked in one question, in words: the values, or Any. */
function summary(step: FilterStep, choices: PlaceChoices, place: FilterPlace): string {
  const picked = pickedIn(step, choices);
  if (picked.length === 0) return t(step === 'assignee' ? 'filter.anyone' : 'filter.any');
  return picked.map((value) => valueText(step, value, place)).join(t('list.separator'));
}

/**
 * On a phone, what a list is filtered by, under its title: a chip for each question asked, which
 * opens its values in the sheet; × takes it off, Clear all of them. Nothing shows when nothing is
 * asked: the bar's filter button opens the sheet.
 */
export function PhoneFilterChips({ place, choices, onChange, onOpen }: {
  place: FilterPlace;
  choices: PlaceChoices;
  onChange: (choices: PlaceChoices) => void;
  onOpen: (step: FilterStep) => void;
}) {
  const asked = askedSteps(place, choices);
  if (asked.length === 0) return null;
  return (
    <div className="fx-mchips">
      {asked.map((step) => (
        <span key={step} className="fx-mchip">
          <button type="button" className="fx-what" onClick={() => onOpen(step)}>
            {t('filter.chip', { what: t(STEP_NAME[step]) })}
            <b>{summary(step, choices, place)}</b>
          </button>
          <button type="button" className="fx-x" aria-label={t('filter.takeOff', { what: t(STEP_NAME[step]) })} onClick={() => onChange(withPicked(choices, step, []))}>
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
 * On a phone, Filter as a sheet: a line to find in the list's tasks, then the questions, each with
 * what is picked in it; a touch opens its values, ← comes back. The list behind follows each touch.
 */
export function FilterSheet({ place, about, start = null, choices, onChange, onClose }: {
  place: FilterPlace;
  /** What is filtered, said beside the title. */
  about?: string;
  start?: FilterStep | null;
  choices: PlaceChoices;
  onChange: (choices: PlaceChoices) => void;
  onClose: () => void;
}) {
  const known = useLabels().of(place.path);
  const [step, setStep] = useState(start);
  const [query, setQuery] = useState('');
  const [first, setFirst] = useState(() => (start ? pickedIn(start, choices) : []));
  const finds = step === 'labels' || step === 'assignee';
  const typed = query.trim().toLowerCase();
  const rows = step ? valueRows(step, place, known, first).filter((row) => !typed || row.text.toLowerCase().includes(typed)) : [];
  const picked = step ? pickedIn(step, choices) : [];
  const open = (next: FilterStep | null) => {
    setStep(next);
    setFirst(next ? pickedIn(next, choices) : []);
    setQuery('');
  };
  const pick = (row: ValueRow) => {
    if (!step) return;
    const on = picked.some((value) => same(step, value, row.value));
    const next = step === 'due' ? (on ? [] : [row.value]) : on ? picked.filter((value) => !same(step, value, row.value)) : [...picked, row.value];
    onChange(withPicked(choices, step, next));
  };
  const title = step ? t(STEP_NAME[step]) : t('filter.sheet');
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
                aria-label={t('filter.findTasks')}
                placeholder={t('filter.findTasks')}
                enterKeyHint="done"
                autoComplete="off"
                value={choices.text}
                onChange={(event) => onChange({ ...choices, text: event.target.value })}
              />
            </label>
            <div className="mb-group">
              {stepsOf(place).map((each) => (
                <button key={each} type="button" className="mb-fr" onClick={() => open(each)}>
                  <Icon name={STEP_ICON[each]} />
                  <span className="fl">{t(STEP_NAME[each])}</span>
                  <span className={pickedIn(each, choices).length > 0 ? 'val on' : 'val'}>{summary(each, choices, place)}</span>
                  <Icon name="chevron" />
                </button>
              ))}
            </div>
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
                <button key={row.value} type="button" className="mb-fr pick" onClick={() => pick(row)}>
                  {row.lead}
                  <span className="in">{row.text}</span>
                  <span className="tick">{picked.some((value) => same(step, value, row.value)) && <Icon name="check" />}</span>
                </button>
              ))}
              {rows.length === 0 && <p className="mb-none">{t(step === 'labels' && !typed ? 'filter.noLabels' : 'filter.noneFound')}</p>}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
