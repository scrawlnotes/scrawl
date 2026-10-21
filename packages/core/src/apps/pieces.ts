import type { Condition, Field, NumberFormat, OptionColor, Rollup } from '../collection';
import type { AppDraft } from './types';

// The pieces an app is made of, by role: what each is called when it is set up and what one of
// its records is; and the fields the templates build them from.

export interface PieceInfo {
  kind: 'collection' | 'board' | 'folder';
  name: string;
  singular?: string;
  /** What it holds, as the About note says it. */
  about: string;
}

export const PIECES: { [role: string]: PieceInfo } = {
  companies: { kind: 'collection', name: 'Companies', singular: 'company', about: 'the companies you work with.' },
  people: { kind: 'collection', name: 'People', singular: 'person', about: 'the people you talk to.' },
  activities: { kind: 'collection', name: 'Activities', singular: 'activity', about: 'every call, meeting, email and note, with its day.' },
  deals: { kind: 'board', name: 'Deals', about: 'the deals on their way, a card each, by stage.' },
  products: { kind: 'collection', name: 'Products', singular: 'product', about: 'what you sell or keep, with its price.' },
  orders: { kind: 'collection', name: 'Orders', singular: 'order', about: 'each order and its customer, with its total and what is left to collect.' },
  'order-lines': { kind: 'collection', name: 'Order lines', singular: 'line', about: 'what each order is for: a product, its quantity and its price.' },
  payments: { kind: 'collection', name: 'Payments', singular: 'payment', about: 'the money coming in and going out.' },
  requests: { kind: 'board', name: 'Requests', about: 'each request from a customer, a card each, until it is closed.' },
  feedback: { kind: 'collection', name: 'Feedback', singular: 'feedback', about: 'what customers tell you about the product.' },
  'saved-replies': { kind: 'folder', name: 'Saved replies', about: 'answers to what customers often ask, a note each.' },
  projects: { kind: 'collection', name: 'Projects', singular: 'project', about: 'each project, its dates and how far it is.' },
  work: { kind: 'board', name: 'Work', about: 'the work on the projects, a card each.' },
  'time-entries': { kind: 'collection', name: 'Time entries', singular: 'time entry', about: 'the hours spent on each project.' },
  'budget-lines': { kind: 'collection', name: 'Budget lines', singular: 'budget line', about: 'what you plan to earn and spend, and what was paid.' },
  expenses: { kind: 'collection', name: 'Expenses', singular: 'expense', about: 'what people spent and are to be paid back for.' },
  'stock-movements': { kind: 'collection', name: 'Stock movements', singular: 'movement', about: 'every move of stock in and out.' },
  locations: { kind: 'collection', name: 'Locations', singular: 'location', about: 'your warehouses, offices and other places.' },
  'stock-levels': { kind: 'collection', name: 'Stock levels', singular: 'stock level', about: 'what is in each warehouse, a product each.' },
  'purchase-orders': { kind: 'collection', name: 'Purchase orders', singular: 'purchase order', about: 'what you order from suppliers.' },
  'purchase-order-lines': { kind: 'collection', name: 'Purchase order lines', singular: 'line', about: 'what each purchase order is for.' },
  roadmap: { kind: 'board', name: 'Roadmap', about: 'the work on the product, a card each, from idea to done.' },
  bugs: { kind: 'board', name: 'Bugs', about: 'the bugs found, a card each.' },
  releases: { kind: 'collection', name: 'Releases', singular: 'release', about: 'each release, its day and its notes.' },
  positions: { kind: 'collection', name: 'Positions', singular: 'position', about: 'the jobs you are hiring for, and how many people each needs.' },
  candidates: { kind: 'collection', name: 'Candidates', singular: 'candidate', about: 'the people who applied, with their CV in their notes.' },
  hiring: { kind: 'board', name: 'Hiring', about: 'each candidate for a position, a card each, by stage.' },
  interviews: { kind: 'collection', name: 'Interviews', singular: 'interview', about: 'each interview, who held it and what they thought.' },
  assets: { kind: 'collection', name: 'Assets', singular: 'asset', about: 'what the company owns, who has it and where it is.' },
  maintenance: { kind: 'collection', name: 'Maintenance', singular: 'maintenance', about: 'every service, repair and check, with its cost.' },
  content: { kind: 'board', name: 'Content', about: 'what you will publish, a card each, by stage; its due day is the day it goes out.' },
  campaigns: { kind: 'collection', name: 'Campaigns', singular: 'campaign', about: 'each campaign, its dates and what is published in it.' },
};

/** The roles, in the order the pieces are listed: by template, the shared ones first where they are first used. */
export const ROLES = Object.keys(PIECES);

// ---------- fields ----------

type Colors = { [option: string]: OptionColor };

export const nameField = (label = 'Name'): Field => ({ key: 'name', label, type: 'name' });
export const codeField = (prefix: string): Field => ({ key: 'code', label: 'Code', type: 'code', default: `=next("${prefix}", 4)` });
export const text = (key: string, label: string): Field => ({ key, label, type: 'text' });
export const number = (key: string, label: string, extra: Partial<Field> = {}): Field => ({ key, label, type: 'number', ...extra });
export const day = (key: string, label: string, today = false): Field => ({ key, label, type: 'date', ...(today && { default: '=today()' }) });
export const checkbox = (key: string, label: string, on?: boolean): Field => ({ key, label, type: 'checkbox', ...(on !== undefined && { default: on }) });
export const person = (key: string, label: string, me = false): Field => ({ key, label, type: 'person', ...(me && { default: '=me()' }) });
export const link = (key: string, label: string, collection: string, many = false): Field => ({ key, label, type: 'link', collection, ...(many && { many: true }) });

/** A choice, its options colored as they go: what goes well green, what is lost red, what waits gray or blue. */
export function select(key: string, label: string, options: string[], colors: Colors = {}, start?: string): Field {
  const own = Object.fromEntries(options.filter((o) => colors[o]).map((o) => [o, colors[o]!]));
  return { key, label, type: 'select', options, ...(Object.keys(own).length > 0 && { colors: own }), ...(start !== undefined && { default: start }) };
}

export function multi(key: string, label: string, options: string[], colors: Colors = {}): Field {
  const own = Object.fromEntries(options.filter((o) => colors[o]).map((o) => [o, colors[o]!]));
  return { key, label, type: 'multi-select', options, ...(Object.keys(own).length > 0 && { colors: own }) };
}

export const formula = (key: string, label: string, expr: string, format?: NumberFormat): Field => ({ key, label, type: 'formula', formula: expr, ...(format && { format }) });

export function rollup(key: string, label: string, from: string, fn: Rollup['fn'], field?: string, where?: Condition[], format?: NumberFormat): Field {
  return { key, label, type: 'rollup', rollup: { from, fn, ...(field && { field }), ...(where?.length && { where }) }, ...(format && { format }) };
}

/** A rollup of a board's open cards. */
export const openCards = (key: string, label: string, from: string): Field => ({ key, label, type: 'rollup', rollup: { from, fn: 'count', open: true } });

export const PERCENT: NumberFormat = { style: 'percent' };

/** The record's own currency, with more than one in the app: a choice of them, the main one first. */
export const currencyField = (app: AppDraft): Field =>
  select(
    'currency',
    'Currency',
    app.money.currencies,
    Object.fromEntries(app.money.currencies.map((c) => [c, 'gray' as const])),
    app.money.main,
  );

/** A rollup's condition keeping money to the main currency, where the records it adds up hold their own: a budget is in one. */
export const inMain = (app: AppDraft): Condition[] => (app.money.multi ? [{ field: 'currency', op: 'is', value: [app.money.main] }] : []);

/** A field's key and label as a statement's object: `{ name: "x" }`; a rule writes `"x"` as JSON does. */
export const quoted = (value: string) => JSON.stringify(value);
