import type { Condition, LinkedBlock } from '../../collection';
import { calendar, checkbox, codeField, currencyField, day, formula, link, nameField, number, person, rollup, select, symbolOf } from '../pieces';
import { companies, hasServices, locations, products } from '../shared';
import type { AppDraft, AppTemplate } from '../types';
import { lineFormat } from './sales';

// Stock and purchasing (design/scrawl-apps.md 3.6), as inFlow, Zoho Inventory and Sortly keep it:
// stock is never typed, it is worked out from the movements. A product says what is in stock, what
// orders hold of it, what is left to sell and what is on its way; Adjust writes a count and why,
// Reorder adds it to its supplier's draft order, Reorder all does so for every low product; a count
// lists every product to be counted and Apply writes what differs; Receive asks what came of each
// line, the rest left on its way.

const LOCATIONS = ['Main warehouse', 'Second warehouse'];
const REASONS = ['Count', 'Damaged', 'Lost', 'Found', 'Other'];

/** The statuses of an order its stock goes out at, by the answer. */
const OUT_AT: { [answer: string]: string[] } = { confirmed: ['Confirmed', 'Packed', 'Shipped', 'Delivered', 'Invoiced', 'Paid'], delivered: ['Delivered', 'Invoiced', 'Paid'] };
/** The statuses of an order that hold its products before they go out. */
const HELD = ['Confirmed', 'Packed', 'Shipped'];

/** What adds a movement in a rule, in a warehouse of its own: its stock level, found or added, goes with it. */
export function movement(app: AppDraft, indent: string, values: string, product: string, location: string | null): string {
  const moves = app.called('stock-movements');
  if (!location) return `${indent}add("${moves}", { ${values} })`;
  const levels = app.called('stock-levels');
  return [
    `${indent}let level = find("${levels}", { product: ${product}, location: ${location} })[0]`,
    `${indent}if (empty(level)) level = add("${levels}", { name: ${product}.name + " · " + ${location}.name, product: ${product}, location: ${location} })`,
    `${indent}add("${moves}", { ${values}, location: ${location}, level: level })`,
  ].join('\n');
}

/** A stock count: in, out and what is left, from the movements that link to the record by `link`. */
function counts(app: AppDraft, role: string) {
  const moves = app.path('stock-movements');
  app.field(role, rollup('stock_in', 'In', moves, 'sum', 'quantity', [{ field: 'direction', op: 'is', value: ['In'] }]));
  app.field(role, rollup('stock_out', 'Out', moves, 'sum', 'quantity', [{ field: 'direction', op: 'is', value: ['Out'] }]));
  app.field(role, formula('stock', 'In stock', 'stock_in - stock_out'));
}

/** A day a purchase order says: "today", "2 days late", "Nov 3". */
const arrives = (d: string) =>
  `empty(${d}) ? "" : ${d} < today() ? text(today() - ${d}) + (today() - ${d} == 1 ? " day late" : " days late") : ${d} == today() ? "today" : monthname(${d}) + " " + text(monthday(${d}))`;

export const stock: AppTemplate = {
  id: 'stock',
  version: 2,
  group: 'money',
  name: 'apps.stock.name',
  short: 'apps.stock.short',
  icon: 'table',
  what: 'apps.stock.what',
  questions: [
    { key: 'purchasing', kind: 'yesno', label: 'apps.stock.purchasing', default: true },
    { key: 'locations', kind: 'yesno', label: 'apps.stock.locations', default: false },
    {
      key: 'locationList',
      kind: 'list',
      label: 'apps.stock.locationList',
      default: LOCATIONS,
      when: ({ answers }) => answers.locations === true,
      under: 'locations',
      help: 'apps.stock.locationListHelp',
      add: 'apps.stock.addLocation',
      hints: (items) => items.map((_, i) => (i === 0 ? 'apps.hint.default' : null)),
    },
    {
      key: 'deduct',
      kind: 'choice',
      label: 'apps.stock.deduct',
      options: [
        { value: 'no', label: 'apps.stock.deduct.no' },
        { value: 'confirmed', label: 'apps.stock.deduct.confirmed' },
        { value: 'delivered', label: 'apps.stock.deduct.delivered' },
      ],
      default: 'delivered',
      when: ({ chosen }) => chosen.has('sales'),
      because: 'sales',
    },
    { key: 'payables', kind: 'yesno', label: 'apps.stock.payables', default: true, when: ({ chosen, answers }) => chosen.has('budget') && answers.purchasing !== false, because: 'budget' },
  ],
  money: () => true,
  pieces: (answers) => [
    'products',
    'companies',
    'stock-movements',
    'stock-counts',
    'count-lines',
    ...(answers.purchasing !== false ? ['purchase-orders', 'purchase-order-lines'] : []),
    ...(answers.locations === true ? ['locations', 'stock-levels'] : []),
  ],
  menu: [{ role: 'products', view: 'all', name: 'Products' }, 'purchase-orders', 'stock-counts', 'locations', 'companies'],
  build(app, answers) {
    const buying = answers.purchasing !== false;
    const places = answers.locations === true;
    const main = app.format(false);
    const moves = app.path('stock-movements');
    const services = hasServices(app);
    const sym = JSON.stringify(symbolOf(app.money.main));
    const money = (expr: string) => `${sym} + amount(${expr})`;
    const selling = app.has('sales') && app.hasPiece('order-lines');
    // The warehouse a movement, an order or a purchase order is in when none is given.
    const mainPlace = places ? `find("${app.called('locations')}", { is_default: true })[0]` : '';
    const atMain = (role: string) =>
      app.rule(role, { kind: 'onSave', name: 'Default location', src: `onSave("Default location", () => {\n  if (empty(location)) location = ${mainPlace}\n})` });
    companies(app);
    products(app);

    // A product: what it costs, its supplier, when to order and how many; its four numbers, inFlow's.
    app.field('products', number('cost', 'Cost', { format: main }));
    app.field('products', link('supplier', 'Supplier', app.path('companies')));
    app.field('products', number('reorder_level', 'Reorder at'));
    app.field('products', { ...number('reorder_qty', 'Reorder quantity'), help: 'Left empty, as many as bring it to Reorder at' });
    counts(app, 'products');
    if (selling) {
      app.field('order-lines', { key: 'order_status', label: 'Order status', type: 'lookup', lookup: { link: 'order', field: 'status' } });
      app.field('products', rollup('committed', 'Committed', app.path('order-lines'), 'sum', 'quantity', [{ field: 'order_status', op: 'is', value: HELD }]));
    } else app.field('products', formula('committed', 'Committed', '0'));
    app.field('products', formula('available', 'Available', 'stock - committed'));
    if (buying) app.field('products', rollup('on_order', 'On order', app.path('purchase-order-lines'), 'sum', 'to_come', [{ field: 'po_status', op: 'is', value: ['Ordered', 'Partially received'] }]));
    else app.field('products', formula('on_order', 'On order', '0'));
    app.field('products', formula('stock_value', 'Stock value', 'stock * cost', main));
    // Low reads what is left to sell and what is on its way: one already ordered is not low.
    const service = services ? 'type == "service" ? "" : ' : '';
    app.field('products', { ...formula('stock_status', 'Stock', `${service}stock <= 0 && available + on_order < max(1, reorder_level) ? "Out" : !empty(reorder_level) && available + on_order < reorder_level ? "Low" : ""`), colors: { Low: 'orange', Out: 'red' } });
    // Its window's line, once it has moved: "38 in stock · 6 committed · 32 available · 20 on order".
    app.field('products', formula('stock_said', 'Says', `${service}stock_in + stock_out + on_order == 0 ? "" : text(stock) + " in stock" + (committed > 0 ? " · " + text(committed) + " committed · " + text(available) + " available" : "") + (on_order > 0 ? " · " + text(on_order) + " on order" : "")`));
    app.field('products', formula('low_said', 'Low', `stock <= 0 ? "out" + (on_order > 0 ? " · " + text(on_order) + " on order" : "") : text(available) + " · reorder at " + text(reorder_level)`));
    app.head('products', 'stock_said');
    app.formOrder('products', ['name', 'code', ...(services ? ['type'] : []), 'unit', 'price', 'cost', 'supplier', 'reorder_level', 'reorder_qty']);
    app.newForm('products', ['code', ...(services ? ['type'] : []), 'unit', 'price', 'cost', 'supplier', 'reorder_level']);
    const low: Condition = { field: 'stock_status', op: 'is', value: ['Low', 'Out'] };
    const columns = ['code', 'stock', 'available', 'on_order', 'reorder_level', 'stock_status'];
    const sums = [{ label: 'products', one: 'product' }, { label: 'in stock', field: 'stock_value' }, { label: 'low', conditions: [low], warn: true as const }];
    app.view('products', { id: 'all', name: 'All', conditions: [], sort: { key: 'name', dir: 'asc' }, columns, sums, set: 'stock' }, true);
    app.view('products', { id: 'low', name: 'Low stock', conditions: [low], sort: { key: 'name', dir: 'asc' }, columns, sums, set: 'stock', ...(buying && { all: 'Reorder' }) });
    app.homeTile('products', { off: true });
    app.homeTiles('products', [
      { view: 'low', title: 'Low stock', head: [{ label: 'products', one: 'product' }], value: 'low_said', empty: 'Nothing is low.' },
      { view: 'all', title: 'In stock', head: [{ label: 'products', one: 'product' }], lines: [{ label: 'Stock value', field: 'stock_value' }, { label: 'Committed', field: 'committed_value' }, { label: 'On order', field: 'on_order_value' }] },
    ]);
    app.field('products', formula('committed_value', 'Committed value', 'committed * cost', main));
    app.field('products', formula('on_order_value', 'On order value', 'on_order * cost', main));

    // A movement: what moved, which way and why; said day by day on its product.
    app.field('stock-movements', { ...nameField('What'), optional: true });
    app.field('stock-movements', link('product', 'Product', app.path('products')));
    app.field('stock-movements', select('direction', 'Direction', ['In', 'Out'], { In: 'green', Out: 'red' }, 'In'));
    app.field('stock-movements', select('type', 'Type', ['purchase', 'sale', 'use', 'return', 'adjustment', 'transfer'], { purchase: 'green', sale: 'blue', use: 'orange', return: 'purple', adjustment: 'gray', transfer: 'teal' }));
    app.field('stock-movements', select('reason', 'Why', REASONS));
    app.field('stock-movements', { ...number('quantity', 'Quantity'), required: true });
    app.field('stock-movements', day('date', 'Date', true));
    app.field('stock-movements', person('by', 'By', true));
    app.field('stock-movements', formula('said', 'Says', `(direction == "In" ? "+" : "−") + text(quantity)${places ? ' + (empty(location) ? "" : " · " + location.name)' : ''}`));
    app.rule('stock-movements', {
      kind: 'onSave',
      name: 'Its name',
      src: `onSave("Its name", () => {
  if (empty(name)) name = (type == "purchase" ? "Purchase" : type == "sale" ? "Sale" : type == "return" ? "Return" : type == "transfer" ? "Transfer" : type == "use" ? "Use" : "Adjust") + (type == "adjustment" && !empty(reason) ? " · " + reason : "")${buying ? ' + (!empty(purchase_order) ? " · " + purchase_order.code : "")' : ''}${selling ? ' + (!empty(order) ? " · " + order.code : "")' : ''}
})`,
    });
    const history: LinkedBlock = { block: 'linked', collection: moves, look: 'days', title: 'Movements', time: 'date', icon: 'direction', icons: { In: '↓', Out: '↑' }, sub: 'said', sort: 'date', dir: 'desc', lines: false };
    app.block('products', { block: 'actions', column: 1 });
    app.block('products', { ...history, column: 2 });

    // Adjust, Sortly's and inFlow's: the total counted and why; the difference is the movement.
    const level = (product: string, place: string) => `find("${app.called('stock-levels')}", { product: ${product}, location: ${place} })[0]`;
    const here = places ? `(empty(${level('this', 'input.location')}) ? 0 : ${level('this', 'input.location')}.stock)` : 'stock';
    app.rule('products', {
      kind: 'action',
      name: 'Adjust',
      src: `action("Adjust", {
  when: () => ${services ? 'type != "service"' : 'true'},
  ask: {
    counted: { label: "Counted", type: "number", default: () => stock, required: true, note: () => "Now " + text(${here}) + (input.counted < ${here} ? " · " + text(${here} - input.counted) + " less" : input.counted > ${here} ? " · " + text(input.counted - ${here}) + " more" : "") },${places ? `
    location: { label: "Location", type: "link", collection: "${app.called('locations')}", default: () => ${mainPlace} },` : ''}
    reason: { label: "Why", type: "choice", options: ${JSON.stringify(REASONS)}, chips: true, default: "Count" },
  },
  done: () => name + " adjusted",
}, () => {
  const diff = input.counted - ${here}
  if (diff != 0) {
${movement(app, '    ', 'product: this, direction: diff > 0 ? "In" : "Out", type: "adjustment", reason: input.reason, quantity: abs(diff)', 'this', places ? 'input.location' : null)}
  }
})`,
    });

    if (places) {
      locations(app);
      app.field('locations', checkbox('is_default', 'Default'));
      ((answers.locationList as string[] | undefined) ?? LOCATIONS).forEach((name, i) => app.record('locations', { name, ...(i === 0 && { is_default: true }) }));
      app.block('locations', { block: 'linked', collection: app.path('stock-levels'), style: 'list', fields: ['stock'], lines: false });

      app.field('stock-levels', nameField());
      app.field('stock-levels', link('product', 'Product', app.path('products')));
      app.field('stock-levels', link('location', 'Location', app.path('locations')));
      counts(app, 'stock-levels');
      app.block('stock-levels', { ...history });
      app.block('products', { block: 'linked', collection: app.path('stock-levels'), style: 'list', title: 'By location', fields: ['stock'], lines: false, column: 2 });

      app.field('stock-movements', link('location', 'Location', app.path('locations')));
      app.field('stock-movements', link('level', 'Stock level', app.path('stock-levels')));
      app.rule('stock-movements', {
        kind: 'onSave',
        name: 'Stock level',
        src: `onSave("Stock level", () => {
  if (empty(location)) location = ${mainPlace}
  if (empty(level) && !empty(product) && !empty(location)) {
    const found = find("${app.called('stock-levels')}", { product: product, location: location })
    if (found.length > 0) level = found[0]
    else level = add("${app.called('stock-levels')}", { name: product.name + " · " + location.name, product: product, location: location })
  }
})`,
      });
      app.rule('products', {
        kind: 'action',
        name: 'Transfer',
        src: `action("Transfer", {
  ask: {
    quantity: { label: "Quantity", type: "number", required: true },
    from: { label: "From", type: "link", collection: "${app.called('locations')}", default: () => ${mainPlace}, required: true },
    to: { label: "To", type: "link", collection: "${app.called('locations')}", required: true },
  },
  done: () => name + " moved",
}, () => {
${movement(app, '  ', 'product: this, direction: "Out", type: "transfer", quantity: input.quantity', 'this', 'input.from')}
  let into = find("${app.called('stock-levels')}", { product: this, location: input.to })[0]
  if (empty(into)) into = add("${app.called('stock-levels')}", { name: name + " · " + input.to.name, product: this, location: input.to })
  add("${app.called('stock-movements')}", { product: this, direction: "In", type: "transfer", quantity: input.quantity, location: input.to, level: into })
})`,
      });
    }

    // A count, Sortly's and Katana's: every product a line with what there is; what is counted is
    // typed in the table; Apply writes what differs, a line left empty as it is.
    app.field('stock-counts', { ...nameField(), optional: true });
    app.field('stock-counts', codeField('CNT-'));
    if (places) app.field('stock-counts', link('location', 'Location', app.path('locations')));
    app.field('stock-counts', day('date', 'Date', true));
    app.field('stock-counts', person('by', 'By', true));
    app.field('stock-counts', select('status', 'Status', ['Counting', 'Applied'], { Counting: 'blue', Applied: 'green' }, 'Counting'));
    app.field('stock-counts', rollup('lines', 'Lines', app.path('count-lines'), 'count'));
    app.field('stock-counts', rollup('counted', 'Counted', app.path('count-lines'), 'count', undefined, [{ field: 'counted', op: 'not-empty' }]));
    app.field('stock-counts', rollup('differ', 'Differ', app.path('count-lines'), 'count', undefined, [{ field: 'differs', op: 'true' }]));
    app.field('stock-counts', formula('said', 'Says', `status == "Applied" ? "Applied · " + text(differ) + (differ == 1 ? " difference" : " differences") : text(counted) + " of " + text(lines) + " counted · " + text(differ) + " differ · a product left empty stays as it is"`));
    app.head('stock-counts', 'said');
    app.formOrder('stock-counts', [...(places ? ['location'] : []), 'date', 'by']);
    app.newForm('stock-counts', [...(places ? ['location'] : []), 'date']);
    app.block('stock-counts', { block: 'actions', column: 1 });
    app.block('stock-counts', { block: 'linked', collection: app.path('count-lines'), style: 'table', title: 'Products', fields: ['expected', 'counted', 'difference'], edit: ['counted'], sort: 'name', column: 1 });
    app.view('stock-counts', { id: 'all', name: 'All', conditions: [], sort: { key: 'date', dir: 'desc' }, columns: ['date', ...(places ? ['location'] : []), 'status', 'said'] }, true);
    app.homeTile('stock-counts', { off: true });
    app.field('count-lines', nameField('Product'));
    app.field('count-lines', link('count', 'Count', app.path('stock-counts')));
    app.field('count-lines', link('product', 'Product', app.path('products')));
    app.field('count-lines', number('expected', 'In stock'));
    app.field('count-lines', number('counted', 'Counted'));
    app.field('count-lines', formula('difference', 'Difference', 'empty(counted) ? null : counted - expected'));
    app.field('count-lines', formula('differs', 'Differs', '!empty(counted) && counted != expected'));
    const levelStock = places ? `(empty(location) ? p.stock : empty(${level('p', 'location')}) ? 0 : ${level('p', 'location')}.stock)` : 'p.stock';
    app.rule('stock-counts', {
      kind: 'onSave',
      name: 'Lines',
      src: `onSave("Lines", () => {
  if (empty(name)) name = ${places ? '(empty(location) ? "Count" : location.name)' : '"Count"'} + " · " + monthname(date) + " " + text(monthday(date))${places ? `
  if (empty(location)) location = ${mainPlace}` : ''}
  if (lines == 0) {
    for (const p of find("${app.called('products')}", {})) {
      ${services ? 'if (p.type != "service") ' : ''}add("${app.called('count-lines')}", { name: p.name, product: p, expected: ${levelStock} })
    }
  }
})`,
    });
    app.rule('stock-counts', {
      kind: 'action',
      name: 'Apply',
      src: `action("Apply", {
  when: () => status == "Counting" && counted > 0,
  hint: "Count a product first",
  done: () => name + " applied",
}, () => {
  for (const l of linked("${app.called('count-lines')}")) {
    if (l.differs) {
      const diff = l.counted - l.expected
${movement(app, '      ', 'product: l.product, direction: diff > 0 ? "In" : "Out", type: "adjustment", reason: "Count", quantity: abs(diff)', 'l.product', places ? 'location' : null)}
    }
  }
  status = "Applied"
})`,
    });

    if (buying) {
      const pos = app.path('purchase-orders');
      const poLines = app.path('purchase-order-lines');
      app.field('purchase-orders', codeField('PO-'));
      app.field('purchase-orders', link('supplier', 'Supplier', app.path('companies')));
      app.field('purchase-orders', day('date', 'Ordered on', true));
      app.field('purchase-orders', day('expected', 'Expected'));
      app.field('purchase-orders', { ...select('status', 'Status', ['Draft', 'Ordered', 'Partially received', 'Received', 'Cancelled'], { Draft: 'gray', Ordered: 'blue', 'Partially received': 'teal', Received: 'green', Cancelled: 'red' }, 'Draft'), steps: { end: ['Cancelled'], no: ['Cancelled'], chip: true } });
      if (places) {
        app.field('purchase-orders', link('location', 'Location', app.path('locations')));
        atMain('purchase-orders');
      }
      if (app.money.multi) app.field('purchase-orders', currencyField(app));
      app.field('purchase-orders', rollup('total', 'Total', poLines, 'sum', 'amount', undefined, app.format(true)));
      app.field('purchase-orders', rollup('to_come', 'To come', poLines, 'sum', 'to_come'));
      app.field('purchase-orders', formula('arrives', 'Arrives', arrives('expected')));
      app.field('purchase-orders', formula('said', 'Says', `status + " · " + ${money('total')} + (empty(expected) || status == "Received" || status == "Cancelled" || status == "Draft" ? "" : " · expected " + monthname(expected) + " " + text(monthday(expected)) + (expected < today() ? ", " + ${arrives('expected')} : ""))`));
      app.head('purchase-orders', 'said', 'status');
      app.formOrder('purchase-orders', ['supplier', 'date', 'expected', ...(places ? ['location'] : []), ...(app.money.multi ? ['currency'] : [])]);
      app.newForm('purchase-orders', ['supplier', 'expected', ...(places ? ['location'] : [])]);
      app.block('purchase-orders', { block: 'actions', column: 1 });
      app.block('purchase-orders', { block: 'linked', collection: poLines, style: 'table', title: 'Lines', fields: ['product', 'quantity', 'received', 'unit_cost', 'amount'], sums: true, column: 2 });
      const waiting: Condition = { field: 'status', op: 'is', value: ['Ordered', 'Partially received'] };
      app.view('purchase-orders', { id: 'open', name: 'Open', conditions: [{ field: 'status', op: 'is-not', value: ['Received', 'Cancelled'] }], sort: { key: 'expected', dir: 'asc' }, columns: ['supplier', 'status', 'expected', 'arrives', 'total'] }, true);
      app.view('purchase-orders', { id: 'received', name: 'Received', conditions: [{ field: 'status', op: 'is', value: ['Received'] }], sort: { key: 'date', dir: 'desc' }, columns: ['supplier', 'date', 'total'] });
      app.view('purchase-orders', { id: 'to-receive', name: 'To receive', conditions: [waiting], sort: { key: 'expected', dir: 'asc' }, hidden: true });
      // What is to come is in Today on its day with Receive, Upcoming before; a late one stays in Overdue.
      app.view('purchase-orders', { ...calendar({ start: 'expected', color: 'status', upcoming: true, button: 'Receive', words: ['supplier', 'total'] }, [waiting]), id: 'calendar', name: 'Expected', hidden: true });
      app.homeTile('purchase-orders', { off: true });
      app.homeTiles('purchase-orders', [{ view: 'to-receive', title: 'To receive', head: [{ label: 'purchase orders', one: 'purchase order' }], value: 'arrives', sub: 'supplier', empty: 'Nothing is on its way.' }]);
      app.block('companies', { block: 'linked', collection: pos, style: 'list', title: 'Purchase orders', fields: ['status', 'total'], sort: 'date', dir: 'desc', column: 3, tab: 'Related' });

      const line = lineFormat(app);
      app.field('purchase-order-lines', nameField('Item'));
      app.field('purchase-order-lines', link('purchase_order', 'Purchase order', pos));
      app.field('purchase-order-lines', link('product', 'Product', app.path('products')));
      app.field('purchase-order-lines', number('quantity', 'Ordered', { default: 1 }));
      app.field('purchase-order-lines', number('received', 'Received', { default: 0 }));
      app.field('purchase-order-lines', number('unit_cost', 'Cost', { format: line }));
      app.field('purchase-order-lines', formula('amount', 'Amount', 'quantity * unit_cost', line));
      app.field('purchase-order-lines', formula('to_come', 'To come', 'max(0, quantity - (empty(received) ? 0 : received))'));
      app.field('purchase-order-lines', { key: 'po_status', label: 'Order status', type: 'lookup', lookup: { link: 'purchase_order', field: 'status' } });
      app.rule('purchase-order-lines', {
        kind: 'onSave',
        name: 'From the product',
        src: `onSave("From the product", () => {
  if (!empty(product)) {
    if (empty(name)) name = product.name
    if (empty(unit_cost)) unit_cost = product.cost
  }
})`,
      });
      app.field('stock-movements', link('purchase_order', 'Purchase order', pos));
      // Reorder, inFlow's: onto the supplier's draft order, one for each supplier however many are low.
      app.rule('products', {
        kind: 'action',
        name: 'Reorder',
        src: `action("Reorder", {
  when: () => !empty(supplier)${services ? ' && type != "service"' : ''},
  hint: "Pick the supplier first",
  done: () => name + " · on its supplier's draft order",
}, () => {
  const qty = !empty(reorder_qty) ? reorder_qty : max(1, (empty(reorder_level) ? 1 : reorder_level) - available - on_order)
  const drafts = find("${app.called('purchase-orders')}", { supplier: supplier, status: "Draft" })
  const order = drafts.length > 0 ? drafts[0] : add("${app.called('purchase-orders')}", { supplier: supplier, status: "Draft" })
  const there = find("${app.called('purchase-order-lines')}", { purchase_order: order, product: this })
  // Already on it, it is left as it is: Reorder all pressed again adds nothing twice.
  if (there.length == 0) add("${app.called('purchase-order-lines')}", { purchase_order: order, product: this, name: name, quantity: qty, unit_cost: cost })
})`,
      });
      app.rule('purchase-orders', {
        kind: 'action',
        name: 'Order',
        src: `action("Order", {
  when: () => status == "Draft",
  hint: "",
  ask: {
    expected: { label: "Expected", type: "date", default: () => today() + 7 },
  },
  done: () => code + " ordered",
}, () => {
  expected = input.expected
  date = today()
  status = "Ordered"
})`,
      });
      const payables = app.hasPiece('budget-lines') && app.has('budget') && answers.payables !== false;
      if (payables) app.field('payments', link('purchase_order', 'Purchase order', pos));
      // Receive, Katana's: each line with what is still to come; lower what is short.
      app.rule('purchase-orders', {
        kind: 'action',
        name: 'Receive',
        src: `action("Receive", {
  when: () => status == "Ordered" || status == "Partially received",
  hint: "",
  ask: {
    lines: { label: "Came", type: "rows", collection: "${app.called('purchase-order-lines')}", show: { quantity: "Ordered" }, from: "to_come", required: true },
    received_on: { label: "Received on", type: "date", default: () => today() },${places ? `
    into: { label: "Into", type: "link", collection: "${app.called('locations')}", default: () => location },` : ''}
  },
  done: () => code + (status == "Received" ? " received" : " partly received"),
}, () => {
  for (const l of input.lines) {
    if (l.count > 0) {
${movement(app, '      ', 'product: l.row.product, direction: "In", type: "purchase", quantity: l.count, date: empty(input.received_on) ? today() : input.received_on', 'l.row.product', places ? '(empty(input.into) ? location : input.into)' : null)}
      update(l.row, { received: (empty(l.row.received) ? 0 : l.row.received) + l.count })
      if (!empty(l.row.product) && !empty(l.row.unit_cost)) update(l.row.product, { cost: l.row.unit_cost })
    }
  }
  status = linked("${app.called('purchase-order-lines')}").filter((l) => l.quantity > (empty(l.received) ? 0 : l.received)).length > 0 ? "Partially received" : "Received"${payables ? `
  if (status == "Received") add("${app.called('payments')}", { name: code + " to " + supplier.name, direction: "Out", amount: total, status: "Invoiced", company: supplier })` : ''}
})`,
      });
      app.rule('purchase-orders', {
        kind: 'action',
        name: 'Cancel order',
        src: `action("Cancel order", {
  when: () => status == "Draft" || status == "Ordered",
  hint: "",
  confirm: true,
}, () => {
  status = "Cancelled"
})`,
      });
    }

    const deduct = app.has('sales') ? ((answers.deduct as string | undefined) ?? 'delivered') : 'no';
    const at = OUT_AT[deduct];
    if (selling) app.field('stock-movements', link('order', 'Order', app.path('orders')));
    if (at && selling) {
      if (places) {
        app.field('orders', link('location', 'Location', app.path('locations')));
        atMain('orders');
      }
      const out = `[${at.map((s) => JSON.stringify(s)).join(', ')}]`;
      app.rule('orders', {
        kind: 'onSave',
        name: 'Stock out',
        src: `onSave("Stock out", () => {
  const out = ${out}
  if (out.includes(status) && !out.includes(old.status)) {
    for (const line of linked("${app.called('order-lines')}")) {
      if (!empty(line.product)${services ? ' && line.product.type != "service"' : ''}) {
${movement(app, '        ', 'product: line.product, direction: "Out", type: "sale", quantity: line.quantity', 'line.product', places ? 'location' : null)}
      }
    }
  }
  if (!out.includes(status) && out.includes(old.status)) {
    for (const m of linked("${app.called('stock-movements')}")) {
      remove(m)
    }
  }
})`,
      });
    }
    if (selling) {
      // A line asking for more than there is to sell is marked under it: "Not enough stock: 4 available".
      app.rule('order-lines', {
        kind: 'check',
        name: 'Not enough stock',
        src: `check("quantity", () => empty(product) || ${services ? 'product.type == "service" || ' : ''}empty(order) || order.status == "Paid" || order.status == "Cancelled" || order.status == "Delivered" || order.status == "Invoiced" || quantity <= product.available + (order.status == "Quote" || order.status == "Declined" ? 0 : quantity), \`Not enough stock: \${product.available} available\`)`,
      });
    }

    const placesText = places ? ` in ${((answers.locationList as string[] | undefined) ?? LOCATIONS).join(', ')}` : '';
    app.about({
      title: 'Stock and purchasing',
      what: `What you have in stock${placesText}, every movement in and out${buying ? ', and what you order from suppliers' : ''}. Stock is never written by hand: it is worked out from the movements.`,
      pieces: ['products', 'stock-movements', 'stock-counts', ...(places ? ['locations', 'stock-levels'] : []), ...(buying ? ['purchase-orders', 'purchase-order-lines'] : [])],
      glance: ['A product says what is in stock, committed, available and on order', 'Adjust asks what was counted and why', ...(buying ? ['Reorder all puts the low products on their suppliers’ draft orders', 'Receive asks what came of each line'] : []), 'A count lists every product; Apply writes what differs'],
      how: [
        'Add your products with their cost, their supplier and the level to reorder at.',
        ...(buying ? ['Press Reorder on a product, or Reorder all on Low stock; press Order on the draft when it is sent, Receive when the goods come.'] : ['Press Adjust when stock comes in or goes out.']),
        'Count your stock now and then: add a count, write what you counted of each product, press Apply.',
        ...(places ? ['Press Transfer on a product to move goods to another warehouse.'] : []),
      ],
      auto: [
        `A product's stock is what came in less what went out${places ? '; each warehouse has its own, as a stock level' : ''}.`,
        ...(selling ? ['What confirmed orders hold of a product is committed; what is left is available.'] : []),
        'A product is Low when what is available and on its way is under its reorder level, Out when there is none.',
        'Adjust and a count write the difference as an adjustment, with why.',
        ...(buying ? ['Reorder adds the product to its supplier’s draft order, or makes one.', 'Receive brings in what came; what is short stays on its way, the order Partially received; a product costs what it was last bought for.'] : []),
        ...(at && selling ? [`When an order is ${deduct === 'confirmed' ? 'Confirmed' : 'Delivered'}, its products go out of stock; when it is taken back or Cancelled, they come back. A line asking for more than is available is marked.`] : []),
        ...(places ? ['A movement finds the stock level of its product and warehouse, adding it when there is none.'] : []),
      ],
      work: ['When we order, and from whom.', 'How goods are checked when they come in.', 'When we count the stock.'],
    });
  },
};
