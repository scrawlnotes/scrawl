import { type Board, type ChoiceRenames, type Column, columnCards, type Field, fold, isFinished, moveCard, nextOpenPhase, type Phase, removePhase, renameInViews, type Schema, type Section, sectionTasks, setBoardFields, type TaskList } from '@scrawlnotes/core';
import { type FileKind, Refusal } from './paths';

// A part of a board, a task list or a schema, read and written alone: a board's phases without its
// cards, a list's sections without its tasks. A part written does to the cards what the same change
// does in the app: a column taken away sends its cards to the first, a phase closed sends what is
// not finished to the next, or where `unfinished` says. See design/agent-parts.md.

type Json = { [key: string]: unknown };

/** The parts of each file read and written alone, each with what it is when the file has none. */
export const PARTS: Partial<Record<FileKind, { [part: string]: unknown }>> = {
  board: { columns: [], phases: [], fields: [], phasesOn: false, prefix: null, view: null },
  tasks: { sections: [] },
  schema: { fields: [], layout: null, views: [], defaultView: null, singular: null },
};

/** What is in a file but no part of it, said with what writes it. */
const ELSEWHERE: { [key: string]: string } = { cards: 'cards are written with save_card', tasks: 'tasks are written with save_task', nextKey: 'it grows by itself as cards are added' };

const KIND_WORDS: Partial<Record<FileKind, string>> = { board: 'a board', tasks: 'a task list', schema: 'a schema' };

/** Refuses a part the file does not have, saying the ones it has. */
export function checkPart(kind: FileKind, part: string, path: string): void {
  const parts = PARTS[kind];
  if (!parts) throw new Refusal(`${path} has no parts: part is for a board, a task list or a collection's schema`, { path });
  if (!Object.hasOwn(parts, part)) throw new Refusal(`${part} is not a part of ${KIND_WORDS[kind]}${ELSEWHERE[part] ? `: ${ELSEWHERE[part]}` : ''}`, { path, parts: Object.keys(parts) });
}

/** A part as it is read and compared: its value, and its JSON. */
export function partOf(kind: FileKind, data: Json, part: string): { value: unknown; text: string } {
  const value = data[part] ?? PARTS[kind]![part];
  return { value, text: JSON.stringify(value, null, 2) };
}

const cardsWord = (n: number) => (n === 1 ? '1 card' : `${n} cards`);

/** The items of a list part as given, each an object; a new one, with no id, is given one. */
function itemsOf<T extends { id: string }>(value: unknown, part: string): T[] {
  if (!Array.isArray(value)) throw new Refusal(`${part} is a list: write it as [ … ]`, { part });
  return value.map((item, i) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) throw new Refusal(`Item ${i + 1} of ${part} is not an object`, { part });
    const { id, ...rest } = item as Json;
    return (typeof id === 'string' && id.trim() ? item : { id: crypto.randomUUID(), ...rest }) as T;
  });
}

/** Refuses renames whose old name was no choice of the field, or whose new name is none now. */
export function checkRenames(before: Field[], after: Field[], renames: ChoiceRenames): void {
  for (const [key, names] of Object.entries(renames)) {
    const old = before.find((f) => f.key === key);
    const now = after.find((f) => f.key === key);
    if (!old?.options || !now?.options) throw new Refusal(`renames names ${key}, which is no select field here`, { field: key, fields: after.filter((f) => f.options).map((f) => f.key) });
    for (const [from, to] of Object.entries(names)) {
      if (!old.options.includes(from)) throw new Refusal(`${from} was no choice of ${now.label}`, { field: key, choices: old.options });
      if (!now.options.includes(to)) throw new Refusal(`${to} is no choice of ${now.label}; add it to its options`, { field: key, choices: now.options });
    }
  }
}

const same = (a: string, b: string) => fold(a.trim()) === fold(b.trim());

/**
 * Where the cards not finished of a phase closed go: the open phase `unfinished` names, no phase
 * with "none", or they stay with "stay"; the next open phase when it says nothing.
 */
function leftoversOf(board: Board, closed: Phase, unfinished: string | undefined): Phase | null | 'stay' {
  if (unfinished === undefined) return nextOpenPhase(board, closed.id) ?? null;
  const wanted = unfinished.trim();
  if (fold(wanted) === 'none') return null;
  if (fold(wanted) === 'stay') return 'stay';
  const found = board.phases.find((p) => p.id === wanted) ?? board.phases.find((p) => same(p.name, wanted));
  if (found && found.id !== closed.id && found.state !== 'done') return found;
  if (!found && fold(wanted) === 'next') return nextOpenPhase(board, closed.id) ?? null;
  const why = !found ? 'there is no phase called that' : found.id === closed.id ? 'it is the phase closing' : 'that phase is done';
  throw new Refusal(`unfinished is ${unfinished}, but ${why}: give an open phase's name, "none" or "stay". Nothing was written`, { open: board.phases.filter((p) => p.state !== 'done' && p.id !== closed.id).map((p) => p.name) });
}

/** A board with one part as written, and what that did to its cards, a line each. */
export function boardWithPart(board: Board, part: string, value: unknown, renames: ChoiceRenames | undefined, now: Date, by: string | undefined, unfinished?: string): { board: Board; followed: string[] } {
  const followed: string[] = [];
  const stamp = now.toISOString();
  switch (part) {
    case 'columns': {
      const columns = itemsOf<Column>(value, part);
      const was = new Map(board.columns.map((c) => [c.id, c.kind]));
      // A column that means something else: its cards are finished, or not, as of now (setColumnKind).
      const kinds = new Map(columns.filter((c) => was.has(c.id) && was.get(c.id) !== c.kind).map((c) => [c.id, c.kind]));
      let out: Board = {
        ...board,
        columns,
        cards: board.cards.map((c) => (kinds.has(c.column) ? { ...c, completed: kinds.get(c.column) === 'done' ? (c.completed ?? stamp) : null } : c)),
      };
      // A column taken away: its cards go to the end of the first column (removeColumn).
      const first = columns[0];
      for (const gone of board.columns.filter((c) => !columns.some((n) => n.id === c.id))) {
        const cards = columnCards(out, gone.id);
        if (!first || cards.length === 0) continue;
        for (const card of cards) out = moveCard(out, card.id, { column: first.id, after: columnCards(out, first.id).pop()?.id ?? null }, () => now, by);
        followed.push(`${cardsWord(cards.length)} of ${gone.name} went to ${first.name}`);
      }
      return { board: out, followed };
    }
    case 'phases': {
      const phases = itemsOf<Phase>(value, part);
      let out = board;
      // A phase taken away: its cards stay, in no phase (removePhase).
      for (const gone of board.phases.filter((p) => !phases.some((n) => n.id === p.id))) {
        const n = out.cards.filter((c) => c.phase === gone.id).length;
        out = removePhase(out, gone.id);
        if (n > 0) followed.push(`${cardsWord(n)} of ${gone.name} ${n === 1 ? 'is' : 'are'} in no phase now`);
      }
      // A phase closed: its cards not finished go where unfinished says, the next open phase when it says nothing (closePhase, as the app closes one).
      for (const phase of phases) {
        const before = board.phases.find((p) => p.id === phase.id);
        if (!before || before.state === 'done' || phase.state !== 'done') continue;
        const left = new Set(out.cards.filter((c) => c.phase === phase.id && !isFinished(out, c)).map((c) => c.id));
        if (left.size === 0) continue;
        const to = leftoversOf({ ...out, phases }, phase, unfinished);
        if (to === 'stay') {
          followed.push(`${cardsWord(left.size)} of ${phase.name} not finished ${left.size === 1 ? 'stays' : 'stay'} in it`);
          continue;
        }
        out = {
          ...out,
          cards: out.cards.map((c) => {
            if (!left.has(c.id)) return c;
            if (to) return { ...c, phase: to.id, updated: stamp };
            const { phase: _gone, ...rest } = c;
            return { ...rest, updated: stamp };
          }),
        };
        followed.push(`${cardsWord(left.size)} of ${phase.name} not finished ${to ? `went to ${to.name}` : `${left.size === 1 ? 'is' : 'are'} in no phase now`}`);
      }
      return { board: { ...out, phases }, followed };
    }
    case 'fields': {
      if (!Array.isArray(value)) throw new Refusal('fields is a list: write it as [ … ]', { part });
      const fields = value as Field[];
      if (renames) checkRenames(board.fields ?? [], fields, renames);
      const out = setBoardFields(board, fields, renames ?? {});
      const renamed = out.cards.filter((c, i) => c !== board.cards[i]).length;
      if (renamed > 0) followed.push(`${cardsWord(renamed)} took the new names`);
      return { board: out, followed };
    }
    case 'phasesOn':
      if (typeof value !== 'boolean') throw new Refusal('phasesOn is true or false', { part });
      return { board: { ...board, phasesOn: value }, followed };
    case 'prefix':
      if (typeof value !== 'string' || !/^[\p{L}\p{N}]+$/u.test(value.trim())) throw new Refusal('prefix is letters and digits, like ROA', { part });
      return { board: { ...board, prefix: value.trim() }, followed };
    default: {
      // view, the one part left
      if (value !== null && value !== 'list') throw new Refusal('view is "list" to open as a list, or null for columns', { part });
      const { view: _view, ...rest } = board;
      return { board: value === 'list' ? { ...rest, view: 'list' } : rest, followed };
    }
  }
}

/** A list with its sections as written. A section with tasks is not taken away here: it goes to the trash with them. */
export function listWithSections(list: TaskList, value: unknown): TaskList {
  const sections = itemsOf<Section>(value, 'sections');
  for (const gone of list.sections.filter((s) => !sections.some((n) => n.id === s.id))) {
    const tasks = sectionTasks(list, gone.id).length;
    if (tasks > 0) {
      throw new Refusal(`${gone.name} has ${tasks === 1 ? 'a task' : `${tasks} tasks`}; a section with tasks goes to the trash with them: use trash with section "${gone.name}". Nothing was written`, { section: gone.name, tasks });
    }
  }
  return { ...list, sections };
}

/** A schema's JSON with one part as written, null taking the part away; with renames, its views' conditions take the new names. */
export function schemaWithPart(data: Json, part: string, value: unknown, renames?: ChoiceRenames): Json {
  const out: Json = { ...data };
  if (value === null) delete out[part];
  else out[part] = value;
  return renames ? renamedViews(data, out, renames) : out;
}

/** A schema's JSON whose views' conditions take the names its renames give, the renames checked against the schema before. */
export function renamedViews(before: Json, after: Json, renames: ChoiceRenames): Json {
  const fields = (data: Json) => (Array.isArray(data.fields) ? (data.fields as Field[]) : []);
  checkRenames(fields(before), fields(after), renames);
  const views = after.views;
  if (!Array.isArray(views) || !views.every((v) => typeof v === 'object' && v !== null && Array.isArray((v as Json).conditions))) return after;
  return renameInViews(after as unknown as Schema, renames) as unknown as Json;
}
