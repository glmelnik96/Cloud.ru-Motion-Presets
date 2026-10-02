// Planar geometry for the logo comparison (spec D18). A subpath is AE shape data:
// { vertices: [[x,y]], inTangents, outTangents (relative to their vertex), closed }.
// An affine matrix is [a, b, c, d, e, f]: x' = a*x + c*y + e, y' = b*x + d*y + f.
import { createHash } from 'node:crypto';

export const IDENTITY = [1, 0, 0, 1, 0, 0];

export function multiply(m1, m2) {
  // m1 after m2
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2, b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2, b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1, b1 * e2 + d1 * f2 + f1,
  ];
}

export function applyPoint(m, [x, y]) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function applyVector(m, [x, y]) {
  return [m[0] * x + m[2] * y, m[1] * x + m[3] * y];
}

// AE shape-group transform: p' = position + R(rotation) * S(scale) * (p - anchor). Rotation in degrees,
// clockwise on screen (y down); scale in percent.
export function groupMatrix({ anchor = [0, 0], position = [0, 0], scale = [100, 100], rotation = 0 } = {}) {
  const r = (rotation * Math.PI) / 180;
  const sx = scale[0] / 100;
  const sy = scale[1] / 100;
  const a = Math.cos(r) * sx;
  const b = Math.sin(r) * sx;
  const c = -Math.sin(r) * sy;
  const d = Math.cos(r) * sy;
  return [a, b, c, d, position[0] - (a * anchor[0] + c * anchor[1]), position[1] - (b * anchor[0] + d * anchor[1])];
}

export function transformSubpath(sp, m) {
  return {
    closed: sp.closed,
    vertices: sp.vertices.map((p) => applyPoint(m, p)),
    inTangents: sp.inTangents.map((t) => applyVector(m, t)),
    outTangents: sp.outTangents.map((t) => applyVector(m, t)),
  };
}

function cubic(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}

// The outline as a polyline: `steps` points per Bezier segment, closing segment included.
export function samplePolyline(sp, steps = 16) {
  const v = sp.vertices;
  const n = v.length;
  if (n === 0) return [];
  const pts = [];
  const segs = sp.closed ? n : n - 1;
  for (let i = 0; i < segs; i += 1) {
    const j = (i + 1) % n;
    const p0 = v[i];
    const p3 = v[j];
    const p1 = [p0[0] + sp.outTangents[i][0], p0[1] + sp.outTangents[i][1]];
    const p2 = [p3[0] + sp.inTangents[j][0], p3[1] + sp.inTangents[j][1]];
    for (let s = 0; s < steps; s += 1) pts.push(cubic(p0, p1, p2, p3, s / steps));
  }
  pts.push(sp.closed ? v[0] : v[n - 1]);
  return pts;
}

export function bbox(points) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of points) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

// A plate in the same shape layer: a closed, straight-edged, axis-aligned rectangle whose box holds every
// other contour. Several wordmark copies carry one (11 contours instead of 10, "Merge Paths: 2"); left in,
// it sets the normalized box and the letters look 9 % off. It is not part of the logo, so it is dropped.
function isPlateFor(sp, others) {
  if (!sp.closed || sp.vertices.length !== 4) return false;
  const flat = (t) => t.every(([x, y]) => Math.abs(x) < 1e-6 && Math.abs(y) < 1e-6);
  if (!flat(sp.inTangents) || !flat(sp.outTangents)) return false;
  const v = sp.vertices;
  for (let i = 0; i < 4; i += 1) {
    const a = v[i];
    const b = v[(i + 1) % 4];
    if (Math.abs(a[0] - b[0]) > 1e-6 && Math.abs(a[1] - b[1]) > 1e-6) return false;
  }
  const box = bbox(v);
  const inner = bbox(others.flatMap((o) => samplePolyline(o)));
  // The letters may touch the plate edge (seen: a wordmark whose "l" ends on the plate top), so the box
  // test allows 0.2 % of the plate size.
  const eps = 0.002 * Math.max(box.w, box.h);
  return box.w > 0 && box.h > 0 && inner.x0 >= box.x0 - eps && inner.y0 >= box.y0 - eps &&
    inner.x1 <= box.x1 + eps && inner.y1 <= box.y1 + eps;
}

export function dropPlate(subpaths) {
  if (subpaths.length < 2) return { subpaths, dropped: false };
  for (let i = 0; i < subpaths.length; i += 1) {
    const others = subpaths.filter((_, j) => j !== i);
    if (isPlateFor(subpaths[i], others)) return { subpaths: others, dropped: true };
  }
  return { subpaths, dropped: false };
}

// Translate the outline box to the origin and scale it to unit width (aspect kept).
export function normalize(subpaths, steps = 16) {
  const box = bbox(subpaths.flatMap((sp) => samplePolyline(sp, steps)));
  if (!(box.w > 0)) throw new Error('normalize: empty or zero-width shape');
  const k = 1 / box.w;
  const m = [k, 0, 0, k, -box.x0 * k, -box.y0 * k];
  return { subpaths: subpaths.map((sp) => transformSubpath(sp, m)), box, aspect: box.h / box.w };
}

function segments(subpaths, steps) {
  const out = [];
  for (const sp of subpaths) {
    const pts = samplePolyline(sp, steps);
    for (let i = 0; i + 1 < pts.length; i += 1) out.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]]);
  }
  return out;
}

function segDist([px, py], [x1, y1, x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// Uniform grid over segments; nearest() scans rings of cells until no closer segment can exist.
function gridIndex(segs, cell) {
  const grid = new Map();
  segs.forEach((s, i) => {
    const gx0 = Math.floor(Math.min(s[0], s[2]) / cell);
    const gx1 = Math.floor(Math.max(s[0], s[2]) / cell);
    const gy0 = Math.floor(Math.min(s[1], s[3]) / cell);
    const gy1 = Math.floor(Math.max(s[1], s[3]) / cell);
    for (let gx = gx0; gx <= gx1; gx += 1) {
      for (let gy = gy0; gy <= gy1; gy += 1) {
        const k = gx + ',' + gy;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(i);
      }
    }
  });
  return { grid, cell, segs };
}

function nearest({ grid, cell, segs }, p, maxRing) {
  const cx = Math.floor(p[0] / cell);
  const cy = Math.floor(p[1] / cell);
  let best = Infinity;
  for (let r = 0; r <= maxRing; r += 1) {
    for (let gx = cx - r; gx <= cx + r; gx += 1) {
      for (let gy = cy - r; gy <= cy + r; gy += 1) {
        if (Math.max(Math.abs(gx - cx), Math.abs(gy - cy)) !== r) continue;
        const ids = grid.get(gx + ',' + gy);
        if (!ids) continue;
        for (const i of ids) best = Math.min(best, segDist(p, segs[i]));
      }
    }
    if (best <= r * cell) break;
  }
  return best;
}

function directed(fromSubpaths, toIndex, steps, maxRing) {
  let max = 0;
  let sum = 0;
  let n = 0;
  for (const sp of fromSubpaths) {
    for (const p of samplePolyline(sp, steps)) {
      const d = nearest(toIndex, p, maxRing);
      if (d > max) max = d;
      sum += d;
      n += 1;
    }
  }
  return { max, mean: n ? sum / n : 0 };
}

// Symmetric outline distance between two normalized shapes, in units of the shape width:
// max is the Hausdorff distance, mean averages both directions.
export function compareOutlines(a, b, { steps = 16, cell = 0.01 } = {}) {
  const maxRing = Math.ceil(4 / cell);
  const ab = directed(a, gridIndex(segments(b, steps), cell), steps, maxRing);
  const ba = directed(b, gridIndex(segments(a, steps), cell), steps, maxRing);
  return { max: Math.max(ab.max, ba.max), mean: (ab.mean + ba.mean) / 2 };
}

// Equal fingerprints = the same normalized geometry up to 1e-4 of the width, in any subpath order.
export function fingerprint(subpaths) {
  const r = (v) => Math.round(v * 1e4) / 1e4;
  const parts = subpaths.map((sp) => JSON.stringify([sp.closed, sp.vertices.map((p) => p.map(r)),
    sp.inTangents.map((p) => p.map(r)), sp.outTangents.map((p) => p.map(r))])).sort();
  return createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 10);
}

// SVG path data of subpaths, scaled by k (for overlays).
export function pathData(subpaths, k = 1) {
  const f = (v) => (Math.round(v * k * 100) / 100).toString();
  return subpaths.map((sp) => {
    const v = sp.vertices;
    if (!v.length) return '';
    let d = `M${f(v[0][0])} ${f(v[0][1])}`;
    const segs = sp.closed ? v.length : v.length - 1;
    for (let i = 0; i < segs; i += 1) {
      const j = (i + 1) % v.length;
      const c1 = [v[i][0] + sp.outTangents[i][0], v[i][1] + sp.outTangents[i][1]];
      const c2 = [v[j][0] + sp.inTangents[j][0], v[j][1] + sp.inTangents[j][1]];
      d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(v[j][0])} ${f(v[j][1])}`;
    }
    return d + (sp.closed ? 'Z' : '');
  }).join('');
}
