import { createNote, editor, expect, openNote, test, typeInto } from '../fixtures';
import { SERVER } from '../playwright.config';

test('a note written on a new device is still there after a reload', async ({ app, phone }) => {
  await createNote(app, phone, 'Smoke');
  await typeInto(editor(app), 'Written by the smoke test');
  await expect(editor(app)).toContainText('Written by the smoke test');

  await app.reload();
  await openNote(app, phone, 'Smoke');
  await expect(editor(app)).toContainText('Written by the smoke test');
});

test('the test server answers', async ({ request }) => {
  expect((await request.get(`${SERVER}/`)).ok()).toBe(true);
});
