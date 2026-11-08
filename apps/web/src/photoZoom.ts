/** How much larger a photo is shown, and how far it is moved from where it rests. */
export type Zoom = { scale: number; x: number; y: number };
/** Where a photo rests at its size, and the window it is seen in, on the screen. */
export type Place = { cx: number; cy: number; width: number; height: number; left: number; top: number; right: number; bottom: number };

export const FIT: Zoom = { scale: 1, x: 0, y: 0 };
export const MAX_ZOOM = 5;
export const TAP_ZOOM = 2.5;

/** Moved no further than to have an edge at the window's: a photo larger than it always fills it. */
function held(offset: number, center: number, size: number, from: number, to: number): number {
  if (size <= to - from) return 0;
  return Math.min(from - center + size / 2, Math.max(to - center - size / 2, offset));
}

/** Kept within 1 and MAX_ZOOM, and within the window. */
export function kept(next: Zoom, place: Place): Zoom {
  const scale = Math.min(MAX_ZOOM, Math.max(1, next.scale));
  if (scale === 1) return FIT;
  return {
    scale,
    x: held(next.x, place.cx, place.width * scale, place.left, place.right),
    y: held(next.y, place.cy, place.height * scale, place.top, place.bottom),
  };
}

/** Made `scale` large about a point of the screen, which stays over the same part of the photo. */
export function zoomedAt(now: Zoom, scale: number, px: number, py: number, place: Place): Zoom {
  const k = Math.min(MAX_ZOOM, Math.max(1, scale)) / now.scale;
  return kept({ scale: now.scale * k, x: (px - place.cx) * (1 - k) + now.x * k, y: (py - place.cy) * (1 - k) + now.y * k }, place);
}

/** Where an image rests in its viewer: from layout, which the zoom's transform does not move. */
export function placeOf(image: HTMLElement, area: HTMLElement): Place {
  const window = area.getBoundingClientRect();
  return {
    cx: window.left + image.offsetLeft + image.offsetWidth / 2,
    cy: window.top + image.offsetTop + image.offsetHeight / 2,
    width: image.offsetWidth,
    height: image.offsetHeight,
    left: window.left,
    top: window.top,
    right: window.right,
    bottom: window.bottom,
  };
}
