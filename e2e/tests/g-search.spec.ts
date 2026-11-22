import { createNote, editor, expect, test, typeInto } from '../fixtures';

test('a note is found by a word in it and opens from the result', async ({ app, phone }) => {
  await createNote(app, phone, 'Budget');
  await typeInto(editor(app), 'Quarterly numbers for the board');

  if (phone) {
    await app.getByRole('navigation', { name: 'Places' }).getByRole('button', { name: 'Search' }).click();
    await app.getByRole('searchbox', { name: 'Search' }).fill('quarterly');
  } else {
    await app.getByRole('tab', { name: /Welcome to Scrawl/ }).click();
    await app.keyboard.press('Control+k');
    await app.getByRole('combobox', { name: 'Search' }).fill('quarterly');
  }
  const result = app.getByRole(phone ? 'button' : 'option', { name: /^Budget/ }).first();
  await expect(result).toBeVisible();
  await result.click();
  await expect(editor(app)).toContainText('Quarterly numbers for the board');
});
