import type { Board } from './board';
import type { Collection, Field, FieldValue, Record } from './collection';
import { Computer, withComputed } from './compute';

// Rollups: values of a record worked out from what links to it, the records of another
// collection or the cards of a board, as a company's last contact is the latest day of its
// activities. They are shown and never written; a Computer (compute.ts) works them out with the
// formulas and lookups they may read. These are the ways in from before there was one.

/** The collections as a Computer is given them: `collection` as it is, in its place among the others. */
const withOwn = (collection: Collection, collections: readonly Collection[]) => [...collections.filter((c) => c.dir !== collection.dir), collection];

/** A record's value for a rollup field. */
export function rollupValue(field: Field, dir: string, record: Record, collections: Collection[], boards: { [path: string]: Board }, today: string): FieldValue {
  return new Computer(collections, boards, today).value(dir, record, field);
}

/** A record's values with what is worked out among them: rollups, formulas, lookups. */
export function rolledValues(record: Record, collection: Collection, collections: Collection[], boards: { [path: string]: Board }, today: string): Record['values'] {
  return new Computer(withOwn(collection, collections), boards, today).values(collection.dir, record);
}

/** A collection whose records have what is worked out among their values. */
export function withRollups(collection: Collection, collections: Collection[], boards: { [path: string]: Board }, today: string): Collection {
  return withComputed(collection, collections, boards, today);
}
