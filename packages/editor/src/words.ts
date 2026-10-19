/**
 * A word: letters and digits, with an apostrophe or a hyphen inside it (`don't`, `e-posta`), and a
 * number with its point or colon (`3.5`, `12:30`); marks and signs are not words.
 */
const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+|[.:,]\p{N}+)*/gu;

/** How many words a text has, as the status bar counts them. */
export const wordCount = (text: string) => text.match(WORD)?.length ?? 0;
