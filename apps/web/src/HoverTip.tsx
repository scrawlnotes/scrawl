import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { pageBox, pageWindow } from './device';

/** How long the pointer rests on something before its tip shows. */
const TIP_MS = 500;
/** How wide a tip may be before it goes on to another line. */
const ROOM = 420;

/** Whether a label is cut short, its end hidden behind an ellipsis. */
export const cutShort = (label: Element | null) => !!label && label.scrollWidth > label.clientWidth;

/**
 * A tip under something once the pointer rests on it: a name in full where it is cut short, and
 * where it is, on a second line. Shown by `show`, gone with `hide`; `tip` is drawn anywhere.
 */
export function useHoverTip() {
  const [tip, setTip] = useState<{ lines: string[]; left: number; top: number } | null>(null);
  const timer = useRef(0);
  const show = (under: Element, lines: (string | null)[], from: Element = under) => {
    const shown = lines.filter((line): line is string => !!line);
    window.clearTimeout(timer.current);
    if (!shown.length) return setTip(null);
    const box = pageBox(under);
    // Under the name it tells, or further left near the window's edge, so that it has room.
    const left = Math.max(8, Math.min(pageBox(from).left, pageWindow().width - ROOM - 12));
    timer.current = window.setTimeout(() => setTip({ lines: shown, left, top: box.bottom + 4 }), TIP_MS);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setTip(null);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const node: ReactNode =
    tip &&
    createPortal(
      // A long name goes on to another line.
      <div className="hover-tip" role="tooltip" style={{ left: tip.left, top: tip.top, maxWidth: ROOM }}>
        {tip.lines.map((line, i) => (
          <div key={i} className={i > 0 ? 'where' : undefined}>
            {line}
          </div>
        ))}
      </div>,
      document.body,
    );
  return { show, hide, tip: node };
}
