import { describe, expect, it } from 'vitest';
import { FIT, kept, zoomedAt, type Place } from './photoZoom';

// a 375 by 500 photo in the middle of a 375 by 812 window
const place: Place = { cx: 187.5, cy: 406, width: 375, height: 500, left: 0, top: 0, right: 375, bottom: 812 };

describe('photo zoom', () => {
  it('keeps the point zoomed about under it', () => {
    const z = zoomedAt(FIT, 2, 100, 380, place);
    expect(z.scale).toBe(2);
    // the photo's point under (100, 380) before is there after
    expect(place.cx + z.x + (100 - place.cx) * 2).toBeCloseTo(100);
    expect(place.cy + z.y + (380 - place.cy) * 2).toBeCloseTo(380);
  });

  // across: up and down it is held in the middle until it is taller than the window
  it('comes to the same place in steps as at once', () => {
    let z = FIT;
    for (const scale of [1.5, 2, 2.5, 3]) z = zoomedAt(z, scale, 150, 400, place);
    const once = zoomedAt(FIT, 3, 150, 400, place);
    expect(z.x).toBeCloseTo(once.x);
  });

  it('is kept between fitting and the largest', () => {
    expect(zoomedAt(FIT, 0.5, 100, 100, place)).toEqual(FIT);
    expect(zoomedAt(FIT, 20, 187.5, 406, place).scale).toBe(5);
  });

  it('moves no further than its edges, and stays in the middle while it is not taller than the window', () => {
    const z = kept({ scale: 2, x: 1000, y: 1000 }, place);
    // 750 wide in 375: its left edge at the window's
    expect(place.cx + z.x - 750 / 2).toBeCloseTo(0);
    // 1000 tall in 812: its top edge at the window's
    expect(place.cy + z.y - 1000 / 2).toBeCloseTo(0);
    expect(kept({ scale: 1.5, x: 0, y: 300 }, place).y).toBe(0);
  });
});
