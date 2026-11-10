import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { type AgentEvents, CallbackRefused, SubscriptionRefused, WAKE_EVENT } from './events';
import { buildServer } from './server';
import type { Agent } from './space';

// MCP Events over MCP (design/agent-wake.md 11): a door with events says so, lists `wake`, and
// passes a subscription on; what it refuses comes back as MCP Events names it.

/** A client on a door; `capabilities` as the server sent them, before the SDK's client drops what it does not know. */
async function connected(events?: AgentEvents) {
  const agent: Agent = { spaces: async () => [], person: async () => ({ id: 'me', name: 'Kaan' }), ...(events && { events }) };
  const server = buildServer(agent);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const sent: { result?: { capabilities?: { events?: object } } }[] = [];
  const send = serverSide.send.bind(serverSide);
  serverSide.send = (message, options) => (sent.push(message as (typeof sent)[number]), send(message, options));
  await server.connect(serverSide);
  const client = new Client({ name: 'ChatGPT', version: '1.0.0' });
  await client.connect(clientSide);
  return Object.assign(client, { capabilities: () => sent.find((each) => each.result?.capabilities)?.result?.capabilities });
}

const SECRET = `whsec_${Buffer.alloc(32, 7).toString('base64')}`;
const subscribe = { method: 'events/subscribe', params: { name: 'wake', arguments: {}, delivery: { mode: 'webhook', url: 'https://hooks.example.com/mcp', secret: SECRET }, ttlMs: null } };

describe('events', () => {
  it('lists wake and passes a subscription on, on a door that has events', async () => {
    const asked: unknown[] = [];
    const client = await connected({
      subscribe: async (input) => (asked.push(input), { id: 'sub_1', refreshBefore: '2026-11-17T10:00:00.000Z' }),
      unsubscribe: async (input) => void asked.push(input),
    });
    expect(client.capabilities()?.events).toEqual({});
    expect(await client.request({ method: 'events/list', params: {} }, z.any())).toEqual({ events: [WAKE_EVENT] });
    expect(await client.request(subscribe, z.any())).toEqual({ id: 'sub_1', refreshBefore: '2026-11-17T10:00:00.000Z', cursor: null, truncated: false });
    expect(await client.request({ method: 'events/unsubscribe', params: { name: 'wake', arguments: {}, delivery: { url: 'https://hooks.example.com/mcp' } } }, z.any())).toEqual({});
    expect(asked).toEqual([{ arguments: {}, url: 'https://hooks.example.com/mcp', secret: SECRET, ttlMs: null }, { arguments: {}, url: 'https://hooks.example.com/mcp' }]);
  });

  it('refuses another event, a callback that does not answer (-32015), and a wrong subscription', async () => {
    let refuse: Error = new CallbackRefused('challenge_failed', 'The callback did not give the challenge back');
    const client = await connected({
      subscribe: async () => {
        throw refuse;
      },
      unsubscribe: async () => undefined,
    });
    await expect(client.request({ ...subscribe, params: { ...subscribe.params, name: 'deploy' } }, z.any())).rejects.toMatchObject({ code: -32602 });
    await expect(client.request(subscribe, z.any())).rejects.toMatchObject({ code: -32015, data: { reason: 'challenge_failed' } });
    refuse = new SubscriptionRefused('The secret must start with whsec_');
    await expect(client.request(subscribe, z.any())).rejects.toMatchObject({ code: -32602 });
  });

  it('has no events on a door without them, as a computer’s', async () => {
    const client = await connected();
    expect(client.capabilities()?.events).toBeUndefined();
    await expect(client.request({ method: 'events/list', params: {} }, z.any())).rejects.toMatchObject({ code: -32601 });
  });
});
