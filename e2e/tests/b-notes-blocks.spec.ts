import { type Page } from '@playwright/test';
import { createNote, editor, expect, noteMenu, test, typeInto, vaultFile } from '../fixtures';

const bar = (page: Page) => page.getByRole('toolbar', { name: 'Formatting' });

test('Heading 1 from the format bar makes the line a heading', async ({ app, phone }) => {
  await createNote(app, phone, 'Headed');
  await typeInto(editor(app), 'Plan');
  await bar(app).getByRole('button', { name: 'Heading 1' }).click();
  await expect.poll(() => vaultFile(app, 'Headed.md')).toBe('# Plan');
});

test('Code block from the format bar fences the line', async ({ app, phone }) => {
  await createNote(app, phone, 'Code');
  await typeInto(editor(app), 'x = 1');
  await bar(app).getByRole('button', { name: 'Code block' }).click();
  await expect.poll(() => vaultFile(app, 'Code.md')).toBe('```\nx = 1\n```');
});

test('Table from the format bar puts a table in the note', async ({ app, phone }) => {
  await createNote(app, phone, 'Grid');
  await editor(app).click();
  await bar(app).getByRole('button', { name: 'Table' }).click();
  await expect.poll(() => vaultFile(app, 'Grid.md')).toBe('| Column 1 | Column 2 |\n| -------- | -------- |\n|          |          |\n');
  await expect(app.getByRole('table').first()).toBeVisible();
});

test('a callout from the format bar boxes the line', async ({ app, phone }) => {
  await createNote(app, phone, 'Boxed');
  await typeInto(editor(app), 'Mind the gap');
  await bar(app).getByRole('button', { name: 'Callout' }).click();
  await app.getByRole('menuitem', { name: 'Warning' }).click();
  await expect.poll(() => vaultFile(app, 'Boxed.md')).toBe('> [!WARNING]\n> Mind the gap');
});

test('a word made a link keeps its address', async ({ app, phone }) => {
  await createNote(app, phone, 'Linked');
  await typeInto(editor(app), 'see docs');
  await app.keyboard.press('Shift+Control+ArrowLeft');
  await bar(app).getByRole('button', { name: 'Link' }).click();
  await app.getByRole('combobox', { name: 'Link address' }).or(app.getByRole('textbox', { name: 'Link address' })).fill('https://example.com');
  await app.keyboard.press('Enter');
  await expect.poll(() => vaultFile(app, 'Linked.md')).toBe('see [docs](https://example.com)');
});

test('an image picked goes into the note, its file in _attachments', async ({ app, phone }) => {
  await createNote(app, phone, 'Pictured');
  await editor(app).click();
  const picking = app.waitForEvent('filechooser');
  await bar(app).getByRole('button', { name: /^Image|An image from a file/ }).click();
  // A 1×1 PNG.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await (await picking).setFiles({ name: 'dot.png', mimeType: 'image/png', buffer: png });
  await expect.poll(async () => (await vaultFile(app, 'Pictured.md')) ?? '').toMatch(/^!\[\]\(_attachments\/[\d-]+\.png\)$/);
  // One pixel: there, though too small to be seen. (CodeMirror's own spacers are images too.)
  await expect(app.locator('.cm-content img:not(.cm-widgetBuffer)')).toHaveCount(1);
});

test('a table copied from Excel is pasted as a table', async ({ app, phone }) => {
  await createNote(app, phone, 'Pasted');
  await editor(app).click();
  await app.evaluate(() => {
    const data = new DataTransfer();
    data.setData('text/plain', 'Name\tCity\r\nAcme\tIzmir\r\n');
    data.setData('text/html', '<table><tr><td>Name</td><td>City</td></tr><tr><td>Acme</td><td>Izmir</td></tr></table>');
    document.querySelector('.cm-content')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect.poll(() => vaultFile(app, 'Pasted.md')).toBe('| Name | City  |\n| ---- | ----- |\n| Acme | Izmir |\n');
});

test('PDF and HTML exports download the note', async ({ app, phone }) => {
  test.skip(phone, 'The phone’s own way: m-phone.spec.ts.');
  await createNote(app, phone, 'Report');
  await typeInto(editor(app), 'Numbers');
  await expect.poll(() => vaultFile(app, 'Report.md')).toBe('Numbers');
  for (const [kind, ext] of [['PDF', 'pdf'], ['HTML', 'html']] as const) {
    await noteMenu(app, phone, 'Report');
    await app.getByRole('menuitem', { name: 'Export…' }).click();
    const download = app.waitForEvent('download');
    await app.getByRole('option', { name: new RegExp(`^${kind}`) }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(`Report.${ext}`);
    const { readFile } = await import('node:fs/promises');
    const body = await readFile(await file.path());
    if (ext === 'pdf') expect(body.subarray(0, 5).toString()).toBe('%PDF-');
    else expect(body.toString()).toContain('Numbers');
  }
});

test('a note moved to a new folder keeps its text there', async ({ app, phone }) => {
  await createNote(app, phone, 'Travel');
  await typeInto(editor(app), 'Tickets');
  await expect.poll(() => vaultFile(app, 'Travel.md')).toBe('Tickets');
  await noteMenu(app, phone, 'Travel');
  await app.getByRole('menuitem', { name: 'Move to…' }).click();
  const move = app.getByRole('dialog', { name: 'Move to' });
  await move.getByRole('textbox', { name: 'Folder' }).fill('Archive');
  await app.keyboard.press('Enter');
  await expect.poll(() => vaultFile(app, 'Archive/Travel.md')).toBe('Tickets');
});

test('each note keeps its tab, and a tab closed takes the note off the bar', async ({ app, phone }) => {
  test.skip(phone, 'A phone has pages, not tabs.');
  await createNote(app, phone, 'First');
  await typeInto(editor(app), 'One');
  await createNote(app, phone, 'Second');
  await typeInto(editor(app), 'Two');
  const tabs = app.getByRole('tablist');
  await tabs.getByRole('tab', { name: /^First/ }).click();
  await expect(editor(app)).toHaveText('One');
  await tabs.getByRole('tab', { name: /^Second/ }).click();
  await expect(editor(app)).toHaveText('Two');
  await tabs.getByRole('tab', { name: /^Second/ }).getByRole('button', { name: /^Close/ }).click();
  await expect(tabs.getByRole('tab', { name: /^Second/ })).toHaveCount(0);
  await expect(editor(app)).toHaveText('One');
});
