import { type McpServer, ProtocolError, ProtocolErrorCode, type ServerCapabilities } from '@modelcontextprotocol/server';
import { z } from 'zod';

// MCP Events (design/agent-wake.md 11): on a Scrawl server a client, as ChatGPT is, subscribes to
// `wake`, and the server sends it what the person writes to it, by a signed webhook. One event, no
// arguments, no replay. A computer's door has none: no one there to send it.

/** The one event: what wakes the agent, and what it is sent, the same as a webhook's body. */
export const WAKE_EVENT = {
  name: 'wake',
  description: 'When the person you work for mentions you in Scrawl, answers one of your messages, or gives you a card or a task. `text` says who wrote what and where, and how to read it and answer.',
  delivery: ['webhook'],
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  payloadSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Who wrote what to you and where, and the tools to read it and answer in the same place.' },
      event: { type: 'object', description: 'The same as fields: kind (mention, reply or assign), server, agent, from, at, space, and chat, card or task.' },
    },
    required: ['text', 'event'],
  },
};

/** A subscription asked for, checked: where to send, its secret, how long. */
export interface EventSubscribe {
  arguments: { [key: string]: unknown };
  url: string;
  secret: string;
  /** Asked for in ms; null for no end, which the server need not give. */
  ttlMs: number | null | undefined;
}

/** What the door does with them: the server keeps subscriptions and sends events. */
export interface AgentEvents {
  subscribe(input: EventSubscribe): Promise<{ id: string; refreshBefore: string | null }>;
  unsubscribe(input: { arguments: { [key: string]: unknown }; url: string }): Promise<void>;
}

/** Refused as MCP Events says a callback that did not answer is (-32015, CallbackEndpointError). */
export class CallbackRefused extends Error {
  constructor(
    readonly reason: 'challenge_failed' | 'timeout' | 'unreachable' | 'refused',
    message: string,
  ) {
    super(message);
    this.name = 'CallbackRefused';
  }
}

/** A subscription that cannot be: a wrong secret or address, arguments the event does not take (-32602). */
export class SubscriptionRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SubscriptionRefused';
  }
}

const Delivery = z.object({ mode: z.string().optional(), url: z.string(), secret: z.string().optional() }).loose();
const SubscribeParams = z.object({ name: z.string(), arguments: z.record(z.string(), z.unknown()).optional(), delivery: Delivery, cursor: z.string().nullable().optional(), ttlMs: z.number().nullable().optional() }).loose();
const UnsubscribeParams = z.object({ name: z.string(), arguments: z.record(z.string(), z.unknown()).optional(), delivery: Delivery }).loose();
const ListParams = z.object({ cursor: z.string().optional() }).loose().optional();

const noSuchEvent = (name: string) => new ProtocolError(ProtocolErrorCode.InvalidParams, `No event named ${name}; the one event is wake`);

/** The events capability and its three methods, on a door that has events. */
export function serveEvents(server: McpServer, events: AgentEvents) {
  server.server.registerCapabilities({ events: {} } as ServerCapabilities);
  server.server.setRequestHandler('events/list', { params: ListParams }, () => ({ events: [WAKE_EVENT] }));
  server.server.setRequestHandler('events/subscribe', { params: SubscribeParams }, async (params) => {
    if (params.name !== WAKE_EVENT.name) throw noSuchEvent(params.name);
    if ((params.delivery.mode ?? 'webhook') !== 'webhook') throw new ProtocolError(ProtocolErrorCode.InvalidParams, 'Only webhook delivery is supported');
    try {
      const made = await events.subscribe({ arguments: params.arguments ?? {}, url: params.delivery.url, secret: params.delivery.secret ?? '', ttlMs: params.ttlMs });
      return { ...made, cursor: null, truncated: false };
    } catch (error) {
      if (error instanceof CallbackRefused) throw new ProtocolError(-32015, error.message, { reason: error.reason });
      if (error instanceof SubscriptionRefused) throw new ProtocolError(ProtocolErrorCode.InvalidParams, error.message);
      throw error;
    }
  });
  server.server.setRequestHandler('events/unsubscribe', { params: UnsubscribeParams }, async (params) => {
    if (params.name !== WAKE_EVENT.name) throw noSuchEvent(params.name);
    await events.unsubscribe({ arguments: params.arguments ?? {}, url: params.delivery.url });
    return {};
  });
}
