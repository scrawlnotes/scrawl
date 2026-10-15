import { join } from 'node:path';

/** How the server is run, from its environment. See design/server.md, section 8. */
export interface Config {
  /** The address the server is reached at, as links and its page give it: `https://kaan.scrawlnotes.com`. */
  url: string;
  port: number;
  /** The folder of everything it keeps: the database, the files, the backups. */
  data: string;
  /** The largest file it takes, in bytes. */
  maxFileBytes: number;
  /** When set, only this email can set up the server, as its owner. */
  ownerEmail: string | null;
}

export const VERSION = '0.1.0';

/** How long a new server can be set up after it started, without an account. */
export const SETUP_MS = 60 * 60 * 1000;

const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]']);

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT) || 8080;
  const url = (env.SCRAWL_URL?.trim() || `http://localhost:${port}`).replace(/\/+$/, '');
  return {
    url,
    port,
    data: env.SCRAWL_DATA?.trim() || join(process.cwd(), 'data'),
    maxFileBytes: (Number(env.SCRAWL_MAX_FILE_MB) || 1024) * 1024 * 1024,
    ownerEmail: env.SCRAWL_OWNER_EMAIL?.trim() || null,
  };
}

/**
 * Why the server cannot run at this address, or null. The app on the web and on a phone reaches
 * only an address with HTTPS; plain HTTP is for trying it on this computer.
 */
export function addressProblem(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `SCRAWL_URL is not an address: ${url}`;
  }
  if (parsed.protocol === 'https:') return null;
  if (parsed.protocol === 'http:' && LOCAL.has(parsed.hostname)) return null;
  return `SCRAWL_URL must start with https:// (Scrawl on the web and on a phone cannot reach plain http). For trying it on this computer, use http://localhost.`;
}
