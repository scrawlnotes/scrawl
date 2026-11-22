import { browse, createNote, editor, expect, noteMenu, test, undoInNotice, vaultFile, typeInto } from '../fixtures';

test('what is typed stays as typed, but a dash or a number at a line start makes a list (PLAN 4.2)', async ({ app, phone }) => {
  await createNote(app, phone, 'Typed');
  await typeInto(editor(app), '# Title\n\nAgenda:\n- First\nsecond\n\n1. One\nTwo\n\nSome **bold** here');
  await expect
    .poll(() => vaultFile(app, 'Typed.md'))
    .toBe('\\# Title\n\nAgenda:\n- First\n- second\n\n1. One\n2. Two\n\nSome **bold\\*\\* here');
});

test('Bold from the format bar makes the chosen words bold', async ({ app, phone }) => {
  await createNote(app, phone, 'Formatted');
  await typeInto(editor(app), 'plain word');
  await app.keyboard.press('Shift+Control+ArrowLeft');
  await app.getByRole('toolbar', { name: 'Formatting' }).getByRole('button', { name: 'Bold' }).click();
  await expect.poll(() => vaultFile(app, 'Formatted.md')).toBe('plain **word**');
});

test('a note renamed from its menu keeps its text under the new name', async ({ app, phone }) => {
  await createNote(app, phone, 'Draft');
  await typeInto(editor(app), 'Kept text');
  await expect.poll(() => vaultFile(app, 'Draft.md')).toBe('Kept text');

  await noteMenu(app, phone, 'Draft');
  await app.getByRole('menuitem', { name: 'Rename' }).click();
  const dialog = app.getByRole('dialog', { name: 'Rename' });
  await dialog.getByRole('textbox', { name: 'Name' }).fill('Final');
  await dialog.getByRole('button', { name: 'Save' }).click();

  await expect.poll(() => vaultFile(app, 'Final.md')).toBe('Kept text');
  expect(await vaultFile(app, 'Draft.md')).toBeNull();
  await browse(app, phone);
  await expect(app.getByRole('button', { name: 'Final', exact: true }).first()).toBeVisible();
});

test('a note deleted goes to Trash without asking, and Undo brings it back', async ({ app, phone }) => {
  await createNote(app, phone, 'Gone');
  await typeInto(editor(app), 'Kept');
  await expect.poll(() => vaultFile(app, 'Gone.md')).toBe('Kept');
  await noteMenu(app, phone, 'Gone');
  await app.getByRole('menuitem', { name: 'Delete' }).click();
  await expect.poll(() => vaultFile(app, 'Gone.md')).toBeNull();
  await undoInNotice(app).click();
  await expect.poll(() => vaultFile(app, 'Gone.md')).toBe('Kept');
});

test('a deleted note goes to Trash and comes back from it', async ({ app, phone }) => {
  await createNote(app, phone, 'Plan');
  await typeInto(editor(app), 'Some text');
  await expect.poll(() => vaultFile(app, 'Plan.md')).toBe('Some text');

  await noteMenu(app, phone, 'Plan');
  await app.getByRole('menuitem', { name: 'Delete' }).click();
  await browse(app, phone);
  await expect(app.getByRole('button', { name: 'Plan', exact: true })).toHaveCount(0);

  await app.getByRole('button', { name: /^Trash/ }).first().click();
  await app.getByRole('button', { name: 'Restore to the top level' }).click();
  await expect.poll(() => vaultFile(app, 'Plan.md')).toBe('Some text');
});

test('History opens on the note and closes with Escape', async ({ app, phone }) => {
  test.skip(phone, 'A page on the phone, closed with Back.');
  await createNote(app, phone, 'Versions');
  await typeInto(editor(app), 'Now');
  await noteMenu(app, phone, 'Versions');
  await app.getByRole('menuitem', { name: 'History…' }).click();
  const history = app.getByRole('dialog', { name: /History of Versions/ });
  await expect(history.getByRole('option', { name: 'Current version' })).toBeVisible();
  await app.keyboard.press('Escape');
  await expect(history).toBeHidden();
});

test('Export as Markdown gives the note as written', async ({ app, phone }) => {
  test.skip(phone, 'The phone shares the file instead of downloading it.');
  await createNote(app, phone, 'Exported');
  await typeInto(editor(app), '- one\ntwo');
  await expect.poll(() => vaultFile(app, 'Exported.md')).toBe('- one\n- two');
  await noteMenu(app, phone, 'Exported');
  await app.getByRole('menuitem', { name: 'Export…' }).click();
  const download = app.waitForEvent('download');
  await app.getByRole('option', { name: /^Markdown/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('Exported.md');
  const { readFile } = await import('node:fs/promises');
  expect(await readFile(await file.path(), 'utf8')).toBe('- one\n- two');
});

test('a quick note shows as a card and stays after a reload', async ({ app, phone }) => {
  await browse(app, phone);
  await app.getByRole('button', { name: 'Quick notes', exact: true }).first().click();
  // A phone takes it from +, on a page of its own; a computer from Take a note… on top of the cards.
  if (phone) await app.getByRole('button', { name: 'Create', exact: true }).last().click();
  else await app.getByRole('button', { name: 'Take a note…' }).click();
  await expect(app.getByRole('textbox', { name: 'Note' })).toBeVisible();
  await app.keyboard.type('Buy milk');
  if (phone) await app.getByRole('button', { name: /^Back to Quick notes/ }).click();
  else await app.keyboard.press('Escape');
  await expect(app.getByText('Buy milk').first()).toBeVisible();
  await app.reload();
  await browse(app, phone);
  // With one in it the phone's row says so: Quick notes 1.
  await app.getByRole('button', { name: /^Quick notes( \d+)?$/ }).first().click();
  await expect(app.getByText('Buy milk').first()).toBeVisible({ timeout: 15_000 });
});
