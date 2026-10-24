import type { Db } from './db';

// The live channel (design/server.md, section 5.3): a device keeps a WebSocket open and hears,
// for every space it is in, that the space changed and its number; its sync turn starts at once.
// A ping goes every 30 seconds, so that a connection gone quiet is told from one at rest.
// Messaging (design/chat.md, 11.3) rides on it: a device hears new messages and what changed in
// its conversations, who is writing, and who is using Scrawl now; it says whether it is in use and
// which conversation is on its screen.

/** One device's open connection, once its key was taken. */
export interface LiveSocket {
  account: string;
  device: string;
  send(text: string): void;
  close(): void;
  /** Whether Scrawl is in use on it: its window in front, or touched in the last minutes. */
  active?: boolean;
  /** The conversation on its screen, when one is. */
  viewing?: string | null;
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
    const was = this.isActive(socket.account);
    this.sockets.delete(socket);
    if (was && !this.isActive(socket.account)) this.presence(socket.account, false);
  }

  /** A space changed: every connected device of someone in it hears it, the one that made the change too. */
  changed(space: string, seq: number) {
    if (this.sockets.size === 0) return;
    const members = new Set((this.db.prepare('SELECT account_id FROM members WHERE space_id = ?').all(space) as { account_id: string }[]).map((row) => row.account_id));
    const text = JSON.stringify({ type: 'changed', space, seq });
    for (const socket of this.sockets) if (members.has(socket.account)) socket.send(text);
  }

  /** Someone was taken out of a space: their devices hear it, and their turn finds the space no longer theirs. */
  nudge(account: string, space: string) {
    const { seq } = (this.db.prepare('SELECT seq FROM spaces WHERE id = ?').get(space) as { seq: number } | undefined) ?? { seq: 0 };
    const text = JSON.stringify({ type: 'changed', space, seq });
    for (const socket of this.sockets) if (socket.account === account) socket.send(text);
  }

  /** Tells these people's connected devices something. */
  tell(accounts: Iterable<string>, event: object) {
    if (this.sockets.size === 0) return;
    const to = new Set(accounts);
    const text = JSON.stringify(event);
    for (const socket of this.sockets) if (to.has(socket.account)) socket.send(text);
  }

  /**
   * A device says whether Scrawl is in use on it and what is on its screen. Someone is using
   * Scrawl while one of their devices is; those who share a space with them hear when that changes.
   */
  setActive(socket: LiveSocket, active: boolean, viewing: string | null) {
    const was = this.isActive(socket.account);
    socket.active = active;
    socket.viewing = active ? viewing : null;
    const now = this.isActive(socket.account);
    if (was !== now) this.presence(socket.account, now);
  }

  /** Who of those sharing a space with someone is using Scrawl now: what a device hears as it connects. */
  presenceFor(socket: LiveSocket) {
    const peers = new Set(this.peers(socket.account));
    const active = [...new Set([...this.sockets].filter((each) => each.active && peers.has(each.account)).map((each) => each.account))];
    socket.send(JSON.stringify({ type: 'presence', active }));
  }

  /** Whether someone is using Scrawl on one of their devices now. */
  isActive(account: string): boolean {
    for (const socket of this.sockets) if (socket.account === account && socket.active) return true;
    return false;
  }

  /** Whether a conversation is on the screen of one of someone's devices in use. */
  isViewing(account: string, chat: string): boolean {
    for (const socket of this.sockets) if (socket.account === account && socket.active && socket.viewing === chat) return true;
    return false;
  }

  /** A key ended, or a whole account: the connections it opened are told so, and closed. */
  end(which: { account?: string; device?: string }) {
    for (const socket of [...this.sockets]) {
      if (socket.account !== which.account && socket.device !== which.device) continue;
      socket.send(JSON.stringify({ type: 'signed-out' }));
      socket.close();
      this.remove(socket);
    }
  }

  stop() {
    clearInterval(this.timer);
  }

  private presence(account: string, active: boolean) {
    this.tell(this.peers(account), { type: 'presence', account, active });
  }

  /** Those who share a space with someone, and they themselves, whose other devices hear it too. */
  private peers(account: string): string[] {
    const rows = this.db.prepare('SELECT DISTINCT b.account_id FROM members a JOIN members b ON b.space_id = a.space_id WHERE a.account_id = ?').all(account) as { account_id: string }[];
    return [...new Set([account, ...rows.map((row) => row.account_id)])];
  }

  private all(text: string) {
    for (const socket of this.sockets) socket.send(text);
  }
}
