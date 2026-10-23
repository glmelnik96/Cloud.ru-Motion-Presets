// POD_QR «QR-блок»: one or two QR codes with their handles on green plates and the call «ПОДПИСАТЬСЯ» in the
// bottom corner of the frame's window — the podcast pack's «QR_код_1» (left), «QR_код_2» (right), «QR_код_3» (two
// QRs over the guests) and «Подписывайтесь на канал CLOUD.RU» (centre), 3840x2160, FHD = / 2. The QRs are Media
// Replacement slots (C28) whose default is the Cloud.ru channel QR of the pack (the user, 2026-10-23), drawn as
// vector modules inside the slot's placeholder comp: no footage file goes with the template. The frame round it is
// POD_Frame (its tags on the side the call leaves free). Built from a declarative spec
// (tools/masters/jsx/build-spec.jsx); choices: masters/POD_QR/README.md.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPoint, bbox, multiply, samplePolyline } from '../../tools/dump/geometry.mjs';
import { layerProp, readJson } from '../../tools/dump/model.mjs';
import { workDir, workPath } from '../../tools/lib/work.mjs';
import { layerToCompAt, restValueAt, shapePathsAt } from '../../tools/masters/dump-geometry.mjs';
import { dumpKeys, dumpLayer } from '../../tools/masters/dump-keys.mjs';
import { addQaPatch, canonProgress, dumpSegment } from '../../tools/masters/rig-plate.mjs';
import { nul, P, pathGroup, rectGroup, shape, slot, Spec, text as textLayer } from '../../tools/masters/spec.mjs';
import { regions, SPEED_CTRL, timeMapJs } from '../../tools/masters/speed.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');

export const ID = 'POD_QR';
export const COMP = 'CR_POD_QR';
const FPS = 25;
const DURATION = 8;
const PACK_REST = 4.0;         // the QR scenes: everything at rest 2.1–7.5 s
const REST = 4.0;              // a moment of the hold at every speed: the ink of the texts is read there
const T = ['ADBE Transform Group'];
// the layouts of «Раскладка», in its order: the pack scene, its QR layers (QR 1, QR 2), its handle layers
export const LAYOUTS = [
  { key: 'left', label: 'Слева', scene: 'qr_kod_1', qrs: ['  QR_1'], handles: [['Подпись_QR_1', 'podpis_qr_1_2']], call: ['Подписаться', 'pre_comp_3'] },
  { key: 'right', label: 'Справа', scene: 'qr_kod_2', qrs: ['  QR_2'], handles: [['Подпись_QR_2', 'podpis_qr_2_2']], call: ['Подписаться', 'pre_comp_4_2'] },
  { key: 'centre', label: 'По центру', scene: 'podpisyvaytes_na_kanal_cloud_ru', qrs: ['  QR_3'], handles: [['  QR_3', 'qr_3_2']], call: ['Подписаться', 'pre_comp_4_2'] },
  { key: 'two', label: 'Два QR', scene: 'qr_kod_3', qrs: ['  QR_1', '  QR_2'], handles: [['Подпись_QR_2', 'podpis_qr_2_2'], ['Подпись_QR_1', 'podpis_qr_1_2']], call: ['Подписаться', 'pre_comp_4_2'] },
];
const SLOT_SIZE = 1024;        // the slots are the pack's QR comps, 1024 x 1024
const HANDLE_LAG = 0.48;       // «QR_код_1»: the handle's wipe starts 0.48 s after the QR's
const BAND = 12;               // the clip of a handle reaches under its plate (the _ of a handle hangs 9 px)
const GAP = 40;                // two handles side by side keep 40 px apart (the block shrinks)

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const mean = (list) => r6(list.reduce((s, v) => s + v, 0) / list.length);
const near = (a, b, label, tol = 0.05) => {
  if (Math.abs(a - b) > tol) throw new Error(`${label}: ${a} against ${b}`);
  return r6(b);
};

export function loadSources({ dumps = 'C:/CRBK/work/dumps', repo = REPO } = {}) {
  const names = new Set(LAYOUTS.flatMap((l) => [l.scene, ...l.handles.map((h) => h[1]), l.call[1]]));
  return {
    dumps: Object.fromEntries([...names].map((n) => [n, readJson(path.join(dumps, 'podcast', `${n}.json`))])),
    metrics: JSON.parse(readFileSync(path.join(repo, 'masters', ID, 'source-metrics.json'), 'utf8')),
    tokens: JSON.parse(readFileSync(path.join(repo, 'brand', 'tokens.json'), 'utf8')),
  };
}

const textOf = (layer) => restValueAt(layerProp(layer, 'ADBE Text Properties', 'ADBE Text Document'), PACK_REST);
function inkRow(metrics, comp, layer) {
  const c = metrics.cases.find((x) => x.comp === comp && Math.abs(x.t - PACK_REST) < 1e-6);
  const row = c && Object.values(c.layers).find((l) => l.index === layer.index);
  if (!row) throw new Error(`source-metrics.json: no ${comp} layer #${layer.index}`);
  return row;
}

// A text and its plate inside a precomp layer of a scene, in FHD of the scene: the plate, the ink, the baseline and
// the text size on screen.
function placed(dumps, metrics, scene, outerName, innerName, { plate, text }) {
  const o = dumps[scene];
  const i = dumps[innerName];
  const Mo = layerToCompAt(o, dumpLayer(o, outerName), PACK_REST);
  const pl = dumpLayer(i, plate);
  const pb = bbox(shapePathsAt(i, pl, PACK_REST).flatMap((sp) => samplePolyline(sp)).map((p) => applyPoint(Mo, p)));
  const tx = i.layers.find((l) => l.type === 'text' && (text === undefined || l.name === text));
  const Mt = multiply(Mo, layerToCompAt(i, tx, PACK_REST));
  const row = inkRow(metrics, i.comp.name, tx);
  const [l, t, w, h] = row.rect;
  const a = applyPoint(Mt, [l, t]);
  const b = applyPoint(Mt, [l + w, t + h]);
  const u = (v) => r6(v / 2);
  return {
    plate: { x0: u(pb.x0), x1: u(pb.x1), y0: u(pb.y0), y1: u(pb.y1) },
    ink: { x0: u(a[0]), x1: u(b[0]), y1: u(b[1]) },
    base: u(applyPoint(Mt, [0, row.lines[0][1]])[1]),
    size: r6((row.fontSize * Math.hypot(Mt[2], Mt[3])) / 2),
    font: row.font, tracking: row.tracking, text: textOf(tx).text, layer: tx,
  };
}

// The QR of a scene at rest, FHD: its precomp's top 1024 x 1024 (the centre scene's comp holds the handle under it).
function qrBox(dump, name) {
  const L = dumpLayer(dump, name);
  const m = layerToCompAt(dump, L, PACK_REST);
  const a = applyPoint(m, [0, 0]);
  const b = applyPoint(m, [SLOT_SIZE, SLOT_SIZE]);
  return { x0: r6(a[0] / 2), y0: r6(a[1] / 2), s: r6((b[0] - a[0]) / 2) };
}

// Everything at rest, FHD: the window, the QR boxes of each layout, the handles (plate height, pads, sizes, places)
// and the call. Sides: 'L' a plate grown from its left edge, 'R' from its right edge.
export function qrLayout({ dumps, metrics }) {
  const s1 = dumps.qr_kod_1;
  const line = dumpLayer(s1, 'LIne Comp 1');
  const lm = layerToCompAt(s1, line, PACK_REST);
  const wv = line.masks[0].path.value.vertices.map((p) => applyPoint(lm, p).map((v) => v / 2));
  const win = { x0: r6(Math.min(...wv.map((p) => p[0]))), x1: r6(Math.max(...wv.map((p) => p[0]))), y0: r6(Math.min(...wv.map((p) => p[1]))), y1: r6(Math.max(...wv.map((p) => p[1]))) };
  const rows = [];
  const layouts = LAYOUTS.map((Lo) => {
    const d = dumps[Lo.scene];
    const qrs = Lo.qrs.map((q) => qrBox(d, q));
    const handles = Lo.handles.map(([outer, inner], n) => {
      const h = placed(dumps, metrics, Lo.scene, outer, inner, { plate: 'Shape Layer 1' });
      rows.push(h);
      const q = qrs[n];
      // the plate's anchor: the window edge for the corners, the QR's left edge in the centre
      const side = Lo.key === 'centre' ? 'L' : (Math.abs(h.plate.x0 - win.x0) < 1 ? 'L' : (Math.abs(h.plate.x1 - win.x1) < 1 ? 'R' : null));
      if (!side) throw new Error(`${Lo.scene}: the handle ${n + 1} is at no edge`);
      return { side, x: side === 'L' ? (Lo.key === 'centre' ? q.x0 : win.x0) : win.x1, y0: r6(h.plate.y0), gap: r6(h.plate.y0 - (q.y0 + q.s)), size: h.size, full: Lo.key === 'centre' ? q.s : null, pack: h.text };
    });
    const call = placed(dumps, metrics, Lo.scene, Lo.call[0], Lo.call[1], { plate: 'Cube_3' });
    return { key: Lo.key, label: Lo.label, qrs, handles, call: { side: Math.abs(call.plate.x0 - win.x0) < 1 ? 'L' : 'R', plate: call.plate, ink: call.ink, base: call.base } };
  });
  const H = rows.map((h) => h.plate.y1 - h.plate.y0);
  const calls = layouts.map((l) => l.call);
  const callPack = placed(dumps, metrics, 'podpisyvaytes_na_kanal_cloud_ru', 'Подписаться', 'pre_comp_4_2', { plate: 'Cube_3' });
  return {
    win,
    layouts,
    handle: {
      h: mean(H), pad: mean(rows.flatMap((h) => [h.ink.x0 - h.plate.x0, h.plate.x1 - h.ink.x1])),
      base: mean(rows.map((h) => h.base - h.plate.y1)), font: rows[0].font, tracking: rows[0].tracking,
      size: rows[0].size, sizeCentre: layouts.find((l) => l.key === 'centre').handles[0].size,
    },
    call: {
      h: mean(calls.map((c) => c.plate.y1 - c.plate.y0)), y1: mean(calls.map((c) => c.plate.y1)),
      pad: mean(calls.flatMap((c) => [c.ink.x0 - c.plate.x0, c.plate.x1 - c.ink.x1])),
      base: mean(calls.map((c) => c.base - c.plate.y1)), font: callPack.font, tracking: callPack.tracking, size: callPack.size,
      text: callPack.text,
    },
  };
}

// The pack's curves: the QRs and handles on canon M4 (D19 moves the podcast's mask reveals onto it), the call's
// plate and rise from «Pre-comp 4» (as the centre scene plays it, relative to its QR), its clip that drops at
// the end of the rise to let the Д out.
export function qrTiming({ dumps }, canon) {
  const pc = dumps.pre_comp_4_2;
  const centre = dumps.podpisyvaytes_na_kanal_cloud_ru;
  const qrStart = dumpLayer(centre, '  QR_3').masks[0].path.keys[0].time;
  const plateK = dumpKeys(pc, 'Cube_3', ...T, 'ADBE Scale');
  const txt = pc.layers.find((l) => l.type === 'text');
  const anims = layerProp(txt, 'ADBE Text Properties', 'ADBE Text Animators').children;
  let riseK = null;
  let rise = null;
  for (const a of anims) {
    const p = a.children.find((c) => c.matchName === 'ADBE Text Animator Properties').children.find((c) => c.matchName === 'ADBE Text Position 3D');
    if (p && p.keys && p.keys.length) { riseK = p.keys; rise = p.keys[0].value[1]; }
  }
  const clipK = txt.masks[0].path.keys;
  const scale = Math.hypot(...layerToCompAt(pc, txt, PACK_REST).slice(2, 4));
  const yMax = (k) => Math.max(...k.value.vertices.map((v) => v[1]));
  const seg = (keys, i, label, dim) => ({ ...dumpSegment(keys, i, { label, dim }), t0: r6(keys[i].time - qrStart) });
  const M4 = canon.M4;
  const end = (s) => r6(s.t0 + s.frames / FPS);
  const qrOut = { ...M4.out, t0: r6(DURATION - M4.out.frames / FPS) };
  const t = {
    qrIn: { ...M4.in, t0: 0 },
    handleIn: { ...M4.in, t0: HANDLE_LAG },
    callPlate: seg(plateK, 0, 'call plate', 0),
    // a spatial property: one ease for the whole vector, the speeds zero
    callRise: seg(riseK, 0, 'call rise'),
    callClip: { frames: Math.round((clipK[1].time - clipK[0].time) * FPS), bezier: [0.333333, 0, 0.666667, 1], t0: r6(clipK[0].time - qrStart) },
    qrOut,
    // the handle leaves first, the call with the QR (as «QR_код_1»)
    handleOut: { ...M4.out, t0: r6(qrOut.t0 - 0.08) },
    callOut: { ...M4.out, t0: qrOut.t0 },
    rise: r6((rise * scale) / 2),
    clipDrop: r6(((yMax(clipK[1]) - yMax(clipK[0])) * scale) / 2),
  };
  t.introEnd = Math.max(end(t.qrIn), end(t.handleIn), end(t.callPlate), end(t.callRise), end(t.callClip));
  t.outroStart = Math.min(t.qrOut.t0, t.handleOut.t0, t.callOut.t0);
  return t;
}

// The placeholder of the slots: the Cloud.ru channel QR of the pack as vector modules, a white square under them.
// Each row's runs of dark modules are one rectangle; all of them in one group with one fill (one compound path,
// no seams between neighbours). The first group of a shape layer is drawn in front: the modules, then the paper.
export function qrPlaceholder(qr) {
  const sq = (x0, y0, x1, y1) => ({ vertices: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], inTangents: [[0, 0], [0, 0], [0, 0], [0, 0]], outTangents: [[0, 0], [0, 0], [0, 0], [0, 0]], closed: true });
  const runs = [];
  qr.grid.forEach((row, j) => {
    let i = 0;
    while (i < row.length) {
      if (row[i] !== '1') { i += 1; continue; }
      let e = i;
      while (e < row.length && row[e] === '1') e += 1;
      runs.push(sq(r6(qr.x0 + i * qr.module), r6(qr.x0 + j * qr.module), r6(qr.x0 + e * qr.module), r6(qr.x0 + (j + 1) * qr.module)));
      i = e;
    }
  });
  return {
    name: 'CR_POD_QR_code', w: qr.size, h: qr.size,
    layers: [shape('QR', [pathGroup('Modules', '#000000', runs), pathGroup('Paper', '#FFFFFF', [sq(0, 0, qr.size, qr.size)])])],
  };
}

export function resolveQr(sources = loadSources()) {
  const { metrics, tokens } = sources;
  const base = tokens.color.base;
  const hex = { black: base.black.hex, green: base.green.hex };
  const L = qrLayout(sources);
  const tm = qrTiming(sources, tokens.motion);
  const timeMap = timeMapJs({ introEnd: tm.introEnd, outroStart: tm.outroStart });
  const reg = regions({ introEnd: tm.introEnd, outroStart: tm.outroStart, duration: DURATION, fps: FPS });
  const rig = Object.fromEntries(['qrIn', 'qrOut', 'handleIn', 'handleOut', 'callPlate', 'callRise', 'callClip', 'callOut']
    .map((n) => [n[0].toUpperCase() + n.slice(1), canonProgress(tm[n], tm[n].t0)]));

  const handleStyle = { font: L.handle.font, size: L.handle.size, fill: hex.black, tracking: L.handle.tracking, justify: 'LEFT' };
  const callStyle = { font: L.call.font, size: L.call.size, fill: hex.black, tracking: L.call.tracking, justify: 'LEFT' };
  const centre = L.layouts.findIndex((l) => l.key === 'centre') + 1;
  const text = {
    TXT_HANDLE1: { value: L.layouts[centre - 1].handles[0].pack, label: 'Хэндл 1', style: handleStyle },
    TXT_HANDLE2: { value: '', label: 'Хэндл 2', style: handleStyle },
    TXT_CALL: { value: L.call.text, label: 'Призыв', style: callStyle },
  };
  const ctrl = {
    Layout: { label: 'Раскладка', items: L.layouts.map((l) => l.label), value: centre },
    Speed: SPEED_CTRL,
  };
  const slots = { SLOT_QR1: { label: 'QR 1' }, SLOT_QR2: { label: 'QR 2' } };

  // per layout, by «Раскладка» (1-based): QR boxes [x0, y0, s], handles [side 0 left / 1 right, x, y0, size,
  // full width or 0], the call's side
  const js = (v) => JSON.stringify(v);
  const qrs = L.layouts.map((l) => [0, 1].map((n) => (l.qrs[n] ? [l.qrs[n].x0, l.qrs[n].y0, l.qrs[n].s] : [0, 0, 0])));
  const hs = L.layouts.map((l) => [0, 1].map((n) => (l.handles[n] ? [l.handles[n].side === 'L' ? 0 : 1, l.handles[n].x, l.handles[n].y0, l.handles[n].size, l.handles[n].full || 0] : [0, 0, 0, 0, 0])));
  const two = L.layouts.findIndex((l) => l.key === 'two') + 1;
  const pre = [
    'var C = thisComp.layer("CTRL"), R = thisComp.layer("RIG");',
    'var k = Math.min(thisComp.width, thisComp.height) / 1080;',
    timeMap.trim(),
    'var TT = T(time);',
    'function sl(e, t) { return R.effect(e)(1).valueAtTime(t); }',
    'var lay = C.effect("Layout")(1).value;',
    `var QS = ${js(qrs)}[lay - 1], HS = ${js(hs)}[lay - 1], TWO = lay == ${two};`,
  ].join('\n') + '\n';
  // a QR's visible part: revealed from its top edge, hidden toward the layout's own edge (as the pack's scenes)
  const qrJs = (n) => pre + [
    `var q = QS[${n}], x0 = q[0], y0 = q[1], s = q[2], gi = sl("QrIn", TT), go = sl("QrOut", TT);`,
    'var X0 = x0, X1 = x0 + s, Y0 = y0, Y1 = y0 + s * gi;',
    `if (lay == 1) { X1 = Math.min(X1, x0 + s * (1 - go)); } else if (lay == 2) { X0 = Math.max(X0, x0 + s * go); } else if (lay == ${two}) { Y0 = Math.max(Y0, y0 + s * go); } else { Y1 = Math.min(Y1, y0 + s * (1 - go)); }`,
  ].join('\n') + '\n';
  // a handle: the text's ink at the layout's size, the plate from its anchor (the window edge, or the QR's width in
  // the centre), the text shrunk to fit: in the window, in the QR's width, or the pair with GAP between the two;
  // wiped in from and out to the anchor
  const H = L.handle;
  const winW = r6(L.win.x1 - L.win.x0);
  const handleJs = (n) => pre + [
    // the ink in layer pixels of the variant (its font is the master's x k): back to FHD units
    `function ink(i) { var r = thisComp.layer("TXT_HANDLE" + i).sourceRectAtTime(${REST}, false); return r.width > 0 ? { l: r.left / k, w: r.width / k } : null; }`,
    `var h = HS[${n}], e = ink(${n + 1}), ts = h[3] / ${H.size};`,
    `function tw(i) { var q = ink(i); return q ? q.w * HS[i - 1][3] / ${H.size} : 0; }`,
    `function pads(i) { return ink(i) ? 2 * ${H.pad} : 0; }`,
    `var room = h[4] > 0 ? h[4] - pads(${n + 1}) : (TWO ? ${winW} - ${GAP} - pads(1) - pads(2) : ${winW} - pads(${n + 1}));`,
    `var want = h[4] > 0 || !TWO ? tw(${n + 1}) : tw(1) + tw(2);`,
    `var f = want > room ? Math.max(0.2, room / want) : 1;`,
    `var on = e && (${n} == 0 || TWO), w = !on ? 0 : (h[4] > 0 ? h[4] : (e.w * ts * f + 2 * ${H.pad}));`,
    `var x0 = h[0] == 0 ? h[1] : h[1] - w, y0 = h[2], y1 = h[2] + ${H.h};`,
    'var g = on ? sl("HandleIn", TT) * (1 - sl("HandleOut", TT)) : 0;',
    'var gx0 = h[0] == 0 ? x0 : x0 + w * (1 - g), gx1 = h[0] == 0 ? x0 + w * g : x0 + w;',
  ].join('\n') + '\n';
  // the call: in the bottom corner of the window the layout leaves free, its plate grown from the window edge, the
  // text rising into a clip that drops under the plate at the end of the rise
  const Cc = L.call;
  const sides = js(L.layouts.map((l) => (l.call.side === 'L' ? 0 : 1)));
  const callJs = pre + [
    `var e = (function () { var r = thisComp.layer("TXT_CALL").sourceRectAtTime(${REST}, false); return r.width > 0 ? { l: r.left / k, w: r.width / k } : null; })();`,
    `var right = ${sides}[lay - 1] == 1, w = e ? e.w + 2 * ${Cc.pad} : 0;`,
    `var x0 = right ? ${L.win.x1} - w : ${L.win.x0}, y1 = ${Cc.y1}, y0 = y1 - ${Cc.h};`,
    'var gin = sl("CallPlate", TT), gout = sl("CallOut", TT);',
    'var gx0 = right ? x0 + w * (1 - gin) : x0, gx1 = right ? x0 + w : x0 + w * gin;',
    'if (right) { gx0 = Math.max(gx0, x0 + w * gout); } else { gx1 = Math.min(gx1, x0 + w * (1 - gout)); }',
  ].join('\n') + '\n';

  const spec = new Spec({ name: COMP, w: 1920, h: 1080, fps: FPS, duration: DURATION });
  const ph = qrPlaceholder(metrics.qr);
  // bottom first: the QRs (each under its matte), the plates and clips, the texts
  for (const n of [1, 2]) {
    spec.add(slot(`SLOT_QR${n}`, ph), shape(`QM_${n}`, [rectGroup('Reveal', hex.green)]));
    const q = qrJs(n - 1);
    spec.expr(`SLOT_QR${n}`, P.pos, q + '[(x0 + s / 2) * k, (y0 + s / 2) * k]');
    spec.expr(`SLOT_QR${n}`, P.scale, q + `var sc = 100 * s * k / ${SLOT_SIZE};\n[sc, sc]`);
    if (n === 2) spec.expr('SLOT_QR2', P.opacity, pre + 'TWO ? 100 : 0');
    spec.expr(`QM_${n}`, P.rectSize('Reveal'), q + '[Math.max(0, X1 - X0) * k, Math.max(0, Y1 - Y0) * k]');
    spec.expr(`QM_${n}`, P.rectPos('Reveal'), q + '[(X0 + X1) / 2 * k, (Y0 + Y1) / 2 * k]');
    spec.matte(`SLOT_QR${n}`, `QM_${n}`, 'ALPHA', { keepVisible: false });
  }
  for (const n of [1, 2]) {
    spec.add(shape(`PL_H${n}`, [rectGroup('Plate', hex.green)]), shape(`CL_H${n}`, [rectGroup('Clip', hex.green)]));
    const h = handleJs(n - 1);
    spec.expr(`PL_H${n}`, P.rectSize('Plate'), h + `[Math.max(0, gx1 - gx0) * k, ${H.h} * k]`);
    spec.expr(`PL_H${n}`, P.rectPos('Plate'), h + '[(gx0 + gx1) / 2 * k, (y0 + y1) / 2 * k]');
    spec.expr(`CL_H${n}`, P.rectSize('Clip'), h + `[Math.max(0, gx1 - gx0) * k, (${H.h} + ${BAND}) * k]`);
    spec.expr(`CL_H${n}`, P.rectPos('Clip'), h + `[(gx0 + gx1) / 2 * k, (y0 + y1 + ${BAND}) / 2 * k]`);
  }
  spec.add(shape('PL_CALL', [rectGroup('Plate', hex.green)]), shape('CL_CALL', [rectGroup('Clip', hex.green)]));
  spec.expr('PL_CALL', P.rectSize('Plate'), callJs + `[Math.max(0, gx1 - gx0) * k, ${Cc.h} * k]`);
  spec.expr('PL_CALL', P.rectPos('Plate'), callJs + '[(gx0 + gx1) / 2 * k, (y0 + y1) / 2 * k]');
  const clipJs = callJs + `var cy1 = y1 + ${tm.clipDrop} * sl("CallClip", TT);\n`;
  spec.expr('CL_CALL', P.rectSize('Clip'), clipJs + '[Math.max(0, gx1 - gx0) * k, (cy1 - y0) * k]');
  spec.expr('CL_CALL', P.rectPos('Clip'), clipJs + '[(gx0 + gx1) / 2 * k, (y0 + cy1) / 2 * k]');
  for (const n of [1, 2]) {
    const t = `TXT_HANDLE${n}`;
    spec.add(textLayer(t, { ...handleStyle, value: text[t].value }, []));
    const h = handleJs(n - 1);
    spec.expr(t, P.text, 'String(value).toUpperCase()');
    // the text at the plate's start plus the pad, its baseline on the plate bottom; scaled to the layout's size
    spec.expr(t, P.pos, h + `[(x0 + ${H.pad} - (e ? e.l * ts * f : 0)) * k, (y1 + ${H.base}) * k]`);
    spec.expr(t, P.scale, h + '[100 * ts * f, 100 * ts * f]');
    spec.matte(t, `CL_H${n}`, 'ALPHA', { keepVisible: false });
  }
  spec.add(textLayer('TXT_CALL', { ...callStyle, value: text.TXT_CALL.value }, [{ name: 'Rise', basedOn: 1 }]));
  spec.expr('TXT_CALL', P.text, 'String(value).toUpperCase()');
  spec.expr('TXT_CALL', P.pos, callJs + `[(x0 + ${Cc.pad} - (e ? e.l : 0)) * k, (y1 + ${Cc.base}) * k]`);
  spec.expr('TXT_CALL', P.rise(), pre + `[0, ${tm.rise} * k * (1 - sl("CallRise", TT)), 0]`);
  spec.matte('TXT_CALL', 'CL_CALL', 'ALPHA', { keepVisible: false });
  addQaPatch(spec, hex.green);
  spec.add(nul('RIG', Object.keys(rig).map((name) => ({ kind: 'slider', name })), { shy: true }));
  for (const [name, keys] of Object.entries(rig)) spec.key('RIG', P.slider(name), keys);
  spec.add(nul('CTRL', [
    { kind: 'dropdown', name: 'Layout', items: ctrl.Layout.items, value: ctrl.Layout.value },
    { kind: 'dropdown', name: 'Speed', items: ctrl.Speed.items, value: ctrl.Speed.value },
    { kind: 'checkbox', name: 'QA', value: false },
  ]));

  // AE lists the newest controller first: added in reverse of QR 1, Хэндл 1, QR 2, Хэндл 2, Призыв, Раскладка, Скорость
  const order = [{ slot: 'SLOT_QR1' }, { text: 'TXT_HANDLE1' }, { slot: 'SLOT_QR2' }, { text: 'TXT_HANDLE2' }, { text: 'TXT_CALL' }, { effect: 'Layout' }, { effect: 'Speed' }];
  const egp = [...order].reverse();
  const label = (e) => (e.text ? text[e.text].label : e.slot ? slots[e.slot].label : ctrl[e.effect].label);
  // the guests' handles of the pack, for the comparison only (resolved from the dumps, never written to the repo)
  const packs = Object.fromEntries(L.layouts.map((l) => [l.key, Object.fromEntries(l.handles.map((h, n) => [`TXT_HANDLE${n + 1}`, h.pack]).concat([['TXT_CALL', L.call.text]]))]));
  const built = spec.toJSON();
  return {
    id: ID,
    workDir: workDir(),
    out: { dir: workPath('build', ID), aep: workPath('build', ID, ID + '_work.aep') },
    comp: spec.comp,
    hex,
    layout: L,
    timing: tm,
    text,
    slots,
    packs,
    ctrl,
    egp,
    rig,
    markers: reg.markers,
    duration: reg.duration,
    spec: {
      ...built,
      fonts: [H.font, Cc.font].filter((v, i, a) => a.indexOf(v) === i),
      markers: reg.markers,
      egp: egp.map((e) => (e.text ? { text: e.text, label: label(e) } : e.slot ? { slot: e.slot, label: label(e) } : { effect: e.effect, matchName: 'ADBE Dropdown Control', label: label(e) })),
      egpNames: order.map(label),
      measure: L.layouts.map((l, i) => ({ name: l.key, t: REST, ctrl: { Layout: i + 1 }, text: packs[l.key], layers: ['TXT_HANDLE1', 'TXT_HANDLE2', 'TXT_CALL', 'PL_H1', 'PL_H2', 'PL_CALL', 'QM_1', 'QM_2'] })),
      defaults: { text: Object.fromEntries(Object.entries(text).map(([k, v]) => [k, v.value])), ctrl: { Layout: ctrl.Layout.value, Speed: 2 } },
    },
    check: {},
    version: 1,
    variants: ['16x9', '16x9_4K'].map((key) => ({ key, ...tokens.video.formats[key] })),
    sweepTimes: [0, 0.3, 0.6, 1.0, 1.4, 1.8, 3.0, 5.0, 6.9, 7.3, 7.7, 7.96],
    rest: REST,
  };
}

export const resolve = resolveQr;

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = resolveQr();
  const L = r.layout;
  console.log(JSON.stringify({ layers: r.spec.order, keys: r.spec.keys.length, expressions: r.spec.expressions.length, mattes: r.spec.mattes.length,
    win: L.win, layouts: L.layouts.map((l) => ({ key: l.key, qrs: l.qrs, handles: l.handles.map(({ pack, ...h }) => h), call: l.call.side })), handle: L.handle, call: L.call,
    timing: r.timing, markers: r.markers, duration: r.duration, egp: r.spec.egpNames }, null, 1).slice(0, 7000));
}
