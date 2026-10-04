// Style 2 «Подкаст» of TTL_LowerThird, from the podcast pack «Подпись_спикера_1» (host, right; 3840x2160,
// FHD = / 2). The pack's title lives inside the frame rig (CR_POD_Frame later): the plate sits in the inner
// corner of the frame window, so the style is placed 52.5 / 51 px (FHD) from the frame edge. Side «Слева»
// mirrors the plate and the arrows like «Подпись_спикера_2»; one animation (the host's) for both sides.
import { dumpKeys, dumpLayer, progressSegment, toBuilderKeys } from '../../tools/masters/dump-keys.mjs';
import { layerToCompAt, restValueAt, shapeBoxAt } from '../../tools/masters/dump-geometry.mjs';
import { applyPoint } from '../../tools/dump/geometry.mjs';
import { layerProp } from '../../tools/dump/model.mjs';
import { P, pathGroup, rectGroup, shape, text } from '../../tools/masters/spec.mjs';
import { scaleExpr, SIZE_JS, START, visible } from './style-titles.mjs';

const S = 0.5;                 // 4K pack -> FHD
const REST = 3.0;
const IN_SHIFT = -0.6;         // the pack's plate starts at 0.60 s (after the frame flies in): here at 0
const OUT_SHIFT = -3.36;       // the pack's exit 7.88–9.36 s -> 4.52–6.00 s, ending on the last frame
export const POD = { name: 'Surname', role: 'Технический лидер CLOUd.ru', plate: 'Cube_1', arrow1: 'strelka_одна', arrow2: 'strelka_двойная' };
const r6 = (v) => Math.round(v * 1e6) / 1e6;
const T = ['ADBE Transform Group'];

// Measured live (tools/masters/jsx/text-metrics.jsx on podcast_relinked.aep, «Подпись_спикера_1», 3.0 s):
// box-text baselines in layer space, which the dump does not record.
export const POD_METRICS = {
  role: { lines: [[-678.510986328125, -13.6499938964844, 495.089111328125], [-678.510986328125, 81.3500366210938, -146.870178222656]] },
  name: { lines: [[-1733.09997558594, 63, 840]] },
};

export function podcastLayout(pod) {
  const L = (n) => dumpLayer(pod, n);
  const plate = shapeBoxAt(pod, L(POD.plate), REST);
  const at = (n, p) => applyPoint(layerToCompAt(pod, L(n), REST), p);
  const nameRight = at(POD.name, [POD_METRICS.name.lines[0][2], POD_METRICS.name.lines[0][1]]);
  const nameLeft = at(POD.name, [POD_METRICS.name.lines[0][0], POD_METRICS.name.lines[0][1]]);
  const role1 = at(POD.role, [POD_METRICS.role.lines[0][0], POD_METRICS.role.lines[0][1]]);
  const role2 = at(POD.role, [POD_METRICS.role.lines[1][0], POD_METRICS.role.lines[1][1]]);
  const anchorPos = (n, t) => restValueAt(layerProp(L(n), ...T, 'ADBE Position'), t);
  const a1 = anchorPos(POD.arrow1, REST);
  const a2 = anchorPos(POD.arrow2, REST);
  const a1s = dumpKeys(pod, POD.arrow1, ...T, 'ADBE Position')[0].value;
  const a2s = dumpKeys(pod, POD.arrow2, ...T, 'ADBE Position')[0].value;
  const doc = (n) => restValueAt(layerProp(L(n), 'ADBE Text Properties', 'ADBE Text Document'), REST);
  const rise = (n) => layerProp(L(n), 'ADBE Text Properties', 'ADBE Text Animators').children[0].children
    .find((c) => c.matchName === 'ADBE Text Animator Properties').children.find((c) => c.matchName === 'ADBE Text Position 3D').value[1];
  const nd = doc(POD.name);
  const rd = doc(POD.role);
  const leading = rd.leading * S;
  return {
    // the frame window is symmetric (x 105–3735 in 4K): the guest's plate starts as far from the left edge
    corner: { right: r6((3840 - plate.x1) * S), bottom: r6((2160 - plate.y1) * S), left: r6((3840 - plate.x1) * S) },
    plate: { w: r6(plate.w * S), h: r6(plate.h * S) },
    // the pack fits the plate around the name: line start / end (advance) from the plate edges
    nameGapL: r6((nameLeft[0] - plate.x0) * S),
    nameGapR: r6((plate.x1 - nameRight[0]) * S),
    nameBaseline: r6((plate.y1 - nameRight[1]) * S),          // above the plate bottom
    roleIndent: r6((role1[0] - plate.x0) * S),
    roleBaselines: [r6((plate.y1 - role1[1]) * S), r6((plate.y1 - role2[1]) * S)],
    lead: r6(leading),
    // arrow anchors at rest and at the start, relative to the plate edges they belong to (host layout)
    arrow1: { restFromLeft: r6((a1[0] - plate.x0) * S), startFromRight: r6((a1s[0] - plate.x1) * S), dyFromLine2: r6((a1[1] - role2[1]) * S) },
    arrow2: { restFromRight: r6((a2[0] - plate.x1) * S), startFromRight: r6((a2s[0] - plate.x1) * S), dyFromLine1: r6((a2[1] - role1[1]) * S) },
    // the pack's rectangular text masks: the words rise into these bands (above the plate bottom), so the
    // role never crosses the name; FHD px above the plate bottom
    clip: { name: maskBand(L(POD.name), pod, plate), role: maskBand(L(POD.role), pod, plate) },
    name: { font: nd.font, size: r6(nd.fontSize * S), tracking: nd.tracking, rise: r6(rise(POD.name) * S) },
    role: { font: rd.font, size: r6(rd.fontSize * S), tracking: rd.tracking, leading: r6(leading), rise: r6(rise(POD.role) * S) },
  };
}

function maskBand(layer, pod, plate) {
  const m = layer.masks[0].path.value;
  const ys = m.vertices.map((v) => applyPoint(layerToCompAt(pod, layer, REST), v)[1]);
  return { top: r6((plate.y1 - Math.min(...ys)) * S), bottom: r6((plate.y1 - Math.max(...ys)) * S) };
}

// Arrow shapes of the pack (a triangle, and two side by side), their group positions and layer anchors.
export function arrowShapes(pod) {
  const groups = (n) => layerProp(dumpLayer(pod, n), 'ADBE Root Vectors Group').children.filter((g) => g.matchName === 'ADBE Vector Group').map((g) => {
    const vecs = g.children.find((c) => c.matchName === 'ADBE Vectors Group').children;
    const path = vecs.find((c) => c.matchName === 'ADBE Vector Shape - Group').children.find((c) => c.matchName === 'ADBE Vector Shape').value;
    const pos = g.children.find((c) => c.matchName === 'ADBE Vector Transform Group').children.find((c) => c.matchName === 'ADBE Vector Position').value;
    return { path: { closed: path.closed, vertices: path.vertices, inTangents: path.inTangents, outTangents: path.outTangents }, position: pos };
  });
  const anchor = (n) => restValueAt(layerProp(dumpLayer(pod, n), ...T, 'ADBE Anchor Point'), REST).slice(0, 2);
  const scale = (n) => restValueAt(layerProp(dumpLayer(pod, n), ...T, 'ADBE Scale'), REST)[1] / 100 * S;
  return { arrow1: { groups: groups(POD.arrow1), anchor: anchor(POD.arrow1), scale: r6(scale(POD.arrow1)) },
    arrow2: { groups: groups(POD.arrow2), anchor: anchor(POD.arrow2), scale: r6(scale(POD.arrow2)) } };
}

export function podcastRig(pod) {
  const plate = dumpKeys(pod, POD.plate, ...T, 'ADBE Scale');
  const pos = (n) => dumpKeys(pod, n, ...T, 'ADBE Position');
  const shiftIn = (keys, i, dim) => progressSegment(keys, i, { dim, t0: r6(keys[i].time + IN_SHIFT), t1: r6(keys[i + 1].time + IN_SHIFT) });
  const startKeys = (n) => {
    const keys = dumpKeys(pod, n, ...START);
    return toBuilderKeys(keys, { times: keys.map((k, i) => r6(k.time + (i < 2 ? IN_SHIFT : OUT_SHIFT))) });
  };
  return {
    rig: {
      PodIn: shiftIn(plate, 0, 0),
      PodOut: progressSegment(plate, 2, { dim: 1, t0: r6(plate[2].time + OUT_SHIFT), t1: r6(plate[3].time + OUT_SHIFT) }),
      PodArrow1: shiftIn(pos(POD.arrow1), 0),
      PodArrow2: shiftIn(pos(POD.arrow2), 0),
      // the pack's role Start (words over both lines), split between the two role layers by word count
      PodRoleStart: startKeys(POD.role),
    },
    nameStart: startKeys(POD.name),
  };
}

// «Слева» (guest) is the full mirror of the host (user, 2026-10-05: the guest layout broke with a long role):
// the name sits at the anchored edge (right for the host, left for the guest), the role lines align to the
// other side behind its indent, where the single arrow lives; the upper role line keeps clear of the
// double arrow (zone Z1 = the arrow and a gap). Text layers are left-justified and placed by their ink.
export function addPodcast(spec, { layout: L, arrows, keys, hex, pads, timeMap }) {
  const k = 'var k = Math.min(thisComp.width, thisComp.height) / 1080;\n';
  const pre = [
    'var C = thisComp.layer("CTRL"), R = thisComp.layer("RIG");',
    'var k = Math.min(thisComp.width, thisComp.height) / 1080;',
    SIZE_JS,
    'var kt = k * f;',
    'var W = thisComp.width, H = thisComp.height;',
    'var right = C.effect("Side")(1).value == 2;',
    timeMap.trim(),
    'var TT = T(time);',
    'function sv(e) { return R.effect(e)(1).valueAtTime(TT); }',
    'function ink(n) { var r = thisComp.layer(n).sourceRectAtTime(0, false); return { l: r.left * f, w: r.width > 0 ? r.width * f : 0 }; }',
    'var nm = ink("POD_NAME"), r1 = ink("POD_ROLE1"), r2 = ink("POD_ROLE2");',
    'var lines = (r1.w > 0 ? 1 : 0) + (r2.w > 0 ? 1 : 0);',
    'var up = r1.w > 0 ? r1 : r2;',
    // GR: from the plate edge to the name's ink (the pack's gap to the line end + the side bearing of its last letter)
    `var GR = ${L.nameGapR + pads.nameRsb} * kt, PADL = ${pads.nameL} * kt, IND = ${L.roleIndent} * kt, PADR = ${pads.roleR} * kt, Z1 = ${pads.arrowZone} * kt;`,
    'var nameW = nm.w > 0 ? GR + nm.w + PADL : 0;',
    'var roleW = lines > 0 ? IND + Math.max(up.w + Z1, (lines == 2 ? r2.w : 0) + PADR) : 0;',
    // not rounded: the pack's plate edge is fractional too (1066.4 px in 4K); G1 waits for the designer
    'var Wp = Math.max(nameW, roleW);',
    `var LEAD = ${L.lead} * kt, H2 = ${L.plate.h} * kt;`,
    `var Hp = lines == 2 ? H2 : (lines == 1 ? H2 - LEAD : ${pads.noRoleH} * kt);`,
    `var x1 = right ? W - ${L.corner.right} * k : ${L.corner.left} * k + Wp, x0 = x1 - Wp, yb = H - ${L.corner.bottom} * k;`,
    `var b1 = yb - (lines == 2 ? ${L.roleBaselines[0]} : ${L.roleBaselines[1]}) * kt, b2 = yb - ${L.roleBaselines[1]} * kt;`,
    'var pin = sv("PodIn"), pout = sv("PodOut");',
    // grows from its anchored edge, closes down to its bottom edge
    'var px0 = right ? x1 - Wp * pin : x0, px1 = right ? x1 : x0 + Wp * pin, py0 = yb - Hp * (1 - pout);',
    // role lines: after the indent from the far edge (host) or before it from the far edge (guest)
    'function roleX(r) { return right ? x0 + IND : x1 - IND - (r.l + r.w); }',
  ].join('\n') + '\n';
  const a1 = L.arrow1;
  const a2 = L.arrow2;
  const role = (value) => ({ font: L.role.font, size: L.role.size, fill: hex.black, tracking: L.role.tracking, justify: 'LEFT', allCaps: true, value });
  spec.add(
    shape('CLIP_ROLE', [rectGroup('Clip', hex.black)]),
    shape('CLIP_NAME', [rectGroup('Clip', hex.black)]),
    shape('PL_POD', [rectGroup('Plate', hex.gray)]),
    text('POD_ROLE2', role('')),
    text('POD_ROLE1', role('Должность')),
    text('POD_NAME', { font: L.name.font, size: L.name.size, fill: hex.black, tracking: L.name.tracking, justify: 'LEFT', allCaps: true, value: 'Имя Фамилия' }),
    shape('ARROW_1', arrows.arrow1.groups.map((g, i) => pathGroup('Arrow ' + (i + 1), hex.black, [g.path], g.position)), { anchor: arrows.arrow1.anchor }),
    shape('ARROW_2', arrows.arrow2.groups.map((g, i) => pathGroup('Arrow ' + (i + 1), hex.black, [g.path], g.position)), { anchor: arrows.arrow2.anchor }),
  );
  spec.key('POD_NAME', P.start(), keys.nameStart);
  spec.expr('POD_NAME', P.start(), timeMap + 'valueAtTime(T(time))');
  // the pack's role Start ran over the words of both lines: line 1 takes its share of words first
  const words = [
    'function wc(s) { s = String(s).replace(/^\\s+|\\s+$/g, ""); return s.length ? s.split(/\\s+/).length : 0; }',
    'var wa = wc(thisComp.layer("TXT_ROLE1").text.sourceText), wb = wc(thisComp.layer("TXT_ROLE2").text.sourceText);',
    'var fr = wa + wb > 0 ? wa / (wa + wb) : 1;',
    'var S = thisComp.layer("RIG").effect("PodRoleStart")(1).valueAtTime(T(time));',
  ].join('\n') + '\n';
  spec.expr('POD_ROLE1', P.start(), timeMap + words + 'fr > 0 ? linear(S, 0, 100 * fr, 0, 100) : 100');
  spec.expr('POD_ROLE2', P.start(), timeMap + words + 'fr < 1 ? linear(S, 100 * fr, 100, 0, 100) : 100');
  // text clips: the pack's mask band cut by the plate (which grows and then closes down)
  const roleBottom = Math.max(0, L.clip.role.bottom - pads.roleClipDrop);
  for (const [layer, band] of [['CLIP_NAME', L.clip.name], ['CLIP_ROLE', { top: L.clip.role.top + pads.roleClipRaise, bottom: roleBottom }]]) {
    const clip = pre + `var c0 = Math.max(py0, yb - ${band.top} * kt), c1 = yb - ${band.bottom} * kt;\n`;
    spec.expr(layer, P.rectSize('Clip'), clip + '[Math.max(0, px1 - px0), Math.max(0, c1 - c0)]');
    spec.expr(layer, P.rectPos('Clip'), clip + '[(px0 + px1) / 2, (c0 + c1) / 2]');
  }
  spec.expr('PL_POD', P.rectSize('Plate'), pre + '[Math.max(0, px1 - px0), Math.max(0, yb - py0)]');
  spec.expr('PL_POD', P.rectPos('Plate'), pre + '[(px0 + px1) / 2, (py0 + yb) / 2]');
  spec.expr('POD_NAME', P.text, 'String(thisComp.layer("TXT_NAME").text.sourceText)');
  spec.expr('POD_ROLE1', P.text, 'String(thisComp.layer("TXT_ROLE1").text.sourceText)');
  spec.expr('POD_ROLE2', P.text, 'String(thisComp.layer("TXT_ROLE2").text.sourceText)');
  spec.expr('POD_NAME', P.pos, pre + `[right ? x1 - GR - (nm.l + nm.w) : x0 + GR - nm.l, yb - ${L.nameBaseline} * kt]`);
  // one role line stands on the lower slot (b1 = b2 then)
  spec.expr('POD_ROLE1', P.pos, pre + '[roleX(r1), b1]');
  spec.expr('POD_ROLE2', P.pos, pre + '[roleX(r2), b2]');
  spec.expr('POD_NAME', P.rise(), k + `[0, ${L.name.rise} * k, 0]`);
  for (const layer of ['POD_ROLE1', 'POD_ROLE2']) spec.expr(layer, P.rise(), k + `[0, ${pads.roleRise || L.role.rise} * k, 0]`);
  for (const layer of ['POD_NAME', 'POD_ROLE1', 'POD_ROLE2']) spec.expr(layer, P.scale, scaleExpr);
  // arrows: the host's arrows point left and come in from the right; «Слева» mirrors them
  spec.expr('ARROW_1', P.pos, pre + 'var a = sv("PodArrow1");\n' +
    `var rest = right ? x0 + ${a1.restFromLeft} * kt : x1 - ${a1.restFromLeft} * kt, from = right ? x1 + ${a1.startFromRight} * kt : x0 - ${a1.startFromRight} * kt;\n` +
    `[from + (rest - from) * a, b2 + ${a1.dyFromLine2} * kt]`);
  spec.expr('ARROW_2', P.pos, pre + 'var a = sv("PodArrow2");\n' +
    `var rest = right ? x1 + ${a2.restFromRight} * kt : x0 - ${a2.restFromRight} * kt, from = right ? x1 + ${a2.startFromRight} * kt : x0 - ${a2.startFromRight} * kt;\n` +
    `[from + (rest - from) * a, b1 + ${a2.dyFromLine1} * kt]`);
  for (const [n, s] of [['ARROW_1', arrows.arrow1.scale], ['ARROW_2', arrows.arrow2.scale]]) {
    spec.expr(n, P.scale, pre + `[(right ? -1 : 1) * ${r6(s * 100)} * kt, ${r6(s * 100)} * kt]`);
  }
  for (const layer of ['PL_POD', 'POD_ROLE1', 'POD_ROLE2', 'POD_NAME']) spec.expr(layer, P.opacity, visible(2));
  // no role, no arrows
  for (const layer of ['ARROW_1', 'ARROW_2']) {
    spec.expr(layer, P.opacity, pre + 'thisComp.layer("CTRL").effect("Style")(1).value == 2 && lines > 0 ? 100 : 0');
  }
  spec.matte('POD_NAME', 'CLIP_NAME', 'ALPHA', { keepVisible: false });
  spec.matte('POD_ROLE1', 'CLIP_ROLE', 'ALPHA', { keepVisible: false }).matte('POD_ROLE2', 'CLIP_ROLE', 'ALPHA', { keepVisible: false });
  spec.matte('ARROW_1', 'PL_POD').matte('ARROW_2', 'PL_POD');
}
