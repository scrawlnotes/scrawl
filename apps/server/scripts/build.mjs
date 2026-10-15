// Bundles the server and the parts of packages/core it uses into one file, dist/server.mjs, for
// Node 24. With --watch it builds again on every change and restarts the server.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { context, build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const options = {
  entryPoints: [`${root}src/main.ts`],
  outfile: `${root}dist/server.mjs`,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  // Some packages still call require(); in an ES module it has to be made.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  logLevel: 'info',
};

if (process.argv.includes('--watch')) {
  let child = null;
  const restart = {
    name: 'restart',
    setup(build) {
      build.onEnd((result) => {
        if (result.errors.length) return;
        child?.kill();
        child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', '--enable-source-maps', options.outfile], { stdio: 'inherit' });
      });
    },
  };
  const ctx = await context({ ...options, plugins: [restart] });
  await ctx.watch();
} else {
  await build(options);
}
