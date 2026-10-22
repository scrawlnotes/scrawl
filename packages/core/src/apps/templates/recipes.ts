import { calendar, checkbox, day, link, multi, nameField, number, rollup, select, text } from '../pieces';
import type { AppTemplate } from '../types';

// Recipes and meal plan (design/more-apps.md 4.4): your recipes and what goes into them, what is
// cooked on which day, and the shopping list a recipe or the week's meals write.

const MEALS = ['Breakfast', 'Lunch', 'Dinner'];
const KINDS = ['Main', 'Soup', 'Salad', 'Side', 'Dessert', 'Breakfast', 'Snack'];

export const recipes: AppTemplate = {
  id: 'recipes',
  version: 1,
  group: 'home',
  name: 'apps.recipes.name',
  short: 'apps.recipes.short',
  icon: 'list',
  what: 'apps.recipes.what',
  questions: [
    { key: 'meals', kind: 'list', label: 'apps.recipes.meals', default: MEALS, add: 'apps.recipes.addMeal' },
    { key: 'shopping', kind: 'yesno', label: 'apps.recipes.shopping', default: true },
  ],
  money: () => false,
  pieces: (answers) => ['recipes', 'ingredients', 'meals', ...(answers.shopping !== false ? ['shopping'] : [])],
  build(app, answers) {
    const listed = (answers.meals as string[] | undefined) ?? [];
    // A plan needs its meals: none given, it has the usual ones.
    const meals = listed.length > 0 ? listed : MEALS;
    const shopping = app.hasPiece('shopping');
    const parts = app.path('ingredients');

    app.field('recipes', nameField());
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

    app.field('meals', nameField());
    app.field('meals', { ...day('date', 'Day', true), required: true });
    app.field('meals', select('meal', 'Meal', meals, { Breakfast: 'yellow', Lunch: 'green', Dinner: 'blue' }, meals.includes('Dinner') ? 'Dinner' : meals[0]));
    app.field('meals', link('recipe', 'Recipe', app.path('recipes')));
    app.view('meals', calendar({ start: 'date', color: 'meal', upcoming: true }));
    app.rule('meals', { kind: 'onSave', name: 'Its name', src: 'onSave("Its name", () => {\n  if (empty(name) && !empty(recipe)) name = recipe.name\n})' });
    app.block('recipes', { block: 'linked', collection: app.path('meals'), style: 'list', fields: ['date', 'meal'], sort: 'date' });

    if (shopping) {
      const list = app.called('shopping');
      app.field('shopping', nameField('Item'));
      app.field('shopping', text('quantity', 'How much'));
      app.field('shopping', checkbox('got', 'Bought'));
      app.field('shopping', link('recipe', 'For', app.path('recipes')));
      app.view('shopping', { id: 'to-buy', name: 'To buy', conditions: [{ field: 'got', op: 'false' }] }, true);
      // A recipe's ingredients written on the list, as a rule writes it at `indent`.
      const put = (recipe: string, indent: string) =>
        [`${indent}for (const i of find("${app.called('ingredients')}", { recipe: ${recipe} })) {`, `${indent}  add("${list}", { name: i.name, quantity: i.quantity, recipe: ${recipe} })`, `${indent}}`].join('\n');
      app.rule('recipes', { kind: 'action', name: 'Add to shopping list', src: `action("Add to shopping list", { when: () => ingredients > 0, hint: "No ingredients yet" }, () => {\n${put('this', '  ')}\n})` });
      app.rule('meals', {
        kind: 'action',
        name: 'Shop for the week',
        src: `action("Shop for the week", { say: () => "The ingredients of the meals of the seven days from " + text(date) }, () => {
  for (const m of find("${app.called('meals')}").filter((m) => !empty(m.recipe) && m.date >= date && m.date < date + 7)) {
${put('m.recipe', '    ')}
  }
})`,
      });
    }

    app.about({
      title: 'Recipes and meal plan',
      what: `Your recipes and what goes into them, what is cooked on which day${shopping ? ', and the shopping list' : ''}.`,
      pieces: ['recipes', 'ingredients', 'meals', ...(shopping ? ['shopping'] : [])],
      glance: ["The week's meals on a calendar, in Today", 'A recipe with no ingredients is marked', ...(shopping ? ['A recipe or the week writes the shopping list'] : [])],
      how: [
        'Add a recipe with how long it takes and for how many; write how it is made in its notes, and its ingredients on its screen.',
        `Plan the week: a meal for a day${meals.length > 0 ? ` (${meals.join(', ')})` : ''}, with its recipe.`,
        ...(shopping ? ['Press Add to shopping list on a recipe, or Shop for the week on a day of the plan; tick what you bought.'] : []),
      ],
      auto: [
        "A meal is named after its recipe; the day's meals come to Today.",
        'A recipe with no ingredients is marked.',
        ...(shopping ? ['Add to shopping list writes a recipe’s ingredients on the list; Shop for the week writes those of the meals of the seven days from that one. The list shows what is still to buy.'] : []),
      ],
      work: ['Who plans the week, and when.', ...(shopping ? ['When the shopping is done.'] : [])],
    });
  },
};
