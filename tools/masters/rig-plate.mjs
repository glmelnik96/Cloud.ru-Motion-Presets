// The plate rig shared by the title masters (plan 4: TTL_LowerThird, TTL_Plate, then TTL_Subscribe and
// TTL_Disclaimer): the text size and its fit to the frame, style visibility, the QA patch, plate / text
// progress sliders from the signed motion canon (brand/tokens.json -> motion, D19) or from the pack keys,
// and the plate block: lines of text on plates stacked from the bottom (addPlateBlock).
import { applyPoint } from '../dump/geometry.mjs';
import { layerProp } from '../dump/model.mjs';
import { layerToCompAt, shapeBoxAt } from './dump-geometry.mjs';
import { dumpLayer } from './dump-keys.mjs';
import { P, rectGroup, shape, text } from './spec.mjs';

const FPS = 25;
const r6 = (v) => Math.round(v * 1e6) / 1e6;
const SEL = ['ADBE Text Properties', 'ADBE Text Animators', 'ADBE Text Animator', 'ADBE Text Selectors', 'ADBE Text Selector'];
export const START = [...SEL, 'ADBE Text Percent Start'];
export const END = [...SEL, 'ADBE Text Percent End'];

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

// A segment of pack keys (i -> i + 1) as a canon-like { frames, bezier }: for pack curves the canon does not
// cover. Speeds must be zero; a speed below `tol` of the segment's mean speed passes (hand-dragged keys).
export function dumpSegment(keys, i, { dim, fps = FPS, tol = 0.02, label = 'segment' } = {}) {
  const k0 = keys[i];
  const k1 = keys[i + 1];
  if (!k0 || !k1) throw new Error(`${label}: no segment ${i}`);
  const pick = (list) => (list || [])[dim === undefined ? 0 : dim] || { speed: NaN, influence: NaN };
  const out = pick(k0.outEase);
  const inn = pick(k1.inEase);
  const v = (k) => (Array.isArray(k.value) ? k.value[dim === undefined ? 0 : dim] : k.value);
  const mean = Math.abs(v(k1) - v(k0)) / (k1.time - k0.time);
  if (!(Math.abs(out.speed) <= tol * mean && Math.abs(inn.speed) <= tol * mean)) {
    throw new Error(`${label}: speeds ${out.speed}, ${inn.speed} against a mean of ${r6(mean)}`);
  }
  return { frames: Math.round((k1.time - k0.time) * fps), bezier: [r6(out.influence / 100), 0, r6(1 - inn.influence / 100), 1] };
}

function metricsOf(metrics, comp, t, name) {
  const c = metrics.cases.find((x) => x.comp === comp && Math.abs(x.t - t) < 1e-6);
  const row = c && c.layers[name];
  if (!row) throw new Error(`source-metrics.json: no ${comp} at ${t} s, layer "${name}"`);
  return row;
}

// One line of a pack comp at rest, in FHD units of that comp (k = short side / 1080): its plate, the ink
// of its text (metrics: sourceRectAtTime and baselines measured live, tools/masters/jsx/text-ink.jsx), the
// baseline and the text origin, the font size on screen and the rise of its animator.
export function lineAt(dump, metrics, textName, plateName, t) {
  const k = Math.min(dump.comp.width, dump.comp.height) / 1080;
  const L = dumpLayer(dump, textName);
  const box = shapeBoxAt(dump, dumpLayer(dump, plateName), t);
  const m = layerToCompAt(dump, L, t);
  const row = metricsOf(metrics, dump.comp.name, t, textName);
  const [left, top, w, h] = row.rect;
  const a = applyPoint(m, [left, top]);
  const b = applyPoint(m, [left + w, top + h]);
  const line = row.lines.find(Boolean);
  const scaleY = Math.hypot(m[2], m[3]);
  const rise = layerProp(L, 'ADBE Text Properties', 'ADBE Text Animators').children[0].children
    .find((c) => c.matchName === 'ADBE Text Animator Properties').children.find((c) => c.matchName === 'ADBE Text Position 3D').value[1];
  const u = (v) => r6(v / k);
  return {
    plate: { x0: u(box.x0), x1: u(box.x1), y0: u(box.y0), y1: u(box.y1), w: u(box.w), h: u(box.h) },
    ink: { x0: u(a[0]), x1: u(b[0]) },
    baseline: u(applyPoint(m, [0, line[1]])[1]),
    originX: u(applyPoint(m, [0, 0])[0]),
    W: u(dump.comp.width), H: u(dump.comp.height),
    font: row.font, size: u(row.fontSize * scaleY), tracking: row.tracking, rise: u(rise * scaleY),
  };
}

// Rig times of a block in a master of `duration`: the in keys from 0, the out keys of the LAST line to leave
// so that its plate is gone on the last frame; the other lines read the same sliders earlier (outStagger).
export function rigTimes(timing, duration, fps = FPS) {
  const last = timing.inDelays.length - 1;
  const out = r6(duration - 1 / fps - timing.plateLag - timing.plateOut.frames / fps);
  return {
    textIn: r6(timing.textLag),
    textOut: out,
    plateOut: r6(out + timing.plateLag),
    introEnd: r6(Math.max(timing.inDelays[last] + timing.plateIn.frames / fps, timing.inDelays[last] + timing.textLag + timing.textIn.frames / fps)),
    outroStart: r6(out - last * timing.outStagger),
  };
}

// Shared head of a block's expressions: k, the text size f, the side (1 left, 2 centre, 3 right; «Авто» is
// the block's own), the speed map, the ink of the lines and their places (at: index from the top among the
// non-empty lines, n: how many), the frame anchors and the plate of a line at rest. The ink is read at
// B.rest, a moment of the hold at every speed: l and w across, b how far it reaches below the baseline.
function blockPre(B, timeMap, size) {
  const geo = B.geo;
  const N = B.texts.length;
  return [
    'var C = thisComp.layer("CTRL"), R = thisComp.layer("RIG");',
    'var k = Math.min(thisComp.width, thisComp.height) / 1080;',
    size,
    'var kt = k * f;',
    'var W = thisComp.width, H = thisComp.height, vert = H > W;',
    `var pick = C.effect("Position")(1).value, side = pick == 1 ? ${B.auto} : pick - 1;`,
    timeMap.trim(),
    'var TT = T(time);',
    'function sl(e, t) { return R.effect(e)(1).valueAtTime(t); }',
    `function ink(n) { var r = thisComp.layer(n).sourceRectAtTime(${B.rest}, false); return r.width > 0 ? { l: r.left * f, w: r.width * f, b: (r.top + r.height) * f } : { l: 0, w: 0, b: 0 }; }`,
    `var I = [${B.texts.map((t) => `ink("${t}")`).join(', ')}];`,
    `var n = 0, at = [${B.texts.map(() => -1).join(', ')}];`,
    `for (var j = 0; j < ${N}; j++) { if (I[j].w > 0) { at[j] = n; n++; } }`,
    `var E = (${geo.edge}) * k, M = (${geo.margin}) * k, B0 = H - (${geo.bottom}) * k;`,
    // pads from the plate's left edge to the ink and from the ink to its right edge
    `function pads(e) { return [${geo.padL}, ${geo.padR}]; }`,
    'function width(e) { if (e.w <= 0) { return 0; } var p = pads(e); return p[0] + e.w + p[1]; }',
    'function left(w) { return side == 1 ? E : (side == 3 ? W - E - w : (W - w) / 2); }',
  ].join('\n') + '\n';
}

// One line (li from the top): its slot in time (s: 1-based, from the top or the bottom), its plate at rest
// (x0, w, bottom pb, dsc: how far the plate reaches under pb for the descenders of its text — Д, Ц, Щ, a
// comma — as the pack's «Подписывайся!» does; more than 3 % of the font below the plate bottom counts), the
// delays of its in and out, and the plate growth g (0..1) from the outer edge.
function lineJs(B, li) {
  const tm = B.timing;
  return [
    `var e = I[${li}], me = at[${li}], on = me >= 0;`,
    'var b = n - 1 - me;',
    `var s = ${B.fromTop ? 'me + 1' : 'b + 1'};`,
    `var pb = B0 - b * ${B.geo.step} * kt, w = width(e), x0 = left(w), pd = pads(e);`,
    `var over = e.b - ${B.geo.base} * kt, dsc = on && over > ${r6(0.03 * B.textStyle.size)} * kt ? over : 0;`,
    `var dIn = [${tm.inDelays.join(', ')}][Math.max(0, s - 1)] || 0, dOut = ${tm.outStagger} * (n - s);`,
    `var g = on ? sl("${B.sliders.plateIn}", TT - dIn) * (1 - sl("${B.sliders.plateOut}", TT + dOut)) : 0;`,
    'var gx0 = side == 3 ? x0 + w * (1 - g) : x0, gx1 = side == 3 ? x0 + w : x0 + w * g;',
  ].join('\n') + '\n';
}

// Adds a block's layers (bottom first) and expressions; its keys are on RIG (the master's resolve.mjs).
// B: style (the «Стиль» value that shows it, or none), auto (the side of «Авто»), fit (its Fit slider),
// texts, plates (one per line, top first), values, source (texts copied from other layers), textStyle,
// fill, geo { h, step, base, rise, edge, margin, bottom, padL, padR }, fromTop (the order lines come in),
// timing { inDelays, outStagger }, sliders { plateIn, textIn, textOut, plateOut }, textOut ('start': Start
// runs back, 'end': End runs down), rest (a comp time of the hold at every speed). Every text is matted
// to its plate, which reaches under its descenders, so words rise inside the plate and no glyph is cut.
export function addPlateBlock(spec, B, timeMap) {
  const geo = B.geo;
  const N = B.texts.length;
  if (!(B.rest > 0)) throw new Error('addPlateBlock: B.rest, a moment of the hold, is needed');
  const pre = blockPre(B, timeMap, sizeJs(B.fit));
  spec.expr('RIG', P.slider(B.fit), fitExpr(blockPre(B, timeMap, SIZE_AT_1), `Math.max(${B.texts.map((_, i) => `width(I[${i}])`).join(', ')})`, 'side == 2 ? W - 2 * M : W - E - M'));
  const k = 'var k = Math.min(thisComp.width, thisComp.height) / 1080;\n';
  for (let li = N - 1; li >= 0; li -= 1) spec.add(shape(B.plates[li], [rectGroup('Plate', B.fill)]));
  for (let li = N - 1; li >= 0; li -= 1) {
    spec.add(text(B.texts[li], { ...B.textStyle, value: B.values ? B.values[li] : '' }, [{ name: 'Rise', basedOn: 3 }]));
  }
  for (let li = 0; li < N; li += 1) {
    const plate = B.plates[li];
    const tx = B.texts[li];
    const line = pre + lineJs(B, li);
    spec.expr(plate, P.rectSize('Plate'), line + `[Math.max(0, gx1 - gx0), ${geo.h} * kt + dsc]`);
    spec.expr(plate, P.rectPos('Plate'), line + `[(gx0 + gx1) / 2, pb + (dsc - ${geo.h} * kt) / 2]`);
    if (B.source) spec.expr(tx, P.text, `String(thisComp.layer("${B.source[li]}").text.sourceText)`);
    spec.expr(tx, P.pos, line + `[x0 + pd[0] - e.l, pb - ${geo.base} * kt]`);
    const tin = `sl("${B.sliders.textIn}", TT - dIn)`;
    const tout = `sl("${B.sliders.textOut}", TT + dOut)`;
    if (B.textOut === 'start') {
      spec.expr(tx, P.start(), line + `100 * ${tin} * (1 - ${tout})`);
    } else {
      spec.expr(tx, P.start(), line + `100 * ${tin}`);
      spec.expr(tx, ['selector', 'Rise', 'ADBE Text Percent End'], line + `100 * (1 - ${tout})`);
    }
    // rise in layer units: the layer scale f carries it with the text
    spec.expr(tx, P.rise(), k + `[0, ${geo.rise} * k, 0]`);
    spec.expr(tx, P.scale, scaleExpr(B.fit));
    if (B.style) {
      spec.expr(plate, P.opacity, visible(B.style));
      spec.expr(tx, P.opacity, visible(B.style));
    }
    spec.matte(tx, plate);
  }
}
