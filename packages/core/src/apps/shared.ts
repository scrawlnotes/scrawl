import { codeField, currencyField, day, formula, link, multi, nameField, number, person, select, text } from './pieces';
import type { AppDraft } from './types';

// What a shared piece starts with, whichever template sets it up: each template that uses it
// calls these first, and adds its own fields after. A field set up once is kept as it is.

export function companies(app: AppDraft) {
  if (!app.hasPiece('companies')) return;
  app.field('companies', nameField());
  app.field('companies', { key: 'website', label: 'Website', type: 'url' });
  app.field('companies', multi('type', 'Type', ['customer', 'supplier', 'partner'], { customer: 'green', supplier: 'orange', partner: 'purple' }));
  app.field('companies', person('owner', 'Owner'));
}

export function people(app: AppDraft) {
  if (!app.hasPiece('people')) return;
  app.field('people', nameField());
  if (app.hasPiece('companies')) app.field('people', link('company', 'Company', app.path('companies')));
  app.field('people', { key: 'email', label: 'Email', type: 'email' });
  app.field('people', { key: 'phone', label: 'Phone', type: 'phone' });
  app.field('people', text('title', 'Title'));
}

/** The units a product is sold in: by the piece and by weight for goods, by time for services. */
const UNITS = { products: ['piece', 'kg', 'litre', 'box'], services: ['hour', 'day', 'month', 'project'] };

export function products(app: AppDraft) {
  const sells = app.has('sales') ? (app.answers('sales').sells as string) : 'products';
  app.field('products', nameField());
  app.field('products', codeField('PRD-'));
  if (sells === 'both') app.field('products', select('type', 'Type', ['product', 'service'], { product: 'blue', service: 'purple' }, 'product'));
  const units = sells === 'products' ? UNITS.products : sells === 'services' ? UNITS.services : [...UNITS.products, ...UNITS.services];
  app.field('products', select('unit', 'Unit', units, {}, units[0]));
  app.field('products', number('price', 'Price', { format: app.format(false) }));
}

/** Whether a product of this app may be a service, which no stock is kept of. */
export const hasServices = (app: AppDraft) => app.has('sales') && app.answers('sales').sells === 'both';

/** Whether payments are followed by their due day: Budget asks; without it they are. */
export const byDueDay = (app: AppDraft) => !app.has('budget') || app.answers('budget').due !== false;

export function payments(app: AppDraft) {
  app.field('payments', nameField());
  app.field('payments', select('direction', 'Direction', ['In', 'Out'], { In: 'green', Out: 'red' }, 'Out'));
  app.field('payments', number('amount', 'Amount', { required: true, format: app.format(true) }));
  if (app.money.multi) app.field('payments', currencyField(app));
  app.field('payments', day('date', 'Date', true));
  app.field('payments', select('status', 'Status', ['Planned', 'Invoiced', 'Paid'], { Planned: 'gray', Invoiced: 'yellow', Paid: 'green' }, 'Planned'));
  if (byDueDay(app)) app.field('payments', day('due', 'Due'));
  app.field('payments', day('paid_on', 'Paid on'));
  app.field('payments', select('method', 'Method', ['Bank transfer', 'Card', 'Cash'], {}));
  app.field('payments', text('invoice_no', 'Invoice no'));
  if (app.hasPiece('companies')) app.field('payments', link('company', 'Company', app.path('companies')));
  if (byDueDay(app)) app.field('payments', formula('overdue', 'Overdue', 'status != "Paid" && due < today()'));
  app.rule('payments', {
    kind: 'onSave',
    name: 'Paid date',
    src: `onSave("Paid date", () => {
  if (status == "Paid" && old.status != "Paid" && empty(paid_on)) paid_on = today()
})`,
  });
}

/** The places of Stock's warehouses and of Assets: one list. */
export function locations(app: AppDraft) {
  app.field('locations', nameField());
  app.field('locations', text('address', 'Address'));
}

export function feedback(app: AppDraft) {
  app.field('feedback', nameField('Title'));
  if (app.hasPiece('people')) app.field('feedback', link('person', 'Person', app.path('people')));
  if (app.hasPiece('companies')) app.field('feedback', link('company', 'Company', app.path('companies')));
  app.field('feedback', select('source', 'Source', ['email', 'call', 'interview', 'social', 'support'], { email: 'yellow', call: 'blue', interview: 'purple', social: 'pink', support: 'orange' }));
  app.field('feedback', text('topic', 'Topic'));
  app.field('feedback', select('status', 'Status', ['new', 'planned', 'done', 'declined'], { new: 'blue', planned: 'yellow', done: 'green', declined: 'gray' }, 'new'));
  if (app.hasPiece('people')) app.block('people', { block: 'linked', collection: app.path('feedback'), style: 'list', fields: ['status'] });
  if (app.hasPiece('companies')) app.block('companies', { block: 'linked', collection: app.path('feedback'), style: 'list', fields: ['status'] });
}

