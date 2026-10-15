import type { Db } from './db';

// The live channel (design/server.md, section 5.3): a device keeps a WebSocket open and hears,
// for every space it is in, that the space changed and its number; its sync turn starts at once.
// A ping goes every 30 seconds, so that a connection gone quiet is told from one at rest.

/** One device's open connection, once its key was taken. */
export interface LiveSocket {
  account: string;
  device: string;
  send(text: string): void;
}

const PING_MS = 30_000;

export class Live {
  private readonly sockets = new Set<LiveSocket>();
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(private readonly db: Db) {
    this.timer = setInterval(() => this.all(JSON.stringify({ type: 'ping' })), PING_MS);
    // The pings never keep the process alive on their own.
    this.timer.unref?.();
  }

  add(socket: LiveSocket) {
    this.sockets.add(socket);
  }

  remove(socket: LiveSocket) {
    this.sockets.delete(socket);
  }

  /** A space changed: every connected device of someone in it hears it, the one that made the change too. */
  changed(space: string, seq: number) {
    if (this.sockets.size === 0) return;
    const members = new Set((this.db.prepare('SELECT account_id FROM members WHERE space_id = ?').all(space) as { account_id: string }[]).map((row) => row.account_id));
    const text = JSON.stringify({ type: 'changed', space, seq });
    for (const socket of this.sockets) if (members.has(socket.account)) socket.send(text);
  }

  stop() {
    clearInterval(this.timer);
  }

  private all(text: string) {
    for (const socket of this.sockets) socket.send(text);
  }
}
