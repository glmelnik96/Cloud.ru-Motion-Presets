import { describe, expect, it } from 'vitest';
import { compareFrames, contentBox, gaussianKernel, lumaOver, ssimPlanes } from '../../tools/qa/ssim.mjs';

function image(w, h, fn) {
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const [r, g, b, a] = fn(x, y);
      const i = (y * w + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
    }
  }
  return { width: w, height: h, data };
}

const plate = (dx = 0) => image(64, 48, (x, y) => (x >= 16 + dx && x < 48 + dx && y >= 12 && y < 36 ? [255, 255, 255, 255] : [0, 0, 0, 0]));

describe('ssim', () => {
  it('builds a normalized Gaussian window', () => {
    const k = gaussianKernel(11, 1.5);
    expect(k.length).toBe(11);
    expect(k.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 6);
    expect(k[5]).toBeGreaterThan(k[4]);
  });

  it('gives 1 for identical frames', () => {
    const r = compareFrames(plate(), plate());
    expect(r.ssim).toBeCloseTo(1, 6);
    expect(r.alpha).toBeCloseTo(1, 6);
  });

  it('drops for a 2 px shift of an edge', () => {
    const r = compareFrames(plate(), plate(2));
    expect(r.ssim).toBeLessThan(0.98);
    expect(r.over[0].worst[0].ssim).toBeLessThanOrEqual(r.over[0].ssim + 1e-9);
  });

  it('composites straight alpha over the backdrop', () => {
    const half = image(4, 4, () => [255, 255, 255, 128]);
    const l = lumaOver(half, { backdrop: [0, 0, 0] });
    expect(l.luma[0]).toBeCloseTo(128, 0);
    const w = lumaOver(half, { backdrop: [255, 255, 255] });
    expect(w.luma[0]).toBeCloseTo(255, 0);
  });

  it('is weak against a uniform shift, which is why colour has its own gate', () => {
    const a = { luma: new Float32Array(400).fill(255), w: 20, h: 20 };
    const b = { luma: new Float32Array(400).fill(221), w: 20, h: 20 };
    expect(ssimPlanes(a, b).ssim).toBeGreaterThan(0.98);
  });

  it('finds the content box of either frame, padded', () => {
    expect(contentBox(plate(), plate(4), { pad: 2 })).toEqual({ x: 14, y: 10, w: 40, h: 28 });
    expect(contentBox(image(8, 8, () => [0, 0, 0, 0]), image(8, 8, () => [0, 0, 0, 0]))).toBeNull();
  });
});

describe('contentBox on an opaque background', () => {
  it('ignores the flat background of an opaque golden', () => {
    const opaque = image(40, 30, (x, y) => (x >= 10 && x < 20 && y >= 5 && y < 15 ? [255, 255, 255, 255] : [242, 242, 242, 255]));
    expect(contentBox(opaque, opaque, { pad: 0, bgTol: 6 })).toEqual({ x: 10, y: 5, w: 10, h: 10 });
  });
});

describe('masks', () => {
  it('leaves a decided difference out of the mean', () => {
    const a = image(64, 48, (x, y) => (x >= 16 && x < 48 && y >= 12 && y < 36 ? [255, 255, 255, 255] : [0, 0, 0, 255]));
    const b = image(64, 48, (x, y) => (x >= 18 && x < 48 && y >= 12 && y < 36 ? [255, 255, 255, 255] : [0, 0, 0, 255]));
    const rect = { x: 0, y: 0, w: 64, h: 48 };
    const open = compareFrames(a, b, { rect });
    const masked = compareFrames(a, b, { rect, masks: [{ x: 8, y: 0, w: 16, h: 48 }] });
    expect(open.ssim).toBeLessThan(0.98);
    expect(masked.ssim).toBeCloseTo(1, 3);
  });
});
