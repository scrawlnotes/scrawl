import { useEffect } from 'react';
import { typingIn } from './sheets';

/** How long the screen stays on after the last thing written: dictating writes all the time. */
const AWAKE_MS = 60_000;

/**
 * Keeps a phone's screen on while something is written in a field or a note, and for a minute
 * after: an iPhone counts touches, not dictation, and locks the screen mid-sentence. Put away the
 * keyboard or leave the app and the phone's own Auto-Lock is back at once.
 */
export function useAwakeWhileWriting() {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return;
    // A promise, so that letting go before the screen is held still lets go of it once it is.
    let lock: Promise<WakeLockSentinel | null> | null = null;
    let timer = 0;
    const off = () => {
      window.clearTimeout(timer);
      lock?.then((held) => held?.release()).catch(() => {});
      lock = null;
    };
    const wrote = () => {
      if (document.visibilityState !== 'visible') return;
      lock ??= navigator.wakeLock.request('screen').catch(() => null);
      window.clearTimeout(timer);
      timer = window.setTimeout(off, AWAKE_MS);
    };
    // After the focus has moved: going from one field to the next leaves nothing focused for a moment.
    const moved = () => window.setTimeout(() => !typingIn() && off());
    // Hidden, the phone lets go of the screen itself; written in again, it is asked for again.
    const shown = () => document.visibilityState !== 'visible' && off();
    // beforeinput too: an editor that writes the text itself cancels the input that would follow.
    document.addEventListener('beforeinput', wrote, true);
    document.addEventListener('input', wrote, true);
    document.addEventListener('focusout', moved);
    document.addEventListener('visibilitychange', shown);
    return () => {
      document.removeEventListener('beforeinput', wrote, true);
      document.removeEventListener('input', wrote, true);
      document.removeEventListener('focusout', moved);
      document.removeEventListener('visibilitychange', shown);
      off();
    };
  }, []);
}
