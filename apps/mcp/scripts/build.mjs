// Bundles the command and the parts of packages/agent and packages/core it uses into one file,
// dist/scrawl-mcp.mjs, for Node 20 and up: what `npx @scrawlnotes/mcp` runs, and what the Claude
// Desktop bundle carries.
import { chmodSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const outfile = `${root}dist/scrawl-mcp.mjs`;
const { version } = JSON.parse(readFileSync(`${root}package.json`, 'utf8'));

await build({
  entryPoints: [`${root}src/main.ts`],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  conditions: ['node'],
  define: { __VERSION__: JSON.stringify(version) },
  sourcemap: false,
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: 'info',
});
try {
  chmodSync(outfile, 0o755);
} catch {
  // Windows keeps no mode bits.
}
