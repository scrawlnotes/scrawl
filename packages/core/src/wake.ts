// Waking an agent (design/agent-wake.md): when its owner mentions it, answers it, or gives it a
// card or a task, the server sends the agent's address what the owner wrote: a text that says it
// all for an agent that reads text alone (Claude's task), and the same as fields for one that reads
// fields (n8n). Here are those words, and how the address and its headers are read, which the app
// checks as they are typed and the server again. Everything an agent reads is English.

/** A host something may be fetched from: a public name, never the loopback, a local name or a bare IP. */
export function publicHost(host: string): boolean {
  const name = host.toLowerCase().replace(/^\[|\]$/g, '');
  // An address parser writes every IP as numbers and dots, or with colons: no name.
  if (!name || name === 'localhost' || name.includes(':') || /^[\d.]+$/.test(name)) return false;
  return !name.endsWith('.localhost') && !name.endsWith('.local') && !name.endsWith('.internal') && name.includes('.');
}

/** What a header's value shows once saved: it is never given back. */
export const WAKE_MASK = '••••';
export const WAKE_HEADERS_MAX = 10;
const ADDRESS_MAX = 2000;
const VALUE_MAX = 4000;
/** What Scrawl writes itself, or what would break the request. */
const OWN_HEADERS = new Set(['host', 'content-type', 'content-length', 'connection', 'transfer-encoding']);
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/** Whether an agent may be woken at an address: https, a public name, no sign-in in it. */
export function wakeAddressOk(address: string): boolean {
  if (address.length > ADDRESS_MAX) return false;
  try {
    const url = new URL(address);
    return url.protocol === 'https:' && !url.username && !url.password && publicHost(url.hostname);
  } catch {
    return false;
  }
}

/** Why a line of headers is not taken: not `Name: value`, a header Scrawl writes itself, one too many, or a hidden value with nothing kept under its name. */
export type WakeHeaderProblem = { line: number; why: 'form' | 'own' | 'many' | 'again'; name?: string };

/**
 * Headers as written, one `Name: value` a line, blank lines left out. A value left as `••••` is the
 * one kept under that name (`kept`), since a saved value is never shown again.
 */
export function readWakeHeaders(text: string, kept: readonly (readonly [string, string])[] = []): { headers: [string, string][] } | WakeHeaderProblem {
  const headers: [string, string][] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    const name = colon > 0 ? line.slice(0, colon).trim() : '';
    const value = colon > 0 ? line.slice(colon + 1).trim() : '';
    if (!TOKEN.test(name) || !value || value.length > VALUE_MAX) return { line: i + 1, why: 'form' };
    if (OWN_HEADERS.has(name.toLowerCase())) return { line: i + 1, why: 'own', name };
    if (headers.length === WAKE_HEADERS_MAX) return { line: i + 1, why: 'many' };
    if (value === WAKE_MASK) {
      const old = kept.find(([each]) => each.toLowerCase() === name.toLowerCase());
      if (!old) return { line: i + 1, why: 'again', name };
      headers.push([name, old[1]]);
    } else headers.push([name, value]);
  }
  return { headers };
}

/** What a problem with a line of headers says, as the server refuses it. */
export function wakeHeaderWords(problem: WakeHeaderProblem): string {
  if (problem.why === 'own') return `Line ${problem.line}: Scrawl writes ${problem.name} itself`;
  if (problem.why === 'many') return `Line ${problem.line}: ${WAKE_HEADERS_MAX} headers at most`;
  if (problem.why === 'again') return `Line ${problem.line}: write the value of ${problem.name} again`;
  return `Line ${problem.line}: a header is Name: value`;
}

/** What an agent is woken by, and where: what the server sends its address, as fields. */
export interface WakeEvent {
  /** `message`: written in the person's direct message with the agent (design/agent-wake.md 14). */
  kind: 'mention' | 'reply' | 'assign' | 'message';
  /** The Scrawl server's address. */
  server: string;
  agent: { id: string; name: string };
  /** Its owner, who wrote it. */
  from: { id: string; name: string };
  at: string;
  space: { id: string; name: string } | null;
  /** In a conversation: its id, its name (`#dev`, `founders`, the others in a direct message) and the message. */
  chat?: { id: string; kind: 'public' | 'private' | 'direct'; name: string; message: string };
  /** On a card: on which board, and the comment it was mentioned in. */
  card?: { id: string; key: string; title: string; board: string; comment?: string };
  task?: { id: string; title: string; list: string };
}

/** The longest quote of what was written; the agent reads the rest itself. */
export const WAKE_QUOTE_MAX = 4000;

/** What was written, as the agent is shown it: a mention as @Name, cut with … at 4,000 characters, each line quoted. */
function quoted(words: string): string {
  const plain = words.replace(/\[(@[^\]]*)\]\(scrawl:(?:person\/[^)\s]+|room)\)/g, '$1').trim();
  const cut = plain.length > WAKE_QUOTE_MAX ? `${plain.slice(0, WAKE_QUOTE_MAX - 1)}…` : plain;
  return cut
    .split('\n')
    .map((line) => (line ? `> ${line}` : '>'))
    .join('\n');
}

/**
 * The text an agent is woken with (design/agent-wake.md 6.4): who wrote what to it, where, on which
 * server, and the tools to read it and to answer in the same place, writing @ and the owner's first
 * name, so that the owner hears of the answer. `words` is what the owner wrote: the message, the
 * comment or the description; none for a card or a task given.
 */
export function wakeText(event: WakeEvent, words = ''): string {
  const from = event.from.name || 'Your person';
  const first = from.split(/\s+/)[0]!;
  const host = (() => {
    try {
      return new URL(event.server).host;
    } catch {
      return event.server;
    }
  })();
  const on = `on the Scrawl server ${host}`;
  const space = event.space ? `, space: "${event.space.name}"` : '';
  const inSpace = event.space ? ` (space ${event.space.name})` : '';
  const quote = words.trim() ? `\n\n${quoted(words)}\n\n` : '\n\n';
  if (event.chat && event.kind === 'message') {
    // Their direct message with the agent tells them of what it writes there: no @ (design/agent-wake.md 14).
    return `${from} wrote to you in your direct message with them ${on}:${quote}Read the conversation with \`messages\` (in: "me"), do what ${first} asks, and answer there with \`send_message\` (to: "me").`;
  }
  if (event.chat) {
    const chat = event.chat;
    const room = chat.kind !== 'direct';
    // A room by its name and space; a direct message by its id, which is one whatever its people.
    const where = room ? `${chat.name}${inSpace}` : `the direct message with ${chat.name}`;
    const target = room ? `"${chat.name}"${space}` : `"${chat.id}"`;
    const lead = event.kind === 'reply' ? `${from} answered your message in ${where} ${on}:` : `${from} wrote to you in ${where} ${on}:`;
    return `${lead}${quote}Read the conversation with \`messages\` (in: ${target}), do what ${first} asks, and answer with \`send_message\` (to: ${target}, replyTo: "${chat.message}"), writing @${first} in it.`;
  }
  if (event.card) {
    const card = event.card;
    const which = `${card.key} "${card.title}" on the board ${card.board}${inSpace} ${on}`;
    const args = `(board: "${card.board}", card: "${card.key}"${space})`;
    if (event.kind === 'assign') {
      return `${from} gave you ${which}.\n\nRead it with \`cards\` ${args}, do it, and say what you did and what is left with \`comment\` ${args}, writing @${first} in it.`;
    }
    const lead = card.comment ? `${from} mentioned you in a comment on ${which}:` : `${from} mentioned you in the description of ${which}:`;
    return `${lead}${quote}Read the card with \`cards\` ${args}, do what ${first} asks, and answer with \`comment\` ${args}, writing @${first} in it.`;
  }
  const task = event.task!;
  const which = `the task "${task.title}" in the list ${task.list}${inSpace} ${on}`;
  const list = `list: "${task.list}"${space}`;
  if (event.kind === 'assign') {
    return `${from} gave you ${which}.\n\nRead it with \`tasks\` (${list}), do it, and finish it with \`save_task\` (${list}, id: "${task.id}", done: true). Anything to tell ${first} goes in its description with \`save_task\`, writing @${first} in it.`;
  }
  return `${from} mentioned you in the description of ${which}:${quote}Read it with \`tasks\` (${list}), do what ${first} asks, and answer in its description with \`save_task\` (${list}, id: "${task.id}"), writing @${first} in it.`;
}
