// SMM_FrameNotched «Рамка с вырезами»: the SMM pack's frame overlays («Оверлей_9x16», «Оверлей_1x1»: six dark
// rectangles along the edges, a step on the top and on the bottom edge sliding along it) as files, not a template
// (spec 5: T2 and a still): per format and colour the frame at rest and a 60 s drift loop on alpha. This master is only
// their source: tools/masters/render-files.mjs renders them.
// - The rectangles rebuilt from the dump: the pack's sizes and rest positions in its square design; the pack lays the
//   design out by its layer (9:16 squeezed to 70 × 130 %, 1:1 the square), the master does the same.
// - The steps' drift on the canon M10 (D19, signed: «вырезы SMM — на общую кривую»): the pack's turning points, a
//   15 s segment each on the curve 0.775,0,0.667,1, one axis a segment, four segments — a 60 s loop. The pack moved
//   them linearly on a 15 s cycle (22.4 s in 1:1).
// - 16:9 (not in the pack): the 9:16 frame turned a quarter.
// - «Цвет»: dark (the pack's), green, white — a Fill.
// Choices: masters/SMM_FrameNotched/README.md.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { layerProp, readJson } from '../../tools/dump/model.mjs';
import { workDir, workPath } from '../../tools/lib/work.mjs';
import { addQaPatch } from '../../tools/masters/rig-plate.mjs';
import { nul, P, rectGroup, shape, Spec } from '../../tools/masters/spec.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');

export const ID = 'SMM_FrameNotched';
export const COMP = 'CR_SMM_FrameNotched';
const FPS = 25;
export const PERIOD = 60;       // M10: four 15 s segments
const PACK = {
  tall: { slug: 'shape_layer_2_comp_1', name: 'Shape Layer 2 Comp 1', w: 1080, h: 1920 },
  square: { slug: 'shape_layer_5_comp_1', name: 'Shape Layer 5 Comp 1', w: 1440, h: 1440 },
};
// «Цвет», in the order of the transitions: the file key, the label, the brand colour (tokens.json -> color.base)
export const COLOURS = [
  { key: 'green', label: 'Зелёный', token: 'green' },
  { key: 'dark', label: 'Тёмный', token: 'black' },
  { key: 'white', label: 'Белый', token: 'white' },
];
export const DEFAULT_COLOUR = 2; // the pack's frame is dark
export const FORMATS = ['9x16', '1x1', '16x9'];
// The pack's keys of the two steps (its 15 s cycle) and the M10 waypoints made of their turning points: the top step
// slides along X only; the bottom one along X, up 16 px, back — one axis a segment (the pack moved both axes at once
// on its way back and then wiggled 12.7 px, both left out).
const STEP_KEYS = {
  'Rectangle 6': [[-367.869, -713.291], [-534.463, -713.291], [-163.553, -713.291], [-367.869, -713.291], [-671.924, -713.291], [-367.869, -713.291]],
  'Rectangle 4': [[412.564, 717.205], [574.588, 717.205], [574.588, 733.002], [412.564, 717.205], [425.314, 717.205], [412.564, 717.205]],
};
export const WAYPOINTS = {
  'Rectangle 6': [[-367.869, -713.291], [-534.463, -713.291], [-163.553, -713.291], [-671.924, -713.291], [-367.869, -713.291]],
  'Rectangle 4': [[412.564, 717.205], [574.588, 717.205], [574.588, 733.002], [412.564, 733.002], [412.564, 717.205]],
};

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const rgba = (h) => [1, 3, 5].map((i) => r6(parseInt(h.slice(i, i + 2), 16) / 255)).concat(1);
const js = (v) => JSON.stringify(v);
const near = (a, b) => Math.abs(a - b) < 1e-3;

export function loadSources({ dumps = 'C:/CRBK/work/dumps', repo = REPO } = {}) {
  const smm = (f) => readJson(path.join(dumps, 'smm', f + '.json'));
  return {
    tall: smm(PACK.tall.slug),
    square: smm(PACK.square.slug),
    tokens: JSON.parse(readFileSync(path.join(repo, 'brand', 'tokens.json'), 'utf8')),
  };
}

const find = (node, mn) => {
  if (node.matchName === mn) return node;
  for (const c of node.children || []) { const hit = find(c, mn); if (hit) return hit; }
  return null;
};

// One layout of the pack: its shape layer's transform and the rectangles in layer units (size times the group's scale,
// the rest position: the first key), their keys, the fill.
export function frameModel(dump, pack) {
  const c = dump.comp;
  if (c.name !== pack.name || c.width !== pack.w || c.height !== pack.h || dump.layers.length !== 1) throw new Error(`«${c.name}»: not the pack's frame comp ${pack.name}`);
  const L = dump.layers[0];
  const tr = (mn) => layerProp(L, 'ADBE Transform Group', mn);
  for (const mn of ['ADBE Anchor Point', 'ADBE Position', 'ADBE Scale', 'ADBE Rotate Z']) if (tr(mn).keys?.length) throw new Error(`${L.name}: ${mn} moves`);
  if (js(tr('ADBE Anchor Point').value.slice(0, 2)) !== js([0, 0]) || tr('ADBE Rotate Z').value !== 0) throw new Error(`${L.name}: anchored or turned`);
  const fills = new Set();
  const rects = layerProp(L, 'ADBE Root Vectors Group').children.filter((g) => g.matchName === 'ADBE Vector Group').map((g) => {
    const gt = find(g, 'ADBE Vector Transform Group');
    const at = (mn) => gt.children.find((x) => x.matchName === mn);
    if (js(at('ADBE Vector Anchor').value) !== js([0, 0]) || at('ADBE Vector Rotation').value !== 0) throw new Error(`${g.name}: anchored or turned`);
    if (js(find(g, 'ADBE Vector Rect Position').value) !== js([0, 0]) || find(g, 'ADBE Vector Rect Roundness').value !== 0) throw new Error(`${g.name}: not a plain rectangle`);
    const stroke = find(g, 'ADBE Vector Graphic - Stroke');
    if (stroke && stroke.enabled !== false && find(stroke, 'ADBE Vector Stroke Width').value !== 0) throw new Error(`${g.name}: a visible stroke`);
    fills.add(hex(find(g, 'ADBE Vector Fill Color').value));
    const gs = at('ADBE Vector Scale').value;
    const size = find(g, 'ADBE Vector Rect Size').value;
    const pos = at('ADBE Vector Position');
    const keys = pos.keys?.length ? pos.keys.map((k) => ({ t: r6(k.time), v: k.value.map(r6) })) : null;
    return { name: g.name, size: [r6((size[0] * gs[0]) / 100), r6((size[1] * gs[1]) / 100)], rest: keys ? keys[0].v : pos.value.map(r6), keys };
  });
  if (fills.size !== 1) throw new Error(`«${c.name}»: rectangles of colours ${[...fills].join(', ')}`);
  return { pos: tr('ADBE Position').value.slice(0, 2), scale: tr('ADBE Scale').value.slice(0, 2).map((v) => v / 100), fill: [...fills][0], rects };
}

// The rectangles of a layout at rest in its comp's px: { name, l, r, t, b }.
export function restBoxes(m) {
  return m.rects.map((x) => {
    const X = (u) => m.pos[0] + m.scale[0] * u;
    const Y = (u) => m.pos[1] + m.scale[1] * u;
    return { name: x.name, l: r6(X(x.rest[0] - x.size[0] / 2)), r: r6(X(x.rest[0] + x.size[0] / 2)), t: r6(Y(x.rest[1] - x.size[1] / 2)), b: r6(Y(x.rest[1] + x.size[1] / 2)) };
  });
}

// The frame's edges at rest: how far the rectangles reach in from each side of the comp (the window between them).
export function edgesOf(boxes, w, h) {
  const left = Math.max(...boxes.filter((b) => b.l <= 0 && b.t <= h / 2 && b.b >= h / 2).map((b) => b.r));
  const right = w - Math.min(...boxes.filter((b) => b.r >= w && b.t <= h / 2 && b.b >= h / 2).map((b) => b.l));
  const top = Math.max(...boxes.filter((b) => b.t <= 0 && b.l <= w / 2 && b.r >= w / 2).map((b) => b.b));
  const bottom = h - Math.min(...boxes.filter((b) => b.b >= h && b.l <= w / 2 && b.r >= w / 2).map((b) => b.t));
  return { left: r6(left), right: r6(right), top: r6(top), bottom: r6(bottom) };
}

// The M10 progress of a segment (zero-speed cubic bezier), as AE eases it: x(s) = u, then y(s).
export const M10_JS = 'function m10(u) { var lo = 0, hi = 1, s = 0; for (var i = 0; i < 40; i++) { s = (lo + hi) / 2; var x = 3 * (1 - s) * (1 - s) * s * X1 + 3 * (1 - s) * s * s * X2 + s * s * s; if (x < u) { lo = s; } else { hi = s; } } s = (lo + hi) / 2; return 3 * (1 - s) * s * s + s * s * s; }';

// The drift of a step: its waypoints a 15 s segment each (tokens motion.M10.segment), eased by M10, looping every 60 s.
export function driftJs(points, { frames, bezier }) {
  const T = r6(frames / FPS);
  if (!(T > 0)) throw new Error('M10: no segment length');
  return [
    `var X1 = ${bezier[0]}, X2 = ${bezier[2]}, T = ${T}, W = ${js(points)};`,
    M10_JS,
    `var t = time % (${points.length - 1} * T), i = Math.min(${points.length - 2}, Math.floor(t / T)), e = m10((t - i * T) / T);`,
    '[W[i][0] + (W[i + 1][0] - W[i][0]) * e, W[i][1] + (W[i + 1][1] - W[i][1]) * e]',
  ].join('\n');
}

export function resolveFrame(sources = loadSources()) {
  const { tokens } = sources;
  const base = tokens.color.base;
  const m10 = tokens.motion.M10;
  if (m10.segment.frames * m10.loop.segments / FPS !== PERIOD || !m10.segment.oneAxis) throw new Error('M10 is not four one-axis 15 s segments any more');
  const tall = frameModel(sources.tall, PACK.tall);
  const square = frameModel(sources.square, PACK.square);
  // the two layouts are one design: the same rectangles, rest positions and step keys (the square's slower)
  const design = (m) => js(m.rects.map((x) => [x.name, x.size, x.rest, x.keys && x.keys.map((k) => k.v)]));
  if (design(tall) !== design(square)) throw new Error('«Оверлей_9x16» and «Оверлей_1x1» draw different frames');
  if (tall.fill !== base.black.hex) throw new Error(`the frame is ${tall.fill}, not the brand black`);
  for (const [name, keys] of Object.entries(STEP_KEYS)) {
    const got = tall.rects.find((x) => x.name === name).keys.map((k) => k.v);
    if (got.length !== keys.length || got.some((v, i) => !near(v[0], keys[i][0]) || !near(v[1], keys[i][1]))) throw new Error(`${name}: the pack's keys changed`);
  }
  const moving = tall.rects.filter((x) => x.keys && x.keys.some((k) => js(k.v) !== js(x.keys[0].v))).map((x) => x.name).sort();
  if (js(moving) !== js(Object.keys(WAYPOINTS).sort())) throw new Error(`the moving rectangles are ${moving.join(', ')}`);
  for (const pts of Object.values(WAYPOINTS)) {
    if (pts.length !== m10.loop.segments + 1 || js(pts[0]) !== js(pts[pts.length - 1])) throw new Error('a drift is four segments that close');
    for (let i = 1; i < pts.length; i += 1) if ([0, 1].filter((a) => pts[i][a] !== pts[i - 1][a]).length > 1) throw new Error('a drift segment moves two axes');
  }

  // the master: the tall layout in 9:16 and turned in 16:9, the square one in 1:1; the layer's anchor puts the tall
  // frame's middle on the comp's
  const A = [r6((tall.pos[0] - PACK.tall.w / 2) / -tall.scale[0]), r6((tall.pos[1] - PACK.tall.h / 2) / -tall.scale[1])];
  const k1 = 1080 / PACK.square.w;
  const squareAt = [r6(k1 * (square.pos[0] + square.scale[0] * A[0])), r6(k1 * (square.pos[1] + square.scale[1] * A[1]))];
  const colours = COLOURS.map((c) => ({ ...c, hex: base[c.token].hex }));
  const ctrl = { Colour: { label: 'Цвет', items: colours.map((c) => c.label), value: DEFAULT_COLOUR } };
  const spec = new Spec({ name: COMP, w: PACK.tall.w, h: PACK.tall.h, fps: FPS, duration: PERIOD });
  spec.add(shape('FRAME', tall.rects.map((x) => rectGroup(x.name, tall.fill)), { anchor: A, effects: [{ matchName: 'ADBE Fill', name: 'Fill' }] }));
  const pre = 'var w = thisComp.width, h = thisComp.height, k = Math.min(w, h) / 1080;\n';
  spec.expr('FRAME', P.pos, pre + `w == h ? [${squareAt[0]} * k, ${squareAt[1]} * k] : [w / 2, h / 2]`);
  spec.expr('FRAME', P.scale, pre + `w == h ? [${r6(100 * square.scale[0] * k1)} * k, ${r6(100 * square.scale[1] * k1)} * k] : [${r6(100 * tall.scale[0])} * k, ${r6(100 * tall.scale[1])} * k]`);
  // a landscape frame: the tall one turned a quarter
  spec.expr('FRAME', ['transform', 'ADBE Rotate Z'], 'thisComp.width > thisComp.height ? 90 : 0');
  for (const x of tall.rects) {
    spec.expr('FRAME', P.rectSize(x.name), js(x.size));
    spec.expr('FRAME', P.rectPos(x.name), WAYPOINTS[x.name] ? driftJs(WAYPOINTS[x.name], m10.segment) : js(x.rest));
  }
  spec.expr('FRAME', ['effect', 'Fill', 'ADBE Fill', 'ADBE Fill-0002'], `var c = thisComp.layer("CTRL").effect("Colour")(1).value;\n${js(colours.map((c) => rgba(c.hex)))}[c - 1]`);
  addQaPatch(spec, base.green.hex);
  spec.add(nul('CTRL', [
    { kind: 'dropdown', name: 'Colour', items: ctrl.Colour.items, value: ctrl.Colour.value },
    { kind: 'checkbox', name: 'QA', value: false },
  ]));

  const built = spec.toJSON();
  // the files: per format and colour the frame at rest and the drift's 60 s loop
  const files = FORMATS.flatMap((fmt) => colours.flatMap((c, i) => [
    { key: `${fmt}_${c.key}`, variant: fmt, ctrl: { Colour: i + 1 }, kind: 'still', t: 0, options: { colour: i + 1, drift: false } },
    { key: `${fmt}_${c.key}_drift`, variant: fmt, ctrl: { Colour: i + 1 }, kind: 'loop', seconds: PERIOD, options: { colour: i + 1, drift: true } },
  ]));
  return {
    id: ID,
    workDir: workDir(),
    out: { dir: workPath('build', ID), aep: workPath('build', ID, ID + '_work.aep') },
    comp: spec.comp,
    colours,
    layouts: { tall, square, anchor: A, squareAt },
    edges: {
      '9x16': edgesOf(restBoxes(tall), PACK.tall.w, PACK.tall.h),
      '1x1': Object.fromEntries(Object.entries(edgesOf(restBoxes(square), PACK.square.w, PACK.square.h)).map(([s, v]) => [s, r6(v * k1)])),
    },
    ctrl,
    text: {},
    egp: [],
    rig: {},
    markers: [],
    duration: { introSec: 0, holdSec: PERIOD, outroSec: 0 },
    files,
    spec: {
      ...built,
      fonts: [],
      markers: [],
      egp: [],
      egpNames: [],
      measure: [],
      defaults: { text: {}, ctrl: { Colour: DEFAULT_COLOUR } },
    },
    check: {},
    version: 1,
    variants: FORMATS.map((key) => ({ key, ...tokens.video.formats[key] })),
    sweepTimes: [0, 7.5, 15, 30, 45, 59.96],
    rest: 0,
  };
}

export const resolve = resolveFrame;

// The library entry (library.src.json) the files make: tier T2, «Цвет» and «Дрейф» pick the file (variant options),
// the frame size the format.
export function libraryEntry(p = resolveFrame()) {
  return {
    id: ID,
    title_ru: 'Рамка с вырезами',
    category: 'smm',
    tier: 'T2',
    hosts: ['ae', 'pr'],
    version: p.version,
    alpha: true,
    loop: { periodFrames: PERIOD * FPS },
    duration: p.duration,
    fields: [
      { key: 'colour', label_ru: 'Цвет', type: 'dropdown', default: DEFAULT_COLOUR, options: COLOURS.map((c, i) => ({ index: i + 1, label_ru: c.label })) },
      { key: 'drift', label_ru: 'Дрейф', type: 'checkbox', default: false },
    ],
    variants: p.files.map((f) => {
      const v = p.variants.find((x) => x.key === f.variant);
      return { key: f.key, aspect: f.variant, w: v.w, h: v.h, fps: FPS, options: f.options, minHostVersion: { ae: '26.0', pr: '26.0' } };
    }),
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = resolveFrame();
  console.log(JSON.stringify({ layers: r.spec.order, layouts: { anchor: r.layouts.anchor, squareAt: r.layouts.squareAt, tall: { pos: r.layouts.tall.pos, scale: r.layouts.tall.scale }, square: { pos: r.layouts.square.pos, scale: r.layouts.square.scale } },
    edges: r.edges, rects: r.layouts.tall.rects.map((x) => [x.name, x.size, x.rest]), files: r.files.map((f) => f.key) }, null, 1));
}
