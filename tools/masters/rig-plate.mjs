// The plate rig shared by the title masters (plan 4: TTL_LowerThird, TTL_Plate, then TTL_Subscribe and
// TTL_Disclaimer): the text size and its fit to the frame, style visibility, the QA patch, and plate / text
// progress sliders from the signed motion canon (brand/tokens.json -> motion, D19).
import { P, rectGroup, shape } from './spec.mjs';

const r6 = (v) => Math.round(v * 1e6) / 1e6;

// Size control (user, 2026-10-05: text size anchored to its position): f scales the block; the block keeps
// its corner (margins stay x k), text layers are scaled by f (their ink is read back x f). The chosen size
// is an upper bound: the style's Fit slider on RIG holds the f in use, the largest up to the chosen size at
// which the block stays inside the frame margins (Premiere check 2026-10-05: a 30-letter guest name at
// 140 % ran off the frame).
export const SIZES = [0.8, 1, 1.2, 1.4, 1.6];
export const SIZE_CTRL = { label: 'Размер текста', items: ['80 %', '100 %', '120 %', '140 %', '160 %'], value: 2 };
export const sizeJs = (fit) => `var f = thisComp.layer("RIG").effect("${fit}")(1).value;`;
export const SIZE_AT_1 = 'var f = 1;';

// The Fit slider: pre1 is the style's geometry at f = 1, wb its block width there, avail the room between
// the margins. Plates are rounded to whole pixels, so a capped block stops one pixel short of the margin.
export function fitExpr(pre1, wb, avail) {
  return pre1 + [
    `var fu = [${SIZES.join(', ')}][thisComp.layer("CTRL").effect("Size")(1).value - 1] || 1;`,
    `var Wb = ${wb}, A = ${avail};`,
    'Wb * fu <= A ? fu : Math.max(0.2, (A - k) / Wb)',
  ].join('\n');
}

export const visible = (style) => `thisComp.layer("CTRL").effect("Style")(1).value == ${style} ? 100 : 0`;
export const scaleExpr = (fit) => sizeJs(fit) + '\n[100 * f, 100 * f]';

// A brand-green square in the top right corner, shown by the QA checkbox (colour checks of the renders).
export function addQaPatch(spec, green) {
  const k = 'var k = Math.min(thisComp.width, thisComp.height) / 1080;\n';
  spec.add(shape('QA_PATCH', [rectGroup('Patch', green)]));
  spec.expr('QA_PATCH', P.rectSize('Patch'), k + '[100 * k, 100 * k]');
  spec.expr('QA_PATCH', P.rectPos('Patch'), k + '[thisComp.width - 100 * k, 100 * k]');
  spec.expr('QA_PATCH', P.opacity, 'thisComp.layer("CTRL").effect("QA")(1).value * 100');
}

// A canon segment { frames, bezier: [x1, 0, x2, 1] } as a 0..1 progress slider starting at t0 (seconds):
// AE keys with zero speed, outgoing influence x1, incoming 1 - x2 (tokens.json -> motion._note).
export function canonProgress(seg, t0, fps = 25) {
  if (!seg || !Array.isArray(seg.bezier) || !(seg.frames > 0)) throw new Error('canonProgress: a { frames, bezier } segment is expected');
  const [x1, y1, x2, y2] = seg.bezier;
  if (y1 !== 0 || y2 !== 1) throw new Error('canonProgress: only eases with zero speed (y1 = 0, y2 = 1)');
  return [
    { t: r6(t0), v: 0, inType: 'BEZIER', outType: 'BEZIER', inEase: [[0, 33.333333]], outEase: [[0, r6(x1 * 100)]] },
    { t: r6(t0 + seg.frames / fps), v: 1, inType: 'BEZIER', outType: 'BEZIER', inEase: [[0, r6((1 - x2) * 100)]], outEase: [[0, 33.333333]] },
  ];
}

// The canon must still describe the pack it came from: dumped segment i (keys i, i + 1) against a canon
// segment, frames exact, influences within tol percent, speeds zero. dim: the dimension of a multi-
// dimensional property (Scale X = 0).
export function checkCanon(keys, i, seg, { fps = 25, label = 'segment', dim, tol = 1.5 } = {}) {
  const k0 = keys[i];
  const k1 = keys[i + 1];
  if (!k0 || !k1) throw new Error(`${label}: no segment ${i}`);
  const pick = (list) => (list || [])[dim === undefined ? 0 : dim] || { speed: NaN, influence: NaN };
  const out = pick(k0.outEase);
  const inn = pick(k1.inEase);
  const [x1, , x2] = seg.bezier;
  const frames = Math.round((k1.time - k0.time) * fps);
  const problems = [];
  if (frames !== seg.frames) problems.push(`${frames} frames, canon ${seg.frames}`);
  if (!(Math.abs(out.influence - x1 * 100) <= tol)) problems.push(`out influence ${out.influence}, canon ${r6(x1 * 100)}`);
  if (!(Math.abs(inn.influence - (1 - x2) * 100) <= tol)) problems.push(`in influence ${inn.influence}, canon ${r6((1 - x2) * 100)}`);
  if (!(Math.abs(out.speed) <= 1e-3 && Math.abs(inn.speed) <= 1e-3)) problems.push(`speeds ${out.speed}, ${inn.speed}`);
  if (problems.length) throw new Error(`${label}: the dump no longer matches the canon: ${problems.join('; ')}`);
  return { t0: k0.time, t1: k1.time, frames };
}
