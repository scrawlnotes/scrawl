import type { CallToolResult } from '@modelcontextprotocol/server';
import { Refusal } from './paths';

// What a tool answers: the same thing as text, for the model, and as structured content, for the
// client. A refusal is an answer too, marked as an error, with what the agent needs to go on.

/** A result from a value: the value as compact JSON in the text, and as structured content. */
export function ok(data: { [key: string]: unknown }, text?: string): CallToolResult {
  return { content: [{ type: 'text', text: text ?? JSON.stringify(data) }], structuredContent: data };
}

/** The answer to something a tool could not do. */
export function failed(error: unknown): CallToolResult {
  if (error instanceof Refusal) {
    const data = { error: error.message, ...error.details };
    return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data, isError: true };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }], structuredContent: { error: message }, isError: true };
}

/** Runs a tool, answering with its value or with why it could not. */
export async function answer(run: () => Promise<{ data: { [key: string]: unknown }; text?: string }>): Promise<CallToolResult> {
  try {
    const { data, text } = await run();
    return ok(data, text);
  } catch (error) {
    return failed(error);
  }
}
