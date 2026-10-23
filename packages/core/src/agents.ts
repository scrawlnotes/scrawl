import type { VaultFs } from './fs';
import { agentId } from './people';
import { mergeFields, mergeRecords } from './sync/merge-records';

// A person's agents on their computers (design/activity.md 2.1), in their own space's
// `.scrawl/agents.json`: each agent that has written in Scrawl from a computer, by the client it
// is and the computer it runs on. The command that serves a computer's agents makes one the first
// time an agent writes there, and what it writes carries it. A server keeps its own agents.

const FILE = '.scrawl/agents.json';

/** An agent of the person on one of their computers. */
export interface ComputerAgent {
  /** `<the person's id>:<its own>`, as a space's people and what it writes have it. */
  id: string;
  /** What it is called; Rename changes it. */
  name: string;
  /** The client, as it names itself: "Claude Code". */
  client: string;
  /** The computer it runs on: "KAAN-PC". */
  machine: string;
  /** When it was made, as an ISO time. */
  created: string;
  /** When it last changed something, as an ISO time: written once a day at most. */
  seen?: string;
}

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

export function parseAgents(raw: string): ComputerAgent[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const list = data && typeof data === 'object' && !Array.isArray(data) ? (data as { agents?: unknown }).agents : null;
  if (!Array.isArray(list)) return [];
  const agents: ComputerAgent[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const { id, name, client, machine, created, seen, ...rest } = item as Record<string, unknown>;
    if (!text(id) || !text(client) || !text(machine) || agents.some((a) => a.id === text(id))) continue;
    // Unknown fields are kept, so a newer version's data survives being saved by an older one.
    agents.push({ ...rest, id: text(id)!, name: text(name) ?? text(client)!, client: text(client)!, machine: text(machine)!, created: text(created) ?? '', ...(text(seen) && { seen: text(seen) }) });
  }
  return agents;
}

export const serializeAgents = (agents: ComputerAgent[]) => `${JSON.stringify({ version: 1, agents }, null, 2)}\n`;

export async function loadAgents(fs: VaultFs): Promise<ComputerAgent[]> {
  try {
    return parseAgents(await fs.readText(FILE));
  } catch {
    return [];
  }
}

export const saveAgents = (fs: VaultFs, agents: ComputerAgent[]) => fs.writeText(FILE, serializeAgents(agents));

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The agent of this client on this computer; the one made first when two were made at once. */
export function agentOn(agents: ComputerAgent[], client: string, machine: string): ComputerAgent | undefined {
  return agents.filter((a) => same(a.client, client) && same(a.machine, machine)).sort((a, b) => a.created.localeCompare(b.created) || a.id.localeCompare(b.id))[0];
}

/**
 * The agent of this client on this computer, made when there is none: the list with it, and it.
 * Its name is the client's with the computer's after it, "Claude Code (KAAN-PC)", as the same
 * client on another computer is another agent.
 */
export function withComputerAgent(agents: ComputerAgent[], person: string, client: string, machine: string, now = new Date(), own: string = newOwnId()): { agents: ComputerAgent[]; agent: ComputerAgent; made: boolean } {
  const found = agentOn(agents, client, machine);
  if (found) return { agents, agent: found, made: false };
  const agent: ComputerAgent = { id: agentId(person, own), name: `${client} (${machine})`, client, machine, created: now.toISOString() };
  return { agents: [...agents, agent], agent, made: true };
}

/** The list with the agent seen now; null when it was seen today already, so that its every change does not write the file. */
export function seenAgent(agents: ComputerAgent[], id: string, now = new Date()): ComputerAgent[] | null {
  const agent = agents.find((a) => a.id === id);
  const seen = agent?.seen ? new Date(agent.seen) : null;
  if (!agent || (seen && !Number.isNaN(seen.getTime()) && seen.toDateString() === now.toDateString())) return null;
  return agents.map((a) => (a.id === id ? { ...a, seen: now.toISOString() } : a));
}

/** A new name for one; an empty one keeps the old. */
export function renameAgent(agents: ComputerAgent[], id: string, name: string): ComputerAgent[] {
  const clean = name.trim();
  return clean ? agents.map((a) => (a.id === id ? { ...a, name: clean } : a)) : agents;
}

/** The agent's own part of its id: short, as only its person's agents share the part before it. */
function newOwnId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
}

/** The list from three versions: by id, each agent's fields as any record's. */
export function mergeAgents(base: string, local: string, remote: string): string {
  return serializeAgents(mergeRecords<ComputerAgent>(parseAgents(base), parseAgents(local), parseAgents(remote), (a) => a.id, (was, mine, theirs) => mergeFields(was, mine, theirs)));
}
