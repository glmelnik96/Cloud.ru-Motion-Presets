// SSIM (Wang, Bovik, Sheikh, Simoncelli 2004) for golden comparisons (spec §4.4 step 6, tokens qa.ssimMin).
// Frames are straight-alpha RGBA (pngjs, 0..255) composited over a backdrop, compared on BT.709 luma with
// a Gaussian 11x11 window (sigma 1.5), C1 = (0.01 L)^2, C2 = (0.03 L)^2, L = 255; borders are clamped.
// SSIM barely sees a uniform shift (255 vs 221 on a flat area gives 0.990), so colour is gated separately
// (deltaE) and the alpha channel is compared on its own.
import { readPng } from '../png/read-png.mjs';

const load = (src) => (typeof src === 'string' ? readPng(src) : src);
const C1 = (0.01 * 255) ** 2;
const C2 = (0.03 * 255) ** 2;

export function clipRect(img, rect) {
  const r = rect || { x: 0, y: 0, w: img.width, h: img.height };
  const x0 = Math.max(0, Math.floor(r.x));
  const y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(img.width, Math.floor(r.x + r.w));
  const y1 = Math.min(img.height, Math.floor(r.y + r.h));
  if (x1 <= x0 || y1 <= y0) throw new RangeError('empty comparison rectangle');
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// Luma (BT.709, gamma-encoded values as stored) of the rectangle composited over backdrop [r, g, b].
export function lumaOver(src, { rect, backdrop = [0, 0, 0] } = {}) {
  const img = load(src);
  const r = clipRect(img, rect);
  const out = new Float32Array(r.w * r.h);
  const d = img.data;
  for (let y = 0; y < r.h; y += 1) {
    for (let x = 0; x < r.w; x += 1) {
      const i = ((r.y + y) * img.width + (r.x + x)) * 4;
      const a = d[i + 3] / 255;
      const R = d[i] * a + backdrop[0] * (1 - a);
      const G = d[i + 1] * a + backdrop[1] * (1 - a);
      const B = d[i + 2] * a + backdrop[2] * (1 - a);
      out[y * r.w + x] = 0.2126 * R + 0.7152 * G + 0.0722 * B;
    }
  }
  return { luma: out, w: r.w, h: r.h, rect: r };
}

export function alphaPlane(src, rect) {
  const img = load(src);
  const r = clipRect(img, rect);
  const out = new Float32Array(r.w * r.h);
  for (let y = 0; y < r.h; y += 1) {
    for (let x = 0; x < r.w; x += 1) out[y * r.w + x] = img.data[((r.y + y) * img.width + (r.x + x)) * 4 + 3];
  }
  return { luma: out, w: r.w, h: r.h, rect: r };
}

export function gaussianKernel(size = 11, sigma = 1.5) {
  const k = new Float32Array(size);
  const c = (size - 1) / 2;
  let s = 0;
  for (let i = 0; i < size; i += 1) {
    k[i] = Math.exp(-((i - c) ** 2) / (2 * sigma * sigma));
    s += k[i];
  }
  for (let i = 0; i < size; i += 1) k[i] /= s;
  return k;
}

function blur(src, w, h, k) {
  const r = (k.length - 1) / 2;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const row = y * w;
    for (let x = 0; x < w; x += 1) {
      let s = 0;
      for (let i = 0; i < k.length; i += 1) {
        let xx = x + i - r;
        if (xx < 0) xx = 0; else if (xx >= w) xx = w - 1;
        s += k[i] * src[row + xx];
      }
      tmp[row + x] = s;
    }
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let s = 0;
      for (let i = 0; i < k.length; i += 1) {
        let yy = y + i - r;
        if (yy < 0) yy = 0; else if (yy >= h) yy = h - 1;
        s += k[i] * tmp[yy * w + x];
      }
      out[y * w + x] = s;
    }
  }
  return out;
}

// Per-pixel SSIM of two planes of equal size, its mean and the worst tiles. skip(x, y) excludes pixels
// (plane coordinates) from the mean, e.g. areas that differ by a known decision.
export function ssimPlanes(a, b, { tile = 64, worst = 5, skip = null } = {}) {
  if (a.w !== b.w || a.h !== b.h) throw new Error(`planes differ: ${a.w}x${a.h} vs ${b.w}x${b.h}`);
  const { w, h } = a;
  const n = w * h;
  const k = gaussianKernel();
  const aa = new Float32Array(n);
  const bb = new Float32Array(n);
  const ab = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    aa[i] = a.luma[i] * a.luma[i];
    bb[i] = b.luma[i] * b.luma[i];
    ab[i] = a.luma[i] * b.luma[i];
  }
  const mu1 = blur(a.luma, w, h, k);
  const mu2 = blur(b.luma, w, h, k);
  const s11 = blur(aa, w, h, k);
  const s22 = blur(bb, w, h, k);
  const s12 = blur(ab, w, h, k);
  const map = new Float32Array(n);
  let sum = 0;
  let counted = 0;
  for (let i = 0; i < n; i += 1) {
    const m1 = mu1[i];
    const m2 = mu2[i];
    const v1 = s11[i] - m1 * m1;
    const v2 = s22[i] - m2 * m2;
    const c12 = s12[i] - m1 * m2;
    map[i] = ((2 * m1 * m2 + C1) * (2 * c12 + C2)) / ((m1 * m1 + m2 * m2 + C1) * (v1 + v2 + C2));
    if (skip && skip(i % w, Math.floor(i / w))) {
      map[i] = 1;
      continue;
    }
    sum += map[i];
    counted += 1;
  }
  const tiles = [];
  for (let ty = 0; ty < h; ty += tile) {
    for (let tx = 0; tx < w; tx += tile) {
      const tw = Math.min(tile, w - tx);
      const th = Math.min(tile, h - ty);
      let s = 0;
      for (let y = ty; y < ty + th; y += 1) for (let x = tx; x < tx + tw; x += 1) s += map[y * w + x];
      tiles.push({ x: tx, y: ty, w: tw, h: th, ssim: s / (tw * th) });
    }
  }
  tiles.sort((p, q) => p.ssim - q.ssim);
  return { ssim: counted ? sum / counted : 1, map, worst: tiles.slice(0, worst), counted };
}

// Box of the content of either image, padded: pixels with alpha >= minAlpha that differ from the image's
// top-left pixel (the background of an opaque golden) by more than bgTol in some channel.
export function contentBox(srcA, srcB, { minAlpha = 8, pad = 16, bgTol = 6 } = {}) {
  const imgs = [load(srcA), load(srcB)];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const img of imgs) {
    const d = img.data;
    const bg = [d[0], d[1], d[2], d[3]];
    for (let y = 0; y < img.height; y += 1) {
      for (let x = 0; x < img.width; x += 1) {
        const i = (y * img.width + x) * 4;
        if (d[i + 3] < minAlpha) continue;
        const differs = Math.abs(d[i] - bg[0]) > bgTol || Math.abs(d[i + 1] - bg[1]) > bgTol ||
          Math.abs(d[i + 2] - bg[2]) > bgTol || Math.abs(d[i + 3] - bg[3]) > bgTol;
        if (!differs) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < x0) return null;
  const W = imgs[0].width;
  const H = imgs[0].height;
  const x = Math.max(0, x0 - pad);
  const y = Math.max(0, y0 - pad);
  return { x, y, w: Math.min(W, x1 + 1 + pad) - x, h: Math.min(H, y1 + 1 + pad) - y };
}

// SSIM of two RGBA frames over each backdrop (the minimum counts: a transparent golden hides colour
// differences over one of them) plus SSIM of the alpha channels.
// alpha: false for frames without a meaningful alpha (Premiere exports the sequence over black).
// masks: [{ x, y, w, h }] in frame coordinates, left out of every mean (a known, decided difference).
export function compareFrames(srcA, srcB, { rect, backdrops = [[0, 0, 0], [255, 255, 255]], alpha: withAlpha = true, masks = [] } = {}) {
  const a = load(srcA);
  const b = load(srcB);
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`frame sizes differ: ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  }
  const box = rect || contentBox(a, b) || { x: 0, y: 0, w: a.width, h: a.height };
  const skip = masks.length ? (x, y) => masks.some((m) => x + box.x >= m.x && x + box.x < m.x + m.w && y + box.y >= m.y && y + box.y < m.y + m.h) : null;
  const over = backdrops.map((bd) => {
    const r = ssimPlanes(lumaOver(a, { rect: box, backdrop: bd }), lumaOver(b, { rect: box, backdrop: bd }), { skip });
    return { backdrop: bd, ssim: r.ssim, worst: r.worst.map((t) => ({ ...t, x: t.x + box.x, y: t.y + box.y })) };
  });
  const alpha = withAlpha ? ssimPlanes(alphaPlane(a, box), alphaPlane(b, box), { skip }).ssim : 1;
  const minOver = over.reduce((m, o) => (o.ssim < m.ssim ? o : m), over[0]);
  return { rect: box, ssim: Math.min(minOver.ssim, alpha), luma: minOver.ssim, alpha, over };
}
