import type { CalendarSettings, Condition, Field, NumberFormat, OptionColor, Rollup, View } from '../collection';
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
  appointments: { kind: 'collection', name: 'Appointments', singular: 'appointment', about: 'each appointment or booking: for whom, when, with whom, and how it stands.' },
  services: { kind: 'collection', name: 'Services', singular: 'service', about: 'what you give an appointment for, with how long it takes.' },
  staff: { kind: 'collection', name: 'Staff', singular: 'person', about: 'who takes the appointments, with their hours and days.' },
  resources: { kind: 'collection', name: 'Resources', singular: 'resource', about: 'the rooms, tables and things that are booked.' },
  channels: { kind: 'collection', name: 'Channels', singular: 'channel', about: 'where you sell: each marketplace and your own site, with its commission and when it pays.' },
  returns: { kind: 'collection', name: 'Returns', singular: 'return', about: 'what came back from an order, why, and whether it was refunded.' },
  plans: { kind: 'collection', name: 'Plans', singular: 'plan', about: 'what you sell by the month or the year, with its price.' },
  subscriptions: { kind: 'collection', name: 'Subscriptions', singular: 'subscription', about: 'who is on which plan, from when, and when it renews.' },
  contracts: { kind: 'collection', name: 'Contracts', singular: 'contract', about: 'each contract: with whom, from when to when, and by when to give notice.' },
  employees: { kind: 'collection', name: 'Employees', singular: 'employee', about: 'your people: their team, their manager, and the leave they have left.' },
  'leave-requests': { kind: 'collection', name: 'Leave requests', singular: 'leave request', about: 'each leave asked for: who, what kind, from when to when, and whether it is approved.' },
  holidays: { kind: 'collection', name: 'Holidays', singular: 'holiday', about: 'the public holidays and the days the company is closed; leave is counted without them.' },
  goals: { kind: 'collection', name: 'Goals', singular: 'goal', about: 'each goal of the period: whose it is, by when, and how far it is.' },
  'key-results': { kind: 'collection', name: 'Key results', singular: 'key result', about: 'what measures each goal: where it started, where it should get, and where it is.' },
  'check-ins': { kind: 'collection', name: 'Check-ins', singular: 'check-in', about: 'each update of a key result: its value on a day, and a note.' },
  incidents: { kind: 'collection', name: 'Incidents', singular: 'incident', about: 'each incident: what happened, how bad, from when to when, why, and what was done.' },
  actions: { kind: 'board', name: 'Actions', about: 'what is done so that it does not happen again, a card each, with whom and by when.' },
  equipment: { kind: 'collection', name: 'Equipment', singular: 'unit', about: "what you look after at your customers' sites: where it is, what it is, and when it is serviced next." },
  'work-orders': { kind: 'collection', name: 'Work orders', singular: 'work order', about: "each job at a customer's site: what it is, who goes when, the parts used, and what was done." },
  'work-order-lines': { kind: 'collection', name: 'Work order lines', singular: 'line', about: 'the parts used on each job, and what they cost.' },
  technicians: { kind: 'collection', name: 'Technicians', singular: 'technician', about: 'who goes out on the jobs, with their hours and days.' },
  engagements: { kind: 'collection', name: 'Engagements', singular: 'engagement', about: 'each piece of work for a client: how it is paid, its budget, its dates, and how much of it is used.' },
  deliverables: { kind: 'collection', name: 'Deliverables', singular: 'deliverable', about: 'what is delivered for each engagement, by whom and by when.' },
  deadlines: { kind: 'collection', name: 'Deadlines', singular: 'deadline', about: 'what is due for each client again and again, a return, a filing or a report, and when.' },
  members: { kind: 'collection', name: 'Members', singular: 'member', about: 'the members: their kind of membership, since when, how they stand, and their dues.' },
  'dues-periods': { kind: 'collection', name: 'Dues periods', singular: 'period', about: 'each period dues are asked for, with how much and by when.' },
  dues: { kind: 'collection', name: 'Dues', singular: 'due', about: 'what each member owes for each period, and whether it is paid.' },
  donations: { kind: 'collection', name: 'Donations', singular: 'donation', about: 'each gift: from whom, how much, when, and for which campaign.' },
  accounts: { kind: 'collection', name: 'Accounts', singular: 'account', about: 'your bank accounts, cards and cash, with what is in each.' },
  transactions: { kind: 'collection', name: 'Transactions', singular: 'transaction', about: 'every bit of money in and out, with its account and its category.' },
  categories: { kind: 'collection', name: 'Categories', singular: 'category', about: 'what you spend on, each with its limit for the month and what is spent this month.' },
  bills: { kind: 'collection', name: 'Bills', singular: 'bill', about: 'the bills and subscriptions you pay again and again, and when each is due next.' },
  items: { kind: 'collection', name: 'Items', singular: 'item', about: 'the things you own: where they are, what they cost, and until when their warranty runs.' },
  documents: { kind: 'collection', name: 'Documents', singular: 'document', about: 'your ID, passport, licence and policies, with when each runs out.' },
  vehicles: { kind: 'collection', name: 'Vehicles', singular: 'vehicle', about: 'your car or another vehicle, with its inspection, insurance and service days.' },
  upkeep: { kind: 'collection', name: 'Home upkeep', singular: 'job', about: 'what is done at home again and again, the boiler, the filters, and when it is next.' },
  visits: { kind: 'collection', name: 'Appointments', singular: 'appointment', about: 'your appointments with doctors: whom, where and when.' },
  medications: { kind: 'collection', name: 'Medications', singular: 'medication', about: 'what is taken, how much and when, and when to get more.' },
  results: { kind: 'collection', name: 'Results', singular: 'result', about: 'test results, with their papers in their notes.' },
  vaccinations: { kind: 'collection', name: 'Vaccinations', singular: 'vaccination', about: 'each vaccination, and when the next one is due.' },
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

/** A date field that holds a time too, when one is given; with none it is all day. */
export const dayAndTime = (key: string, label: string, today = false): Field => ({ ...day(key, label, today), time: true });

/** A template's Calendar view (design/calendar.md 5): by a date field, its records those of the conditions. */
export const calendar = (settings: Omit<CalendarSettings, 'upcoming'> & { upcoming?: boolean }, conditions: Condition[] = []): View => ({
  id: 'calendar',
  name: 'Calendar',
  kind: 'calendar',
  calendar: { ...settings, upcoming: settings.upcoming ?? false },
  conditions,
});
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
