// Style 1 «Титры» of TTL_LowerThird, from the Titles pack «Подпись_спикеров» (canvas 1500x500 at UHD scale,
// so FHD = canvas / 2). The TXT_ layers are this style's display and, for every style, the Essential
// Graphics fields.
import { applyPoint } from '../../tools/dump/geometry.mjs';
import { dumpKeys, dumpLayer, progressSegment, toBuilderKeys } from '../../tools/masters/dump-keys.mjs';
import { layerToCompAt, shapeBoxAt } from '../../tools/masters/dump-geometry.mjs';
import { P, rectGroup, shape, text } from '../../tools/masters/spec.mjs';

const FPS = 25;
const REST = 2.0;              // the pack's hold is 1.52–4.28 s
const CANVAS_TO_FHD = 0.5;     // the pack canvas is UHD-scaled (assumption, see README)
const OUT_SHIFT = 0.48;        // the pack's exit (4.40–5.48 s) moved to end on the last frame (4.88–5.96 s)
const MARGIN = 100;            // block from the frame edge and the tallest block from the bottom, FHD px
// Plate right edge after the ink of the longest line, FHD px: the pack's hand-fitted plates give 13.17
// (name) and 13.82 (role) against the AE ink of the same texts (2026-10-03), so 13.5.
const PAD_R = 13.5;
export const NAME = 'Александр Стародубцев';
export const ROLE = ' Технический лидер Cloud.ru';
export const START = ['ADBE Text Properties', 'ADBE Text Animators', 'ADBE Text Animator', 'ADBE Text Selectors', 'ADBE Text Selector', 'ADBE Text Percent Start'];

const r6 = (v) => Math.round(v * 1e6) / 1e6;

export function layoutFrom(canon, metrics) {
  const s = CANVAS_TO_FHD;
  const L = (n) => dumpLayer(canon, n);
  const name = shapeBoxAt(canon, L('Shape Layer 1'), REST);
  const role = shapeBoxAt(canon, L('Shape Layer 2'), REST);
  const at = (layerName, p) => applyPoint(layerToCompAt(canon, L(layerName), REST), p);
  const nm = metrics.layers[NAME].lines[0];
  const rl = metrics.layers[ROLE].lines;
  const nameOrigin = at(NAME, [nm[0], nm[1]]);
  const role1 = at(ROLE, [rl[1][0], rl[1][1]]);
  const role2 = at(ROLE, [rl[2][0], rl[2][1]]);
  const parentScale = Math.hypot(layerToCompAt(canon, L(NAME), REST)[0], 0);   // null 250 % -> 2.5
  return {
    name: { w: r6(name.w * s), h: r6(name.h * s) },
    role: { w: r6(role.w * s), h: r6(role.h * s), y: r6((role.y0 - name.y0) * s), x: r6((role.x0 - name.x0) * s) },
    gap: r6((role.y0 - name.y1) * s),
    textX: r6((nameOrigin[0] - name.x0) * s),
    nameBaseline: r6((nameOrigin[1] - name.y0) * s),
    roleBaselines: [r6((role1[1] - role.y0) * s), r6((role2[1] - role.y0) * s)],
    roleStep: r6((role2[1] - role1[1]) * s),
    nameSize: r6(metrics.layers[NAME].fontSize * parentScale * s),
    roleSize: r6(metrics.layers[ROLE].lineFontSize * parentScale * s),
    nameRise: r6(45 * parentScale * s),
    roleRise: r6(73.1 * parentScale * s),
    font: 'SBSansText-Regular',
  };
}

export function checkRise(canon) {
  const pos = (n) => dumpLayer(canon, n).props.find((p) => p.matchName === 'ADBE Text Properties').children
    .find((c) => c.matchName === 'ADBE Text Animators').children[0].children
    .find((c) => c.matchName === 'ADBE Text Animator Properties').children
    .find((c) => c.matchName === 'ADBE Text Position 3D').value[1];
  const r = { name: pos(NAME), role: pos(ROLE) };
  if (Math.abs(r.name - 45) > 1e-6 || Math.abs(r.role - 73.1) > 1e-6) throw new Error('animator offsets changed: ' + JSON.stringify(r));
  return r;
}

// Plate growth and collapse as 0..1 sliders; the white edges lead (intro) and trail (exit) by one frame,
// which is checked against the edge layers of the pack.
export function rigKeys(canon) {
  const scale = (n) => dumpKeys(canon, n, 'ADBE Transform Group', 'ADBE Scale');
  const name = scale('Shape Layer 1');
  const role = scale('Shape Layer 2');
  const nameOut = scale('Shape Layer 4');
  const roleOut = scale('Shape Layer 3');
  const lead = scale('Shape Layer 8')[0].time - name[0].time;
  const trail = scale('Shape Layer 6')[2].time - nameOut[2].time;
  const frame = 1 / FPS;
  if (Math.abs(lead + frame) > 1e-6 || Math.abs(trail - frame) > 1e-6) {
    throw new Error(`edges: expected to lead and trail by one frame, got ${lead} and ${trail}`);
  }
  const out = (keys) => progressSegment(keys, 2, { dim: 0, t0: r6(keys[2].time + OUT_SHIFT), t1: r6(keys[3].time + OUT_SHIFT) });
  return {
    NameIn: progressSegment(name, 0, { dim: 0 }),
    RoleIn: progressSegment(role, 0, { dim: 0 }),
    NameOut: out(nameOut),
    RoleOut: out(roleOut),
    RoleStart: toBuilderKeys(dumpKeys(canon, ROLE, ...START)),
  };
}

// Shared by every style that grows plates like «Титры»: geometry of a plate with a leading / trailing white
// edge, given expressions for its left x, width, height, top y and its in / out sliders.
export function bandExpr(pre, x, w, h, y, inn, out, which) {
  const body = which === 'in'
    ? `var a = sl("${inn}", time), b = sl("${inn}", time + d), o = sl("${out}", time);\n` +
      'var e0 = right ? [x0 + w0 * (1 - b), x0 + w0 * (1 - a)] : [x0 + w0 * a, x0 + w0 * b];\n' +
      'var on = b < 1 && o <= 0 && w0 > 0;\n'
    : `var a = sl("${out}", time), b = sl("${out}", time - d);\n` +
      'var e0 = right ? [x0 + w0 * (1 - a), x0 + w0 * (1 - b)] : [x0 + w0 * b, x0 + w0 * a];\n' +
      'var on = b > 0 && w0 > 0;\n';
  const head = pre + `var x0 = ${x}, w0 = ${w};\n` + body;
  return {
    size: head + `on ? [Math.max(0, e0[1] - e0[0]), ${h}] : [0, ${h}]`,
    pos: head + `[(e0[0] + e0[1]) / 2, ${y} + ${h} / 2]`,
  };
}

export function plateExpr(pre, x, w, h, y, inn, out) {
  return {
    size: pre + `var s = span(${x}, ${w}, sl("${inn}", time), sl("${out}", time));\n[Math.max(0, s[1] - s[0]), ${h}]`,
    pos: pre + `var s = span(${x}, ${w}, sl("${inn}", time), sl("${out}", time));\n[(s[0] + s[1]) / 2, ${y} + ${h} / 2]`,
  };
}

// Size control (user, 2026-10-05: text size anchored to its position): f scales the block; the block keeps
// its corner (margins stay x k), text layers are scaled by f (their ink is read back x f).
export const SIZES = [0.8, 1, 1.2, 1.4, 1.6];
export const SIZE_CTRL = { label: 'Размер текста', items: ['80 %', '100 %', '120 %', '140 %', '160 %'], value: 2 };
export const SIZE_JS = `var f = [${SIZES.join(', ')}][thisComp.layer("CTRL").effect("Size")(1).value - 1] || 1;`;

// Shared head of the plate expressions: k, f, margins, side, the speed map T and sliders read through it.
export function platePre(timeMap) {
  return [
    'var C = thisComp.layer("CTRL"), R = thisComp.layer("RIG");',
    'var k = Math.min(thisComp.width, thisComp.height) / 1080;',
    SIZE_JS,
    'var kt = k * f;',
    'var W = thisComp.width, H = thisComp.height, M = ' + MARGIN + ' * k;',
    'var right = C.effect("Side")(1).value == 2;',
    'function ink(n) { var r = thisComp.layer(n).sourceRectAtTime(0, false); return r.width > 0 ? (r.left + r.width) * f : 0; }',
    timeMap.trim(),
    'function sl(e, t) { return R.effect(e)(1).valueAtTime(T(t)); }',
    'var d = thisComp.frameDuration;',
    // dark plate extents along x: grows from its start edge, collapses toward the other edge
    'function span(x, w, a, b) { return right ? [x + w * (1 - a), x + w * (1 - b)] : [x + w * b, x + w * a]; }',
  ].join('\n') + '\n';
}

export const visible = (style) => `thisComp.layer("CTRL").effect("Style")(1).value == ${style} ? 100 : 0`;
export const scaleExpr = SIZE_JS + '\n[100 * f, 100 * f]';

// Adds the style's layers (bottom first), keys and expressions to the spec.
export function addTitles(spec, { layout: L, rig, nameStart, text: T, hex, timeMap }) {
  const pre = platePre(timeMap) + [
    // «Титры» stand on the left only (user, 2026-10-05: no right side)
    'right = false;',
    'var n = ink("TXT_NAME"), r1 = ink("TXT_ROLE1"), r2 = ink("TXT_ROLE2");',
    'var lines = (r1 > 0 ? 1 : 0) + (r2 > 0 ? 1 : 0);',
    `var TX = ${L.textX} * kt, PR = ${PAD_R} * kt;`,
    'var Wn = n > 0 ? Math.round((TX + n + PR) / k) * k : 0;',
    'var Wr = lines > 0 ? Math.round((TX + Math.max(r1, r2) + PR) / k) * k : 0;',
    `var Hn = ${L.name.h} * kt, G = ${L.gap} * kt, Hr2 = ${L.role.h} * kt, STEP = ${L.roleStep} * kt;`,
    'var Hr = lines == 2 ? Hr2 : (lines == 1 ? Hr2 - STEP : 0);',
    'var y0 = H - M - (Hn + G + Hr2);',
    'var xn = right ? W - M - Wn : M, xr = right ? W - M - Wr : M, yr = y0 + Hn + G;',
  ].join('\n') + '\n';
  const k = 'var k = Math.min(thisComp.width, thisComp.height) / 1080;\n';
  spec.add(
    shape('PL_ROLE', [rectGroup('Plate', hex.black)]),
    shape('PL_NAME', [rectGroup('Plate', hex.black)]),
    text('TXT_ROLE2', { ...T.TXT_ROLE2.style, value: T.TXT_ROLE2.value }, [{ name: 'Rise', basedOn: 4 }]),
    text('TXT_ROLE1', { ...T.TXT_ROLE1.style, value: T.TXT_ROLE1.value }, [{ name: 'Rise', basedOn: 4 }]),
    text('TXT_NAME', { ...T.TXT_NAME.style, value: T.TXT_NAME.value }, [{ name: 'Rise', basedOn: 3 }]),
    shape('EDGE_ROLE', [rectGroup('In', hex.white), rectGroup('Out', hex.white)]),
    shape('EDGE_NAME', [rectGroup('In', hex.white), rectGroup('Out', hex.white)]),
  );
  spec.key('TXT_NAME', P.start(), nameStart);
  spec.expr('TXT_NAME', P.start(), timeMap + 'valueAtTime(T(time))');
  const np = plateExpr(pre, 'xn', 'Wn', 'Hn', 'y0', 'NameIn', 'NameOut');
  const rp = plateExpr(pre, 'xr', 'Wr', 'Hr', 'yr', 'RoleIn', 'RoleOut');
  spec.expr('PL_NAME', P.rectSize('Plate'), np.size).expr('PL_NAME', P.rectPos('Plate'), np.pos);
  spec.expr('PL_ROLE', P.rectSize('Plate'), rp.size).expr('PL_ROLE', P.rectPos('Plate'), rp.pos);
  for (const [layer, x, w, h, y, inn, out] of [['EDGE_NAME', 'xn', 'Wn', 'Hn', 'y0', 'NameIn', 'NameOut'], ['EDGE_ROLE', 'xr', 'Wr', 'Hr', 'yr', 'RoleIn', 'RoleOut']]) {
    for (const which of ['in', 'out']) {
      const b = bandExpr(pre, x, w, h, y, inn, out, which);
      const g = which === 'in' ? 'In' : 'Out';
      spec.expr(layer, P.rectSize(g), b.size).expr(layer, P.rectPos(g), b.pos);
    }
  }
  spec.expr('TXT_NAME', P.pos, pre + `[xn + TX, y0 + ${L.nameBaseline} * kt]`);
  spec.expr('TXT_ROLE1', P.pos, pre + `[xr + TX, yr + ${L.roleBaselines[0]} * kt]`);
  // role 2 takes the first line when role 1 is empty
  spec.expr('TXT_ROLE2', P.pos, pre + `[xr + TX, yr + (r1 > 0 ? ${L.roleBaselines[1]} : ${L.roleBaselines[0]}) * kt]`);
  // rise offsets in layer units: the layer scale f carries them with the text
  spec.expr('TXT_NAME', P.rise(), k + `[0, ${L.nameRise} * k, 0]`);
  spec.expr('TXT_ROLE1', P.rise(), k + `[0, ${L.roleRise} * k, 0]`);
  spec.expr('TXT_ROLE2', P.rise(), k + `[0, ${L.roleRise} * k, 0]`);
  for (const layer of ['TXT_NAME', 'TXT_ROLE1', 'TXT_ROLE2']) spec.expr(layer, P.scale, scaleExpr);
  // the pack's role selector ran over three lines (an empty first one): line 2 moved while Start passed
  // 33.3-66.7 %, line 3 while it passed 66.7-100 %. Each role layer gets its own window of that Start.
  const roleS = timeMap + 'var S = thisComp.layer("RIG").effect("RoleStart")(1).valueAtTime(T(time));\n';
  spec.expr('TXT_ROLE1', P.start(), roleS + 'linear(S, 100 / 3, 200 / 3, 0, 100)');
  spec.expr('TXT_ROLE2', P.start(), roleS +
    'var first = thisComp.layer("TXT_ROLE1").sourceRectAtTime(0, false).width <= 0;\n' +
    'first ? linear(S, 100 / 3, 200 / 3, 0, 100) : linear(S, 200 / 3, 100, 0, 100)');
  for (const layer of ['PL_ROLE', 'PL_NAME', 'TXT_ROLE2', 'TXT_ROLE1', 'TXT_NAME', 'EDGE_ROLE', 'EDGE_NAME']) spec.expr(layer, P.opacity, visible(1));
  spec.matte('TXT_NAME', 'PL_NAME').matte('TXT_ROLE1', 'PL_ROLE').matte('TXT_ROLE2', 'PL_ROLE');
  return rig;
}

export const titlesRest = REST;
