import { en } from './en';

/**
 * The words of the interface, in one place, so that other languages can be added as further
 * dictionaries with the same keys. A message may hold `{name}` places for values, and may have a
 * form per plural category (`one`, `other`, and whatever else a language needs), chosen by the
 * value called `count`.
 */
export type Message = string | Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
export type Messages = Record<MessageKey, Message>;
export type MessageKey = keyof typeof en;

let messages: Messages = en;
let language = 'en-US';

/** The language dates and numbers are written in. */
export const locale = () => language;

/**
 * The languages the interface can be shown in: English, and each dictionary added after it. The
 * settings offer a choice once there is more than one.
 */
export const languages: { tag: string; name: string; dictionary: Partial<Messages> }[] = [{ tag: 'en-US', name: 'English', dictionary: en }];

/** Switches the interface to another dictionary. Keys it lacks fall back to English. */
export function setLanguage(tag: string, dictionary: Partial<Messages>) {
  language = tag;
  messages = { ...en, ...dictionary };
}

/** The message for `key`, with its `{name}` places filled from `values`. */
export function t(key: MessageKey, values: Record<string, string | number> = {}): string {
  const message = messages[key];
  const text =
    typeof message === 'string'
      ? message
      : (message[new Intl.PluralRules(language).select(Number(values.count ?? 0))] ?? message.other);
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = values[name];
    if (value === undefined) return whole;
    return typeof value === 'number' ? value.toLocaleString(language) : value;
  });
}
