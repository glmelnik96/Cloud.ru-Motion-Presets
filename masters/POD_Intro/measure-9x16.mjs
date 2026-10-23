#!/usr/bin/env node
// The vertical podcast intro has no comp in the pack, only its render (D12: rebuilt 1080×1920 by the render). The render
// is the 16:9 comp re-laid out — the same layers and keys, moved, turned and scaled — so this measures it against the
// 16:9 render and the 16:9 comp and writes masters/POD_Intro/layout-9x16.json, from which resolve.mjs makes the
// vertical copy of the comp:
//   - the title group, the numbered circles, the globe, the logo: a scale and a place each (the last frame);
//   - the hatches: turned -90°, placed by the phase of their lines, windowed by the lines they show over time;
//   - the arrows: which 16:9 arrow, turned, each one is, its time shift and travel (followed frame by frame);
//   - the contour of the frame: its corners on the last frame, the shape it contracts from on the first frames.
//   node masters/POD_Intro/measure-9x16.mjs
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng } from '../../tools/png/read-png.mjs';
import { layerProp, readJson } from '../../tools/dump/model.mjs';
import { workPath } from '../../tools/lib/work.mjs';
import { easedProgress } from '../../tools/masters/dump-keys.mjs';
import { shapeBoxAt } from '../../tools/masters/dump-geometry.mjs';
import { ffmpeg } from '../../tools/masters/preview.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const RENDERS = {
  tall: 'C:/CRBK/archive/2026-10-02/6_Podcast_Cloud.ru_Pack/Ready mov/Заставка_ПОДКАСТ_CLOUD.RU_9x16.mov',
  wide: 'C:/CRBK/archive/2026-10-02/6_Podcast_Cloud.ru_Pack/Ready mov/Заставка_ПОДКАСТ_CLOUD.RU.mov',
};
const FPS = 25;
const LAST = 174;   // the last frame (6.96 s)
const r3 = (v) => Math.round(v * 1000) / 1000;

// ---- frames and pixel classes ----

export function frames(which) {
  const dir = workPath('measure', 'POD_Intro', which);
  if (!existsSync(dir) || readdirSync(dir).length < 175) {
    mkdirSync(dir, { recursive: true });
    ffmpeg(['-i', RENDERS[which], '-pix_fmt', 'rgba', path.posix.join(dir, 'f%03d.png')], `${which} frames`);
  }
  const cache = new Map();
  return (f) => {
    if (!cache.has(f)) {
      if (cache.size > 80) cache.delete(cache.keys().next().value);
      cache.set(f, readPng(path.posix.join(dir, `f${String(f + 1).padStart(3, '0')}.png`)));
    }
    return cache.get(f);
  };
}

export const CLASS = {
  dark: (d, i) => d[i + 3] > 200 && d[i] < 110 && d[i + 1] < 110 && d[i + 2] < 110,
  white: (d, i) => d[i + 3] > 200 && d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240,
  green: (d, i) => d[i + 3] > 128 && d[i + 1] > d[i] + 60 && d[i + 1] > d[i + 2] + 30,
  // before 1 s the elements are white on transparent: whatever is there
  shown: (d, i) => d[i + 3] > 100,
};

// Connected components (8-neighbour) of a pixel class inside a rectangle: bbox, area, centre.
export function components(img, test, { x0 = 0, y0 = 0, x1 = img.width - 1, y1 = img.height - 1, min = 30 } = {}) {
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const out = [];
  const on = (x, y) => test(img.data, ((y + y0) * img.width + x + x0) * 4);
  for (let p = 0; p < w * h; p += 1) {
    if (seen[p]) continue;
    seen[p] = 1;
    const px = p % w;
    const py = (p - px) / w;
    if (!on(px, py)) continue;
    let sp = 0;
    stack[sp++] = p;
    let n = 0, ax = px, ay = py, bx = px, by = py, sx = 0, sy = 0;
    while (sp) {
      const q = stack[--sp];
      const x = q % w;
      const y = (q - x) / w;
      n += 1; sx += x; sy += y;
      if (x < ax) ax = x; if (x > bx) bx = x; if (y < ay) ay = y; if (y > by) by = y;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const nq = ny * w + nx;
          if (seen[nq]) continue;
          if (!on(nx, ny)) continue;
          seen[nq] = 1;
          stack[sp++] = nq;
        }
      }
    }
    if (n >= min) out.push({ x0: ax + x0, y0: ay + y0, x1: bx + x0, y1: by + y0, n, cx: sx / n + x0, cy: sy / n + y0 });
  }
  return out;
}

const centre = (b) => [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
const union = (list) => ({ x0: Math.min(...list.map((b) => b.x0)), y0: Math.min(...list.map((b) => b.y0)), x1: Math.max(...list.map((b) => b.x1)), y1: Math.max(...list.map((b) => b.y1)) });
const inside = (b, [x0, y0, x1, y1]) => b.x0 >= x0 && b.y0 >= y0 && b.x1 <= x1 && b.y1 <= y1;
const one = (list, what) => {
  if (list.length !== 1) throw new Error(`${what}: ${list.length} candidates`);
  return list[0];
};

// ---- the 16:9 comp ----

export function loadComp(dumps = 'C:/CRBK/work/dumps') {
  return readJson(path.join(dumps, 'podcast', 'zastavka_podkast_cloud_ru.json'));
}

// Where a child of the «scale» null (300 %, at the frame's middle) puts its anchor at rest, in 4K px of the 16:9 frame.
export function anchorAt(dump, name, t = LAST / FPS) {
  const L = dump.layers.find((l) => l.name === name);
  if (!L) throw new Error(`no layer ${name}`);
  const pos = layerProp(L, 'ADBE Transform Group', 'ADBE Position');
  const v = pos.keys && pos.keys.length ? pos.keys[pos.keys.length - 1].value : pos.value;
  if (pos.keys && pos.keys.length && pos.keys[pos.keys.length - 1].time > t) throw new Error(`${name}: still moving at ${t}`);
  if (L.parent === null) return [v[0], v[1]];
  const nul = dump.layers.find((l) => l.index === L.parent);
  const np = layerProp(nul, 'ADBE Transform Group', 'ADBE Position').value;
  const na = layerProp(nul, 'ADBE Transform Group', 'ADBE Anchor Point').value;
  const ns = layerProp(nul, 'ADBE Transform Group', 'ADBE Scale').value[0] / 100;
  return [np[0] + ns * (v[0] - na[0]), np[1] + ns * (v[1] - na[1])];
}

// A similarity (scale s, shift t; no turn) that maps the boxes of a: [x0, y0, x1, y1] onto those of b, least squares.
export function fitScale(as, bs) {
  const xs = as.flatMap((a, i) => [[a.x0, bs[i].x0], [a.x1, bs[i].x1]]);
  const ys = as.flatMap((a, i) => [[a.y0, bs[i].y0], [a.y1, bs[i].y1]]);
  // minimise sum (s x + tx - X)^2 + (s y + ty - Y)^2: tx, ty by their means, s by the centred products
  const mean = (l, k) => l.reduce((s, p) => s + p[k], 0) / l.length;
  const [mx, mX, my, mY] = [mean(xs, 0), mean(xs, 1), mean(ys, 0), mean(ys, 1)];
  let num = 0, den = 0;
  for (const [x, X] of xs) { num += (x - mx) * (X - mX); den += (x - mx) ** 2; }
  for (const [y, Y] of ys) { num += (y - my) * (Y - mY); den += (y - my) ** 2; }
  const s = num / den;
  const t = [mX - s * mx, mY - s * my];
  const res = Math.max(...xs.map(([x, X]) => Math.abs(s * x + t[0] - X)), ...ys.map(([y, Y]) => Math.abs(s * y + t[1] - Y)));
  return { s, t, residual: res };
}

// ---- the static elements ----

export function staticLayout(wide, tall) {
  const W = wide(LAST);
  const T = tall(LAST);
  // the title: the two green plates (the largest green components)
  const plates = (img) => components(img, CLASS.green, { min: 50000 }).sort((a, b) => b.n - a.n).slice(0, 2).sort((a, b) => a.y0 - b.y0);
  const pw = plates(W);
  const pt = plates(T);
  if (pw.length !== 2 || pt.length !== 2) throw new Error('title: not two plates');
  const title = fitScale(pw, pt);
  // the numbered circles: white rings with a figure inside
  const rings = (img, boxes) => boxes.map((b, i) => one(components(img, CLASS.white, { x0: b[0], y0: b[1], x1: b[2], y1: b[3], min: 1200 }), `circle ${i + 1}`));
  const cw = rings(W, [[200, 150, 450, 350], [3350, 1500, 3600, 1750]]);
  const ct = rings(T, [[1800, 1650, 2000, 1850], [1800, 3450, 2000, 3650]]);
  const cs = (cw.map((b, i) => (ct[i].x1 - ct[i].x0 + ct[i].y1 - ct[i].y0 + 2) / (b.x1 - b.x0 + b.y1 - b.y0 + 2)).reduce((a, b) => a + b) / 2);
  // the globe: the four white squares and the ellipse
  const globe = (img, box) => union(components(img, CLASS.white, { x0: box[0], y0: box[1], x1: box[2], y1: box[3], min: 1000 }));
  const gw = globe(W, [2400, 80, 3000, 360]);
  const gt = globe(T, [700, 950, 1450, 1350]);
  // the logo's cube: green parts left of the wordmark
  const cube = (img, box) => union(components(img, CLASS.green, { x0: box[0], y0: box[1], x1: box[2], y1: box[3], min: 300 }));
  const lw = cube(W, [150, 1850, 300, 2000]);
  const lt = cube(T, [1280, 250, 1420, 400]);
  return { title, plates: { wide: pw, tall: pt }, circles: { scale: cs, wide: cw, tall: ct }, globe: { wide: gw, tall: gt }, cube: { wide: lw, tall: lt } };
}


// The pack's logo layer in the vertical frame: the same 711×132 logo comp at a new scale (the cube's width against the
// 16:9 one, rounded to a whole per cent: 70 against 62) placed so its cube lands where the render shows it.
export function logoLayout(dump, cube) {
  const L = dump.layers.find((l) => l.name === 'Cloud.ru_BlackColour');
  const tr = (mn) => layerProp(L, 'ADBE Transform Group', mn).value;
  const [pos, anchor, s16] = [tr('ADBE Position'), tr('ADBE Anchor Point'), tr('ADBE Scale')[0] / 100];
  const c16 = centre(cube.wide);
  const c9 = centre(cube.tall);
  const s9 = Math.round(100 * s16 * ((cube.tall.x1 - cube.tall.x0 + 1) / (cube.wide.x1 - cube.wide.x0 + 1))) / 100;
  const local = [(c16[0] - pos[0]) / s16 + anchor[0], (c16[1] - pos[1]) / s16 + anchor[1]];
  return { scale: Math.round(s9 * 100), position: [c9[0] - s9 * (local[0] - anchor[0]), c9[1] - s9 * (local[1] - anchor[1])], wide: { scale: s16 * 100, position: [pos[0], pos[1]] } };
}

// ---- the hatches ----

// Dark runs along a column (vertical) or a row of a frame.
function runs(img, fixed, from, to, vertical) {
  const out = [];
  let r = null;
  for (let v = from; v <= to; v += 1) {
    const i = ((vertical ? v : fixed) * img.width + (vertical ? fixed : v)) * 4;
    const on = CLASS.dark(img.data, i);
    if (on && !r) r = [v, v];
    else if (on) r[1] = v;
    else if (r) { out.push(r); r = null; }
  }
  if (r) out.push(r);
  return out;
}

// Where a dark line's end really is: its first full pixel less the coverage of the one before it (on the #D3D3D3 card).
function edgeAt(img, x, y, step) {
  const lum = (xx, yy) => img.data[(yy * img.width + xx) * 4];
  const full = (v) => (211 - v) / (211 - 34);
  return step[0] ? x - step[0] * full(lum(x - step[0], y)) : y - step[1] * full(lum(x, y - step[1]));
}

// The two hatch comps, each turned -90° in the vertical frame: where its anchor lands (the lines' phase pins the
// along-axis, their ends the cross-axis) and, for the top one, the window its new mask cuts.
export function hatchLayout(wide, tall, dump) {
  const groups = [
    // the 16:9 scan (a row across its lines), the vertical scan (a column across them), the phase to start pairing from
    { name: 'LINES 2 Comp 1', wideRow: 1832, wideX: [1700, 3700], tallCol: 327, tallY: [120, 1580], guess: 2810 },
    { name: 'LINES Comp 1', wideRow: 1691, wideX: [120, 900], tallCol: 400, tallY: [2900, 3800], guess: 3839 },
  ];
  const out = {};
  for (const g of groups) {
    const Ks = [];
    for (let f = 30; f <= LAST; f += 4) {
      const xs = runs(wide(f), g.wideRow, g.wideX[0], g.wideX[1], false).filter((r) => r[1] - r[0] >= 5).map((r) => (r[0] + r[1]) / 2);
      for (const r of runs(tall(f), g.tallCol, g.tallY[0], g.tallY[1], true).filter((q) => q[1] - q[0] >= 5)) {
        const y = (r[0] + r[1]) / 2;
        const x = xs.reduce((b, X) => (Math.abs(X - (g.guess - y)) < Math.abs(b - (g.guess - y)) ? X : b), -1e9);
        if (Math.abs(x - (g.guess - y)) < 20) Ks.push(x + y);
      }
    }
    const K = Ks.reduce((a, b) => a + b, 0) / Ks.length;
    if (Ks.some((k) => Math.abs(k - K) > 0.01)) throw new Error(`${g.name}: the lines' phase is not constant`);
    // a run [a, b] of a 6 px line centred on c covers [c - 3, c + 3): its midpoint is c - 0.5, so the true sum is K + 1
    const P16 = anchorAt(dump, g.name);
    const along = K + 1 - P16[0];
    // the line's own end: in 16:9 its top (a column through a line), in the vertical frame its left end (a row
    // through the same line); the turn maps one onto the other
    const W = wide(LAST);
    const T = tall(LAST);
    const xLine = runs(W, g.wideRow, g.wideX[0], g.wideX[1], false).find((r) => r[1] - r[0] >= 5);
    const col = Math.round((xLine[0] + xLine[1]) / 2);
    const top16 = runs(W, col, 1500, 2100, true).find((r) => r[1] - r[0] > 100)[0];
    const yLine = g.guess - (xLine[0] + xLine[1]) / 2;
    const yRun = runs(T, g.tallCol, Math.round(yLine) - 6, Math.round(yLine) + 6, true)[0];
    const row = Math.round((yRun[0] + yRun[1]) / 2);
    const left9 = runs(T, row, 150, 700, false).find((r) => r[1] - r[0] > 100)[0];
    const cross = edgeAt(T, left9, row, [1, 0]) - edgeAt(W, col, top16, [0, 1]) + P16[1];
    out[g.name] = { anchor9: [cross, along], rotation: -90, phase: K + 1, samples: Ks.length };
  }
  // the top window: lines come in under its top edge and leave over its bottom edge
  let top = Infinity;
  let bottom = -Infinity;
  for (let f = 40; f <= LAST; f += 1) {
    const T = tall(f);
    const rs = runs(T, 260, 115, 1610, true);
    if (!rs.length) continue;
    if (rs[0][1] - rs[0][0] < 5) top = Math.min(top, edgeAt(T, 260, rs[0][0], [0, 1]));
    const last = rs[rs.length - 1];
    if (last[1] - last[0] < 5) bottom = Math.max(bottom, last[1] + 1);
  }
  out['LINES 2 Comp 1'].window = [top, bottom];
  return out;
}

// ---- the contour of the frame ----

function contourMask(img, test, comp) {
  const w = comp.x1 - comp.x0 + 3;
  const h = comp.y1 - comp.y0 + 3;
  const mask = new Uint8Array(w * h);
  const seen = new Uint8Array(w * h);
  const at = (x, y) => test(img.data, ((y + comp.y0 - 1) * img.width + x + comp.x0 - 1) * 4);
  let seed = null;
  for (let y = 1; y < h - 1 && !seed; y += 1) for (let x = 1; x < w - 1; x += 1) if (at(x, y)) { seed = [x, y]; break; }
  const st = [seed];
  seen[seed[1] * w + seed[0]] = 1;
  while (st.length) {
    const [x, y] = st.pop();
    mask[y * w + x] = 1;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
        const q = ny * w + nx;
        if (seen[q]) continue;
        seen[q] = 1;
        if (at(nx, ny)) st.push([nx, ny]);
      }
    }
  }
  return { mask, w, h, ox: comp.x0 - 1, oy: comp.y0 - 1 };
}

// Zhang–Suen thinning to a one-pixel skeleton.
function thin({ mask, w, h }) {
  const m = mask.slice();
  const P = (x, y) => m[y * w + x];
  let changed = true;
  while (changed) {
    changed = false;
    for (const step of [0, 1]) {
      const del = [];
      for (let y = 1; y < h - 1; y += 1) {
        for (let x = 1; x < w - 1; x += 1) {
          if (!P(x, y)) continue;
          const n = [P(x, y - 1), P(x + 1, y - 1), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1), P(x - 1, y + 1), P(x - 1, y), P(x - 1, y - 1)];
          const B = n.reduce((a, b) => a + b, 0);
          if (B < 2 || B > 6) continue;
          let A = 0;
          for (let i = 0; i < 8; i += 1) if (!n[i] && n[(i + 1) % 8]) A += 1;
          if (A !== 1) continue;
          if (step === 0 ? (n[0] * n[2] * n[4] || n[2] * n[4] * n[6]) : (n[0] * n[2] * n[6] || n[0] * n[4] * n[6])) continue;
          del.push(y * w + x);
        }
      }
      for (const q of del) m[q] = 0;
      if (del.length) changed = true;
    }
  }
  return m;
}

// The longest walk along the skeleton: the loop of the contour.
function traceLoop(sk, w, h) {
  const nb = (q) => {
    const x = q % w;
    const y = (q - x) / w;
    const out = [];
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) if ((dx || dy) && sk[(y + dy) * w + x + dx]) out.push((y + dy) * w + x + dx);
    return out;
  };
  const used = new Uint8Array(w * h);
  let best = [];
  for (let s0 = 0; s0 < w * h; s0 += 1) {
    if (!sk[s0] || used[s0]) continue;
    const line = [s0];
    used[s0] = 1;
    let cur = s0;
    for (;;) {
      const next = nb(cur).filter((q) => !used[q]);
      if (!next.length) break;
      // stay on the line: a side neighbour before a diagonal one
      next.sort((a, b) => (Math.abs(a - cur) === 1 || Math.abs(a - cur) === w ? 0 : 1) - (Math.abs(b - cur) === 1 || Math.abs(b - cur) === w ? 0 : 1));
      cur = next[0];
      used[cur] = 1;
      line.push(cur);
    }
    if (line.length > best.length) best = line;
  }
  return best.map((q) => [q % w, (q - (q % w)) / w]);
}

function douglasPeucker(points, eps) {
  if (points.length < 3) return points.slice();
  const [a, b] = [points[0], points[points.length - 1]];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  let idx = -1;
  let dmax = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const p = points[i];
    const d = Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / L;
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax <= eps) return [a, b];
  return [...douglasPeucker(points.slice(0, idx + 1), eps).slice(0, -1), ...douglasPeucker(points.slice(idx), eps)];
}

// The corners of the contour on a frame where it is whole: its skeleton simplified, each side's centre line fitted to
// the stroke's pixels (pixel centres at +0.5) away from its ends, neighbouring sides intersected. Top-left first,
// clockwise on screen. On the 16:9 render this finds the dump's 22 corners within 0.53 px.
export function contourCorners(img, test = CLASS.shown) {
  const comp = components(img, test, { min: 5000 }).sort((a, b) => (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0))[0];
  const cm = contourMask(img, test, comp);
  let v = douglasPeucker(traceLoop(thin(cm), cm.w, cm.h), 2.5);
  if (Math.hypot(v[0][0] - v[v.length - 1][0], v[0][1] - v[v.length - 1][1]) < 4) v = v.slice(0, -1);
  const turn = (a, b, c) => {
    const u = [b[0] - a[0], b[1] - a[1]];
    const w = [c[0] - b[0], c[1] - b[1]];
    return Math.abs(u[0] * w[1] - u[1] * w[0]) / (Math.hypot(...u) * Math.hypot(...w) || 1);
  };
  for (let again = true; again;) {
    again = false;
    for (let i = 0; i < v.length; i += 1) {
      const a = v[(i - 1 + v.length) % v.length];
      const c = v[(i + 1) % v.length];
      if (turn(a, v[i], c) < 0.5 || Math.hypot(v[i][0] - a[0], v[i][1] - a[1]) < 12) { v.splice(i, 1); again = true; break; }
    }
  }
  const pts = [];
  for (let y = 0; y < cm.h; y += 1) for (let x = 0; x < cm.w; x += 1) if (cm.mask[y * cm.w + x]) pts.push([x + 0.5, y + 0.5]);
  const sides = v.map((a, i) => {
    const b = v[(i + 1) % v.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    const near = pts.filter(([x, y]) => {
      const px = x - 0.5 - a[0];
      const py = y - 0.5 - a[1];
      const s = px * d[0] + py * d[1];
      return Math.abs(-px * d[1] + py * d[0]) <= 5 && s >= 10 && s <= L - 10;
    });
    const cx = near.reduce((s, p) => s + p[0], 0) / near.length;
    const cy = near.reduce((s, p) => s + p[1], 0) / near.length;
    let sxx = 0, sxy = 0, syy = 0;
    for (const [x, y] of near) { sxx += (x - cx) ** 2; sxy += (x - cx) * (y - cy); syy += (y - cy) ** 2; }
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    return { p: [cx, cy], d: [Math.cos(ang), Math.sin(ang)] };
  });
  const meet = (s, t) => {
    const den = s.d[0] * t.d[1] - s.d[1] * t.d[0];
    const k = ((t.p[0] - s.p[0]) * t.d[1] - (t.p[1] - s.p[1]) * t.d[0]) / den;
    return [s.p[0] + k * s.d[0] + cm.ox, s.p[1] + k * s.d[1] + cm.oy];
  };
  let corners = sides.map((s, i) => meet(sides[(i - 1 + sides.length) % sides.length], s));
  const area = corners.reduce((s, p, i) => { const q = corners[(i + 1) % corners.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
  if (area < 0) corners = corners.reverse();
  const k0 = corners.reduce((best, p, i) => (p[0] + p[1] < corners[best][0] + corners[best][1] ? i : best), 0);
  return corners.slice(k0).concat(corners.slice(0, k0));
}

// The pack's contour contracts from a wider shape to its rest in 0–0.44 s (its path keys); the vertical one does it on
// the same keys: its rest on the frame where it stops, its start solved from two frames on the way (v = S + p (E - S)).
export const CONTOUR_KEYS = { t1: 0.44, out: 79.268, in: 83.038 };
export function contourLayout(tall) {
  const end = contourCorners(tall(11));
  const still = contourCorners(tall(12));
  if (still.length !== end.length || still.some((p, i) => Math.hypot(p[0] - end[i][0], p[1] - end[i][1]) > 0.05)) throw new Error('contour: not at rest at 0.44 s');
  const p = (t) => easedProgress(t / CONTOUR_KEYS.t1, CONTOUR_KEYS.out, CONTOUR_KEYS.in);
  const ways = [7, 8].map((f) => ({ v: contourCorners(tall(f)), p: p(f / FPS) }));
  for (const w of ways) if (w.v.length !== end.length) throw new Error('contour: another shape on the way');
  const solve = (w, i) => [(w.v[i][0] - w.p * end[i][0]) / (1 - w.p), (w.v[i][1] - w.p * end[i][1]) / (1 - w.p)];
  // weighted by (1 - p)^2: the earlier frame magnifies its error less
  const start = end.map((e, i) => {
    let sx = 0, sy = 0, sw = 0;
    for (const w of ways) {
      const wt = (1 - w.p) ** 2;
      const s = solve(w, i);
      sx += wt * s[0]; sy += wt * s[1]; sw += wt;
    }
    return [sx / sw, sy / sw];
  });
  const spread = Math.max(...end.map((e, i) => { const [a, b] = ways.map((w) => solve(w, i)); return Math.hypot(a[0] - b[0], a[1] - b[1]); }));
  return { end, start, spread };
}

// ---- the arrows ----

// The arrows of the vertical frame: where each rests (its box on the last frame), which way it flies, the 16:9 arrow
// that gives it its shape, turned (a copy when the vertical frame has more of them), and how its flight is read.
// `keys`: the source's own position keys with a time shift fit (the travel by least squares); `free`: a curve of its own
// (two times, the two influences, the travel) — the arrows the designer keyed anew. `skip` marks what the lane shows
// wrongly: 'junk' is another element (bl3 before 0.72 s, W3 while W1 passes through), 'nofit' the arrow merged with
// another one (r2 over the circle ②: seen, but not where).
export const ARROWS = [
  { name: 'top', source: 'Стрелка_9 Outlines', box: [700, 296, 1056, 355], dir: [1, 0], cls: 'dark', fit: 'free' },
  { name: 'bl1', source: 'Стрелка_11 Outlines', box: [348, 2513, 407, 2870], dir: [0, -1], cls: 'dark', fit: 'keys', shift: 0 },
  { name: 'bl2', source: 'Стрелка_12 Outlines', box: [493, 2513, 552, 2870], dir: [0, -1], cls: 'dark', fit: 'keys', shift: 0 },
  { name: 'bl3', source: 'Стрелка_12 Outlines', copy: 'Стрелка_12 Outlines 3', box: [640, 2513, 699, 2870], dir: [0, -1], cls: 'dark', fit: 'keys', shift: 4, skip: (o) => (o.f < 18 ? 'junk' : false) },
  { name: 'r1', source: 'Стрелка_15 Outlines', box: [1866, 2342, 1925, 2698], dir: [0, -1], cls: 'dark', fit: 'free' },
  { name: 'r2', source: 'Стрелка_16 Outlines', box: [1866, 3000, 1925, 3356], dir: [0, -1], cls: 'dark', fit: 'free', skip: (o) => (!o.edge && o.off > 150 ? 'nofit' : false) },
  { name: 'W1', source: 'Стрелка_2 Outlines', box: [1054, 2397, 1231, 2699], dir: [0, -1], cls: 'white', fit: 'free' },
  { name: 'W2', source: 'Стрелка_1 Outlines', box: [1556, 2787, 1733, 3089], dir: [0, -1], cls: 'white', fit: 'keys', shift: 3 },
  { name: 'W3', source: 'Стрелка_2 Outlines', copy: 'Стрелка_2 Outlines 3', box: [1054, 3205, 1231, 3507], dir: [0, -1], cls: 'white', fit: 'free', skip: (o) => (o.f < 25 ? 'junk' : false) },
];

// The turn (degrees, AE's: clockwise on screen) that points a 16:9 arrow's flight along the vertical one's.
export function turnOf(from, to) {
  for (const deg of [0, 90, 180, -90]) {
    const r = (deg * Math.PI) / 180;
    const x = Math.round(from[0] * Math.cos(r) - from[1] * Math.sin(r));
    const y = Math.round(from[0] * Math.sin(r) + from[1] * Math.cos(r));
    if (x === to[0] && y === to[1]) return deg;
  }
  throw new Error(`no turn from ${from} to ${to}`);
}

const remaining = (c, t) => (t <= c.t0 ? 1 : t >= c.t1 ? 0 : 1 - easedProgress((t - c.t0) / (c.t1 - c.t0), c.out, c.in));

// How far from its rest an arrow is, frame by frame: its component in the lane (the rest box stretched back to the
// frame's edge), the right size across; `edge` when it is still coming in over the frame's edge.
function follow(tall, a, restBox, frames = 70) {
  const [x0, y0, x1, y1] = restBox;
  const horizontal = a.dir[0] !== 0;
  const lane = horizontal ? [0, y0 - 6, x1 + 6, y1 + 6] : [x0 - 6, y0 - 6, x1 + 6, tall(0).height - 1];
  const across = horizontal ? y1 - y0 : x1 - x0;
  const length = horizontal ? x1 - x0 : y1 - y0;
  const rest = horizontal ? (x0 + x1) / 2 : (y0 + y1) / 2;
  const out = [];
  for (let f = 0; f <= frames; f += 1) {
    const img = tall(f);
    const test = f < 25 ? CLASS.shown : CLASS[a.cls];
    const found = components(img, test, { x0: lane[0], y0: lane[1], x1: lane[2], y1: lane[3], min: 60 }).filter((c) => {
      const cs = horizontal ? c.y1 - c.y0 : c.x1 - c.x0;
      const ls = horizontal ? c.x1 - c.x0 : c.y1 - c.y0;
      return Math.abs(cs - across) <= 14 && ls >= 0.4 * length;
    });
    if (!found.length) { out.push({ f, seen: false }); continue; }
    const mid = (c) => (horizontal ? (c.x0 + c.x1) / 2 : (c.y0 + c.y1) / 2);
    const c = found.sort((p, q) => Math.abs(mid(p) - rest) - Math.abs(mid(q) - rest))[0];
    const off = (mid(c) - rest) * -(horizontal ? a.dir[0] : a.dir[1]);
    out.push({ f, seen: true, off, edge: horizontal ? c.x0 <= 0 : c.y1 >= img.height - 1 });
  }
  return out;
}

const OUTS = [16.667, 33.333, 50, 55.405, 70.732, 81.707, 84, 90.923];
const INS = [16.667, 33.333, 82.927, 83.6, 95.487, 99.39, 100];

// Fits a flight to what was seen: `keys` scales the source's own keys shifted by `shift` frames; `free` searches the
// times and influences. Seen offsets fit by least squares; offsets over the frame's edge only bound from below.
export function fitFlight(obs, base = null) {
  const usable = obs.filter((o) => o.seen && !o.edge);
  const bounds = obs.filter((o) => o.seen && o.edge);
  const score = (c) => {
    let num = 0, den = 0;
    for (const o of usable) { const r = remaining(c, o.f / FPS); num += o.off * r; den += r * r; }
    if (den <= 0) return null;
    const travel = num / den;
    let err = 0;
    for (const o of usable) err += (o.off - travel * remaining(c, o.f / FPS)) ** 2;
    for (const o of bounds) { const p = travel * remaining(c, o.f / FPS); if (p < o.off) err += (o.off - p) ** 2; }
    return { ...c, travel, rms: Math.sqrt(err / usable.length) };
  };
  if (base) return score(base);
  let best = null;
  for (let i0 = -10; i0 <= 40; i0 += 1) {
    for (let i1 = i0 + 5; i1 <= 65; i1 += 1) {
      for (const out of OUTS) {
        for (const inn of INS) {
          const s = score({ t0: i0 / FPS, t1: i1 / FPS, out, in: inn });
          if (s && (!best || s.rms < best.rms)) best = s;
        }
      }
    }
  }
  return best;
}

// Every arrow of the vertical frame: its flight, when it shows (the frame it is first seen on, unless it comes in over
// the frame's edge: then from the start of its flight), and where its anchor rests.
export function arrowLayout(wide, tall, dump) {
  const W = wide(LAST);
  const T = tall(LAST);
  const out = [];
  for (const a of ARROWS) {
    const L = dump.layers.find((l) => l.name === a.source);
    const k = layerProp(L, 'ADBE Transform Group', 'ADBE Position').keys;
    const from = [Math.sign(Math.round(k[1].value[0] - k[0].value[0])), Math.sign(Math.round(k[1].value[1] - k[0].value[1]))];
    const rotation = turnOf(from, a.dir);
    const rest9 = one(components(T, CLASS[a.cls], { x0: a.box[0], y0: a.box[1], x1: a.box[2], y1: a.box[3], min: 1000 }), `${a.name} at rest`);
    const obs = follow(tall, a, [rest9.x0, rest9.y0, rest9.x1, rest9.y1]).map((o) => (o.seen && a.skip && a.skip(o) === 'junk' ? { f: o.f, seen: false } : o));
    const fitted = obs.map((o) => (o.seen && a.skip && a.skip(o) === 'nofit' ? { f: o.f, seen: false } : o));
    const sh = (a.shift || 0) / FPS;
    const fit = a.fit === 'keys'
      ? fitFlight(fitted, { t0: k[0].time + sh, t1: k[1].time + sh, out: k[0].outEase[0].influence, in: k[1].inEase[0].influence })
      : fitFlight(fitted);
    const first = obs.find((o) => o.seen);
    const inPoint = first.edge ? Math.min(fit.t0, first.f / FPS) : first.f / FPS;
    // the rest: the vertical box against the source's 16:9 box (the 16:9 render's component there) and anchor
    // the source at rest in the 16:9 render: inside its outline box (the big arrows' layers also hold a frame-size
    // shape the render does not show: there, the white component nearest the anchor)
    const P16 = anchorAt(dump, a.source);
    const geo = shapeBoxAt(dump, L, LAST / FPS);
    const pad = 12;
    const rest16 = geo.w < 1000
      ? one(components(W, CLASS[a.cls], { x0: Math.floor(geo.x0) - pad, y0: Math.floor(geo.y0) - pad, x1: Math.ceil(geo.x1) + pad, y1: Math.ceil(geo.y1) + pad, min: 1000 }), `${a.source} at rest`)
      : components(W, CLASS[a.cls], { min: 10000 }).sort((p, q) => Math.hypot(centre(p)[0] - P16[0], centre(p)[1] - P16[1]) - Math.hypot(centre(q)[0] - P16[0], centre(q)[1] - P16[1]))[0];
    // A 2D layer with a z (the big arrows: -35) is drawn through the default camera of the Classic 3D comp, magnified
    // zoom / (zoom + z) about the frame's middle (zoom: 50 mm, the comp's width x 50/36; AE 26.5 puts their anchors
    // 0.66 % off in 16:9). The master sets z 0: offsets and sizes are taken without the magnification, and the vertical
    // render's look (its own camera magnified them more) is matched by the layer's scale.
    const z = layerProp(L, 'ADBE Transform Group', 'ADBE Position').keys.at(-1).value[2] || 0;
    const zoom = (dump.comp.width * 50) / 36;
    const m16 = zoom / (zoom + z);
    const mid = [dump.comp.width / 2, dump.comp.height / 2];
    const A16 = [mid[0] + m16 * (P16[0] - mid[0]), mid[1] + m16 * (P16[1] - mid[1])];
    const c16 = centre(rest16);
    const c9 = centre(rest9);
    const r = (rotation * Math.PI) / 180;
    const d = [(c16[0] - A16[0]) / m16, (c16[1] - A16[1]) / m16];
    const s = a.cls === 'white' ? Math.sqrt(rest9.n / rest16.n) * m16 : 1;
    const anchor9 = [c9[0] - s * (d[0] * Math.cos(r) - d[1] * Math.sin(r)), c9[1] - s * (d[0] * Math.sin(r) + d[1] * Math.cos(r))];
    out.push({
      name: a.name, source: a.source, copy: a.copy || null, rotation, scale: s, dir: a.dir, anchor9,
      flight: { t0: fit.t0, t1: fit.t1, out: fit.out, in: fit.in, travel: fit.travel, rms: fit.rms, how: a.fit === 'keys' ? `${a.source} keys, shifted ${a.shift || 0} frames` : 'own curve' },
      inPoint, seen: obs.filter((o) => o.seen).map((o) => [o.f, Math.round(o.off), o.edge ? 1 : 0]),
    });
  }
  return out;
}

// ---- the layout file ----

const near = (v, to, tol, what) => {
  if (Math.abs(v - to) > tol) throw new Error(`${what}: ${v} is not ${to}`);
  return to;
};

export function measure() {
  const wide = frames('wide');
  const tall = frames('tall');
  const dump = loadComp();
  const st = staticLayout(wide, tall);
  const rd = (v, d = 3) => (Array.isArray(v) ? v.map((x) => rd(x, d)) : Math.round(v * 10 ** d) / 10 ** d);
  const globeScale = near((st.globe.tall.x1 - st.globe.tall.x0 + 1) / (st.globe.wide.x1 - st.globe.wide.x0 + 1), 1.5, 0.005, 'globe scale');
  const hatches = hatchLayout(wide, tall, dump);
  const contour = contourLayout(tall);
  const arrows = arrowLayout(wide, tall, dump);
  const big = arrows.filter((a) => a.scale !== 1);
  const bigScale = big.reduce((s, a) => s + a.scale, 0) / big.length;
  return {
    _note: 'The pack\'s vertical podcast intro measured against its 16:9 render and comp (masters/POD_Intro/measure-9x16.mjs, D12: rebuilt by the render). Px of the 4K frames (the vertical one 2160x3840); anchors where a layer\'s anchor lands in the vertical frame; times in seconds.',
    source: { tall: path.posix.basename(RENDERS.tall), wide: path.posix.basename(RENDERS.wide), lastFrame: LAST },
    frame: { w: 2160, h: 3840 },
    title: { scale: rd(st.title.s, 4), shift: rd(st.title.t), residual: rd(st.title.residual) },
    circles: { scale: rd(st.circles.scale), one: { c16: rd(centre(st.circles.wide[0])), c9: rd(centre(st.circles.tall[0])) }, two: { c16: rd(centre(st.circles.wide[1])), c9: rd(centre(st.circles.tall[1])) } },
    globe: { scale: globeScale, c16: rd(centre(st.globe.wide)), c9: rd(centre(st.globe.tall)) },
    logo: { ...logoLayout(dump, st.cube), cube: { wide: st.cube.wide, tall: st.cube.tall } },
    hatches: Object.fromEntries(Object.entries(hatches).map(([k, v]) => [k, { anchor9: rd(v.anchor9), rotation: v.rotation, ...(v.window ? { window: rd(v.window) } : {}) }])),
    contour: { keys: CONTOUR_KEYS, end: rd(contour.end), start: rd(contour.start, 1), spread: rd(contour.spread, 1) },
    arrows: arrows.map((a) => ({
      name: a.name, source: a.source, copy: a.copy, rotation: a.rotation, scale: a.scale === 1 ? 1 : rd(bigScale, 4), dir: a.dir, anchor9: rd(a.anchor9),
      flight: { t0: rd(a.flight.t0), t1: rd(a.flight.t1), out: rd(a.flight.out), in: rd(a.flight.in), travel: rd(a.flight.travel, 1), rms: rd(a.flight.rms, 2), how: a.flight.how },
      inPoint: rd(a.inPoint),
    })),
  };
}

export const LAYOUT = path.join(here, 'layout-9x16.json');

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const layout = measure();
  writeFileSync(LAYOUT, JSON.stringify(layout, null, 1) + '\n', 'utf8');
  console.log(`wrote ${LAYOUT}: title x${layout.title.scale} (residual ${layout.title.residual} px), circles x${layout.circles.scale}, globe x${layout.globe.scale}, logo ${layout.logo.scale} %, ` +
    `contour ${layout.contour.end.length} corners (start spread ${layout.contour.spread} px), arrows ${layout.arrows.map((a) => `${a.name} ${a.flight.rms}`).join(', ')} px rms`);
}
