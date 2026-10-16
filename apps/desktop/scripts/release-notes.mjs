// The notes of one version from CHANGELOG.md, for its GitHub release and the app's update.
// `node scripts/release-notes.mjs 0.1.0` prints what is under "## 0.1.0", and fails when there is
// nothing, so that no version goes out without its notes.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** What is under the version's heading, up to the next version; null when there is nothing. */
export function notesOf(changelog, version) {
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${version}`);
  if (start < 0) return null;
  const next = lines.findIndex((line, i) => i > start && line.startsWith('## '));
  const notes = lines
    .slice(start + 1, next < 0 ? undefined : next)
    .join('\n')
    .trim();
  return notes || null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const version = process.argv[2];
  const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  const notes = version ? notesOf(changelog, version) : null;
  if (!notes) {
    console.error(`apps/desktop/CHANGELOG.md has no notes under "## ${version ?? '<version>'}"`);
    process.exit(1);
  }
  console.log(notes);
}
