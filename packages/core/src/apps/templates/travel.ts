import type { MessageKey } from '@scrawlnotes/i18n';
import { calendar, checkbox, currencyField, day, dayAndTime, formula, link, nameField, number, rollup, select, text } from '../pieces';
import type { AppTemplate } from '../types';

// Travel (design/more-apps.md 4.5): each trip, its bookings with their times in Today and
// Upcoming, the places to see, what to pack and what it costs. With Shared expenses a trip is a
// group too, and its expenses are the shared ones.

const KEEPS = ['places', 'packing', 'expenses'];
const BOOKINGS = ['Flight', 'Hotel', 'Train', 'Car', 'Event'];
const CATEGORIES = ['Transport', 'Stay', 'Food', 'Activities', 'Shopping', 'Other'];

export const travel: AppTemplate = {
  id: 'travel',
  version: 1,
  group: 'life',
  name: 'apps.travel.name',
  short: 'apps.travel.short',
  icon: 'globe',
  what: 'apps.travel.what',
  questions: [{ key: 'keeps', kind: 'multi', label: 'apps.travel.keeps', options: KEEPS.map((value) => ({ value, label: `apps.travel.keep.${value}` as MessageKey })), default: KEEPS }],
  money: () => true,
  pieces: (answers, app) => {
    const keeps = Array.isArray(answers.keeps) ? answers.keeps : KEEPS;
    return ['trips', 'bookings', ...(keeps.includes('places') ? ['places'] : []), ...(keeps.includes('packing') ? ['packing'] : []), ...(keeps.includes('expenses') || app.has('split') ? ['spending'] : [])];
  },
  build(app, answers) {
    const places = app.hasPiece('places');
    const packing = app.hasPiece('packing');
    const spending = app.hasPiece('spending');
    const shared = app.has('split');
    const trips = app.path('trips');
    const main = app.format(false);
    const own = app.format(true);

    app.field('trips', nameField());
    app.field('trips', text('destination', 'Where to'));
    app.field('trips', { ...day('first', 'First day'), required: true });
    app.field('trips', day('last', 'Last day'));
    app.field('trips', number('budget', 'Budget', { format: main }));
    app.field('trips', rollup('booked', 'Booked', app.path('bookings'), 'sum', 'amount', undefined, main));
    app.view('trips', calendar({ start: 'first', end: 'last', upcoming: true }));
    app.block('trips', { block: 'linked', collection: app.path('bookings'), style: 'table', fields: ['type', 'start', 'amount'], sort: 'start', sums: true });
    app.rule('trips', { kind: 'check', name: 'The last day is before the first', src: 'check("last", () => empty(last) || last >= first, "The last day is before the first")' });

    app.field('bookings', nameField());
    app.field('bookings', { ...link('trip', 'Trip', trips), required: true });
    app.field('bookings', select('type', 'Type', BOOKINGS, { Flight: 'blue', Hotel: 'purple', Train: 'teal', Car: 'orange', Event: 'pink' }, 'Flight'));
    app.field('bookings', { ...dayAndTime('start', 'Starts'), required: true });
    app.field('bookings', dayAndTime('end', 'Ends'));
    app.field('bookings', text('confirmation', 'Confirmation no'));
    app.field('bookings', number('amount', 'Amount', { format: main }));
    app.view('bookings', calendar({ start: 'start', end: 'end', color: 'type', upcoming: true }));
    app.rule('bookings', { kind: 'check', name: 'It ends before it starts', src: 'check("end", () => empty(end) || end >= start, "It ends before it starts")' });

    if (places) {
      app.field('places', nameField());
      app.field('places', { ...link('trip', 'Trip', trips), required: true });
      app.field('places', { key: 'link', label: 'Link', type: 'url' });
      app.field('places', checkbox('visited', 'Been there'));
      app.block('trips', { block: 'linked', collection: app.path('places'), style: 'list', fields: ['visited'] });
    }
    if (packing) {
      app.field('packing', nameField('Thing'));
      app.field('packing', { ...link('trip', 'Trip', trips), required: true });
      app.field('packing', checkbox('packed', 'Packed'));
      app.field('trips', rollup('to_pack', 'To pack', app.path('packing'), 'count', undefined, [{ field: 'packed', op: 'false' }]));
      app.block('trips', { block: 'linked', collection: app.path('packing'), style: 'table', fields: ['packed'] });
    }
    if (spending) {
      const spent = app.path('spending');
      app.field('spending', nameField('What'));
      app.field('spending', link('trip', 'Trip', trips));
      app.field('spending', day('date', 'Date', true));
      app.field('spending', number('amount', 'Amount', { required: true, format: own }));
      if (app.money.multi) app.field('spending', currencyField(app));
      app.field('spending', select('category', 'Category', CATEGORIES));
      // With Shared expenses, what an expense comes to in the group's currency is its total.
      app.field('trips', rollup('spent', 'Spent', spent, 'sum', shared ? 'total' : 'amount', undefined, main));
      app.field('trips', formula('left', 'Left', 'budget - spent', main));
      app.block('trips', { block: 'linked', collection: spent, style: 'table', fields: ['date', 'amount', 'category'], sort: 'date', sums: true });
      app.rule('trips', { kind: 'check', name: 'Over its budget', src: 'check("spent", () => empty(budget) || spent <= budget, `Over its budget by ${text(spent - budget)}`)' });
    }

    app.about({
      title: 'Travel',
      what: `Your trips: where to and when, the bookings with their times${places ? ', the places to see' : ''}${packing ? ', what to pack' : ''}${spending ? ', and what it costs' : ''}.`,
      pieces: ['trips', 'bookings', ...(places ? ['places'] : []), ...(packing ? ['packing'] : []), ...(spending ? ['spending'] : [])],
      glance: ['Trips and bookings in Today and Upcoming', ...(spending ? ['A trip over its budget is marked'] : []), ...(packing ? ['What is still to pack'] : []), ...(shared ? ['A trip is a group whose expenses are shared'] : [])],
      how: [
        'Add a trip with where to, its days and its budget.',
        'Add each booking, a flight, a hotel, a train, a car or an event, with its times and its confirmation number; put the ticket in its notes.',
        ...(places ? ['Add the places to see; tick the ones you went to.'] : []),
        ...(packing ? ['Write what to take; tick it when it is packed.'] : []),
        ...(spending ? ['Add what you spend on the way.'] : []),
      ],
      auto: [
        'The trip and its bookings come to Today and Upcoming on their days and times.',
        'A trip adds up its bookings; one whose last day is before its first is marked, as a booking that ends before it starts.',
        ...(spending ? ['A trip adds up what was spent and what is left of its budget; one over its budget is marked.'] : []),
        ...(packing ? ['A trip counts what is still to pack.'] : []),
      ],
      work: ['Where the tickets and the papers are kept.', ...(packing ? ['What we always take.'] : [])],
    });
  },
};
