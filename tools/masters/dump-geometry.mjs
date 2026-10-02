// Rest geometry of dumped layers in comp coordinates: where a plate, a logo or a text baseline sits while
// nothing moves. Master builders take their layout numbers from here instead of retyping them (spec §4.4).
// 2-D only: a layer with rotation or a 3-D orientation at the rest time throws; z is ignored (the layer
// plane must be at z = 0, which holds for the pack's flipping logo once its rotation is back at 0).
import { applyPoint, bbox, groupMatrix, IDENTITY, multiply, samplePolyline, transformSubpath } from '../dump/geometry.mjs';
import { child, layerProp } from '../dump/model.mjs';

const EPS = 1e-6;

function same(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => same(v, b[i]));
  if (a && b && typeof a === 'object' && typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < EPS : a === b;
}

// The value of a dumped property at time t where it does not change: before the first key, after the
// last one, on a key, or inside a hold between two equal keys. Anything else is not "at rest" and throws.
export function restValueAt(node, t) {
  if (!node) return undefined;
  const keys = node.keys;
  if (!Array.isArray(keys) || !keys.length) return node.value;
  if (t <= keys[0].time + EPS) return keys[0].value;
  if (t >= keys[keys.length - 1].time - EPS) return keys[keys.length - 1].value;
  for (let i = 0; i < keys.length - 1; i += 1) {
    if (Math.abs(keys[i].time - t) < EPS) return keys[i].value;
    if (t > keys[i].time && t < keys[i + 1].time) {
      if (same(keys[i].value, keys[i + 1].value) || keys[i].outInterp === 'HOLD') return keys[i].value;
      throw new Error(`${node.name}: changes between ${keys[i].time} and ${keys[i + 1].time}, not at rest at ${t}`);
    }
  }
  return keys[keys.length - 1].value;
}

function xy(v) {
  return [v[0], v[1]];
}

// Layer space -> parent space at time t: position + scale * (p - anchor).
export function layerMatrixAt(layer, t) {
  const tr = (mn) => layerProp(layer, 'ADBE Transform Group', mn);
  const rot = [restValueAt(tr('ADBE Rotate Z'), t), restValueAt(tr('ADBE Rotate X'), t), restValueAt(tr('ADBE Rotate Y'), t)];
  if (rot.some((r) => r !== undefined && Math.abs(r) > EPS)) throw new Error(`${layer.name}: rotated at ${t}`);
  const ori = restValueAt(tr('ADBE Orientation'), t);
  if (Array.isArray(ori) && ori.some((r) => Math.abs(r) > EPS)) throw new Error(`${layer.name}: oriented at ${t}`);
  const anchor = xy(restValueAt(tr('ADBE Anchor Point'), t) || [0, 0]);
  const position = xy(restValueAt(tr('ADBE Position'), t) || [0, 0]);
  const scale = xy(restValueAt(tr('ADBE Scale'), t) || [100, 100]);
  return groupMatrix({ anchor, position, scale, rotation: 0 });
}

// Layer space -> comp space, through the parent chain (parent = layer index in the dump).
export function layerToCompAt(dump, layer, t) {
  let m = layerMatrixAt(layer, t);
  let p = layer.parent;
  const seen = new Set([layer.index]);
  while (p !== null && p !== undefined) {
    if (seen.has(p)) throw new Error(`${layer.name}: parent loop`);
    seen.add(p);
    const parent = dump.layers.find((l) => l.index === p);
    if (!parent) throw new Error(`${layer.name}: no parent layer ${p}`);
    m = multiply(layerMatrixAt(parent, t), m);
    p = parent.parent;
  }
  return m;
}

// Enabled paths of a shape layer at time t, in comp coordinates (group transforms applied).
export function shapePathsAt(dump, layer, t) {
  const root = (layer.props || []).find((n) => n.matchName === 'ADBE Root Vectors Group');
  if (!root) throw new Error(`${layer.name}: not a shape layer`);
  const out = [];
  const visit = (nodes, m) => {
    for (const n of nodes || []) {
      if (n.enabled === false) continue;
      if (n.matchName === 'ADBE Vector Group') {
        const tr = child(n, 'ADBE Vector Transform Group');
        const g = (mn, d) => {
          const v = restValueAt(child(tr, mn), t);
          return v === undefined || v === null ? d : v;
        };
        const gm = tr ? groupMatrix({ anchor: g('ADBE Vector Anchor', [0, 0]), position: g('ADBE Vector Position', [0, 0]),
          scale: g('ADBE Vector Scale', [100, 100]), rotation: g('ADBE Vector Rotation', 0) }) : IDENTITY;
        visit((child(n, 'ADBE Vectors Group') || {}).children, multiply(m, gm));
      } else if (n.matchName === 'ADBE Vector Shape - Group') {
        const v = restValueAt(child(n, 'ADBE Vector Shape'), t);
        if (v && Array.isArray(v.vertices)) out.push(transformSubpath(v, m));
      } else if (n.matchName === 'ADBE Vector Shape - Rect') {
        const size = restValueAt(child(n, 'ADBE Vector Rect Size'), t);
        const pos = restValueAt(child(n, 'ADBE Vector Rect Position'), t) || [0, 0];
        const [w, h] = size;
        const x0 = pos[0] - w / 2;
        const y0 = pos[1] - h / 2;
        const sp = { closed: true, vertices: [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]],
          inTangents: [[0, 0], [0, 0], [0, 0], [0, 0]], outTangents: [[0, 0], [0, 0], [0, 0], [0, 0]] };
        out.push(transformSubpath(sp, m));
      }
    }
  };
  visit(root.children, layerToCompAt(dump, layer, t));
  return out;
}

export function shapeBoxAt(dump, layer, t) {
  const pts = shapePathsAt(dump, layer, t).flatMap((sp) => samplePolyline(sp));
  if (!pts.length) throw new Error(`${layer.name}: no paths at ${t}`);
  return bbox(pts);
}

// Text origin (start of the first baseline) in comp coordinates and the glyph baseline after
// baselineShift, which raises the glyphs by shift * the layer's vertical scale.
export function textBaselineAt(dump, layer, t) {
  const m = layerToCompAt(dump, layer, t);
  const doc = restValueAt(layerProp(layer, 'ADBE Text Properties', 'ADBE Text Document'), t);
  if (!doc) throw new Error(`${layer.name}: no text document`);
  const origin = applyPoint(m, [0, 0]);
  const scaleY = Math.hypot(m[2], m[3]);
  const shift = (doc.baselineShift || 0) * scaleY;
  return { origin, baseline: origin[1] - shift, fontPx: doc.fontSize * scaleY, doc };
}
