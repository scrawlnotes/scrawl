import { basename, dirname, type VaultFs } from '../fs';
import { keyOf } from './paths';
import { quickXorHash } from './quickxor';
import {
  RemoteConflict,
  type RemoteChanges,
  type RemoteEntry,
  type RemoteFile,
  RemoteFolderGone,
  RemoteOffline,
  RemoteSignedOut,
  type RemoteStore,
} from './remote';

// A space's folder in OneDrive, through Microsoft Graph: the engine's remote. Items are followed
// by their ids, since Graph's list of changes gives no paths and does not list what is inside a
// renamed folder. See design/cloud.md, section 5.

export const GRAPH = 'https://graph.microsoft.com/v1.0';

/** Files up to this size go up in one request; larger ones part by part. */
const SIMPLE_LIMIT = 10 * 1024 * 1024;
/** One part of a large upload: a multiple of 320 KiB, as OneDrive asks. */
export const UPLOAD_PART = 16 * 320 * 1024;
/** What the adapter knows of the folder's items; kept on the device only (see `isSynced`). */
const MAP = '.scrawl/onedrive.json';
/** What a listing asks of each item. */
const SELECT = 'id,name,parentReference,file,folder,deleted,root,cTag,size';
/** Answers worth waiting out and asking again. */
const BUSY = new Set([429, 500, 502, 503, 504]);
const TRIES = 5;

export interface GraphOptions {
  /** An access token; with `fresh`, a new one, because the last one was refused. */
  token: (fresh: boolean) => Promise<string>;
  /** `fetch` itself, unless a test gives another. */
  fetch?: typeof fetch;
  /** Waits; tests make it instant. */
  sleep?: (ms: number) => Promise<void>;
}

/** An answer of Graph that is not what was asked for, and not one the engine knows what to do with. */
export class GraphError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GraphError';
  }
}

async function failure(response: Response): Promise<GraphError> {
  let code = '';
  let message = response.statusText;
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    code = body.error?.code ?? '';
    message = body.error?.message ?? message;
  } catch {
    // An answer without a body says no more than its status.
  }
  return new GraphError(response.status, code, `OneDrive: ${response.status} ${code} ${message}`.replace(/\s+/g, ' ').trim());
}

/** Requests to Graph: the token, one more try with a new token, and waiting out a busy server. */
export class Graph {
  private readonly fetch: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: GraphOptions) {
    this.fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /** The answer as it comes, but for a refused token and a busy server, which are dealt with here. `signed` is false for the addresses that carry their own permission. */
  async request(url: string, init: RequestInit = {}, signed = true): Promise<Response> {
    let fresh = false;
    for (let attempt = 1; ; attempt++) {
      const headers = new Headers(init.headers);
      if (signed) headers.set('Authorization', `Bearer ${await this.options.token(fresh)}`);
      let response: Response;
      try {
        response = await this.fetch(url, { ...init, headers });
      } catch {
        throw new RemoteOffline();
      }
      if (response.status === 401 && signed) {
        if (fresh) throw new RemoteSignedOut();
        fresh = true;
        continue;
      }
      if (BUSY.has(response.status)) {
        if (attempt >= TRIES) {
          if (response.status >= 500) throw new RemoteOffline();
          return response;
        }
        const after = Number(response.headers.get('Retry-After'));
        await this.sleep((after > 0 ? after : 2 ** attempt) * 1000);
        continue;
      }
      return response;
    }
  }

  /** The answer's body, for an answer that must succeed. */
  async json<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await this.request(url, init);
    if (!response.ok) throw await failure(response);
    return (await response.json()) as T;
  }
}

/** An item as Graph gives it, with what this adapter asks for. */
interface DriveItem {
  id: string;
  name?: string;
  size?: number;
  cTag?: string;
  parentReference?: { id?: string; driveId?: string };
  file?: { hashes?: { quickXorHash?: string } };
  folder?: object;
  deleted?: object;
  root?: object;
  shared?: { owner?: { user?: { displayName?: string } } };
  createdBy?: { user?: { displayName?: string } };
  '@microsoft.graph.downloadUrl'?: string;
}

/** Where a drive's items are reached: the user's own drive, or another one by its id, as a folder shared with them is. */
const driveAt = (drive?: string) => (drive ? `${GRAPH}/drives/${encodeURIComponent(drive)}` : `${GRAPH}/me/drive`);

/** What is known of one item: enough to tell its path and whether it changed. */
interface Known {
  name: string;
  parent: string;
  dir?: true;
  /** The drive's own root, which a listing of the whole drive has. */
  root?: true;
  tag?: string;
  size?: number;
  hash?: string;
}

type Items = Record<string, Known>;

interface MapFile {
  version: 1;
  folder: string;
  /** Whether the folder's own changes are listed (personal accounts), or the whole drive's (work accounts, where Graph lists only the root's). */
  mode: 'folder' | 'drive';
  /** The listing the items are as of. */
  cursor: string;
  items: Items;
  /** The listing before, as what to undo to get back to it: the engine asks for it again when it left something for the next turn. */
  previous?: { cursor: string; undo: Record<string, Known | null> };
}

const sameKnown = (a: Known | undefined, b: Known | undefined) =>
  a === b ||
  (a !== undefined &&
    b !== undefined &&
    a.name === b.name &&
    a.parent === b.parent &&
    a.dir === b.dir &&
    a.root === b.root &&
    a.tag === b.tag &&
    a.size === b.size &&
    a.hash === b.hash);

const fileOf = (path: string, item: DriveItem): RemoteFile => ({
  path,
  kind: 'file',
  tag: item.cTag ?? '',
  size: item.size ?? 0,
  ...(item.file?.hashes?.quickXorHash && { hash: item.file.hashes.quickXorHash }),
});

/** Names OneDrive does not take: https://support.microsoft.com/office/64883a5d-228e-48f5-b3d2-eb39e07630fa */
const BAD_CHARACTERS = /["*:<>?\\|]/;
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$|^(\.lock|desktop\.ini)$/i;
const MAX_PATH = 400;

/** Whether OneDrive takes a name as it is. */
export function oneDriveTakes(name: string): boolean {
  return (
    name.length > 0 &&
    !BAD_CHARACTERS.test(name) &&
    !RESERVED.test(name) &&
    name.trim() === name &&
    !name.endsWith('.') &&
    !name.startsWith('~$') &&
    !name.toLowerCase().includes('_vti_')
  );
}

export interface OneDriveOptions extends GraphOptions {
  /** The id of the space's folder in the drive. */
  folder: string;
  /** The drive the folder is in, when it is someone else's, shared with the user; theirs otherwise. */
  drive?: string;
  /** The space, where the adapter keeps what it knows of the folder. */
  fs: VaultFs;
}

export class OneDriveRemote implements RemoteStore {
  private readonly graph: Graph;
  /** Loaded once; undefined until then, null when there is none. */
  private map: MapFile | null | undefined;

  constructor(private readonly options: OneDriveOptions) {
    this.graph = new Graph(options);
  }

  /** Forgets what the adapter knew of a folder: on disconnecting. */
  static async forget(fs: VaultFs): Promise<void> {
    await fs.remove(MAP).catch(() => undefined);
  }

  // ---------- what changed ----------

  async changes(cursor: string | null, onListed?: (count: number) => void): Promise<RemoteChanges> {
    const map = await this.loadMap();
    let base: Items | null = null;
    if (cursor !== null && map) {
      if (map.cursor === cursor) base = map.items;
      else if (map.previous?.cursor === cursor) base = undo(map.items, map.previous.undo);
    }
    const mode = map?.mode ?? (await this.modeOfDrive());
    const listing = await this.list(base ? cursor : null, base ?? {}, mode, onListed);
    const folder = this.options.folder;

    if (listing.full) {
      await this.saveMap({ version: 1, folder, mode, cursor: listing.cursor, items: listing.items });
      const changed = [...pathsIn(listing.items, folder)].map(([id, path]) => entryOf(path, listing.items[id]!));
      return { changed, removed: [], cursor: listing.cursor, full: true };
    }
    const undoing: Record<string, Known | null> = {};
    for (const id of new Set([...Object.keys(base!), ...Object.keys(listing.items)])) {
      if (!sameKnown(base![id], listing.items[id])) undoing[id] = base![id] ?? null;
    }
    // Nothing new: the same cursor again, and nothing written.
    if (Object.keys(undoing).length === 0) return { changed: [], removed: [], cursor: cursor! };
    await this.saveMap({ version: 1, folder, mode, cursor: listing.cursor, items: listing.items, previous: { cursor: cursor!, undo: undoing } });
    return { ...differences(base!, listing.items, folder), cursor: listing.cursor };
  }

  /**
   * Personal drives list a folder's changes; work drives only the root's. A folder shared from
   * someone else's drive has a list of its own, as Microsoft asks for each shared folder.
   */
  private async modeOfDrive(): Promise<MapFile['mode']> {
    if (this.options.drive) return 'folder';
    const drive = await this.graph.json<{ driveType?: string }>(`${GRAPH}/me/drive?$select=driveType`);
    return drive.driveType === 'personal' ? 'folder' : 'drive';
  }

  private listingStart(mode: MapFile['mode']): string {
    const from = mode === 'folder' ? `items/${this.options.folder}` : 'root';
    return `${driveAt(this.options.drive)}/${from}/delta?$select=${SELECT}`;
  }

  /** Reads Graph's list of changes to its end, from `cursor` onto `start`; from the beginning when the cursor is null or too old. */
  private async list(cursor: string | null, start: Items, mode: MapFile['mode'], onListed?: (count: number) => void): Promise<{ items: Items; cursor: string; full: boolean }> {
    let items: Items = { ...start };
    let full = cursor === null;
    let url = cursor ?? this.listingStart(mode);
    let count = 0;
    for (;;) {
      const response = await this.graph.request(url);
      if (response.status === 410 && !full) {
        // Too old to tell what changed since: everything there is, from the beginning.
        items = {};
        full = true;
        count = 0;
        url = this.listingStart(mode);
        continue;
      }
      if (response.status === 404) throw new RemoteFolderGone();
      if (!response.ok) throw await failure(response);
      const page = (await response.json()) as { value: DriveItem[]; '@odata.nextLink'?: string; '@odata.deltaLink'?: string };
      for (const item of page.value) this.learn(items, item);
      count += page.value.length;
      onListed?.(count);
      if (page['@odata.nextLink']) url = page['@odata.nextLink'];
      else if (page['@odata.deltaLink']) return { items: anchored(items, this.options.folder), cursor: page['@odata.deltaLink'], full };
      else throw new GraphError(response.status, '', 'OneDrive: a list of changes without an end');
    }
  }

  private learn(items: Items, item: DriveItem): void {
    if (item.deleted) {
      if (item.id === this.options.folder) throw new RemoteFolderGone();
      delete items[item.id];
      return;
    }
    if (item.root) {
      items[item.id] = { name: '', parent: '', dir: true, root: true };
      return;
    }
    const parent = item.parentReference?.id;
    // What is neither a file nor a folder (a OneNote notebook) is not part of a space.
    if (!parent || item.name === undefined || (!item.folder && !item.file)) {
      delete items[item.id];
      return;
    }
    const hash = item.file?.hashes?.quickXorHash;
    items[item.id] = item.folder
      ? { name: item.name, parent, dir: true }
      : { name: item.name, parent, tag: item.cTag ?? '', size: item.size ?? 0, ...(hash && { hash }) };
  }

  private async loadMap(): Promise<MapFile | null> {
    if (this.map !== undefined) return this.map;
    try {
      const data = JSON.parse(await this.options.fs.readText(MAP)) as MapFile;
      this.map = data.version === 1 && data.folder === this.options.folder && typeof data.cursor === 'string' ? data : null;
    } catch {
      this.map = null;
    }
    return this.map;
  }

  private async saveMap(map: MapFile): Promise<void> {
    this.map = map;
    await this.options.fs.writeText(MAP, JSON.stringify(map));
  }

  // ---------- files ----------

  /** The address of an item of the space by its path, and of one of its actions (`content`, `children`). */
  private at(path: string, action?: string): string {
    const item = `${driveAt(this.options.drive)}/items/${this.options.folder}`;
    if (!path) return action ? `${item}/${action}` : item;
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    return action ? `${item}:/${encoded}:/${action}` : `${item}:/${encoded}`;
  }

  /** The item an answer brings; a refusal because of the file's state is a conflict for the engine. */
  private async answer(response: Response, path: string): Promise<DriveItem> {
    if (response.status === 404 || response.status === 409 || response.status === 412) throw new RemoteConflict(path);
    if (!response.ok) throw await failure(response);
    return (await response.json()) as DriveItem;
  }

  // The content comes from the item's download address, which carries its own permission: the
  // `content` action answers with a redirect that a web view may not follow with the token.
  async read(path: string, onBytes?: (done: number) => void): Promise<Blob> {
    const item = await this.answer(await this.graph.request(this.at(path)), path);
    const url = item['@microsoft.graph.downloadUrl'];
    if (!url || !item.file) throw new RemoteConflict(path);
    const content = await this.graph.request(url, {}, false);
    if (content.status === 404) throw new RemoteConflict(path);
    if (!content.ok) throw await failure(content);
    if (!onBytes || !content.body) return content.blob();
    // Read as it comes, telling how much came.
    const reader = content.body.getReader();
    const parts: Uint8Array<ArrayBuffer>[] = [];
    let done = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        parts.push(chunk.value as Uint8Array<ArrayBuffer>);
        done += chunk.value.length;
        onBytes(done);
      }
    } catch {
      throw new RemoteOffline();
    }
    return new Blob(parts);
  }

  async write(path: string, data: Blob, ifMatch: string | null, onBytes?: (done: number) => void): Promise<RemoteFile> {
    const item = data.size <= SIMPLE_LIMIT ? await this.writeAtOnce(path, data, ifMatch) : await this.writeInParts(path, data, ifMatch, onBytes);
    onBytes?.(data.size);
    return fileOf(path, item);
  }

  private async writeAtOnce(path: string, data: Blob, ifMatch: string | null): Promise<DriveItem> {
    const url = this.at(path, 'content') + (ifMatch === null ? '?@microsoft.graph.conflictBehavior=fail' : '');
    const headers: Record<string, string> = { 'Content-Type': 'application/octet-stream' };
    if (ifMatch !== null) headers['If-Match'] = ifMatch;
    return this.answer(await this.graph.request(url, { method: 'PUT', headers, body: data }), path);
  }

  /** A large file goes up in parts through an upload session; a part cut off goes again from where the session says it stands. */
  private async writeInParts(path: string, data: Blob, ifMatch: string | null, onBytes?: (done: number) => void): Promise<DriveItem> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (ifMatch !== null) headers['If-Match'] = ifMatch;
    const body = JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': ifMatch === null ? 'fail' : 'replace' } });
    const session = await this.graph.request(this.at(path, 'createUploadSession'), { method: 'POST', headers, body });
    const { uploadUrl } = (await this.answer(session, path)) as unknown as { uploadUrl: string };
    let offset = 0;
    let cuts = 0;
    for (;;) {
      const end = Math.min(offset + UPLOAD_PART, data.size);
      let part: Response;
      try {
        part = await this.graph.request(uploadUrl, { method: 'PUT', headers: { 'Content-Range': `bytes ${offset}-${end - 1}/${data.size}` }, body: data.slice(offset, end) }, false);
      } catch (error) {
        if (!(error instanceof RemoteOffline) || ++cuts > 3) throw error;
        const status = await this.graph.request(uploadUrl, {}, false);
        if (!status.ok) throw await failure(status);
        offset = nextOffset(await status.json(), offset);
        continue;
      }
      if (part.status === 202) {
        offset = nextOffset(await part.json(), end);
        onBytes?.(offset);
        continue;
      }
      if (part.status === 409 || part.status === 412) {
        await this.graph.request(uploadUrl, { method: 'DELETE' }, false).catch(() => undefined);
        throw new RemoteConflict(path);
      }
      if (!part.ok) throw await failure(part);
      return (await part.json()) as DriveItem;
    }
  }

  async move(from: string, to: string, ifMatch: string | null): Promise<RemoteFile> {
    const change: Record<string, unknown> = { name: basename(to) };
    if (keyOf(dirname(from)) !== keyOf(dirname(to))) change.parentReference = { id: await this.dirId(dirname(to)) };
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (ifMatch !== null) headers['If-Match'] = ifMatch;
    const response = await this.graph.request(this.at(from), { method: 'PATCH', headers, body: JSON.stringify(change) });
    return fileOf(to, await this.answer(response, from));
  }

  async remove(path: string, ifMatch: string | null): Promise<void> {
    const response = await this.graph.request(this.at(path), { method: 'DELETE', headers: ifMatch === null ? {} : { 'If-Match': ifMatch } });
    if (response.ok || (response.status === 404 && ifMatch === null)) return;
    await this.answer(response, path);
  }

  async mkdir(path: string): Promise<void> {
    await this.makeDir(path);
  }

  /** Makes a folder, and those it is in; its id, or null when it was there already. */
  private async makeDir(path: string): Promise<string | null> {
    const create = () =>
      this.graph.request(this.at(dirname(path), 'children'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: basename(path), folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
      });
    let response = await create();
    if (response.status === 404 && dirname(path)) {
      await this.makeDir(dirname(path));
      response = await create();
    }
    if (response.status === 409) return null;
    if (!response.ok) throw await failure(response);
    return ((await response.json()) as DriveItem).id;
  }

  /** The id of a folder of the space, made if it is not there. */
  private async dirId(path: string): Promise<string> {
    if (!path) return this.options.folder;
    const response = await this.graph.request(`${this.at(path)}?$select=id`);
    if (response.ok) return ((await response.json()) as DriveItem).id;
    if (response.status !== 404) throw await failure(response);
    return (await this.makeDir(path)) ?? this.dirId(path);
  }

  hashOf(data: Blob): Promise<string> {
    return quickXorHash(data);
  }

  accepts(path: string): boolean {
    return path.length <= MAX_PATH && path.split('/').every(oneDriveTakes);
  }
}

/** Where a session asks the next part to start. */
function nextOffset(session: { nextExpectedRanges?: string[] }, otherwise: number): number {
  const next = Number.parseInt(session.nextExpectedRanges?.[0] ?? '', 10);
  return Number.isFinite(next) ? next : otherwise;
}

function undo(items: Items, undoing: Record<string, Known | null>): Items {
  const before = { ...items };
  for (const [id, was] of Object.entries(undoing)) {
    if (was === null) delete before[id];
    else before[id] = was;
  }
  return before;
}

/** The items that hang from the folder, or from the drive's root: what does not is left over from something deleted. */
function anchored(items: Items, folder: string): Items {
  const known = new Map<string, boolean>();
  const holds = (id: string, depth: number): boolean => {
    if (id === folder) return true;
    const seen = known.get(id);
    if (seen !== undefined) return seen;
    const item = items[id];
    const result = item !== undefined && depth < 256 && (item.root === true || holds(item.parent, depth + 1));
    known.set(id, result);
    return result;
  };
  return Object.fromEntries(Object.entries(items).filter(([id]) => holds(id, 0)));
}

/** The path in the space of each item inside the folder, by id. */
function pathsIn(items: Items, folder: string): Map<string, string> {
  const paths = new Map<string, string | null>();
  const pathOf = (id: string, depth: number): string | null => {
    const seen = paths.get(id);
    if (seen !== undefined) return seen;
    const item = items[id];
    let path: string | null = null;
    if (item && !item.root && depth < 256) {
      if (item.parent === folder) path = item.name;
      else {
        const up = pathOf(item.parent, depth + 1);
        path = up === null ? null : `${up}/${item.name}`;
      }
    }
    paths.set(id, path);
    return path;
  };
  const inside = new Map<string, string>();
  for (const id of Object.keys(items)) {
    if (id === folder) continue;
    const path = pathOf(id, 0);
    if (path !== null) inside.set(id, path);
  }
  return inside;
}

const entryOf = (path: string, item: Known): RemoteEntry =>
  item.dir ? { path, kind: 'dir' } : { path, kind: 'file', tag: item.tag ?? '', size: item.size ?? 0, ...(item.hash && { hash: item.hash }) };

/**
 * What changed between two states of the folder, as the engine reads it. An item whose path
 * changed (itself, or a folder above it renamed or moved) is gone from its old path and there at
 * its new one with the same tag: the engine takes that for a move and reads nothing again.
 */
function differences(before: Items, after: Items, folder: string): { changed: RemoteEntry[]; removed: string[] } {
  const was = pathsIn(before, folder);
  const now = pathsIn(after, folder);
  const changed: RemoteEntry[] = [];
  const removed: string[] = [];
  for (const [id, path] of now) {
    const old = was.get(id);
    if (old === path && sameKnown(before[id], after[id])) continue;
    if (old !== undefined && keyOf(old) !== keyOf(path)) removed.push(old);
    changed.push(entryOf(path, after[id]!));
  }
  for (const [id, path] of was) if (!now.has(id)) removed.push(path);
  return { changed, removed };
}

// ---------- the account: what signing in and choosing a folder need ----------

export interface OneDriveFolder {
  id: string;
  name: string;
}

/** A folder someone shared with the user: in their drive, by its id there, and whose it is. */
export interface SharedFolder extends OneDriveFolder {
  drive: string;
  /** The owner's name, as OneDrive gives it. */
  owner?: string;
}

/** A sharing link as Graph takes it in its address: `u!` and the link in unpadded base64url. */
export function shareToken(link: string): string {
  const bytes = new TextEncoder().encode(link.trim());
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return `u!${btoa(text).replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-')}`;
}

/** The account behind a token: who it is, and its folders, to choose the space's from. */
export class OneDriveAccount {
  private readonly graph: Graph;

  constructor(options: GraphOptions) {
    this.graph = new Graph(options);
  }

  async me(): Promise<{ name: string; email: string }> {
    const me = await this.graph.json<{ displayName?: string; mail?: string | null; userPrincipalName?: string }>(`${GRAPH}/me?$select=displayName,mail,userPrincipalName`);
    const email = me.mail || me.userPrincipalName || '';
    return { name: me.displayName || email, email };
  }

  /** The folders in a folder, by name; in the drive's root when `parent` is null. */
  async folders(parent: string | null): Promise<OneDriveFolder[]> {
    const from = parent === null ? 'root' : `items/${parent}`;
    let url: string | undefined = `${GRAPH}/me/drive/${from}/children?$select=id,name,folder&$top=200`;
    const out: OneDriveFolder[] = [];
    while (url) {
      const page: { value: DriveItem[]; '@odata.nextLink'?: string } = await this.graph.json(url);
      for (const item of page.value) if (item.folder && item.name) out.push({ id: item.id, name: item.name });
      url = page['@odata.nextLink'];
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
  }

  /**
   * A text file in a folder, by its path there; null when there is none. What a folder's own
   * settings say before it is added as a space: whether it is one already, and what it is called.
   */
  async readText(folder: string, path: string, drive?: string): Promise<string | null> {
    const response = await this.graph.request(`${driveAt(drive)}/items/${folder}:/${path.split('/').map(encodeURIComponent).join('/')}`);
    if (response.status === 404) return null;
    if (!response.ok) throw await failure(response);
    const item = (await response.json()) as DriveItem;
    // The content comes from the item's download address, as the adapter reads it.
    const url = item['@microsoft.graph.downloadUrl'];
    if (!url || !item.file) return null;
    const content = await this.graph.request(url, {}, false);
    if (content.status === 404) return null;
    if (!content.ok) throw await failure(content);
    return content.text();
  }

  /**
   * The folder a sharing link leads to, which its owner gets in OneDrive with Share › Copy link.
   * The link is taken as following it in a browser would: the user keeps access to the folder.
   * Null when the link is not to a folder.
   */
  async shared(link: string): Promise<SharedFolder | null> {
    const item = await this.graph.json<DriveItem>(`${GRAPH}/shares/${shareToken(link)}/driveItem?$select=id,name,folder,parentReference,shared,createdBy`, {
      headers: { Prefer: 'redeemSharingLink' },
    });
    const drive = item.parentReference?.driveId;
    if (!item.folder || !drive) return null;
    const owner = item.shared?.owner?.user?.displayName ?? item.createdBy?.user?.displayName;
    return { id: item.id, name: item.name ?? '', drive, ...(owner && { owner }) };
  }

  /** Makes a folder; one of that name already there is used as it is. */
  async createFolder(parent: string | null, name: string): Promise<OneDriveFolder> {
    const from = parent === null ? 'root' : `items/${parent}`;
    const response = await this.graph.request(`${GRAPH}/me/drive/${from}/children`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
    });
    if (response.status === 409) {
      const there = await this.graph.json<DriveItem>(`${GRAPH}/me/drive/${from}:/${encodeURIComponent(name)}?$select=id,name,folder`);
      if (!there.folder) throw new GraphError(409, 'nameAlreadyExists', `OneDrive: a file named ${name} is there`);
      return { id: there.id, name: there.name ?? name };
    }
    if (!response.ok) throw await failure(response);
    const item = (await response.json()) as DriveItem;
    return { id: item.id, name: item.name ?? name };
  }
}
