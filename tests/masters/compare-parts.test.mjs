// Golden comparison by parts (tools/masters/compare.mjs): lines the pack placed by hand are registered one
// by one, gated on their look there and on how far they stand from the pack's place.
import { describe, expect, it } from 'vitest';
import { compareParts, overBackdrop, registerParts } from '../../tools/masters/compare.mjs';

// 200 x 60 grey frame with two dark bars (the "lines"); dx moves the first one.
function frame(dx = 0) {
  const w = 200;
  const h = 60;
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const bar = (y >= 12 && y < 24 && x >= 30 + dx && x < 90 + dx) || (y >= 38 && y < 50 && x >= 30 && x < 120);
      const i = (y * w + x) * 4;
      data.fill(bar ? 34 : 200, i, i + 3);
      data[i + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

const PARTS = [{ name: 'line1', x: 10, y: 6, w: 130, h: 24 }, { name: 'line2', x: 10, y: 32, w: 130, h: 24 }];

describe('golden comparison by parts', () => {
  it('finds how far each line stands from the pack and compares it there', () => {
    const placed = registerParts(frame(), frame(2), PARTS);
    expect(placed.map((p) => [p.name, p.shift])).toEqual([['line1', [2, 0]], ['line2', [0, 0]]]);
    const res = compareParts(frame(), frame(2), placed, { min: 0.98, maxShift: 4 });
    expect(res.map((r) => r.pass)).toEqual([true, true]);
    expect(Math.min(...res.map((r) => r.ssim))).toBeGreaterThan(0.999);
  });

  it('a line too far from its place fails even when it looks the same', () => {
    const placed = registerParts(frame(), frame(3), PARTS);
    const res = compareParts(frame(), frame(3), placed, { min: 0.98, maxShift: 2 });
    expect(res.map((r) => [r.name, r.pass])).toEqual([['line1', false], ['line2', true]]);
    expect(compareParts(frame(), frame(3), placed.map((p) => ({ ...p, maxShift: 3 })), { min: 0.98, maxShift: 2 })[0].pass).toBe(true);
  });
});

describe('a template over its companion', () => {
  it('lays the premultiplied frame over the opaque backdrop', () => {
    const px = (r, g, b, a) => ({ width: 1, height: 1, data: Buffer.from([r, g, b, a]) });
    // a half-covered green edge (premultiplied 19, 104, 62 at alpha 128) over the mint of the portal
    expect([...overBackdrop(px(19, 104, 62, 128), px(142, 231, 187, 255)).data]).toEqual([90, 219, 155, 255]);
    expect([...overBackdrop(px(0, 0, 0, 0), px(34, 34, 34, 255)).data]).toEqual([34, 34, 34, 255]);
    expect([...overBackdrop(px(255, 255, 255, 255), px(34, 34, 34, 255)).data]).toEqual([255, 255, 255, 255]);
    expect(() => overBackdrop(px(0, 0, 0, 0), { width: 2, height: 1, data: Buffer.alloc(8) })).toThrow(/backdrop 2x1/);
  });
});
