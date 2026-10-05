import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import {
  readPng, pixelAt, meanColor, findColorCentroid, findSolidPatch, isCompletePng, waitForPng,
} from '../../tools/png/read-png.mjs';

const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-png-'));

function makePng(file, w, h, paint) {
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const [r, g, b, a] = paint(x, y);
      png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = a;
    }
  }
  writeFileSync(file, PNG.sync.write(png));
  return file;
}

// 400x200 frame on opaque black:
// - a 40x40 magenta square centred at (150, 100), like PROBE_SQ in the fixture;
// - a 20x10 brand-green patch at x 300..319, y 20..29;
// - a 10x10 near-magenta square (250, 4, 251) at x 20..29, y 160..169;
// - a 10x10 fully transparent magenta square at x 360..369, y 160..169.
const frame = path.join(dir, 'frame.png');
beforeAll(() => {
  makePng(frame, 400, 200, (x, y) => {
    if (x >= 130 && x < 170 && y >= 80 && y < 120) return [255, 0, 255, 255];
    if (x >= 300 && x < 320 && y >= 20 && y < 30) return [38, 208, 124, 255];
    if (x >= 20 && x < 30 && y >= 160 && y < 170) return [250, 4, 251, 255];
    if (x >= 360 && x < 370 && y >= 160 && y < 170) return [255, 0, 255, 0];
    return [0, 0, 0, 255];
  });
});

describe('pixelAt', () => {
  it('reads RGBA at integer coordinates', () => {
    expect(pixelAt(frame, 150, 100)).toEqual({ r: 255, g: 0, b: 255, a: 255 });
    expect(pixelAt(frame, 0, 0)).toEqual({ r: 0, g: 0, b: 0, a: 255 });
  });
  it('throws outside the image or on fractional coordinates', () => {
    expect(() => pixelAt(frame, 400, 0)).toThrow(RangeError);
    expect(() => pixelAt(frame, -1, 0)).toThrow(RangeError);
    expect(() => pixelAt(frame, 1.5, 0)).toThrow(RangeError);
  });
  it('accepts an already decoded image', () => {
    const img = readPng(frame);
    expect(img.width).toBe(400);
    expect(img.height).toBe(200);
    expect(pixelAt(img, 305, 25)).toEqual({ r: 38, g: 208, b: 124, a: 255 });
  });
});

describe('meanColor', () => {
  it('averages a uniform region exactly', () => {
    expect(meanColor(frame, { x: 300, y: 20, w: 20, h: 10 })).toEqual({ r: 38, g: 208, b: 124, a: 255, n: 200 });
  });
  it('averages a mixed region', () => {
    // 10 columns of green (x 300..309) and 10 columns of black (x 290..299)
    const m = meanColor(frame, { x: 290, y: 20, w: 20, h: 10 });
    expect(m.r).toBeCloseTo(19, 10);
    expect(m.g).toBeCloseTo(104, 10);
    expect(m.b).toBeCloseTo(62, 10);
    expect(m.n).toBe(200);
  });
  it('throws when the region leaves the image (e.g. a half-resolution frame)', () => {
    expect(() => meanColor(frame, { x: 390, y: 0, w: 20, h: 10 })).toThrow(RangeError);
    expect(() => meanColor(frame, { x: 0, y: 0, w: 0, h: 10 })).toThrow(RangeError);
  });
});

describe('findColorCentroid', () => {
  it('finds the centre, pixel count and box of a solid square', () => {
    expect(findColorCentroid(frame, '#FF00FF', 0)).toEqual({
      x: 150, y: 100, count: 1600,
      box: { x0: 130, y0: 80, x1: 169, y1: 119, w: 40, h: 40 },
    });
  });
  it('matches near colours only within the tolerance (max channel difference)', () => {
    expect(findColorCentroid(frame, '#FA04FB', 0).count).toBe(100);
    expect(findColorCentroid(frame, '#FF00FF', 4).count).toBe(1600);
    const both = findColorCentroid(frame, '#FF00FF', 5);
    expect(both.count).toBe(1700);
  });
  it('ignores transparent pixels unless minAlpha says otherwise', () => {
    expect(findColorCentroid(frame, '#FF00FF', 0, { minAlpha: 0 }).count).toBe(1700);
  });
  it('reports an absent colour as count 0', () => {
    expect(findColorCentroid(frame, '#0063FF', 3)).toEqual({ x: null, y: null, count: 0, box: null });
  });
  it('searches only inside a region when one is given', () => {
    const left = findColorCentroid(frame, '#FF00FF', 0, { region: { x: 100, y: 50, w: 50, h: 100 } });
    expect(left.count).toBe(800);
    expect(left.box).toEqual({ x0: 130, y0: 80, x1: 149, y1: 119, w: 20, h: 40 });
    expect(() => findColorCentroid(frame, '#FF00FF', 0, { region: { x: 390, y: 0, w: 20, h: 10 } })).toThrow(RangeError);
  });
});

describe('findSolidPatch', () => {
  it('takes the square at the centroid of a solid shape', () => {
    expect(findSolidPatch(frame, '#FF00FF', 0, 12)).toEqual({ x: 144, y: 94, w: 12, h: 12 });
  });
  it('returns null when no square of that size fits inside the colour', () => {
    expect(findSolidPatch(frame, '#26D07C', 0, 12)).toBeNull();
    expect(findSolidPatch(frame, '#26D07C', 0, 10)).toEqual({ x: 305, y: 20, w: 10, h: 10 });
    expect(findSolidPatch(frame, '#0063FF', 3, 12)).toBeNull();
  });
  it('steps off the hole of a hollow shape, whose centroid is in the hole', () => {
    // 100x100 black, a 60x60 magenta square at 20..79 with a 20x20 black hole at 40..59
    const ring = makePng(path.join(dir, 'ring.png'), 100, 100, (x, y) => {
      const inSquare = x >= 20 && x < 80 && y >= 20 && y < 80;
      const inHole = x >= 40 && x < 60 && y >= 40 && y < 60;
      return inSquare && !inHole ? [255, 0, 255, 255] : [0, 0, 0, 255];
    });
    expect(findColorCentroid(ring, '#FF00FF', 0)).toMatchObject({ x: 50, y: 50 });
    const p = findSolidPatch(ring, '#FF00FF', 0, 12);
    expect(meanColor(ring, p)).toMatchObject({ r: 255, g: 0, b: 255 });
    expect(Math.hypot(p.x + 6 - 50, p.y + 6 - 50)).toBe(16);
  });
});

describe('PNG completeness', () => {
  it('recognises a complete file and rejects a truncated or missing one', () => {
    const cut = path.join(dir, 'cut.png');
    const buf = readFileSync(frame);
    writeFileSync(cut, buf.subarray(0, buf.length - 20));
    expect(isCompletePng(frame)).toBe(true);
    expect(isCompletePng(cut)).toBe(false);
    expect(isCompletePng(path.join(dir, 'missing.png'))).toBe(false);
  });
  it('waits for a file that appears later', async () => {
    const late = path.join(dir, 'late.png');
    setTimeout(() => writeFileSync(late, readFileSync(frame)), 300);
    const r = await waitForPng(late, { timeoutMs: 5000, intervalMs: 50 });
    expect(r.size).toBe(readFileSync(frame).length);
  });
  it('times out on a file that never completes', async () => {
    const cut = path.join(dir, 'never.png');
    const buf = readFileSync(frame);
    writeFileSync(cut, buf.subarray(0, buf.length - 20));
    await expect(waitForPng(cut, { timeoutMs: 400, intervalMs: 50 })).rejects.toThrow(/PNG_TIMEOUT/);
  });
});
