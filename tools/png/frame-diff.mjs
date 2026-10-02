// Frame-to-frame measures for decoded PNGs, on top of tools/png/read-png.mjs (part C): mean difference,
// share of changed pixels, the box of the changed pixels and a blur map by tiles. `src` is a path or an
// image from readPng; rectangles are { x, y, w, h } and are clipped to the image.
import { readPng } from './read-png.mjs';

const load = (src) => (typeof src === 'string' ? readPng(src) : src);

function region(img, rect) {
  const r = rect || { x: 0, y: 0, w: img.width, h: img.height };
  return {
    x0: Math.max(0, Math.floor(r.x)),
    y0: Math.max(0, Math.floor(r.y)),
    x1: Math.min(img.width, Math.floor(r.x + r.w)),
    y1: Math.min(img.height, Math.floor(r.y + r.h)),
  };
}

function pair(srcA, srcB) {
  const a = load(srcA);
  const b = load(srcB);
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`frame sizes differ: ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  }
  return [a, b];
}

const changed = (a, b, i, tol) => Math.abs(a.data[i] - b.data[i]) > tol
  || Math.abs(a.data[i + 1] - b.data[i + 1]) > tol || Math.abs(a.data[i + 2] - b.data[i + 2]) > tol;

// Mean absolute difference per RGB channel (0..255) over the rectangle.
export function meanAbsDiff(srcA, srcB, rect) {
  const [a, b] = pair(srcA, srcB);
  const r = region(a, rect);
  let sum = 0;
  let n = 0;
  for (let y = r.y0; y < r.y1; y += 1) {
    for (let x = r.x0; x < r.x1; x += 1) {
      const i = (y * a.width + x) * 4;
      sum += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
      n += 3;
    }
  }
  return n ? sum / n : 0;
}

// Share of pixels where any channel differs by more than tol.
export function diffFraction(srcA, srcB, rect, tol) {
  const [a, b] = pair(srcA, srcB);
  const r = region(a, rect);
  let count = 0;
  let n = 0;
  for (let y = r.y0; y < r.y1; y += 1) {
    for (let x = r.x0; x < r.x1; x += 1) {
      if (changed(a, b, (y * a.width + x) * 4, tol)) count += 1;
      n += 1;
    }
  }
  return n ? count / n : 0;
}

// Number and bounding box of the pixels that differ by more than tol; box null when none do.
export function diffBox(srcA, srcB, tol, rect) {
  const [a, b] = pair(srcA, srcB);
  const r = region(a, rect);
  let count = 0;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let y = r.y0; y < r.y1; y += 1) {
    for (let x = r.x0; x < r.x1; x += 1) {
      if (!changed(a, b, (y * a.width + x) * 4, tol)) continue;
      count += 1;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return { count, box: count ? { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null };
}

// Before/after tiles: 'B' changed (blurred), 'S' textured and unchanged (sharp), '.' otherwise. A tile is
// textured when at least edgeMin horizontal neighbours differ by more than edgeDelta in grey level in the
// "before" frame: a flat tile looks the same blurred or not.
export function tileMap(srcA, srcB, { cols = 8, rows = 8, edgeDelta = 20, edgeMin = 50, blurMin = 1.5, sharpMax = 0.5 } = {}) {
  const [a, b] = pair(srcA, srcB);
  const tw = Math.floor(a.width / cols);
  const th = Math.floor(a.height / rows);
  const grey = (x, y) => {
    const i = (y * a.width + x) * 4;
    return (a.data[i] + a.data[i + 1] + a.data[i + 2]) / 3;
  };
  const map = [];
  let blurred = 0;
  let sharp = 0;
  for (let ty = 0; ty < rows; ty += 1) {
    let line = '';
    for (let tx = 0; tx < cols; tx += 1) {
      const rect = { x: tx * tw, y: ty * th, w: tw, h: th };
      let edges = 0;
      for (let y = rect.y; y < rect.y + th; y += 1) {
        for (let x = rect.x; x < rect.x + tw - 1; x += 1) {
          if (Math.abs(grey(x + 1, y) - grey(x, y)) > edgeDelta) edges += 1;
        }
      }
      const d = meanAbsDiff(a, b, rect);
      if (d > blurMin) {
        line += 'B';
        blurred += 1;
      } else if (d < sharpMax && edges >= edgeMin) {
        line += 'S';
        sharp += 1;
      } else {
        line += '.';
      }
    }
    map.push(line);
  }
  return { map, blurred, sharp };
}
