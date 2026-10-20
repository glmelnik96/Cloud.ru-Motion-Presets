// The two styles of TTL_Plate «Текст на плашке», up to three lines with a plate each:
//   1 «Подкаст» — the podcast pack «Текст на плашке_1» (right) and «Булит» (centre): green plates, dark caps;
//   2 «SMM» — the SMM pack «Плашки_9x16» and «Плашки_1x1»: dark plates, lime text, from the left edge.
// Both run on one plate block (addPlateBlock): lines stack from the bottom, an empty line collapses, each
// plate grows from its outer edge and its text rises by words inside it (the text is matted to its plate).
// Curves are the signed motion canon (M1 plate, M2 text, brand/tokens.json), checked against the pack keys;
// delays between the lines come from the pack.
import { applyPoint } from '../../tools/dump/geometry.mjs';
import { layerProp } from '../../tools/dump/model.mjs';
import { dumpKeys, dumpLayer } from '../../tools/masters/dump-keys.mjs';
import { layerToCompAt, shapeBoxAt } from '../../tools/masters/dump-geometry.mjs';
import { checkCanon, fitExpr, scaleExpr, SIZE_AT_1, sizeJs, visible } from '../../tools/masters/rig-plate.mjs';
import { P, rectGroup, shape, text } from '../../tools/masters/spec.mjs';

const FPS = 25;
const POD_REST = 4.0;          // «Текст на плашке_1», «Булит»: every line at rest 3.32–7.32 s
const T = ['ADBE Transform Group'];
const SEL = ['ADBE Text Properties', 'ADBE Text Animators', 'ADBE Text Animator', 'ADBE Text Selectors', 'ADBE Text Selector'];
export const START = [...SEL, 'ADBE Text Percent Start'];
export const END = [...SEL, 'ADBE Text Percent End'];
export const SMM_9x16 = [['Разверните свой сервис 2', 'Shape Layer 7'], [' видеоконференций 2', 'Shape Layer 6']];
export const SMM_1x1 = { 1.6: [['Разверните свой личный', 'Shape Layer 3'], [' блог на Word Press', 'Shape Layer 4']],
  5: [['На виртуальной машине', 'Shape Layer 3'], [' Cloud.ru Evolution', 'Shape Layer 4']] };

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const mean = (list) => r6(list.reduce((s, v) => s + v, 0) / list.length);
const sameText = (list, label) => {
  if (list.some((v) => v !== list[0])) throw new Error(`${label}: the pack is no longer uniform: ${list.join(', ')}`);
  return list[0];
};
const same = (list, label, tol = 1e-6) => {
  if (list.some((v) => Math.abs(v - list[0]) > tol)) throw new Error(`${label}: the pack is no longer uniform: ${list.join(', ')}`);
  return r6(list[0]);
};

function metricsOf(metrics, comp, t, name) {
  const c = metrics.cases.find((x) => x.comp === comp && Math.abs(x.t - t) < 1e-6);
  const row = c && c.layers[name];
  if (!row) throw new Error(`source-metrics.json: no ${comp} at ${t} s, layer "${name}"`);
  return row;
}

// One line of a pack comp at rest, in FHD units of that comp (k = short side / 1080): its plate, the ink
// of its text, the baseline and the text origin, the font size on screen and the rise of its animator.
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

// «Подкаст»: right side from «Текст на плашке_1» (three lines), centre from «Булит» and «Булит_1» (two each).
// The pack's plates are scaled by hand around each text, so the paddings are the means; side «Слева» mirrors
// the right one. Булит's lower plate is 48 px tall (104.4 %): the master keeps one plate height.
export function podcastLayout({ pod, bulit, bulit1, metrics }) {
  const right = [1, 2, 3].map((i) => lineAt(pod, metrics, `Text_${i}`, `Box_${i}`, POD_REST));
  const center = [bulit, bulit1].flatMap((d) => [1, 2].map((i) => lineAt(d, metrics, `Text_${i}`, `Box_${i}`, POD_REST)));
  const all = right.concat(center);
  return {
    font: sameText(all.map((x) => x.font), 'podcast font'),
    size: same(all.map((x) => x.size), 'podcast size'),
    tracking: same(all.map((x) => x.tracking), 'podcast tracking'),
    rise: same(all.map((x) => x.rise), 'podcast rise'),
    h: same(right.map((x) => x.plate.h), 'podcast plate height', 0.01),
    step: mean([right[1].plate.y0 - right[0].plate.y0, right[2].plate.y0 - right[1].plate.y0]),
    base: mean(all.map((x) => x.plate.y1 - x.baseline)),
    pads: {
      outer: mean(right.map((x) => x.plate.x1 - x.ink.x1)),
      inner: mean(right.map((x) => x.ink.x0 - x.plate.x0)),
      center: mean(center.flatMap((x) => [x.ink.x0 - x.plate.x0, x.plate.x1 - x.ink.x1])),
    },
    edge: mean(right.map((x) => x.W - x.plate.x1)),
    bottom: { side: r6(right[2].H - right[2].plate.y1), center: mean([center[1], center[3]].map((x) => x.H - x.plate.y1)) },
  };
}

// «SMM»: vertical from «Плашки_9x16», square from «Плашки_1x1» (both phrases). The text stands at a fixed
// origin inside the plate (point text, left-justified) and the plate ends a pad after the ink; the mirrored
// side keeps the mean ink pad on the outer side.
export function smmLayout({ s916, s11, metrics }) {
  const v = SMM_9x16.map(([t, p]) => lineAt(s916, metrics, t, p, 3));
  const q = Object.entries(SMM_1x1).flatMap(([t, pairs]) => pairs.map(([n, p]) => lineAt(s11, metrics, n, p, Number(t))));
  const all = v.concat(q);
  return {
    font: sameText(all.map((x) => x.font), 'smm font'),
    size: same(all.map((x) => x.size), 'smm size'),
    tracking: same(all.map((x) => x.tracking), 'smm tracking'),
    rise: same(all.map((x) => x.rise), 'smm rise'),
    h: same(all.map((x) => x.plate.h), 'smm plate height', 0.01),
    step: same([v[1].plate.y0 - v[0].plate.y0, q[1].plate.y0 - q[0].plate.y0, q[3].plate.y0 - q[2].plate.y0], 'smm line step', 0.01),
    base: same(all.map((x) => r6(x.plate.y1 - x.baseline)), 'smm baseline', 0.01),
    origin: mean(all.map((x) => x.originX - x.plate.x0)),
    padR: mean(all.map((x) => x.plate.x1 - x.ink.x1)),
    padInk: mean(all.map((x) => x.ink.x0 - x.plate.x0)),
    // the square pack's plates start 0.85–1.1 px inside the frame: flush here (no video sliver at the edge)
    edge: { vertical: mean(v.map((x) => x.plate.x0)), horizontal: 0, squarePack: mean(q.map((x) => x.plate.x0)) },
    bottom: { vertical: r6(v[1].H - v[1].plate.y1), horizontal: mean([q[1], q[3]].map((x) => x.H - x.plate.y1)) },
  };
}

// The podcast timing of «Текст на плашке_1»: plates of lines 1–3 start 0 / 0.28 / 0.68 s apart, each text
// 0.52 s after its plate; on the way out the texts go 0.2 s apart from the top and each plate 0.28 s after
// its text. «Булит» starts its texts 0.12 s after the plates and its plates 0.04 s after the texts on the way
// out; the master keeps one timing (the item's name source).
export function podcastTiming(pod, canon) {
  const M1 = canon.M1.styles.podcast;
  const M2 = canon.M2.styles.podcast;
  const box = [1, 2, 3].map((i) => dumpKeys(pod, `Box_${i}`, ...T, 'ADBE Scale'));
  const txt = [1, 2, 3].map((i) => dumpKeys(pod, `Text_${i}`, ...START));
  box.forEach((k, i) => {
    checkCanon(k, 0, M1.in, { dim: 0, label: `podcast Box_${i + 1} in` });
    checkCanon(k, 2, M1.out, { dim: 0, label: `podcast Box_${i + 1} out` });
  });
  txt.forEach((k, i) => {
    checkCanon(k, 0, M2.in, { label: `podcast Text_${i + 1} in` });
    checkCanon(k, 2, M2.out, { label: `podcast Text_${i + 1} out` });
  });
  return {
    plateIn: M1.in, plateOut: M1.out, textIn: M2.in, textOut: M2.out,
    inDelays: box.map((k) => r6(k[0].time - box[0][0].time)),
    textLag: same(txt.map((k, i) => k[0].time - box[i][0].time), 'podcast text after plate'),
    outStagger: same([txt[1][2].time - txt[0][2].time, txt[2][2].time - txt[1][2].time], 'podcast out stagger'),
    plateLag: same(box.map((k, i) => k[2].time - txt[i][2].time), 'podcast plate after text'),
  };
}

// The SMM timing of «Плашки_9x16»: the bottom line first, the next one 0.4 s later (canon M1 stagger, 10
// frames); a text starts with its plate. Out: the text End by words, its plate 0.56 s later (the upper
// pair of the second phrase; the pack's lower pair of that phrase leaves in another order).
export function smmTiming(s916, s11, canon) {
  const M1 = canon.M1.styles.smm;
  const M2 = canon.M2.styles.smmPlates;
  const [top, bottom] = SMM_9x16;
  const plate = (n) => dumpKeys(s916, n, ...T, 'ADBE Scale');
  const pb = plate(bottom[1]);
  const pt = plate(top[1]);
  for (const [k, label] of [[pb, 'bottom'], [pt, 'top']]) {
    checkCanon(k, 0, M1.in, { dim: 0, label: `smm plate ${label} in` });
    checkCanon(k, 4, M1.out, { dim: 0, label: `smm plate ${label} out` });
  }
  const sb = dumpKeys(s916, bottom[0], ...START);
  const st = dumpKeys(s916, top[0], ...START);
  checkCanon(sb, 0, M2.in, { label: 'smm text bottom in' });
  checkCanon(st, 0, M2.in, { label: 'smm text top in' });
  const eb = dumpKeys(s916, bottom[0], ...END);
  const et = dumpKeys(s916, top[0], ...END);
  checkCanon(eb, 0, M2.out, { label: 'smm text bottom out' });
  checkCanon(et, 0, M2.out, { label: 'smm text top out' });
  const stagger = same([pt[0].time - pb[0].time, st[0].time - sb[0].time, et[0].time - eb[0].time], 'smm stagger');
  if (Math.abs(stagger * FPS - M1.stagger) > 1e-6) throw new Error(`smm stagger ${stagger} s, canon ${M1.stagger} frames`);
  const p2 = dumpKeys(s916, 'На виртуальной машине 2', ...END);
  const q2 = dumpKeys(s11, 'На виртуальной машине', ...END);
  const plateLag = same([pt[4].time - p2[0].time, dumpKeys(s11, 'Shape Layer 3', ...T, 'ADBE Scale')[4].time - q2[0].time], 'smm plate after text End');
  return {
    plateIn: M1.in, plateOut: M1.out, textIn: M2.in, textOut: M2.out,
    inDelays: [0, stagger, 2 * stagger],
    textLag: same([sb[0].time - pb[0].time, st[0].time - pt[0].time], 'smm text with plate'),
    outStagger: stagger,
    plateLag,
  };
}

// Rig times of a style in a master of `duration`: the in keys from 0, the out keys of the LAST line to leave
// so that its plate is gone on the last frame; the other lines read the same sliders earlier (outStagger).
export function rigTimes(timing, duration, fps = FPS) {
  const out = r6(duration - 1 / fps - timing.plateLag - timing.plateOut.frames / fps);
  return {
    textIn: r6(timing.textLag),
    textOut: out,
    plateOut: r6(out + timing.plateLag),
    introEnd: r6(Math.max(timing.inDelays[2] + timing.plateIn.frames / fps, timing.inDelays[2] + timing.textLag + timing.textIn.frames / fps)),
    outroStart: r6(out - 2 * timing.outStagger),
  };
}

// Shared head of a style's expressions: k, the text size f, the side (1 left, 2 centre, 3 right; «Авто» is
// the style's own), the speed map, the ink of the three lines and their places (at: index from the top among
// the non-empty lines, n: how many), the frame anchors and the plate of a line at rest.
function blockPre(B, timeMap, size) {
  const geo = B.geo;
  const [t1, t2, t3] = B.texts;
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
    'function ink(n) { var r = thisComp.layer(n).sourceRectAtTime(0, false); return { l: r.left * f, w: r.width > 0 ? r.width * f : 0 }; }',
    `var I = [ink("${t1}"), ink("${t2}"), ink("${t3}")];`,
    'var n = 0, at = [-1, -1, -1];',
    'for (var j = 0; j < 3; j++) { if (I[j].w > 0) { at[j] = n; n++; } }',
    `var E = (${geo.edge}) * k, M = (${geo.margin}) * k, B0 = H - (${geo.bottom}) * k;`,
    // pads from the plate's left edge to the ink and from the ink to its right edge
    `function pads(e) { return [${geo.padL}, ${geo.padR}]; }`,
    'function width(e) { if (e.w <= 0) { return 0; } var p = pads(e); return p[0] + e.w + p[1]; }',
    'function left(w) { return side == 1 ? E : (side == 3 ? W - E - w : (W - w) / 2); }',
  ].join('\n') + '\n';
}

// One line (li 0..2 from the top): its slot in time (s: 1-based, from the top or the bottom), its plate at
// rest (x0, w, bottom pb), the delays of its in and out, and the plate growth g (0..1) from the outer edge.
function lineJs(B, li) {
  const tm = B.timing;
  return [
    `var e = I[${li}], me = at[${li}], on = me >= 0;`,
    'var b = n - 1 - me;',
    `var s = ${B.fromTop ? 'me + 1' : 'b + 1'};`,
    `var pb = B0 - b * ${B.geo.step} * kt, w = width(e), x0 = left(w), pd = pads(e);`,
    `var dIn = [${tm.inDelays.join(', ')}][Math.max(0, s - 1)] || 0, dOut = ${tm.outStagger} * (n - s);`,
    `var g = on ? sl("${B.sliders.plateIn}", TT - dIn) * (1 - sl("${B.sliders.plateOut}", TT + dOut)) : 0;`,
    'var gx0 = side == 3 ? x0 + w * (1 - g) : x0, gx1 = side == 3 ? x0 + w : x0 + w * g;',
  ].join('\n') + '\n';
}

// Adds a style's layers (bottom first), keys are on RIG (resolve.mjs). B: style, auto, fit, texts, plates,
// source (texts copied from the field layers), textStyle, fill, geo { h, step, base, rise, edge, margin,
// bottom, padL, padR }, fromTop, timing, sliders, textOut ('start': Start runs back, 'end': End runs down).
export function addPlateBlock(spec, B, timeMap) {
  const geo = B.geo;
  const pre = blockPre(B, timeMap, sizeJs(B.fit));
  spec.expr('RIG', P.slider(B.fit), fitExpr(blockPre(B, timeMap, SIZE_AT_1), 'Math.max(width(I[0]), width(I[1]), width(I[2]))', 'side == 2 ? W - 2 * M : W - E - M'));
  const k = 'var k = Math.min(thisComp.width, thisComp.height) / 1080;\n';
  for (let li = 2; li >= 0; li -= 1) spec.add(shape(B.plates[li], [rectGroup('Plate', B.fill)]));
  for (let li = 2; li >= 0; li -= 1) {
    spec.add(text(B.texts[li], { ...B.textStyle, value: B.values ? B.values[li] : '' }, [{ name: 'Rise', basedOn: 3 }]));
  }
  for (let li = 0; li < 3; li += 1) {
    const plate = B.plates[li];
    const tx = B.texts[li];
    const line = pre + lineJs(B, li);
    spec.expr(plate, P.rectSize('Plate'), line + `[Math.max(0, gx1 - gx0), ${geo.h} * kt]`);
    spec.expr(plate, P.rectPos('Plate'), line + `[(gx0 + gx1) / 2, pb - ${geo.h} * kt / 2]`);
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
    spec.expr(plate, P.opacity, visible(B.style));
    spec.expr(tx, P.opacity, visible(B.style));
    spec.matte(tx, plate);
  }
}
