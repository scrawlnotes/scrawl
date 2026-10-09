import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** Every file under `dir`, as a path from it. */
function filesIn(dir: string, root = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesIn(path, root) : [relative(root, path).split('\\').join('/')];
  });
}

/**
 * The web app's service worker (`sw/sw.js`), written into the build with its version and the list
 * of the app's files, so that it keeps them all on the device. The version changes whenever a file
 * does, which is what makes a new build wait for the user to reload into it.
 */
function serviceWorker(): Plugin {
  return {
    name: 'scrawl-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const publicDir = here('./public');
      const names = [...Object.keys(bundle).filter((name) => !name.endsWith('.map')), ...filesIn(publicDir)].sort();
      const hash = createHash('sha256');
      for (const name of names) {
        hash.update(name);
        const item = bundle[name];
        if (!item) hash.update(readFileSync(join(publicDir, name)));
        else hash.update(item.type === 'chunk' ? item.code : item.source);
      }
      const files = ['/', ...names.filter((name) => name !== 'index.html').map((name) => `/${name}`)];
      const source = readFileSync(here('./sw/sw.js'), 'utf8')
        .replace('__VERSION__', hash.digest('hex').slice(0, 12))
        .replace('__FILES__', JSON.stringify(files));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  // The desktop shell expects 5173; a preview that cannot have it passes another port in PORT.
  server: { port: Number(process.env.PORT) || 5173, strictPort: true },
});
