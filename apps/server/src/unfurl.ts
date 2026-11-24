import { randomBytes } from 'node:crypto';
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { createWriteStream, rmSync } from 'node:fs';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { join } from 'node:path';
import type { Blobs } from './blobs';

// A web link in a message shows what the page says it is (design/chat.md 29): its site, title,
// a line of what it is about and its picture, as the page tells them in its Open Graph tags. The
// server reads the page once, when the message is sent, and keeps what it found with the message
// and the picture with the files: a device never reaches out to the site itself. The server
// reads only pages on the internet: never an address of its own network, also not one that a
// name or a redirect leads to.

/** What a page says it is. */
export interface LinkPreview {
  /** The link the message has. */
  url: string;
  site: string;
  title: string;
  description?: string;
  /** Its picture, kept with the files. */
  image?: { hash: string; type: string };
}

/** What the server may read: pages on the internet, and on this computer too where the server itself runs on one, to try it. */
export interface LinkOptions {
  loopback?: boolean;
}

const PAGE_BYTES = 1024 * 1024;
const IMAGE_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 5_000;
const REDIRECTS = 3;
const MAX_TITLE = 200;
const MAX_DESCRIPTION = 300;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const AGENT = 'Mozilla/5.0 (compatible; ScrawlLinkPreview/1.0; +https://scrawlnotes.com)';

/** Addresses that are not on the internet: this machine, its networks, and what is reserved. */
const INSIDE = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
] as const)
  INSIDE.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const)
  INSIDE.addSubnet(address, prefix, 'ipv6');

const LOOPBACK = new BlockList();
LOOPBACK.addSubnet('127.0.0.0', 8, 'ipv4');
LOOPBACK.addAddress('::1', 'ipv6');

/** An IPv6 address that carries an IPv4 one, as that one. */
function plain(address: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  return mapped ? mapped[1]! : address;
}

/** Whether the server may reach an address: one on the internet, or this computer's own where it may. */
export function reachable(address: string, options: LinkOptions = {}): boolean {
  const ip = plain(address);
  const family = isIP(ip) === 6 ? 'ipv6' : 'ipv4';
  if (!isIP(ip)) return false;
  if (options.loopback && LOOPBACK.check(ip, family)) return true;
  return !INSIDE.check(ip, family);
}

class Unreachable extends Error {}

/** The link of a message that gets a card: its first web address, as linksIn finds it. */
export function previewLink(links: { url: string }[]): string | null {
  for (const { url } of links) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
    } catch {
      // Not an address after all.
    }
  }
  return null;
}

interface Got {
  url: URL;
  type: string;
  charset: string | null;
  body: Buffer;
}

/**
 * Reads an address on the internet: at most `max` bytes, in five seconds, following three
 * redirects at most; each address and what its name resolves to is looked at before it is reached.
 */
export async function fetchPublic(address: string, accept: string, max: number, options: LinkOptions = {}): Promise<Got> {
  let url = new URL(address);
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  for (let hops = 0; ; hops++) {
    const answer = await get(url, accept, signal, options);
    const status = answer.statusCode ?? 0;
    if (status >= 300 && status < 400 && answer.headers.location) {
      answer.destroy();
      if (hops === REDIRECTS) throw new Unreachable('Too many redirects');
      url = new URL(answer.headers.location, url);
      continue;
    }
    if (status !== 200) {
      answer.destroy();
      throw new Unreachable(`The site answered ${status}`);
    }
    const contentType = String(answer.headers['content-type'] ?? '');
    const type = contentType.split(';')[0]!.trim().toLowerCase();
    const charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1] ?? null;
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of answer as AsyncIterable<Buffer>) {
      size += chunk.length;
      // A page's head is at its start: what is past the limit is not needed. A picture past it is too large.
      if (size > max) {
        answer.destroy();
        if (!type.startsWith('text/')) throw new Unreachable('Too large');
        chunks.push(chunk.subarray(0, chunk.length - (size - max)));
        break;
      }
      chunks.push(chunk);
    }
    return { url, type, charset, body: Buffer.concat(chunks) };
  }
}

function get(url: URL, accept: string, signal: AbortSignal, options: LinkOptions): Promise<IncomingMessage> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return Promise.reject(new Unreachable('Not a web address'));
  // Only the web's own ports: another port of a machine on the internet is no page.
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  if (!['80', '443'].includes(port) && !options.loopback) return Promise.reject(new Unreachable('Not a web port'));
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) && !reachable(host, options)) return Promise.reject(new Unreachable('Not on the internet'));
  // The address a name resolves to is looked at as it is connected to, so that a name cannot point inside between a look and the connection.
  const lookup = (hostname: string, lookupOptions: { all?: boolean }, done: (error: Error | null, address: string | LookupAddress[], family?: number) => void) => {
    dnsLookup(hostname, { all: true }, (error, addresses) => {
      if (error) return done(error, '');
      if (!addresses.length || addresses.some((each) => !reachable(each.address, options))) return done(new Unreachable('Not on the internet'), '');
      if (lookupOptions.all) return done(null, addresses);
      done(null, addresses[0]!.address, addresses[0]!.family);
    });
  };
  const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const sent = request(url, { method: 'GET', signal, lookup: lookup as never, headers: { 'User-Agent': AGENT, Accept: accept, 'Accept-Encoding': 'identity', 'Accept-Language': 'en, *;q=0.5' } }, resolve);
    sent.on('error', reject);
    sent.end();
  });
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

const clean = (text: string | undefined, max: number) => {
  const words = decodeEntities(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return words.length > max ? `${words.slice(0, max - 1).trimEnd()}…` : words;
};

/** A page's text, in the characters it says it is written in. */
export function pageText(body: Buffer, charset: string | null): string {
  const said = charset ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(body.subarray(0, 2048).toString('latin1'))?.[1] ?? 'utf-8';
  try {
    return new TextDecoder(said).decode(body);
  } catch {
    return new TextDecoder('utf-8').decode(body);
  }
}

/** What a page says it is, from its head: Open Graph first, then Twitter's tags, then its title and description. */
export function readHead(html: string, url: URL): { site: string; title: string; description?: string; image?: string } | null {
  const head = html.slice(0, Math.max(html.search(/<\/head>/i), 0) || html.length);
  const meta = new Map<string, string>();
  for (const [tag] of head.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = new Map<string, string>();
    for (const match of tag.matchAll(/([a-zA-Z_:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) attributes.set(match[1]!.toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '');
    const key = (attributes.get('property') ?? attributes.get('name') ?? '').toLowerCase();
    const content = attributes.get('content');
    if (key && content !== undefined && !meta.has(key)) meta.set(key, content);
  }
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  const title = clean(meta.get('og:title') || meta.get('twitter:title') || titleTag, MAX_TITLE);
  if (!title) return null;
  const description = clean(meta.get('og:description') || meta.get('twitter:description') || meta.get('description'), MAX_DESCRIPTION);
  const site = clean(meta.get('og:site_name'), MAX_TITLE) || url.hostname.replace(/^www\./, '');
  let image: string | undefined;
  const picture = (meta.get('og:image:secure_url') || meta.get('og:image') || meta.get('og:image:url') || meta.get('twitter:image') || meta.get('twitter:image:src'))?.trim();
  if (picture) {
    try {
      const resolved = new URL(decodeEntities(picture), url);
      if (resolved.protocol === 'http:' || resolved.protocol === 'https:') image = resolved.href;
    } catch {
      // A picture whose address is not one is left out.
    }
  }
  return { site, title, ...(description && { description }), ...(image && { image }) };
}

/** Reads what a link's page says it is, its picture kept; null when it says nothing or is not read. */
export async function previewOf(link: string, blobs: Blobs, options: LinkOptions = {}): Promise<LinkPreview | null> {
  let page: Got;
  try {
    page = await fetchPublic(link, 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1', PAGE_BYTES, options);
  } catch {
    return null;
  }
  if (page.type !== 'text/html' && page.type !== 'application/xhtml+xml') return null;
  const head = readHead(pageText(page.body, page.charset), page.url);
  if (!head) return null;
  const preview: LinkPreview = { url: link, site: head.site, title: head.title, ...(head.description && { description: head.description }) };
  if (head.image) {
    // A card without its picture is still a card.
    const image = await fetchPublic(head.image, 'image/webp,image/png,image/jpeg,image/gif', IMAGE_BYTES, options).catch(() => null);
    if (image && IMAGE_TYPES.has(image.type) && image.body.length) {
      const temp = join(blobs.tmp, `link-${randomBytes(12).toString('hex')}`);
      try {
        await new Promise<void>((resolve, reject) => createWriteStream(temp).on('error', reject).end(image.body, resolve));
        preview.image = { hash: await blobs.keepFile(temp), type: image.type };
      } catch (error) {
        console.error(`A link's picture was not kept: ${String(error)}`);
      } finally {
        rmSync(temp, { force: true });
      }
    }
  }
  return preview;
}

/** What reads links' pages, one at a time, as the messages that have them wait. */
export class Unfurls {
  private running = false;
  private again = false;
  private idle: Promise<void> = Promise.resolve();

  constructor(
    private readonly read: (link: string) => Promise<LinkPreview | null>,
    /** The next message waiting, leaving out those already read in this round. */
    private readonly next: (skip: Set<string>) => { id: string; url: string } | undefined,
    private readonly done: (id: string, url: string, preview: LinkPreview | null) => void,
  ) {}

  /** Reads the links waiting until none is left; resolves when it stops. */
  kick(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.idle;
    }
    this.running = true;
    this.idle = this.run()
      .catch((error: unknown) => console.error(`Links stopped being read until the next one comes: ${String(error)}`))
      .finally(() => (this.running = false));
    return this.idle;
  }

  private async run() {
    const tried = new Set<string>();
    for (;;) {
      const waiting = this.next(tried);
      if (!waiting) {
        if (!this.again) return;
        this.again = false;
        tried.clear();
        continue;
      }
      tried.add(waiting.id);
      const preview = await this.read(waiting.url).catch(() => null);
      try {
        this.done(waiting.id, waiting.url, preview);
      } catch (error) {
        console.error(`A link (${waiting.url}) was read, but not written: ${String(error)}`);
      }
    }
  }
}
