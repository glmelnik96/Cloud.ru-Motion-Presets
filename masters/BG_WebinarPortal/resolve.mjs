// BG_WebinarPortal «Фон экрана вебинара»: the background of the webinars pack's four screens («Заставка/Таймер с
// вижуалом/со спикером»: the dark ground, the mint «portal» of two cards whose left card's right edge moves, the arrow
// rack on the cards — a still strip with the visual, the flickering rack with the speaker — and, on the speaker's
// screen saver, two dot patterns) as a T2 loop, opaque (spec 5: the companion of «Экран вебинара»). This master is only
// its source: tools/masters/render-files.mjs renders it.
// - Each screen's background layers moved over as they are (spec.transplant), one comp per screen; what the screen
//   puts on top (titles, the logo block, the slots, the QR, the timer, the speaker's plates) is the template's.
// - The portal's edge on the canon M10 (D19, signed: «портал вебинаров — на общую кривую»): the pack's four turning
//   points (118 → 417.41 → 229.21 → 402.44 px), 15 s a segment on 0.775,0,0.667,1 — a 60 s loop, by an expression on
//   the mask's path instead of the pack's keys.
// - The speaker's rack noise cycles so it meets the 60 s loop: 7 revolutions, 42° a second (M9's 40 would end the loop
//   two thirds into a revolution).
// - «Раскладка» and «С таймером» pick the file; the speaker's screen is the same with and without the timer but for
//   the dots.
// Choices: masters/BG_WebinarPortal/README.md.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { layerProp, readJson } from '../../tools/dump/model.mjs';
import { packProject } from '../../tools/dump/dump.mjs';
import { workDir, workPath } from '../../tools/lib/work.mjs';
import { addQaPatch } from '../../tools/masters/rig-plate.mjs';
import { M10_JS } from '../SMM_FrameNotched/resolve.mjs';
import { nul, P, precomp, Spec } from '../../tools/masters/spec.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');

export const ID = 'BG_WebinarPortal';
export const COMP = 'CR_BG_WebinarPortal';
const FPS = 25;
export const PERIOD = 60;        // M10: four 15 s segments
const FN = (n) => `ADBE Fractal Noise-${String(n).padStart(4, '0')}`;
const RACK = 'PATTERN RACK_Animation';
// The four screens: the decor comp, the pack comp it comes from, the background layers kept, the form's values.
export const SCREENS = [
  { key: 'visual', decor: 'DECOR_VISUAL', slug: 'zastavka_s_vizhualom', name: 'Заставка с вижуалом', keep: ['Pattern2', 'PORTAL', 'Dark Gray Solid 1'], layout: 1, timer: false },
  { key: 'visual_timer', decor: 'DECOR_VISUAL_TIMER', slug: 'taymer_s_vizhualom', name: 'Таймер с вижуалом', keep: ['Pattern0', 'PORTAL', 'Dark Gray Solid 1'], layout: 1, timer: true },
  { key: 'speaker', decor: 'DECOR_SPEAKER', slug: 'zastavka_so_spikerom', name: 'Заставка со спикером', keep: ['Group 2131327780.png', RACK, 'PORTAL', 'Dark Gray Solid 1'], layout: 2, timer: false },
  { key: 'speaker_timer', decor: 'DECOR_SPEAKER_TIMER', slug: 'taymer_so_spikerom', name: 'Таймер со спикером', keep: [RACK, 'PORTAL', 'Dark Gray Solid 1'], layout: 2, timer: true },
];
export const LAYOUTS = ['С визуалом', 'Со спикером'];

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const js = (v) => JSON.stringify(v);

export function loadSources({ dumps = 'C:/CRBK/work/dumps', repo = REPO } = {}) {
  const web = (f) => readJson(path.join(dumps, 'webinars', f + '.json'));
  return {
    screens: Object.fromEntries(SCREENS.map((s) => [s.key, web(s.slug)])),
    rack: web('pattern_rack_animation'),
    tokens: JSON.parse(readFileSync(path.join(repo, 'brand', 'tokens.json'), 'utf8')),
  };
}

const find = (node, mn) => {
  if (node.matchName === mn) return node;
  for (const c of node.children || []) { const hit = find(c, mn); if (hit) return hit; }
  return null;
};

// One screen's portal: its fill, the moving mask (the left card) and its turning points, the still masks.
export function portalModel(dump) {
  const L = dump.layers.find((l) => l.name === 'PORTAL');
  const fill = hex(find(layerProp(L, 'ADBE Root Vectors Group'), 'ADBE Vector Fill Color').value);
  const moving = L.masks.find((m) => m.path.keys && m.path.keys.length);
  const v0 = moving.path.keys[0].value.vertices;
  // the moving edge: the x of vertices 0 and 3; the other two still, the edge's ends within half a pixel of rest (the
  // pack's hand keys wobble them by up to 0.24 px; the master keeps them at rest)
  for (const k of moving.path.keys) {
    const v = k.value.vertices;
    const still = js([v[1], v[2]]) === js([v0[1], v0[2]]);
    const ends = Math.abs(v[0][1] - v0[0][1]) < 0.5 && Math.abs(v[3][1] - v0[3][1]) < 0.5;
    if (v[0][0] !== v[3][0] || !still || !ends) throw new Error(`${dump.comp.name}: the portal's mask moves more than its right edge`);
  }
  const xs = moving.path.keys.map((k) => r6(k.value.vertices[0][0]));
  return { fill, mask: moving.name, vertices: v0.map((p) => p.map(r6)), xs, keys: moving.path.keys.map((k) => r6(k.time)) };
}

// The turning points of the edge in one cycle of the pack (the timer screens run it whole: 118 → 417.41 → 229.21 →
// 402.44 → 118), closing on the first.
export function turningPoints(xs) {
  const cycle = [xs[0]];
  for (let i = 1; i < xs.length && !(i > 1 && xs[i] === xs[0]); i += 1) cycle.push(xs[i]);
  return [...cycle, xs[0]];
}

// The mask's path at time t: the pack's rectangle with its right edge (vertices 0 and 3) on M10 through the points.
export function edgeJs(points, vertices, { frames, bezier }) {
  const T = r6(frames / FPS);
  const V = vertices.map((p, i) => (i === 0 || i === 3 ? null : p));
  return [
    `var X1 = ${bezier[0]}, X2 = ${bezier[2]}, T = ${T}, W = ${js(points)};`,
    M10_JS,
    `var t = time % (${points.length - 1} * T), i = Math.min(${points.length - 2}, Math.floor(t / T)), e = W[i] + (W[i + 1] - W[i]) * m10((t - i * T) / T);`,
    `createPath([[e, ${vertices[0][1]}], ${js(V[1])}, ${js(V[2])}, [e, ${vertices[3][1]}]], [], [], true)`,
  ].join('\n');
}

export function resolvePortal(sources = loadSources()) {
  const { tokens } = sources;
  const m10 = tokens.motion.M10;
  const m9 = tokens.motion.M9;
  const portals = Object.fromEntries(SCREENS.map((s) => [s.key, portalModel(sources.screens[s.key])]));
  const timer = portals.visual_timer;
  const points = turningPoints(timer.xs);
  if (points.length !== m10.loop.segments + 1) throw new Error(`the portal turns at ${points.join(', ')}: not four segments`);
  for (const [k, p] of Object.entries(portals)) {
    if (p.fill !== timer.fill || js(p.vertices) !== js(timer.vertices) || p.mask !== timer.mask) throw new Error(`${k}: its portal differs from the timer's`);
    if (!p.xs.every((x) => points.includes(x))) throw new Error(`${k}: its portal turns elsewhere`);
  }
  // the rack's noise: whole revolutions in the loop, the nearest to M9's speed
  const revs = Math.round((m9.evolutionDegPerSec * PERIOD) / 360);
  const speed = r6((revs * 360) / PERIOD);
  const rackNoise = sources.rack.layers.find((l) => l.name === 'Fractal Noice');
  if (!rackNoise) throw new Error(`${RACK}: no noise layer`);
  // the decor of each screen: the kept layers by index (names repeat: the two dot pictures)
  const keepOf = (s) => sources.screens[s.key].layers.filter((l) => s.keep.includes(l.name)).map((l) => ({ index: l.index, name: l.name }));
  const edge = edgeJs(points, timer.vertices, m10.segment);
  const ctrl = { Layout: { label: 'Раскладка', items: LAYOUTS, value: 1 }, Timer: { label: 'С таймером', value: false } };
  const spec = new Spec({ name: COMP, w: 1920, h: 1080, fps: FPS, duration: PERIOD });
  const pre = 'var L = thisComp.layer("CTRL").effect("Layout")(1).value, M = thisComp.layer("CTRL").effect("Timer")(1).value;\n';
  for (const s of SCREENS) {
    spec.add(precomp(s.key.toUpperCase(), s.decor));
    spec.expr(s.key.toUpperCase(), P.opacity, pre + `L == ${s.layout} && M == ${s.timer ? 1 : 0} ? 100 : 0`);
  }
  addQaPatch(spec, tokens.color.base.green.hex);
  spec.add(nul('CTRL', [
    { kind: 'dropdown', name: 'Layout', items: LAYOUTS, value: 1 },
    { kind: 'checkbox', name: 'Timer', value: false },
    { kind: 'checkbox', name: 'QA', value: false },
  ]));

  const built = spec.toJSON();
  const files = SCREENS.map((s) => ({
    key: `16x9_${s.key}`, variant: '16x9', ctrl: { Layout: s.layout, Timer: s.timer ? 1 : 0 }, kind: 'loop', seconds: PERIOD,
    options: { layout: s.layout, timer: s.timer },
  }));
  return {
    id: ID,
    workDir: workDir(),
    out: { dir: workPath('build', ID), aep: workPath('build', ID, ID + '_work.aep') },
    comp: spec.comp,
    portal: { fill: timer.fill, vertices: timer.vertices, points },
    rack: { revs, speed },
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
        aep: packProject('webinars'),
        folder: 'BK_DECOR',
        source: { name: SCREENS[0].name, w: 1920, h: 1080, layers: sources.screens.visual.layers.length },
        comps: SCREENS.map((s) => ({
          name: s.decor,
          source: { name: s.name, w: 1920, h: 1080, layers: sources.screens[s.key].layers.length },
          keep: keepOf(s),
          duration: PERIOD,
          extendLayers: true,
          set: [
            { layer: 'PORTAL', path: ['mask', portals[s.key].mask, 'ADBE Mask Shape'], expr: edge },
            ...(s.keep.includes(RACK) ? [
              { comp: RACK, layer: 'Fractal Noice', path: ['effect', 'Fractal Noise', 'ADBE Fractal Noise', FN(23)], expr: `time * ${speed}` },
              { comp: RACK, layer: 'Fractal Noice', path: ['effect', 'Fractal Noise', 'ADBE Fractal Noise', FN(25)], value: 1 },
              { comp: RACK, layer: 'Fractal Noice', path: ['effect', 'Fractal Noise', 'ADBE Fractal Noise', FN(26)], value: revs },
            ] : []),
          ],
        })),
      },
      egp: [],
      egpNames: [],
      measure: [],
      defaults: { text: {}, ctrl: { Layout: 1, Timer: 0 } },
    },
    check: {},
    version: 1,
    variants: [{ key: '16x9', ...tokens.video.formats['16x9'] }],
    sweepTimes: [0, 7.5, 15, 30, 45, 59.96],
    rest: 0,
  };
}

export const resolve = resolvePortal;

// The library entry (library.src.json): a T2 loop, opaque; «Раскладка» and «С таймером» pick the file.
export function libraryEntry(p = resolvePortal()) {
  return {
    id: ID,
    title_ru: 'Фон экрана вебинара',
    category: 'webinars',
    tier: 'T2',
    hosts: ['ae', 'pr'],
    version: p.version,
    loop: { periodFrames: PERIOD * FPS },
    duration: p.duration,
    fields: [
      { key: 'layout', label_ru: 'Раскладка', type: 'dropdown', default: 1, options: LAYOUTS.map((label, i) => ({ index: i + 1, label_ru: label })) },
      { key: 'timer', label_ru: 'С таймером', type: 'checkbox', default: false },
    ],
    variants: p.files.map((f) => ({ key: f.key, aspect: '16x9', w: 1920, h: 1080, fps: FPS, options: f.options, minHostVersion: { ae: '26.0', pr: '26.0' } })),
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = resolvePortal();
  console.log(JSON.stringify({ layers: r.spec.order, portal: r.portal, rack: r.rack, keep: r.spec.transplant.comps.map((c) => [c.name, c.keep.map((k) => k.index + ':' + k.name).join(', ')]), files: r.files.map((f) => [f.key, js(f.options)]) }, null, 1));
  console.log(r.spec.transplant.comps[0].set[0].expr);
}
