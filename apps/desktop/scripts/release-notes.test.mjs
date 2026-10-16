import assert from 'node:assert/strict';
import { test } from 'node:test';
import { notesOf } from './release-notes.mjs';

const changelog = ['# Changelog', '', '## 0.2.0', '', '- Restart in the status bar.', '', '## 0.1.0', '', 'The first release.', ''].join('\r\n');

test('the notes are what is under the version, up to the next one', () => {
  assert.equal(notesOf(changelog, '0.2.0'), '- Restart in the status bar.');
  assert.equal(notesOf(changelog, '0.1.0'), 'The first release.');
});

test('a version without notes has none', () => {
  assert.equal(notesOf(changelog, '0.3.0'), null);
  assert.equal(notesOf('## 0.3.0\n\n## 0.2.0\n- x', '0.3.0'), null);
  assert.equal(notesOf(changelog, '0.1'), null);
});
