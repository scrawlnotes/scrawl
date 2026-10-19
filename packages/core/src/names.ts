// A name is a file name, and Windows and OneDrive take none of \ / : * ? " < > | in one. A name
// keeps them all the same: a file's name has a letter that looks the same in each one's place,
// and the name shows them back as typed. `Ne yapmalı?` is the file `Ne yapmalı？.md`.

const PAIRS: readonly [string, string][] = [
  ['\\', '⧵'],
  ['/', '∕'],
  [':', '꞉'],
  ['*', '∗'],
  ['?', '？'],
  ['"', '＂'],
  ['<', '‹'],
  ['>', '›'],
  ['|', 'ǀ'],
];
const TO_FILE = new Map(PAIRS);
const FROM_FILE = new Map(PAIRS.map(([typed, file]) => [file, typed]));

/** A name as a file is named: each character a file name does not take, its look-alike. */
export const fileNameOf = (name: string): string => name.replace(/[\\/:*?"<>|]/g, (c) => TO_FILE.get(c)!);

/** A file's name as the name it shows: each look-alike back as it was typed. */
export const shownName = (fileName: string): string => fileName.replace(/[⧵∕꞉∗？＂‹›ǀ]/g, (c) => FROM_FILE.get(c)!);
