// The newest version of the server that is out, for the app to tell its owner and admins: the
// versions of the image in GitHub's registry, read as the server starts and once a day after.
// Only a whole version, `0.2.50`, counts: a tag is pushed before its image is built, and the
// image's own `latest`, `edge` and `0.2` say no version. Not reached, it says nothing new.

const IMAGE = 'scrawlnotes/server';
const EVERY_MS = 24 * 3_600_000;
const WAIT_MS = 10_000;

const parts = (version: string) => version.split('.').map(Number);

/** Whether version `a` comes after `b`: `0.2.10` after `0.2.9`. */
export function isAfter(a: string, b: string): boolean {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

/** The newest whole version among the image's tags; null when there is none. */
export function newestOf(tags: unknown[]): string | null {
  let newest: string | null = null;
  for (const tag of tags) if (typeof tag === 'string' && /^\d+\.\d+\.\d+$/.test(tag) && (newest === null || isAfter(tag, newest))) newest = tag;
  return newest;
}

export class Updates {
  /** The newest version out, as last read; null before it is read, or when it could not be. */
  latest: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly fetchDoc: typeof fetch = fetch) {}

  start() {
    void this.look();
    this.timer = setInterval(() => void this.look(), EVERY_MS);
    // It never keeps the process alive on its own.
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Reads the image's versions: a key anyone gets for a public image, then its tags. */
  async look(): Promise<void> {
    try {
      const signal = AbortSignal.timeout(WAIT_MS);
      const key = (await (await this.fetchDoc(`https://ghcr.io/token?scope=repository:${IMAGE}:pull`, { signal })).json()) as { token?: unknown };
      if (typeof key.token !== 'string') return;
      const answer = await this.fetchDoc(`https://ghcr.io/v2/${IMAGE}/tags/list?n=1000`, { headers: { Authorization: `Bearer ${key.token}` }, signal });
      if (!answer.ok) return;
      const { tags } = (await answer.json()) as { tags?: unknown };
      const newest = newestOf(Array.isArray(tags) ? tags : []);
      if (newest) this.latest = newest;
    } catch {
      // Offline, or GitHub away: what was read before stays.
    }
  }
}
