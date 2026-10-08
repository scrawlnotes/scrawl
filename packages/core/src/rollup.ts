import { BOARD_EXT, type Board, cardValue, isFinished, linkedCards } from './board';
import { type Collection, type Field, type FieldValue, fieldValueOf, linkedRecords, type Record, type RollupFn } from './collection';

// Rollups: values of a record worked out from what links to it, the records of another
// collection or the cards of a board, as a company's last contact is the latest day of its
// activities. They are shown and never written; the table works them out before it sorts,
// groups and sums. See PLAN.md 4.6.

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** What a rollup makes of the values it found: their sum, or their most or least, numbers before days. */
function aggregate(fn: RollupFn, values: (FieldValue | undefined)[]): number | string | null {
  const numbers = values.filter((v): v is number => typeof v === 'number');
  if (fn === 'sum') return numbers.length > 0 ? numbers.reduce((sum, n) => sum + n, 0) : null;
  if (numbers.length > 0) return fn === 'max' ? Math.max(...numbers) : Math.min(...numbers);
  const days = values.filter((v): v is string => typeof v === 'string' && DAY.test(v)).sort();
  if (days.length === 0) return null;
  return fn === 'max' ? days[days.length - 1]! : days[0]!;
}

/**
 * A record's value for a rollup field: what links to `record` of the collection at `dir`, from
 * the collection or the board the rollup names, counted, or its field added up or taken at its
 * most or least. Null when there is nothing to work it out from.
 */
export function rollupValue(
  field: Field,
  dir: string,
  record: Pick<Record, 'id' | 'name'>,
  collections: Collection[],
  boards: { [path: string]: Board },
  today: string,
): number | string | null {
  const rollup = field.rollup;
  if (!rollup?.from) return null;
  if (rollup.from.endsWith(BOARD_EXT)) {
    const board = boards[rollup.from];
    if (!board) return null;
    let cards = linkedCards({ [rollup.from]: board }, dir, record).map((d) => d.card);
    if (rollup.open) cards = cards.filter((card) => !isFinished(board, card));
    if (rollup.fn === 'count') return cards.length;
    const source = board.fields?.find((f) => f.key === rollup.field);
    return source ? aggregate(rollup.fn, cards.map((card) => cardValue(board, card, source, today))) : null;
  }
  const collection = collections.find((c) => c.dir === rollup.from);
  if (!collection) return null;
  const records = linkedRecords(collection, dir, record);
  if (rollup.fn === 'count') return records.length;
  const source = collection.schema.fields.find((f) => f.key === rollup.field);
  return source ? aggregate(rollup.fn, records.map((r) => fieldValueOf(r, source, collection.schema, today))) : null;
}

/** A record's values with its rollups worked out among them. */
export function rolledValues(record: Record, collection: Collection, collections: Collection[], boards: { [path: string]: Board }, today: string): Record['values'] {
  let values = record.values;
  for (const field of collection.schema.fields) {
    if (field.type !== 'rollup') continue;
    const value = rollupValue(field, collection.dir, record, collections, boards, today);
    values = { ...values, [field.key]: value };
  }
  return values;
}

/** A collection whose records have their rollups worked out, for the table to show, sort, group, sum and filter by; the same collection without any. */
export function withRollups(collection: Collection, collections: Collection[], boards: { [path: string]: Board }, today: string): Collection {
  if (!collection.schema.fields.some((f) => f.type === 'rollup')) return collection;
  return { ...collection, records: collection.records.map((record) => ({ ...record, values: rolledValues(record, collection, collections, boards, today) })) };
}
