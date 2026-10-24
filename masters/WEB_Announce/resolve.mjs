// WEB_Announce «Анонс вебинара»: the webinars pack's announce posts «Анонс_Вебинар_1x1» (1400x1400) and
// «Анонс_Вебинар_9x16» as one T1 template whose layout follows its frame:
// - the square: «Вебинар ↗ <дата> ↗» and the title in white centred on the dark ground, the visual in a light card
//   with two notches (the logo in the lower one); the notches drift on the canon M10 (D19), as the portal does;
// - the vertical: a mint card with the date line and the dark title, the visual's window over its lower corner,
//   the pack's dot clusters drawn as squares (no footage outside the slot).
// The visual is a Media Replacement slot (C28) that takes video, so the master is `trim` (C23); its default is the
// light card (D13). Built from a declarative spec (tools/masters/jsx/build-spec.jsx); choices:
// masters/WEB_Announce/README.md.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPoint, bbox, multiply, samplePolyline } from '../../tools/dump/geometry.mjs';
import { layerProp, readJson } from '../../tools/dump/model.mjs';
import { workDir, workPath } from '../../tools/lib/work.mjs';
import { layerToCompAt, restValueAt, shapeBoxAt, shapePathsAt } from '../../tools/masters/dump-geometry.mjs';
import { dumpLayer } from '../../tools/masters/dump-keys.mjs';
import { fitCube, masterLockup } from '../../tools/masters/logo.mjs';
import { addQaPatch, HAS_TEXT_JS } from '../../tools/masters/rig-plate.mjs';
import { nul, P, pathGroup, rectGroup, shape, slot, Spec, strokeGroup, text as textLayer } from '../../tools/masters/spec.mjs';
import { M10_JS } from '../SMM_FrameNotched/resolve.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');

export const ID = 'WEB_Announce';
export const COMP = 'CR_WEB_Announce';
const FPS = 25;
const MAX_SEC = 60;            // trim (C23): the comp is the longest insert
const DEFAULT_SEC = 10;        // the pack's posts
const PACK_T = 2;              // the moment of the dumps and of the ink (the posts are still)
const REST = 1;
const SQ_PACK = 1400;          // the square post's canvas; the master's square is 1080
export const TITLE = ['TXT_TITLE1', 'TXT_TITLE2', 'TXT_TITLE3'];
const TOP = ['TXT_WEB', 'ARROW1', 'TXT_DATE', 'ARROW2'];
const SQUARE = 'anons_vebinar_1x1';
const VERTICAL = 'anons_vebinar_9x16';
const DOT = 'Group 2131327780.png';
const VISUAL = 'AI_анимация precomp_2';
// the design follows the frame: the square when it is about as high as wide
const SQ_JS = 'var SQ = thisComp.height < thisComp.width * 1.3;';

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const mean = (list) => r6(list.reduce((s, v) => s + v, 0) / list.length);
const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const rgb = (h) => [1, 3, 5].map((i) => r6(parseInt(h.slice(i, i + 2), 16) / 255)).concat(1);
const js = (v) => JSON.stringify(v);
const near = (a, b, what, tol = 0.6) => {
  if (Math.abs(a - b) > tol) throw new Error(`${what}: ${a} against ${b}`);
  return r6((a + b) / 2);
};

export function loadSources({ dumps = 'C:/CRBK/work/dumps', repo = REPO } = {}) {
  const web = (f) => readJson(path.join(dumps, 'webinars', f + '.json'));
  return {
    sq: web(SQUARE),
    v: web(VERTICAL),
    logo: web('logo'),
    metrics: JSON.parse(readFileSync(path.join(repo, 'masters', ID, 'source-metrics.json'), 'utf8')),
    svg: readFileSync(path.join(repo, 'brand', 'logo', 'master-ae-motion-live.svg'), 'utf8'),
    tokens: JSON.parse(readFileSync(path.join(repo, 'brand', 'tokens.json'), 'utf8')),
  };
}

const find = (node, mn, out = []) => {
  if (node.enabled !== false && node.matchName === mn) out.push(node);
  if (node.enabled !== false) for (const c of node.children || []) find(c, mn, out);
  return out;
};
const docOf = (layer) => restValueAt(layerProp(layer, 'ADBE Text Properties', 'ADBE Text Document'), PACK_T);
// the colour a layer shows: its Fill effect when it has one (the pack recolours with it), else its own
const fillEffect = (layer) => {
  const fx = (layer.effects || []).find((e) => e.matchName === 'ADBE Fill' && e.enabled !== false);
  const c = fx && fx.params.find((p) => p.matchName === 'ADBE Fill-0002');
  return c ? hex(c.value) : null;
};
const colourOf = (layer) => fillEffect(layer) || (layer.type === 'text' ? hex(docOf(layer).fillColor)
  : layer.type === 'shape' ? hex((find(layerProp(layer, 'ADBE Root Vectors Group'), 'ADBE Vector Fill Color')[0]
    || find(layerProp(layer, 'ADBE Root Vectors Group'), 'ADBE Vector Stroke Color')[0]).value) : null);
const inkOf = (metrics, dump, layer) => {
  const c = metrics.cases.find((x) => x.comp === dump.comp.name);
  const row = c && c.layers[String(layer.index)];
  if (!row) throw new Error(`source-metrics.json: no ${dump.comp.name} layer #${layer.index}`);
  return row;
};
const boxOf = (sps) => {
  const b = bbox(sps.flatMap((sp) => samplePolyline(sp)));
  return { x0: r6(b.x0), y0: r6(b.y0), x1: r6(b.x1), y1: r6(b.y1) };
};
const scaleOf = (m) => r6(Math.hypot(m[0], m[1]));
const textByIndex = (dump, i) => dump.layers.find((l) => l.index === i && l.type === 'text');
const strokeWidth = (layer) => find(layerProp(layer, 'ADBE Root Vectors Group'), 'ADBE Vector Stroke Width')[0].value;

// The date line «Вебинар ↗ <дата> ↗» of a post: the word's and the date's ink (left and width, layer px) and scale,
// the arrows' boxes and strokes, the baseline, the gap between the pieces (ink to the stroke's edge).
function dateLine(dump, metrics) {
  const texts = dump.layers.filter((l) => l.type === 'text' && /^Вебинар/.test(l.name) || l.type === 'text' && /\d/.test(docOf(l).text) && !/\r/.test(docOf(l).text));
  const word = texts.find((l) => /^Вебинар/.test(l.name));
  const date = texts.find((l) => l !== word);
  const piece = (L) => {
    const m = layerToCompAt(dump, L, PACK_T);
    const row = inkOf(metrics, dump, L);
    const s = scaleOf(m);
    const o = applyPoint(m, [0, 0]);
    return { L, s, x0: r6(o[0] + row.rect[0] * s), x1: r6(o[0] + (row.rect[0] + row.rect[2]) * s), base: r6(o[1] + row.lines[0][1] * s), row, colour: colourOf(L), text: docOf(L).text };
  };
  const w = piece(word);
  const d = piece(date);
  const arrows = dump.layers.filter((l) => /^Strelka/.test(l.name)).map((L) => {
    const sps = shapePathsAt(dump, L, PACK_T);
    const m = layerToCompAt(dump, L, PACK_T);
    const half = (strokeWidth(L) * scaleOf(m)) / 2;
    return { L, sps, box: boxOf(sps), half: r6(half), colour: colourOf(L) };
  }).sort((a, b) => a.box.x0 - b.box.x0);
  if (arrows.length !== 2) throw new Error(`${dump.comp.name}: ${arrows.length} arrows`);
  const gaps = [arrows[0].box.x0 - arrows[0].half - w.x1, d.x0 - (arrows[0].box.x1 + arrows[0].half), arrows[1].box.x0 - arrows[1].half - d.x1];
  if (w.s !== d.s) throw new Error(`${dump.comp.name}: the word at ${w.s}, the date at ${d.s}`);
  if (w.colour !== d.colour && dump.comp.name.includes('9x16')) throw new Error(`${dump.comp.name}: the word and the date differ in colour`);
  // the line's middle: the pack centres it by hand, 1.6 px left of the square's middle (where its title is too)
  const centre = r6((w.x0 + arrows[1].box.x1 + arrows[1].half) / 2);
  return { word: w, date: d, arrows, gap: mean(gaps), base: mean([w.base, d.base]), drop: r6(arrows[0].box.y1 - mean([w.base, d.base])), centre };
}

// The pack's arrow «↗» drawn from its square post: its two stroked paths from the box's lower left corner, the stroke
// width in the post's pixels.
function arrowShape(line) {
  const a = line.arrows[0];
  const o = [a.box.x0, a.box.y1];
  const local = (sp) => ({ ...sp, vertices: sp.vertices.map((p) => [r6(p[0] - o[0]), r6(p[1] - o[1])]) });
  return { paths: a.sps.map(local), w: r6(a.box.x1 - a.box.x0), width: r6(a.half * 2) };
}

// The dot clusters of the vertical post: each picture's squares where the picture is, less what its masks cut away and
// what its inverted matte hides (the window), in the frame's pixels; by colour. The pack draws a cluster twice: white
// (its Fill effect) and matted out of the window, and in the picture's own dark under it, which shows only over the
// light visual: over the ground the dots stay white, over the visual they turn dark.
export function dotSquares(v, dots, dark) {
  const pics = v.layers.filter((l) => l.name === DOT);
  const window = boxOf(shapePathsAt(v, dumpLayer(v, 'portal2'), PACK_T));
  const inside = (pt, poly) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const out = { white: [], dark: [] };
  for (const L of pics) {
    const colour = fillEffect(L) || dark;
    if (colour !== '#FFFFFF' && colour !== dark) throw new Error(`${L.name} #${L.index}: dots in ${colour}`);
    const list = colour === '#FFFFFF' ? out.white : out.dark;
    const m = layerToCompAt(v, L, PACK_T);
    const cuts = (L.masks || []).filter((k) => k.mode === 'SUBTRACT').map((k) => k.path.value.vertices);
    if ((L.masks || []).some((k) => k.mode !== 'SUBTRACT')) throw new Error(`${L.name} #${L.index}: a mask that is not a cut`);
    const inverted = L.trackMatte && L.trackMatte.hasTrackMatte && L.trackMatte.type === 'ALPHA_INVERTED';
    for (const [x0, y0, x1, y1] of dots.squares) {
      const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      const cut = cuts.map((poly) => corners.filter((p) => inside(p, poly)).length);
      if (cut.some((n) => n > 0 && n < 4)) throw new Error(`${L.name} #${L.index}: a mask cuts through a dot at ${x0}, ${y0}`);
      if (cut.some((n) => n === 4)) continue;
      const q = corners.map((p) => applyPoint(m, p));
      const c = [(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2];
      if (inverted && c[0] > window.x0 && c[0] < window.x1 && c[1] > window.y0 && c[1] < window.y1) continue;
      list.push(q.map((p) => p.map(r6)));
    }
  }
  return out;
}

// Everything at rest, in the master's pixels: the square post scaled from 1400 to 1080, the vertical one as it is.
export function announceLayout({ sq, v, logo, metrics }) {
  const S = r6(1080 / SQ_PACK);
  if (sq.comp.width !== SQ_PACK || v.comp.width !== 1080 || v.comp.height !== 1920) throw new Error('the announce posts changed size');
  const s = (x) => r6(x * S);
  // the square: the card, its notches at rest and at their far point, the visual, the title, the date line, the logo
  const portal = dumpLayer(sq, 'PORTAL');
  const pm = layerToCompAt(sq, portal, PACK_T);
  const card = boxOf(shapePathsAt(sq, portal, PACK_T));
  const maskAt = (name, k) => portal.masks.find((x) => x.name === name).path.keys[k].value.vertices.map((p) => applyPoint(pm, p));
  const n1 = [0, 1, 2].map((k) => maskAt('Mask 1', k));
  const n2 = [0, 1, 2].map((k) => maskAt('Mask 2', k));
  const m1 = portal.masks.find((x) => x.name === 'Mask 1');
  const m2 = portal.masks.find((x) => x.name === 'Mask 2');
  if (!(m1.mode === 'ADD' && m1.inverted) || m2.mode !== 'SUBTRACT') throw new Error('the square card: its notches are no longer cuts');
  const notches = {
    // the lower left one: from the card's left edge to its moving right edge, up from the card's bottom
    low: { x: [r6(n1[0][0][0]), r6(n1[1][0][0])], y0: r6(Math.min(...n1[0].map((p) => p[1]))) },
    // the upper right one: from its moving left edge to the card's right edge, down from the card's top
    high: { x: [r6(n2[0][1][0]), r6(n2[1][1][0])], y1: r6(mean(n2[0].map((p) => p[1]).filter((y) => y > card.y0 + 20))) },
  };
  if (js(n1[0]) !== js(n1[2]) || js(n2[0]) !== js(n2[2])) throw new Error('the square card: the notches do not come back');
  const vis = (dump) => {
    const L = dumpLayer(dump, VISUAL);
    const m = layerToCompAt(dump, L, PACK_T);
    const c = applyPoint(m, [L.source.width / 2, L.source.height / 2]);
    return { cx: r6(c[0]), cy: r6(c[1]), s: scaleOf(m), w: L.source.width, h: L.source.height };
  };
  const sv = vis(sq);
  const st = textByIndex(sq, sq.layers.find((l) => l.type === 'text' && /\r/.test(docOf(l).text)).index);
  const srow = inkOf(metrics, sq, st);
  const sm = layerToCompAt(sq, st, PACK_T);
  const so = applyPoint(sm, [0, 0]);
  const sdoc = docOf(st);
  // the centred lines: each symmetric about the box's middle
  const centres = [];
  for (let i = 0; i < srow.lines.length; i += 1) centres.push(so[0] + ((srow.lines[i][0] + srow.lines[i][2]) / 2) * scaleOf(sm));
  const sline = dateLine(sq, metrics);
  const LL = dumpLayer(sq, 'Logo');
  const lm = layerToCompAt(sq, LL, PACK_T);
  const cubeL = logo.layers.find((l) => colourOf(l) === '#26D07C');
  const cb = shapeBoxAt(logo, cubeL, PACK_T);
  const ca = applyPoint(lm, [cb.x0, cb.y0]);
  const cz = applyPoint(lm, [cb.x1, cb.y1]);
  const square = {
    S,
    ground: fillEffect(dumpLayer(sq, 'Dark Gray Solid 2')) || hex(dumpLayer(sq, 'Dark Gray Solid 2').source.color),
    card: { x0: s(card.x0), y0: s(card.y0), x1: s(card.x1), y1: s(card.y1), fill: fillEffect(dumpLayer(sq, 'Light Gray Solid 2')) },
    notches: { low: { x: notches.low.x.map(s), y0: s(notches.low.y0) }, high: { x: notches.high.x.map(s), y1: s(notches.high.y1) } },
    visual: { cx: s(sv.cx), cy: s(sv.cy), s: r6(sv.s * S), w: sv.w, h: sv.h },
    title: {
      centre: s(mean(centres)), first: s(so[1] + srow.lines[0][1] * scaleOf(sm)), step: s((srow.lines[1][1] - srow.lines[0][1]) * scaleOf(sm)),
      size: r6(sdoc.fontSize * scaleOf(sm) * S), tracking: sdoc.tracking, fill: hex(sdoc.fillColor), font: sdoc.font, pack: sdoc.text.split('\r'),
    },
    line: {
      size: r6(60 * sline.word.s * S), base: s(sline.base), drop: s(sline.drop), gap: s(sline.gap), centre: s(sline.centre),
      word: sline.word.colour, date: sline.date.colour, arrow: sline.arrows[0].colour, pack: sline.date.text,
      arrowScale: r6((sline.arrows[0].box.x1 - sline.arrows[0].box.x0) * S),
    },
    logo: { cube: { x0: s(ca[0]), y0: s(ca[1]), w: s(cz[0] - ca[0]) } },
  };
  // the vertical: the mint card, the window, the visual, the title, the date line, the dots
  const mint = boxOf(shapePathsAt(v, dumpLayer(v, 'portal1'), PACK_T));
  const window = boxOf(shapePathsAt(v, dumpLayer(v, 'portal2'), PACK_T));
  const vv = vis(v);
  const vt = v.layers.find((l) => l.type === 'text' && /\r/.test(docOf(l).text));
  const vrow = inkOf(metrics, v, vt);
  const vm = layerToCompAt(v, vt, PACK_T);
  const vo = applyPoint(vm, [0, 0]);
  const vdoc = docOf(vt);
  const vline = dateLine(v, metrics);
  const vertical = {
    ground: fillEffect(dumpLayer(v, 'Dark Gray Solid 15')) || hex(dumpLayer(v, 'Dark Gray Solid 15').source.color),
    card: { ...mint, fill: colourOf(dumpLayer(v, 'portal1')) },
    window,
    visual: vv,
    title: {
      left: r6(vo[0] + vrow.lines[0][0] * scaleOf(vm)), first: r6(vo[1] + vrow.lines[0][1] * scaleOf(vm)), step: r6((vrow.lines[1][1] - vrow.lines[0][1]) * scaleOf(vm)),
      size: r6(vdoc.fontSize * scaleOf(vm)), tracking: vdoc.tracking, fill: hex(vdoc.fillColor), font: vdoc.font, pack: vdoc.text.split('\r'),
    },
    line: {
      size: r6(60 * vline.word.s), base: vline.base, drop: vline.drop, gap: vline.gap, left: vline.word.x0,
      word: vline.word.colour, date: vline.date.colour, arrow: vline.arrows[0].colour, pack: vline.date.text,
      arrowScale: r6(vline.arrows[0].box.x1 - vline.arrows[0].box.x0),
    },
    dots: dotSquares(v, metrics.dots, metrics.dots.colour),
  };
  if (sdoc.font !== vdoc.font) throw new Error('the posts title in different fonts');
  return { square, vertical, arrow: arrowShape(sline), wordFont: docOf(sline.word.L).font, word: sline.word.text };
}

// The M10 drift of the square's notches: the pack's two states (rest, far) a 15 s segment each, out and back: a 30 s
// loop (BG_WebinarPortal moves the screen's portal on the same curve).
export function notchJs(A, tokens) {
  const seg = tokens.motion.M10.segment;
  return [
    `var X1 = ${seg.bezier[0]}, X2 = ${seg.bezier[2]}, T = ${r6(seg.frames / FPS)};`,
    M10_JS,
    'function drift(a, b) { var t = time % (2 * T), i = Math.floor(t / T), u = m10((t - i * T) / T); return i == 0 ? a + (b - a) * u : b + (a - b) * u; }',
    `var R1 = drift(${A.notches.low.x[0]}, ${A.notches.low.x[1]}), L2 = drift(${A.notches.high.x[0]}, ${A.notches.high.x[1]});`,
  ].join('\n') + '\n';
}

export function resolveAnnounce(sources = loadSources()) {
  const { svg, tokens } = sources;
  const base = tokens.color.base;
  const L = announceLayout(sources);
  const A = L.square;
  const V = L.vertical;
  // D1: the pack's dark ground, dark title and green date are the brand's; its light card, greys and mint stay
  for (const [got, want, what] of [[A.ground, base.black.hex, 'square ground'], [V.ground, base.black.hex, 'vertical ground'], [A.title.fill, base.white.hex, 'square title'],
    [V.title.fill, base.black.hex, 'vertical title'], [A.line.date, base.green.hex, 'square date'], [V.line.word, base.black.hex, 'vertical date line'], [V.line.arrow, base.white.hex, 'vertical arrows']]) {
    if (got !== want) throw new Error(`announce: ${what} ${got}, the brand has ${want}`);
  }
  const colors = { ground: base.black.hex, card: A.card.fill, mint: V.card.fill, grey: A.line.word, green: base.green.hex, white: base.white.hex, dark: base.black.hex };
  const duration = { introSec: 0, holdSec: DEFAULT_SEC, outroSec: 0, maxSec: MAX_SEC };
  const titleStyle = { font: V.title.font, size: V.title.size, fill: colors.dark, tracking: 0, justify: 'LEFT' };
  const lineStyle = { font: L.wordFont, size: 60, fill: colors.dark, tracking: 0, justify: 'LEFT' };
  // D21: neutral words; the date as the vertical post writes it (it fits both)
  const text = {
    TXT_TITLE1: { value: 'Название вебинара', label: 'Заголовок, строка 1', style: titleStyle },
    TXT_TITLE2: { value: 'в несколько строк', label: 'Заголовок, строка 2', style: titleStyle },
    TXT_TITLE3: { value: '', label: 'Заголовок, строка 3', style: titleStyle },
    TXT_DATE: { value: V.line.pack, label: 'Дата', style: lineStyle },
  };
  const slots = { SLOT_VISUAL: { label: 'Визуал' } };
  const ctrl = {};

  // the title's room: the square's card width; the vertical's from the title to the mint card's right edge less the
  // margin the title keeps from its left edge
  const sqRoom = r6(A.card.x1 - A.card.x0);
  const vMargin = r6(V.title.left - V.card.x0);
  const vRoom = r6(V.card.x1 - vMargin - V.title.left);
  const sqTitleScale = r6(A.title.size / V.title.size);
  // the date line's room: the square's card width; the vertical's from the line's left to the card's right edge less
  // the same margin the line keeps
  const lMargin = r6(V.line.left - V.card.x0);
  const sqLineRoom = sqRoom;
  const vLineRoom = r6(V.card.x1 - lMargin - V.line.left);
  const sqTs = r6(A.line.size / 60);
  const vTs = r6(V.line.size / 60);
  const aw = r6(L.arrow.w + L.arrow.width);         // an arrow with its stroke, in the square post's pixels
  const aScaleSq = r6(A.line.arrowScale / L.arrow.w);
  const aScaleV = r6(V.line.arrowScale / L.arrow.w);

  const pre = [
    SQ_JS,
    'var k = Math.min(thisComp.width, thisComp.height) / 1080;',
  ].join('\n') + '\n';
  const only = (sq) => pre + `SQ == ${sq ? 'true' : 'false'} ? 100 : 0`;
  const inkJs = `function ink(n) { if (!hasText(n)) { return null; } var r = thisComp.layer(n).sourceRectAtTime(${REST}, false); return r.width > 0 ? { l: r.left / k, w: r.width / k } : null; }`;

  const spec = new Spec({ name: COMP, w: 1080, h: 1920, fps: FPS, duration: MAX_SEC });
  // bottom first: the ground, the card, the visual in its matte, the dots, the title, the date line, the logo
  spec.add(shape('GROUND', [rectGroup('Ground', colors.ground)]));
  spec.expr('GROUND', P.rectSize('Ground'), '[thisComp.width, thisComp.height]');
  spec.expr('GROUND', P.rectPos('Ground'), '[thisComp.width / 2, thisComp.height / 2]');
  const square = (w, h) => [{ closed: true, vertices: [[0, 0], [w, 0], [w, h], [0, h]], inTangents: [[0, 0], [0, 0], [0, 0], [0, 0]], outTangents: [[0, 0], [0, 0], [0, 0], [0, 0]] }];
  const sqPath = notchJs(A, tokens) + [
    `var x0 = ${A.card.x0}, y0 = ${A.card.y0}, x1 = ${A.card.x1}, y1 = ${A.card.y1}, lowTop = ${A.notches.low.y0}, highBottom = ${A.notches.high.y1};`,
    'var sqPts = [[x0, y0], [L2, y0], [L2, highBottom], [x1, highBottom], [x1, y1], [R1, y1], [R1, lowTop], [x0, lowTop]];',
  ].join('\n') + '\n';
  const rectPts = (b) => `[[${b.x0}, ${b.y0}], [${b.x1}, ${b.y0}], [${b.x1}, ${b.y1}], [${b.x0}, ${b.y1}]]`;
  const scaled = 'function K(p) { var o = []; for (var i = 0; i < p.length; i++) { o.push([p[i][0] * k, p[i][1] * k]); } return o; }';
  spec.add(shape('CARD', [pathGroup('Card', colors.card, square(100, 100))]));
  spec.expr('CARD', ['group', 'Card', 'Path 1', 'ADBE Vector Shape'], pre + sqPath + scaled + `\ncreatePath(K(SQ ? sqPts : ${rectPts(V.card)}), [], [], true)`);
  spec.expr('CARD', P.fill('Card'), pre + `SQ ? ${js(rgb(colors.card))} : ${js(rgb(colors.mint))}`);
  // the visual: one slot the size of the pack's visual, placed and cut as each post has it
  const ph = { name: `${COMP}_visual`, w: A.visual.w, h: A.visual.h };
  ph.layers = [shape('Card', [pathGroup('Card', colors.card, square(ph.w, ph.h))])];
  spec.add(shape('VMATTE', [pathGroup('Matte', colors.white, square(100, 100))]));
  spec.expr('VMATTE', ['group', 'Matte', 'Path 1', 'ADBE Vector Shape'], pre + sqPath + scaled + `\ncreatePath(K(SQ ? sqPts : ${rectPts(V.window)}), [], [], true)`);
  spec.add(slot('SLOT_VISUAL', ph));
  spec.expr('SLOT_VISUAL', P.pos, pre + `SQ ? [${A.visual.cx} * k, ${A.visual.cy} * k] : [${V.visual.cx} * k, ${V.visual.cy} * k]`);
  spec.expr('SLOT_VISUAL', P.scale, pre + `var s = 100 * k * (SQ ? ${A.visual.s} : ${V.visual.s});\n[s, s]`);
  spec.matte('SLOT_VISUAL', 'VMATTE', 'ALPHA', { keepVisible: false });
  // the dots of the vertical post, above its cards as the pack has them
  const squares = (list) => list.map((q) => ({ closed: true, vertices: q, inTangents: q.map(() => [0, 0]), outTangents: q.map(() => [0, 0]) }));
  // the first group of a shape layer is in front: the white dots over the dark ones
  spec.add(shape('DOTS', [pathGroup('White', colors.white, squares(V.dots.white)), pathGroup('Dark', colors.dark, squares(V.dots.dark))]));
  spec.expr('DOTS', P.scale, pre + '[100 * k, 100 * k]');
  spec.expr('DOTS', P.opacity, only(false));
  // the title: up to three lines; the square's centred in white, the vertical's from the left in the dark, tracked
  const titleJs = (i) => pre + [
    `var N = ${js(TITLE)};`,
    HAS_TEXT_JS,
    inkJs,
    `var sc = SQ ? ${sqTitleScale} : 1, room = SQ ? ${sqRoom} : ${vRoom};`,
    'var at = [], n = 0, m = 0, me = null;',
    'for (var i = 0; i < N.length; i++) { var e = ink(N[i]); at.push(e ? n : -1); if (e) { n++; m = Math.max(m, SQ ? e.w : e.l + e.w); } }',
    `var f = m * sc > room ? room / (m * sc) : 1, slot = Math.max(0, at[${i}]), mine = ink(N[${i}]);`,
    `var b = (SQ ? ${A.title.first} + slot * ${A.title.step} * f : ${V.title.first} + slot * ${V.title.step} * f) * k;`,
  ].join('\n') + '\n';
  for (let i = TITLE.length - 1; i >= 0; i -= 1) {
    spec.add(textLayer(TITLE[i], { ...titleStyle, value: text[TITLE[i]].value }, [{ name: 'Ink', basedOn: 1, position: false, fill: rgb(colors.dark).slice(0, 3), tracking: 0 }]));
  }
  TITLE.forEach((t, i) => {
    spec.expr(t, P.pos, titleJs(i) + `var x = SQ ? ${A.title.centre} - (mine ? (mine.l + mine.w / 2) * sc * f : 0) : ${V.title.left};\n[x * k, b]`);
    spec.expr(t, P.scale, titleJs(i) + '[100 * sc * f, 100 * sc * f]');
    spec.expr(t, ['animator', 'Ink', 'ADBE Text Fill Color'], pre + `SQ ? ${js(rgb(colors.white))} : ${js(rgb(colors.dark))}`);
    // an animator's Tracking Amount is pixels a character at the layer's font, not thousandths of an em (AE 26.5:
    // 16/1000 em at 70 px is 1.12)
    spec.expr(t, ['animator', 'Ink', 'ADBE Text Tracking Amount'], pre + `(SQ ? ${r6(A.title.tracking / 1000 * V.title.size)} : ${r6(V.title.tracking / 1000 * V.title.size)}) * k`);
  });
  // the date line «Вебинар ↗ <дата> ↗»: centred on the square, from the card's inner left on the vertical; the gaps from
  // ink to the arrow's stroke as the pack has them; a long date shrinks the line to its room
  const lineJs = pre + [
    HAS_TEXT_JS,
    inkJs,
    `var ts = SQ ? ${sqTs} : ${vTs}, as = SQ ? ${aScaleSq} : ${aScaleV}, G = SQ ? ${A.line.gap} : ${V.line.gap}, room = SQ ? ${sqLineRoom} : ${vLineRoom};`,
    `var AW = ${aw} * as, half = ${r6(L.arrow.width / 2)} * as;`,
    'var w = ink("TXT_WEB"), d = ink("TXT_DATE");',
    'var wW = w ? w.w * ts : 0, wD = d ? d.w * ts : 0;',
    'var W = wW + G + AW + (d ? G + wD + G + AW : 0), f = W > room ? room / W : 1;',
    `var X = SQ ? ${A.line.centre} - W * f / 2 : ${V.line.left}, B = SQ ? ${A.line.base} : ${V.line.base}, drop = SQ ? ${A.line.drop} : ${V.line.drop};`,
    'var xA1 = X + (wW + G) * f, xD = xA1 + (AW + G) * f, xA2 = xD + (wD + G) * f;',
  ].join('\n') + '\n';
  spec.add(textLayer('TXT_WEB', { ...lineStyle, value: L.word }, [{ name: 'Ink', basedOn: 1, position: false, fill: rgb(colors.dark).slice(0, 3) }]));
  spec.add(textLayer('TXT_DATE', { ...lineStyle, value: text.TXT_DATE.value }, [{ name: 'Ink', basedOn: 1, position: false, fill: rgb(colors.dark).slice(0, 3) }]));
  for (const a of ['ARROW1', 'ARROW2']) spec.add(shape(a, [strokeGroup('Arrow', { color: colors.white, width: L.arrow.width }, L.arrow.paths)]));
  spec.expr('TXT_WEB', P.pos, lineJs + '[(X - (w ? w.l : 0) * ts * f) * k, B * k]');
  spec.expr('TXT_DATE', P.pos, lineJs + '[(xD - (d ? d.l : 0) * ts * f) * k, B * k]');
  for (const t of ['TXT_WEB', 'TXT_DATE']) spec.expr(t, P.scale, lineJs + '[100 * ts * f, 100 * ts * f]');
  spec.expr('TXT_WEB', ['animator', 'Ink', 'ADBE Text Fill Color'], pre + `SQ ? ${js(rgb(A.line.word))} : ${js(rgb(V.line.word))}`);
  spec.expr('TXT_DATE', ['animator', 'Ink', 'ADBE Text Fill Color'], pre + `SQ ? ${js(rgb(A.line.date))} : ${js(rgb(V.line.date))}`);
  spec.expr('ARROW1', P.pos, lineJs + '[(xA1 + half * f) * k, (B + drop * f) * k]');
  spec.expr('ARROW2', P.pos, lineJs + '[(xA2 + half * f) * k, (B + drop * f) * k]');
  for (const a of ['ARROW1', 'ARROW2']) {
    spec.expr(a, P.scale, lineJs + '[100 * as * f * k, 100 * as * f * k]');
    spec.expr(a, ['group', 'Arrow', 'Stroke', 'ADBE Vector Stroke Color'], pre + `SQ ? ${js(rgb(A.line.arrow))} : ${js(rgb(V.line.arrow))}`);
  }
  spec.expr('ARROW2', P.opacity, pre + HAS_TEXT_JS + '\nhasText("TXT_DATE") ? 100 : 0');
  // the logo in the square's lower notch: the master logo (D18) where the pack has its own
  const lockup = masterLockup(svg, fitCube(svg, A.logo.cube));
  spec.add(shape('LOGO', [pathGroup('Wordmark', colors.white, lockup.wordmark), pathGroup('Cube', colors.green, lockup.cube)]));
  spec.expr('LOGO', P.scale, pre + '[100 * k, 100 * k]');
  spec.expr('LOGO', P.opacity, only(true));
  addQaPatch(spec, colors.green);
  spec.add(nul('CTRL', [{ kind: 'checkbox', name: 'QA', value: false }]));

  // AE lists the newest controller first: added in reverse of the panel's order
  const order = [...TITLE.map((t) => ({ text: t })), { text: 'TXT_DATE' }, { slot: 'SLOT_VISUAL' }];
  const egp = [...order].reverse();
  const label = (e) => (e.text ? text[e.text].label : slots[e.slot].label);
  const built = spec.toJSON();
  const pad = (list) => Object.fromEntries(TITLE.map((t, i) => [t, list[i] || '']));
  return {
    id: ID,
    workDir: workDir(),
    out: { dir: workPath('build', ID), aep: workPath('build', ID, ID + '_work.aep') },
    comp: spec.comp,
    colors,
    layout: L,
    fit: { sqRoom, vRoom, vMargin, sqTitleScale, sqLineRoom, vLineRoom, lMargin, sqTs, vTs, aw, aScaleSq, aScaleV },
    text,
    slots,
    packs: { square: { ...pad(A.title.pack), TXT_DATE: A.line.pack }, vertical: { ...pad(V.title.pack), TXT_DATE: V.line.pack } },
    ctrl,
    egp,
    rig: {},
    markers: [],
    duration,
    spec: {
      ...built,
      fonts: [V.title.font],
      markers: [],
      egp: egp.map((e) => (e.text ? { text: e.text, label: label(e) } : { slot: e.slot, label: label(e) })),
      egpNames: order.map(label),
      measure: [{ name: 'defaults', t: REST, ctrl: {}, text: {}, layers: [...TITLE, 'TXT_WEB', 'TXT_DATE', 'ARROW1', 'ARROW2', 'CARD', 'DOTS', 'LOGO'] }],
      defaults: { text: { ...Object.fromEntries(Object.keys(text).map((t) => [t, text[t].value])), TXT_WEB: L.word }, ctrl: {} },
    },
    check: {},
    version: 1,
    variants: ['1x1', '9x16'].map((key) => ({ key, ...tokens.video.formats[key] })),
    sweepTimes: [0, 1, 5, 9.96, 15, 29.96, 45, 59.96],
    rest: REST,
  };
}

export const resolve = resolveAnnounce;

// The library entry (library.src.json): a trim template in the square and the vertical, the layout by its frame.
export function libraryEntry(p = resolveAnnounce()) {
  const keys = { TXT_TITLE1: 'title1', TXT_TITLE2: 'title2', TXT_TITLE3: 'title3', TXT_DATE: 'date', SLOT_VISUAL: 'visual' };
  const fields = [...p.egp].reverse().map((e, i) => (e.slot
    ? { key: keys[e.slot], label_ru: p.slots[e.slot].label, type: 'media', egpName: p.slots[e.slot].label, egpIndex: i, accepts: ['video', 'photo'] }
    : { key: keys[e.text], label_ru: p.text[e.text].label, type: 'text', egpName: p.text[e.text].label, egpIndex: i, maxLen: e.text === 'TXT_DATE' ? 30 : 40, default: p.text[e.text].value }));
  return {
    id: ID,
    title_ru: 'Анонс вебинара',
    category: 'webinars',
    tier: 'T1',
    hosts: ['ae', 'pr'],
    version: p.version,
    fit: 'trim',
    duration: p.duration,
    requiredFonts: p.spec.fonts.map((f) => ({ postScriptName: f })),
    fields,
    variants: p.variants.map((v) => ({ key: v.key, aspect: v.key, w: v.w, h: v.h, fps: FPS, aeComp: `${COMP}_${v.key}`, minHostVersion: { ae: '26.0', pr: '26.0' } })),
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = resolveAnnounce();
  const { vertical, ...rest } = r.layout;
  console.log(JSON.stringify({ layers: r.spec.order, expressions: r.spec.expressions.length, layout: { ...rest, vertical: { ...vertical, dots: vertical.dots.length } },
    fit: r.fit, duration: r.duration, egp: r.spec.egpNames, packs: r.packs }, null, 1).slice(0, 9000));
}
