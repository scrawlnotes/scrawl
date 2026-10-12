import type { PointerEvent as ReactPointerEvent } from 'react';
import { onPage } from './device';

// Dragging with a finger, for task rows, section headers and cards, where the browser's own
// dragging does not reach: held still for a moment, the thing lifts and a copy of it follows the
// finger; the caller tells where it would land as the finger moves, and moves it there when the
// finger lets go. A finger that moves before the moment is up scrolls the page as ever, and a short
// tap is a tap. Near the edge of anything that scrolls, it scrolls. See the Touch drag view of
// design/mockups.html.

/** How long a finger is held still before the thing lifts. */
const HOLD_MS = 400;
/** How far a held finger may wander and still lift what it holds. */
const SLOP = 8;
/** How near the edge of a scrolling box the finger scrolls it, and how far a frame at most. */
const EDGE = 44;
const SPEED = 14;

export interface HoldToDrag {
  /** What lifts: it fades in its place, and a copy of it follows the finger. */
  element: HTMLElement;
  /** It lifted, the finger here. */
  onLift: (x: number, y: number) => void;
  /** The finger moved, or what is under it scrolled. */
  onMove: (x: number, y: number) => void;
  /** The finger let go: what the last move said happens. */
  onDrop: () => void;
  /** It ended without a drop. */
  onCancel: () => void;
  /**
   * The finger let go where it lifted the thing, without carrying it: instead of a drop. On a
   * phone this opens what can be done with it. Without it, letting go there is a drop.
   */
  onStill?: () => void;
}

/** A box that scrolls along `axis`. */
function scrolls(element: HTMLElement, axis: 'x' | 'y'): boolean {
  const style = getComputedStyle(element);
  const overflow = axis === 'y' ? style.overflowY : style.overflowX;
  if (overflow !== 'auto' && overflow !== 'scroll') return false;
  return axis === 'y' ? element.scrollHeight > element.clientHeight : element.scrollWidth > element.clientWidth;
}

/** How far to scroll, by how near the finger is to an edge: nothing, or up to SPEED, negative towards the start. */
function push(at: number, start: number, end: number): number {
  if (at < start + EDGE) return -Math.ceil(SPEED * (1 - Math.max(0, at - start) / EDGE));
  if (at > end - EDGE) return Math.ceil(SPEED * (1 - Math.max(0, end - at) / EDGE));
  return 0;
}

/**
 * Starts holding, for a touch; a mouse or a pen is left to the browser's own dragging. Called from
 * the element's pointerdown.
 */
export function holdToDrag(event: ReactPointerEvent | PointerEvent, drag: HoldToDrag) {
  if (event.pointerType !== 'touch' || !event.isPrimary) return;
  const id = event.pointerId;
  const start = { x: event.clientX, y: event.clientY };
  let point = start;
  let lifted = false;
  /** Where it lifted, and whether the finger carried it away from there since. */
  let liftedAt = start;
  let carriedAway = false;
  let ghost: HTMLElement | null = null;
  let grip = { x: 0, y: 0 };
  let frame = 0;

  // The finger is where the screen says; the copy is moved in the page's own pixels.
  const place = () => {
    if (ghost) ghost.style.transform = `translate(${onPage(point.x - grip.x)}px, ${onPage(point.y - grip.y)}px) rotate(1.5deg) scale(1.02)`;
  };

  // Near an edge of the nearest box that scrolls each way, under the finger, that box scrolls, and
  // where the thing would land is worked out again.
  const scroll = () => {
    const under = document.elementFromPoint(point.x, point.y);
    let moved = false;
    for (const axis of ['y', 'x'] as const) {
      for (let box = under instanceof HTMLElement ? under : null; box; box = box.parentElement) {
        if (!scrolls(box, axis)) continue;
        const rect = box.getBoundingClientRect();
        const by = axis === 'y' ? push(point.y, rect.top, rect.bottom) : push(point.x, rect.left, rect.right);
        if (by !== 0) {
          const before = axis === 'y' ? box.scrollTop : box.scrollLeft;
          if (axis === 'y') box.scrollTop += by;
          else box.scrollLeft += by;
          moved ||= (axis === 'y' ? box.scrollTop : box.scrollLeft) !== before;
        }
        break;
      }
    }
    if (moved) drag.onMove(point.x, point.y);
    frame = requestAnimationFrame(scroll);
  };

  const lift = () => {
    lifted = true;
    liftedAt = point;
    const box = drag.element.getBoundingClientRect();
    grip = { x: point.x - box.left, y: point.y - box.top };
    ghost = drag.element.cloneNode(true) as HTMLElement;
    ghost.classList.remove('lifted', 'on');
    ghost.classList.add('touch-ghost');
    ghost.style.width = `${onPage(box.width)}px`;
    ghost.setAttribute('aria-hidden', 'true');
    document.body.append(ghost);
    place();
    // A short buzz where the phone has one; a browser takes it only once the page was touched.
    if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(10);
    drag.onLift(point.x, point.y);
    frame = requestAnimationFrame(scroll);
  };
  const timer = window.setTimeout(lift, HOLD_MS);

  const move = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    point = { x: e.clientX, y: e.clientY };
    if (!lifted) {
      if (Math.hypot(point.x - start.x, point.y - start.y) > SLOP) end();
      return;
    }
    if (Math.hypot(point.x - liftedAt.x, point.y - liftedAt.y) > SLOP) carriedAway = true;
    place();
    drag.onMove(point.x, point.y);
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    const carried = lifted;
    end();
    if (!carried) return;
    if (!carriedAway && drag.onStill) drag.onStill();
    else drag.onDrop();
    // The touch that let go is not also a tap on what it ends on.
    const swallow = (click: Event) => {
      click.preventDefault();
      click.stopPropagation();
    };
    window.addEventListener('click', swallow, { capture: true, once: true });
    window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 400);
  };
  const cancel = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    const carried = lifted;
    end();
    if (carried) drag.onCancel();
  };
  // Carried, the page does not scroll under the finger; held, it opens no menu and selects no text.
  const still = (e: TouchEvent) => {
    if (lifted) e.preventDefault();
  };
  const noMenu = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  };

  function end() {
    window.clearTimeout(timer);
    cancelAnimationFrame(frame);
    ghost?.remove();
    ghost = null;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    document.removeEventListener('touchmove', still);
    window.removeEventListener('contextmenu', noMenu, { capture: true });
  }

  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
  document.addEventListener('touchmove', still, { passive: false });
  window.addEventListener('contextmenu', noMenu, { capture: true });
}

/** Whether a press starts on something it would rather type or pick in: no holding there. */
export const pressOnField = (event: ReactPointerEvent) => (event.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]') !== null;
