// CRS_Cover «Обложка курса»: the three covers of the courses pack («Обложка #1–#3», 2560x1440, FHD = x 0.75) as
// one master with «Вариант»: 1 a dark card holding the visual, 2 green bars over a free visual, 3 a green card with
// the visual on a white portal. Common to all: the header (the master logo, the pack's running hatching and
// descriptor), the title of up to three lines rising one after another, the product label fading in, the pack's
// stepped wipe «Переход» at the end of the clip, which opens onto whatever lies under the cover.
// - The card and the portals are the pack's animated paths, drawn by expressions from its keys (a RIG slider per
//   path runs 0 -> 1 -> 2 with the pack's eases); the visual is matted by the same paths.
// - The hatching, the descriptor, the bars and the wipe are the pack's own layers moved over (spec.transplant).
// - The visual is a Media Replacement slot (C28) for a photo, empty by default (D13). A trim master (C23): the
//   panel cuts the clip and writes «Длительность» (C24); the wipe plays at the clip's end.
// Choices: masters/CRS_Cover/README.md.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPoint } from '../../tools/dump/geometry.mjs';
import { layerProp, readJson } from '../../tools/dump/model.mjs';
import { packProject } from '../../tools/dump/dump.mjs';
import { workDir, workPath } from '../../tools/lib/work.mjs';
import { layerToCompAt, shapeBoxAt } from '../../tools/masters/dump-geometry.mjs';
import { dumpLayer } from '../../tools/masters/dump-keys.mjs';
import { fitCube, masterLockup } from '../../tools/masters/logo.mjs';
import { addQaPatch, canonProgress, clearOffset, dumpSegment, GLYPHS, HAS_TEXT_JS, START } from '../../tools/masters/rig-plate.mjs';
import { nul, P, pathGroup, precomp, rectGroup, shape, slot, Spec, text as textLayer } from '../../tools/masters/spec.mjs';
import { SPEED_CTRL, SPEEDS, timeMapJs } from '../../tools/masters/speed.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');

export const ID = 'CRS_Cover';
export const COMP = 'CR_CRS_Cover';
const FPS = 25;
const MAX_SEC = 30;            // trim (C23): the comp is the longest insert
const DEFAULT_SEC = 7.0;       // «Обложка #1»: its wipe ends at 7.0 s
const S = 0.75;                // pack px -> FHD px (2560x1440 -> 1920x1080)
const REST = 4.0;              // a moment of the hold at every speed (2x: from 1.16 s; 0.75x: from 3.09 s)
const COVERS = [
  { slug: 'oblozhka_1', name: 'Обложка #1', layers: 22 },
  { slug: 'oblozhka_2', name: 'Обложка #2', layers: 16 },
  { slug: 'oblozhka_3', name: 'Обложка #3', layers: 17 },
];
// the pack's lines of a cover, top first, and its label (the names carry the cover's number from #2 on)
const LINES = [['Первая строчка', 'вторая строчка', 'третья последняя'], ['Первая строчка 2', 'вторая строчка 2', 'третья последняя'],
  ['Первая строчка 3', 'вторая строчка 3', 'третья последняя 2']];
const LABELS = ['Cloud.ru Advanced ', 'Cloud.ru Advanced 2', 'Cloud.ru Advanced 3'];
// the null the title follows (its X / Y Position expressions); the label of #3 hangs on the big portal's corner
const TITLE_NULL = 'Позиция и размер текста';
const LABEL_CORNER = 2;        // «портал большой: Path 1 [1.1.2]»: the label's parent follows this vertex
export const TXT = ['TXT_LINE1', 'TXT_LINE2', 'TXT_LINE3'];
export const VARIANTS = ['Тёмная карточка', 'Зелёные полосы', 'Зелёная карточка'];

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const fhd = (v) => r6(v * S);
const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const js = (v) => JSON.stringify(v);

export function loadSources({ dumps = 'C:/CRBK/work/dumps', repo = REPO } = {}) {
  return {
    covers: COVERS.map((c) => readJson(path.join(dumps, 'courses', c.slug + '.json'))),
    logo: readJson(path.join(dumps, 'courses', 'logo.json')),
    visual: readJson(path.join(dumps, 'courses', 'visual.json')),
    visualBg: readJson(path.join(dumps, 'courses', 'visual_with_background.json')),
    wipe: readJson(path.join(dumps, 'courses', 'perekhod.json')),
    svg: readFileSync(path.join(repo, 'brand', 'logo', 'master-ae-motion-live.svg'), 'utf8'),
    tokens: JSON.parse(readFileSync(path.join(repo, 'brand', 'tokens.json'), 'utf8')),
  };
}

const find = (node, mn) => {
  if (node.matchName === mn) return node;
  for (const c of node.children || []) { const hit = find(c, mn); if (hit) return hit; }
  return null;
};
const xform = (L, mn) => layerProp(L, 'ADBE Transform Group', mn);
const docOf = (L) => layerProp(L, 'ADBE Text Properties', 'ADBE Text Document').value;

// The keys of a shape layer's one path in comp px of the pack (a layer at its position, anchor 0, scale 100, a
// plain group, straight edges): each key's vertices and the eases on both sides.
function pathKeys(dump, name) {
  const L = dumpLayer(dump, name);
  const pos = xform(L, 'ADBE Position').value;
  const anchor = xform(L, 'ADBE Anchor Point').value;
  const scale = xform(L, 'ADBE Scale').value;
  if (anchor[0] || anchor[1] || scale[0] !== 100 || scale[1] !== 100) throw new Error(`${name}: not a plain layer`);
  const shp = find(layerProp(L, 'ADBE Root Vectors Group'), 'ADBE Vector Shape');
  const fill = find(layerProp(L, 'ADBE Root Vectors Group'), 'ADBE Vector Fill Color').value;
  return {
    fill: hex(fill),
    keys: shp.keys.map((k) => {
      if (!k.value.closed || [...k.value.inTangents, ...k.value.outTangents].some((p) => p[0] || p[1])) throw new Error(`${name}: not straight`);
      if (Math.abs(k.outEase[0].speed) > 2 || Math.abs(k.inEase[0].speed) > 2) throw new Error(`${name}: speeds at ${k.time}`);
      return { t: r6(k.time), v: k.value.vertices.map((p) => [fhd(p[0] + pos[0]), fhd(p[1] + pos[1])]), out: r6(k.outEase[0].influence), in: r6(k.inEase[0].influence) };
    }),
  };
}

// A RIG slider that runs 0 -> 1 -> 2 ... over a path's keys with the same eases: the path between two keys is
// the linear mix of their vertices at the slider's fraction (AE interpolates shape keys the same way).
function moveKeys(keys) {
  return keys.map((k, i) => ({
    t: k.t, v: i, inType: 'BEZIER', outType: 'BEZIER',
    inEase: [[0, i === 0 ? 33.333333 : k.in]], outEase: [[0, i === keys.length - 1 ? 33.333333 : k.out]],
  }));
}

// expression: the path of key vertices K mixed by a RIG slider (FHD -> comp px by k), read through BG with the
// time of the path's middle key t1 (the background's second move ends at the cut, see resolveCover)
function pathJs(K, slider, t1) {
  return [
    `var K = ${js(K)};`,
    `var p = thisComp.layer("RIG").effect("${slider}")(1).valueAtTime(BG(time, ${t1}));`,
    'var i = Math.min(K.length - 2, Math.max(0, Math.floor(p))), u = Math.min(1, p - i);',
    'var pts = []; for (var j = 0; j < K[i].length; j++) { pts.push([(K[i][j][0] + (K[i + 1][j][0] - K[i][j][0]) * u) * k, (K[i][j][1] + (K[i + 1][j][1] - K[i][j][1]) * u) * k]); }',
  ].join('\n');
}

// The middle key of the bars of «Обложка #2» (Position, X / Y Position and Scale of Shape Layer 6–8: 0, t1, the end).
function barsMiddle(c2) {
  const times = new Set();
  for (const name of ['Shape Layer 6', 'Shape Layer 7', 'Shape Layer 8']) {
    const walk = (p) => { if (p.keys && p.keys.length) { if (p.keys.length !== 3) throw new Error(`${name} ${p.name}: ${p.keys.length} keys`); times.add(r6(p.keys[1].time)); } for (const c of p.children || []) walk(c); };
    for (const p of dumpLayer(c2, name).props) walk(p);
  }
  if (times.size !== 1) throw new Error(`Обложка #2: the bars have middle keys at ${[...times].join(', ')}`);
  return [...times][0];
}

// The covers at rest, in FHD px.
export function coverLayout({ covers, logo, visual, visualBg }) {
  const [c1, c2, c3] = covers;
  // the title: its null (the lines' X / Y Position read it), the first line's anchor, the lines 120 px apart on
  // their parent; the glyphs stand 8 px over the layers' baselines (baseline shift, as the measured ink shows)
  const lines = covers.map((d, i) => {
    const n = dumpLayer(d, TITLE_NULL);
    const np = xform(n, 'ADBE Position').value;
    const first = dumpLayer(d, LINES[i][0]);
    const a = xform(first, 'ADBE Anchor Point').value;
    const docs = LINES[i].map((name) => docOf(dumpLayer(d, name)));
    const shift = docs[0].baselineShift || 0;
    // lines 2 and 3 on line 1 (#2 and #3 nudge them 3 px right: one origin per variant here)
    const steps = LINES[i].slice(1).map((name) => xform(dumpLayer(d, name), 'ADBE Position').value[1]);
    return { origin: fhd(np[0] - a[0]), first: fhd(np[1] - a[1] - shift), step: r6(fhd(steps[0]) * 1e3 / 1e3), steps: steps.map(fhd), docs };
  });
  lines.forEach((l, i) => {
    if (Math.abs(l.steps[1] - 2 * l.steps[0]) > 1e-3) throw new Error(`${COVERS[i].name}: the lines are not evenly spaced`);
    if (Math.abs(l.step - lines[0].step) > 1e-3) throw new Error(`${COVERS[i].name}: another line step`);
    l.step = Math.round(l.step * 1e3) / 1e3;
  });
  const d0 = lines[0].docs[0];
  // the label: #1 and #2 stand still; #3's hangs on the big portal's corner (its parent null follows the vertex)
  const labelDoc = docOf(dumpLayer(c1, LABELS[0]));
  const lp = xform(dumpLayer(c1, LABELS[0]), 'ADBE Position').value;
  const l3 = xform(dumpLayer(c3, LABELS[2]), 'ADBE Position').value;
  const label = {
    font: labelDoc.font, size: fhd(labelDoc.fontSize), tracking: labelDoc.tracking,
    at: [fhd(lp[0]), fhd(lp[1] - (labelDoc.baselineShift || 0))],
    corner: [fhd(l3[0]), fhd(l3[1] - (labelDoc.baselineShift || 0))],
    fills: covers.map((d, i) => hex(docOf(dumpLayer(d, LABELS[i])).fillColor)),
  };
  // the visual: the pack's PNG in its comp, the comp's layer in the cover; its centre, its scale (pack px over
  // image px) and the slow push-in of «Visual» (#1, #2); «Visual with background» (#3) stands still
  const png = (comp) => comp.layers.find((l) => /\.png$/i.test(l.name));
  const p1 = png(visual);
  const p3 = png(visualBg);
  const img = { w: p1.source.width, h: p1.source.height };
  const sk = xform(p1, 'ADBE Scale').keys;
  if (sk.length !== 2) throw new Error('Visual: the push-in is no longer two keys');
  const place = (cover, layerName, layer, s) => {
    const m = layerToCompAt(cover, dumpLayer(cover, layerName), 3);
    const c = applyPoint(m, xform(layer, 'ADBE Position').value);
    return { centre: [fhd(c[0]), fhd(c[1])], scale: r6(Math.hypot(m[0], m[1]) * s * S) };
  };
  const v1 = place(c1, 'Visual', p1, sk[0].value[0] / 100);
  const v2 = place(c2, 'Visual', p1, sk[0].value[0] / 100);
  const v3 = place(c3, 'Visual with background', p3, xform(p3, 'ADBE Scale').value[0] / 100);
  const zoom = { from: sk[0].value[0], rate: r6((sk[1].value[0] - sk[0].value[0]) / (sk[1].time - sk[0].time)), until: sk[1].time };
  // the cube of the pack's logo in the frame: the master logo's cube goes there (D18)
  const LL = dumpLayer(c1, 'Logo');
  const lm = layerToCompAt(c1, LL, 3);
  const cubeLayer = logo.layers.find((l) => hex(find(layerProp(l, 'ADBE Root Vectors Group'), 'ADBE Vector Fill Color').value) === '#26D07C');
  const cb = shapeBoxAt(logo, cubeLayer, 1);
  const ca = applyPoint(lm, [cb.x0, cb.y0]);
  const cz = applyPoint(lm, [cb.x1, cb.y1]);
  return {
    W: 1920, H: 1080,
    ground: hex(dumpLayer(c1, 'Dark Gray Solid 1').source.color),
    title: {
      font: d0.font, size: fhd(d0.fontSize), tracking: d0.tracking, fills: lines.map((l) => hex(l.docs[0].fillColor)),
      origins: lines.map((l) => l.origin), firsts: lines.map((l) => l.first), step: lines[0].step,
      rise: fhd(layerProp(dumpLayer(c1, LINES[0][0]), 'ADBE Text Properties', 'ADBE Text Animators').children[0].children
        .find((c) => c.matchName === 'ADBE Text Animator Properties').children.find((c) => c.matchName === 'ADBE Text Position 3D').value[1]),
      // a line's band: from the line above's baseline to under the deepest descender of the font, a pixel more
      below: r6(GLYPHS[d0.font].bottom * fhd(d0.fontSize) + 1),
      // the room for a line: the third line of the pack ends 1192 px in (#1); a longer line shrinks the block
      room: fhd(1150),
      pack: LINES[0].map((n) => docOf(dumpLayer(c1, n)).text.trim()),
    },
    label: { ...label, pack: labelDoc.text.trim() },
    visual: { img, places: [v1, v2, v3], zoom },
    card: pathKeys(c1, 'Shape Layer 3'),
    portal: pathKeys(c3, 'портал большой'),
    window: pathKeys(c3, 'портал маленький'),
    logo: { cube: { x0: fhd(ca[0]), y0: fhd(ca[1]), w: fhd(cz[0] - ca[0]) } },
    descriptor: { font: docOf(dumpLayer(c1, 'облачные и ИИ-сервисы')).font, text: docOf(dumpLayer(c1, 'облачные и ИИ-сервисы')).text },
    // the bars of #2 move 0 -> t1 -> about the cut, all three on the same keys
    bars: { t1: barsMiddle(c2) },
  };
}

// The pack's timing: each line's rise (its Start keys, the same ease), the label's fade, the wipe «Переход» (its
// comp from 0; «Обложка #1» starts it at 4.96 s) and the moment the cover is cut under it.
export function coverTiming({ covers, wipe }) {
  const c1 = covers[0];
  const rises = LINES[0].map((name, i) => {
    const keys = layerProp(dumpLayer(c1, name), ...START).keys;
    return { ...dumpSegment(keys, 0, { label: `line ${i + 1} rise` }), t0: r6(keys[0].time) };
  });
  const op = xform(dumpLayer(c1, LABELS[0]), 'ADBE Opacity').keys;
  const W = dumpLayer(c1, 'Переход');
  const content = dumpLayer(c1, 'Shape Layer 3');
  return {
    rises,
    label: { t0: r6(op[0].time), t1: r6(op[1].time) },
    introEnd: r6(Math.max(op[1].time, ...rises.map((r) => r.t0 + r.frames / FPS))),
    wipe: { at: r6(W.inPoint), length: r6(wipe.comp.duration), cover: r6(content.outPoint - W.inPoint) },
  };
}

export function resolveCover(sources = loadSources()) {
  const { svg, tokens } = sources;
  const base = tokens.color.base;
  const L = coverLayout(sources);
  const tm = coverTiming(sources);
  const Tl = L.title;
  if (Math.abs(sources.wipe.comp.duration - (dumpLayer(sources.covers[0], 'Переход').outPoint - tm.wipe.at)) > 1e-6) throw new Error('Обложка #1: «Переход» is no longer played whole');
  // the pack's colours: the brand's black, white and green; the card #333333 and the label #CCCCCC have no token
  const colors = { ground: base.black.hex, white: base.white.hex, green: base.green.hex, black: base.black.hex, card: L.card.fill, label: L.label.fills[0] };
  for (const [got, want, what] of [[L.ground, colors.ground, 'ground'], [L.portal.fill, colors.green, 'big portal'], [L.window.fill, colors.white, 'white portal'],
    [Tl.fills[0], colors.white, 'title #1'], [Tl.fills[2], colors.black, 'title #3'], [L.label.fills[2], colors.black, 'label #3']]) {
    if (got !== want) throw new Error(`courses: ${what} ${got}, expected ${want}`);
  }
  const timeMap = timeMapJs({ introEnd: tm.introEnd, outroStart: null });
  // where the cover is cut at the default length, at 1x: the pack's cut (#1: 6.0 s)
  const cut0 = r6(DEFAULT_SEC - tm.wipe.length + tm.wipe.cover);
  const rig = {
    Rise1: canonProgress(tm.rises[0], tm.rises[0].t0),
    Rise2: canonProgress(tm.rises[1], tm.rises[1].t0),
    Rise3: canonProgress(tm.rises[2], tm.rises[2].t0),
    Label: [
      { t: tm.label.t0, v: 0, inType: 'LINEAR', outType: 'LINEAR', inEase: [[0, 16.666667]], outEase: [[0, 16.666667]] },
      { t: tm.label.t1, v: 1, inType: 'LINEAR', outType: 'LINEAR', inEase: [[0, 16.666667]], outEase: [[0, 16.666667]] },
    ],
    CardMove: moveKeys(L.card.keys),
    PortalMove: moveKeys(L.portal.keys),
    WindowMove: moveKeys(L.window.keys),
  };
  const slow = Math.min(...SPEEDS);
  const up = (s) => Math.ceil(r6((s / slow) * FPS)) / FPS;
  const duration = { introSec: r6(up(tm.introEnd)), holdSec: 0, outroSec: r6(up(tm.wipe.length)), maxSec: MAX_SEC };
  duration.holdSec = r6(DEFAULT_SEC - duration.introSec - duration.outroSec);
  if (!(duration.holdSec > 0)) throw new Error('the default length leaves no hold');

  // hidden lines hang out of their bands: the pack's 82.5 px would leave Й and Ё in them (rig-plate clearOffset)
  const lineStyle = { font: Tl.font, size: Tl.size, fill: colors.white, tracking: Tl.tracking, justify: 'LEFT' };
  const hide = Math.max(Tl.rise, clearOffset(Tl.below, lineStyle));
  const text = {
    TXT_LINE1: { value: 'Название курса', label: 'Заголовок, строка 1', style: lineStyle },
    TXT_LINE2: { value: 'в одну-три строки', label: 'Заголовок, строка 2', style: lineStyle },
    TXT_LINE3: { value: '', label: 'Заголовок, строка 3', style: lineStyle },
    TXT_PRODUCT: { value: 'Cloud.ru Advanced', label: 'Продукт', style: { font: L.label.font, size: L.label.size, fill: colors.label, tracking: L.label.tracking, justify: 'LEFT' } },
  };
  const ctrl = {
    Variant: { label: 'Вариант', items: VARIANTS, value: 1 },
    Speed: SPEED_CTRL,
    Duration: { label: 'Длительность (служебное, не менять)', kind: 'slider', value: DEFAULT_SEC },
  };
  const slots = { SLOT_VISUAL: { label: 'Визуал' } };
  const rgb = (h) => [1, 3, 5].map((i) => r6(parseInt(h.slice(i, i + 2), 16) / 255)).concat(1);

  const pre = [
    'var C = thisComp.layer("CTRL"), R = thisComp.layer("RIG");',
    'var k = Math.min(thisComp.width, thisComp.height) / 1080;',
    'var v = C.effect("Variant")(1).value;',
    timeMap.trim(),
    'var TT = T(time);',
    'function sl(e, t) { return R.effect(e)(1).valueAtTime(t); }',
    // the clip's end (the panel writes it), the wipe at the chosen speed before it, the cover cut under it
    `var D = C.effect("Duration")(1).value, t0 = D - ${tm.wipe.length} / SPEED, cut = t0 + ${tm.wipe.cover} / SPEED;`,
    // the background moves (card, portals, bars) as the pack's: the first one from the start; the second one in the
    // last CUT0 - t1 seconds before the cut, where the pack plays it (a longer clip holds in between, so its start and
    // its end look as the pack's at any length); a shorter clip squeezes the second move in. At the default length
    // this is exactly the pack's time
    `var CUT0 = ${cut0};`,
    'function BG(t, t1) { if (t <= t1) { return t; } var L2 = CUT0 - t1; if (cut - t1 <= L2) { return t1 + (t - t1) * L2 / Math.max(0.001, cut - t1); } return t < cut - L2 ? t1 : CUT0 - (cut - t); }',
  ].join('\n') + '\n';
  const cut = pre + 'time < cut ? 100 : 0';
  const only = (vs) => pre + `time < cut && (${vs.map((x) => `v == ${x}`).join(' || ')}) ? 100 : 0`;
  // the title block: empty lines collapse, the block shrinks to the room; the variant moves its origin
  const linesPre = pre + [
    `var N = ${js(TXT)};`,
    HAS_TEXT_JS,
    `function ink(n) { if (!hasText(n)) { return null; } var r = thisComp.layer(n).sourceRectAtTime(${REST}, false); return r.width > 0 ? { l: r.left / k, w: r.width / k } : null; }`,
    'var at = [], n = 0, m = 0;',
    'for (var i = 0; i < N.length; i++) { var e = ink(N[i]); at.push(e ? n : -1); if (e) { n++; m = Math.max(m, e.l + e.w); } }',
    `var f = m > ${Tl.room} ? ${Tl.room} / m : 1;`,
    `var ox = ${js(Tl.origins)}[v - 1], oy = ${js(Tl.firsts)}[v - 1];`,
  ].join('\n') + '\n';
  const lineJs = (i) => linesPre + `var me = at[${i}], b = (oy + Math.max(0, me) * ${Tl.step} * f) * k;\n`;
  // the selectors: the line's slot from the source texts, never their ink (rig-plate HAS_TEXT_JS)
  const slotJs = (i) => pre + HAS_TEXT_JS + '\n' + `var N = ${js(TXT)}, me = -1, n = 0;\nfor (var i = 0; i < N.length; i++) { if (hasText(N[i])) { if (i == ${i}) { me = n; } n++; } }\n`;

  const spec = new Spec({ name: COMP, w: L.W, h: L.H, fps: FPS, duration: MAX_SEC });
  // bottom first: the ground, the card / portal, the white window, the visual's matte and the visual, the bars,
  // the lines in their bands, the label, the header and the logo, the wipe
  spec.add(shape('GROUND', [rectGroup('Ground', colors.ground)]));
  spec.expr('GROUND', P.rectSize('Ground'), '[thisComp.width, thisComp.height]');
  spec.expr('GROUND', P.rectPos('Ground'), '[thisComp.width / 2, thisComp.height / 2]');
  spec.expr('GROUND', P.opacity, cut);
  const square = (h) => [{ vertices: [[0, 0], [h, 0], [h, h], [0, h]], inTangents: [[0, 0], [0, 0], [0, 0], [0, 0]], outTangents: [[0, 0], [0, 0], [0, 0], [0, 0]], closed: true }];
  // the card of #1 (#333333) or the big portal of #3 (green); none on #2
  spec.add(shape('CARD', [pathGroup('Card', colors.card, square(100))]));
  spec.expr('CARD', ['group', 'Card', 'Path 1', 'ADBE Vector Shape'], pre + 'var A = (function () {\n' + pathJs(L.card.keys.map((x) => x.v), 'CardMove', L.card.keys[1].t) + '\nreturn pts; })();\n'
    + 'var B = (function () {\n' + pathJs(L.portal.keys.map((x) => x.v), 'PortalMove', L.portal.keys[1].t) + '\nreturn pts; })();\ncreatePath(v == 3 ? B : A, [], [], true)');
  spec.expr('CARD', P.fill('Card'), pre + `v == 3 ? ${js(rgb(colors.green))} : ${js(rgb(colors.card))}`);
  spec.expr('CARD', P.opacity, only([1, 3]));
  // the white window of #3 (the pack's «Visual with background» is white under its matte)
  spec.add(shape('WINDOW', [pathGroup('Window', colors.white, square(100))]));
  spec.expr('WINDOW', ['group', 'Window', 'Path 1', 'ADBE Vector Shape'], pre + pathJs(L.window.keys.map((x) => x.v), 'WindowMove', L.window.keys[1].t) + '\ncreatePath(pts, [], [], true)');
  spec.expr('WINDOW', P.opacity, only([3]));
  // the visual's matte: the card (#1), the window (#3), the whole frame (#2)
  spec.add(shape('VMATTE', [pathGroup('Matte', colors.white, square(100))]));
  spec.expr('VMATTE', ['group', 'Matte', 'Path 1', 'ADBE Vector Shape'], pre + 'var A = (function () {\n' + pathJs(L.card.keys.map((x) => x.v), 'CardMove', L.card.keys[1].t) + '\nreturn pts; })();\n'
    + 'var B = (function () {\n' + pathJs(L.window.keys.map((x) => x.v), 'WindowMove', L.window.keys[1].t) + '\nreturn pts; })();\n'
    + 'var W = thisComp.width, H = thisComp.height;\ncreatePath(v == 1 ? A : (v == 3 ? B : [[0, 0], [W, 0], [W, H], [0, H]]), [], [], true)');
  // the visual: a photo slot the size of the pack's image, where each cover has it; #1 and #2 push in slowly
  const ph = { name: 'CR_CRS_Cover_visual', w: L.visual.img.w, h: L.visual.img.h };
  spec.add(slot('SLOT_VISUAL', ph));
  const vp = L.visual.places;
  const Z = L.visual.zoom;
  spec.expr('SLOT_VISUAL', P.pos, pre + `var c = ${js(vp.map((x) => x.centre))}[v - 1];\n[c[0] * k, c[1] * k]`);
  spec.expr('SLOT_VISUAL', P.scale, pre + `var s = ${js(vp.map((x) => x.scale))}[v - 1] * (v == 3 ? 1 : (${Z.from} + ${Z.rate} * Math.min(time * CUT0 / cut, ${Z.until})) / ${Z.from});\n[100 * s * k, 100 * s * k]`);
  spec.expr('SLOT_VISUAL', P.opacity, cut);
  spec.matte('SLOT_VISUAL', 'VMATTE', 'ALPHA', { keepVisible: false });
  // the bars of #2: the pack's layers in their comp, in real time
  spec.add(precomp('DECOR_BARS', 'DECOR_BARS', { collapse: true, timeRemap: true }));
  for (const d of ['DECOR_BARS']) {
    spec.expr(d, P.pos, '[thisComp.width / 2, thisComp.height / 2]');
    spec.expr(d, P.scale, 'var s = 100 * Math.min(thisComp.width, thisComp.height) / 1440;\n[s, s]');
  }
  spec.expr('DECOR_BARS', P.opacity, only([2]));
  spec.expr('DECOR_BARS', P.timeRemap, pre + `BG(time, ${L.bars.t1})`);
  // the lines: the m-th one rises with the pack's m-th line, into its band
  for (let i = TXT.length - 1; i >= 0; i -= 1) {
    spec.add(shape(`CL_LINE${i + 1}`, [rectGroup('Band', colors.white)]));
    spec.add(textLayer(TXT[i], { ...lineStyle, value: text[TXT[i]].value }, [{ name: 'Rise', basedOn: 4 }, { name: 'Ink', basedOn: 1, position: false, fill: rgb(colors.white).slice(0, 3) }]));
  }
  for (let i = 0; i < TXT.length; i += 1) {
    const t = TXT[i];
    const j = lineJs(i);
    spec.expr(t, P.pos, j + '[ox * k, b]');
    spec.expr(t, P.scale, j + '[100 * f, 100 * f]');
    spec.expr(t, P.rise(), 'var k = Math.min(thisComp.width, thisComp.height) / 1080;\n' + `[0, ${hide} * k, 0]`);
    spec.expr(t, P.start(), slotJs(i) + 'me < 0 ? 100 : 100 * sl(["Rise1", "Rise2", "Rise3"][me], TT)');
    spec.expr(t, ['animator', 'Ink', 'ADBE Text Fill Color'], pre + `v == 3 ? ${js(rgb(colors.black))} : ${js(rgb(colors.white))}`);
    spec.expr(t, P.opacity, cut);
    spec.expr(`CL_LINE${i + 1}`, P.rectSize('Band'), j + `me < 0 ? [0, 0] : [(ox + ${Tl.room} + 60) * k, (${Tl.step} + ${Tl.below}) * f * k]`);
    spec.expr(`CL_LINE${i + 1}`, P.rectPos('Band'), j + `[(ox + ${Tl.room} + 60) * k / 2, b + (${Tl.below} - ${Tl.step}) * f * k / 2]`);
    spec.matte(t, `CL_LINE${i + 1}`, 'ALPHA', { keepVisible: false });
  }
  // the label: where #1 and #2 have it, or on the big portal's corner (#3); fades in after the first line
  spec.add(textLayer('TXT_PRODUCT', { ...text.TXT_PRODUCT.style, value: text.TXT_PRODUCT.value }, [{ name: 'Ink', basedOn: 1, position: false, fill: rgb(colors.label).slice(0, 3) }]));
  const corner = L.portal.keys.map((x) => x.v[LABEL_CORNER]);
  spec.expr('TXT_PRODUCT', P.pos, pre + [
    `var K = ${js(corner)};`,
    `var p = sl("PortalMove", BG(time, ${L.portal.keys[1].t})), i = Math.min(K.length - 2, Math.max(0, Math.floor(p))), u = Math.min(1, p - i);`,
    'var cx = K[i][0] + (K[i + 1][0] - K[i][0]) * u, cy = K[i][1] + (K[i + 1][1] - K[i][1]) * u;',
    `v == 3 ? [(cx + ${L.label.corner[0]}) * k, (cy + ${L.label.corner[1]}) * k] : [${L.label.at[0]} * k, ${L.label.at[1]} * k]`,
  ].join('\n'));
  spec.expr('TXT_PRODUCT', ['animator', 'Ink', 'ADBE Text Fill Color'], pre + `v == 3 ? ${js(rgb(colors.black))} : ${js(rgb(colors.label))}`);
  spec.expr('TXT_PRODUCT', P.opacity, pre + 'time < cut ? 100 * sl("Label", TT) : 0');
  // the header: the pack's hatching (matted to its band) and descriptor, in real time; the master logo (D18)
  spec.add(precomp('DECOR_HEAD', 'DECOR_HEAD', { collapse: true }));
  spec.expr('DECOR_HEAD', P.pos, '[thisComp.width / 2, thisComp.height / 2]');
  spec.expr('DECOR_HEAD', P.scale, 'var s = 100 * Math.min(thisComp.width, thisComp.height) / 1440;\n[s, s]');
  spec.expr('DECOR_HEAD', P.opacity, cut);
  const fit = fitCube(svg, L.logo.cube);
  const lockup = masterLockup(svg, fit);
  spec.add(shape('LOGO', [pathGroup('Wordmark', colors.white, lockup.wordmark), pathGroup('Cube', colors.green, lockup.cube)]));
  spec.expr('LOGO', P.scale, 'var k = Math.min(thisComp.width, thisComp.height) / 1080;\n[100 * k, 100 * k]');
  spec.expr('LOGO', P.opacity, cut);
  // the wipe: the pack's comp «Переход», played at the clip's end at the chosen speed (empty before and after: its
  // bars come in from the right and leave to the left)
  spec.add(precomp('DECOR_WIPE', 'DECOR_WIPE', { timeRemap: true, collapse: true }));
  spec.expr('DECOR_WIPE', P.pos, '[thisComp.width / 2, thisComp.height / 2]');
  spec.expr('DECOR_WIPE', P.scale, 'var s = 100 * Math.min(thisComp.width, thisComp.height) / 1440;\n[s, s]');
  spec.expr('DECOR_WIPE', P.timeRemap, pre + `Math.min(${r6(tm.wipe.length - 1 / FPS / 4)}, Math.max(0, (time - t0) * SPEED))`);
  addQaPatch(spec, colors.green);
  spec.add(nul('RIG', Object.keys(rig).map((name) => ({ kind: 'slider', name })), { shy: true }));
  for (const [name, keys] of Object.entries(rig)) spec.key('RIG', P.slider(name), keys);
  spec.add(nul('CTRL', [
    { kind: 'dropdown', name: 'Variant', items: ctrl.Variant.items, value: ctrl.Variant.value },
    { kind: 'dropdown', name: 'Speed', items: ctrl.Speed.items, value: ctrl.Speed.value },
    { kind: 'slider', name: 'Duration', value: DEFAULT_SEC },
    { kind: 'checkbox', name: 'QA', value: false },
  ]));

  // AE lists the newest controller first: added in reverse of Визуал, Заголовок 1–3, Продукт, Вариант, Скорость,
  // Длительность
  const order = [{ slot: 'SLOT_VISUAL' }, ...TXT.map((t) => ({ text: t })), { text: 'TXT_PRODUCT' }, { effect: 'Variant' }, { effect: 'Speed' }, { effect: 'Duration', matchName: 'ADBE Slider Control' }];
  const egp = [...order].reverse();
  const label = (e) => (e.text ? text[e.text].label : e.slot ? slots[e.slot].label : ctrl[e.effect].label);
  const pack = { ...Object.fromEntries(TXT.map((t, i) => [t, Tl.pack[i]])), TXT_PRODUCT: L.label.pack };
  const built = spec.toJSON();
  const keep = (cover, name) => {
    const hit = sources.covers[cover].layers.filter((l) => l.name === name);
    if (hit.length !== 1) throw new Error(`${COVERS[cover].name}: ${hit.length} layers named ${name}`);
    return { index: hit[0].index, name };
  };
  const src = (i) => ({ name: COVERS[i].name, w: 2560, h: 1440, layers: COVERS[i].layers });
  return {
    id: ID,
    workDir: workDir(),
    out: { dir: workPath('build', ID), aep: workPath('build', ID, ID + '_work.aep') },
    comp: spec.comp,
    colors,
    layout: L,
    timing: tm,
    hide,
    text,
    slots,
    pack,
    ctrl,
    egp,
    rig,
    markers: [],
    duration,
    spec: {
      ...built,
      fonts: [Tl.font, L.descriptor.font],
      markers: [],
      transplant: {
        aep: packProject('courses'),
        folder: 'BK_DECOR',
        source: src(0),
        comps: [
          // the header of #1: the hatching, its band and the descriptor ride on the pack's logo layer, which stays
          // for them without its picture (the master logo replaces it)
          { name: 'DECOR_HEAD', keep: [keep(0, 'Shape Layer 2'), keep(0, 'Shape Layer 1'), keep(0, 'облачные и ИИ-сервисы'), keep(0, 'Logo')], hide: ['Logo'], duration: MAX_SEC, extendLayers: true },
          { name: 'DECOR_BARS', source: src(1), keep: [keep(1, 'Shape Layer 8'), keep(1, 'Shape Layer 7'), keep(1, 'Shape Layer 6')], duration: MAX_SEC, extendLayers: true },
          { name: 'DECOR_WIPE', source: { name: 'Переход', w: 2560, h: 1440, layers: sources.wipe.layers.length }, keep: sources.wipe.layers.map((l) => ({ index: l.index, name: l.name })) },
        ],
      },
      egp: egp.map((e) => (e.text ? { text: e.text, label: label(e) } : e.slot ? { slot: e.slot, label: label(e) }
        : { effect: e.effect, matchName: e.matchName || 'ADBE Dropdown Control', label: label(e) })),
      egpNames: order.map(label),
      measure: [{ name: 'pack', t: REST, ctrl: { Variant: 1 }, text: pack, layers: [...TXT, 'TXT_PRODUCT', 'CL_LINE1', 'CARD', 'LOGO'] }],
      defaults: { text: Object.fromEntries([...TXT, 'TXT_PRODUCT'].map((t) => [t, text[t].value])), ctrl: { Variant: 1, Speed: 2, Duration: DEFAULT_SEC } },
    },
    check: {},
    version: 1,
    variants: ['16x9', '16x9_4K'].map((key) => ({ key, ...tokens.video.formats[key] })),
    sweepTimes: [0, 0.4, 0.8, 1.2, 2.0, 3.0, 4.0, 5.2, 5.6, 6.0, 6.5, 6.96, 20, 29.96],
    rest: REST,
  };
}

export const resolve = resolveCover;

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = resolveCover();
  console.log(JSON.stringify({ layers: r.spec.order, keys: r.spec.keys.length, expressions: r.spec.expressions.length, mattes: r.spec.mattes.length,
    layout: { ...r.layout, card: r.layout.card.keys.length, portal: r.layout.portal.keys.length, window: r.layout.window.keys.length },
    timing: r.timing, hide: r.hide, duration: r.duration, egp: r.spec.egpNames, transplant: r.spec.transplant.comps.map((c) => c.name) }, null, 1).slice(0, 6000));
}
