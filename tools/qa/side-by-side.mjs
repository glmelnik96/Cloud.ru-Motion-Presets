// A viewing aid for golden comparisons: golden | master | difference (x4) of one rectangle, composited
// over a backdrop and scaled to a maximum width, written as PNG.
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { readPng } from '../png/read-png.mjs';
import { clipRect } from './ssim.mjs';

const load = (src) => (typeof src === 'string' ? readPng(src) : src);

function over(d, i, bd) {
  const a = d[i + 3] / 255;
  return [d[i] * a + bd[0] * (1 - a), d[i + 1] * a + bd[1] * (1 - a), d[i + 2] * a + bd[2] * (1 - a)];
}

export function sideBySide(srcA, srcB, file, { rect, backdrop = [128, 128, 128], maxWidth = 2400, gap = 8 } = {}) {
  const a = load(srcA);
  const b = load(srcB);
  const r = clipRect(a, rect);
  const scale = Math.min(1, maxWidth / (3 * r.w + 2 * gap));
  const pw = Math.max(1, Math.round(r.w * scale));
  const ph = Math.max(1, Math.round(r.h * scale));
  const W = 3 * pw + 2 * gap;
  const out = new PNG({ width: W, height: ph });
  out.data.fill(255);
  for (let y = 0; y < ph; y += 1) {
    const sy = r.y + Math.min(r.h - 1, Math.floor(y / scale));
    for (let x = 0; x < pw; x += 1) {
      const sx = r.x + Math.min(r.w - 1, Math.floor(x / scale));
      const i = (sy * a.width + sx) * 4;
      const ca = over(a.data, i, backdrop);
      const cb = over(b.data, i, backdrop);
      const diff = ca.map((v, c) => Math.min(255, Math.abs(v - cb[c]) * 4));
      const put = (px, col) => {
        const o = (y * W + px) * 4;
        out.data[o] = col[0]; out.data[o + 1] = col[1]; out.data[o + 2] = col[2]; out.data[o + 3] = 255;
      };
      put(x, ca);
      put(pw + gap + x, cb);
      put(2 * (pw + gap) + x, diff);
    }
  }
  writeFileSync(file, PNG.sync.write(out));
  return { file, width: W, height: ph, scale };
}
