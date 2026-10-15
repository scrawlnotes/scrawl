import { accessSync, constants, mkdirSync } from 'node:fs';
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
  /** The web app a link opened in a browser goes on to. */
  appUrl: string;
}

export const VERSION = '0.2.3';

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
    appUrl: (env.SCRAWL_APP_URL?.trim() || 'https://app.scrawlnotes.com').replace(/\/+$/, ''),
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

/**
 * Why the server cannot keep its data in this folder, or null. The image runs as its own user;
 * a folder of the machine mounted into the container belongs to someone else until it is given
 * to that user, where a named volume needs nothing.
 */
export function dataProblem(data: string): string | null {
  try {
    mkdirSync(data, { recursive: true });
    accessSync(data, constants.W_OK);
    return null;
  } catch {
    const uid = process.getuid?.() ?? 1000;
    return `Cannot write to ${data}. If it is a folder of this machine mounted into the container, give it to the user the server runs as: chown -R ${uid}:${uid} <that folder>. A named Docker volume needs nothing.`;
  }
}
