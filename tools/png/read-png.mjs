// Read rendered frames (AE saveFrameToPng, Premiere exportFramePNG) and measure them.
// pngjs decodes every PNG to 8-bit RGBA (16-bit files are rescaled), so values are 0..255.
// `src` is a file path or an image already returned by readPng (to measure one frame many times).
import { readFileSync, openSync, readSync, closeSync, fstatSync, statSync } from 'node:fs';
import { PNG } from 'pngjs';
import { hexToRgb } from '../color/deltae.mjs';
import { sleep } from '../spike/wait-file.mjs';

export function readPng(file) {
  return PNG.sync.read(readFileSync(file));
}

const load = (src) => (typeof src === 'string' ? readPng(src) : src);

function assertInside(img, x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= img.width || y >= img.height) {
    throw new RangeError(`pixel (${x}, ${y}) is outside the ${img.width}x${img.height} image`);
  }
}

export function pixelAt(src, x, y) {
  const img = load(src);
  assertInside(img, x, y);
  const i = (y * img.width + x) * 4;
  const d = img.data;
  return { r: d[i], g: d[i + 1], b: d[i + 2], a: d[i + 3] };
}

// Mean RGBA over a rectangle; n = number of pixels. Throws if the rectangle leaves the image,
// which is how a frame saved at a lower resolution than expected shows up (ae-quirks #27, #34).
export function meanColor(src, { x, y, w, h }) {
  const img = load(src);
  if (!(w > 0 && h > 0)) throw new RangeError(`empty region ${w}x${h}`);
  assertInside(img, x, y);
  assertInside(img, x + w - 1, y + h - 1);
  let r = 0, g = 0, b = 0, a = 0;
  const d = img.data;
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const i = (yy * img.width + xx) * 4;
      r += d[i]; g += d[i + 1]; b += d[i + 2]; a += d[i + 3];
    }
  }
  const n = w * h;
  return { r: r / n, g: g / n, b: b / n, a: a / n, n };
}

// Centre (pixel-centre convention: pixel i covers [i, i+1)), count and bounding box of the pixels
// within `tolerance` (max channel difference) of `hex` and with alpha >= minAlpha.
// `region` ({x, y, w, h}) limits the search; by default the whole image is searched.
export function findColorCentroid(src, hex, tolerance = 0, { minAlpha = 128, region = null } = {}) {
  const img = load(src);
  const t = hexToRgb(hex);
  const d = img.data;
  const r = region || { x: 0, y: 0, w: img.width, h: img.height };
  if (!(r.w > 0 && r.h > 0)) throw new RangeError(`empty region ${r.w}x${r.h}`);
  assertInside(img, r.x, r.y);
  assertInside(img, r.x + r.w - 1, r.y + r.h - 1);
  let sx = 0, sy = 0, count = 0;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let y = r.y; y < r.y + r.h; y += 1) {
    for (let x = r.x; x < r.x + r.w; x += 1) {
      const i = (y * img.width + x) * 4;
      if (d[i + 3] < minAlpha) continue;
      const diff = Math.max(Math.abs(d[i] - t.r), Math.abs(d[i + 1] - t.g), Math.abs(d[i + 2] - t.b));
      if (diff > tolerance) continue;
      sx += x + 0.5; sy += y + 0.5; count += 1;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (!count) return { x: null, y: null, count: 0, box: null };
  return {
    x: sx / count, y: sy / count, count,
    box: { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 },
  };
}

// A size x size square ({x, y, w, h}) whose every pixel is within `tolerance` of `hex`, the one whose centre
// lies nearest the centroid of the colour; null if the colour has no such square. A colour measurement
// belongs inside the colour: the centroid of a hollow shape (the logo cube with its gaps) or an edge in
// motion measures anti-aliasing instead.
export function findSolidPatch(src, hex, tolerance, size, { minAlpha = 128 } = {}) {
  const img = load(src);
  const c = findColorCentroid(img, hex, tolerance, { minAlpha });
  if (!c.count || c.box.w < size || c.box.h < size) return null;
  const t = hexToRgb(hex);
  const d = img.data;
  const { x0, y0, w, h } = c.box;
  // summed-area table of matching pixels over the box: any square is counted in O(1)
  const sat = new Int32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y += 1) {
    let row = 0;
    for (let x = 0; x < w; x += 1) {
      const i = ((y0 + y) * img.width + x0 + x) * 4;
      const hit = d[i + 3] >= minAlpha
        && Math.max(Math.abs(d[i] - t.r), Math.abs(d[i + 1] - t.g), Math.abs(d[i + 2] - t.b)) <= tolerance;
      row += hit ? 1 : 0;
      sat[(y + 1) * (w + 1) + x + 1] = sat[y * (w + 1) + x + 1] + row;
    }
  }
  const at = (x, y) => sat[y * (w + 1) + x];
  let best = null, bestD = Infinity;
  for (let y = 0; y + size <= h; y += 1) {
    for (let x = 0; x + size <= w; x += 1) {
      if (at(x + size, y + size) - at(x, y + size) - at(x + size, y) + at(x, y) !== size * size) continue;
      const dist = Math.hypot(x0 + x + size / 2 - c.x, y0 + y + size / 2 - c.y);
      if (dist < bestD) { bestD = dist; best = { x: x0 + x, y: y0 + y, w: size, h: size }; }
    }
  }
  return best;
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// Zero-length IEND chunk: length 0, type "IEND", CRC AE 42 60 82.
const IEND = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

// True when the file starts with the PNG signature and ends with the IEND chunk.
export function isCompletePng(file) {
  let fd;
  try {
    fd = openSync(file, 'r');
    const size = fstatSync(fd).size;
    if (size < SIGNATURE.length + IEND.length) return false;
    const head = Buffer.alloc(SIGNATURE.length);
    const tail = Buffer.alloc(IEND.length);
    readSync(fd, head, 0, head.length, 0);
    readSync(fd, tail, 0, tail.length, size - tail.length);
    return head.equals(SIGNATURE) && tail.equals(IEND);
  } catch {
    return false;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

// saveFrameToPng returns before the file is written (ae-quirks #27, #40, #50, #99): wait until the
// file is a complete PNG and its size is the same on two consecutive polls.
// Generic file waits (stable size, new files in a folder) live in tools/spike/wait-file.mjs.
export async function waitForPng(file, { timeoutMs = 60000, intervalMs = 250 } = {}) {
  const t0 = Date.now();
  let last = -1;
  for (;;) {
    let size = -1;
    try { size = statSync(file).size; } catch { size = -1; }
    if (size > 0 && size === last && isCompletePng(file)) {
      return { file, size, waitedMs: Date.now() - t0 };
    }
    last = size;
    if (Date.now() - t0 > timeoutMs) {
      throw new Error(`PNG_TIMEOUT: ${file} is not a complete PNG after ${timeoutMs} ms (size ${size})`);
    }
    await sleep(intervalMs);
  }
}
