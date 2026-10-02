import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { meanAbsDiff, diffFraction, diffBox, tileMap } from '../../tools/png/frame-diff.mjs';

function canvas(w, h, [r, g, b] = [0, 0, 0]) {
  const img = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h * 4; i += 4) {
    img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
  }
  return img;
}

function fill(img, x, y, w, h, [r, g, b]) {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const i = (yy * img.width + xx) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b;
    }
  }
  return img;
}

describe('frame-diff', () => {
  it('measures the mean difference and the share of changed pixels', () => {
    const a = canvas(40, 40, [100, 100, 100]);
    const b = fill(canvas(40, 40, [100, 100, 100]), 0, 0, 20, 40, [130, 100, 100]);
    expect(meanAbsDiff(a, b, { x: 20, y: 0, w: 20, h: 40 })).toBe(0);
    expect(meanAbsDiff(a, b, { x: 0, y: 0, w: 20, h: 40 })).toBe(10);
    expect(diffFraction(a, b, null, 8)).toBe(0.5);
    expect(diffFraction(a, b, null, 30)).toBe(0);
  });

  it('boxes the changed pixels, inside a clipped rectangle', () => {
    const a = canvas(100, 60);
    const b = fill(canvas(100, 60), 10, 20, 30, 15, [200, 0, 0]);
    expect(diffBox(a, b, 12)).toEqual({ count: 450, box: { x0: 10, y0: 20, x1: 39, y1: 34, w: 30, h: 15 } });
    expect(diffBox(a, b, 12, { x: 25, y: 0, w: 500, h: 500 }).box).toEqual({ x0: 25, y0: 20, x1: 39, y1: 34, w: 15, h: 15 });
    expect(diffBox(a, a, 0)).toEqual({ count: 0, box: null });
  });

  it('refuses frames of different sizes', () => {
    expect(() => meanAbsDiff(canvas(4, 4), canvas(5, 4), null)).toThrow(/sizes differ/);
  });

  it('maps blurred, sharp and flat tiles', () => {
    const edges = () => fill(fill(canvas(80, 40), 10, 0, 10, 40, [255, 255, 255]), 50, 0, 10, 40, [255, 255, 255]);
    const t = tileMap(edges(), fill(edges(), 5, 0, 5, 40, [128, 128, 128]), { cols: 4, rows: 2, edgeMin: 10 });
    expect(t).toEqual({ map: ['B.S.', 'B.S.'], blurred: 2, sharp: 2 });
  });

  it('reads PNG files by path', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-fd-'));
    const fa = path.join(dir, 'a.png');
    const fb = path.join(dir, 'b.png');
    writeFileSync(fa, PNG.sync.write(canvas(4, 4)));
    writeFileSync(fb, PNG.sync.write(fill(canvas(4, 4), 1, 1, 2, 2, [255, 0, 255])));
    expect(diffBox(fa, fb, 0).count).toBe(4);
  });
});
