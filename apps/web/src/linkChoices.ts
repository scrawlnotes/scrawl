import { dirname, hrefTo, localPath, spaceOf, type TreeNode } from '@scrawlnotes/core';
import { type MessageKey, t } from '@scrawlnotes/i18n';

// What a note can link to, offered as the link's address is typed: the notes, task lists, boards,
// keys files, collections and folders of its own space, a space's links staying in it. The one
// picked is written as a path from the note's folder (design/scrawl-apps.md 2.5).

export interface LinkChoice {
  /** Its path in the app. */
  path: string;
  /** Its path in its space. */
  local: string;
  title: string;
  kind: TreeNode['kind'];
  /** The folder it is in, in its space; empty at the top. */
  where: string;
}

/** Everything in the space of the note at `note` it can link to, the note itself left out. */
export function linkChoices(tree: TreeNode[], note: string): LinkChoice[] {
  const space = spaceOf(note);
  const out: LinkChoice[] = [];
  const visit = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      const local = localPath(node.path);
      if (local && node.path !== note && spaceOf(node.path) === space) out.push({ path: node.path, local, title: node.title ?? node.name, kind: node.kind, where: dirname(local) });
      if (node.children) visit(node.children);
    }
  };
  visit(tree);
  return out;
}

/** Whether what is typed is a web or mail address rather than the name of something in the space. */
export const looksLikeAddress = (typed: string) => /^[a-z][a-z0-9+.-]*:/i.test(typed.trim()) || /^www\./i.test(typed.trim());

/** The choices that match what is typed, by their name or their path; a name starting with it first. */
export function matchChoices(choices: LinkChoice[], typed: string, limit = 8): LinkChoice[] {
  const q = typed.trim().toLowerCase();
  if (!q || looksLikeAddress(q)) return [];
  const score = (c: LinkChoice) => {
    const title = c.title.toLowerCase();
    if (title.startsWith(q)) return 0;
    if (title.includes(q)) return 1;
    return c.local.toLowerCase().includes(q) ? 2 : -1;
  };
  return choices
    .map((c) => ({ c, s: score(c) }))
    .filter(({ s }) => s >= 0)
    .sort((a, b) => a.s - b.s || a.c.title.localeCompare(b.c.title))
    .slice(0, limit)
    .map(({ c }) => c);
}

/** What a choice is and where, as a line under or beside its name: "Board · Atlas". */
export const choiceHint = (c: LinkChoice) => [t(`search.kind.${c.kind}` as MessageKey), c.where].filter(Boolean).join(' · ');

/** How the note at `note` writes a link to a choice. */
export const choiceHref = (note: string, c: LinkChoice) => hrefTo(dirname(localPath(note)), c.local);
