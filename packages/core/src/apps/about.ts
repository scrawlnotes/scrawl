import { basename } from '../fs';
import { boardName } from '../vault';
import { collectionName } from '../collection';
import type { AboutSection, Part, TemplateId } from './types';

// The About note: what the app is, a section for each template set up in it, what each piece
// holds, how it is used, what happens by itself and how the team works; then what to ask the
// agent. It says only what was set up, since it is made from the plan.

/** What a piece is called on the screen. */
export const partName = (part: Part) => (part.kind === 'board' ? boardName(part.path) : part.kind === 'collection' ? collectionName(part.path) : basename(part.path));

/** A list in words: "a, b and c". */
export const listed = (items: string[]) => (items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

/** The note's file name: About and the app's name. */
export const aboutName = (title: string) => `About ${title}`;

/** What the app's pieces share, said once at the top: one Companies for CRM and Sales. */
function shared(parts: Map<string, Part>, users: Map<string, string[]>): string[] {
  const lines: string[] = [];
  for (const [role, titles] of users) {
    const part = parts.get(role);
    if (part && titles.length > 1) lines.push(`**${partName(part)}** is one for ${listed(titles)}.`);
  }
  return lines;
}

/** A section of the note for a template, its pieces named as they are called now. */
export function aboutSection(section: AboutSection, parts: Map<string, Part>, from: Map<string, string>): string {
  const pieces = section.pieces.flatMap((role) => {
    const part = parts.get(role);
    if (!part) return [];
    const by = from.get(role);
    return [`- **${partName(part)}**: ${part.about}${by && by !== section.title ? ` Set up with ${by}.` : ''}`];
  });
  const out = [`## ${section.title}`, '', section.what, '', "### What's in it", '', ...pieces, '', '### How to use it', '', ...section.how.map((s, i) => `${i + 1}. ${s}`)];
  if (section.auto.length > 0) out.push('', '### What happens by itself', '', ...section.auto.map((s) => `- ${s}`));
  out.push('', '### How we work', '', ...section.work.map((s) => (s.startsWith('  - ') ? s : `- ${s}`)));
  return out.join('\n');
}

/** What a person can ask their agent to change, with pieces this app has. */
function agentAsks(parts: Map<string, Part>): string[] {
  const named = (role: string) => (parts.get(role) ? partName(parts.get(role)!) : null);
  const asks: string[] = [];
  const any = [...parts.values()].find((p) => p.kind === 'collection');
  if (any) asks.push(`"Add a field for the tax number to ${named('companies') ?? partName(any)}."`);
  if (named('deals')) asks.push(`"Change the stages of ${named('deals')} to Lead, Demo, Trial, Won and Lost."`);
  if (named('orders')) asks.push(`"When an order is Delivered, add a task for me to send the invoice."`);
  if (named('projects')) asks.push(`"Add a Survey step to every project that starts."`);
  if (named('products') && named('stock-movements')) asks.push(`"Mark a product Low when it has less than a week's sales left."`);
  asks.push('"Explain what happens when I press each button."');
  return asks;
}

/**
 * The About note of an app: its title, what it is made of and how the pieces meet, a section for
 * each template, then what to ask the agent.
 */
export function aboutNote(title: string, sections: { id: TemplateId; section: AboutSection }[], parts: Map<string, Part>): string {
  const users = new Map<string, string[]>();
  for (const { section } of sections) for (const role of section.pieces) users.set(role, [...(users.get(role) ?? []), section.title]);
  const from = new Map([...users].map(([role, titles]) => [role, titles[0]!]));
  const lines = [
    `# ${aboutName(title)}`,
    '',
    `${title} is set up from ${listed(sections.map((s) => s.section.title))}. This note says what is in it and how it is used; change it to say how your team works.`,
  ];
  const meets = shared(parts, users);
  if (meets.length > 0) lines.push('', ...meets);
  for (const { section } of sections) lines.push('', aboutSection(section, parts, from));
  lines.push('', '## Changing it with your agent', '', 'Ask your agent to change the app; it reads this note first. For example:', '', ...agentAsks(parts).map((a) => `- ${a}`));
  return `${lines.join('\n')}\n`;
}

/** The sections a template added to an app already set up, put at the end of its note. */
export function aboutAdded(sections: { id: TemplateId; section: AboutSection }[], parts: Map<string, Part>): string {
  const from = new Map<string, string>();
  return sections.map(({ section }) => aboutSection(section, parts, from)).join('\n\n');
}
