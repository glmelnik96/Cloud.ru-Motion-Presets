// TTL_Disclaimer «Дисклеймер»: the full-frame card of the podcast pack «Дисклеймер» (3840x2160, FHD = / 2).
// Exactly as the pack (user, 2026-10-20: «Точно, как в пакете»): its decoration — the stepped line with the
// stripes, the globe pattern, the arrows, the numbers, the bullet and the grey card — is moved over from the
// pack as it is (spec.transplant: the relinked working copy is imported at build time and the layers are
// kept in two 4K comps, DECOR_HIGH over the title and DECOR_LOW under it); the texts are the master's own:
// five lines on white plates that grow from the left while their words rise and fade in, one after another
// across the lines, and the title on a green plate in the corner of the window, the plate growing from the
// right and the word rising out of it. The decoration keeps moving in the hold (the globe turns), so its
// time runs on after the intro (liveTimeJs); the pack has no exit. Choices: masters/TTL_Disclaimer/README.md.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPoint } from '../../tools/dump/geometry.mjs';
import { layerProp, readJson } from '../../tools/dump/model.mjs';
import { packProject } from '../../tools/dump/dump.mjs';
import { workDir, workPath } from '../../tools/lib/work.mjs';
import { layerToCompAt, restValueAt, shapeBoxAt, shapePathsAt } from '../../tools/masters/dump-geometry.mjs';
import { dumpKeys, dumpLayer } from '../../tools/masters/dump-keys.mjs';
import { addQaPatch, canonProgress, dumpSegment, START } from '../../tools/masters/rig-plate.mjs';
import { nul, P, precomp, rectGroup, shape, Spec, text as textLayer } from '../../tools/masters/spec.mjs';
import { liveTimeJs, regions, SPEED_CTRL, timeMapJs } from '../../tools/masters/speed.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');

export const ID = 'TTL_Disclaimer';
export const COMP = 'CR_TTL_Disclaimer';
const FPS = 25;
const DURATION = 10;           // the pack's length; the hold runs to the end (no exit in the pack)
const PACK_REST = 4.0;         // the pack: everything but the decoration at rest from 1.44 s
// a moment of the hold at every speed (0,75×: from 1.92 s): the ink of the texts is read there
const REST = 4.0;
// the decoration comps run this long: the latest decoration time is 1.44 + (10 - 1.44 / 2) = 10.72 s at 2×
const DECOR_SEC = 12;
const T = ['ADBE Transform Group'];
export const PACK_COMP = { name: 'Дисклеймер', id: 134, w: 3840, h: 2160, layers: 22 };
// the pack's layers moved over, top first: over the title and under it
export const DECOR = {
  DECOR_HIGH: ['2', '1', 'Strelka_1', 'Strelka_3', 'Strelka_2', 'Tiangle_1', 'Pattern_1'],
  DECOR_LOW: ['Vert_lines_1 Comp 1', 'Verts_lines_2 Comp 1', 'Lines', 'Light Gray Solid 4'],
};
// precomps of DECOR_LOW that end with the pack comp (10 s): longer with it
const EXTEND = ['Vert_lines_1 Comp 1', 'Verts_lines_2 Comp 1'];
const BODY_PLATES = ['Shape Layer 1', 'Shape Layer 2', 'Shape Layer 3', 'Shape Layer 4', 'Shape Layer 5'];
const TITLE = { text: 'ДИСКЛЕЙМЕР', plate: 'Green_cube_1', clip: 'Green_cube_2' };
export const LINES = 5;
const TXT = Array.from({ length: LINES }, (_, i) => `TXT_${i + 1}`);
const PL = Array.from({ length: LINES }, (_, i) => `PL_${i + 1}`);

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const mean = (list) => r6(list.reduce((s, v) => s + v, 0) / list.length);
const hex2 = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();

export function loadSources({ dumps = 'C:/CRBK/work/dumps', repo = REPO } = {}) {
  return {
    disc: readJson(path.join(dumps, 'podcast', 'diskleymer.json')),
    metrics: JSON.parse(readFileSync(path.join(repo, 'masters', ID, 'source-metrics.json'), 'utf8')),
    tokens: JSON.parse(readFileSync(path.join(repo, 'brand', 'tokens.json'), 'utf8')),
  };
}

function bodyLayer(disc) {
  const hits = disc.layers.filter((l) => l.type === 'text' && l.name.startsWith('ВСЕ МНЕНИЯ'));
  if (hits.length !== 1) throw new Error(`Дисклеймер: ${hits.length} body texts`);
  return hits[0];
}

function metricsOf(metrics, name) {
  const c = metrics.cases.find((x) => x.comp === PACK_COMP.name && Math.abs(x.t - PACK_REST) < 1e-6);
  const row = c && c.layers[name];
  if (!row) throw new Error(`source-metrics.json: no ${PACK_COMP.name} at ${PACK_REST} s, layer "${name.slice(0, 30)}"`);
  return row;
}

// A plate of the pack at rest: a quad drawn by hand (its right end 1–1.5 px lower), as the mean of its edges.
function quadAt(disc, name, t) {
  const v = shapePathsAt(disc, dumpLayer(disc, name), t)[0].vertices.map(([x, y]) => [x / 2, y / 2]);
  if (v.length !== 4) throw new Error(`${name}: ${v.length} vertices`);
  const byX = [...v].sort((a, b) => a[0] - b[0]);
  const byY = [...v].sort((a, b) => a[1] - b[1]);
  return {
    x0: mean([byX[0][0], byX[1][0]]), x1: mean([byX[2][0], byX[3][0]]),
    y0: mean([byY[0][1], byY[1][1]]), y1: mean([byY[2][1], byY[3][1]]),
  };
}

// The texts of the pack at rest, FHD: the body's five lines (their origin, baselines, plates) and the title
// with its plate and the clip (its matte) under the plate.
export function disclaimerLayout({ disc, metrics }) {
  const body = bodyLayer(disc);
  const bm = layerToCompAt(disc, body, PACK_REST);
  const bRow = metricsOf(metrics, body.name);
  const scaleY = Math.hypot(bm[2], bm[3]);
  const lines = bRow.lines.map(([x0, y0, x1]) => ({
    origin: r6(applyPoint(bm, [x0, y0])[0] / 2), baseline: r6(applyPoint(bm, [x0, y0])[1] / 2), advanceEnd: r6(applyPoint(bm, [x1, y0])[0] / 2),
  }));
  if (lines.length !== LINES) throw new Error(`Дисклеймер: ${lines.length} body lines`);
  // the plates top first, by their place
  const plates = BODY_PLATES.map((name) => ({ name, ...quadAt(disc, name, PACK_REST) })).sort((a, b) => a.y0 - b.y0);
  const origin = mean(lines.map((l) => l.origin));
  const left = mean(plates.map((p) => p.x0));
  const step = mean(lines.slice(1).map((l, i) => l.baseline - lines[i].baseline));
  const bodyDoc = restValueAt(layerProp(body, 'ADBE Text Properties', 'ADBE Text Document'), PACK_REST);
  const bodyAnim = layerProp(body, 'ADBE Text Properties', 'ADBE Text Animators').children[0].children
    .find((c) => c.matchName === 'ADBE Text Animator Properties').children;
  const animValue = (mn) => bodyAnim.find((c) => c.matchName === mn).value;
  // the right end of the box text: the room the lines have
  const box = bodyDoc.boxTextPos[0] + bodyDoc.boxTextSize[0];

  const title = dumpLayer(disc, TITLE.text);
  const tm = layerToCompAt(disc, title, PACK_REST);
  const tRow = metricsOf(metrics, TITLE.text);
  const tScale = Math.hypot(tm[2], tm[3]);
  const [tl, , tw] = tRow.rect;
  const plate = shapeBoxAt(disc, dumpLayer(disc, TITLE.plate), PACK_REST);
  const clipKeys = dumpKeys(disc, TITLE.clip, ...T, 'ADBE Position');
  const clip0 = shapeBoxAt(disc, dumpLayer(disc, TITLE.clip), clipKeys[0].time);
  const clip1 = shapeBoxAt(disc, dumpLayer(disc, TITLE.clip), PACK_REST);
  const titleDoc = restValueAt(layerProp(title, 'ADBE Text Properties', 'ADBE Text Document'), PACK_REST);
  const titleRise = layerProp(title, 'ADBE Text Properties', 'ADBE Text Animators').children[0].children
    .find((c) => c.matchName === 'ADBE Text Animator Properties').children.find((c) => c.matchName === 'ADBE Text Position 3D').value[1];
  const u = (v) => r6(v / 2);
  const tInk = { x0: u(applyPoint(tm, [tl, 0])[0]), x1: u(applyPoint(tm, [tl + tw, 0])[0]) };
  const tBase = u(applyPoint(tm, [0, tRow.lines[0][1]])[1]);
  return {
    body: {
      font: bodyDoc.font, size: r6((bodyDoc.fontSize * scaleY) / 2), tracking: bodyDoc.tracking, fill: hex2(bodyDoc.fillColor),
      origin, left, step,
      baselines: lines.map((l) => l.baseline),
      advanceEnds: lines.map((l) => l.advanceEnd),
      plates: plates.map((p) => ({ name: p.name, x1: p.x1, y0: p.y0, y1: p.y1 })),
      boxRight: u(applyPoint(bm, [box, 0])[0]),
      rise: r6((animValue('ADBE Text Position 3D')[1] * scaleY) / 2),
      opacity: animValue('ADBE Text Opacity'),
      text: bRow.text.split('\r'),
    },
    title: {
      font: titleDoc.font, size: r6((titleDoc.fontSize * tScale) / 2), tracking: titleDoc.tracking, fill: hex2(titleDoc.fillColor),
      plate: { x0: u(plate.x0), x1: u(plate.x1), y0: u(plate.y0), y1: u(plate.y1) },
      padL: r6(tInk.x0 - u(plate.x0)), padR: r6(u(plate.x1) - tInk.x1),
      base: r6(u(plate.y1) - tBase),
      clip: { dx0: r6(u(clip1.x0) - u(plate.x0)), dx1: r6(u(clip1.x1) - u(plate.x1)), top: u(clip0.y0), bottom: u(clip0.y1), drop: r6(u(clip1.y1) - u(clip0.y1)) },
      rise: r6((titleRise * tScale) / 2),
      text: tRow.text,
    },
  };
}

// The right pad of the body plates: the pack's plate ends against the ink of each line on its own, which the
// master measures (source-metrics.json -> master, from the build's «pack» measurement); before that, the
// line advance (provisional).
export function bodyPadR(L, metrics) {
  const ink = metrics.master && metrics.master.lines;
  if (!ink) return { padR: mean(L.body.plates.map((p, i) => p.x1 - L.body.advanceEnds[i])), provisional: true };
  return { padR: mean(L.body.plates.map((p, i) => p.x1 - (L.body.origin + ink[i][0] + ink[i][2]))), provisional: false, ink };
}

// The pack's curves: plates of the lines (their own delays and lengths), the words (one linear sweep over all
// of them), the title plate, rise and the clip that lets the descenders out at the end.
export function disclaimerTiming({ disc }, L) {
  const scaleSeg = (name) => {
    const keys = dumpKeys(disc, name, ...T, 'ADBE Scale');
    return { ...dumpSegment(keys, 0, { dim: 0, label: `${name} scale` }), t0: r6(keys[0].time) };
  };
  const body = bodyLayer(disc);
  const words = layerProp(body, ...START).keys;
  if (words.length !== 2 || words.some((k) => k.inInterp !== 'LINEAR' || k.outInterp !== 'LINEAR')) throw new Error('Дисклеймер: the words are no longer one linear sweep');
  const titleStart = dumpKeys(disc, TITLE.text, ...START);
  const clip = dumpKeys(disc, TITLE.clip, ...T, 'ADBE Position');
  return {
    plates: L.body.plates.map((p) => scaleSeg(p.name)),
    words: { t0: r6(words[0].time), t1: r6(words[1].time) },
    titlePlate: scaleSeg(TITLE.plate),
    titleRise: { ...dumpSegment(titleStart, 0, { label: 'title start' }), t0: r6(titleStart[0].time) },
    titleClip: { ...dumpSegment(clip, 0, { label: 'title clip' }), t0: r6(clip[0].time) },
  };
}

export function resolveDisclaimer(sources = loadSources()) {
  const { disc, metrics, tokens } = sources;
  const base = tokens.color.base;
  const hex = { black: base.black.hex, white: base.white.hex, green: base.green.hex };
  const L = disclaimerLayout(sources);
  const tm = disclaimerTiming(sources, L);
  const pad = bodyPadR(L, metrics);
  const end = (s) => r6(s.t0 + s.frames / FPS);
  const introEnd = Math.max(...tm.plates.map(end), tm.words.t1, end(tm.titlePlate), end(tm.titleRise), end(tm.titleClip));
  const timeMap = timeMapJs({ introEnd, outroStart: null });
  const reg = regions({ introEnd, outroStart: null, duration: DURATION, fps: FPS });
  const rig = {
    ...Object.fromEntries(tm.plates.map((s, i) => [`Plate${i + 1}`, canonProgress(s, s.t0)])),
    Words: [
      { t: tm.words.t0, v: 0, inType: 'LINEAR', outType: 'LINEAR' },
      { t: tm.words.t1, v: 1, inType: 'LINEAR', outType: 'LINEAR' },
    ],
    TitlePlate: canonProgress(tm.titlePlate, tm.titlePlate.t0),
    TitleRise: canonProgress(tm.titleRise, tm.titleRise.t0),
    TitleClip: canonProgress(tm.titleClip, tm.titleClip.t0),
  };

  const B = L.body;
  const bodyStyle = { font: B.font, size: B.size, fill: B.fill, tracking: B.tracking, justify: 'LEFT' };
  const titleStyle = { font: L.title.font, size: L.title.size, fill: hex.black, tracking: L.title.tracking, justify: 'LEFT' };
  const text = {
    TITLE: { value: L.title.text, label: 'Заголовок', style: titleStyle },
    ...Object.fromEntries(TXT.map((t, i) => [t, { value: B.text[i], label: `Строка ${i + 1}`, style: bodyStyle }])),
  };
  const ctrl = { Speed: SPEED_CTRL };

  // The block of lines scales about the bullet's height on the plates' left edge (the bullet stays on line 1)
  // when the longest line would pass the right end of the pack's text box: Fit on RIG.
  const bullet = r6(restValueAt(layerProp(dumpLayer(disc, 'Tiangle_1'), ...T, 'ADBE Position'), PACK_REST)[1] / 2);
  const pre = [
    'var C = thisComp.layer("CTRL"), R = thisComp.layer("RIG");',
    'var k = Math.min(thisComp.width, thisComp.height) / 1080;',
    timeMap.trim(),
    'var TT = T(time);',
    'function sl(e, t) { return R.effect(e)(1).valueAtTime(t); }',
    `function ink(n) { var r = thisComp.layer(n).sourceRectAtTime(${REST}, false); return r.width > 0 ? { l: r.left, r: r.left + r.width } : null; }`,
  ].join('\n') + '\n';
  const block = pre + [
    'var f = R.effect("Fit")(1).value;',
    `var OX = ${B.left} * k, OY = ${bullet} * k;`,
    'function px(x) { return OX + (x * k - OX) * f; }',
    'function py(y) { return OY + (y * k - OY) * f; }',
  ].join('\n') + '\n';
  const wordsJs = 'function words(n) { var s = String(thisComp.layer(n).text.sourceText).split(/\\s+/), c = 0; for (var i = 0; i < s.length; i++) { if (s[i].length) { c++; } } return c; }\n';

  const spec = new Spec({ name: COMP, w: 1920, h: 1080, fps: FPS, duration: DURATION });
  // bottom first: the card and its stripes, the title, the decoration over it, the plates, the lines
  spec.add(precomp('DECOR_LOW', 'DECOR_LOW', { timeRemap: true }));
  spec.add(shape('PL_TITLE', [rectGroup('Plate', hex.green)]), shape('CL_TITLE', [rectGroup('Clip', hex.green)]));
  spec.add(textLayer('TITLE', { ...titleStyle, value: text.TITLE.value }, [{ name: 'Rise', basedOn: 3 }]));
  spec.add(precomp('DECOR_HIGH', 'DECOR_HIGH', { timeRemap: true }));
  for (let i = LINES - 1; i >= 0; i -= 1) spec.add(shape(PL[i], [rectGroup('Plate', hex.white)]));
  for (let i = LINES - 1; i >= 0; i -= 1) spec.add(textLayer(TXT[i], { ...bodyStyle, value: text[TXT[i]].value }, [{ name: 'Rise', basedOn: 3, opacity: B.opacity }]));

  // the decoration: the pack's 4K comps over the whole frame, on their own time
  for (const d of Object.keys(DECOR)) {
    spec.expr(d, P.pos, '[thisComp.width / 2, thisComp.height / 2]');
    spec.expr(d, P.scale, 'var s = 100 * thisComp.width / 3840;\n[s, s]');
    spec.expr(d, P.timeRemap, liveTimeJs({ introEnd }) + 'TL(time)');
  }

  // the lines: on the pack's baselines from its text origin; words rise and fade in one after another across
  // all lines (the pack's one sweep), each line's selector covering its share of the words
  const counts = `var n = [${TXT.map((t) => `words("${t}")`).join(', ')}];\n`;
  for (let i = 0; i < LINES; i += 1) {
    spec.expr(TXT[i], P.text, 'String(value).toUpperCase()');
    spec.expr(TXT[i], P.pos, block + `[px(${B.origin}), py(${B.baselines[i]})]`);
    spec.expr(TXT[i], P.scale, block + '[100 * f, 100 * f]');
    spec.expr(TXT[i], P.rise(), 'var k = Math.min(thisComp.width, thisComp.height) / 1080;\n' + `[0, ${B.rise} * k, 0]`);
    spec.expr(TXT[i], P.start(), pre + wordsJs + counts + [
      `var W = 0, w0 = 0; for (var i = 0; i < ${LINES}; i++) { W += n[i]; if (i < ${i}) { w0 += n[i]; } }`,
      'var s = sl("Words", TT) * W;',
      `n[${i}] > 0 ? 100 * Math.min(1, Math.max(0, (s - w0) / n[${i}])) : 100`,
    ].join('\n'));
    // a plate from the plates' left edge to PAD past the ink, the pack's height and bottom; one pixel into
    // the plate below when there is one (two anti-aliased edges in a pixel row leave a seam)
    const p = B.plates[i];
    const below = i < LINES - 1 ? `ink("${TXT[i + 1]}") ? 1 : 0` : '0';
    const plateJs = block + [
      `var e = ink("${TXT[i]}"), g = e ? sl("Plate${i + 1}", TT) : 0;`,
      `var x0 = px(${B.left}), x1 = e ? px(${B.origin}) + (e.r + ${r6(pad.padR)} * k) * f : x0;`,
      `var y0 = py(${p.y0}), y1 = py(${p.y1}) + (${below});`,
    ].join('\n') + '\n';
    spec.expr(PL[i], P.rectSize('Plate'), plateJs + '[(x1 - x0) * g, y1 - y0]');
    spec.expr(PL[i], P.rectPos('Plate'), plateJs + '[x0 + (x1 - x0) * g / 2, (y0 + y1) / 2]');
  }
  spec.expr('RIG', P.slider('Fit'), pre + [
    `var m = 0; ${TXT.map((t) => `var e${t.slice(4)} = ink("${t}"); if (e${t.slice(4)}) { m = Math.max(m, e${t.slice(4)}.r); }`).join(' ')}`,
    `var A = ${r6(B.boxRight - B.origin)} * k;`,
    'm > A ? A / m : 1',
  ].join('\n'));

  // the title: right-aligned in the window's corner, the plate PAD round its ink, grown from the right; the
  // word rises out of the clip, which drops at the end to let the descenders out under the plate
  const Tt = L.title;
  const titleJs = pre + [
    'var e = ink("TITLE");',
    `var x1 = ${Tt.plate.x1} * k, w = e ? e.r - e.l + ${r6(Tt.padL + Tt.padR)} * k : 0, y0 = ${Tt.plate.y0} * k, y1 = ${Tt.plate.y1} * k;`,
    'var g = sl("TitlePlate", TT), d = sl("TitleClip", TT);',
  ].join('\n') + '\n';
  spec.expr('PL_TITLE', P.rectSize('Plate'), titleJs + '[w * g, y1 - y0]');
  spec.expr('PL_TITLE', P.rectPos('Plate'), titleJs + '[x1 - w * g / 2, (y0 + y1) / 2]');
  const clipJs = titleJs + `var cx0 = x1 - w + ${Tt.clip.dx0} * k, cx1 = x1 + ${Tt.clip.dx1} * k, cy0 = (${Tt.clip.top} + ${Tt.clip.drop} * d) * k, cy1 = (${Tt.clip.bottom} + ${Tt.clip.drop} * d) * k;\n`;
  spec.expr('CL_TITLE', P.rectSize('Clip'), clipJs + '[Math.max(0, cx1 - cx0), cy1 - cy0]');
  spec.expr('CL_TITLE', P.rectPos('Clip'), clipJs + '[(cx0 + cx1) / 2, (cy0 + cy1) / 2]');
  spec.expr('TITLE', P.text, 'String(value).toUpperCase()');
  spec.expr('TITLE', P.pos, titleJs + `[x1 - ${Tt.padR} * k - (e ? e.r : 0), y1 - ${Tt.base} * k]`);
  spec.expr('TITLE', P.rise(), 'var k = Math.min(thisComp.width, thisComp.height) / 1080;\n' + `[0, ${Tt.rise} * k, 0]`);
  spec.expr('TITLE', P.start(), pre + '100 * sl("TitleRise", TT)');
  spec.matte('TITLE', 'CL_TITLE', 'ALPHA', { keepVisible: false });

  addQaPatch(spec, hex.green);
  spec.add(nul('RIG', [...Object.keys(rig).map((name) => ({ kind: 'slider', name })), { kind: 'slider', name: 'Fit', value: 1 }], { shy: true }));
  for (const [name, keys] of Object.entries(rig)) spec.key('RIG', P.slider(name), keys);
  spec.add(nul('CTRL', [
    { kind: 'dropdown', name: 'Speed', items: ctrl.Speed.items, value: ctrl.Speed.value },
    { kind: 'checkbox', name: 'QA', value: false },
  ]));

  // AE lists the newest controller first: added in reverse of Заголовок, Строка 1–5, Скорость
  const egp = [{ effect: 'Speed' }, ...[...TXT].reverse().map((t) => ({ text: t })), { text: 'TITLE' }];
  const pack = Object.fromEntries([['TITLE', Tt.text], ...TXT.map((t, i) => [t, B.text[i]])]);
  const built = spec.toJSON();
  const keep = (names) => names.map((name) => {
    const hits = disc.layers.filter((l) => l.name === name);
    if (hits.length !== 1) throw new Error(`Дисклеймер: ${hits.length} layers named ${name}`);
    return { index: hits[0].index, name };
  });
  return {
    id: ID,
    workDir: workDir(),
    out: { dir: workPath('build', ID), aep: workPath('build', ID, ID + '_work.aep') },
    comp: spec.comp,
    hex,
    layout: L,
    pad,
    timing: { ...tm, introEnd },
    text,
    ctrl,
    egp,
    rig,
    markers: reg.markers,
    duration: reg.duration,
    spec: {
      ...built,
      fonts: [B.font, Tt.font].filter((v, i, a) => a.indexOf(v) === i),
      markers: reg.markers,
      transplant: {
        aep: packProject('podcast'),
        folder: 'BK_DECOR',
        source: { name: PACK_COMP.name, w: PACK_COMP.w, h: PACK_COMP.h, layers: PACK_COMP.layers },
        comps: Object.entries(DECOR).map(([name, names]) => ({ name, keep: keep(names), duration: DECOR_SEC })),
        extend: EXTEND.map((comp) => ({ comp, duration: DECOR_SEC })),
      },
      egp: egp.map((e) => (e.text ? { text: e.text, label: text[e.text].label } : { effect: e.effect, matchName: 'ADBE Dropdown Control', label: ctrl[e.effect].label })),
      egpNames: [text.TITLE.label, ...TXT.map((t) => text[t].label), ctrl.Speed.label],
      measure: [{ name: 'pack', t: REST, ctrl: {}, text: pack, layers: [...TXT, 'TITLE', ...PL, 'PL_TITLE'] }],
      defaults: { text: Object.fromEntries(Object.entries(text).map(([k, v]) => [k, v.value])), ctrl: { Speed: 2 } },
    },
    check: pack,
    version: 1,
    variants: ['16x9', '16x9_4K'].map((key) => ({ key, ...tokens.video.formats[key] })),
    sweepTimes: [0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.44, 2.0, 4.0, 6.0, 8.0, 9.96],
    rest: REST,
  };
}

export const resolve = resolveDisclaimer;

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = resolveDisclaimer();
  console.log(JSON.stringify({ layers: r.spec.order, keys: r.spec.keys.length, expressions: r.spec.expressions.length, mattes: r.spec.mattes.length,
    layout: r.layout, pad: r.pad, timing: r.timing, markers: r.markers, duration: r.duration, transplant: r.spec.transplant }, null, 1).slice(0, 9000));
}
