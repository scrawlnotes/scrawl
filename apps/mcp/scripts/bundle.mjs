// Makes the Claude Desktop bundle, dist/scrawl.mcpb: the built command as a Node server, with a
// manifest that lets the person pick the folders of their notes, or leave it to the app's own
// settings. Built after scripts/build.mjs. See design/agent.md, 6.
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(`${root}package.json`, 'utf8'));
const dir = `${root}bundle`;

rmSync(dir, { recursive: true, force: true });
mkdirSync(`${dir}/server`, { recursive: true });
copyFileSync(`${root}dist/scrawl-mcp.mjs`, `${dir}/server/scrawl-mcp.mjs`);

const manifest = {
  manifest_version: '0.3',
  name: 'scrawl',
  display_name: 'Scrawl',
  version: pkg.version,
  description: 'Your Scrawl notes, task lists, boards and collections, for Claude.',
  long_description:
    'Claude reads and writes the spaces Scrawl keeps on this computer: the notes, task lists, boards and collections of your personal space and of the spaces you share. Leave the folders empty to use what the Scrawl app is set to; or pick the folders yourself.',
  author: { name: 'Scrawl', url: 'https://scrawlnotes.com' },
  homepage: 'https://scrawlnotes.com',
  repository: { type: 'git', url: 'https://github.com/scrawlnotes/scrawl' },
  license: 'MIT',
  keywords: ['notes', 'tasks', 'kanban', 'crm', 'markdown'],
  server: {
    type: 'node',
    entry_point: 'server/scrawl-mcp.mjs',
    mcp_config: {
      command: 'node',
      args: ['${__dirname}/server/scrawl-mcp.mjs', '--client', 'Claude', '${user_config.folders}'],
    },
  },
  user_config: {
    folders: {
      type: 'directory',
      title: 'Folders of your notes',
      description: 'The folders of your Scrawl spaces. Leave empty to use the folders the Scrawl app is set to.',
      multiple: true,
      required: false,
    },
  },
  tools: [
    { name: 'spaces', description: 'The spaces Claude can reach, with today’s date and your name' },
    { name: 'tree', description: 'What is in a space' },
    { name: 'read', description: 'The text of a file' },
    { name: 'write', description: 'Writes a file' },
    { name: 'search', description: 'Finds anything by name or text' },
    { name: 'create', description: 'Makes a note, a task list, a board, a collection or a folder' },
    { name: 'trash', description: 'Sends something to the trash' },
    { name: 'records', description: 'The records of a collection' },
    { name: 'save_record', description: 'Adds or changes a record' },
    { name: 'cards', description: 'The cards of a board' },
    { name: 'save_card', description: 'Adds, changes or moves a card' },
    { name: 'comment', description: 'Comments on a card' },
    { name: 'tasks', description: 'Tasks by list or by what is due' },
    { name: 'save_task', description: 'Adds, changes or closes a task' },
  ],
  compatibility: { platforms: ['darwin', 'win32', 'linux'], runtimes: { node: '>=20.0.0' } },
};
writeFileSync(`${dir}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);

const cli = `${root}node_modules/@anthropic-ai/mcpb/dist/cli/cli.js`;
const out = `${root}dist/scrawl.mcpb`;
rmSync(out, { force: true });
const packed = spawnSync(process.execPath, [cli, 'pack', dir, out], { stdio: 'inherit' });
if (packed.status !== 0) process.exit(packed.status ?? 1);
console.log(`Bundle: ${out}`);
