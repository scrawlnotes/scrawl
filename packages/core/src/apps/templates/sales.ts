import type { Condition, NumberFormat } from '../../collection';
import { calendar, checkbox, codeField, currencyField, day, formula, link, nameField, number, rollup, select, symbolOf, text } from '../pieces';
import { byDueDay, companies, payments, people, products } from '../shared';
import type { Answers, AppDraft, AppTemplate } from '../types';
import { stageColumns } from './crm';

// Sales and invoicing (design/scrawl-apps.md 3.2): quotes, orders and the money coming in, as Zoho
// Invoice and QuickBooks keep them. What is to collect and how much of it is late is said over the
// list; an order's stages are a bar; Accept makes a quote an order and wins its deal; Invoice writes
// the invoice's number and works out its due day from the customer's terms; Record payment asks
// what came in, what is left staying open. The invoice itself is made in the accounting program.

/** Who an order is for: the CRM's customers, companies unless they are people only. */
export const customerRole = (app: Pick<AppDraft, 'has' | 'answers'>) => (app.has('crm') && app.answers('crm').customers === 'people' ? 'people' : 'companies');

/** Whose a template's records are, where it asks when there is no CRM: the CRM's customers, else as its answer says. */
export const clientRole = (app: Pick<AppDraft, 'has' | 'answers'>, answers: Answers) => (app.has('crm') ? customerRole(app) : answers.customers === 'people' ? 'people' : 'companies');

/** A line's money: in the app's currency, or, with more than one, as a number in the currency its order holds. */
export const lineFormat = (app: AppDraft): NumberFormat => (app.money.multi ? { style: 'number', decimals: 2 } : app.format(false));

/** The payment terms a customer and an order may have, Zoho's; the days each gives. */
export const TERMS = ['Due on receipt', 'Net 15', 'Net 30', 'Net 60'];
const TERM_DAYS = '(payment_terms == "Net 15" ? 15 : payment_terms == "Net 30" ? 30 : payment_terms == "Net 60" ? 60 : 0)';
/** Why a quote was declined: the CRM's reasons a deal is lost. */
const REASONS = ['Price', 'Timing', 'Competitor', 'No budget', 'No response', 'Not a fit'];
const METHODS = ['Bank transfer', 'Card', 'Cash'];

/** A day as an order says it: "Nov 20". */
const short = (d: string) => `monthname(${d}) + " " + text(monthday(${d}))`;

export const sales: AppTemplate = {
  id: 'sales',
  version: 2,
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
    {
      key: 'terms',
      kind: 'choice',
      label: 'apps.sales.terms',
      options: [
        { value: 'Due on receipt', label: 'apps.sales.terms.receipt' },
        { value: 'Net 15', label: 'apps.sales.terms.15' },
        { value: 'Net 30', label: 'apps.sales.terms.30' },
        { value: 'Net 60', label: 'apps.sales.terms.60' },
      ],
      default: 'Net 30',
      help: 'apps.sales.termsHelp',
    },
  ],
  money: () => true,
  pieces: (_answers, app) => [customerRole(app), 'products', 'orders', 'order-lines', 'payments'],
  menu: (answers) => [{ role: 'orders', view: answers.quotes === false ? 'open' : 'open', name: 'Orders' }, 'payments', 'products', 'companies', 'people'],
  build(app, answers) {
    const tax = answers.tax !== false;
    const discount = answers.discount !== false;
    const quotes = answers.quotes !== false;
    const terms = typeof answers.terms === 'string' && TERMS.includes(answers.terms) ? answers.terms : 'Net 30';
    const customer = customerRole(app);
    companies(app);
    people(app);
    products(app);
    payments(app);
    const lines = app.path('order-lines');
    const orders = app.path('orders');
    const own = app.format(true);
    const line = lineFormat(app);
    const sym = JSON.stringify(symbolOf(app.money.main));
    const money = (expr: string) => `${sym} + amount(${expr})`;
    // A deal of the CRM's board an order may come from: its quote is on the deal, Accept wins it.
    const deals = app.hasPiece('deals') && app.has('crm');
    const stages = deals ? stageColumns((app.answers('crm').stages as string[] | undefined) ?? ['Lead', 'Contacted', 'Meeting', 'Proposal', 'Won', 'Lost']) : [];
    const won = stages.find(([, kind]) => kind === 'done')?.[0];
    const lost = stages.find(([, kind]) => kind === 'dropped')?.[0];

    if (tax) {
      app.field('products', number('tax_rate', 'Tax %'));
      app.field('products', checkbox('tax_included', 'Tax included', answers.taxIncluded === true));
    }
    app.field('products', checkbox('on_sale', 'For sale', true));

    // A customer's payment terms, Zoho's: an order takes them, else the app's.
    app.field(customer, { ...select('payment_terms', 'Payment terms', TERMS), help: `Left empty, ${terms}` });

    const shipping = app.has('ecommerce');
    const statuses = [...(quotes ? ['Quote'] : []), 'Confirmed', ...(shipping ? ['Packed', 'Shipped'] : []), 'Delivered', 'Invoiced', 'Paid', ...(quotes ? ['Declined'] : []), 'Cancelled'];
    const ended = [...(quotes ? ['Declined'] : []), 'Cancelled'];
    app.field('orders', codeField('SO-'));
    app.field('orders', link('customer', 'Customer', app.path(customer)));
    if (deals) app.field('orders', { ...link('deal', 'Deal', app.path('deals')), ...(customer === 'companies' && { within: 'company' }) });
    app.field('orders', day('date', 'Date', true));
    app.field('orders', {
      ...select('status', 'Status', statuses, { Quote: 'gray', Confirmed: 'blue', Packed: 'teal', Shipped: 'pink', Delivered: 'purple', Invoiced: 'yellow', Paid: 'green', Declined: 'red', Cancelled: 'red' }, statuses[0]),
      steps: { end: ended, no: ended, chip: true },
    });
    if (quotes) app.field('orders', { ...day('valid_until', 'Valid until'), default: '=today() + 30', when: [{ field: 'status', op: 'is', value: ['Quote'] }] });
    app.field('orders', { ...select('payment_terms', 'Payment terms', TERMS), help: "Left empty, the customer's" });
    if (app.money.multi) app.field('orders', currencyField(app));
    // The invoice's number and days once it is invoiced; a quote and an order on its way have none.
    const billed = [{ field: 'status', op: 'is' as const, value: ['Invoiced', 'Paid'] }];
    app.field('orders', { ...text('invoice_no', 'Invoice no'), when: billed });
    app.field('orders', { ...day('invoiced_on', 'Invoiced on'), when: billed });
    app.field('orders', { ...day('due', 'Due'), when: billed });
    app.field('orders', rollup('lines', 'Lines', lines, 'count'));
    if (tax) app.field('orders', rollup('subtotal', 'Subtotal', lines, 'sum', 'net', undefined, own));
    if (discount) app.field('orders', rollup('discount', 'Discount', lines, 'sum', 'discount_amount', undefined, own));
    if (tax) app.field('orders', rollup('tax', 'Tax', lines, 'sum', 'tax', undefined, own));
    app.field('orders', rollup('total', 'Total', lines, 'sum', 'amount', undefined, own));
    app.field('orders', rollup('collected', 'Collected', app.path('payments'), 'sum', 'amount', [{ field: 'direction', op: 'is', value: ['In'] }, { field: 'status', op: 'is', value: ['Paid'] }], own));
    // A marketplace keeps its commission: what is left to collect of an order of a channel leaves it out.
    const open = `status != "Paid" && status != "Cancelled"${quotes ? ' && status != "Quote" && status != "Declined"' : ''}`;
    app.field('orders', formula('remaining', 'Left', `${open} ? ${shipping ? 'total - commission - collected' : 'total - collected'} : 0`, own));
    app.field('orders', formula('late', 'Overdue', `status == "Invoiced" && !empty(due) && due < today() && remaining > 0`));
    app.field('orders', formula('this_month', 'This month', `!empty(date) && month(date) == month(today()) && year(date) == year(today()) && status != "Cancelled"${quotes ? ' && status != "Quote" && status != "Declined"' : ''}`));
    // What its status says beside it in the list: "Overdue 12 days", "Due today", "To invoice", "Valid until Nov 28".
    const lateDays = 'text(today() - due) + (today() - due == 1 ? " day" : " days")';
    app.field(
      'orders',
      formula(
        'state',
        'Says',
        `${quotes ? `status == "Quote" ? (empty(valid_until) ? "" : valid_until < today() ? "Expired" : "Valid until " + ${short('valid_until')}) : ` : ''}status == "Delivered" ? "To invoice" : status == "Invoiced" && !empty(due) ? (due < today() ? "Overdue " + ${lateDays} : due == today() ? "Due today" : "Due " + ${short('due')}) : ""`,
      ),
    );
    // Its window's line: "Invoiced · ₺39.150 · ₺19.150 left · 12 days overdue"; a quote's until when.
    app.field(
      'orders',
      formula(
        'said',
        'Says',
        `status + " · " + ${money('total')}${quotes ? ` + (status == "Quote" && !empty(valid_until) ? " · valid until " + ${short('valid_until')} + (valid_until >= today() ? ", " + text(valid_until - today()) + " days left" : "") : "")` : ''} + (remaining > 0 && status != "Confirmed" ? " · " + ${money('remaining')} + " left" : "") + (late ? " · " + ${lateDays} + " overdue" : "")${shipping ? ' + (!empty(channel) && to_ship ? " · ship by " + ship_said : "") + (!empty(channel) && !empty(buyer) ? " · " + buyer : "")' : ''}`,
      ),
    );
    // Under its lines, what they come to: "Subtotal ₺32.625 · Tax ₺6.525 · Total ₺39.150 · Collected ₺20.000 · Left ₺19.150".
    app.field(
      'orders',
      formula(
        'totals',
        'Totals',
        `${tax ? `"Subtotal " + ${money('subtotal')} + " · Tax " + ${money('tax')} + " · " + ` : ''}"Total " + ${money('total')} + (collected > 0 ? " · Collected " + ${money('collected')} : "") + (remaining > 0 ? " · Left " + ${money('remaining')} : "")`,
      ),
    );
    app.head('orders', 'said', 'status');
    app.formOrder('orders', ['customer', ...(deals ? ['deal'] : []), 'date', ...(quotes ? ['valid_until'] : []), 'payment_terms', ...(app.money.multi ? ['currency'] : []), 'invoice_no', 'invoiced_on', 'due']);
    app.newForm('orders', ['customer', ...(deals ? ['deal'] : []), 'date', ...(quotes ? ['valid_until'] : [])]);
    app.block('orders', { block: 'actions', column: 1 });
    app.block('orders', { block: 'linked', collection: lines, style: 'table', title: 'Lines', fields: ['product', 'quantity', 'unit_price', ...(discount ? ['discount'] : []), ...(tax ? ['tax_rate'] : []), 'amount'], column: 2 });
    app.block('orders', { block: 'note', of: 'totals', column: 2 });
    app.block('orders', { block: 'linked', collection: app.path('payments'), style: 'list', fields: ['amount', 'method'], column: 2, when: [{ field: 'status', op: 'is-not', value: ['Quote', 'Declined'] }] });

    // The list's tabs, Zoho's and QuickBooks': over each, what is to collect, what of it is late, what is in quotes.
    const notOver: Condition = { field: 'status', op: 'is-not', value: ['Paid', 'Cancelled', ...(quotes ? ['Quote', 'Declined'] : [])] };
    const sums = [
      { label: 'to collect', field: 'remaining' },
      { label: 'overdue', field: 'remaining', conditions: [{ field: 'late', op: 'true' as const }], warn: true as const },
      ...(quotes ? [{ label: 'in quotes', field: 'total', conditions: [{ field: 'status', op: 'is' as const, value: ['Quote'] }] }] : []),
    ];
    const columns = ['customer', 'date', 'total', 'remaining', 'status', 'state'];
    const tab = (id: string, name: string, conditions: Condition[], dir: 'asc' | 'desc' = 'desc') => app.view('orders', { id, name, conditions, sort: { key: 'date', dir }, columns, sums, set: 'sales' }, id === 'open');
    if (quotes) tab('quotes', 'Quotes', [{ field: 'status', op: 'is', value: ['Quote'] }]);
    tab('open', 'Open', [notOver]);
    tab('to-invoice', 'To invoice', [{ field: 'status', op: 'is', value: ['Delivered'] }], 'asc');
    tab('unpaid', 'Unpaid', [{ field: 'status', op: 'is', value: ['Invoiced'] }], 'asc');
    tab('paid', 'Paid', [{ field: 'status', op: 'is', value: ['Paid'] }]);
    app.view('orders', { id: 'month', name: 'This month', conditions: [{ field: 'this_month', op: 'true' }], sort: { key: 'date', dir: 'desc' }, hidden: true });
    // An invoice due comes to Today on its day with Record payment, late ones stay in Overdue; Upcoming has those to come.
    app.view('orders', { ...calendar({ start: 'due', color: 'status', upcoming: true, button: 'Record payment', words: ['customer', 'state'] }, [{ field: 'status', op: 'is', value: ['Invoiced'] }]), id: 'due', name: 'Due', hidden: true });
    app.homeTile('orders', { off: true });
    // Payments are counted on Home by Budget, when it is there; Sales says what is to collect.
    if (!app.has('budget')) app.homeTile('payments', { off: true });
    app.homeTiles('orders', [
      { view: 'unpaid', title: 'To collect', head: [{ label: '', field: 'remaining' }, { label: 'overdue', field: 'remaining', conditions: [{ field: 'late', op: 'true' }], warn: true }], value: 'state', sub: 'customer', empty: 'Nothing to collect.' },
      ...(quotes ? [{ view: 'quotes', title: 'Quotes', head: [{ label: 'open' }, { label: '', field: 'total' }], value: 'state', sub: 'customer', empty: 'No open quotes.' }] : []),
      { view: 'month', title: 'This month', head: [{ label: '', field: 'total' }, { label: 'orders', one: 'order' }], lines: [{ label: 'To invoice', field: 'total', conditions: [{ field: 'status', op: 'is', value: ['Delivered'] }] }, { label: 'Collected', field: 'collected' }, { label: 'Best customer', field: 'total', by: 'customer' }] },
    ]);

    // A customer: what is to collect from it and how much is late, over its orders on the right, + New quote.
    app.field(customer, rollup('to_collect', 'To collect', orders, 'sum', 'remaining', undefined, app.format(false)));
    app.field(customer, rollup('overdue_count', 'Overdue', orders, 'count', undefined, [{ field: 'late', op: 'true' }]));
    app.field(customer, formula('sales_said', 'Sales', `to_collect > 0 ? ${money('to_collect')} + " to collect" + (overdue_count > 0 ? " · " + text(overdue_count) + " overdue" : "") : ""`));
    app.block(customer, { block: 'linked', collection: orders, style: 'list', title: 'Orders', fields: ['state', 'remaining'], sort: 'date', dir: 'desc', add: quotes ? 'New quote' : 'New order', column: 3, tab: 'Related' });
    // A deal's quote, on the deal: + Quote makes one for its company; won, its quote is confirmed, lost, declined.
    if (deals) {
      app.boardAdd('deals', {
        blocks: [{ block: 'linked', collection: orders, style: 'list', title: quotes ? 'Quotes' : 'Orders', fields: ['state', 'total'], add: quotes ? 'Quote' : 'Order' }],
        ...(quotes && { back: { collection: orders, link: 'deal', field: 'status', from: ['Quote'], value: 'Confirmed' }, loses: { collection: orders, link: 'deal', field: 'status', from: ['Quote'], value: 'Declined' } }),
      });
    }

    app.field('order-lines', nameField('Item'));
    app.field('order-lines', link('order', 'Order', orders));
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

    const exempt = ['Cancelled', ...(quotes ? ['Quote', 'Declined'] : [])];
    app.rule('orders', {
      kind: 'check',
      name: 'An order needs at least one line',
      src: `check(null, () => ${exempt.map((s) => `status == "${s}"`).join(' || ')} || lines > 0, "An order needs at least one line")`,
    });
    // Its terms are its customer's, else the app's; a deal's company is its customer.
    app.rule('orders', {
      kind: 'onSave',
      name: 'Terms',
      src: `onSave("Terms", () => {${deals && customer === 'companies' ? `
  if (empty(customer) && !empty(deal) && !empty(deal.company)) customer = deal.company` : ''}
  if (empty(payment_terms)) payment_terms = !empty(customer) && !empty(customer.payment_terms) ? customer.payment_terms : ${JSON.stringify(terms)}
})`,
    });
    if (quotes) {
      app.rule('orders', {
        kind: 'action',
        name: 'Accept',
        src: `action("Accept", {
  when: () => status == "Quote",
  hint: "",
  done: () => code + " accepted",
}, () => {
  status = "Confirmed"${deals && won ? `
  if (!empty(deal)) move(deal, ${JSON.stringify(won)})` : ''}
})`,
      });
      app.rule('orders', {
        kind: 'action',
        name: 'Declined',
        src: `action("Declined", {
  when: () => status == "Quote",
  hint: "",
  ask: {
    why: { label: "Why", type: "choice", options: ${JSON.stringify(REASONS)}, chips: true },
  },
  done: () => code + " declined",
}, () => {
  status = "Declined"${deals && lost ? `
  if (!empty(deal)) move(deal, ${JSON.stringify(lost)}, { lost_reason: input.why })` : ''}
})`,
      });
    }
    // Invoice, Zoho's: the invoice's number and day; the due day from the terms.
    const invoiceable = ['Confirmed', ...(shipping ? ['Packed', 'Shipped'] : []), 'Delivered'];
    app.rule('orders', {
      kind: 'action',
      name: 'Invoice',
      src: `action("Invoice", {
  when: () => ${invoiceable.map((s) => `status == "${s}"`).join(' || ')},
  hint: "",
  ask: {
    invoice_no: { label: "Invoice no", type: "text", required: true },
    invoiced_on: { label: "Invoiced on", type: "date", default: () => today(), note: () => "Due " + ${short(`(empty(input.invoiced_on) ? today() : input.invoiced_on) + ${TERM_DAYS}`)} + " · " + payment_terms + (!empty(customer) && !empty(customer.payment_terms) ? ", " + customer.name + "'s terms" : "") },
  },
  done: () => code + " invoiced",
}, () => {
  invoice_no = input.invoice_no
  invoiced_on = empty(input.invoiced_on) ? today() : input.invoiced_on
  due = invoiced_on + ${TERM_DAYS}
  status = "Invoiced"
})`,
    });
    const budget = app.hasPiece('budget-lines');
    const party = customer === 'companies' && app.hasPiece('companies') ? ', company: customer' : '';
    app.rule('orders', {
      kind: 'action',
      name: 'Record payment',
      src: `action("Record payment", {
  when: () => ${exempt.map((s) => `status != "${s}"`).join(' && ')} && remaining > 0,
  hint: "",
  ask: {
    amount: { label: "Amount", type: "number", default: () => remaining, required: true, note: () => "Left to collect: " + ${money('remaining')} + " of " + ${money('total')} },
    paid_on: { label: "Paid on", type: "date", default: () => today() },
    method: { label: "Method", type: "choice", options: ${JSON.stringify(METHODS)}, chips: true, default: "Bank transfer" },
  },
  done: () => code + " · payment recorded",
}, () => {
  const day = empty(input.paid_on) ? today() : input.paid_on
  const waiting = linked("${app.called('payments')}").filter((p) => p.direction == "In" && p.status != "Paid")
  if (waiting.length > 0) {
    const first = waiting[0]
    if (input.amount < first.amount) add("${app.called('payments')}", { name: first.name, direction: "In", amount: first.amount - input.amount, status: first.status${byDueDay(app) ? ', due: first.due' : ''}${budget ? ', budget_line: first.budget_line' : ''}${party} })
    update(first, { amount: input.amount, status: "Paid", paid_on: day, method: input.method })
  } else {
    add("${app.called('payments')}", { name: code + " payment", direction: "In", amount: input.amount, status: "Paid", paid_on: day, method: input.method${budget ? `, budget_line: find("${app.called('budget-lines')}", { name: "Sales" })[0]` : ''}${party} })
  }
})`,
    });
    app.rule('orders', {
      kind: 'action',
      name: 'Cancel order',
      src: `action("Cancel order", {
  when: () => status != "Paid" && status != "Cancelled"${quotes ? ' && status != "Quote" && status != "Declined"' : ''},
  hint: "",
  confirm: true,
}, () => {
  status = "Cancelled"
})`,
    });

    app.field('payments', link('order', 'Order', orders));
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
      glance: ['Over the orders, what is to collect and what of it is late', ...(quotes ? ['Accept makes a quote an order'] : []), 'Invoice works out the due day', 'An invoice due comes to Today with Record payment'],
      how: [
        'Add your products with their price' + (tax ? ' and tax.' : '.'),
        `Add ${quotes ? 'a quote' : 'an order'} for a customer${deals ? ', or with + Quote on a deal,' : ''} and its lines: pick the product, write the quantity.`,
        ...(quotes ? ['When the customer says yes, press Accept; Declined asks why.'] : []),
        'Move it on as it goes, Delivered once the customer has it; press Invoice with the invoice’s number.',
        'Press Record payment when money comes in, on the order or in Today.',
      ],
      auto: [
        `A line takes its price${tax ? ', tax rate and whether tax is included' : ''} from its product when it is left empty.`,
        `A line works out its amount${discount ? ' with its discount' : ''}${tax ? ' and its tax' : ''}; the order adds its lines up and says what is left to collect.`,
        `An order takes its customer’s payment terms, else ${terms}; Invoice works out its due day from them.`,
        ...(quotes && deals ? ['Accept wins the quote’s deal and Declined loses it; a deal won confirms its quote, one lost declines it.'] : []),
        `An order${quotes ? ' past its quote' : ''} with no lines is marked.`,
        'Record payment asks how much came in: it pays a waiting payment, leaving what is not paid yet as a new one, or adds a paid one.',
        'When nothing is left to collect, the order is Paid.',
      ],
      work: [`${quotes ? 'A quote becomes Confirmed when the customer says yes. ' : ''}An order is Delivered when the customer has it, Invoiced once the invoice is sent.`, 'Who sends invoices, and when we remind a customer who has not paid.'],
    });
  },
};
