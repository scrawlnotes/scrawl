/** A number with its unit, plural when it is not one: `1 note`, `3 notes`. */
export const count = (n: number, unit: string) => `${n.toLocaleString('en-US')} ${unit}${n === 1 ? '' : 's'}`;

/** A name as it is quoted in messages. */
export const quote = (name: string) => `“${name}”`;

/** What a folder holds, as `2 notes, 1 task list`; empty when it holds nothing. */
export function contentsText(holds: { notes: number; lists: number; folders: number }): string {
  const parts: [number, string][] = [
    [holds.notes, 'note'],
    [holds.lists, 'task list'],
    [holds.folders, 'folder'],
  ];
  return parts
    .filter(([n]) => n > 0)
    .map(([n, unit]) => count(n, unit))
    .join(', ');
}
