import { link, nameField, number, PERCENT, rollup, select, text } from '../pieces';
import { byDueDay } from '../shared';
import type { AppTemplate } from '../types';
import { lineFormat } from './sales';
import { movement } from './stock';

// E-commerce (design/calendar.md 7): selling on marketplaces and a site of one's own, on top of
// Sales, and of Stock when it is there. Each channel takes its commission and pays later; an order
// says what it really earns, from its total less the commission, its shipping and what its products
// cost; it is shipped by a day, with its carrier and tracking number; what comes back is a return,
// back in stock when received, paid back when refunded.

const CHANNELS = ['Amazon', 'eBay', 'Etsy', 'Own site'];
const CARRIERS = ['DHL', 'UPS', 'FedEx', 'DPD'];
/** The lists where they are not the usual ones, by the region of the device that asks. */
const CHANNELS_IN: { [region: string]: string[] } = { TR: ['Trendyol', 'Hepsiburada', 'Amazon', 'Own site'] };
const CARRIERS_IN: { [region: string]: string[] } = { TR: ['Yurtiçi Kargo', 'Aras Kargo', 'MNG Kargo', 'PTT Kargo'] };
const REASONS = ['Damaged', 'Wrong item', 'Changed mind', 'Other'];

/** The statuses of an order once it has gone out. */
export const SENT = ['Shipped', 'Delivered', 'Invoiced', 'Paid'];

export const ecommerce: AppTemplate = {
  id: 'ecommerce',
  version: 1,
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
  build(app, answers) {
    const channels = ((answers.channels as string[] | undefined) ?? CHANNELS).map((c) => c.trim()).filter(Boolean);
    const carriers = ((answers.carriers as string[] | undefined) ?? CARRIERS).map((c) => c.trim()).filter(Boolean);
    const returns = app.hasPiece('returns');
    const budget = app.has('budget') && app.hasPiece('payments') && answers.budget !== false;
    const stock = app.hasPiece('stock-movements');
    const places = stock && app.hasPiece('locations') && app.answers('stock').locations === true;
    const tax = app.answers('sales').tax !== false;
    const main = app.format(false);
    const own = app.format(true);
    const orders = app.path('orders');
    const lines = app.path('order-lines');
    // Payments and the Sales budget line, there with Budget.
    const pay = budget ? app.called('payments') : '';
    const salesLine = budget ? `find("${app.called('budget-lines')}", { name: "Sales" })[0]` : '';
    // What an order or a line earns before the tax: its net with tax, else its amount.
    const base = tax ? 'subtotal' : 'total';

    app.field('channels', nameField());
    app.field('channels', number('commission', 'Commission', { format: PERCENT }));
    app.field('channels', number('fee', 'Fee per order', { format: main }));
    app.field('channels', number('payout_days', 'Paid after (days)'));
    app.field('channels', rollup('orders', 'Orders', orders, 'count', undefined, [{ field: 'status', op: 'is-not', value: ['Cancelled', 'Quote'] }]));
    app.field('channels', rollup('revenue', 'Revenue', orders, 'sum', 'total', [{ field: 'status', op: 'is-not', value: ['Cancelled', 'Quote'] }], main));
    app.field('channels', rollup('net_profit', 'Net profit', orders, 'sum', 'net_profit', [{ field: 'status', op: 'is-not', value: ['Cancelled', 'Quote'] }], main));
    for (const name of channels) app.record('channels', { name });

    // Products: what each costs, if Stock does not say, and what it sold, came back and earned.
    app.field('products', number('cost', 'Cost', { format: main }));
    app.field('order-lines', { key: 'cost', label: 'Cost', type: 'formula', formula: 'empty(product) || empty(product.cost) ? 0 : quantity * product.cost', format: lineFormat(app) });
    app.field('order-lines', { key: 'profit', label: 'Profit', type: 'formula', formula: `${tax ? 'net' : 'amount'} - cost`, format: lineFormat(app) });
    // A line says how its order stands, for a product to count only what was sold: not a quote, not cancelled.
    app.field('order-lines', { key: 'order_status', label: 'Order status', type: 'lookup', lookup: { link: 'order', field: 'status' } });
    const sold = [{ field: 'order_status', op: 'is-not' as const, value: ['Cancelled', 'Quote'] }];
    app.field('products', rollup('sold', 'Sold', lines, 'sum', 'quantity', sold));
    if (returns) {
      app.field('products', rollup('returned', 'Returned', app.path('returns'), 'sum', 'quantity'));
      app.field('products', { key: 'return_rate', label: 'Return rate', type: 'formula', formula: 'sold > 0 ? returned / sold : 0', format: PERCENT });
    }
    app.field('products', rollup('profit', 'Profit', lines, 'sum', 'profit', sold, main));

    // Orders: where it came from, by when and how it goes out, and what it earns.
    app.field('orders', link('channel', 'Channel', app.path('channels')));
    app.field('orders', text('marketplace_no', 'Marketplace order no'));
    app.field('orders', { key: 'ship_by', label: 'Ship by', type: 'date' });
    app.field('orders', carriers.length > 0 ? select('carrier', 'Carrier', carriers) : text('carrier', 'Carrier'));
    app.field('orders', text('tracking', 'Tracking no'));
    app.field('orders', number('shipping_cost', 'Shipping cost', { format: own }));
    app.field('orders', { key: 'commission', label: 'Commission', type: 'formula', formula: 'empty(channel) ? 0 : (empty(channel.commission) ? 0 : total * channel.commission) + (empty(channel.fee) ? 0 : channel.fee)', format: own });
    app.field('orders', rollup('cost', 'Product cost', lines, 'sum', 'cost', undefined, own));
    app.field('orders', { key: 'net_profit', label: 'Net profit', type: 'formula', formula: `${base} - commission - (empty(shipping_cost) ? 0 : shipping_cost) - cost`, format: own });
    app.field('orders', { key: 'margin', label: 'Margin', type: 'formula', formula: `${base} > 0 ? net_profit / ${base} : 0`, format: PERCENT });
    app.view('orders', {
      id: 'to-ship',
      name: 'To ship',
      kind: 'calendar',
      calendar: { start: 'ship_by', color: 'channel', upcoming: true },
      conditions: [{ field: 'status', op: 'is-not', value: [...SENT, 'Cancelled', 'Quote'] }],
    });
    const notSent = [...SENT, 'Cancelled'].map((s) => `status != "${s}"`).join(' && ');
    app.rule('orders', { kind: 'check', name: 'Late to ship', src: `check("ship_by", () => empty(ship_by) || ship_by >= today() || !(${notSent}), "Late to ship")` });
    app.rule('orders', {
      kind: 'action',
      name: 'Ship',
      src: `action("Ship", {
  when: () => status == "Confirmed" || status == "Packed",
  hint: "Only a confirmed or a packed one",
  ask: {
    carrier: { label: "Carrier", ${carriers.length > 0 ? `type: "choice", options: [${carriers.map((c) => JSON.stringify(c)).join(', ')}]` : 'type: "text"'}, default: () => carrier },
    tracking: { label: "Tracking no", type: "text" },
  },
}, () => {
  status = "Shipped"
  if (!empty(input.carrier)) carrier = input.carrier
  if (!empty(input.tracking)) tracking = input.tracking
})`,
    });

    if (returns) {
      const back = app.called('returns');
      app.field('returns', nameField('Title'));
      app.field('returns', link('order', 'Order', orders));
      app.field('returns', link('product', 'Product', app.path('products')));
      app.field('returns', number('quantity', 'Quantity', { default: 1 }));
      app.field('returns', select('reason', 'Reason', REASONS, { Damaged: 'red', 'Wrong item': 'orange', 'Changed mind': 'blue', Other: 'gray' }));
      app.field('returns', select('status', 'Status', ['Requested', 'Received', 'Refunded', 'Rejected'], { Requested: 'blue', Received: 'yellow', Refunded: 'green', Rejected: 'gray' }, 'Requested'));
      app.field('returns', number('refund', 'Refund', { format: main }));
      app.field('returns', link('channel', 'Channel', app.path('channels')));
      app.field('channels', rollup('returns', 'Returns', app.path('returns'), 'count'));
      app.field('channels', { key: 'return_rate', label: 'Return rate', type: 'formula', formula: 'orders > 0 ? returns / orders : 0', format: PERCENT });
      app.block('orders', { block: 'linked', collection: app.path('returns'), style: 'list', fields: ['product', 'quantity', 'status'] });
      app.rule('orders', {
        kind: 'action',
        name: 'Return',
        src: `action("Return", {
  when: () => ${SENT.map((s) => `status == "${s}"`).join(' || ')},
  hint: "Only one that went out",
  ask: {
    product: { label: "Product", type: "link", collection: "${app.called('products')}", required: true },
    quantity: { label: "Quantity", type: "number", default: () => 1, required: true },
    reason: { label: "Reason", type: "choice", options: [${REASONS.map((r) => JSON.stringify(r)).join(', ')}] },
  },
}, () => {
  add("${back}", { name: "Return of " + code, product: input.product, quantity: input.quantity, reason: input.reason, channel: channel })
})`,
      });
      app.rule('returns', {
        kind: 'onSave',
        name: 'Channel',
        src: `onSave("Channel", () => {
  if (empty(channel) && !empty(order)) channel = order.channel
})`,
      });
      if (stock) {
        app.rule('returns', {
          kind: 'onSave',
          name: 'Back in stock',
          src: `onSave("Back in stock", () => {
  if (status == "Received" && old.status != "Received" && !empty(product) && quantity > 0) {
${movement(app, '    ', 'product: product, direction: "In", type: "return", quantity: quantity', 'product', places ? 'order.location' : null)}
  }
})`,
        });
      }
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
      what: `Selling${channels.length > 0 ? ` on ${channels.join(', ')}` : ''}: each channel's commission and when it pays, shipping by a day${returns ? ', returns' : ''} and what each order really earns.`,
      pieces: ['channels', ...(returns ? ['returns'] : [])],
      glance: ['An order shows its commission, cost and net profit', 'To ship: a calendar of what is due to go out, in Today and Upcoming', 'Ship asks the carrier and the tracking number', ...(returns ? ['Return adds a return'] : [])],
      how: [
        'Write each channel’s commission, its fee per order and after how many days it pays.',
        'Add an order with its channel, its marketplace order no and the day it must be shipped by; the agent can bring them from a marketplace’s file.',
        'Press Ship when it goes out.',
        ...(returns ? ['When something comes back, press Return on its order; mark the return Received, then Refunded.'] : []),
      ],
      auto: [
        'An order works out its commission from its channel, what its products cost, and its net profit and margin.',
        'An order not shipped by its day is marked Late to ship.',
        'A product counts what it sold' + (returns ? ' and what came back' : '') + ', and what it earned.',
        ...(returns && stock ? ['A return Received goes back into stock.'] : []),
        ...(returns && budget ? [`A return Refunded adds a payment out to ${pay}.`] : []),
        ...(budget ? [`An order Delivered adds the channel’s payout to ${pay}, its total less the commission, due after the channel’s days.`] : []),
      ],
      work: ['Who packs and ships, and by when.', 'How returns are accepted, and who decides a refund.', 'How the marketplaces’ files are brought in.'],
    });
  },
};
