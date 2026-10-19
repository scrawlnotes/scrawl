import { join, type VaultFs } from './fs';
import type { SpaceSource } from './spaces';

// What the account has rather than a device, carried by the personal space to every device it
// syncs to: the spaces beside it, in their order, and the servers. A new device that syncs its
// personal space gets them; nothing that lets anything in goes with it, no key and no password,
// nor where a copy is on a disk. Each device writes only its own file, `.scrawl/settings/<device>.json`,
// with when it wrote it, so that no two write the same file; the latest one written is what holds.
// A space removed from a device, or a server signed out of, is left out there only: the others
// keep it, and a new device gets it. See PLAN.md 5.4.

export const CARRIED_DIR = '.scrawl/settings';

export interface CarriedSpace {
  id: string;
  /** What it was called, until its own `space.json` comes. */
  name?: string;
  source: SpaceSource;
}

export interface CarriedServer {
  url: string;
  email: string;
  name?: string;
  /** The account's id there. */
  id?: string;
  /** The account's role there, as it was last told. */
  role?: 'owner' | 'admin' | 'member';
}

export interface Carried {
  /** When it was written, as an ISO time: the latest written holds. */
  written: string;
  spaces: CarriedSpace[];
  servers: CarriedServer[];
}

const ownFile = (device: string) => join(CARRIED_DIR, `${device.replace(/[^\w.-]/g, '_')}.json`);

function readOne(text: string): Carried | null {
  try {
    const data = JSON.parse(text) as Partial<Carried>;
    if (typeof data.written !== 'string' || Number.isNaN(Date.parse(data.written))) return null;
    const spaces = (Array.isArray(data.spaces) ? data.spaces : []).filter(
      (space): space is CarriedSpace =>
        !!space && typeof space.id === 'string' && !!space.source && typeof space.source.provider === 'string' && !!space.source.place && typeof space.source.place === 'object',
    );
    const servers = (Array.isArray(data.servers) ? data.servers : []).filter((server): server is CarriedServer => !!server && typeof server.url === 'string' && typeof server.email === 'string');
    return { written: data.written, spaces, servers };
  } catch {
    return null;
  }
}

/** What the devices wrote last: the latest of their files; null when none wrote yet. */
export async function readCarried(fs: VaultFs): Promise<Carried | null> {
  let latest: Carried | null = null;
  for (const file of await fs.list(CARRIED_DIR).catch(() => [])) {
    if (file.kind !== 'file' || !file.name.endsWith('.json')) continue;
    const read = readOne(await fs.readText(file.path).catch(() => ''));
    if (read && (!latest || Date.parse(read.written) > Date.parse(latest.written))) latest = read;
  }
  return latest;
}

/** Writes what this device has into its own file. Nothing without a device. */
export async function writeCarried(fs: VaultFs, device: string, carried: Omit<Carried, 'written'>, now = new Date()): Promise<void> {
  if (!device) return;
  await fs.writeText(ownFile(device), JSON.stringify({ written: now.toISOString(), ...carried }, null, 1));
}

/**
 * `all` with those of `ours` in it put in the order `ours` has them, each in a place one of them
 * had; the others stay where they are; those of `ours` not in `all` come last.
 */
export function inOrderOf(all: string[], ours: string[]): string[] {
  const mine = new Set(ours);
  const kept = all.filter((id) => mine.has(id));
  const order = [...ours.filter((id) => kept.includes(id))];
  const result = all.map((id) => (mine.has(id) ? order.shift()! : id));
  return [...result, ...ours.filter((id) => !all.includes(id))];
}
