import { useSyncExternalStore } from 'react';

// The comment a notification opened its card at (design/notifications.md 6): the card's timeline
// goes to it and lights it a moment, as Chat does a message. Asked once; the timeline takes it.

let asked: { card: string; comment: string } | null = null;
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => (listeners.add(listener), () => listeners.delete(listener));

/** Opens a card's timeline at this comment, the next time it shows. */
export function showComment(card: string, comment: string) {
  asked = { card, comment };
  tell();
}

/** In a card's timeline: the comment it is asked to go to, or null. */
export function useAskedComment(card: string): string | null {
  const now = useSyncExternalStore(subscribe, () => asked);
  return now?.card === card ? now.comment : null;
}

/** The timeline went to it: it is not asked again. */
export function tookComment() {
  asked = null;
  tell();
}
