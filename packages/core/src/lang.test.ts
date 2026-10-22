import { describe, expect, it } from 'vitest';
import type { Field } from './collection';
import { type Env, evaluate, formulaInfo, fromRuntime, parseExpression, type RV, type Scope, toRuntime } from './lang';

const FIELDS: Field[] = [
  { key: 'name', label: 'Name', type: 'name' },
  { key: 'qty', label: 'Qty', type: 'number' },
  { key: 'price', label: 'Price', type: 'number' },
  { key: 'discount', label: 'Discount', type: 'number' },
  { key: 'start', label: 'Start', type: 'date' },
  { key: 'delivery', label: 'Delivery', type: 'date' },
  { key: 'status', label: 'Status', type: 'select', options: ['Offer', 'Active', 'Done'] },
  { key: 'tags', label: 'Tags', type: 'multi-select', options: [] },
  { key: 'paid', label: 'Paid', type: 'checkbox' },
  { key: 'customer', label: 'Customer', type: 'link', collection: 'S/Companies' },
  { key: 'total', label: 'Total', type: 'formula', formula: 'qty * price' },
  { key: 'a', label: 'A', type: 'formula', formula: 'b + 1' },
  { key: 'b', label: 'B', type: 'formula', formula: 'a + 1' },
];
const COMPANIES: Field[] = [
  { key: 'name', label: 'Name', type: 'name' },
  { key: 'segment', label: 'Segment', type: 'select', options: ['SMB', 'Enterprise'] },
];
const scope: Scope = { fields: FIELDS, schemaOf: (path) => (path === 'S/Companies' ? { fields: COMPANIES } : undefined) };
const VALUES = { name: 'Atakule Tower', qty: 3, price: 10.5, start: '2026-10-08', status: 'Active', tags: ['vip', 'ankara'], paid: true, customer: { id: 'c1', name: 'Ankara Holding' } };

/** Works an expression out over VALUES, the customer being an Enterprise. */
function run(src: string, values: { [key: string]: unknown } = VALUES): unknown {
  const env: Env = {
    today: '2026-10-20',
    field: (key) => {
      const field = FIELDS.find((f) => f.key === key);
      if (!field) return null;
      if (field.type === 'formula') return evaluate(parseExpression(field.formula!), env);
      return toRuntime(field, values[key] as never);
    },
    member: (ref, key): RV => (ref.id === 'c1' && key === 'segment' ? 'Enterprise' : key === 'name' ? ref.name : null),
  };
  return fromRuntime(evaluate(parseExpression(src), env));
}

const problem = (src: string, self?: string) => {
  const info = formulaInfo(src, { ...scope, ...(self && { self }) });
  return 'problem' in info ? info.problem : null;
};

describe('the language', () => {
  it('reads numbers, texts and days with the precedence of JS', () => {
    expect(run('1 + 2 * 3')).toBe(7);
    expect(run('(1 + 2) * 3')).toBe(9);
    expect(run('10 % 4 - -1')).toBe(3);
    expect(run('qty * price')).toBe(31.5);
    expect(run('total + 1')).toBe(32.5);
    expect(run('"PRJ-" + qty')).toBe('PRJ-3');
    expect(run("'it\\'s ' + name")).toBe("it's Atakule Tower");
    expect(run('`${name} survey · ${qty} lifts`')).toBe('Atakule Tower survey · 3 lifts');
    expect(run('start + 3')).toBe('2026-10-11');
    expect(run('start - 1')).toBe('2026-10-07');
    expect(run('today() - start')).toBe(12);
    expect(run('paid * 10')).toBe(10);
  });

  it('compares, chooses and works out to nothing where a part is empty', () => {
    expect(run('qty > 2 ? "many" : "few"')).toBe('many');
    expect(run('qty > 5 ? "many" : qty > 2 ? "some" : "few"')).toBe('some');
    expect(run('status == "Active" && paid')).toBe(true);
    expect(run('status === "Active"')).toBe(true);
    expect(run('status != "Done"')).toBe(true);
    expect(run('!paid')).toBe(false);
    expect(run('discount || 0')).toBe(0);
    expect(run('qty * discount')).toBeNull();
    expect(run('delivery > start')).toBeNull();
    expect(run('empty(delivery)')).toBe(true);
    expect(run('qty / 0')).toBeNull();
    expect(run('customer == "Ankara Holding"')).toBe(true);
    expect(run('customer.segment')).toBe('Enterprise');
    expect(run('customer.segment == "Enterprise" ? 0.1 : 0')).toBe(0.1);
  });

  it('has a few functions', () => {
    expect(run('round(2.345, 2)')).toBe(2.35);
    expect(run('round(qty * price)')).toBe(32);
    expect(run('abs(0 - qty)')).toBe(3);
    expect(run('min(qty, price, 7)')).toBe(3);
    expect(run('max(start, today())')).toBe('2026-10-20');
    expect(run('year(start) + month(start)')).toBe(2036);
    expect(run('contains(tags, "VIP")')).toBe(true);
    expect(run('contains(name, "tower")')).toBe(true);
    expect(run('text(qty) + text(paid)')).toBe('3true');
    expect(run('sum([1, 2, 3.5])')).toBe(6.5);
  });

  it('says what it gives and what it reads', () => {
    expect(formulaInfo('qty > 2 ? "many" : "few"', scope)).toEqual({ kind: 'text', reads: ['qty'] });
    expect(formulaInfo('start + 30', scope)).toEqual({ kind: 'day', reads: ['start'] });
    expect(formulaInfo('delivery - start', scope)).toEqual({ kind: 'number', reads: ['delivery', 'start'] });
    expect(formulaInfo('customer.segment', scope)).toEqual({ kind: 'text', reads: ['customer'] });
    expect(formulaInfo('total * 2', scope)).toEqual({ kind: 'number', reads: ['total'] });
  });

  it('says what is wrong, where it is typed', () => {
    expect(problem('')).toBe('Type a formula.');
    expect(problem('qty *')).toBe('This is not a formula yet.');
    expect(problem('qty * (price')).toBe('This is not a formula yet.');
    expect(problem('qty # 2')).toBe('# is not expected here.');
    expect(problem('"open')).toBe('A text is not closed: a quote or a ` is missing.');
    expect(problem('status = "Done"')).toBe('Write == to compare; a formula does not set a value.');
    expect(problem('if(qty > 2, 1, 0)')).toBe('There is no if(); write condition ? then : else.');
    expect(problem('quarter(start)')).toBe('There is no function quarter().');
    expect(problem('weekday(start)')).toBeNull();
    expect(problem('round()')).toBe('round() takes one or two values.');
    expect(problem('me()')).toBe('me() cannot be in a formula: what it gives depends on who looks.');
    expect(problem('price - status')).toBe('status is a choice, not a number; - takes numbers or days.');
    expect(problem('qty * tags')).toBe('tags is a list of choices, not a number; * takes numbers.');
    expect(problem('start + start')).toBe('Two days cannot be added; take one from the other for the days between them.');
    expect(problem('status == 1')).toBe('Cannot compare a text with a number.');
    expect(problem('qty > 2 ? 1 : "few"')).toBe('The two sides of ? : give a number and a text; they should give one kind.');
    expect(problem('qty.segment')).toBe('qty is a number, not a link; a dot reads a field of a linked record.');
    expect(problem('customer.size')).toBe('customer links to records with no field with the key size.');
    expect(problem('nothing + 1')).toBe('There is no field with the key nothing.');
    expect(problem('total * 2', 'total')).toBe('A formula cannot use itself.');
    expect(problem('a * 2', 'b')).toBe('This goes round: b → a → b.');
    expect(problem('1 + '.repeat(600) + '1')).toBe('A formula has 2,000 characters at most.');
    expect(problem('('.repeat(40) + '1' + ')'.repeat(40))).toBe('Too many brackets inside each other.');
  });
});
