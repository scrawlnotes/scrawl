// An image's width, kept in the note the way Obsidian keeps it: `![photo|400](…)` is 400 pixels
// wide, and `![photo|400x300](…)` too, its height following from its width. An image with no
// width is drawn as large as it fits, up to 720 by 480 pixels.

/** An image's alt text read: what it says, and the width it is drawn at, if one is given. */
export interface ImageAlt {
  label: string;
  width: number | null;
}

const SIZED = /^(.*?)\s*\|\s*(\d{1,5})(?:\s*x\s*\d{1,5})?\s*$/;

/** The narrowest an image is made. */
export const MIN_IMAGE_WIDTH = 48;

/** The ready sizes an image's bar and menu offer. Full is wider than any page, so it takes all of it. */
export const IMAGE_SIZES = { small: 240, medium: 480, full: 1600 } as const;
export type ImageSize = keyof typeof IMAGE_SIZES;

export function readImageAlt(alt: string): ImageAlt {
  const m = SIZED.exec(alt);
  if (!m) return { label: alt, width: null };
  return { label: m[1]!, width: Math.max(MIN_IMAGE_WIDTH, Number(m[2])) };
}

/** The alt text of an image with `label`, drawn at `width`; with no width, the label alone. */
export const writtenImageAlt = (label: string, width: number | null) => (width === null ? label : `${label}|${Math.round(width)}`);

/** The ready size an image's width is, if it is one. */
export const sizeOfWidth = (width: number | null): ImageSize | null =>
  (Object.keys(IMAGE_SIZES) as ImageSize[]).find((size) => IMAGE_SIZES[size] === width) ?? null;
