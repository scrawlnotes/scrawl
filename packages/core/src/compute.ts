import { BOARD_EXT, type Board, type Card, cardValue as readCardValue, isFinished, linkedCards } from './board';
import {
  type Collection,
  type Field,
  type FieldType,
  type FieldValue,
  formulaNode,
  isComputed,
  isLink,
  linkFieldsTo,
  matchesCondition,
  type Record,
  type RollupFn,
  type Schema,
} from './collection';
import { Day, type Env, evaluate, fromRuntime, isRef, type Kind, kindOfField, type Ref, type RV, type Scope, toRuntime } from './lang';

// What is worked out across a space: formulas, which may read a linked record's field
// (`project.customer`); lookups, a linked record's field shown as one of this record's; rollups,
// worked out from the records of a collection or the cards of a board that link to the record,
// those that meet their conditions, counted, added up, averaged or taken at their most or least.
// One part may read another, across collections: a project's spent is the sum of its
// transactions' amounts, its remaining a formula over its budget and its spent. A Computer works
// each value out once, as it is asked for, and keeps it; a value that, through others, reads
// itself gives nothing. Nothing is written: what is worked out is shown. See
// design/collection-apps.md 4.5.

/** The fields of a collection or a board by its path, for what reads across them. */
export type SchemaOf = (path: string) => Pick<Schema, 'fields'> | undefined;

/** Where the fields of every collection and board of a space are found, by path. */
export function schemasOf(collections: readonly Collection[], boards: { readonly [path: string]: Board } = {}): SchemaOf {
  const byDir = new Map(collections.map((c) => [c.dir, c.schema]));
  return (path) => (path.endsWith(BOARD_EXT) ? (boards[path] ? { fields: boards[path]!.fields ?? [] } : undefined) : byDir.get(path));
}

/** What a rollup makes of the values it found: their sum (0 for none), their average, their most or least, numbers before days. */
function aggregate(fn: RollupFn, values: RV[]): RV {
  const flat = values.flat(8);
  const numbers = flat.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (fn === 'sum') return numbers.reduce((sum, n) => sum + n, 0);
  if (fn === 'avg') return numbers.length > 0 ? numbers.reduce((sum, n) => sum + n, 0) / numbers.length : null;
  if (numbers.length > 0) return fn === 'max' ? Math.max(...numbers) : Math.min(...numbers);
  const days = flat.filter((v): v is Day => v instanceof Day);
  if (days.length === 0) return null;
  return days.reduce((a, b) => ((fn === 'max' ? b.n > a.n : b.n < a.n) ? b : a));
}

export class Computer {
  private readonly dirs = new Map<string, Collection>();
  private readonly byId = new Map<string, Map<string, Record>>();
  private readonly byName = new Map<string, Map<string, Record>>();
  private readonly memo = new Map<string, RV>();
  private readonly busy = new Set<string>();
  private readonly index = new Map<string, Map<string, Record[]>>();
  /** The fields found reading themselves round, as `path#key`: each gives nothing. */
  readonly round = new Set<string>();
  /** Where the fields of the space's collections and boards are found. */
  readonly schemaOf: SchemaOf;

  constructor(
    collections: readonly Collection[],
    private readonly boards: { readonly [path: string]: Board } = {},
    readonly today = '',
  ) {
    for (const c of collections) this.dirs.set(c.dir, c);
    this.schemaOf = schemasOf([...this.dirs.values()], boards);
  }

  /** The collection at a path, as this Computer has it. */
  collection(dir: string): Collection | undefined {
    return this.dirs.get(dir);
  }

  /** A record's values with every worked-out field of its collection among them. */
  values(dir: string, record: Record): Record['values'] {
    const schema = this.dirs.get(dir)?.schema;
    if (!schema || !schema.fields.some((f) => isComputed(f.type))) return record.values;
    const values = { ...record.values };
    for (const field of schema.fields) if (isComputed(field.type)) values[field.key] = fromRuntime(this.run(dir, record, field, false));
    return values;
  }

  /**
   * The values of a record being written, not saved yet: what it would show with them; its
   * rollups are those of the record it is, by its id (none for a new one).
   */
  draft(dir: string, record: Pick<Record, 'id' | 'name' | 'path'> | null, values: Record['values']): Record['values'] {
    const schema = this.dirs.get(dir)?.schema;
    if (!schema) return values;
    const shown: Record = { id: record?.id ?? '', path: record?.path ?? '', name: record?.name ?? '', code: '', values, extra: {}, body: '' };
    const out = { ...values };
    for (const field of schema.fields) if (isComputed(field.type)) out[field.key] = fromRuntime(this.run(dir, shown, field, true));
    return out;
  }

  /** One field's value for a record. */
  value(dir: string, record: Record, field: Field): FieldValue {
    return fromRuntime(this.run(dir, record, field, false));
  }

  /** A collection with what is worked out among its records' values, for the table to show, sort, group, sum and filter by; the same collection when it has nothing worked out. */
  withValues(dir: string): Collection | undefined {
    const collection = this.dirs.get(dir);
    if (!collection || !collection.schema.fields.some((f) => isComputed(f.type))) return collection;
    return { ...collection, records: collection.records.map((r) => ({ ...r, values: this.values(dir, r) })) };
  }

  /** A card's value for one of its board's fields: a formula and a lookup worked out, the others as the card holds them. */
  cardValue(path: string, card: Card, field: Field): FieldValue {
    return fromRuntime(this.cardRun(path, card, field));
  }

  private readonly shownBy = new Map<string, Map<string, Field>>();

  /** The fields of a collection, or of a board, as the screen shows their values, by key: what is worked out with the type of what it gives (shownField). */
  shown(path: string): Map<string, Field> {
    let shown = this.shownBy.get(path);
    if (!shown) {
      const fields = this.schemaOf(path)?.fields ?? [];
      const scope: Scope = { fields, schemaOf: this.schemaOf };
      shown = new Map(fields.map((f) => [f.key, shownField(f, scope)]));
      this.shownBy.set(path, shown);
    }
    return shown;
  }

  /** The record a link points at, in the collection at `dir`: by its id, or by its name for a link written by hand without one. */
  find(dir: string, link: Pick<Ref, 'id' | 'name'>): Record | undefined {
    const collection = this.dirs.get(dir);
    if (!collection) return undefined;
    let ids = this.byId.get(dir);
    let names = this.byName.get(dir);
    if (!ids || !names) {
      ids = new Map();
      names = new Map();
      for (const r of collection.records) {
        if (r.id) ids.set(r.id, r);
        const name = r.name.trim().toLowerCase();
        if (name && !names.has(name)) names.set(name, r);
      }
      this.byId.set(dir, ids);
      this.byName.set(dir, names);
    }
    return link.id ? ids.get(link.id) : names.get(link.name.trim().toLowerCase());
  }

  private run(dir: string, record: Record, field: Field, draft: boolean): RV {
    if (!isComputed(field.type)) return toRuntime(field, record.values[field.key]);
    const key = `${dir}\u0000${record.id || record.path}\u0000${field.key}`;
    const held = draft ? undefined : this.memo.get(key);
    if (held !== undefined) return held;
    const busy = `${draft ? 'd' : ''}${key}`;
    if (this.busy.has(busy)) {
      this.round.add(`${dir}#${field.key}`);
      return null;
    }
    this.busy.add(busy);
    let value: RV = null;
    try {
      value = this.work(dir, record, field, draft);
    } catch {
      value = null;
    } finally {
      this.busy.delete(busy);
    }
    if (!draft) this.memo.set(key, value);
    return value;
  }

  private env(dir: string, record: Record, draft: boolean): Env {
    const schema = this.dirs.get(dir)?.schema;
    return {
      today: this.today,
      field: (key) => {
        const field = schema?.fields.find((f) => f.key === key);
        return field ? this.run(dir, record, field, draft) : null;
      },
      member: (ref, key) => this.member(ref, key),
    };
  }

  /** A field of a linked record. */
  private member(ref: Ref, key: string): RV {
    const target = this.find(ref.dir, ref);
    const field = this.dirs.get(ref.dir)?.schema.fields.find((f) => f.key === key);
    return target && field ? this.run(ref.dir, target, field, false) : null;
  }

  private work(dir: string, record: Record, field: Field, draft: boolean): RV {
    const schema = this.dirs.get(dir)?.schema;
    if (field.type === 'formula') {
      const node = formulaNode(field.formula ?? '');
      return node ? evaluate(node, this.env(dir, record, draft)) : null;
    }
    if (field.type === 'lookup') {
      const link = schema?.fields.find((f) => f.key === field.lookup?.link && f.type === 'link');
      if (!link || !field.lookup?.field) return null;
      const refs = toRuntime(link, record.values[link.key]);
      if (Array.isArray(refs)) return refs.filter(isRef).map((r) => this.member(r, field.lookup!.field)).flat();
      return isRef(refs) ? this.member(refs, field.lookup.field) : null;
    }
    return this.rollup(dir, record, field);
  }

  private rollup(dir: string, record: Record, field: Field): RV {
    const r = field.rollup;
    if (!r?.from) return null;
    const where = r.where ?? [];
    if (r.from.endsWith(BOARD_EXT)) {
      const board = this.boards[r.from];
      if (!board) return null;
      const fields = board.fields ?? [];
      let cards = linkedCards({ [r.from]: board }, dir, record).map((d) => d.card);
      if (r.open) cards = cards.filter((card) => !isFinished(board, card));
      if (where.length > 0) {
        cards = cards.filter((card) => {
          const values = Object.fromEntries(fields.map((f) => [f.key, this.cardValue(r.from, card, f)]));
          return where.every((c) => matchesCondition({ values }, { fields }, c, this.today));
        });
      }
      if (r.fn === 'count') return cards.length;
      const source = fields.find((f) => f.key === r.field);
      return source ? aggregate(r.fn, cards.map((card) => this.cardRun(r.from, card, source))) : null;
    }
    const collection = this.dirs.get(r.from);
    if (!collection) return null;
    let records = this.linking(collection, dir, record);
    if (where.length > 0) records = records.filter((rec) => where.every((c) => matchesCondition({ values: this.values(collection.dir, rec) }, collection.schema, c, this.today)));
    if (r.fn === 'count') return records.length;
    const source = collection.schema.fields.find((f) => f.key === r.field);
    return source ? aggregate(r.fn, records.map((rec) => this.run(collection.dir, rec, source, false))) : null;
  }

  /** The records of `source` that link to `record` of the collection at `dir`, found through an index made once. */
  private linking(source: Collection, dir: string, record: Pick<Record, 'id' | 'name'>): Record[] {
    const key = `${source.dir}\u0000${dir}`;
    let index = this.index.get(key);
    if (!index) {
      index = new Map();
      const fields = linkFieldsTo(source.schema, dir);
      for (const r of source.records) {
        for (const f of fields) {
          const value = r.values[f.key];
          for (const link of Array.isArray(value) ? value : [value]) {
            if (!isLink(link)) continue;
            const at = link.id ? `#${link.id}` : `@${link.name.trim().toLowerCase()}`;
            const list = index.get(at) ?? [];
            if (!list.includes(r)) list.push(r);
            index.set(at, list);
          }
        }
      }
      this.index.set(key, index);
    }
    const byId = record.id ? (index.get(`#${record.id}`) ?? []) : [];
    const byName = index.get(`@${record.name.trim().toLowerCase()}`) ?? [];
    return byName.length > 0 ? [...new Set([...byId, ...byName])] : byId;
  }

  private cardRun(path: string, card: Card, field: Field): RV {
    const board = this.boards[path];
    if (!board) return null;
    if (field.type !== 'formula' && field.type !== 'lookup') return toRuntime(field, readCardValue(board, card, field, this.today));
    const key = `${path}\u0000${card.id}\u0000${field.key}`;
    const held = this.memo.get(key);
    if (held !== undefined) return held;
    if (this.busy.has(key)) {
      this.round.add(`${path}#${field.key}`);
      return null;
    }
    this.busy.add(key);
    const fields = board.fields ?? [];
    let value: RV = null;
    try {
      if (field.type === 'formula') {
        const node = formulaNode(field.formula ?? '');
        value = node
          ? evaluate(node, {
              today: this.today,
              field: (k) => {
                const f = fields.find((x) => x.key === k);
                return f ? this.cardRun(path, card, f) : null;
              },
              member: (ref, k) => this.member(ref, k),
            })
          : null;
      } else {
        const link = fields.find((f) => f.key === field.lookup?.link && f.type === 'link');
        const refs = link ? toRuntime(link, readCardValue(board, card, link)) : null;
        const shown = field.lookup?.field ?? '';
        value = Array.isArray(refs) ? refs.filter(isRef).map((r) => this.member(r, shown)).flat() : isRef(refs) ? this.member(refs, shown) : null;
      }
    } catch {
      value = null;
    } finally {
      this.busy.delete(key);
    }
    this.memo.set(key, value);
    return value;
  }
}

/** A Computer for a space, with `collection` as it is given, in place of the one the space has at its path. */
export function computerFor(collection: Collection | null, collections: readonly Collection[], boards: { readonly [path: string]: Board }, today: string): Computer {
  return new Computer(collection ? [...collections.filter((c) => c.dir !== collection.dir), collection] : collections, boards, today);
}

/** A collection whose records have what is worked out among their values; the same collection when it has nothing worked out. */
export function withComputed(collection: Collection, collections: readonly Collection[], boards: { readonly [path: string]: Board }, today: string): Collection {
  if (!collection.schema.fields.some((f) => isComputed(f.type))) return collection;
  return computerFor(collection, collections, boards, today).withValues(collection.dir)!;
}

/** The type a kind shows as on screen. */
function typeOfKind(kind: Kind): { type: FieldType; collection?: string; many?: boolean } {
  if (kind === 'number') return { type: 'number' };
  if (kind === 'day') return { type: 'date' };
  if (kind === 'bool') return { type: 'checkbox' };
  if (typeof kind === 'object' && 'record' in kind) return { type: 'link', collection: kind.record };
  if (typeof kind === 'object' && 'list' in kind) {
    const inner = kind.list;
    if (typeof inner === 'object' && 'record' in inner) return { type: 'link', collection: inner.record, many: true };
    return { type: 'multi-select' };
  }
  return { type: 'text' };
}

/**
 * A worked-out field as the screen shows its value: a formula or a rollup with the type of what
 * it gives, a lookup with the type of the field it shows (a choice with its colors). The field
 * itself stays worked out: this is for showing, sorting, grouping and filtering, not for typing.
 */
export function shownField(field: Field, scope: Scope, depth = 0): Field {
  if (!isComputed(field.type)) return field;
  const { required: _required, formula: _formula, rollup: _rollup, lookup: _lookup, ...rest } = field;
  if (field.type === 'lookup') {
    const link = scope.fields.find((f) => f.key === field.lookup?.link && f.type === 'link');
    const target = link?.collection ? scope.schemaOf?.(link.collection) : undefined;
    const shown = target?.fields.find((f) => f.key === field.lookup?.field);
    if (!link || !target || !shown || depth > 8) return { ...rest, type: 'text' };
    const inner = shownField(shown, { ...scope, fields: target.fields }, depth + 1);
    const base: Field = { ...inner, key: field.key, label: field.label };
    delete base.required;
    if (!link.many) return base;
    if (base.type === 'select' || base.type === 'multi-select') return { ...base, type: 'multi-select' };
    if (base.type === 'link') return { ...base, many: true };
    return { key: field.key, label: field.label, type: 'multi-select', options: [] };
  }
  let kind: Kind = 'any';
  try {
    kind = kindOfField(field, scope);
  } catch {
    kind = 'any';
  }
  const shown = typeOfKind(kind);
  return { ...rest, type: shown.type, ...(shown.collection !== undefined && { collection: shown.collection }), ...(shown.many && { many: true }), ...(shown.type === 'multi-select' && { options: [] }) };
}
