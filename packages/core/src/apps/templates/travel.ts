import type { MessageKey } from '@scrawlnotes/i18n';
import { calendar, checkbox, day, dayAndTime, formula, link, multi, nameField, number, rollup, select, symbolOf, text } from '../pieces';
import type { AppTemplate } from '../types';
import { equalShares, expenseFields } from './split';

// Travel (design/more-apps.md 4.5), as TripIt, Wanderlog and PackPoint show a trip: its bookings day
// by day, a hotel on its check in and its check out; its places numbered; its packing from the
// person's own list by the kind of trip, ticked; its money in one line. A booking's cost is its
// expense. With Shared expenses a trip is a group too, and its expenses are the shared ones.

const KEEPS = ['places', 'packing', 'expenses'];
const BOOKINGS = ['Flight', 'Hotel', 'Car', 'Train', 'Event'];
/** The sign of each kind of booking, beside it day by day. */
const ICONS = { Flight: '✈', Hotel: '🏨', Car: '🚗', Train: '🚆', Event: '🎟' };
const KINDS = ['Abroad', 'Flying', 'Beach', 'Cold', 'Work'];
const EVERY = 'Every trip';
const GROUPS = ['Documents', 'Money', 'Electronics', 'Clothes', 'Toiletries', 'Health', 'Other'];

/** What is taken on a trip, ready: each with the kinds of trip it is taken on (PackPoint). */
export const PACKING: [string, string, string[]][] = [
  ['Passport', 'Documents', ['Abroad']],
  ['ID card', 'Documents', [EVERY]],
  ['Tickets', 'Documents', ['Flying']],
  ['Boarding passes', 'Documents', ['Flying']],
  ['Travel insurance', 'Documents', ['Abroad']],
  ['Visa', 'Documents', ['Abroad']],
  ['Driving licence', 'Documents', [EVERY]],
  ['Hotel bookings', 'Documents', [EVERY]],
  ['Wallet', 'Money', [EVERY]],
  ['Bank cards', 'Money', [EVERY]],
  ['Cash in the local currency', 'Money', ['Abroad']],
  ['Phone charger', 'Electronics', [EVERY]],
  ['Power adapter', 'Electronics', ['Abroad']],
  ['Power bank', 'Electronics', ['Flying']],
  ['Headphones', 'Electronics', ['Flying']],
  ['Camera', 'Electronics', ['Abroad', 'Beach']],
  ['Laptop and charger', 'Electronics', ['Work']],
  ['Underwear', 'Clothes', [EVERY]],
  ['Socks', 'Clothes', [EVERY]],
  ['T-shirts', 'Clothes', [EVERY]],
  ['Trousers', 'Clothes', [EVERY]],
  ['Pyjamas', 'Clothes', [EVERY]],
  ['Comfortable shoes', 'Clothes', [EVERY]],
  ['Light jacket', 'Clothes', [EVERY]],
  ['Swimsuit', 'Clothes', ['Beach']],
  ['Sandals', 'Clothes', ['Beach']],
  ['Sun hat', 'Clothes', ['Beach']],
  ['Sunglasses', 'Clothes', ['Beach']],
  ['Warm coat', 'Clothes', ['Cold']],
  ['Gloves', 'Clothes', ['Cold']],
  ['Scarf', 'Clothes', ['Cold']],
  ['Beanie', 'Clothes', ['Cold']],
  ['Thermal underwear', 'Clothes', ['Cold']],
  ['Smart clothes', 'Clothes', ['Work']],
  ['Smart shoes', 'Clothes', ['Work']],
  ['Toothbrush', 'Toiletries', [EVERY]],
  ['Toothpaste', 'Toiletries', [EVERY]],
  ['Deodorant', 'Toiletries', [EVERY]],
  ['Shampoo', 'Toiletries', [EVERY]],
  ['Razor', 'Toiletries', [EVERY]],
  ['Hairbrush', 'Toiletries', [EVERY]],
  ['Sunscreen', 'Toiletries', ['Beach']],
  ['After-sun', 'Toiletries', ['Beach']],
  ['Lip balm', 'Toiletries', ['Cold']],
  ['Hand cream', 'Toiletries', ['Cold']],
  ['Liquids bag', 'Toiletries', ['Flying']],
  ['Medicines', 'Health', [EVERY]],
  ['Plasters', 'Health', [EVERY]],
  ['Painkillers', 'Health', [EVERY]],
  ['Glasses or lenses', 'Health', [EVERY]],
  ['Hand sanitiser', 'Health', ['Flying']],
  ['Insect repellent', 'Health', ['Beach']],
  ['Keys', 'Other', [EVERY]],
  ['Water bottle', 'Other', [EVERY]],
  ['Reusable bag', 'Other', [EVERY]],
  ['Neck pillow', 'Other', ['Flying']],
  ['Book', 'Other', ['Flying', 'Beach']],
  ['Snacks', 'Other', ['Flying']],
  ['Umbrella', 'Other', ['Cold']],
  ['Beach towel', 'Other', ['Beach']],
  ['Business cards', 'Other', ['Work']],
  ['Notebook and pen', 'Other', ['Work']],
];

export const travel: AppTemplate = {
  id: 'travel',
  version: 3,
  group: 'life',
  name: 'apps.travel.name',
  short: 'apps.travel.short',
  icon: 'globe',
  what: 'apps.travel.what',
  goesWith: ['split'],
  questions: [{ key: 'keeps', kind: 'multi', label: 'apps.travel.keeps', options: KEEPS.map((value) => ({ value, label: `apps.travel.keep.${value}` as MessageKey })), default: KEEPS }],
  money: () => true,
  pieces: (answers, app) => {
    const keeps = Array.isArray(answers.keeps) ? (answers.keeps as string[]) : KEEPS;
    return ['trips', 'bookings', ...(keeps.includes('places') ? ['places'] : []), ...(keeps.includes('packing') ? ['packing', 'packing-list'] : []), ...(keeps.includes('expenses') || app.has('split') ? ['spending'] : [])];
  },
  menu: ['trips', 'spending', 'packing-list'],
  build(app, answers) {
    const places = app.hasPiece('places');
    const packing = app.hasPiece('packing');
    const spending = app.hasPiece('spending');
    const shared = app.has('split') && app.hasPiece('group-members');
    const trips = app.path('trips');
    const main = app.format(false);
    const expenses = spending ? app.called('spending') : '';
    const sym = app.money.main ?? '';
    const money = (expr: string) => `${JSON.stringify(symbolOf(sym))} + text(round(${expr}))`;

    // A trip, as TripIt heads one: its name, its days and how far off; where to, its days and its
    // budget on the left with what is left of it, its bookings and places in the middle, its packing
    // and its money on the right (design/more-apps.md 4.5).
    app.field('trips', { ...nameField(), optional: true });
    app.field('trips', { ...text('destination', 'Where to'), required: true });
    app.field('trips', day('first', 'First day'));
    app.field('trips', day('last', 'Last day'));
    if (packing) {
      app.field('trips', { ...multi('kind', 'Kind of trip', KINDS), chips: true });
      app.place('trips', 'kind', 3);
    }
    app.field('trips', number('budget', 'Budget', { format: main }));
    app.field('trips', formula('coming', 'Coming', 'empty(first) || (empty(last) ? first >= today() : last >= today())'));
    app.field('trips', formula('when', 'When', 'empty(first) ? "" : first > today() ? (first - today() == 1 ? "tomorrow" : "in " + text(first - today()) + " days") : (empty(last) || last >= today() ? "now" : "")'));
    // "12–16 Nov · 5 days · in 14 days".
    const days = 'text(monthday(first)) + (empty(last) ? " " + monthname(first) : (month(first) == month(last) ? "" : " " + monthname(first)) + "–" + text(monthday(last)) + " " + monthname(last) + " · " + text(last - first + 1) + " days")';
    app.field('trips', formula('dates', 'When', `empty(first) ? "No days yet" : ${days} + (empty(when) || when == "now" ? "" : " · " + when)`));
    app.head('trips', 'dates');
    app.view('trips', { id: 'coming', name: 'Coming', conditions: [{ field: 'coming', op: 'true' }], sort: { key: 'first', dir: 'asc' }, columns: ['dates', ...(spending ? ['left_said'] : []), ...(packing ? ['pack_said'] : [])] }, true);
    app.rule('trips', {
      kind: 'onSave',
      name: 'Its name',
      src: `onSave("Its name", () => {\n  if (empty(name) && !empty(destination)) name = empty(first) ? destination : destination + " · " + monthname(first) + " " + text(year(first))\n})`,
    });
    app.rule('trips', { kind: 'check', name: 'The last day is before the first', src: 'check("last", () => empty(last) || empty(first) || last >= first, "The last day is before the first")' });
    // Its to-dos: a visa, the insurance; one with a day comes to Today and Upcoming.
    app.block('trips', { block: 'subtasks', title: 'To do', add: 'Add step', column: 1 });
    app.block('trips', {
      block: 'linked',
      collection: app.path('bookings'),
      look: 'days',
      time: 'start',
      end: 'end',
      icon: 'type',
      icons: ICONS,
      sub: 'said',
      startSaid: { Hotel: 'check in', Car: 'pick up' },
      endSaid: { Hotel: 'check out', Car: 'drop off' },
      sort: 'start',
      column: 2,
    });
    app.notes('trips', false);

    // A booking by its kind, with what TripIt keeps of it; a flight or a train named by itself.
    const isTicket = { when: [{ field: 'type', op: 'is' as const, value: ['Flight', 'Train'] }] };
    app.field('bookings', {
      ...nameField(),
      optional: true,
      labelBy: { field: 'type', labels: { Hotel: 'Hotel', Car: 'Car', Event: 'Event' } },
      when: [{ field: 'type', op: 'is', value: ['Hotel', 'Car', 'Event'] }],
    });
    app.field('bookings', { ...link('trip', 'Trip', trips), required: true });
    app.field('bookings', { ...select('type', 'Type', BOOKINGS, { Flight: 'blue', Hotel: 'purple', Car: 'orange', Train: 'teal', Event: 'pink' }, 'Flight'), chips: true });
    app.field('bookings', { ...text('flight_no', 'Flight no'), when: [{ field: 'type', op: 'is', value: ['Flight'] }] });
    app.field('bookings', { ...text('seat', 'Seat'), ...isTicket });
    app.field('bookings', { ...text('from', 'From'), ...isTicket });
    app.field('bookings', { ...text('to', 'To'), ...isTicket });
    app.field('bookings', { ...text('address', 'Address'), when: [{ field: 'type', op: 'is', value: ['Hotel', 'Car', 'Event'] }] });
    app.field('bookings', { ...dayAndTime('start', 'Starts'), required: true, labelBy: { field: 'type', labels: { Flight: 'Departs', Train: 'Departs', Hotel: 'Check in', Car: 'Pick up' } } });
    app.field('bookings', { ...dayAndTime('end', 'Ends'), labelBy: { field: 'type', labels: { Flight: 'Arrives', Train: 'Arrives', Hotel: 'Check out', Car: 'Drop off' } } });
    app.field('bookings', text('confirmation', 'Confirmation'));
    app.field('bookings', number('amount', 'Cost', { format: main }));
    if (shared) app.field('bookings', { ...link('paid_by', 'Paid by', app.path('group-members')), within: 'trip' });
    // Its line under its name: a flight's number, when it lands, its confirmation and seat; a hotel's address.
    app.field(
      'bookings',
      formula(
        'said',
        'Says',
        'type == "Flight" || type == "Train" ? (empty(flight_no) ? "" : flight_no + " · ") + (empty(end) || empty(time(end)) ? "" : "arrives " + text(time(end)) + " · ") + (empty(confirmation) ? "" : "Confirmation " + confirmation) + (empty(seat) ? "" : " · Seat " + seat) : (empty(address) ? "" : address) + (empty(confirmation) ? "" : " · Confirmation " + confirmation)',
      ),
    );
    app.formOrder('bookings', ['type', 'name', 'flight_no', 'seat', 'from', 'to', 'address', 'start', 'end', 'confirmation', 'amount', 'paid_by']);
    app.notes('bookings', 'attach');
    app.view('bookings', { ...calendar({ start: 'start', end: 'end', color: 'type', upcoming: true, words: ['said'] }), hidden: true });
    app.rule('bookings', {
      kind: 'onSave',
      name: 'Its name',
      src: `onSave("Its name", () => {
  if (type == "Flight" || type == "Train") name = empty(from) ? type + (empty(flight_no) ? "" : " " + flight_no) : from + " → " + to
  else if (empty(name)) name = type + (empty(address) ? "" : " · " + address)
})`,
    });
    app.rule('bookings', { kind: 'check', name: 'It ends before it starts', src: 'check("end", () => empty(end) || end >= start, "It ends before it starts")' });
    if (shared) app.rule('bookings', { kind: 'check', name: 'Who paid it', src: 'check("paid_by", () => empty(amount) || !empty(paid_by), "Who paid it?")' });
    if (spending) {
      const write = shared
        ? `    const people = find("${app.called('group-members')}", { trip: trip })
    let e = null
    if (was.length > 0) {
      e = was[0]
      update(e, { name: name, amount: amount, trip: trip, payer: paid_by, between: people })
    } else e = add("${expenses}", { name: name, amount: amount, trip: trip, date: today(), payer: paid_by, between: people })
    for (const s of find("${app.called('shares')}", { expense: e })) remove(s)
${equalShares(app, { expense: 'e', whole: 'amount', people: 'people', payer: 'paid_by', label: 'name', date: 'today()', indent: '    ' })}`
        : `    if (was.length > 0) update(was[0], { name: name, amount: amount, trip: trip })
    else add("${expenses}", { name: name, amount: amount, trip: trip, date: today()${app.money.multi ? `, currency: "${sym}", rate: 1` : ''} })`;
      app.rule('bookings', {
        kind: 'onSave',
        name: 'Its expense',
        src: `onSave("Its expense", () => {
  const was = linked("${expenses}")
  if (empty(amount) || amount <= 0${shared ? ' || empty(paid_by)' : ''}) {
    for (const e of was) remove(e)
  } else {
${write}
  }
})`,
      });
    }

    if (places) {
      // The places to see, numbered as Wanderlog lists them, each on its day.
      app.field('places', nameField());
      app.field('places', { ...link('trip', 'Trip', trips), required: true });
      app.field('places', { ...day('day', 'Day'), help: 'Which day of the trip; left empty, any day' });
      app.field('places', { key: 'link', label: 'Link', type: 'url' });
      app.field('places', checkbox('visited', 'Been there'));
      app.field('places', formula('weekday', 'Weekday', 'empty(day) ? "" : weekday(day)'));
      app.block('trips', { block: 'linked', collection: app.path('places'), look: 'checklist', title: 'Places to visit', numbered: true, fields: ['weekday'], sort: 'day', column: 2 });
    }
    if (packing) {
      // The person's own list, ready with what most take; a new trip, or its kinds changed, brings what it is taken on.
      const list = app.called('packing-list');
      app.field('packing-list', nameField('Thing'));
      app.field('packing-list', select('group', 'Group', GROUPS));
      app.field('packing-list', { ...multi('taken_on', 'Taken on', [EVERY, ...KINDS]), chips: true });
      app.view('packing-list', { id: 'all', name: 'All', conditions: [], group: 'group' }, true);
      app.tableColumns('packing-list', ['taken_on']);
      app.homeTile('packing-list', { off: true });
      for (const [name, group, on] of PACKING) app.record('packing-list', { name, group, taken_on: on });

      app.field('packing', nameField('Thing'));
      app.field('packing', { ...link('trip', 'Trip', trips), required: true });
      app.field('packing', select('group', 'Group', GROUPS));
      app.field('packing', checkbox('packed', 'Packed'));
      app.field('trips', rollup('to_pack', 'To pack', app.path('packing'), 'count', undefined, [{ field: 'packed', op: 'false' }]));
      app.field('trips', formula('pack_said', 'Packing', 'to_pack > 0 ? text(to_pack) + " to pack" : ""'));
      // Ticked as it is packed, in its groups (PackPoint).
      app.block('trips', { block: 'linked', collection: app.path('packing'), look: 'checklist', fields: ['packed'], group: ['group'], done: true, column: 3 });
      app.rule('trips', {
        kind: 'onSave',
        name: 'From the packing list',
        src: `onSave("From the packing list", () => {
  if (empty(old.destination) || text(kind) != text(old.kind)) {
    const have = linked("${app.called('packing')}").map((p) => p.name)
    for (const p of find("${list}")) {
      if (!empty(p.taken_on) && (p.taken_on.includes("${EVERY}") || (!empty(kind) && p.taken_on.some((w) => kind.includes(w)))) && !have.includes(p.name)) add("${app.called('packing')}", { name: p.name, group: p.group })
    }
  }
})`,
      });
    }
    app.view('trips', { ...calendar({ start: 'first', upcoming: true, words: packing ? ['pack_said'] : [] }), hidden: true });

    if (spending) {
      const spent = app.path('spending');
      if (!shared) {
        // An expense on the way: what, how much and in what, when; the trip the one on now.
        expenseFields(app);
        app.field('spending', { ...link('trip', 'Trip', trips), default: `=find("${app.called('trips')}").filter((t) => !empty(t.first) && t.first <= today() && (empty(t.last) || t.last >= today()))[0] || last("date")` });
        app.field('spending', link('booking', 'Booking', app.path('bookings')));
        app.formOrder('spending', ['name', 'amount', 'currency', 'rate', 'date', 'trip']);
        app.tableColumns('spending', ['date', 'trip', 'total']);
      }
      app.homeTile('spending', { off: true });
      app.field('trips', rollup('spent', 'Spent', spent, 'sum', 'total', undefined, main));
      app.field('trips', formula('left', 'Left', 'empty(budget) ? null : budget - spent', main));
      app.field('trips', formula('days_left', 'Days left', 'empty(last) || last < today() ? null : last - (first > today() ? first : today()) + 1'));
      app.field('trips', formula('per_day', 'Per day left', 'empty(left) || empty(days_left) || days_left <= 0 ? null : round(left / days_left)', main));
      // Its money in one line, under the budget: "₺31.400 spent · ₺28.600 left · ₺5.720 a day".
      app.field('trips', formula('money', 'Spent', `spent == 0 && empty(budget) ? "" : ${money('spent')} + " spent" + (empty(left) ? "" : left >= 0 ? " · " + ${money('left')} + " left" : " · " + ${money('-left')} + " over") + (empty(per_day) || per_day <= 0 ? "" : " · " + ${money('per_day')} + " a day")`));
      app.field('trips', formula('left_said', 'Budget', `empty(left) ? "" : left >= 0 ? ${money('left')} + " left" : ${money('-left')} + " over"`));
      app.block('trips', { block: 'linked', collection: spent, look: 'checklist', fields: shared ? ['payer', 'total'] : ['date', 'total'], sort: 'date', dir: 'desc', column: 3 });
      app.rule('trips', { kind: 'check', name: 'Over its budget', src: 'check("spent", () => empty(budget) || spent <= budget, `Over its budget by ${text(spent - budget)}`)' });
    }
    // Home: the next trip, large.
    app.field('trips', formula('next_said', 'Next', `(empty(first) ? "No days yet" : ${days})${packing ? ' + (to_pack > 0 ? " · " + text(to_pack) + " to pack" : "")' : ''}${spending ? ' + (empty(left_said) ? "" : " · " + left_said)' : ''}`));
    app.homeTile('trips', { first: true, value: 'when', sub: 'next_said' });
    app.formOrder('trips', ['destination', 'first', 'last', 'budget', 'money']);
    app.tableColumns('trips', ['dates', ...(spending ? ['left_said'] : []), ...(packing ? ['pack_said'] : [])]);

    app.about({
      title: 'Travel',
      what: `Your trips: where to and when, the bookings day by day${places ? ', the places to see' : ''}${packing ? ', what to pack from your own list' : ''}${spending ? ', and what it costs, each day' : ''}.`,
      pieces: ['trips', 'bookings', ...(places ? ['places'] : []), ...(packing ? ['packing', 'packing-list'] : []), ...(spending ? ['spending'] : [])],
      glance: ['Trips and bookings in Today and Upcoming', 'Bookings day by day, a hotel on its check in and check out', ...(spending ? ['What is left of a trip’s budget for each day'] : []), ...(packing ? ['What is still to pack'] : []), ...(shared ? ['A trip is a group whose expenses are shared'] : [])],
      how: [
        `Add a trip with where to, and its days once they are known${packing ? '; tick its kinds, abroad, flying, a beach' : ''}; it is called "Rome · Nov 2026".`,
        `Add each booking in the trip's window: a flight with its number, from and to, a hotel with its address, and their times${spending ? '; its cost is written as an expense' : ''}${shared ? ', with who paid it' : ''}.`,
        'Write what is to be done before the trip in To do: a visa, the insurance; one with a day comes to Today.',
        ...(places ? ['Add the places to see, each on its day.'] : []),
        ...(packing ? [`Keep ${app.called('packing-list')} as you pack; a new trip takes what it is taken on, ticked as it is packed.`] : []),
        ...(spending ? [`Add what you spend on the way: its title and amount; the trip is the one on now${app.money.multi ? ', and in another currency the rate used last' : ''}.`] : []),
      ],
      auto: [
        'A trip comes to Upcoming before its first day and to Today on it; its bookings on their days and times.',
        'A trip is called after where to and its month; a flight or a train after where from and to.',
        ...(spending ? ['A booking with a cost writes its expense, changed with it; a trip adds up its expenses, what is left of its budget, and what is left for each of its days to come; one over its budget is marked.'] : []),
        ...(packing ? [`A new trip, or one given another kind, takes from ${app.called('packing-list')} what is taken on every trip and on its kinds.`] : []),
      ],
      work: ['Where the tickets and the papers are kept.', ...(packing ? ['What we always take.'] : [])],
    });
  },
};
