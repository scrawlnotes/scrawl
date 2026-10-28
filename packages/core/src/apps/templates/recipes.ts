import { calendar, checkbox, day, formula, link, multi, nameField, number, rollup, select, text } from '../pieces';
import type { AppTemplate } from '../types';

// Recipes and meal plan (design/meal-plans.md): your recipes, their links and what goes into them;
// a plan to eat by, a diet written once meal by meal, the ones of a meal alternatives; its days in
// Today, each ticked as it was eaten, what was eaten off the plan added; and the shopping list a
// recipe writes.

const MEALS = ['Breakfast', 'Snack', 'Lunch', 'Dinner'];
const MEAL_COLORS = { Breakfast: 'yellow', Snack: 'teal', Lunch: 'green', Dinner: 'blue' } as const;
const KINDS = ['Main', 'Soup', 'Salad', 'Side', 'Dessert', 'Breakfast', 'Snack'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const EVERY_DAY = 'Every day';
const DIDNT = "Didn't follow";
/** The meals a day counts, each by its place: as many as PIECES' `meal-days` keeps off its window. */
export const MAX_MEALS = 8;

export const recipes: AppTemplate = {
  id: 'recipes',
  version: 2,
  group: 'home',
  name: 'apps.recipes.name',
  short: 'apps.recipes.short',
  icon: 'list',
  what: 'apps.recipes.what',
  questions: [
    { key: 'meals', kind: 'list', label: 'apps.recipes.meals', default: MEALS, add: 'apps.recipes.addMeal', help: 'apps.recipes.mealsHelp' },
    { key: 'shopping', kind: 'yesno', label: 'apps.recipes.shopping', default: true },
  ],
  money: () => false,
  pieces: (answers) => ['recipes', 'ingredients', 'meal-plans', 'plan-items', 'meal-days', 'day-items', ...(answers.shopping !== false ? ['shopping'] : [])],
  // A Recipes app set up before keeps its Meal plan in the menu.
  menu: ['meal-days', 'meal-plans', 'recipes', 'shopping', 'meals'],
  build(app, answers) {
    const listed = ((answers.meals as string[] | undefined) ?? []).map((m) => m.trim()).filter(Boolean);
    // A plan needs its meals: none given, it has the usual ones; a day counts the first eight.
    const meals = (listed.length > 0 ? listed : MEALS).slice(0, MAX_MEALS);
    const colors = Object.fromEntries(meals.filter((m) => m in MEAL_COLORS).map((m) => [m, MEAL_COLORS[m as keyof typeof MEAL_COLORS]]));
    const shopping = app.hasPiece('shopping');
    const parts = app.path('ingredients');
    const plans = app.path('meal-plans');
    const days = app.path('meal-days');
    const planItems = app.path('plan-items');
    const dayItems = app.path('day-items');

    // Recipes: where each is written, how long it takes, for how many; what goes into it.
    app.field('recipes', nameField());
    app.field('recipes', { key: 'link', label: 'Link', type: 'url' });
    app.field('recipes', select('type', 'Type', KINDS));
    app.field('recipes', number('time', 'Time', { format: { style: 'duration' } }));
    app.field('recipes', number('serves', 'Serves'));
    app.field('recipes', multi('tags', 'Tags', []));
    app.field('recipes', rollup('ingredients', 'Ingredients', parts, 'count'));
    app.block('recipes', { block: 'linked', collection: parts, style: 'table', fields: ['quantity'] });
    app.rule('recipes', { kind: 'check', name: 'No ingredients yet', src: 'check(null, () => ingredients > 0, "No ingredients yet")' });

    app.field('ingredients', nameField());
    app.field('ingredients', { ...link('recipe', 'Recipe', app.path('recipes')), required: true });
    app.field('ingredients', text('quantity', 'How much'));

    // Plans: a diet, its days, from when until when; its items meal by meal, the dietitian's list in its notes.
    app.field('meal-plans', nameField());
    app.field('meal-plans', { ...multi('days', 'Days', WEEKDAYS), default: WEEKDAYS });
    app.field('meal-plans', { ...day('from', 'From', true), required: true });
    // Four weeks from today unless said: its days are written as it is saved, so it has an end.
    app.field('meal-plans', { ...day('until', 'Until'), required: true, default: '=today() + 27' });
    app.field('meal-plans', rollup('items', 'Items', planItems, 'count'));
    app.field('meal-plans', rollup('not_followed', DIDNT, days, 'count', undefined, [{ field: 'status', op: 'is', value: [DIDNT] }]));
    app.block('meal-plans', { block: 'linked', collection: planItems, style: 'table', fields: ['name', 'on', 'recipe'], sort: 'order', group: ['meal'], choose: true });

    // A plan's item: what to eat, written as it is; the ones of a meal are alternatives; one may be of some weekdays only.
    app.field('plan-items', nameField('What'));
    app.field('plan-items', { ...link('plan', 'Plan', plans), required: true });
    app.field('plan-items', select('meal', 'Meal', meals, colors, meals[0]));
    app.field('plan-items', select('on', 'On', [EVERY_DAY, ...WEEKDAYS], Object.fromEntries([EVERY_DAY, ...WEEKDAYS].map((d) => [d, 'gray' as const])), EVERY_DAY));
    app.field('plan-items', number('order', 'Order'));
    app.field('plan-items', link('recipe', 'Recipe', app.path('recipes')));
    app.rule('plan-items', { kind: 'onSave', name: 'Its name', src: 'onSave("Its name", () => {\n  if (empty(name) && !empty(recipe)) name = recipe.name\n})' });

    // A plan's days are written as it is saved, each with its items; a day no one has touched follows the plan.
    const D = app.called('meal-days');
    const I = app.called('day-items');
    const P = app.called('plan-items');
    const on = (day: string) => `(i) => i.on == "${EVERY_DAY}" || i.on == weekday(${day})`;
    const put = (day: string, items: string, indent: string) => `${indent}for (const i of ${items}) add("${I}", { day_of: ${day}, name: i.name, meal: i.meal, order: i.order, recipe: i.recipe, day: ${day}.day })`;
    const touched = (day: string) => `find("${I}", { day_of: ${day} }).some((h) => h.done || !empty(h.instead)) || ${day}.status == "${DIDNT}"`;
    app.rule('meal-plans', {
      kind: 'onSave',
      name: 'Its days',
      src: `onSave("Its days", () => {
  const items = find("${P}", { plan: this })
  const made = find("${D}", { plan: this })
  for (const d of dates(from, until).filter((d) => days.includes(weekday(d)) && !made.some((m) => m.day == d))) {
    const day = add("${D}", { plan: this, day: d, name: name + " · " + weekday(d) + " " + text(d) })
${put('day', `items.filter(${on('d')})`, '    ')}
  }
  // A day no one has touched: gone when it is no longer one of the plan's, else as the plan is now.
  for (const m of made.filter((m) => !(${touched('m')}))) {
    const have = find("${I}", { day_of: m })
    if (m.day < from || m.day > until || !days.includes(weekday(m.day))) {
      for (const h of have) remove(h)
      remove(m)
    } else {
      const want = items.filter(${on('m.day')})
      if (have.length != want.length || !want.every((w) => have.some((h) => h.name == w.name && h.meal == w.meal))) {
        for (const h of have) remove(h)
${put('m', 'want', '        ')}
      }
    }
  }
})`,
    });
    // An item changed or added: the plan's days no one has touched take it.
    app.rule('plan-items', {
      kind: 'onSave',
      name: "Its plan's days",
      src: `onSave("Its plan's days", () => {
  const others = find("${P}", { plan: plan }).filter((i) => i != this)
  for (const m of find("${D}", { plan: plan }).filter((m) => !(${touched('m')}))) {
    const mine = on == "${EVERY_DAY}" || on == weekday(m.day)
    const want = others.filter(${on('m.day')})
    const have = find("${I}", { day_of: m })
    if (have.length != want.length + (mine ? 1 : 0) || !want.every((w) => have.some((h) => h.name == w.name && h.meal == w.meal)) || (mine && !have.some((h) => h.name == name && h.meal == meal))) {
      for (const h of have) remove(h)
${put('m', 'want', '      ')}
      if (mine) add("${I}", { day_of: m, name: name, meal: meal, order: order, recipe: recipe, day: m.day })
    }
  }
})`,
    });

    // Days: each of a plan's days, from today on; followed unless said, its meals eaten or changed.
    app.field('meal-days', nameField());
    app.field('meal-days', { ...day('day', 'Day', true), required: true });
    app.field('meal-days', link('plan', 'Plan', plans));
    app.field('meal-days', select('status', 'Status', ['Followed', DIDNT], { Followed: 'green', [DIDNT]: 'gray' }, 'Followed'));
    // Each meal by its place: a meal whose items are on the day, one of them ticked, one with what was had instead. Kept off the window.
    meals.forEach((meal, i) => {
      const of = { field: 'meal', op: 'is' as const, value: [meal] };
      app.field('meal-days', rollup(`has_${i + 1}`, `${meal} on the day`, dayItems, 'count', undefined, [of]));
      app.field('meal-days', rollup(`ate_${i + 1}`, `${meal} eaten`, dayItems, 'count', undefined, [of, { field: 'done', op: 'true' }]));
      app.field('meal-days', rollup(`chg_${i + 1}`, `${meal} changed`, dayItems, 'count', undefined, [of, { field: 'instead', op: 'not-empty' }]));
    });
    app.field('meal-days', formula('meals', 'Meals', meals.map((_, i) => `(has_${i + 1} > 0 ? 1 : 0)`).join(' + ')));
    app.field('meal-days', formula('eaten', 'Eaten', meals.map((_, i) => `(ate_${i + 1} + chg_${i + 1} > 0 ? 1 : 0)`).join(' + ')));
    app.field('meal-days', rollup('changed', 'Changed', dayItems, 'count', undefined, [{ field: 'instead', op: 'not-empty' }]));
    app.field('meal-days', formula('summary', 'Meals', 'meals > 0 ? text(eaten) + " of " + text(meals) : ""'));
    app.field('meal-days', formula('ahead', 'From today', 'day >= today()'));
    app.view('meal-days', { id: 'from-today', name: 'From today', conditions: [{ field: 'ahead', op: 'true' }], sort: { key: 'day', dir: 'asc' }, columns: ['status', 'summary', 'changed'] }, true);
    app.view('meal-days', { id: 'all', name: 'All', conditions: [], sort: { key: 'day', dir: 'desc' }, columns: ['status', 'summary', 'changed'] });
    // Today's day comes to Today, not to Upcoming before it.
    app.view('meal-days', { id: 'calendar', name: 'Calendar', kind: 'calendar', calendar: { start: 'day', color: 'status', upcoming: 'today' }, conditions: [] });
    app.block('meal-days', { block: 'linked', collection: dayItems, style: 'table', fields: ['done', 'name', 'instead'], sort: 'order', group: ['meal'], edit: ['done', 'instead'], choose: true, instead: 'instead' });
    app.rule('meal-days', { kind: 'onSave', name: 'Its name', src: 'onSave("Its name", () => {\n  if (empty(name) && !empty(plan)) name = plan.name + " · " + weekday(day) + " " + text(day)\n})' });
    app.rule('meal-days', { kind: 'action', name: DIDNT, src: `action("${DIDNT}", { when: () => status != "${DIDNT}", hint: "Marked already" }, () => {\n  status = "${DIDNT}"\n})` });
    app.rule('meal-days', { kind: 'check', name: "Didn't follow, but meals are ticked", src: `check("status", () => status != "${DIDNT}" || eaten == 0, "Didn't follow, but meals are ticked")` });

    // A day's item: what the plan says, ticked as eaten, or what was had instead.
    app.field('day-items', nameField('What'));
    app.field('day-items', { ...link('day_of', 'Day', days), required: true });
    app.field('day-items', select('meal', 'Meal', meals, colors, meals[0]));
    app.field('day-items', number('order', 'Order'));
    app.field('day-items', checkbox('done', 'Eaten', false));
    app.field('day-items', text('instead', 'Instead'));
    app.field('day-items', link('recipe', 'Recipe', app.path('recipes')));
    app.field('day-items', day('day', 'Day'));
    app.rule('day-items', {
      kind: 'onSave',
      name: 'Its day',
      src: 'onSave("Its day", () => {\n  if (!empty(day_of) && day != day_of.day) day = day_of.day\n  if (empty(name) && !empty(recipe)) name = recipe.name\n})',
    });

    if (shopping) {
      const list = app.called('shopping');
      app.field('shopping', nameField('Item'));
      app.field('shopping', text('quantity', 'How much'));
      app.field('shopping', checkbox('got', 'Bought'));
      app.field('shopping', link('recipe', 'For', app.path('recipes')));
      app.view('shopping', { id: 'to-buy', name: 'To buy', conditions: [{ field: 'got', op: 'false' }] }, true);
      app.rule('recipes', {
        kind: 'action',
        name: 'Add to shopping list',
        src: `action("Add to shopping list", { when: () => ingredients > 0, hint: "No ingredients yet" }, () => {
  for (const i of find("${app.called('ingredients')}", { recipe: this })) {
    add("${list}", { name: i.name, quantity: i.quantity, recipe: this })
  }
})`,
      });
    }

    app.about({
      title: 'Recipes and meal plan',
      what: `Your recipes and where each is written, and a plan to eat by: each of its days with what to eat${shopping ? ', and the shopping list' : ''}.`,
      pieces: ['meal-days', 'day-items', 'meal-plans', 'plan-items', 'recipes', 'ingredients', ...(shopping ? ['shopping'] : [])],
      glance: ['A plan’s days written by themselves', 'Today’s in Today', 'Tick what you ate, or write what you ate instead', 'A recipe with no ingredients is marked', ...(shopping ? ['A recipe writes the shopping list'] : [])],
      how: [
        `Write your plan in ${app.called('meal-plans')}: its days, from when until when, and its items meal by meal (${meals.join(', ')}), each what to eat as you would say it; the items of a meal are its alternatives. An item for some weekdays only has its day in On. Put the dietitian's list in its notes.`,
        `Its days are in ${app.called('meal-days')}, from today on. Open one, or today's in Today: tick what you ate, write what you ate instead beside it, or press ${DIDNT}. A day you leave as it is stays as it is.`,
        'Add a recipe with its link, how long it takes and for how many, and its ingredients; an item of the plan may point to it.',
        ...(shopping ? ['Press Add to shopping list on a recipe; tick what you bought.'] : []),
      ],
      auto: [
        'Saving a plan writes each of its days from its first to its last, with the items of its weekday; a longer plan gets the days added, a shorter one loses those no one touched.',
        'A change to a plan’s items reaches its days no one has ticked or written in; the others stay as they were.',
        'A day says how many of its meals were eaten, one of a meal’s alternatives or what was had instead enough, and how many were changed.',
        `Today's day comes to Today, not to Upcoming before it. A day marked ${DIDNT} with meals ticked is marked.`,
        'A recipe with no ingredients is marked.',
        ...(shopping ? ['Add to shopping list writes a recipe’s ingredients on the list; the list shows what is still to buy.'] : []),
      ],
      work: ['Who writes the plan, and when it is looked at again.', ...(shopping ? ['When the shopping is done.'] : [])],
    });
  },
};
