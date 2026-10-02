// Keyframes out of the JSX dumps for master builders (spec §4.4: numbers come from the dumps, not retyped).
// A key here is the builder's format: { t, v, inType, outType, inEase: [[speed, influence]], outEase: [...] }
// with ease arrays per dimension, as AE's setTemporalEaseAtKey takes them.
import { findLayers, layerProp } from '../dump/model.mjs';

export function dumpLayer(dump, name) {
  const found = findLayers(dump, name);
  if (found.length !== 1) {
    throw new Error(`${dump.comp ? dump.comp.name : '?'}: expected one layer "${name}", found ${found.length}`);
  }
  return found[0];
}

// The dumped keys of one property: layer name + matchName path from the layer's property tree.
export function dumpKeys(dump, layerName, ...matchNames) {
  const p = layerProp(dumpLayer(dump, layerName), ...matchNames);
  if (!p) throw new Error(`${layerName}: no property ${matchNames.join(' > ')}`);
  if (!Array.isArray(p.keys) || !p.keys.length) throw new Error(`${layerName}: ${matchNames.join(' > ')} has no keys`);
  return p.keys;
}

export function snap(t, fps) {
  return Math.round(t * fps) / fps;
}

const round = (v, d = 6) => Math.round(v * 10 ** d) / 10 ** d;
const easeOf = (list) => (list || []).map((e) => [e.speed, e.influence]);

// Dumped keys to builder keys. times: the new key times (same length; default = the dumped times snapped
// to the frame grid). value: maps a dumped value to the new one, linearly (v' = a·v + b; a scales speeds).
// When a segment changes its duration, its ease speeds are scaled by old/new so the curve keeps its shape
// (influences are fractions of the segment and need no change).
export function toBuilderKeys(keys, { fps = 25, times, a = 1, b = 0 } = {}) {
  const newTimes = times || keys.map((k) => snap(k.time, fps));
  if (newTimes.length !== keys.length) throw new Error('toBuilderKeys: times must match the key count');
  return keys.map((k, i) => {
    const before = i > 0 ? (k.time - keys[i - 1].time) / (newTimes[i] - newTimes[i - 1]) : 1;
    const after = i < keys.length - 1 ? (keys[i + 1].time - k.time) / (newTimes[i + 1] - newTimes[i]) : 1;
    const v = typeof k.value === 'number' ? round(a * k.value + b) : k.value;
    return {
      t: round(newTimes[i]),
      v,
      inType: k.inInterp,
      outType: k.outInterp,
      inEase: easeOf(k.inEase).map(([s, inf]) => [round(s * a * before), round(inf)]),
      outEase: easeOf(k.outEase).map(([s, inf]) => [round(s * a * after), round(inf)]),
    };
  });
}

// One segment of a dumped property as a 0..1 progress slider: two keys at t0 and t1 that carry the
// segment's out- and in-influence. Only for segments whose ease speeds are zero (then the normalized
// curve is the same for any value range); a speed above `tolerance` throws.
export function progressSegment(keys, i, { t0, t1, fps = 25, tolerance = 1e-3 } = {}) {
  const k0 = keys[i];
  const k1 = keys[i + 1];
  if (!k0 || !k1) throw new Error(`progressSegment: no segment ${i}`);
  const out = k0.outEase || [];
  const inn = k1.inEase || [];
  if (out.length !== 1 || inn.length !== 1) throw new Error('progressSegment: a 1-D property is expected');
  if (Math.abs(out[0].speed) > tolerance || Math.abs(inn[0].speed) > tolerance) {
    throw new Error(`progressSegment: segment ${i} has non-zero ease speed (${out[0].speed}, ${inn[0].speed})`);
  }
  const a = t0 === undefined ? snap(k0.time, fps) : t0;
  const z = t1 === undefined ? snap(k1.time, fps) : t1;
  if (!(z > a)) throw new Error('progressSegment: t1 must follow t0');
  return [
    { t: round(a), v: 0, inType: 'BEZIER', outType: 'BEZIER', inEase: [[0, 33.333333]], outEase: [[0, round(out[0].influence)]] },
    { t: round(z), v: 1, inType: 'BEZIER', outType: 'BEZIER', inEase: [[0, round(inn[0].influence)]], outEase: [[0, 33.333333]] },
  ];
}

// Value of a 1-D Bezier segment with zero speeds (AE's temporal ease) at normalized time u in [0, 1]:
// the cubic Bezier through (0,0), (inf0, 0), (1 - inf1, 1), (1, 1); x is time, y is progress.
export function easedProgress(u, outInfluence, inInfluence) {
  const x1 = outInfluence / 100;
  const x2 = 1 - inInfluence / 100;
  const bx = (s) => 3 * (1 - s) * (1 - s) * s * x1 + 3 * (1 - s) * s * s * x2 + s * s * s;
  const by = (s) => 3 * (1 - s) * s * s + s * s * s;
  let lo = 0;
  let hi = 1;
  for (let n = 0; n < 60; n += 1) {
    const mid = (lo + hi) / 2;
    if (bx(mid) < u) lo = mid; else hi = mid;
  }
  return by((lo + hi) / 2);
}
