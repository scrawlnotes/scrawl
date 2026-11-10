import type { ServerAgent } from '@scrawlnotes/core';
import { useEffect, useSyncExternalStore } from 'react';
import { serverAccount } from './servers';

// The person's agents they wake on each server (design/agent-wake.md 3.3): the @ list offers them
// after the people. Asked of the server once, and again whenever Settings › Agents reads its list.

export interface WakeableAgent {
  id: string;
  name: string;
  /** Where it answers from: a Claude task, ChatGPT watching, or an address. */
  how: 'claude' | 'chatgpt' | 'other';
  host: string;
}

const NONE: WakeableAgent[] = [];
const known = new Map<string, WakeableAgent[]>();
const asked = new Set<string>();
const listeners = new Set<() => void>();

/** A server's agent connections as Settings › Agents reads them: those with an address, by their identity, each once. */
export function setWakeable(url: string, agents: ServerAgent[]) {
  const found = new Map<string, WakeableAgent>();
  for (const agent of agents) {
    if (!(agent.wakes || agent.watches) || !agent.agent) continue;
    const how = agent.watches ? 'chatgpt' : agent.wakes?.kind === 'claude' ? 'claude' : 'other';
    found.set(agent.agent, { id: agent.agent, name: agent.name || agent.client, how, host: agent.watches?.host ?? agent.wakes?.host ?? '' });
  }
  known.set(url, [...found.values()]);
  for (const listener of listeners) listener();
}

/** Whether the server said which agents answer: until it has, none is taken as not answering. */
export const wakeableKnown = (url: string) => known.has(url);

/** The agents the person wakes on a server; none for no server, and none until the server has said. */
export function useWakeable(url: string | null): WakeableAgent[] {
  useEffect(() => {
    if (!url || asked.has(url)) return;
    asked.add(url);
    serverAccount(url)
      .agents()
      .then((agents) => setWakeable(url, agents))
      // Out of reach or signed out: asked again the next time a list opens.
      .catch(() => asked.delete(url));
  }, [url]);
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (url ? (known.get(url) ?? NONE) : NONE),
  );
}
