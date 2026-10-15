import { serve } from '@hono/node-server';
import { WebSocketServer } from 'ws';
import { backup, backups, NoSuchBackup, restore } from './backup';
import { addressProblem, configFromEnv, VERSION } from './config';
import { exportSpace, NoSuchSpace } from './export';
import { makeServer } from './server';

// `scrawl-server` runs the server; `scrawl-server backup` makes a backup of a running one;
// `scrawl-server restore <backup>` puts one back, with the server stopped; `scrawl-server export
// <space> [file]` zips a space as it is now.

const config = configFromEnv();
const [command = 'serve', ...rest] = process.argv.slice(2);

if (command === 'backup') {
  const at = await backup(config);
  console.log(`Backup made: ${at}`);
} else if (command === 'restore') {
  const [which] = rest;
  if (!which) {
    const all = backups(config);
    console.log(all.length ? ['Which backup? scrawl-server restore <backup>', ...all.map((each) => `  ${each}`)].join('\n') : 'There are no backups yet.');
    process.exit(all.length ? 1 : 0);
  }
  try {
    console.log(`Restored: ${restore(config, which)}. Start the server again.`);
  } catch (error) {
    if (!(error instanceof NoSuchBackup)) throw error;
    console.error(error.message);
    process.exit(1);
  }
} else if (command === 'export') {
  const [which, out] = rest;
  if (!which) {
    console.error('Which space? scrawl-server export <space name or id> [file.zip]');
    process.exit(1);
  }
  try {
    console.log(`Exported: ${await exportSpace(config, which, out)}`);
  } catch (error) {
    if (!(error instanceof NoSuchSpace)) throw error;
    console.error(error.message);
    process.exit(1);
  }
} else if (command === 'serve') {
  const problem = addressProblem(config.url);
  if (problem) {
    console.error(problem);
    process.exit(1);
  }
  const server = makeServer(config);
  const sockets = new WebSocketServer({ noServer: true });
  const http = serve({ fetch: server.app.fetch, port: config.port, websocket: { server: sockets } }, () => {
    console.log(`Scrawl server ${VERSION} at ${config.url} (port ${config.port}, data in ${config.data})`);
    if (server.accounts.isNew()) console.log(`New server: connect to ${config.url} from Scrawl within an hour to set it up. The first to connect becomes its owner.`);
  });
  const stop = () => {
    server.live.stop();
    // Open live connections would keep the server from closing; their devices connect again.
    for (const socket of sockets.clients) socket.terminate();
    sockets.close();
    http.close(() => {
      server.db.close();
      process.exit(0);
    });
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
} else {
  console.error(`Unknown command: ${command}. Use "serve", "backup", "restore <backup>" or "export <space>".`);
  process.exit(1);
}
