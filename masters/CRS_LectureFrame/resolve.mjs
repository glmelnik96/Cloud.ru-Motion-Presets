// CRS_LectureFrame «Рамка лекции» (D9): the frame of the courses pack's lecture overlays («Оверлей 16 на 9»,
// «3 на 2», «со спикером», 1920x1080, an hour each) as files, not a template: a still per layout and an optional
// 60 s loop of the frame's drift, with transparent windows the recording shows through, and the windows' rects for
// «Вписать в окно». This master is only their source: tools/masters/render-files.mjs renders them.
// - The ground #222222 and, for the speaker layouts, the pack's pattern with the windows cut out.
// - The drifting green bars: the pack's six layers moved over (spec.transplant), the same in all three overlays
//   (keys 0–15–30–45–60 s, loopOut: a 60 s cycle). Over the recording in the screen layouts, under it with the
//   speaker (cut by the windows), as the pack's layer order has them.
// - The master logo (D18) where the pack has its own, on the pack's dark plate in the speaker layouts.
// - Windows in the proportion of the recording (D9): 16:9, 3:2, and the screen beside a portrait speaker window;
//   «Спикер справа» mirrors «Спикер слева».
// Choices: masters/CRS_LectureFrame/README.md.
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
import { addQaPatch } from '../../tools/masters/rig-plate.mjs';
import { aspectOf, packOf, with4k } from '../../tools/masters/pack4k.mjs';
import { nul, P, pathGroup, precomp, rectGroup, shape, Spec } from '../../tools/masters/spec.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');

export const ID = 'CRS_LectureFrame';
export const COMP = 'CR_CRS_LectureFrame';
const FPS = 25;
const PERIOD = 60;             // the drift's cycle: the comp is one loop
const OVERLAYS = {
  screen169: { slug: 'overley_16_na_9', name: 'Оверлей 16 на 9', layers: 24 },
  screen32: { slug: 'overley_3_na_2', name: 'Оверлей 3 на 2', layers: 24 },
  speaker: { slug: 'overley_so_spikerom', name: 'Оверлей со спикером', layers: 14 },
};
export const BARS = ['Shape Layer 17', 'Shape Layer 18', 'Shape Layer 19', 'Shape Layer 20', 'Shape Layer 21', 'Shape Layer 22'];
// the layouts of «Раскладка», in its order: the file key, the label, whether a speaker window is there and where
export const LAYOUTS = [
  { key: 's169', label: 'Экран 16:9', speaker: null },
  { key: 's32', label: 'Экран 3:2', speaker: null },
  { key: 'spkL', label: 'Спикер слева', speaker: 'left' },
  { key: 'spkR', label: 'Спикер справа', speaker: 'right' },
];

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const js = (v) => JSON.stringify(v);

export function loadSources({ dumps = 'C:/CRBK/work/dumps', repo = REPO } = {}) {
  const ov = Object.fromEntries(Object.entries(OVERLAYS).map(([k, o]) => [k, readJson(path.join(dumps, 'courses', o.slug + '.json'))]));
  return {
    ...ov,
    logo: readJson(path.join(dumps, 'courses', 'logo.json')),
    svg: readFileSync(path.join(repo, 'brand', 'logo', 'master-ae-motion-live.svg'), 'utf8'),
    tokens: JSON.parse(readFileSync(path.join(repo, 'brand', 'tokens.json'), 'utf8')),
  };
}

const find = (node, mn) => {
  if (node.matchName === mn) return node;
  for (const c of node.children || []) { const hit = find(c, mn); if (hit) return hit; }
  return null;
};
const box = (dump, name) => {
  const b = shapeBoxAt(dump, dumpLayer(dump, name), 10);
  return { x: r6(b.x0), y: r6(b.y0), w: r6(b.x1 - b.x0), h: r6(b.y1 - b.y0) };
};

// A window of the pack made the proportion ratio about its own centre, keeping its height (or its width when
// asked), on whole pixels (D9: a recording of that proportion fits without a cut).
export function windowOf(b, ratio, { keep = 'h' } = {}) {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  let w;
  let h;
  if (keep === 'h') {
    h = Math.round(b.h);
    w = Math.round(h * ratio);
  } else {
    // a width on the grid of the ratio: 16:9 needs a multiple of 16
    const q = Math.round(b.w / 16) * 16;
    w = q;
    h = Math.round(q / ratio);
  }
  return { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h };
}

// The windows of each layout in FHD px, the pack's ones they come from, the logo and its plate.
export function frameLayout({ screen169, screen32, speaker, logo }) {
  const m169 = box(screen169, 'Маска 3 на 3');
  const m32 = box(screen32, 'Маска 3 на 2');
  const mScreen = box(speaker, 'Маска скринкаст');
  const mSpeaker = box(speaker, 'Маска спикер');
  const W = screen169.comp.width;
  const s169 = windowOf(m169, 16 / 9);
  const s32 = windowOf(m32, 3 / 2);
  // beside the speaker the screen keeps the pack's width (1248, a multiple of 16) and stands on the speaker's middle
  const spk = { x: Math.round(mSpeaker.x), y: Math.round(mSpeaker.y), w: Math.round(mSpeaker.w), h: Math.round(mSpeaker.h) };
  const scr = windowOf({ ...mScreen, y: spk.y + spk.h / 2 - mScreen.h / 2 }, 16 / 9, { keep: 'w' });
  const mirror = (r) => ({ x: W - r.x - r.w, y: r.y, w: r.w, h: r.h });
  // the cube of the pack's logo in the frame: the master logo's cube goes there (D18); the same in all three
  const LL = dumpLayer(screen169, 'Logo');
  const lm = layerToCompAt(screen169, LL, 30);
  const cubeLayer = logo.layers.find((l) => hex(find(layerProp(l, 'ADBE Root Vectors Group'), 'ADBE Vector Fill Color').value) === '#26D07C');
  const cb = shapeBoxAt(logo, cubeLayer, 1);
  const ca = applyPoint(lm, [cb.x0, cb.y0]);
  const cz = applyPoint(lm, [cb.x1, cb.y1]);
  return {
    W, H: screen169.comp.height,
    ground: hex(dumpLayer(screen169, 'BG').source.color),
    pack: { m169, m32, mScreen, mSpeaker },
    windows: {
      s169: { screen: s169 },
      s32: { screen: s32 },
      spkL: { screen: scr, speaker: spk },
      spkR: { screen: mirror(scr), speaker: mirror(spk) },
    },
    plate: { ...box(speaker, 'Shape Layer 31'), fill: hex(find(layerProp(dumpLayer(speaker, 'Shape Layer 31'), 'ADBE Root Vectors Group'), 'ADBE Vector Fill Color').value) },
    logo: { cube: { x0: r6(ca[0]), y0: r6(ca[1]), w: r6(cz[0] - ca[0]) } },
  };
}

// The bars' keys: the same in the three overlays, a 60 s cycle (first and last key equal, loopOut).
export function driftOf(dump) {
  const out = {};
  for (const name of BARS) {
    const L = dumpLayer(dump, name);
    const pos = layerProp(L, 'ADBE Transform Group', 'ADBE Position');
    const t = pos.keys.map((k) => r6(k.time));
    if (t[0] !== 0 || t[t.length - 1] !== PERIOD) throw new Error(`${name}: keys ${t.join(', ')}, not 0..${PERIOD}`);
    if (js(pos.keys[0].value) !== js(pos.keys[pos.keys.length - 1].value)) throw new Error(`${name}: the cycle does not close`);
    out[name] = t;
  }
  return out;
}

export function resolveFrame(sources = loadSources()) {
  const { svg, tokens } = sources;
  const base = tokens.color.base;
  const L = frameLayout(sources);
  const drift = driftOf(sources.screen169);
  for (const k of ['screen32', 'speaker']) {
    const other = driftOf(sources[k]);
    if (js(other) !== js(drift)) throw new Error(`${OVERLAYS[k].name}: the bars move otherwise than in «Оверлей 16 на 9»`);
  }
  const colors = { ground: base.black.hex, green: base.green.hex, white: base.white.hex, plate: L.plate.fill };
  for (const [got, want, what] of [[L.ground, colors.ground, 'ground'], [L.plate.fill, colors.ground, 'logo plate']]) {
    if (got !== want) throw new Error(`overlays: ${what} ${got}, expected ${want}`);
  }
  const ctrl = { Layout: { label: 'Раскладка', items: LAYOUTS.map((l) => l.label), value: 1 } };
  const rects = LAYOUTS.map((l) => [L.windows[l.key].screen, L.windows[l.key].speaker || null]);

  const pre = [
    'var k = Math.min(thisComp.width, thisComp.height) / 1080;',
    'var lay = thisComp.layer("CTRL").effect("Layout")(1).value;',
  ].join('\n') + '\n';
  const only = (ls) => pre + `${js(ls)}.indexOf(lay) >= 0 ? 100 : 0`;
  const spec = new Spec({ name: COMP, w: L.W, h: L.H, fps: FPS, duration: PERIOD });
  // bottom first: the ground, the pattern, the bars under the recording, the bars over it, the plate, the logo,
  // the windows (the matte of the ground, the pattern and the bars under the recording)
  spec.add(shape('GROUND', [rectGroup('Ground', colors.ground)]));
  spec.expr('GROUND', P.rectSize('Ground'), '[thisComp.width, thisComp.height]');
  spec.expr('GROUND', P.rectPos('Ground'), '[thisComp.width / 2, thisComp.height / 2]');
  const decor = (name, source) => {
    spec.add(precomp(name, source, { collapse: true }));
    spec.expr(name, P.pos, '[thisComp.width / 2, thisComp.height / 2]');
    spec.expr(name, P.scale, `var s = 100 * Math.min(thisComp.width, thisComp.height) / ${L.H};\n[s, s]`);
  };
  decor('PATTERN', 'DECOR_PATTERN');
  spec.expr('PATTERN', P.opacity, only([3, 4]));
  decor('BARS_UNDER', 'DECOR_BARS');
  spec.expr('BARS_UNDER', P.opacity, only([3, 4]));
  decor('BARS', 'DECOR_BARS');
  spec.expr('BARS', P.opacity, only([1, 2]));
  spec.add(shape('PLATE', [rectGroup('Plate', colors.plate)]));
  spec.expr('PLATE', P.rectSize('Plate'), pre + `[${L.plate.w} * k, ${L.plate.h} * k]`);
  spec.expr('PLATE', P.rectPos('Plate'), pre + `[${r6(L.plate.x + L.plate.w / 2)} * k, ${r6(L.plate.y + L.plate.h / 2)} * k]`);
  spec.expr('PLATE', P.opacity, only([3, 4]));
  const fit = fitCube(svg, L.logo.cube);
  const lockup = masterLockup(svg, fit);
  spec.add(shape('LOGO', [pathGroup('Wordmark', colors.white, lockup.wordmark), pathGroup('Cube', colors.green, lockup.cube)]));
  spec.expr('LOGO', P.scale, 'var k = Math.min(thisComp.width, thisComp.height) / 1080;\n[100 * k, 100 * k]');
  spec.add(shape('WINDOWS', [rectGroup('Screen', colors.white), rectGroup('Speaker', colors.white)]));
  for (const [g, i] of [['Screen', 0], ['Speaker', 1]]) {
    const R = js(rects.map((r) => r[i]));
    spec.expr('WINDOWS', P.rectSize(g), pre + `var r = ${R}[lay - 1];\nr ? [r.w * k, r.h * k] : [0, 0]`);
    spec.expr('WINDOWS', P.rectPos(g), pre + `var r = ${R}[lay - 1];\nr ? [(r.x + r.w / 2) * k, (r.y + r.h / 2) * k] : [0, 0]`);
  }
  for (const l of ['GROUND', 'PATTERN', 'BARS_UNDER']) spec.matte(l, 'WINDOWS', 'ALPHA_INVERTED', { keepVisible: false });
  addQaPatch(spec, colors.green);
  spec.add(nul('CTRL', [
    { kind: 'dropdown', name: 'Layout', items: ctrl.Layout.items, value: ctrl.Layout.value },
    { kind: 'checkbox', name: 'QA', value: false },
  ]));

  const built = spec.toJSON();
  const keep = (slug, names) => {
    const d = sources[slug];
    return names.map((name) => {
      const hit = d.layers.filter((l) => l.name === name);
      if (hit.length !== 1) throw new Error(`${OVERLAYS[slug].name}: ${hit.length} layers named ${name}`);
      return { index: hit[0].index, name };
    });
  };
  const src = (slug) => ({ name: OVERLAYS[slug].name, w: 1920, h: 1080, layers: OVERLAYS[slug].layers });
  // the files: per layout a still at FHD and 4K (the first frame of the cycle) and the 60 s drift loop at FHD
  const files = with4k(LAYOUTS.flatMap((l, i) => [
    { key: `16x9_${l.key}`, variant: '16x9', ctrl: { Layout: i + 1 }, kind: 'still', t: 0, options: { layout: i + 1, drift: false } },
    { key: `16x9_4K_${l.key}`, variant: '16x9_4K', ctrl: { Layout: i + 1 }, kind: 'still', t: 0, options: { layout: i + 1, drift: false } },
    { key: `16x9_${l.key}_drift`, variant: '16x9', ctrl: { Layout: i + 1 }, kind: 'loop', seconds: PERIOD, options: { layout: i + 1, drift: true } },
  ]));
  return {
    id: ID,
    workDir: workDir(),
    out: { dir: workPath('build', ID), aep: workPath('build', ID, ID + '_work.aep') },
    comp: spec.comp,
    colors,
    layout: L,
    drift,
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
      transplant: {
        aep: packProject('courses'),
        folder: 'BK_DECOR',
        source: src('screen169'),
        comps: [
          { name: 'DECOR_BARS', keep: keep('screen169', [...BARS].reverse()) },
          { name: 'DECOR_PATTERN', source: src('speaker'), keep: keep('speaker', ['Pattern Arrow.png']) },
        ],
      },
      egp: [],
      egpNames: [],
      measure: [],
      defaults: { text: {}, ctrl: { Layout: 1 } },
    },
    check: {},
    version: 1,
    variants: ['16x9', '16x9_4K'].map((key) => ({ key, ...tokens.video.formats[key] })),
    sweepTimes: [0, 7.5, 15, 30, 45, 59.96],
    rest: 0,
  };
}

export const resolve = resolveFrame;

// The library entry (library.src.json) the files and the windows make: tier T2, «Раскладка» and «Дрейф» pick the
// file (variant options), the windows per file for «Вписать в окно».
export function libraryEntry(p = resolveFrame()) {
  const variants = p.files.map((f) => {
    const v = p.variants.find((x) => x.key === f.variant);
    return { key: f.key, aspect: aspectOf(f.variant), w: v.w, h: v.h, fps: FPS, options: f.options, ...packOf(f), minHostVersion: { ae: '26.0', pr: '26.0' } };
  });
  const scale = (r, s) => ({ x: r.x * s, y: r.y * s, w: r.w * s, h: r.h * s });
  const windows = [['screen', 'Экран'], ['speaker', 'Спикер']].map(([key, label]) => ({
    key, label_ru: label,
    rects: p.files.flatMap((f) => {
      const l = LAYOUTS[f.options.layout - 1];
      const r = p.layout.windows[l.key][key];
      return r ? [{ variant: f.key, ...scale(r, p.variants.find((x) => x.key === f.variant).w / 1920) }] : [];
    }),
  }));
  return {
    id: ID,
    title_ru: 'Рамка лекции',
    category: 'courses',
    tier: 'T2',
    hosts: ['ae', 'pr'],
    version: p.version,
    loop: { periodFrames: PERIOD * FPS },
    duration: p.duration,
    windows,
    fields: [
      { key: 'layout', label_ru: 'Раскладка', type: 'dropdown', default: 1, options: LAYOUTS.map((l, i) => ({ index: i + 1, label_ru: l.label })) },
      { key: 'drift', label_ru: 'Дрейф', type: 'checkbox', default: false },
    ],
    variants,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = resolveFrame();
  console.log(JSON.stringify({ layers: r.spec.order, expressions: r.spec.expressions.length, mattes: r.spec.mattes.length,
    layout: r.layout, drift: r.drift, files: r.files.map((f) => f.key), transplant: r.spec.transplant.comps.map((c) => [c.name, c.keep.map((x) => x.name)]) }, null, 1));
}
