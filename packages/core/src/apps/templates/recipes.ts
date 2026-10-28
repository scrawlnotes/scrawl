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
const SKIPPED = 'Skipped';
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
    app.field('meal-plans', day('until', 'Until'));
    app.field('meal-plans', rollup('items', 'Items', planItems, 'count'));
    app.field('meal-plans', rollup('followed', 'Followed', days, 'count', undefined, [{ field: 'status', op: 'is', value: ['Followed'] }]));
    app.field('meal-plans', rollup('last', 'Last', days, 'max', 'day', [{ field: 'status', op: 'is', value: ['Followed'] }]));
    app.block('meal-plans', { block: 'linked', collection: planItems, style: 'table', fields: ['name', 'on', 'recipe'], sort: 'order', group: ['meal'], choose: true });
    app.view('meal-plans', {
      id: 'days',
      name: 'Plan days',
      kind: 'calendar',
      calendar: {
        start: 'from',
        upcoming: true,
        repeat: { days: 'days', from: 'from', until: 'until', closedBy: { collection: days, link: 'plan', day: 'day' }, start: 'Start', skip: { label: 'Skip', set: { status: SKIPPED } } },
      },
      conditions: [],
    });

    // A plan's item: what to eat, written as it is; the ones of a meal are alternatives; one may be of some weekdays only.
    app.field('plan-items', nameField('What'));
    app.field('plan-items', { ...link('plan', 'Plan', plans), required: true });
    app.field('plan-items', select('meal', 'Meal', meals, colors, meals[0]));
    app.field('plan-items', select('on', 'On', [EVERY_DAY, ...WEEKDAYS], Object.fromEntries([EVERY_DAY, ...WEEKDAYS].map((d) => [d, 'gray' as const])), EVERY_DAY));
    app.field('plan-items', number('order', 'Order'));
    app.field('plan-items', link('recipe', 'Recipe', app.path('recipes')));
    app.rule('plan-items', { kind: 'onSave', name: 'Its name', src: 'onSave("Its name", () => {\n  if (empty(name) && !empty(recipe)) name = recipe.name\n})' });

    // Days: the plan's day, followed or skipped; how many of its meals were eaten, and what off the plan.
    app.field('meal-days', nameField());
    app.field('meal-days', { ...day('day', 'Day', true), required: true });
    app.field('meal-days', link('plan', 'Plan', plans));
    app.field('meal-days', select('status', 'Status', ['Followed', SKIPPED], { Followed: 'green', [SKIPPED]: 'gray' }, 'Followed'));
    // Each meal by its place: a meal whose items are on the day, and one of them ticked. Kept off the window.
    const own = [{ field: 'off_plan', op: 'false' as const }];
    meals.forEach((meal, i) => {
      const of = { field: 'meal', op: 'is' as const, value: [meal] };
      app.field('meal-days', rollup(`has_${i + 1}`, `${meal} on the day`, dayItems, 'count', undefined, [...own, of]));
      app.field('meal-days', rollup(`ate_${i + 1}`, `${meal} eaten`, dayItems, 'count', undefined, [...own, of, { field: 'done', op: 'true' }]));
    });
    const sum = (key: string) => meals.map((_, i) => `(${key}_${i + 1} > 0 ? 1 : 0)`).join(' + ');
    app.field('meal-days', formula('meals', 'Meals', `${sum('has')}`));
    app.field('meal-days', formula('eaten', 'Eaten', `${sum('ate')}`));
    app.field('meal-days', rollup('off', 'Off plan', dayItems, 'count', undefined, [{ field: 'off_plan', op: 'true' }]));
    app.field('meal-days', formula('summary', 'Meals eaten', 'meals > 0 ? text(eaten) + " of " + text(meals) : ""'));
    app.field('meal-days', formula('this_week', 'This week', 'today() - day < 7'));
    app.field('meal-days', formula('this_month', 'This month', 'month(day) == month(today()) && year(day) == year(today())'));
    app.view('meal-days', { id: 'this-week', name: 'This week', conditions: [{ field: 'this_week', op: 'true' }], sort: { key: 'day', dir: 'desc' } }, true);
    app.view('meal-days', { id: 'this-month', name: 'This month', conditions: [{ field: 'this_month', op: 'true' }], sort: { key: 'day', dir: 'desc' } });
    app.view('meal-days', { id: 'calendar', name: 'Calendar', kind: 'calendar', calendar: { start: 'day', color: 'status', upcoming: false }, conditions: [] });
    app.block('meal-days', { block: 'linked', collection: dayItems, style: 'table', fields: ['done', 'name', 'recipe'], sort: 'order', group: ['meal'], edit: ['done'], choose: true, apart: 'off_plan' });
    // The plan's items of the day's weekday come, none ticked: what was eaten is ticked.
    app.rule('meal-days', {
      kind: 'onChange',
      name: 'Fill from the plan',
      src: `onChange("plan", "Fill from the plan", () => {
  const on = weekday(day)
  for (const i of find("${app.called('plan-items')}", { plan: plan }).filter((i) => i.on == "${EVERY_DAY}" || i.on == on)) {
    add("${app.called('day-items')}", { name: i.name, meal: i.meal, order: i.order, recipe: i.recipe, done: false, off_plan: false, day: day })
  }
})`,
    });
    app.rule('meal-days', { kind: 'onSave', name: 'Its name', src: 'onSave("Its name", () => {\n  if (empty(name) && !empty(plan)) name = plan.name + " · " + text(day)\n})' });
    app.rule('meal-days', { kind: 'check', name: 'Skipped, but meals are ticked', src: `check("status", () => status != "${SKIPPED}" || (eaten == 0 && off == 0), "Skipped, but meals are ticked")` });
    app.rule('meal-days', {
      kind: 'check',
      name: 'Another day of this plan on this day',
      src: `check("day", () => empty(plan) || find("${app.called('meal-days')}", { plan: plan, day: day }).length <= 1, "Another day of this plan on this day")`,
    });

    // A day's item: from the plan, or eaten off it, added by hand.
    app.field('day-items', nameField('What'));
    app.field('day-items', { ...link('day_of', 'Day', days), required: true });
    app.field('day-items', select('meal', 'Meal', meals, colors, meals[0]));
    app.field('day-items', number('order', 'Order'));
    app.field('day-items', checkbox('done', 'Eaten', false));
    app.field('day-items', checkbox('off_plan', 'Off plan', true));
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
      what: `Your recipes and where each is written, a plan to eat by and each of its days as it went${shopping ? ', and the shopping list' : ''}.`,
      pieces: ['meal-days', 'day-items', 'meal-plans', 'plan-items', 'recipes', 'ingredients', ...(shopping ? ['shopping'] : [])],
      glance: ['A plan’s days in Today, with Start and Skip', 'A day’s meals ticked as they are eaten', 'A recipe with no ingredients is marked', ...(shopping ? ['A recipe writes the shopping list'] : [])],
      how: [
        `Write your plan in ${app.called('meal-plans')}: its days, from when until when, and its items meal by meal (${meals.join(', ')}), each what to eat as you would say it; the items of a meal are its alternatives. An item for some weekdays only has its day in On. Put the dietitian's list in its notes.`,
        'On the plan’s day press Start in Today: its items for that day come, none ticked; tick what you ate, add what you ate off the plan, Save. On a day you did not follow it, press Skip.',
        'Add a recipe with its link, how long it takes and for how many, and its ingredients; an item of the plan may point to it.',
        ...(shopping ? ['Press Add to shopping list on a recipe; tick what you bought.'] : []),
      ],
      auto: [
        'A plan’s days come to Today and Upcoming until its last day; one gone by with no day written stays in Overdue.',
        'Starting a day brings the plan’s items of its weekday; a day says how many of its meals were eaten, one of a meal’s alternatives enough, and how many things off the plan.',
        'A day skipped with meals ticked, and two days of a plan on one day, are marked.',
        'A recipe with no ingredients is marked.',
        ...(shopping ? ['Add to shopping list writes a recipe’s ingredients on the list; the list shows what is still to buy.'] : []),
      ],
      work: ['Who writes the plan, and when it is looked at again.', ...(shopping ? ['When the shopping is done.'] : [])],
    });
  },
};
