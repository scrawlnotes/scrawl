import { serve } from '@hono/node-server';
import { WebSocketServer } from 'ws';
import { backup } from './backup';
import { addressProblem, configFromEnv, VERSION } from './config';
import { makeServer } from './server';

// `scrawl-server` runs the server; `scrawl-server backup` makes a backup of a running one.

const config = configFromEnv();
const [command = 'serve'] = process.argv.slice(2);

if (command === 'backup') {
  const at = await backup(config);
  console.log(`Backup made: ${at}`);
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
  console.error(`Unknown command: ${command}. Use "serve" or "backup".`);
  process.exit(1);
}
