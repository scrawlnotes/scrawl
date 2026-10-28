import type { MessageKey } from '@scrawlnotes/i18n';
import { calendar, checkbox, currencyField, day, dayAndTime, formula, link, multi, nameField, number, rollup, select, text } from '../pieces';
import type { AppTemplate } from '../types';
import { equalShares, TRIP_CATEGORIES as CATEGORIES, TRIP_COLORS as CATEGORY_COLORS } from './split';

// Travel (design/more-apps.md 4.5): each trip named by itself, its bookings by time and by kind, a
// booking's amount its expense; its packing list from the person's own, by the kind of trip; its
// money per day left. With Shared expenses a trip is a group too, and its expenses are the shared ones.

const KEEPS = ['places', 'packing', 'expenses'];
const BOOKINGS = ['Flight', 'Hotel', 'Train', 'Car', 'Event'];
const KINDS = ['Abroad', 'Flying', 'Beach', 'Cold', 'Work'];
const EVERY = 'Every trip';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
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
  version: 2,
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
    const multiMoney = app.money.multi && !shared;
    const expenses = spending ? app.called('spending') : '';
    const sym = app.money.main ?? '';
    const tripColumns = ['first', 'last', ...(spending ? ['budget', 'spent', 'left', 'per_day'] : []), ...(packing ? ['to_pack'] : [])];

    // Trips: where to and when, named by themselves; what is left of the budget for each day to come.
    app.field('trips', { ...nameField(), optional: true, help: 'Left empty, where to and the month' });
    app.field('trips', { ...text('destination', 'Where to'), required: true });
    app.field('trips', { ...day('first', 'First day'), required: true });
    app.field('trips', day('last', 'Last day'));
    if (packing) app.field('trips', { ...multi('kind', 'Kind of trip', KINDS), chips: true, help: 'What it brings from Packing list' });
    app.field('trips', number('budget', 'Budget', { format: main }));
    app.field('trips', formula('coming', 'Coming', 'empty(last) ? first >= today() : last >= today()'));
    app.field('trips', formula('when', 'When', 'first > today() ? (first - today() == 1 ? "tomorrow" : "in " + text(first - today()) + " days") : (empty(last) || last >= today() ? "now" : "")'));
    app.formOrder('trips', ['destination', 'first', 'last', 'kind', 'budget', 'name']);
    app.view('trips', { id: 'coming', name: 'Coming', conditions: [{ field: 'coming', op: 'true' }], sort: { key: 'first', dir: 'asc' }, columns: tripColumns }, true);
    app.rule('trips', {
      kind: 'onSave',
      name: 'Its name',
      src: `onSave("Its name", () => {\n  if (empty(name) && !empty(destination) && !empty(first)) name = destination + " · " + ${JSON.stringify(MONTHS)}[month(first) - 1] + " " + text(year(first))\n})`,
    });
    app.rule('trips', { kind: 'check', name: 'The last day is before the first', src: 'check("last", () => empty(last) || last >= first, "The last day is before the first")' });
    app.block('trips', { block: 'linked', collection: app.path('bookings'), style: 'table', fields: ['start', 'type', 'name', 'amount'], sort: 'start' });
    // Its to-dos: a visa, the insurance; one with a day comes to Today and Upcoming.
    app.block('trips', { block: 'subtasks', title: 'To do', add: 'Add step' });

    // Bookings: what a kind has, its name from them, its time in Today; its amount its expense.
    const isTicket = { when: [{ field: 'type', op: 'is' as const, value: ['Flight', 'Train'] }] };
    app.field('bookings', { ...nameField(), optional: true, help: 'Left empty, its kind and where' });
    app.field('bookings', { ...link('trip', 'Trip', trips), required: true });
    app.field('bookings', { ...select('type', 'Type', BOOKINGS, { Flight: 'blue', Hotel: 'purple', Train: 'teal', Car: 'orange', Event: 'pink' }, 'Flight'), chips: true });
    app.field('bookings', { ...text('flight_no', 'Flight no'), when: [{ field: 'type', op: 'is', value: ['Flight'] }] });
    app.field('bookings', { ...text('from', 'From'), ...isTicket });
    app.field('bookings', { ...text('to', 'To'), ...isTicket });
    app.field('bookings', { ...text('address', 'Address'), when: [{ field: 'type', op: 'is', value: ['Hotel', 'Car', 'Event'] }] });
    app.field('bookings', { ...dayAndTime('start', 'Starts'), required: true });
    app.field('bookings', dayAndTime('end', 'Ends'));
    app.field('bookings', text('confirmation', 'Confirmation no'));
    app.field('bookings', { ...number('amount', 'Amount', { format: main }), ...(spending && { help: shared ? 'Written as an expense the one who paid it shares with all of the trip' : 'Written as an expense of the trip; not added again' }) });
    if (shared) app.field('bookings', { ...link('paid_by', 'Paid by', app.path('group-members')), chips: true, within: 'trip' });
    app.field('bookings', formula('said', 'Says', 'type == "Flight" || type == "Train" ? (empty(from) ? "" : from + " → " + to) + (empty(confirmation) ? "" : " · " + confirmation) : (empty(address) ? "" : address)'));
    app.formOrder('bookings', ['type', 'flight_no', 'confirmation', 'from', 'to', 'address', 'start', 'end', 'amount', 'paid_by', 'name']);
    app.view('bookings', calendar({ start: 'start', end: 'end', color: 'type', upcoming: true, words: ['said'] }));
    app.rule('bookings', {
      kind: 'onSave',
      name: 'Its name',
      src: `onSave("Its name", () => {
  if (empty(name)) name = type == "Flight" ? "Flight" + (empty(flight_no) ? "" : " " + flight_no) + (empty(from) ? "" : " " + from + " → " + to) : type == "Train" ? "Train" + (empty(from) ? "" : " " + from + " → " + to) : type + (empty(address) ? "" : " · " + address)
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
    } else e = add("${expenses}", { name: name, amount: amount, trip: trip, category: category, date: today(), payer: paid_by, between: people })
    for (const s of find("${app.called('shares')}", { expense: e })) remove(s)
${equalShares(app, { expense: 'e', whole: 'amount', people: 'people', payer: 'paid_by', label: 'name', date: 'today()', indent: '    ' })}`
        : `    if (was.length > 0) update(was[0], { name: name, amount: amount, trip: trip })
    else add("${expenses}", { name: name, amount: amount, trip: trip, category: category, date: today()${multiMoney ? `, currency: "${sym}", rate: 1` : ''} })`;
      app.rule('bookings', {
        kind: 'onSave',
        name: 'Its expense',
        src: `onSave("Its expense", () => {
  const was = linked("${expenses}")
  if (empty(amount) || amount <= 0${shared ? ' || empty(paid_by)' : ''}) {
    for (const e of was) remove(e)
  } else {
    const category = type == "Hotel" ? "Stay" : type == "Event" ? "Activities" : "Transport"
${write}
  }
})`,
      });
    }

    if (places) {
      app.field('places', nameField());
      app.field('places', { ...link('trip', 'Trip', trips), required: true });
      app.field('places', { ...day('day', 'Day'), help: 'Which day of the trip; left empty, any day' });
      app.field('places', { key: 'link', label: 'Link', type: 'url' });
      app.field('places', checkbox('visited', 'Been there'));
      app.block('trips', { block: 'linked', collection: app.path('places'), style: 'table', fields: ['visited', 'name', 'link'], group: ['day'], sort: 'day', edit: ['visited'], done: true });
    }
    if (packing) {
      // The person's own list, ready with what most take; a new trip, or its kinds changed, brings what it is taken on.
      const list = app.called('packing-list');
      app.field('packing-list', nameField('Thing'));
      app.field('packing-list', select('group', 'Group', GROUPS));
      app.field('packing-list', { ...multi('taken_on', 'Taken on', [EVERY, ...KINDS]), chips: true });
      app.view('packing-list', { id: 'all', name: 'All', conditions: [], group: 'group' }, true);
      app.tableColumns('packing-list', ['taken_on']);
      for (const [name, group, on] of PACKING) app.record('packing-list', { name, group, taken_on: on });

      app.field('packing', nameField('Thing'));
      app.field('packing', { ...link('trip', 'Trip', trips), required: true });
      app.field('packing', select('group', 'Group', GROUPS));
      app.field('packing', checkbox('packed', 'Packed'));
      app.field('trips', rollup('to_pack', 'To pack', app.path('packing'), 'count', undefined, [{ field: 'packed', op: 'false' }]));
      app.field('trips', formula('pack_said', 'Says', 'to_pack > 0 ? text(to_pack) + " to pack" : ""'));
      app.block('trips', { block: 'linked', collection: app.path('packing'), style: 'table', fields: ['packed', 'name', 'group'], sort: 'group', edit: ['packed'], done: true });
      app.rule('trips', {
        kind: 'onSave',
        name: 'From the packing list',
        src: `onSave("From the packing list", () => {
  if (empty(old.first) || text(kind) != text(old.kind)) {
    const have = linked("${app.called('packing')}").map((p) => p.name)
    for (const p of find("${list}")) {
      if (!empty(p.taken_on) && (p.taken_on.includes("${EVERY}") || (!empty(kind) && p.taken_on.some((w) => kind.includes(w)))) && !have.includes(p.name)) add("${app.called('packing')}", { name: p.name, group: p.group })
    }
  }
})`,
      });
    }
    app.view('trips', calendar({ start: 'first', upcoming: true, words: packing ? ['pack_said'] : [] }));

    if (spending) {
      const spent = app.path('spending');
      if (!shared) {
        // An expense on the way: its amount first, a category tapped, the trip the one on now.
        app.field('spending', { ...nameField('Description'), optional: true, help: 'Left empty, its category’s name' });
        app.field('spending', number('amount', 'Amount', { required: true, format: multiMoney ? app.format(true) : main }));
        if (multiMoney) {
          app.field('spending', { ...currencyField(app), chips: true });
          app.field('spending', { ...number('rate', 'Rate', { default: 1 }), help: 'What one of it is in the trip’s money; the rate used last for it', when: [{ field: 'currency', op: 'is-not', value: [sym] }] });
        }
        app.field('spending', formula('total', 'Total', multiMoney ? 'amount * (empty(rate) || currency == ' + JSON.stringify(sym) + ' ? 1 : rate)' : 'amount', main));
        app.field('spending', { ...select('category', 'Category', CATEGORIES, CATEGORY_COLORS), chips: true });
        app.field('spending', { ...link('trip', 'Trip', trips), default: `=find("${app.called('trips')}").filter((t) => t.first <= today() && (empty(t.last) || t.last >= today()))[0] || last("date")` });
        app.field('spending', day('date', 'Date', true));
        app.formOrder('spending', ['amount', 'currency', 'rate', 'category', 'trip', 'date', 'name']);
        app.rule('spending', { kind: 'onSave', name: 'Its name', src: 'onSave("Its name", () => {\n  if (empty(name)) name = empty(category) ? "Expense" : category\n})' });
        if (multiMoney) {
          app.rule('spending', {
            kind: 'onChange',
            name: 'Its rate',
            src: `onChange("currency", "Its rate", () => {
  const before = find("${expenses}", { currency: currency }).filter((e) => !empty(e.rate) && !empty(e.date))
  if (currency == ${JSON.stringify(sym)}) rate = 1
  else if (before.length > 0 && (empty(rate) || rate == 1 || rate == old.rate)) rate = before.filter((e) => e.date == max(before.map((b) => b.date)))[0].rate
})`,
          });
        }
        app.tableColumns('spending', ['date', 'category', 'trip', 'total']);
        app.field('spending', link('booking', 'Booking', app.path('bookings')));
      }
      app.field('trips', rollup('spent', 'Spent', spent, 'sum', 'total', undefined, main));
      app.field('trips', formula('left', 'Left', 'empty(budget) ? null : budget - spent', main));
      app.field('trips', formula('days_left', 'Days left', 'empty(last) || last < today() ? null : last - (first > today() ? first : today()) + 1'));
      app.field('trips', formula('per_day', 'Per day left', 'empty(left) || empty(days_left) || days_left <= 0 ? null : round(left / days_left)', main));
      app.block('trips', { block: 'linked', collection: spent, style: 'table', fields: ['date', 'name', 'total'], sort: 'date', dir: 'desc', sums: true });
      app.rule('trips', { kind: 'check', name: 'Over its budget', src: 'check("spent", () => empty(budget) || spent <= budget, `Over its budget by ${text(spent - budget)}`)' });
      app.tableColumns('trips', tripColumns);
      app.homeTile('trips', { value: 'left', sub: 'when' });
    } else {
      app.tableColumns('trips', tripColumns);
      app.homeTile('trips', { sub: 'when' });
    }

    app.about({
      title: 'Travel',
      what: `Your trips: where to and when, the bookings with their times${places ? ', the places to see day by day' : ''}${packing ? ', what to pack from your own list' : ''}${spending ? ', and what it costs, each day' : ''}.`,
      pieces: ['trips', 'bookings', ...(places ? ['places'] : []), ...(packing ? ['packing', 'packing-list'] : []), ...(spending ? ['spending'] : [])],
      glance: ['Trips and bookings in Today and Upcoming', ...(spending ? ['What is left of a trip’s budget for each day'] : []), ...(packing ? ['What is still to pack'] : []), ...(shared ? ['A trip is a group whose expenses are shared'] : [])],
      how: [
        `Add a trip with where to and its days${packing ? ', and its kinds: abroad, flying, a beach' : ''}; leave its name empty for "Rome · Nov 2026".`,
        `Add each booking in the trip's window: a flight with its number, from and to, a hotel with its address, and their times${spending ? '; its amount is written as an expense' : ''}${shared ? ', with who paid it' : ''}.`,
        'Write what is to be done before the trip in To do: a visa, the insurance; one with a day comes to Today.',
        ...(places ? ['Add the places to see, each on its day; tick the ones you went to.'] : []),
        ...(packing ? [`Keep ${app.called('packing-list')} as you pack; a new trip takes what it is taken on, ticked as it is packed.`] : []),
        ...(spending ? [`Add what you spend on the way: its amount and a category; the trip is the one on now${multiMoney ? ', and in another currency the rate used last' : ''}.`] : []),
      ],
      auto: [
        'A trip comes to Upcoming before its first day and to Today on it; its bookings on their days and times.',
        'A trip left with no name is called after where to and its month; a booking after its kind and where.',
        ...(spending ? ['A booking with an amount writes its expense, changed with it; a trip adds up its expenses, what is left of its budget, and what is left for each of its days to come; one over its budget is marked.'] : []),
        ...(packing ? [`A new trip, or one given another kind, takes from ${app.called('packing-list')} what is taken on every trip and on its kinds.`] : []),
      ],
      work: ['Where the tickets and the papers are kept.', ...(packing ? ['What we always take.'] : [])],
    });
  },
};
