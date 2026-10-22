import type { NumberFormat } from '../../collection';
import { calendar, checkbox, codeField, currencyField, day, formula, link, nameField, number, rollup, select, text } from '../pieces';
import { byDueDay, companies, payments, people, products } from '../shared';
import type { AppDraft, AppTemplate } from '../types';

/** Who an order is for: the CRM's customers, companies unless they are people only. */
export const customerRole = (app: Pick<AppDraft, 'has' | 'answers'>) => (app.has('crm') && app.answers('crm').customers === 'people' ? 'people' : 'companies');

/** A line's money: in the app's currency, or, with more than one, as a number in the currency its order holds. */
export const lineFormat = (app: AppDraft): NumberFormat => (app.money.multi ? { style: 'number', decimals: 2 } : app.format(false));

export const sales: AppTemplate = {
  id: 'sales',
  version: 1,
  group: 'money',
  name: 'apps.sales.name',
  short: 'apps.sales.short',
  icon: 'tag',
  what: 'apps.sales.what',
  questions: [
    {
      key: 'sells',
      kind: 'choice',
      label: 'apps.sales.sells',
      options: [
        { value: 'products', label: 'apps.sales.sells.products' },
        { value: 'services', label: 'apps.sales.sells.services' },
        { value: 'both', label: 'apps.sales.sells.both' },
      ],
      default: 'both',
    },
    { key: 'tax', kind: 'yesno', label: 'apps.sales.tax', default: true },
    { key: 'taxIncluded', kind: 'yesno', label: 'apps.sales.taxIncluded', default: false, when: ({ answers }) => answers.tax !== false, under: 'tax', help: 'apps.sales.taxIncludedHelp' },
    { key: 'discount', kind: 'yesno', label: 'apps.sales.discount', default: true, help: 'apps.sales.discountHelp' },
    { key: 'quotes', kind: 'yesno', label: 'apps.sales.quotes', default: true, help: 'apps.sales.quotesHelp' },
  ],
  money: () => true,
  pieces: (_answers, app) => [customerRole(app), 'products', 'orders', 'order-lines', 'payments'],
  build(app, answers) {
    const tax = answers.tax !== false;
    const discount = answers.discount !== false;
    const quotes = answers.quotes !== false;
    const customer = customerRole(app);
    companies(app);
    people(app);
    products(app);
    payments(app);
    const lines = app.path('order-lines');
    const own = app.format(true);
    const line = lineFormat(app);

    if (tax) {
      app.field('products', number('tax_rate', 'Tax %'));
      app.field('products', checkbox('tax_included', 'Tax included', answers.taxIncluded === true));
    }
    app.field('products', checkbox('on_sale', 'For sale', true));

    const statuses = [...(quotes ? ['Quote'] : []), 'Confirmed', 'Delivered', 'Invoiced', 'Paid', 'Cancelled'];
    app.field('orders', codeField('ORD-'));
    app.field('orders', link('customer', 'Customer', app.path(customer)));
    app.field('orders', day('date', 'Date', true));
    app.field('orders', select('status', 'Status', statuses, { Quote: 'gray', Confirmed: 'blue', Delivered: 'purple', Invoiced: 'yellow', Paid: 'green', Cancelled: 'red' }, statuses[0]));
    if (app.money.multi) app.field('orders', currencyField(app));
    if (byDueDay(app)) app.field('orders', day('due', 'Due'));
    app.view('orders', calendar({ start: byDueDay(app) ? 'due' : 'date', color: 'status' }, [{ field: 'status', op: 'is-not', value: ['Paid', 'Cancelled'] }]));
    app.field('orders', text('invoice_no', 'Invoice no'));
    app.field('orders', rollup('lines', 'Lines', lines, 'count'));
    if (tax) app.field('orders', rollup('subtotal', 'Subtotal', lines, 'sum', 'net', undefined, own));
    if (discount) app.field('orders', rollup('discount', 'Discount', lines, 'sum', 'discount_amount', undefined, own));
    if (tax) app.field('orders', rollup('tax', 'Tax', lines, 'sum', 'tax', undefined, own));
    app.field('orders', rollup('total', 'Total', lines, 'sum', 'amount', undefined, own));
    app.field('orders', rollup('collected', 'Collected', app.path('payments'), 'sum', 'amount', [{ field: 'direction', op: 'is', value: ['In'] }, { field: 'status', op: 'is', value: ['Paid'] }], own));
    app.field('orders', formula('remaining', 'Left to collect', 'total - collected', own));
    app.block('orders', { block: 'linked', collection: lines, style: 'table', fields: ['product', 'quantity', 'unit_price', ...(discount ? ['discount'] : []), ...(tax ? ['tax_rate'] : []), 'amount'], sums: true });
    app.block('orders', { block: 'linked', collection: app.path('payments'), style: 'table', fields: ['amount', 'status', ...(byDueDay(app) ? ['due'] : []), 'paid_on'], sums: true });
    app.block(customer, { block: 'linked', collection: app.path('orders'), style: 'list', fields: ['status', 'total'], sort: 'date' });

    app.field('order-lines', nameField('Item'));
    app.field('order-lines', link('order', 'Order', app.path('orders')));
    app.field('order-lines', link('product', 'Product', app.path('products')));
    app.field('order-lines', number('quantity', 'Quantity', { default: 1 }));
    app.field('order-lines', number('unit_price', 'Unit price', { format: line }));
    if (discount) app.field('order-lines', number('discount', 'Discount %', { default: 0 }));
    if (tax) {
      app.field('order-lines', number('tax_rate', 'Tax %', { default: 0 }));
      app.field('order-lines', checkbox('tax_included', 'Tax included'));
    }
    const gross = discount ? 'quantity * unit_price * (1 - discount / 100)' : 'quantity * unit_price';
    if (discount) app.field('order-lines', formula('discount_amount', 'Discount', 'quantity * unit_price * discount / 100', line));
    if (tax) {
      app.field('order-lines', formula('net', 'Net', `tax_included ? ${gross} / (1 + tax_rate / 100) : ${gross}`, line));
      app.field('order-lines', formula('tax', 'Tax', `tax_included ? ${gross} - net : net * tax_rate / 100`, line));
      app.field('order-lines', formula('amount', 'Amount', 'net + tax', line));
    } else app.field('order-lines', formula('amount', 'Amount', gross, line));
    app.rule('order-lines', {
      kind: 'onSave',
      name: 'From the product',
      src: `onSave("From the product", () => {
  if (!empty(product)) {
    if (empty(name)) name = product.name
    if (empty(unit_price)) unit_price = product.price${
      tax
        ? `
    if (empty(old.product)) {
      tax_rate = empty(product.tax_rate) ? 0 : product.tax_rate
      tax_included = product.tax_included
    }`
        : ''
    }
  }
})`,
    });

    const exempt = ['Cancelled', ...(quotes ? ['Quote'] : [])];
    app.rule('orders', {
      kind: 'check',
      name: 'An order needs at least one line',
      src: `check(null, () => ${exempt.map((s) => `status == "${s}"`).join(' || ')} || lines > 0, "An order needs at least one line")`,
    });
    const budget = app.hasPiece('budget-lines');
    const party = customer === 'companies' && app.hasPiece('companies') ? ', company: customer' : '';
    app.rule('orders', {
      kind: 'action',
      name: 'Record payment',
      src: `action("Record payment", {
  when: () => ${exempt.map((s) => `status != "${s}"`).join(' && ')} && remaining > 0,
  hint: "Nothing is left to collect",
  ask: {
    amount: { label: "Amount", type: "number", default: () => remaining, required: true, note: () => "Left to collect: " + text(remaining) },
  },
}, () => {
  const waiting = linked("${app.called('payments')}").filter((p) => p.direction == "In" && p.status != "Paid")
  if (waiting.length > 0) {
    const first = waiting[0]
    if (input.amount < first.amount) add("${app.called('payments')}", { name: first.name, direction: "In", amount: first.amount - input.amount, status: first.status${byDueDay(app) ? ', due: first.due' : ''}${budget ? ', budget_line: first.budget_line' : ''}${party} })
    update(first, { amount: input.amount, status: "Paid", paid_on: today() })
  } else {
    add("${app.called('payments')}", { name: code + " payment", direction: "In", amount: input.amount, status: "Paid", paid_on: today()${budget ? `, budget_line: find("${app.called('budget-lines')}", { name: "Sales" })[0]` : ''}${party} })
  }
})`,
    });

    app.field('payments', link('order', 'Order', app.path('orders')));
    app.rule('payments', {
      kind: 'onSave',
      name: 'Order paid',
      src: `onSave("Order paid", () => {
  if (!empty(order) && status == "Paid" && order.remaining <= 0 && order.status != "Paid") update(order, { status: "Paid" })
})`,
    });

    app.about({
      title: 'Sales and invoicing',
      what: `Your ${answers.sells === 'services' ? 'services' : answers.sells === 'products' ? 'products' : 'products and services'}, the orders for them${quotes ? ' from the quote on' : ''}, and the money coming in. Invoices are made in your accounting program; their numbers are kept here.`,
      pieces: ['products', 'orders', 'order-lines', 'payments'],
      glance: [tax ? 'A line takes its price and tax from the product' : 'A line takes its price from the product', 'An order is Paid once nothing is left'],
      how: [
        'Add your products with their price' + (tax ? ' and tax.' : '.'),
        `Add an order for a customer${quotes ? ' (it starts as a Quote)' : ''}, then its lines on its screen: pick the product, write the quantity.`,
        'Move the order on as it goes: Confirmed, Delivered, Invoiced; write the invoice number.',
        'Press Record payment when money comes in.',
      ],
      auto: [
        `A line takes its price${tax ? ', tax rate and whether tax is included' : ''} from its product when it is left empty.`,
        `A line works out its amount${discount ? ' with its discount' : ''}${tax ? ' and its tax' : ''}; the order adds its lines up and says what is left to collect.`,
        `An order${quotes ? ' past its quote' : ''} with no lines is marked.`,
        'Record payment asks how much came in: it pays a waiting payment, leaving what is not paid yet as a new one, or adds a paid one.',
        'When nothing is left to collect, the order is Paid.',
      ],
      work: [`${quotes ? 'A quote becomes Confirmed when the customer says yes. ' : ''}An order is Delivered when the customer has it, Invoiced once the invoice is sent.`, 'Who sends invoices, and when we remind a customer who has not paid.'],
    });
  },
};
