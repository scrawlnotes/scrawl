import { keyOf } from './paths';
import { quickXorHash } from './quickxor';

// Microsoft Graph's OneDrive, in memory, as far as the OneDrive adapter uses it, and with what makes
// Graph hard to follow: its list of changes gives no paths, does not list what is inside a renamed
// folder, comes in pages, and is refused (410) once too old. For tests, and for trying sync in the
// browser without an account.

const GRAPH = 'https://graph.microsoft.com/v1.0';
const DOWNLOAD = 'https://download.fake/';
const UPLOAD = 'https://upload.fake/';

interface Item {
  id: string;
  name: string;
  parent: string | null;
  dir: boolean;
  data?: Blob;
  cTag?: string;
  hash?: string;
  eTag: string;
  /** When it last changed, as the list of changes counts. */
  seq: number;
  deleted?: boolean;
  /** Where it was before its last move: a list of a folder's changes tells it gone when it left. */
  left?: string;
}

interface Session {
  parent: string;
  names: string[];
  size: number;
  parts: Blob[];
  offset: number;
  fail: boolean;
  ifMatch: string | null;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const error = (status: number, code: string, message = code) => json({ error: { code, message } }, status);
const empty = (status: number) => new Response(null, { status });

export class FakeGraph {
  /** The access token Graph takes; another is refused with 401. */
  token = 'token-1';
  driveType: 'personal' | 'business' = 'personal';
  /** How many items a page of the list of changes holds. */
  pageSize = 50;
  account = { displayName: 'Kaan Arslan', mail: null as string | null, userPrincipalName: 'kaan@outlook.com' };
  /** How many requests were made, by what they did. */
  readonly calls: Record<string, number> = {};
  /** The next this many requests are answered 429. */
  busy = 0;
  /** The next this many requests fail as without a network. */
  offline = 0;
  /** The next part of an upload is taken, and its answer lost on the way. */
  loseNextPartAnswer = false;
  /** How long each answer takes, in milliseconds: a network's pace, for watching a turn go. */
  latency = 0;
  /** Whether the token reaches files shared with the user (`Files.ReadWrite.All`): another drive is refused without it. */
  wide = true;

  private readonly items = new Map<string, Item>();
  /** The root of each drive by the drive's id: the user's own, and those of people who shared a folder with them. */
  private readonly roots = new Map<string, string>([['drive-1', 'root']]);
  /** Who owns the folders shared with the user, by the folder's id. */
  private readonly owners = new Map<string, string>();
  private readonly sessions = new Map<string, Session>();
  private seq = 0;
  /**
   * Begins every id this one gives, as Graph's ids are never given twice: an id kept from a stand-in
   * the page forgot when it reloaded names nothing here.
   */
  private readonly run = Math.random().toString(36).slice(2, 8);
  private ids = 0;
  private tags = 0;
  /** Lists of changes from before this are too old. */
  private oldest = 0;

  constructor() {
    this.items.set('root', { id: 'root', name: 'root', parent: null, dir: true, eTag: 'e0', seq: 0 });
  }

  /** `fetch`, answered as Graph would. */
  readonly fetch: typeof fetch = async (input, init = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    if (this.latency > 0) await new Promise((resolve) => setTimeout(resolve, this.latency));
    if (this.offline > 0) {
      this.offline--;
      throw new TypeError('Failed to fetch');
    }
    if (url.startsWith(DOWNLOAD)) return this.download(url);
    if (url.startsWith(UPLOAD)) return this.part(url, init);
    if (new Headers(init.headers).get('Authorization') !== `Bearer ${this.token}`) return error(401, 'InvalidAuthenticationToken');
    if (this.busy > 0) {
      this.busy--;
      return json({ error: { code: 'activityLimitReached', message: 'Too many requests' } }, 429, { 'Retry-After': '1' });
    }
    return this.graph(url, init);
  };

  // ---------- what other programs do: paths are from the drive's root ----------

  /** A folder, made with those it is in; its id. */
  folder(path: string): string {
    let parent = 'root';
    for (const name of path.split('/')) {
      const there = this.child(parent, name);
      parent = there ? there.id : this.create(parent, name, true).id;
    }
    return parent;
  }

  async put(path: string, content: string | Blob): Promise<void> {
    const names = path.split('/');
    const parent = names.length > 1 ? this.folder(names.slice(0, -1).join('/')) : 'root';
    await this.store(parent, names.at(-1)!, typeof content === 'string' ? new Blob([content]) : content);
  }

  rename(path: string, name: string): void {
    const item = this.at('root', path.split('/'))!;
    item.name = name;
    this.touch(item);
  }

  moveTo(path: string, folder: string): void {
    const item = this.at('root', path.split('/'))!;
    item.left = item.parent!;
    item.parent = folder ? this.folder(folder) : 'root';
    this.touch(item);
  }

  remove(path: string): void {
    this.drop(this.at('root', path.split('/'))!);
  }

  async text(path: string): Promise<string | null> {
    const item = this.at('root', path.split('/'));
    return item?.data ? item.data.text() : null;
  }

  /** Every file's path under a folder, from that folder, sorted. */
  paths(folder: string): string[] {
    const top = this.at('root', folder.split('/'))!;
    const out: string[] = [];
    const walk = (id: string, prefix: string) => {
      for (const item of this.children(id)) {
        const path = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.dir) walk(item.id, path);
        else out.push(path);
      }
    };
    walk(top.id, '');
    return out.sort();
  }

  /**
   * A folder in someone else's drive, shared with the user: made at the top of their drive, with
   * the link they would send. Its id and the link.
   */
  shareFolder(name: string, owner: string, drive = 'drive-2'): { id: string; link: string } {
    let root = this.roots.get(drive);
    if (!root) {
      root = `root-${drive}`;
      this.items.set(root, { id: root, name: 'root', parent: null, dir: true, eTag: 'e0', seq: 0 });
      this.roots.set(drive, root);
    }
    const folder = this.child(root, name) ?? this.create(root, name, true);
    this.owners.set(folder.id, owner);
    return { id: folder.id, link: `https://1drv.ms/f/fake/${folder.id}` };
  }

  /** A file in a folder by the folder's id, as its owner writes it. */
  async putIn(folder: string, path: string, content: string): Promise<void> {
    const names = path.split('/');
    let parent = folder;
    for (const name of names.slice(0, -1)) parent = (this.child(parent, name) ?? this.create(parent, name, true)).id;
    await this.store(parent, names.at(-1)!, new Blob([content]));
  }

  /** Every list of changes begun so far is too old from now on. */
  expireListings(): void {
    this.oldest = this.seq + 1;
  }

  // ---------- inside ----------

  private count(kind: string) {
    this.calls[kind] = (this.calls[kind] ?? 0) + 1;
  }

  private children(id: string): Item[] {
    return [...this.items.values()].filter((item) => item.parent === id && !item.deleted);
  }

  private child(parent: string, name: string): Item | undefined {
    return this.children(parent).find((item) => keyOf(item.name) === keyOf(name));
  }

  private at(from: string, names: string[]): Item | null {
    let item = this.items.get(from);
    if (!item || item.deleted) return null;
    for (const name of names) {
      const next = this.child(item.id, name);
      if (!next) return null;
      item = next;
    }
    return item;
  }

  private touch(item: Item) {
    item.seq = ++this.seq;
    item.eTag = `e${++this.tags}`;
  }

  private create(parent: string, name: string, dir: boolean): Item {
    const item: Item = { id: `i${this.run}-${++this.ids}`, name, parent, dir, eTag: '', seq: 0 };
    this.touch(item);
    this.items.set(item.id, item);
    return item;
  }

  private async store(parent: string, name: string, data: Blob): Promise<Item> {
    const item = this.child(parent, name) ?? this.create(parent, name, false);
    item.data = data;
    item.cTag = `c${++this.tags}`;
    item.hash = await quickXorHash(data);
    this.touch(item);
    return item;
  }

  /** Deleting a folder lists only the folder as deleted; what was in it simply goes. */
  private drop(item: Item) {
    const inside = (id: string) => {
      for (const child of this.children(id)) {
        inside(child.id);
        child.deleted = true;
      }
    };
    inside(item.id);
    item.deleted = true;
    this.touch(item);
  }

  private isUnder(item: Item, top: string): boolean {
    return this.within(item.parent, top);
  }

  private within(id: string | null | undefined, top: string): boolean {
    for (; id; id = this.items.get(id)?.parent ?? null) if (id === top) return true;
    return false;
  }

  /** The drive an item is in, by the root it hangs from. */
  private driveOf(item: Item): string {
    let top = item;
    while (top.parent) top = this.items.get(top.parent) ?? top;
    for (const [drive, root] of this.roots) if (root === top.id) return drive;
    return 'drive-1';
  }

  private shape(item: Item): Record<string, unknown> {
    const parentReference = item.parent ? { parentReference: { id: item.parent, driveId: this.driveOf(item) } } : {};
    if (item.deleted) return { id: item.id, ...parentReference, deleted: { state: 'deleted' } };
    const common = { id: item.id, name: item.name, eTag: item.eTag, ...parentReference };
    if (item.id === 'root') return { ...common, root: {}, folder: { childCount: this.children(item.id).length } };
    if (item.dir) return { ...common, folder: { childCount: this.children(item.id).length } };
    return { ...common, cTag: item.cTag, size: item.data!.size, file: { mimeType: 'application/octet-stream', hashes: { quickXorHash: item.hash } } };
  }

  private download(url: string): Response {
    this.count('download');
    const item = this.items.get(url.slice(DOWNLOAD.length).split('?')[0]!);
    if (!item?.data || item.deleted) return error(404, 'itemNotFound');
    return new Response(item.data, { status: 200 });
  }

  private async graph(url: string, init: RequestInit): Promise<Response> {
    const address = new URL(url);
    const method = (init.method ?? 'GET').toUpperCase();
    let rest = address.pathname.replace(/^\/v1\.0/, '');
    if (rest === '/me') return json({ ...this.account, id: 'me' });
    if (rest === '/me/drive') return json({ id: 'drive-1', driveType: this.driveType });
    const share = /^\/shares\/u!([^/]+)\/driveItem$/.exec(rest);
    if (share) return this.shared(share[1]!);
    // Another drive by its id, as a folder shared with the user is reached; the user's own the same.
    const other = /^\/drives\/([^/]+)(.*)$/.exec(rest);
    // An item is reached in its own drive only: ids are a drive's own.
    let drive = 'drive-1';
    if (other) {
      drive = decodeURIComponent(other[1]!);
      if (!this.roots.has(drive)) return error(404, 'itemNotFound');
      if (drive !== 'drive-1' && !this.wide) return error(403, 'accessDenied', 'Access denied');
      if (!other[2]) return json({ id: drive, driveType: 'personal' });
      rest = other[2].startsWith('/root') ? `/me/drive/root${other[2].slice('/root'.length)}` : `/me/drive${other[2]}`;
    }
    let base: string;
    if (rest.startsWith('/me/drive/root')) {
      base = this.roots.get(drive) ?? 'root';
      rest = rest.slice('/me/drive/root'.length);
    } else {
      const match = /^\/me\/drive\/items\/([^/:]+)(.*)$/.exec(rest);
      if (!match) return error(400, 'invalidRequest');
      base = match[1]!;
      rest = match[2]!;
      const item = this.items.get(base);
      if (item && this.driveOf(item) !== drive) return error(404, 'itemNotFound');
    }
    let path = '';
    let action = '';
    if (rest.startsWith(':/')) {
      const inner = rest.slice(2);
      const cut = inner.lastIndexOf(':/');
      if (cut >= 0) [path, action] = [inner.slice(0, cut), inner.slice(cut + 2)];
      else path = inner.replace(/:$/, '');
    } else if (rest.startsWith('/')) action = rest.slice(1);
    const names = path ? path.split('/').map(decodeURIComponent) : [];
    const headers = new Headers(init.headers);
    const ifMatch = headers.get('If-Match');
    const fail = address.searchParams.get('@microsoft.graph.conflictBehavior') === 'fail';

    if (method === 'GET' && action === 'delta') return this.delta(base, address);
    if (method === 'GET' && action === 'children') {
      this.count('children');
      const item = this.at(base, names);
      if (!item) return error(404, 'itemNotFound');
      return json({ value: this.children(item.id).map((child) => this.shape(child)) });
    }
    if (method === 'GET' && action === '') {
      this.count('item');
      const item = this.at(base, names);
      if (!item) return error(404, 'itemNotFound');
      return json({ ...this.shape(item), ...(item.data && { '@microsoft.graph.downloadUrl': `${DOWNLOAD}${item.id}?v=${item.cTag}` }) });
    }
    if (method === 'PUT' && action === 'content') {
      this.count('upload');
      return this.commit(base, names, init.body as Blob, fail, ifMatch, 200);
    }
    if (method === 'POST' && action === 'createUploadSession') {
      this.count('session');
      const parent = this.parentOf(base, names);
      if (!parent) return error(404, 'itemNotFound');
      const body = JSON.parse(String(init.body)) as { item?: Record<string, string> };
      const checked = this.check(parent, names.at(-1)!, body.item?.['@microsoft.graph.conflictBehavior'] === 'fail', ifMatch);
      if (checked) return checked;
      const id = `s${this.run}-${++this.ids}`;
      this.sessions.set(id, { parent: parent.id, names, size: -1, parts: [], offset: 0, fail: body.item?.['@microsoft.graph.conflictBehavior'] === 'fail', ifMatch });
      return json({ uploadUrl: `${UPLOAD}${id}`, expirationDateTime: '2026-10-08T00:00:00Z' });
    }
    if (method === 'POST' && action === 'children') {
      this.count('mkdir');
      const parent = this.at(base, names);
      if (!parent) return error(404, 'itemNotFound');
      const body = JSON.parse(String(init.body)) as { name: string };
      if (this.child(parent.id, body.name)) return error(409, 'nameAlreadyExists');
      return json(this.shape(this.create(parent.id, body.name, true)), 201);
    }
    if (method === 'PATCH' && action === '') {
      this.count('move');
      const item = this.at(base, names);
      if (!item) return error(404, 'itemNotFound');
      if (ifMatch !== null && ifMatch !== item.cTag && ifMatch !== item.eTag) return error(412, 'preconditionFailed');
      const body = JSON.parse(String(init.body)) as { name?: string; parentReference?: { id: string } };
      const parent = body.parentReference?.id ?? item.parent!;
      const name = body.name ?? item.name;
      const there = this.child(parent, name);
      if (there && there !== item) return error(409, 'nameAlreadyExists');
      if (!this.items.get(parent)?.dir) return error(400, 'invalidRequest');
      if (parent !== item.parent) item.left = item.parent!;
      Object.assign(item, { parent, name });
      this.touch(item);
      return json(this.shape(item));
    }
    if (method === 'DELETE' && action === '') {
      this.count('delete');
      const item = this.at(base, names);
      if (!item) return error(404, 'itemNotFound');
      if (ifMatch !== null && ifMatch !== item.cTag && ifMatch !== item.eTag) return error(412, 'preconditionFailed');
      this.drop(item);
      return empty(204);
    }
    return error(400, 'invalidRequest', `${method} ${url}`);
  }

  /** The item a sharing link leads to, with its owner, as `/shares/{token}/driveItem` answers. */
  private shared(token: string): Response {
    this.count('share');
    let link = '';
    try {
      link = atob(token.replace(/-/g, '+').replace(/_/g, '/'));
    } catch {
      return error(400, 'invalidRequest');
    }
    const id = /\/f\/fake\/([^/?#]+)/.exec(link)?.[1];
    const item = id ? this.items.get(id) : undefined;
    if (!item || item.deleted) return error(404, 'itemNotFound');
    const owner = this.owners.get(item.id);
    return json({ ...this.shape(item), ...(owner && { shared: { owner: { user: { displayName: owner } } } }) });
  }

  /** The folder a path's last name goes in, made as needed, as Graph does when writing to a path. */
  private parentOf(base: string, names: string[]): Item | null {
    let item = this.at(base, []);
    if (!item) return null;
    for (const name of names.slice(0, -1)) item = this.child(item.id, name) ?? this.create(item.id, name, true);
    return item;
  }

  /** Refuses a write to an existing file without leave, or to a file whose tag is not the one given. */
  private check(parent: Item, name: string, fail: boolean, ifMatch: string | null): Response | null {
    const there = this.child(parent.id, name);
    if (there && fail) return error(409, 'nameAlreadyExists');
    if (ifMatch !== null && (!there || (ifMatch !== there.cTag && ifMatch !== there.eTag))) return error(412, 'preconditionFailed');
    return null;
  }

  private async commit(base: string, names: string[], data: Blob, fail: boolean, ifMatch: string | null, status: number): Promise<Response> {
    const parent = this.parentOf(base, names);
    if (!parent) return error(404, 'itemNotFound');
    const checked = this.check(parent, names.at(-1)!, fail, ifMatch);
    if (checked) return checked;
    return json(this.shape(await this.store(parent.id, names.at(-1)!, data)), status);
  }

  private async part(url: string, init: RequestInit): Promise<Response> {
    const id = url.slice(UPLOAD.length);
    const session = this.sessions.get(id);
    if (!session) return error(404, 'itemNotFound');
    const method = (init.method ?? 'GET').toUpperCase();
    if (method === 'GET') return json({ nextExpectedRanges: [`${session.offset}-`] });
    if (method === 'DELETE') {
      this.sessions.delete(id);
      return empty(204);
    }
    this.count('part');
    if (new Headers(init.headers).has('Authorization')) return error(401, 'unauthenticated');
    const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(new Headers(init.headers).get('Content-Range') ?? '');
    if (!range || Number(range[1]) !== session.offset) return error(416, 'invalidRange');
    session.size = Number(range[3]);
    session.parts.push(init.body as Blob);
    session.offset = Number(range[2]) + 1;
    let answer: Response;
    if (session.offset < session.size) answer = json({ nextExpectedRanges: [`${session.offset}-`] }, 202);
    else {
      this.sessions.delete(id);
      answer = await this.commit(session.parent, session.names.slice(-1), new Blob(session.parts), session.fail, session.ifMatch, 201);
    }
    if (this.loseNextPartAnswer) {
      this.loseNextPartAnswer = false;
      throw new TypeError('Failed to fetch');
    }
    return answer;
  }

  private delta(base: string, address: URL): Response {
    this.count('delta');
    const top = this.items.get(base);
    if (!top || top.deleted) return error(404, 'itemNotFound');
    if (base !== 'root' && this.driveType !== 'personal') return error(400, 'invalidRequest', 'Delta is only supported on the root of a drive');
    const token = address.searchParams.get('token') || null;
    if (token !== null && Number(token) < this.oldest) return error(410, 'resyncRequired');
    const since = token === null ? -1 : Number(token);
    const end = Number(address.searchParams.get('end') ?? this.seq);
    const page = Number(address.searchParams.get('page') ?? 0);
    // An item that left the folder is told as deleted there, as one gone from what is followed.
    const inside = (item: Item) => item.id === base || this.isUnder(item, base);
    const left = (item: Item) => token !== null && !inside(item) && (item.left === base || this.within(item.left, base));
    const listed = [...this.items.values()]
      .filter((item) => item.seq > since && item.seq <= end && (inside(item) || left(item)) && (token !== null || !item.deleted))
      .sort((a, b) => a.seq - b.seq);
    const value = listed
      .slice(page * this.pageSize, (page + 1) * this.pageSize)
      .map((item) => (inside(item) ? this.shape(item) : { id: item.id, parentReference: { id: item.left }, deleted: { state: 'deleted' } }));
    const at = `${GRAPH}${address.pathname.replace(/^\/v1\.0/, '')}`;
    const more = (page + 1) * this.pageSize < listed.length;
    return json({
      value,
      ...(more ? { '@odata.nextLink': `${at}?token=${token ?? ''}&end=${end}&page=${page + 1}` } : { '@odata.deltaLink': `${at}?token=${end}` }),
    });
  }
}
