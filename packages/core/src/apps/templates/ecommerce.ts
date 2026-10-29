import type { Condition } from '../../collection';
import { calendar, checkbox, day, formula, link, nameField, number, PERCENT, rollup, select, symbolOf, text } from '../pieces';
import { byDueDay } from '../shared';
import type { AppTemplate } from '../types';
import { lineFormat } from './sales';
import { movement } from './stock';

// E-commerce (design/calendar.md 7): selling on marketplaces and a site of one's own, on top of
// Sales, and of Stock when it is there, as Sellbrite, Shopify and Sellerboard show it. What is to
// ship is a list by the day it must go, the channels chips over it; Ship asks the carrier and the
// tracking number; an order says what it really earns in one line, and when its channel pays it;
// Return asks which items come back and why, the refund worked out from them; a return received
// goes back into stock.

const CHANNELS = ['Amazon', 'eBay', 'Etsy', 'Own site'];
const CARRIERS = ['DHL', 'UPS', 'FedEx', 'DPD'];
/** The lists where they are not the usual ones, by the region of the device that asks. */
const CHANNELS_IN: { [region: string]: string[] } = { TR: ['Trendyol', 'Hepsiburada', 'Amazon', 'Own site'] };
const CARRIERS_IN: { [region: string]: string[] } = { TR: ['Yurtiçi Kargo', 'Aras Kargo', 'MNG Kargo', 'PTT Kargo'] };
const REASONS = ['Damaged', 'Wrong item', 'Changed mind', 'Other'];

/** The statuses of an order once it has gone out. */
export const SENT = ['Shipped', 'Delivered', 'Invoiced', 'Paid'];

/** A day as an order to ship says it: "Today", "1 day late", "Tomorrow", "Sat, Oct 31". */
const shipDay = (d: string) =>
  `empty(${d}) ? "" : ${d} < today() ? text(today() - ${d}) + (today() - ${d} == 1 ? " day late" : " days late") : ${d} == today() ? "Today" : ${d} == today() + 1 ? "Tomorrow" : weekday(${d}) + ", " + monthname(${d}) + " " + text(monthday(${d}))`;

export const ecommerce: AppTemplate = {
  id: 'ecommerce',
  version: 2,
  group: 'money',
  name: 'apps.ecommerce.name',
  short: 'apps.ecommerce.short',
  icon: 'globe',
  what: 'apps.ecommerce.what',
  questions: [
    { key: 'channels', kind: 'list', label: 'apps.ecommerce.channels', default: CHANNELS, regional: CHANNELS_IN, help: 'apps.ecommerce.channelsHelp', add: 'apps.ecommerce.addChannel' },
    { key: 'carriers', kind: 'list', label: 'apps.ecommerce.carriers', default: CARRIERS, regional: CARRIERS_IN, add: 'apps.ecommerce.addCarrier' },
    { key: 'returns', kind: 'yesno', label: 'apps.ecommerce.returns', default: true },
    { key: 'budget', kind: 'yesno', label: 'apps.ecommerce.budget', default: true, when: ({ chosen }) => chosen.has('budget'), because: 'budget' },
  ],
  money: () => true,
  pieces: (answers) => ['channels', ...(answers.returns !== false ? ['returns'] : []), 'products', 'orders', 'order-lines'],
  menu: [{ role: 'orders', view: 'to-ship', name: 'Orders' }, 'returns', 'channels'],
  build(app, answers) {
    const channels = ((answers.channels as string[] | undefined) ?? CHANNELS).map((c) => c.trim()).filter(Boolean);
    const carriers = ((answers.carriers as string[] | undefined) ?? CARRIERS).map((c) => c.trim()).filter(Boolean);
    const returns = app.hasPiece('returns');
    const budget = app.has('budget') && app.hasPiece('payments') && answers.budget !== false;
    const stock = app.hasPiece('stock-movements');
    const places = stock && app.hasPiece('locations') && app.answers('stock').locations === true;
    const tax = app.answers('sales').tax !== false;
    const quotes = app.answers('sales').quotes !== false;
    const main = app.format(false);
    const own = app.format(true);
    const orders = app.path('orders');
    const lines = app.path('order-lines');
    const sym = JSON.stringify(symbolOf(app.money.main));
    const money = (expr: string) => `${sym} + amount(${expr})`;
    // Payments and the Sales budget line, there with Budget.
    const pay = budget ? app.called('payments') : '';
    const salesLine = budget ? `find("${app.called('budget-lines')}", { name: "Sales" })[0]` : '';
    // What an order or a line earns before the tax: its net with tax, else its amount.
    const base = tax ? 'subtotal' : 'total';
    const notCounted = ['Cancelled', ...(quotes ? ['Quote', 'Declined'] : [])];

    app.field('channels', nameField());
    app.field('channels', number('commission', 'Commission', { format: PERCENT }));
    app.field('channels', number('fee', 'Fee per order', { format: main }));
    app.field('channels', { ...number('ship_days', 'Ships within (days)'), help: 'Its orders must be shipped this many days after they come' });
    app.field('channels', number('payout_days', 'Paid after (days)'));
    app.field('channels', rollup('orders', 'Orders', orders, 'count', undefined, [{ field: 'status', op: 'is-not', value: notCounted }]));
    app.field('channels', rollup('revenue', 'Revenue', orders, 'sum', 'total', [{ field: 'status', op: 'is-not', value: notCounted }], main));
    app.field('channels', rollup('net_profit', 'Net profit', orders, 'sum', 'net_profit', [{ field: 'status', op: 'is-not', value: notCounted }], main));
    for (const name of channels) app.record('channels', { name, ship_days: 2 });
    app.homeTile('channels', { off: true });

    // Products: what each costs, if Stock does not say, and what it sold, came back and earned.
    app.field('products', number('cost', 'Cost', { format: main }));
    app.field('order-lines', { key: 'cost', label: 'Cost', type: 'formula', formula: 'empty(product) || empty(product.cost) ? 0 : quantity * product.cost', format: lineFormat(app) });
    app.field('order-lines', { key: 'profit', label: 'Profit', type: 'formula', formula: `${tax ? 'net' : 'amount'} - cost`, format: lineFormat(app) });
    app.field('order-lines', formula('line_said', 'Item', 'name + (quantity > 1 ? " × " + text(quantity) : "")'));
    // A line says how its order stands, for a product to count only what was sold: not a quote, not cancelled.
    app.field('order-lines', { key: 'order_status', label: 'Order status', type: 'lookup', lookup: { link: 'order', field: 'status' } });
    const sales = [{ field: 'order_status', op: 'is-not' as const, value: notCounted }];
    app.field('products', rollup('sold', 'Sold', lines, 'sum', 'quantity', sales));
    if (returns) {
      app.field('products', rollup('returned', 'Returned', app.path('returns'), 'sum', 'quantity'));
      app.field('products', { key: 'return_rate', label: 'Return rate', type: 'formula', formula: 'sold > 0 ? returned / sold : 0', format: PERCENT });
    }
    app.field('products', rollup('profit', 'Profit', lines, 'sum', 'profit', sales, main));

    // Orders: where it came from, by when and how it goes out, and what it earns.
    // What a channel's order has; an order with no channel, a customer's, has none of it.
    const sold: Condition[] = [{ field: 'channel', op: 'not-empty' }];
    const gone: Condition[] = [...sold, { field: 'status', op: 'is', value: SENT }];
    app.field('orders', link('channel', 'Channel', app.path('channels')));
    app.field('orders', { ...text('marketplace_no', 'Order no'), when: sold });
    app.field('orders', { ...text('buyer', 'Buyer'), when: sold });
    app.field('orders', { ...day('ship_by', 'Ship by'), when: sold });
    app.field('orders', { ...(carriers.length > 0 ? select('carrier', 'Carrier', carriers) : text('carrier', 'Carrier')), when: gone });
    app.field('orders', { ...text('tracking', 'Tracking no'), when: gone });
    app.field('orders', { ...day('shipped_on', 'Shipped on'), when: gone });
    app.field('orders', { ...day('delivered_on', 'Delivered on'), when: [...sold, { field: 'status', op: 'is', value: ['Delivered', 'Invoiced', 'Paid'] }] });
    app.field('orders', { ...number('shipping_cost', 'Shipping cost', { format: own }), when: sold });
    app.field('orders', { key: 'commission', label: 'Commission', type: 'formula', formula: 'empty(channel) ? 0 : (empty(channel.commission) ? 0 : total * channel.commission) + (empty(channel.fee) ? 0 : channel.fee)', format: own });
    app.field('orders', rollup('cost', 'Product cost', lines, 'sum', 'cost', undefined, own));
    app.field('orders', { key: 'net_profit', label: 'Net profit', type: 'formula', formula: `${base} - commission - (empty(shipping_cost) ? 0 : shipping_cost) - cost`, format: own });
    app.field('orders', { key: 'margin', label: 'Margin', type: 'formula', formula: `${base} > 0 ? net_profit / ${base} : 0`, format: PERCENT });
    app.field('orders', rollup('items', 'Items', lines, 'list', 'line_said'));
    app.field('orders', formula('shop_title', 'Order', `(empty(channel) ? "" : channel.name + " · ") + (empty(marketplace_no) ? code : marketplace_no)`));
    const notSent = [...SENT, 'Cancelled', ...(quotes ? ['Quote', 'Declined'] : [])].map((s) => `status != "${s}"`).join(' && ');
    app.field('orders', formula('to_ship', 'To ship', `!empty(ship_by) && ${notSent}`));
    app.field('orders', formula('ship_late', 'Late to ship', `to_ship && ship_by < today()`));
    app.field('orders', formula('ship_said', 'Ship by', shipDay('ship_by')));
    // Its money in one line, SellerLogic's: "₺1.240 · commission ₺248 · shipping ₺60 · cost ₺520 → ₺412 profit · 33%".
    app.field(
      'orders',
      formula(
        'profit_said',
        'Profit',
        `empty(channel) ? "" : ${money(base)} + " · commission " + ${money('commission')} + (empty(shipping_cost) ? "" : " · shipping " + ${money('shipping_cost')}) + (cost > 0 ? " · cost " + ${money('cost')} : "") + " → " + ${money('net_profit')} + " profit · " + text(round(margin * 100)) + "%"`,
      ),
    );
    // When the channel pays it: "Payout ₺992 on Nov 12, 14 days after it is delivered".
    app.field('orders', formula('payout', 'Payout', 'empty(channel) ? 0 : total - commission', own));
    app.field('orders', day('payout_on', 'Paid out on'));
    app.field(
      'orders',
      formula(
        'payout_said',
        'Payout',
        `empty(channel) ? "" : "Payout " + ${money('payout')} + (empty(delivered_on) ? "" : " on " + monthname(delivered_on + (empty(channel.payout_days) ? 0 : channel.payout_days)) + " " + text(monthday(delivered_on + (empty(channel.payout_days) ? 0 : channel.payout_days)))) + (empty(channel.payout_days) ? "" : ", " + text(channel.payout_days) + " days after it is delivered")`,
      ),
    );
    app.field('orders', formula('payout_due', 'Payout due', `empty(channel) || empty(delivered_on) ? null : delivered_on + (empty(channel.payout_days) ? 0 : channel.payout_days)`));
    app.field('orders', formula('payout_short', 'Payout', `${money('payout')} + (empty(payout_due) ? "" : " · " + monthname(payout_due) + " " + text(monthday(payout_due)))`));
    // A new order asks where it came from too; one of a channel comes confirmed, the marketplace has taken it.
    const deals = app.hasPiece('deals') && app.has('crm');
    app.newForm('orders', ['customer', ...(deals ? ['deal'] : []), 'channel', 'marketplace_no', 'buyer', 'date', ...(quotes ? ['valid_until'] : [])]);
    app.block('orders', { block: 'note', of: 'profit_said', column: 2 });
    app.block('orders', { block: 'note', of: 'payout_said', column: 2 });
    // The day it must go by, from its channel; the day it is delivered, for its payout.
    app.rule('orders', {
      kind: 'onSave',
      name: 'Ship by',
      src: `onSave("Ship by", () => {
  if (!empty(channel) && empty(old.status) && status == "Quote") status = "Confirmed"
  if (empty(ship_by) && !empty(channel) && !empty(channel.ship_days)) ship_by = (empty(date) ? today() : date) + channel.ship_days
  if (status == "Delivered" && old.status != "Delivered" && empty(delivered_on)) delivered_on = today()
})`,
    });

    // To ship, Sellbrite's: by the day each must go, the channels as chips; what is late is said.
    const toShip: Condition[] = [{ field: 'to_ship', op: 'true' }];
    const sums = [{ label: 'to ship', conditions: toShip }, { label: 'today', conditions: [...toShip, { field: 'ship_by', op: 'on' as const, value: 'today' }] }, { label: 'late', conditions: [{ field: 'ship_late', op: 'true' as const }], warn: true as const }];
    const columns = ['ship_said', 'channel', 'marketplace_no', 'items', 'total', 'status'];
    const tab = (id: string, name: string, conditions: Condition[], sort: { key: string; dir: 'asc' | 'desc' }) => app.view('orders', { id, name, conditions, sort, columns, sums, chips: 'channel', set: 'shipping', ...(id === 'to-ship' && { button: 'Ship' }) });
    tab('to-ship', 'To ship', toShip, { key: 'ship_by', dir: 'asc' });
    tab('shipped', 'Shipped', [{ field: 'status', op: 'is', value: ['Shipped'] }], { key: 'shipped_on', dir: 'desc' });
    tab('delivered', 'Delivered', [{ field: 'status', op: 'is', value: ['Delivered', 'Invoiced', 'Paid'] }, { field: 'channel', op: 'not-empty' }], { key: 'delivered_on', dir: 'desc' });
    tab('cancelled', 'Cancelled', [{ field: 'status', op: 'is', value: ['Cancelled'] }, { field: 'channel', op: 'not-empty' }], { key: 'date', dir: 'desc' });
    app.view('orders', { id: 'channel-orders', name: 'Channel orders', conditions: [{ field: 'channel', op: 'not-empty' }, { field: 'status', op: 'is-not', value: notCounted }], hidden: true });
    app.view('orders', { id: 'payouts', name: 'Payouts', conditions: [{ field: 'channel', op: 'not-empty' }, { field: 'payout_due', op: 'not-empty' }, { field: 'payout_on', op: 'empty' }], sort: { key: 'payout_due', dir: 'asc' }, hidden: true });
    // What is to go is in Today on its day with Ship, Upcoming before; a late one stays in Overdue.
    app.view('orders', { ...calendar({ start: 'ship_by', color: 'channel', upcoming: true, button: 'Ship', words: ['shop_title', 'items'] }, toShip), id: 'ship-calendar', name: 'To ship', hidden: true });
    app.homeTiles('orders', [
      { view: 'channel-orders', title: 'Sales by day', periods: { date: 'date', columns: [{ label: 'Orders' }, { label: 'Sales', field: 'total' }, { label: 'Profit', field: 'net_profit' }, { label: 'Margin', field: 'net_profit', per: base }] } },
      { view: 'to-ship', title: 'To ship', head: [{ label: '' }, { label: 'today', conditions: [{ field: 'ship_by', op: 'on', value: 'today' }] }, { label: 'late', conditions: [{ field: 'ship_late', op: 'true' }], warn: true }], value: 'ship_said', sub: 'shop_title', empty: 'Nothing to ship.' },
      { view: 'payouts', title: 'Payouts', head: [{ label: '', field: 'payout' }], value: 'payout_short', sub: 'shop_title', empty: 'No payout to come.' },
    ]);
    app.rule('orders', {
      kind: 'action',
      name: 'Ship',
      src: `action("Ship", {
  when: () => status == "Confirmed" || status == "Packed",
  hint: "",
  ask: {
    carrier: { label: "Carrier", ${carriers.length > 0 ? `type: "choice", options: ${JSON.stringify(carriers)}, chips: true, default: () => empty(carrier) ? ${JSON.stringify(carriers[0])} : carrier` : 'type: "text", default: () => carrier'} },
    tracking: { label: "Tracking no", type: "text" },
    shipped_on: { label: "Shipped on", type: "date", default: () => today() },
  },
  done: () => shop_title + " shipped",
}, () => {
  status = "Shipped"
  if (!empty(input.carrier)) carrier = input.carrier
  if (!empty(input.tracking)) tracking = input.tracking
  shipped_on = empty(input.shipped_on) ? today() : input.shipped_on
})`,
    });

    if (returns) {
      const back = app.called('returns');
      app.field('returns', nameField('Title'));
      app.field('returns', link('order', 'Order', orders));
      app.field('returns', link('product', 'Product', app.path('products')));
      app.field('returns', number('quantity', 'Quantity', { default: 1 }));
      app.field('returns', select('reason', 'Why', REASONS, { Damaged: 'red', 'Wrong item': 'orange', 'Changed mind': 'blue', Other: 'gray' }));
      app.field('returns', select('status', 'Status', ['Requested', 'Received', 'Refunded', 'Rejected'], { Requested: 'blue', Received: 'yellow', Refunded: 'green', Rejected: 'gray' }, 'Requested'));
      app.field('returns', number('refund', 'Refund', { format: main }));
      app.field('returns', link('channel', 'Channel', app.path('channels')));
      if (stock) app.field('returns', checkbox('restocked', 'Back in stock'));
      app.field('channels', rollup('returns', 'Returns', app.path('returns'), 'count'));
      app.field('channels', { key: 'return_rate', label: 'Return rate', type: 'formula', formula: 'orders > 0 ? returns / orders : 0', format: PERCENT });
      app.block('orders', { block: 'linked', collection: app.path('returns'), style: 'list', title: 'Returns', fields: ['quantity', 'status'], column: 2, when: [{ field: 'status', op: 'is', value: SENT }] });
      app.view('returns', { id: 'waiting', name: 'Waiting', conditions: [{ field: 'status', op: 'is', value: ['Requested', 'Received'] }], sort: { key: 'name', dir: 'asc' }, columns: ['order', 'product', 'quantity', 'reason', 'status', 'refund'] }, true);
      app.view('returns', { id: 'done', name: 'Done', conditions: [{ field: 'status', op: 'is', value: ['Refunded', 'Rejected'] }], columns: ['order', 'product', 'quantity', 'reason', 'status', 'refund'] });
      // Return, Shopify's: the items that come back and why; the refund worked out from them.
      app.rule('orders', {
        kind: 'action',
        name: 'Return',
        src: `action("Return", {
  when: () => ${SENT.map((s) => `status == "${s}"`).join(' || ')},
  hint: "",
  ask: {
    items: { label: "Back", type: "rows", collection: "${app.called('order-lines')}", show: { quantity: "Sent" }, why: { label: "Why", options: ${JSON.stringify(REASONS)} }, required: true },
  },
  done: () => "Return of " + shop_title + " added",
}, () => {
  for (const l of input.items) {
    if (l.count > 0) add("${back}", { name: "Return of " + (empty(marketplace_no) ? code : marketplace_no), product: l.row.product, quantity: l.count, reason: l.why, refund: round(l.row.amount / l.row.quantity * min(l.count, l.row.quantity), 2), channel: channel })
  }
})`,
      });
      app.rule('returns', {
        kind: 'onSave',
        name: 'Channel',
        src: `onSave("Channel", () => {
  if (empty(channel) && !empty(order)) channel = order.channel
})`,
      });
      app.rule('returns', {
        kind: 'action',
        name: 'Received',
        src: `action("Received", {
  when: () => status == "Requested",${stock ? `
  hint: "",
  ask: {
    restock: { label: "Back in stock", type: "tick", default: true, note: "Take it off when it is damaged" },
  },` : ''}
  done: () => name + " received",
}, () => {
  status = "Received"${stock ? `
  if (input.restock && !empty(product) && quantity > 0) {
    restocked = true
${movement(app, '    ', 'product: product, direction: "In", type: "return", quantity: quantity', 'product', places ? 'order.location' : null)}
  }` : ''}
})`,
      });
      app.rule('returns', {
        kind: 'action',
        name: 'Refunded',
        src: `action("Refunded", {
  when: () => status == "Requested" || status == "Received",
  hint: "",
  done: () => name + " refunded",
}, () => {
  status = "Refunded"
})`,
      });
      app.homeTile('returns', { view: 'waiting', title: 'Returns', head: [{ label: 'waiting' }], value: 'status', sub: 'product', empty: 'No returns waiting.' });
      if (budget) {
        app.field('payments', link('return', 'Return', app.path('returns')));
        app.rule('returns', {
          kind: 'onSave',
          name: 'Refund',
          src: `onSave("Refund", () => {
  if (status == "Refunded" && old.status != "Refunded" && refund > 0 && linked("${pay}").length == 0) {
    add("${pay}", { name: name, direction: "Out", amount: refund, status: "Paid", paid_on: today(), order: order, budget_line: ${salesLine} })
  }
})`,
        });
      }
    }
    if (budget) {
      app.rule('orders', {
        kind: 'onSave',
        name: 'Payout',
        src: `onSave("Payout", () => {
  if (status == "Delivered" && old.status != "Delivered" && !empty(channel) && linked("${pay}").filter((p) => p.name == code + " payout").length == 0) {
    add("${pay}", { name: code + " payout", direction: "In", amount: total - commission, status: "Planned"${byDueDay(app) ? ', due: today() + (empty(channel.payout_days) ? 0 : channel.payout_days)' : ''}, budget_line: ${salesLine} })
  }
})`,
      });
    }

    app.about({
      title: 'E-commerce',
      what: `Selling${channels.length > 0 ? ` on ${channels.join(', ')}` : ''}: what is to ship by its day, each channel's commission and when it pays${returns ? ', returns' : ''} and what each order really earns.`,
      pieces: ['channels', ...(returns ? ['returns'] : [])],
      glance: ['To ship by the day each must go, the channels as chips', 'Today has what goes today, with Ship', 'An order says its profit in one line, and when it is paid out', ...(returns ? ['Return asks which items come back and why'] : [])],
      how: [
        'Write each channel’s commission, its fee per order, within how many days its orders ship and after how many days it pays.',
        'Add an order with its channel and its order no; the agent can bring them from a marketplace’s file.',
        'Press Ship when it goes out, on the order or in Today.',
        ...(returns ? ['When something comes back, press Return on its order and pick the items; then Received, then Refunded.'] : []),
      ],
      auto: [
        'An order’s ship by day is its day and its channel’s days.',
        'An order works out its commission from its channel, what its products cost, its net profit and margin, and its payout.',
        'An order not shipped by its day is said late, in red, and stays in Overdue.',
        'A product counts what it sold' + (returns ? ' and what came back' : '') + ', and what it earned.',
        ...(returns ? ['A return’s refund is worked out from its items.'] : []),
        ...(returns && stock ? ['A return Received goes back into stock, unless Back in stock is taken off.'] : []),
        ...(returns && budget ? [`A return Refunded adds a payment out to ${pay}.`] : []),
        ...(budget ? [`An order Delivered adds the channel’s payout to ${pay}, its total less the commission, due after the channel’s days.`] : []),
      ],
      work: ['Who packs and ships, and by when.', 'How returns are accepted, and who decides a refund.', 'How the marketplaces’ files are brought in.'],
    });
  },
};
