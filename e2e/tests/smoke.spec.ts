import { createNote, editor, expect, openNote, test } from '../fixtures';
import { SERVER } from '../playwright.config';

test('a note written on a new device is still there after a reload', async ({ app, phone }) => {
  await createNote(app, phone, 'Smoke');
  await editor(app).click();
  await app.keyboard.type('Written by the smoke test');
  await expect(editor(app)).toContainText('Written by the smoke test');

  await app.reload();
  await openNote(app, phone, 'Smoke');
  await expect(editor(app)).toContainText('Written by the smoke test');
});

test('the test server answers', async ({ request }) => {
  expect((await request.get(`${SERVER}/`)).ok()).toBe(true);
});
