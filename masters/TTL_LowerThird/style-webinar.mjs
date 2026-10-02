// Style 3 «Вебинар» of TTL_LowerThird, from the webinars pack «Заставка со спикером»: one plate per line
// (name with a comma, role 1, role 2), SB Sans Display Regular 35 px, tracking 19, white on #222222. The
// pack's title does not move; the motion here is the «Титры» family line by line (0.24 s apart), new and
// provisional (see README). Each line's text sits in its own plate (the pack's text ran at a 47 px step
// over plates at 49.25 px).
import { dumpLayer } from '../../tools/masters/dump-keys.mjs';
import { shapeBoxAt, textBaselineAt } from '../../tools/masters/dump-geometry.mjs';
import { P, rectGroup, shape, text } from '../../tools/masters/spec.mjs';
import { bandExpr, PLATE_PRE, plateExpr, visible } from './style-titles.mjs';

const REST = 5.0;
export const WEB = { plates: ['Layer 5 Outlines 2', 'Layer 4 Outlines 3', 'Layer 4 Outlines 4'], textIndex: 1 };
export const STAGGER = 0.24;
const r6 = (v) => Math.round(v * 1e6) / 1e6;

export function webinarLayout(web) {
  const plates = WEB.plates.map((n) => shapeBoxAt(web, dumpLayer(web, n), REST));
  const t = textBaselineAt(web, web.layers.find((l) => l.index === WEB.textIndex), REST);
  return {
    h: r6(plates[0].h),
    step: 49,                                       // the pack: 49.25 and 49.0 (1 px overlap)
    textX: r6(t.origin[0] - plates[0].x0),
    baseline: r6(t.baseline - plates[0].y0),
    font: t.doc.font,
    size: t.doc.fontSize,
    tracking: t.doc.tracking,
    rise: r6(t.doc.fontSize * 1.125),               // the «Титры» rise, 1.125 em
    widths: plates.map((p) => r6(p.w)),
  };
}

const shiftKeys = (keys, dt) => keys.map((k) => ({ ...k, t: r6(k.t + dt) }));

// Line i grows STAGGER * i after line 1; the exit runs the other way round (line 3 first), ending where the
// «Титры» name ends.
export function webinarRig(titlesRig, nameStart) {
  const rig = {};
  for (let i = 0; i < 3; i += 1) {
    rig['WebIn' + (i + 1)] = shiftKeys(titlesRig.NameIn, STAGGER * i);
    rig['WebOut' + (i + 1)] = shiftKeys(titlesRig.NameOut, -STAGGER * i);
  }
  const starts = [0, 1, 2].map((i) => shiftKeys(nameStart, STAGGER * i));
  return { rig, starts };
}

export function addWebinar(spec, { layout: L, keys, hex, pads }) {
  const k = 'var k = Math.min(thisComp.width, thisComp.height) / 1080;\n';
  const pre = PLATE_PRE + [
    'function txt(n) { return String(thisComp.layer(n).text.sourceText); }',
    'var has = [txt("TXT_NAME").length > 0, txt("TXT_ROLE1").length > 0, txt("TXT_ROLE2").length > 0];',
    'var slot = [0, has[0] ? 1 : 0, (has[0] ? 1 : 0) + (has[1] ? 1 : 0)];',
    `var H1 = ${L.h} * k, STEP = ${L.step} * k, TX = ${L.textX} * k, PR = ${pads.webR} * k;`,
    'var y0 = H - M - (STEP * 2 + H1);',
    'function wid(n) { var e = ink(n); return e > 0 ? Math.round((TX + e + PR) / k) * k : 0; }',
    'var w = [wid("WEB_L1"), wid("WEB_L2"), wid("WEB_L3")];',
    'function xl(i) { return right ? W - M - w[i] : M; }',
    'function yt(i) { return y0 + slot[i] * STEP; }',
  ].join('\n') + '\n';
  spec.add(
    shape('PL_WEB3', [rectGroup('Plate', hex.black)]),
    shape('PL_WEB2', [rectGroup('Plate', hex.black)]),
    shape('PL_WEB1', [rectGroup('Plate', hex.black)]),
  );
  for (let i = 3; i >= 1; i -= 1) {
    spec.add(text('WEB_L' + i, { font: L.font, size: L.size, fill: hex.white, tracking: L.tracking, justify: 'LEFT', value: i === 1 ? 'Имя Фамилия,' : (i === 2 ? 'Должность' : '') }));
  }
  spec.add(shape('EDGE_WEB', [1, 2, 3].flatMap((i) => [rectGroup('In' + i, hex.white), rectGroup('Out' + i, hex.white)])));
  spec.expr('WEB_L1', P.text, 'var s = String(thisComp.layer("TXT_NAME").text.sourceText);\ns.length ? s + "," : ""');
  spec.expr('WEB_L2', P.text, 'String(thisComp.layer("TXT_ROLE1").text.sourceText)');
  spec.expr('WEB_L3', P.text, 'String(thisComp.layer("TXT_ROLE2").text.sourceText)');
  for (let i = 1; i <= 3; i += 1) {
    const j = i - 1;
    const p = plateExpr(pre, `xl(${j})`, `w[${j}]`, 'H1', `yt(${j})`, 'WebIn' + i, 'WebOut' + i);
    spec.expr('PL_WEB' + i, P.rectSize('Plate'), p.size).expr('PL_WEB' + i, P.rectPos('Plate'), p.pos);
    for (const which of ['in', 'out']) {
      const b = bandExpr(pre, `xl(${j})`, `w[${j}]`, 'H1', `yt(${j})`, 'WebIn' + i, 'WebOut' + i, which);
      const g = (which === 'in' ? 'In' : 'Out') + i;
      spec.expr('EDGE_WEB', P.rectSize(g), b.size).expr('EDGE_WEB', P.rectPos(g), b.pos);
    }
    spec.expr('WEB_L' + i, P.pos, pre + `[xl(${j}) + TX, yt(${j}) + ${L.baseline} * k]`);
    spec.expr('WEB_L' + i, P.rise(), k + `[0, ${L.rise} * k, 0]`);
    spec.key('WEB_L' + i, P.start(), keys.starts[j]);
    spec.matte('WEB_L' + i, 'PL_WEB' + i);
  }
  for (const layer of ['PL_WEB3', 'PL_WEB2', 'PL_WEB1', 'WEB_L3', 'WEB_L2', 'WEB_L1', 'EDGE_WEB']) spec.expr(layer, P.opacity, visible(3));
}
