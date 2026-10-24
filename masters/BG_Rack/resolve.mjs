// BG_Rack «Фон: стеллаж»: the webinars pack's «PATTERN RACK_Animation» (4K: a grid of arrows 150 px apart, dark #222222
// lines, shown in blocks by a block Fractal Noise whose evolution runs — the canon M9 «мерцающая сетка») as a T2 loop
// on alpha (spec 5: the panel puts #222222 under it). This master is only its source: render-files.mjs renders it.
// - The pack's comp moved over as it is (spec.transplant): the noise and the grid it mattes, made flat (their 3D is
//   planar); the noise cycles its evolution (one revolution at M9's 40° a second): a 9 s loop without a seam.
// - «Цвет»: light — white at 25 %, as the SMM arrows (the same arrow), seen on the panel's #222222 (default); dark —
//   #222222 at 100 %, as the webinars put it on their mint cards.
// - Formats: 16:9 the 4K comp whole; 9:16 and 1:1 cover the frame with it (9:16 enlarged, as the SMM arrows are).
// Choices: masters/BG_Rack/README.md.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { layerProp, readJson } from '../../tools/dump/model.mjs';
import { packProject } from '../../tools/dump/dump.mjs';
import { workDir, workPath } from '../../tools/lib/work.mjs';
import { dumpLayer } from '../../tools/masters/dump-keys.mjs';
import { addQaPatch } from '../../tools/masters/rig-plate.mjs';
import { aspectOf, packOf, with4k } from '../../tools/masters/pack4k.mjs';
import { nul, P, precomp, Spec } from '../../tools/masters/spec.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');

export const ID = 'BG_Rack';
export const COMP = 'CR_BG_Rack';
const FPS = 25;
export const SOURCE = { name: 'PATTERN RACK_Animation', w: 3840, h: 2160, layers: 3 };
const NOISE = 'Fractal Noice';
const GRID = 'PATTERN RACK';
const FN = (n) => `ADBE Fractal Noise-${String(n).padStart(4, '0')}`;
// «Цвет»: the file key, the label, the arrows' colour (tokens.json -> color.base) and opacity
export const COLOURS = [
  { key: 'light', label: 'Светлые', token: 'white', opacity: 25 },
  { key: 'dark', label: 'Тёмные', token: 'black', opacity: 100 },
];
export const FORMATS = ['16x9', '9x16', '1x1'];

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const rgba = (h) => [1, 3, 5].map((i) => r6(parseInt(h.slice(i, i + 2), 16) / 255)).concat(1);
const js = (v) => JSON.stringify(v);

export function loadSources({ dumps = 'C:/CRBK/work/dumps', repo = REPO } = {}) {
  const web = (f) => readJson(path.join(dumps, 'webinars', f + '.json'));
  return {
    anim: web('pattern_rack_animation'),
    grid: web('pattern_rack'),
    tokens: JSON.parse(readFileSync(path.join(repo, 'brand', 'tokens.json'), 'utf8')),
  };
}

const find = (node, mn) => {
  if (node.matchName === mn) return node;
  for (const c of node.children || []) { const hit = find(c, mn); if (hit) return hit; }
  return null;
};

// The pack's rack: the grid (rows, the repeater's copies and step, the arrows' stroke) and the noise that shows it.
export function rackModel({ anim, grid }) {
  const c = anim.comp;
  if (c.name !== SOURCE.name || c.width !== SOURCE.w || c.height !== SOURCE.h || anim.layers.length !== SOURCE.layers) throw new Error(`«${c.name}»: not the pack's ${SOURCE.name}`);
  const noise = dumpLayer(anim, NOISE);
  const rack = dumpLayer(anim, GRID);
  if (rack.trackMatte.type !== 'LUMA' || noise.index !== rack.index - 1 || noise.switches.enabled) throw new Error(`${GRID}: not under the luma matte of ${NOISE}`);
  for (const L of [noise, rack]) {
    const tr = (mn) => layerProp(L, 'ADBE Transform Group', mn);
    if (js(tr('ADBE Position').value) !== js([1920, 1080, 0]) || tr('ADBE Orientation').value.some((v) => v !== 0) || tr('ADBE Rotate X').value !== 0 || tr('ADBE Rotate Y').value !== 0) {
      throw new Error(`${L.name}: not lying flat in the middle (flat would move it)`);
    }
  }
  const fn = noise.effects.find((e) => e.matchName === 'ADBE Fractal Noise');
  const param = (mn) => fn.params.find((p) => p.matchName === mn);
  const root = layerProp(grid.layers[0], 'ADBE Root Vectors Group');
  const rep = root.children.find((x) => x.matchName === 'ADBE Vector Filter - Repeater');
  const strokes = new Set();
  const walk = (n) => { for (const x of n.children || []) { if (x.matchName === 'ADBE Vector Graphic - Stroke') strokes.add(`${find(x, 'ADBE Vector Stroke Width').value}px ${find(x, 'ADBE Vector Stroke Color').value.slice(0, 3).map((v) => Math.round(v * 255)).join(',')}`); walk(x); } };
  walk(root);
  return {
    noise: { type: param(FN(1)).value, noiseType: param(FN(2)).value, scale: param(FN(10)).value, evolution: param(FN(23)).expression?.text ?? null, cycle: param(FN(25)).value },
    grid: { rows: root.children.filter((x) => x.matchName === 'ADBE Vector Group').length, columns: find(rep, 'ADBE Vector Repeater Copies').value, step: find(rep, 'ADBE Vector Repeater Position').value, strokes: [...strokes] },
  };
}

export function resolveRack(sources = loadSources()) {
  const { tokens } = sources;
  const base = tokens.color.base;
  const m = rackModel(sources);
  const m9 = tokens.motion.M9;
  if (!m.noise.evolution || !m.noise.evolution.includes(m9.expression)) throw new Error(`${NOISE}: evolution «${m.noise.evolution}», not M9's ${m9.expression}`);
  const period = r6(360 / m9.evolutionDegPerSec);
  const colours = COLOURS.map((c) => ({ ...c, hex: base[c.token].hex }));
  const ctrl = { Colour: { label: 'Цвет', items: colours.map((c) => c.label), value: 1 } };
  const spec = new Spec({ name: COMP, w: 1920, h: 1080, fps: FPS, duration: period });
  spec.add(precomp('RACK', 'DECOR_RACK', { effects: [{ matchName: 'ADBE Fill', name: 'Fill' }] }));
  spec.expr('RACK', P.pos, '[thisComp.width / 2, thisComp.height / 2]');
  // the 4K grid covers the frame: whole in 16:9, enlarged in 9:16, its middle in 1:1
  spec.expr('RACK', P.scale, `var s = 100 * Math.max(thisComp.width / ${SOURCE.w}, thisComp.height / ${SOURCE.h});\n[s, s]`);
  const pick = 'var c = thisComp.layer("CTRL").effect("Colour")(1).value;\n';
  spec.expr('RACK', ['effect', 'Fill', 'ADBE Fill', 'ADBE Fill-0002'], pick + `${js(colours.map((c) => rgba(c.hex)))}[c - 1]`);
  spec.expr('RACK', P.opacity, pick + `${js(colours.map((c) => c.opacity))}[c - 1]`);
  addQaPatch(spec, base.green.hex);
  spec.add(nul('CTRL', [
    { kind: 'dropdown', name: 'Colour', items: ctrl.Colour.items, value: ctrl.Colour.value },
    { kind: 'checkbox', name: 'QA', value: false },
  ]));

  const built = spec.toJSON();
  const files = with4k(FORMATS.flatMap((fmt) => colours.map((c, i) => ({ key: `${fmt}_${c.key}`, variant: fmt, ctrl: { Colour: i + 1 }, kind: 'loop', seconds: period, options: { colour: i + 1 } }))));
  const keep = sources.anim.layers.filter((l) => l.name === NOISE || l.name === GRID).map((l) => ({ index: l.index, name: l.name }));
  return {
    id: ID,
    workDir: workDir(),
    out: { dir: workPath('build', ID), aep: workPath('build', ID, ID + '_work.aep') },
    comp: spec.comp,
    colours,
    model: m,
    period,
    ctrl,
    text: {},
    egp: [],
    rig: {},
    markers: [],
    duration: { introSec: 0, holdSec: period, outroSec: 0 },
    files,
    spec: {
      ...built,
      fonts: [],
      markers: [],
      transplant: {
        aep: packProject('webinars'),
        folder: 'BK_DECOR',
        source: SOURCE,
        comps: [{
          name: 'DECOR_RACK', keep, flat: true,
          // the noise cycles: one revolution of its evolution (M9) is the loop
          set: [
            { layer: NOISE, path: ['effect', 'Fractal Noise', 'ADBE Fractal Noise', FN(25)], value: 1 },
            { layer: NOISE, path: ['effect', 'Fractal Noise', 'ADBE Fractal Noise', FN(26)], value: 1 },
          ],
        }],
      },
      egp: [],
      egpNames: [],
      measure: [],
      defaults: { text: {}, ctrl: { Colour: 1 } },
    },
    check: {},
    version: 1,
    variants: [...FORMATS, '16x9_4K'].map((key) => ({ key, ...tokens.video.formats[key] })),
    sweepTimes: [0, r6(period / 2), r6(period - 1 / FPS)],
    rest: 0,
  };
}

export const resolve = resolveRack;

// The library entry (library.src.json): a T2 loop on alpha, «Цвет» picks the file, the frame size the format; the
// panel puts #222222 under it (with the dark arrows, switch the backdrop off).
export function libraryEntry(p = resolveRack()) {
  return {
    id: ID,
    title_ru: 'Фон: стеллаж',
    category: 'backgrounds',
    tier: 'T2',
    hosts: ['ae', 'pr'],
    version: p.version,
    alpha: true,
    loop: { periodFrames: Math.round(p.period * FPS) },
    duration: p.duration,
    fields: [{ key: 'colour', label_ru: 'Цвет', type: 'dropdown', default: 1, options: COLOURS.map((c, i) => ({ index: i + 1, label_ru: c.label })) }],
    variants: p.files.map((f) => {
      const v = p.variants.find((x) => x.key === f.variant);
      return { key: f.key, aspect: aspectOf(f.variant), w: v.w, h: v.h, fps: FPS, options: f.options, ...packOf(f), minHostVersion: { ae: '26.0', pr: '26.0' } };
    }),
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = resolveRack();
  console.log(JSON.stringify({ layers: r.spec.order, model: r.model, period: r.period, keep: r.spec.transplant.comps[0].keep, files: r.files.map((f) => f.key) }, null, 1));
}
