// BG_Patterns «Паттерны и иконки»: the vector stills the packs share (spec 5, «Паттерны и иконки (стиллы)»: T3, SVG and
// PNG, «на тёмном и светлом»; review 72), each from the pack that draws it:
// - the arrow-corner pattern: the cell of the webinars' «PATTERN RACK» (the SMM grid's «Strelka» is the same two
//   strokes), tiled at the rack's pitch;
// - the arrow: the webinar announce's bold «Strelka», the same drawing with a stroke an eighth of its size;
// - the dot grid of the webinar announce (6×5 squares);
// - the podcast's globe at rest, its four squares around it.
// The files:
// - PNG: a frame of 16:9 (FHD and 4K), 9:16 and 1:1 on transparent, rendered in AE; the panel places it. The pattern
//   covers the frame at BG_Rack's scale (75 px cells in FHD); an icon sits in the middle, a third of the short side;
// - SVG: the pattern's cell (a seamless 150 px tile) and each icon alone, tight, for layouts.
// «Фон»: dark — the elements white (the pattern at 25 %, as BG_Rack's light arrows); light — #222222.
// Built from a declarative spec (tools/masters/jsx/build-spec.jsx); choices: masters/BG_Patterns/README.md.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bbox, samplePolyline } from '../../tools/dump/geometry.mjs';
import { layerProp, readJson } from '../../tools/dump/model.mjs';
import { workDir, workPath } from '../../tools/lib/work.mjs';
import { layerToCompAt, restValueAt, shapePathsAt } from '../../tools/masters/dump-geometry.mjs';
import { dumpLayer } from '../../tools/masters/dump-keys.mjs';
import { addQaPatch } from '../../tools/masters/rig-plate.mjs';
import { nul, P, pathGroup, repeater, shape, Spec, strokeGroup } from '../../tools/masters/spec.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');

export const ID = 'BG_Patterns';
export const COMP = 'CR_BG_Patterns';
const FPS = 25;
const DEFAULT_SEC = 10;
const FORMATS = ['16x9', '16x9_4K', '9x16', '1x1'];
const PITCH = 150;          // the rack's cell in its 4K comp
const PATTERN_SCALE = 50;   // FHD: the 4K grid at 50 %, as BG_Rack (75 px cells)
const GRID = 27;            // cells a side: 27 x 75 px cover 1920 px either way
const FIT = 360;            // an icon fits a box of a third of the frame's short side
const GLOBE_T = 1.52;       // the globe at rest: its front group face on, the other edge on, the squares in place
const RACK = 'Layer 34/Frame 1[851040355-851040356] Outlines 2';

// «Элемент» and «Фон» in the order of the form; the keys name the files
export const ELEMENTS = [
  { key: 'pattern', label: 'Паттерн стрелок' },
  { key: 'arrow', label: 'Стрелка' },
  { key: 'dots', label: 'Сетка точек' },
  { key: 'globe', label: 'Глобус' },
];
export const GROUNDS = [
  { key: 'dark', label: 'Тёмный', ink: 'white', patternOpacity: 25, plate: 'black' },
  { key: 'light', label: 'Светлый', ink: 'black', patternOpacity: 100, plate: 'gray' },
];

const r3 = (v) => Math.round(v * 1000) / 1000;
const r6 = (v) => Math.round(v * 1e6) / 1e6;
const js = (v) => JSON.stringify(v);
const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const rgba = (h) => [1, 3, 5].map((i) => r6(parseInt(h.slice(i, i + 2), 16) / 255)).concat(1);
const scaleOf = (m) => r6(Math.hypot(m[0], m[1]));
const boxOf = (sps) => bbox(sps.flatMap((s) => samplePolyline(s)));
const move = (sp, dx, dy, s = 1) => ({
  closed: sp.closed,
  vertices: sp.vertices.map(([x, y]) => [r6((x + dx) * s), r6((y + dy) * s)]),
  inTangents: sp.inTangents.map(([x, y]) => [r6(x * s), r6(y * s)]),
  outTangents: sp.outTangents.map(([x, y]) => [r6(x * s), r6(y * s)]),
});
const rectPath = ([x0, y0, x1, y1]) => ({
  closed: true, vertices: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], inTangents: [[0, 0], [0, 0], [0, 0], [0, 0]], outTangents: [[0, 0], [0, 0], [0, 0], [0, 0]],
});

export function loadSources({ dumps = 'C:/CRBK/work/dumps', repo = REPO } = {}) {
  const d = (p) => readJson(path.join(dumps, p + '.json'));
  return {
    smm: d('smm/pattern_edit'),
    rack: d('webinars/pattern_rack'),
    announce: d('webinars/anons_vebinar_1x1'),
    podcast: d('podcast/pattern_1'),
    // the dot squares were measured with the webinar announce (masters/WEB_Announce/source-metrics.json)
    metrics: JSON.parse(readFileSync(path.join(repo, 'masters', 'WEB_Announce', 'source-metrics.json'), 'utf8')),
    tokens: JSON.parse(readFileSync(path.join(repo, 'brand', 'tokens.json'), 'utf8')),
  };
}

const find = (node, mn, out = []) => {
  if (node.enabled !== false && node.matchName === mn) out.push(node);
  if (node.enabled !== false) for (const c of node.children || []) find(c, mn, out);
  return out;
};
// The one stroke of a layer: width in the layer's px, colour.
function strokeOf(L) {
  const root = layerProp(L, 'ADBE Root Vectors Group');
  const widths = [...new Set(find(root, 'ADBE Vector Stroke Width').map((n) => n.value))];
  const colours = [...new Set(find(root, 'ADBE Vector Stroke Color').map((n) => hex(n.value)))];
  if (widths.length !== 1 || colours.length !== 1) throw new Error(`${L.name}: strokes ${widths.join(',')} in ${colours.join(',')}`);
  return { width: widths[0], colour: colours[0] };
}
const fillOf = (L) => {
  const fills = [...new Set(find(layerProp(L, 'ADBE Root Vectors Group'), 'ADBE Vector Fill Color').map((n) => hex(n.value)))];
  if (fills.length !== 1) throw new Error(`${L.name}: fills ${fills.join(',')}`);
  return fills[0];
};
// a drawing's subpaths through its corner box: the same drawing at another size or place has the same numbers
const unit = (sps, b) => sps.map((sp) => sp.vertices.map(([x, y]) => [r3((x - b.x0) / (b.x1 - b.x0)), r3((y - b.y0) / (b.y1 - b.y0))]));

// The pack's stills in their own px: the cell in the rack's 150 px pitch, the arrow, the dots, the globe.
export function stills({ smm, rack, announce, podcast, metrics }) {
  // the cell: the rack's top one, in a column of 15 at the pitch; the SMM grid's cell is the same strokes, moved
  const R = dumpLayer(rack, RACK);
  const column = shapePathsAt(rack, R, 0);
  if (column.length !== 30) throw new Error(`the rack's column has ${column.length / 2} cells, not 15`);
  const top = column.slice(-2);
  for (let i = 0; i < column.length; i += 2) {
    const row = Math.round((column[i].vertices[0][1] - top[0].vertices[0][1]) / PITCH);
    const back = [column[i], column[i + 1]].map((sp) => move(sp, 0, -row * PITCH));
    if (js(back.map((s) => s.vertices.map((p) => p.map(r3)))) !== js(top.map((s) => s.vertices.map((p) => p.map(r3))))) throw new Error(`the rack's cell ${i / 2} is not the top one`);
  }
  const smmCell = shapePathsAt(smm, dumpLayer(smm, 'Strelka'), 0);
  if (js(unit(smmCell, boxOf(smmCell))) !== js(unit(top, boxOf(top)))) throw new Error('the SMM grid and the rack draw different arrows');
  const rs = strokeOf(R);
  const cell = { paths: top.map((sp) => move(sp, 0, 0)), width: rs.width * scaleOf(layerToCompAt(rack, R, 0)), colour: rs.colour };
  // the arrow: the announce's, its stroke an eighth of the drawing; drawn with the cell's numbers
  const A = dumpLayer(announce, 'Strelka');
  const ap = shapePathsAt(announce, A, 5);
  const ab = boxOf(ap);
  const cb = boxOf(top);
  if (unit(ap, ab).flat(2).some((v, i) => Math.abs(v - unit(top, cb).flat(2)[i]) > 0.002)) throw new Error('the announce\'s arrow is not the cell\'s drawing');
  const ratio = r6((strokeOf(A).width * scaleOf(layerToCompAt(announce, A, 5))) / (ab.x1 - ab.x0));
  // the dots: the announce's picture, squares in its px
  const dots = { w: metrics.dots.size[0], h: metrics.dots.size[1], squares: metrics.dots.squares, colour: metrics.dots.colour };
  // the globe: the group on «Null 2», face on at rest; the group on «Null 1» is edge on, a sliver over the axis
  const nullOf = (name) => dumpLayer(podcast, name);
  const yRot = (L) => restValueAt(layerProp(L, 'ADBE Transform Group', 'ADBE Rotate Y'), GLOBE_T);
  if (yRot(nullOf('Null 2')) !== 0 || Math.abs(Math.cos((yRot(nullOf('Null 1')) * Math.PI) / 180)) > 0.08) throw new Error('the globe is not at rest at ' + GLOBE_T);
  const front = podcast.layers.filter((l) => l.parent === nullOf('Null 2').index);
  if (front.map((l) => l.name).sort().join('|') !== 'big_elipse 2|line_horiz 2|line_vert 2|small_elipse 2') throw new Error('the globe\'s front group changed');
  const lines = front.flatMap((L) => shapePathsAt(podcast, L, GLOBE_T));
  const widths = [...new Set(front.map((L) => r3(strokeOf(L).width * scaleOf(layerToCompAt(podcast, L, GLOBE_T)))))];
  if (widths.length !== 1) throw new Error('the globe\'s strokes differ: ' + widths.join(', '));
  const cubes = podcast.layers.filter((l) => /^Cube_\d$/.test(l.name));
  const squares = cubes.flatMap((L) => shapePathsAt(podcast, L, GLOBE_T));
  const colours = new Set([...front.map((L) => strokeOf(L).colour), ...cubes.map(fillOf)]);
  if (squares.length !== 4 || colours.size !== 1) throw new Error('the globe: ' + squares.length + ' squares in ' + [...colours].join(','));
  const globe = { lines, squares, width: widths[0], colour: [...colours][0] };
  return { cell, arrow: { ratio }, dots, globe };
}

// Each icon in its own px from (0, 0), its box with the strokes: { strokes, fills, width, w, h }.
export function icons(S) {
  // the arrow: the cell's strokes through their corner box made 100 px, the stroke an eighth (12.5 px)
  const cb = boxOf(S.cell.paths);
  const side = 100;
  const sw = r6(side * S.arrow.ratio);
  const half = sw / 2;
  const arrowPaths = S.cell.paths.map((sp) => move(sp, -cb.x0, -cb.y0, side / (cb.x1 - cb.x0)));
  const ab = boxOf(arrowPaths);
  const arrow = { strokes: arrowPaths.map((sp) => move(sp, half - ab.x0, half - ab.y0)), fills: [], width: sw, w: r6(ab.x1 - ab.x0 + sw), h: r6(ab.y1 - ab.y0 + sw) };
  const dots = { strokes: [], fills: S.dots.squares.map(rectPath), width: 0, w: S.dots.w, h: S.dots.h };
  // the globe: its squares bound it (the strokes are inside them)
  const G = S.globe;
  const gb = boxOf(G.squares);
  const lb = boxOf(G.lines);
  if (lb.x0 - G.width / 2 < gb.x0 || lb.x1 + G.width / 2 > gb.x1 || lb.y0 - G.width / 2 < gb.y0 || lb.y1 + G.width / 2 > gb.y1) throw new Error('the globe\'s lines leave its squares');
  const globe = { strokes: G.lines.map((sp) => move(sp, -gb.x0, -gb.y0)), fills: G.squares.map((sp) => move(sp, -gb.x0, -gb.y0)), width: r6(G.width), w: r6(gb.x1 - gb.x0), h: r6(gb.y1 - gb.y0) };
  return { arrow, dots, globe };
}

// SVG of subpaths: straight segments as L, curved ones as C.
export function pathD(sp) {
  const n = sp.vertices.length;
  const p = (v) => `${r3(v[0])} ${r3(v[1])}`;
  const out = [`M${p(sp.vertices[0])}`];
  const seg = (i, j) => {
    const a = sp.vertices[i];
    const b = sp.vertices[j];
    const o = sp.outTangents[i];
    const t = sp.inTangents[j];
    if (!o[0] && !o[1] && !t[0] && !t[1]) out.push(`L${p(b)}`);
    else out.push(`C${p([a[0] + o[0], a[1] + o[1]])} ${p([b[0] + t[0], b[1] + t[1]])} ${p(b)}`);
  };
  for (let i = 1; i < n; i += 1) seg(i - 1, i);
  if (sp.closed) { seg(n - 1, 0); out.push('Z'); }
  return out.join('');
}

function svgDoc(w, h, body) {
  return [`<svg xmlns="http://www.w3.org/2000/svg" width="${r3(w)}" height="${r3(h)}" viewBox="0 0 ${r3(w)} ${r3(h)}">`, ...body, '</svg>', ''].join('\n');
}

// The SVG of an element on a ground: the pattern's cell as a tile, an icon alone.
export function elementSvg(key, S, I, ink, opacity = 1) {
  const op = opacity < 1 ? ` stroke-opacity="${opacity}"` : '';
  const strokes = (sps, width) => [`<g fill="none" stroke="${ink}" stroke-width="${r3(width)}"${op}>`, ...sps.map((sp) => `<path d="${pathD(sp)}"/>`), '</g>'];
  const fills = (sps) => [`<g fill="${ink}">`, ...sps.map((sp) => `<path d="${pathD(sp)}"/>`), '</g>'];
  if (key === 'pattern') return svgDoc(PITCH, PITCH, strokes(S.cell.paths, S.cell.width));
  const icon = I[key];
  return svgDoc(icon.w, icon.h, [...(icon.strokes.length ? strokes(icon.strokes, icon.width) : []), ...(icon.fills.length ? fills(icon.fills) : [])]);
}

export function resolvePatterns(sources = loadSources()) {
  const { tokens } = sources;
  const base = tokens.color.base;
  const S = stills(sources);
  const I = icons(S);
  if (S.cell.colour !== base.black.hex || S.dots.colour !== base.black.hex || S.globe.colour !== base.white.hex) {
    throw new Error(`the stills' colours changed: the rack ${S.cell.colour}, the dots ${S.dots.colour}, the globe ${S.globe.colour}`);
  }
  const grounds = GROUNDS.map((g) => ({ ...g, hex: base[g.ink].hex, plateHex: base[g.plate].hex }));
  const ctrl = {
    Element: { label: 'Элемент', items: ELEMENTS.map((e) => e.label), value: 1 },
    Ground: { label: 'Фон', items: grounds.map((g) => g.label), value: 1 },
  };

  const pre = [
    'var e = thisComp.layer("CTRL").effect("Element")(1).value;',
    'var g = thisComp.layer("CTRL").effect("Ground")(1).value;',
    'var k = Math.min(thisComp.width, thisComp.height) / 1080;',
  ].join('\n') + '\n';
  const ink = `${js(grounds.map((g) => rgba(g.hex)))}[g - 1]`;
  const spec = new Spec({ name: COMP, w: 1920, h: 1080, fps: FPS, duration: DEFAULT_SEC });
  // the pattern: one cell, a row of them, the rows; from the frame's top left at BG_Rack's scale
  spec.add(shape('PATTERN', [strokeGroup('Cell', { color: grounds[0].hex, width: S.cell.width }, S.cell.paths,
    { repeaters: [repeater('Columns', GRID, [PITCH, 0]), repeater('Rows', GRID, [0, PITCH])] })]));
  spec.expr('PATTERN', P.scale, pre + `[${PATTERN_SCALE} * k, ${PATTERN_SCALE} * k]`);
  spec.expr('PATTERN', P.opacity, pre + `e == 1 ? ${js(grounds.map((g) => g.patternOpacity))}[g - 1] : 0`);
  spec.expr('PATTERN', ['group', 'Cell', 'Stroke', 'ADBE Vector Stroke Color'], pre + ink);
  // the icons, each drawn about its middle, in the frame's middle at a third of its short side
  ELEMENTS.slice(1).forEach((el, i) => {
    const icon = I[el.key];
    const name = el.key.toUpperCase();
    const c = (sp) => move(sp, -icon.w / 2, -icon.h / 2);
    const groups = [];
    if (icon.strokes.length) groups.push(strokeGroup('Lines', { color: grounds[0].hex, width: icon.width }, icon.strokes.map(c)));
    if (icon.fills.length) groups.push(pathGroup('Squares', grounds[0].hex, icon.fills.map(c)));
    spec.add(shape(name, groups));
    spec.expr(name, P.pos, '[thisComp.width / 2, thisComp.height / 2]');
    spec.expr(name, P.scale, pre + `var s = ${r6((100 * FIT) / Math.max(icon.w, icon.h))} * k;\n[s, s]`);
    spec.expr(name, P.opacity, pre + `e == ${i + 2} ? 100 : 0`);
    if (icon.strokes.length) spec.expr(name, ['group', 'Lines', 'Stroke', 'ADBE Vector Stroke Color'], pre + ink);
    if (icon.fills.length) spec.expr(name, P.fill('Squares'), pre + ink);
  });
  addQaPatch(spec, base.green.hex);
  spec.add(nul('CTRL', [
    { kind: 'dropdown', name: 'Element', items: ctrl.Element.items, value: 1 },
    { kind: 'dropdown', name: 'Ground', items: ctrl.Ground.items, value: 1 },
    { kind: 'checkbox', name: 'QA', value: false },
  ]));

  // the files: per element and ground a still of each format (the first frame) and an SVG
  const files = ELEMENTS.flatMap((el, e) => grounds.flatMap((g, gi) => [
    ...FORMATS.map((variant) => ({ key: `${variant}_${el.key}_${g.key}`, variant, ctrl: { Element: e + 1, Ground: gi + 1 }, kind: 'still', t: 0, options: { element: e + 1, ground: gi + 1 } })),
    { key: `svg_${el.key}_${g.key}`, kind: 'svg', content: elementSvg(el.key, S, I, g.hex, el.key === 'pattern' ? g.patternOpacity / 100 : 1), options: { element: e + 1, ground: gi + 1 } },
  ]));
  const built = spec.toJSON();
  return {
    id: ID,
    workDir: workDir(),
    out: { dir: workPath('build', ID), aep: workPath('build', ID, ID + '_work.aep') },
    comp: spec.comp,
    stills: S,
    icons: I,
    grounds,
    ctrl,
    text: {},
    slots: {},
    egp: [],
    rig: {},
    markers: [],
    duration: { introSec: 0, holdSec: DEFAULT_SEC, outroSec: 0 },
    files,
    spec: {
      ...built,
      fonts: [],
      markers: [],
      egp: [],
      egpNames: [],
      measure: [],
      defaults: { text: {}, ctrl: { Element: 1, Ground: 1 } },
    },
    check: {},
    version: 1,
    variants: FORMATS.map((key) => ({ key, ...tokens.video.formats[key] })),
    sweepTimes: [0],
    rest: 0,
  };
}

export const resolve = resolvePatterns;

// The library entry (library.src.json): tier T3, «Элемент» and «Фон» pick the files (variant options); the PNGs are
// frames the panel places by the format of the comp or sequence, the SVG is for layouts.
export function libraryEntry(p = resolvePatterns()) {
  const minHostVersion = { ae: '26.0', pr: '26.0' };
  return {
    id: ID,
    title_ru: 'Паттерны и иконки',
    category: 'backgrounds',
    tier: 'T3',
    hosts: ['ae', 'pr'],
    version: p.version,
    duration: p.duration,
    fields: [
      { key: 'element', label_ru: 'Элемент', type: 'dropdown', default: 1, options: ELEMENTS.map((e, i) => ({ index: i + 1, label_ru: e.label })) },
      { key: 'ground', label_ru: 'Фон', type: 'dropdown', default: 1, options: p.grounds.map((g, i) => ({ index: i + 1, label_ru: g.label })) },
    ],
    variants: p.files.map((f) => {
      if (f.kind === 'svg') return { key: f.key, options: f.options, minHostVersion };
      const v = p.variants.find((x) => x.key === f.variant);
      return { key: f.key, aspect: f.variant === '16x9_4K' ? '16x9' : f.variant, w: v.w, h: v.h, fps: FPS, options: f.options, minHostVersion };
    }),
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = resolvePatterns();
  const box = (i) => ({ w: i.w, h: i.h, width: i.width, strokes: i.strokes.length, fills: i.fills.length });
  console.log(JSON.stringify({ layers: r.spec.order, expressions: r.spec.expressions.length, cell: { width: r.stills.cell.width, colour: r.stills.cell.colour },
    arrowRatio: r.stills.arrow.ratio, icons: Object.fromEntries(Object.entries(r.icons).map(([k, v]) => [k, box(v)])), files: r.files.length }, null, 1));
}
