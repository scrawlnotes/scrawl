import { checkbox, codeField, currencyField, day, formula, link, nameField, number, person, rollup, select, text } from '../pieces';
import { companies, hasServices, products } from '../shared';
import type { AppDraft, AppTemplate } from '../types';
import { lineFormat } from './sales';

const LOCATIONS = ['Main warehouse', 'Second warehouse'];

/** The statuses of an order its stock goes out at, by the answer. */
const OUT_AT: { [answer: string]: string[] } = { confirmed: ['Confirmed', 'Delivered', 'Invoiced', 'Paid'], delivered: ['Delivered', 'Invoiced', 'Paid'] };

/** What adds a movement in a rule, in a warehouse of its own: its stock level, found or added, goes with it. */
function movement(app: AppDraft, indent: string, values: string, product: string, location: string | null): string {
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
  app.field(role, formula('stock', 'Stock', 'stock_in - stock_out'));
}

/** The button that asks for the counted total and writes the difference as a movement. */
const correct = (app: AppDraft, here: string, extra: string) => `action("Correct stock", {
  say: () => ${here} + " has " + text(stock) + " in stock",
  ask: { total: { label: "Counted total", type: "number", default: () => stock, required: true, note: () => "Now " + text(stock) } },
}, () => {
  const diff = input.total - stock
  if (diff != 0) add("${app.called('stock-movements')}", { direction: diff > 0 ? "In" : "Out", type: "adjustment", quantity: abs(diff)${extra} })
})`;

export const stock: AppTemplate = {
  id: 'stock',
  version: 1,
  group: 'money',
  name: 'apps.stock.name',
  what: 'apps.stock.what',
  questions: [
    { key: 'purchasing', kind: 'yesno', label: 'apps.stock.purchasing', default: true },
    { key: 'locations', kind: 'yesno', label: 'apps.stock.locations', default: false },
    { key: 'locationList', kind: 'list', label: 'apps.stock.locationList', default: LOCATIONS, when: ({ answers }) => answers.locations === true },
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
    },
    { key: 'payables', kind: 'yesno', label: 'apps.stock.payables', default: true, when: ({ chosen, answers }) => chosen.has('budget') && answers.purchasing !== false },
  ],
  money: () => true,
  pieces: (answers) => [
    'products',
    'companies',
    'stock-movements',
    ...(answers.purchasing !== false ? ['purchase-orders', 'purchase-order-lines'] : []),
    ...(answers.locations === true ? ['locations', 'stock-levels'] : []),
  ],
  build(app, answers) {
    const buying = answers.purchasing !== false;
    const places = answers.locations === true;
    const main = app.format(false);
    const moves = app.path('stock-movements');
    const services = hasServices(app);
    // The warehouse a movement, an order or a purchase order is in when none is given.
    const mainPlace = places ? `find("${app.called('locations')}", { is_default: true })[0]` : '';
    const atMain = (role: string) =>
      app.rule(role, { kind: 'onSave', name: 'Default location', src: `onSave("Default location", () => {\n  if (empty(location)) location = ${mainPlace}\n})` });
    companies(app);
    products(app);

    app.field('products', number('cost', 'Cost', { format: main }));
    app.field('products', number('reorder_level', 'Reorder level'));
    app.field('products', link('supplier', 'Supplier', app.path('companies')));
    counts(app, 'products');
    app.field('products', formula('stock_value', 'Stock value', 'stock * cost', main));
    app.field('products', formula('stock_status', 'Stock status', 'stock < reorder_level ? "Low" : "OK"'));
    app.rule('products', {
      kind: 'check',
      name: 'Low stock',
      src: `check("stock", () => ${services ? 'type == "service" || ' : ''}stock >= reorder_level, \`Low: \${stock} left\`)`,
    });
    app.block('products', { block: 'linked', collection: moves, style: 'table', fields: ['date', 'direction', 'type', 'quantity', ...(places ? ['location'] : [])], sort: 'date' });
    app.block('companies', { block: 'linked', collection: app.path('products'), style: 'list', fields: ['stock'] });

    app.field('stock-movements', link('product', 'Product', app.path('products')));
    app.field('stock-movements', select('direction', 'Direction', ['In', 'Out'], { In: 'green', Out: 'red' }, 'In'));
    app.field('stock-movements', select('type', 'Type', ['purchase', 'sale', 'use', 'return', 'adjustment', 'transfer'], { purchase: 'green', sale: 'blue', use: 'orange', return: 'purple', adjustment: 'gray', transfer: 'teal' }));
    app.field('stock-movements', { ...number('quantity', 'Quantity'), required: true });
    app.field('stock-movements', day('date', 'Date', true));
    app.field('stock-movements', person('by', 'By', true));

    if (places) {
      app.field('locations', nameField());
      app.field('locations', text('address', 'Address'));
      app.field('locations', checkbox('is_default', 'Default'));
      ((answers.locationList as string[] | undefined) ?? LOCATIONS).forEach((name, i) => app.record('locations', { name, ...(i === 0 && { is_default: true }) }));
      app.block('locations', { block: 'linked', collection: app.path('stock-levels'), style: 'list', fields: ['stock'] });

      app.field('stock-levels', nameField());
      app.field('stock-levels', link('product', 'Product', app.path('products')));
      app.field('stock-levels', link('location', 'Location', app.path('locations')));
      counts(app, 'stock-levels');
      app.block('stock-levels', { block: 'linked', collection: moves, style: 'table', fields: ['date', 'direction', 'type', 'quantity'], sort: 'date' });
      app.block('products', { block: 'linked', collection: app.path('stock-levels'), style: 'list', fields: ['location', 'stock'] });

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
      app.rule('stock-levels', { kind: 'action', name: 'Correct stock', src: correct(app, 'name', ', product: product, location: location') });
      app.rule('stock-levels', {
        kind: 'action',
        name: 'Transfer',
        src: `action("Transfer", {
  say: () => name + " has " + text(stock) + " in stock",
  ask: {
    quantity: { label: "Quantity", type: "number", required: true },
    to: { label: "To", type: "link", collection: "${app.called('locations')}", required: true },
  },
}, () => {
  add("${app.called('stock-movements')}", { product: product, location: location, direction: "Out", type: "transfer", quantity: input.quantity })
${movement(app, '  ', 'product: product, direction: "In", type: "transfer", quantity: input.quantity', 'product', 'input.to')}
})`,
      });
    } else app.rule('products', { kind: 'action', name: 'Correct stock', src: correct(app, 'name', '') });

    if (buying) {
      app.field('purchase-orders', codeField('PO-'));
      app.field('purchase-orders', link('supplier', 'Supplier', app.path('companies')));
      app.field('purchase-orders', day('date', 'Date', true));
      app.field('purchase-orders', select('status', 'Status', ['Draft', 'Ordered', 'Received', 'Cancelled'], { Draft: 'gray', Ordered: 'blue', Received: 'green', Cancelled: 'red' }, 'Draft'));
      app.field('purchase-orders', day('expected', 'Expected'));
      if (places) {
        app.field('purchase-orders', link('location', 'Location', app.path('locations')));
        atMain('purchase-orders');
      }
      if (app.money.multi) app.field('purchase-orders', currencyField(app));
      app.field('purchase-orders', rollup('total', 'Total', app.path('purchase-order-lines'), 'sum', 'amount', undefined, app.format(true)));
      app.block('purchase-orders', { block: 'linked', collection: app.path('purchase-order-lines'), style: 'table', fields: ['product', 'quantity', 'unit_cost', 'amount'], sums: true });
      app.block('companies', { block: 'linked', collection: app.path('purchase-orders'), style: 'list', fields: ['status', 'total'], sort: 'date' });

      const line = lineFormat(app);
      app.field('purchase-order-lines', nameField('Item'));
      app.field('purchase-order-lines', link('purchase_order', 'Purchase order', app.path('purchase-orders')));
      app.field('purchase-order-lines', link('product', 'Product', app.path('products')));
      app.field('purchase-order-lines', number('quantity', 'Quantity', { default: 1 }));
      app.field('purchase-order-lines', number('unit_cost', 'Unit cost', { format: line }));
      app.field('purchase-order-lines', formula('amount', 'Amount', 'quantity * unit_cost', line));
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
      app.field('stock-movements', link('purchase_order', 'Purchase order', app.path('purchase-orders')));
      app.rule('products', {
        kind: 'action',
        name: 'Reorder',
        src: `action("Reorder", { when: () => !empty(supplier), hint: "Pick the supplier first" }, () => {
  const order = add("${app.called('purchase-orders')}", { supplier: supplier, status: "Draft" })
  add("${app.called('purchase-order-lines')}", { purchase_order: order, name: name, quantity: empty(reorder_level) ? 1 : reorder_level, unit_cost: cost })
})`,
      });

      const payables = app.hasPiece('budget-lines') && app.has('budget') && answers.payables !== false;
      if (payables) app.field('payments', link('purchase_order', 'Purchase order', app.path('purchase-orders')));
      const pay = payables ? app.called('payments') : '';
      app.rule('purchase-orders', {
        kind: 'onSave',
        name: 'Receive',
        src: `onSave("Receive", () => {
  if (status == "Received" && old.status != "Received") {
    for (const line of linked("${app.called('purchase-order-lines')}")) {
${movement(app, '      ', 'product: line.product, direction: "In", type: "purchase", quantity: line.quantity', 'line.product', places ? 'location' : null)}
    }${payables ? `\n    add("${pay}", { name: code + " to " + supplier.name, direction: "Out", amount: total, status: "Invoiced", company: supplier })` : ''}
  }
  if (status != "Received" && old.status == "Received") {
    for (const m of linked("${app.called('stock-movements')}")) {
      remove(m)
    }${payables ? `\n    for (const p of linked("${pay}")) {\n      if (p.status != "Paid") remove(p)\n    }` : ''}
  }
})`,
      });
    }

    const deduct = app.has('sales') ? ((answers.deduct as string | undefined) ?? 'delivered') : 'no';
    const at = OUT_AT[deduct];
    if (at) {
      app.field('stock-movements', link('order', 'Order', app.path('orders')));
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
      const before = (app.answers('sales').quotes !== false ? ['Quote'] : []).concat(['Confirmed', 'Delivered', 'Invoiced', 'Paid'].filter((s) => !at.includes(s)));
      if (before.length > 0) {
        app.rule('order-lines', {
          kind: 'check',
          name: 'Not enough stock',
          src: `check("quantity", () => empty(product) || ${services ? 'product.type == "service" || ' : ''}!(${before.map((s) => `order.status == "${s}"`).join(' || ')}) || quantity <= product.stock, \`Not enough stock: \${product.stock} left\`)`,
        });
      }
    }

    const placesText = places ? ` in ${((answers.locationList as string[] | undefined) ?? LOCATIONS).join(', ')}` : '';
    app.about({
      title: 'Stock and purchasing',
      what: `What you have in stock${placesText}, every movement in and out${buying ? ', and what you order from suppliers' : ''}. Stock is never written by hand: it is worked out from the movements.`,
      pieces: ['products', 'stock-movements', ...(places ? ['locations', 'stock-levels'] : []), ...(buying ? ['purchase-orders', 'purchase-order-lines'] : [])],
      how: [
        'Add your products with their cost, their supplier and the level to reorder at.',
        ...(buying ? ['Add a purchase order for a supplier and its lines; make it Ordered when it is sent, Received when the goods come.'] : ['Add a movement for what comes in and what goes out.']),
        `Count your stock now and then; press Correct stock on ${places ? 'a stock level' : 'the product'} with the total you counted.`,
        ...(places ? ['Press Transfer on a stock level to move goods to another warehouse.'] : []),
      ],
      auto: [
        `A product's stock is what came in less what went out${places ? '; each warehouse has its own, as a stock level' : ''}.`,
        'A product below its reorder level is marked Low.',
        'Correct stock asks for the total you counted and adds the difference as an adjustment.',
        ...(buying ? ['When a purchase order is Received, its lines come in as movements; when it is taken back, they are taken away.', 'Reorder adds a draft purchase order to the product\'s supplier, with a line for it.'] : []),
        ...(at ? [`When an order is ${deduct === 'confirmed' ? 'Confirmed' : 'Delivered'}, its products go out of stock; when it is taken back or Cancelled, they come back. A line asking for more than there is, is marked.`] : []),
        ...(buying && app.hasPiece('budget-lines') && answers.payables !== false && app.has('budget') ? ['When a purchase order is Received, what you owe the supplier is added as a payment.'] : []),
        ...(places ? ['A movement finds the stock level of its product and warehouse, adding it when there is none.'] : []),
      ],
      work: ['When we order, and from whom.', 'How goods are checked when they come in.', 'When we count the stock.'],
    });
  },
};

