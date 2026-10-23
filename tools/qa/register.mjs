// Registration for golden comparisons where the pack's canvas sits at an arbitrary place: a golden of
// W x H (e.g. the Titles canvas 1500x500) is matched against a window of a bigger master frame. The window
// origin is searched around a predicted one (whole pixels, then tenths of a pixel), and the master is
// resampled there with bilinear interpolation on premultiplied RGBA.
import { readPng } from '../png/read-png.mjs';

const load = (src) => (typeof src === 'string' ? readPng(src) : src);

// The master window at fractional origin (ox, oy), same size as the golden: straight-alpha RGBA.
export function sampleWindow(src, ox, oy, w, h) {
  const img = load(src);
  const d = img.data;
  const out = Buffer.alloc(w * h * 4);
  const px = (x, y, c) => {
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) return 0;
    const i = (y * img.width + x) * 4;
    return c === 3 ? d[i + 3] : d[i + c] * d[i + 3] / 255;
  };
  for (let y = 0; y < h; y += 1) {
    const sy = oy + y;
    const y0 = Math.floor(sy);
    const fy = sy - y0;
    for (let x = 0; x < w; x += 1) {
      const sx = ox + x;
      const x0 = Math.floor(sx);
      const fx = sx - x0;
      const v = [0, 1, 2, 3].map((c) => (px(x0, y0, c) * (1 - fx) + px(x0 + 1, y0, c) * fx) * (1 - fy) +
        (px(x0, y0 + 1, c) * (1 - fx) + px(x0 + 1, y0 + 1, c) * fx) * fy);
      const o = (y * w + x) * 4;
      const a = v[3];
      out[o + 3] = Math.round(a);
      for (let c = 0; c < 3; c += 1) out[o + c] = a > 0 ? Math.min(255, Math.round(v[c] * 255 / a)) : 0;
    }
  }
  return { width: w, height: h, data: out };
}

// The image at w x h by area averaging (each output pixel is the mean of the source area it covers), on
// premultiplied RGBA: a golden of a pack drawn at another size than the master's variants (CRS_Cover: the
// courses pack's 2560x1440 against FHD).
export function scaleImage(src, w, h) {
  const img = load(src);
  const W = img.width;
  const H = img.height;
  const d = img.data;
  // per output index along an axis: the source indices it covers and their share
  const taps = (n, m) => Array.from({ length: m }, (_, o) => {
    const a = (o * n) / m;
    const b = ((o + 1) * n) / m;
    const list = [];
    for (let i = Math.floor(a); i < Math.min(n, Math.ceil(b)); i += 1) {
      const part = Math.min(b, i + 1) - Math.max(a, i);
      if (part > 1e-9) list.push([i, part / (b - a)]);
    }
    return list;
  });
  const tx = taps(W, w);
  const ty = taps(H, h);
  const pre = new Float64Array(W * H * 4);
  for (let i = 0; i < W * H; i += 1) {
    const a = d[i * 4 + 3];
    pre[i * 4 + 3] = a;
    for (let c = 0; c < 3; c += 1) pre[i * 4 + c] = d[i * 4 + c] * a / 255;
  }
  const mid = new Float64Array(w * H * 4);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const o = (y * w + x) * 4;
      for (const [i, share] of tx[x]) for (let c = 0; c < 4; c += 1) mid[o + c] += pre[(y * W + i) * 4 + c] * share;
    }
  }
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const v = [0, 0, 0, 0];
      for (const [j, share] of ty[y]) for (let c = 0; c < 4; c += 1) v[c] += mid[(j * w + x) * 4 + c] * share;
      const o = (y * w + x) * 4;
      out[o + 3] = Math.round(v[3]);
      for (let c = 0; c < 3; c += 1) out[o + c] = v[3] > 0 ? Math.min(255, Math.round(v[c] * 255 / v[3])) : 0;
    }
  }
  return { width: w, height: h, data: out };
}

// Mean absolute difference of luma-over-grey between the golden and a master window, on a grid of
// sample points (every `step` px) so the search stays fast on 4K frames.
function mad(golden, master, ox, oy, step) {
  const g = golden.data;
  const m = master.data;
  let s = 0;
  let n = 0;
  for (let y = 0; y < golden.height; y += step) {
    for (let x = 0; x < golden.width; x += step) {
      const mx = Math.round(ox + x);
      const my = Math.round(oy + y);
      if (mx < 0 || my < 0 || mx >= master.width || my >= master.height) continue;
      const i = (y * golden.width + x) * 4;
      const j = (my * master.width + mx) * 4;
      const lg = (0.2126 * g[i] + 0.7152 * g[i + 1] + 0.0722 * g[i + 2]) * g[i + 3] / 255 + 128 * (1 - g[i + 3] / 255);
      const lm = (0.2126 * m[j] + 0.7152 * m[j + 1] + 0.0722 * m[j + 2]) * m[j + 3] / 255 + 128 * (1 - m[j + 3] / 255);
      s += Math.abs(lg - lm);
      n += 1;
    }
  }
  return n ? s / n : Infinity;
}

function madWindow(golden, win) {
  let s = 0;
  const g = golden.data;
  const m = win.data;
  for (let i = 0; i < g.length; i += 4) {
    const lg = (0.2126 * g[i] + 0.7152 * g[i + 1] + 0.0722 * g[i + 2]) * g[i + 3] / 255 + 128 * (1 - g[i + 3] / 255);
    const lm = (0.2126 * m[i] + 0.7152 * m[i + 1] + 0.0722 * m[i + 2]) * m[i + 3] / 255 + 128 * (1 - m[i + 3] / 255);
    s += Math.abs(lg - lm);
  }
  return s / (g.length / 4);
}

// Best window origin near `offset` (whole pixels within `search`, then +-0.5 px in tenths) and the
// resampled master window there.
export function registerWindow(goldenSrc, masterSrc, { offset, search = 4, subpixel = true, step = 2 } = {}) {
  const golden = load(goldenSrc);
  const master = load(masterSrc);
  const [px, py] = offset;
  let best = { ox: Math.round(px), oy: Math.round(py), mad: Infinity };
  for (let dy = -search; dy <= search; dy += 1) {
    for (let dx = -search; dx <= search; dx += 1) {
      const ox = Math.round(px) + dx;
      const oy = Math.round(py) + dy;
      const v = mad(golden, master, ox, oy, step);
      if (v < best.mad) best = { ox, oy, mad: v };
    }
  }
  let win = sampleWindow(master, best.ox, best.oy, golden.width, golden.height);
  let fine = { ox: best.ox, oy: best.oy, mad: madWindow(golden, win) };
  if (subpixel) {
    for (const axis of ['ox', 'oy']) {
      for (let f = -5; f <= 5; f += 1) {
        if (f === 0) continue;
        const cand = { ...fine, [axis]: (axis === 'ox' ? best.ox : best.oy) + f / 10 };
        const w = sampleWindow(master, cand.ox, cand.oy, golden.width, golden.height);
        const v = madWindow(golden, w);
        if (v < fine.mad) {
          fine = { ...cand, mad: v };
          win = w;
        }
      }
    }
  }
  return { window: win, origin: [Math.round(fine.ox * 10) / 10, Math.round(fine.oy * 10) / 10], mad: fine.mad, coarse: [best.ox, best.oy] };
}
