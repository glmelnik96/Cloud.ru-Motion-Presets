// TRN_Bars «Шторка-полосы»: the SMM pack's bar transitions («Transition_gray», «_green», «_white» and «Transition with
// Logo»; 1080x1920 at 24 fps, 0.875 s: two layers of five bars slide across the frame in opposite directions) as files,
// not a template (spec 5, T2): a clip per format, colour and logo, on alpha. This master is only their source:
// tools/masters/render-files.mjs renders them.
// - The two layers of «Transition_gray» moved over as they are (spec.transplant), played by a time remap at the
//   canon's 25 fps. The pack's three colour comps are the same bars in another fill (checked), so «Цвет» fills them
//   (Fill), as TRN_StepWipe; their stroke is on but 0 px wide.
// - The full cover held: at 25 fps the bars cover the frame three frames, the cut needs four (spec 5; cutFrame is
//   where the panel puts the cut): the comp stands still on the first of them a frame more.
// - Trimmed to the frames where the bars show: the pack's first and last frames are empty.
// - «С логотипом»: the master logo (D18) through the bars (alpha matte) where the pack's is, as SMM_ShortsIntro has it;
//   its colours by the brandbook (L6, tokens color.logoVariants): on dark a green cube and white letters, on green all
//   black, on white a green cube and black letters.
// - Formats: 9:16 as in the pack; 16:9 and 4K the bars turned a quarter (the vertical frame lies on the landscape one
//   whole), the logo stays upright; 1:1 the middle of the 9:16.
// Choices: masters/TRN_Bars/README.md.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPoint } from '../../tools/dump/geometry.mjs';
import { layerProp, readJson } from '../../tools/dump/model.mjs';
import { packProject } from '../../tools/dump/dump.mjs';
import { workDir, workPath } from '../../tools/lib/work.mjs';
import { coverFrames, coverOf, holdRemapJs, holdTimeline } from '../../tools/masters/full-cover.mjs';
import { layerToCompAt, shapeBoxAt } from '../../tools/masters/dump-geometry.mjs';
import { dumpLayer } from '../../tools/masters/dump-keys.mjs';
import { fitCube, masterLockup } from '../../tools/masters/logo.mjs';
import { addQaPatch } from '../../tools/masters/rig-plate.mjs';
import { nul, P, pathGroup, precomp, shape, Spec } from '../../tools/masters/spec.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');

export const ID = 'TRN_Bars';
export const COMP = 'CR_TRN_Bars';
const FPS = 25;
export const HOLD = 4;          // frames of full cover the cut needs (spec 5)
export const SOURCE = { name: 'Transition_gray', w: 1080, h: 1920, layers: 2 };
const LOGO_LAYER = 'Cloud.ru_BlackMono 3';
// «Цвет», in the order of TRN_StepWipe: the file key, the label, the pack comp of that fill, the brand colour and the
// logo on it (tokens.json -> color.logoVariants)
export const COLOURS = [
  { key: 'green', label: 'Зелёный', comp: 'green', token: 'green', logo: 'onGreen' },
  { key: 'dark', label: 'Тёмный', comp: 'gray', token: 'black', logo: 'onBlack' },
  { key: 'white', label: 'Белый', comp: 'white', token: 'white', logo: 'onWhite' },
];
export const DEFAULT_COLOUR = 2; // the pack's own bars are dark (SMM_ShortsIntro, «Transition with Logo»)
export const FORMATS = ['9x16', '16x9', '16x9_4K', '1x1'];

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const rgba = (h) => [1, 3, 5].map((i) => r6(parseInt(h.slice(i, i + 2), 16) / 255)).concat(1);
const js = (v) => JSON.stringify(v);

export function loadSources({ dumps = 'C:/CRBK/work/dumps', repo = REPO } = {}) {
  const smm = (f) => readJson(path.join(dumps, 'smm', f + '.json'));
  return {
    gray: smm('transition_gray'),
    green: smm('transition_green'),
    white: smm('transition_white'),
    withLogo: smm('transition_with_logo'),
    logo: smm('cloud_ru_blackmono_3'),
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

// The bars of one pack comp as numbers: per layer its linear slide along X and its rectangles (size and where its
// group puts it), the fill they share. Anything else moving or turning stops the build.
export function barsModel(dump) {
  const c = dump.comp;
  if (!/^Transition_/.test(c.name) || c.width !== SOURCE.w || c.height !== SOURCE.h || dump.layers.length !== SOURCE.layers) {
    throw new Error(`«${c.name}» ${c.width}x${c.height}, ${dump.layers.length} layers: not a bar transition of the SMM pack`);
  }
  const fills = new Set();
  const layers = dump.layers.map((L) => {
    const k = xform(L, 'ADBE Position').keys;
    if (!k || k.length !== 2 || k.some((x) => x.inInterp !== 'LINEAR' || x.outInterp !== 'LINEAR') || k[0].value[1] !== k[1].value[1] || k[0].value[2] !== 0 || k[1].value[2] !== 0) {
      throw new Error(`${L.name}: Position is not a linear slide along X`);
    }
    const still = ['ADBE Anchor Point', 'ADBE Scale', 'ADBE Orientation', 'ADBE Rotate X', 'ADBE Rotate Y', 'ADBE Rotate Z'];
    const want = { 'ADBE Anchor Point': [0, 0, 0], 'ADBE Scale': [100, 100, 100], 'ADBE Orientation': [0, 0, 0], 'ADBE Rotate X': 0, 'ADBE Rotate Y': 0, 'ADBE Rotate Z': 0 };
    for (const mn of still) {
      const p = xform(L, mn);
      if ((p.keys && p.keys.length) || js(p.value) !== js(want[mn])) throw new Error(`${L.name}: ${mn} is ${js(p.value)}`);
    }
    const groups = layerProp(L, 'ADBE Root Vectors Group').children.filter((g) => g.matchName === 'ADBE Vector Group').map((g) => {
      const gt = find(g, 'ADBE Vector Transform Group');
      const at = (mn) => gt.children.find((x) => x.matchName === mn).value;
      if (js(at('ADBE Vector Anchor')) !== js([0, 0]) || js(at('ADBE Vector Scale')) !== js([100, 100]) || at('ADBE Vector Rotation') !== 0) {
        throw new Error(`${L.name} / ${g.name}: the group is moved otherwise than by its position`);
      }
      if (js(find(g, 'ADBE Vector Rect Position').value) !== js([0, 0]) || find(g, 'ADBE Vector Rect Roundness').value !== 0) {
        throw new Error(`${L.name} / ${g.name}: not a plain rectangle on its group's centre`);
      }
      const stroke = find(g, 'ADBE Vector Graphic - Stroke');
      if (stroke && stroke.enabled !== false && find(stroke, 'ADBE Vector Stroke Width').value !== 0) throw new Error(`${L.name} / ${g.name}: a visible stroke`);
      fills.add(hex(find(g, 'ADBE Vector Fill Color').value));
      return { size: find(g, 'ADBE Vector Rect Size').value, at: at('ADBE Vector Position') };
    });
    return { name: L.name, t0: k[0].time, t1: k[1].time, x0: k[0].value[0], x1: k[1].value[0], y: k[0].value[1], groups };
  });
  if (fills.size !== 1) throw new Error(`«${c.name}»: bars of colours ${[...fills].join(', ')}`);
  return { name: c.name, w: c.width, h: c.height, fps: c.frameRate, duration: c.duration, fill: [...fills][0], layers };
}

// The rectangles of the bars at pack time t, in pack px: { l, r, t, b }.
export function rectsAt(m, t) {
  const out = [];
  for (const L of m.layers) {
    const u = Math.max(0, Math.min(1, (t - L.t0) / (L.t1 - L.t0)));
    const x = L.x0 + (L.x1 - L.x0) * u;
    for (const g of L.groups) {
      const cx = x + g.at[0];
      const cy = L.y + g.at[1];
      out.push({ l: cx - g.size[0] / 2, r: cx + g.size[0] / 2, t: cy - g.size[1] / 2, b: cy + g.size[1] / 2 });
    }
  }
  return out;
}

// The windows of the pack frame each format shows: 9:16 and the turned 16:9 the whole of it, 1:1 its middle square.
export function windowsOf(m) {
  const whole = { l: 0, r: m.w, t: 0, b: m.h };
  return { '9x16': whole, '16x9': whole, '1x1': { l: 0, r: m.w, t: (m.h - m.w) / 2, b: (m.h + m.w) / 2 } };
}

// The pack's bars sampled at the master's 25 fps; the timeline from the frames of the whole frame.
export function barsTiming(m, hold = HOLD) {
  const per = coverFrames((t) => rectsAt(m, t), windowsOf(m), Math.ceil(m.duration * FPS - 1e-6), FPS);
  return { ...holdTimeline(per['9x16'], FPS, hold), per };
}

// The master logo where the pack's sits on «Transition with Logo»: its cube box in the frame, from the logo comp at
// its layer (scale, anchor, position).
export function logoCube({ withLogo, logo }) {
  const L = dumpLayer(withLogo, LOGO_LAYER);
  if (L.trackMatte.type !== 'ALPHA') throw new Error(`${LOGO_LAYER}: matte ${L.trackMatte.type}, the bars' alpha expected`);
  const m = layerToCompAt(withLogo, L, 0.4);
  const fillOf = (layer) => hex(find(layerProp(layer, 'ADBE Root Vectors Group'), 'ADBE Vector Fill Color').value);
  const cubeLayer = logo.layers.find((l) => fillOf(l) === '#26D07C');
  const b = shapeBoxAt(logo, cubeLayer, 1);
  const a = applyPoint(m, [b.x0, b.y0]);
  const z = applyPoint(m, [b.x1, b.y1]);
  return { x0: r6(a[0]), y0: r6(a[1]), w: r6(z[0] - a[0]), h: r6(z[1] - a[1]) };
}

export function resolveBars(sources = loadSources()) {
  const { svg, tokens } = sources;
  const base = tokens.color.base;
  const m = barsModel(sources.gray);
  // the three colour comps are the same bars: only the fill differs
  const strip = (x) => js({ ...x, name: null, fill: null });
  for (const c of COLOURS) {
    const other = barsModel(sources[c.comp]);
    if (strip(other) !== strip(m)) throw new Error(`«${other.name}»: its bars differ from «${m.name}»`);
    if (other.fill !== base[c.token].hex) throw new Error(`«${other.name}»: fill ${other.fill}, the brand ${c.token} is ${base[c.token].hex}`);
  }
  const bars = dumpLayer(sources.withLogo, SOURCE.name);
  if (bars.source?.name !== SOURCE.name) throw new Error('«Transition with Logo» does not play «Transition_gray»');
  const tm = barsTiming(m);
  const covered = {};
  for (const [k, win] of Object.entries(windowsOf(m))) {
    covered[k] = Array.from({ length: tm.frames }, (_, f) => f).filter((f) => coverOf(rectsAt(m, tm.packTime(f)), win).full);
    const want = Array.from({ length: HOLD }, (_, i) => tm.cutFrame + i);
    if (!want.every((f) => covered[k].includes(f))) throw new Error(`${k}: the master covers on ${covered[k].join(',')}, not ${want.join(',')}`);
  }
  const colours = COLOURS.map((c) => {
    const v = tokens.color.logoVariants[c.logo];
    return { ...c, hex: base[c.token].hex, logoColours: { mark: base[v.mark].hex, wordmark: base[v.wordmark].hex } };
  });
  const cube = logoCube(sources);
  const fit = fitCube(svg, cube);
  const lockup = masterLockup(svg, fit);
  const ctrl = {
    Colour: { label: 'Цвет', items: colours.map((c) => c.label), value: DEFAULT_COLOUR },
    Logo: { label: 'С логотипом', value: false },
  };

  const C = r6(tm.cutFrame / FPS);
  const spec = new Spec({ name: COMP, w: SOURCE.w, h: SOURCE.h, fps: FPS, duration: tm.durationSec });
  spec.add(precomp('BARS', 'DECOR_BARS', { timeRemap: true, collapse: true, effects: [{ matchName: 'ADBE Fill', name: 'Fill' }] }));
  // the pack's time: the shown frames from its first, the first full frame held until four cover
  spec.expr('BARS', P.timeRemap, holdRemapJs(tm, FPS));
  spec.expr('BARS', P.pos, '[thisComp.width / 2, thisComp.height / 2]');
  // a landscape frame turns the bars a quarter: the vertical frame lies on it whole
  const landscape = 'var p = thisComp.width > thisComp.height;';
  spec.expr('BARS', ['transform', 'ADBE Rotate Z'], `${landscape}\np ? 90 : 0`);
  spec.expr('BARS', P.scale, `${landscape}\nvar s = 100 * Math.max(thisComp.width / (p ? ${m.h} : ${m.w}), thisComp.height / (p ? ${m.w} : ${m.h}));\n[s, s]`);
  const pick = 'var c = thisComp.layer("CTRL").effect("Colour")(1).value;\n';
  spec.expr('BARS', ['effect', 'Fill', 'ADBE Fill', 'ADBE Fill-0002'], pick + `${js(colours.map((c) => rgba(c.hex)))}[c - 1]`);
  // the logo upright on the frame's middle, through the bars: drawn in pack px, turned about the pack frame's middle;
  // coloured by «Цвет» (the first group is in front)
  const dark = colours.find((c) => c.key === 'dark').logoColours;
  spec.add(shape('LOGO', [pathGroup('Wordmark', dark.wordmark, lockup.wordmark), pathGroup('Cube', dark.mark, lockup.cube)], { anchor: [m.w / 2, m.h / 2] }));
  spec.expr('LOGO', P.pos, '[thisComp.width / 2, thisComp.height / 2]');
  spec.expr('LOGO', P.scale, 'var k = Math.min(thisComp.width, thisComp.height) / 1080;\n[100 * k, 100 * k]');
  spec.expr('LOGO', P.opacity, 'thisComp.layer("CTRL").effect("Logo")(1).value * 100');
  spec.expr('LOGO', P.fill('Wordmark'), pick + `${js(colours.map((c) => rgba(c.logoColours.wordmark)))}[c - 1]`);
  spec.expr('LOGO', P.fill('Cube'), pick + `${js(colours.map((c) => rgba(c.logoColours.mark)))}[c - 1]`);
  spec.matte('LOGO', 'BARS', 'ALPHA');
  addQaPatch(spec, base.green.hex);
  spec.add(nul('CTRL', [
    { kind: 'dropdown', name: 'Colour', items: ctrl.Colour.items, value: ctrl.Colour.value },
    { kind: 'checkbox', name: 'Logo', value: false },
    { kind: 'checkbox', name: 'QA', value: false },
  ]));

  const built = spec.toJSON();
  // the files: per format, colour and logo the whole clip
  const files = FORMATS.flatMap((fmt) => colours.flatMap((c, i) => [false, true].map((logo) => ({
    key: `${fmt}_${c.key}${logo ? '_logo' : ''}`, variant: fmt, ctrl: { Colour: i + 1, Logo: logo ? 1 : 0 }, kind: 'clip',
    seconds: tm.durationSec, options: { colour: i + 1, logo },
  }))));
  return {
    id: ID,
    workDir: workDir(),
    out: { dir: workPath('build', ID), aep: workPath('build', ID, ID + '_work.aep') },
    comp: spec.comp,
    colours,
    model: m,
    logo: { cube, fit },
    timing: { head: tm.head, tail: tm.tail, extra: tm.extra, cutFrame: tm.cutFrame, frames: tm.frames, durationSec: tm.durationSec, per: tm.per, covered },
    ctrl,
    text: {},
    egp: [],
    rig: {},
    markers: [],
    files,
    spec: {
      ...built,
      fonts: [],
      markers: [],
      transplant: {
        aep: packProject('smm'),
        folder: 'BK_DECOR',
        source: SOURCE,
        // the bars are 3D layers lying flat (z 0, not turned: barsModel checks it): made 2D, a variant of another
        // size does not shift them with the default camera
        comps: [{ name: 'DECOR_BARS', keep: sources.gray.layers.map((l) => ({ index: l.index, name: l.name })), flat: true }],
      },
      egp: [],
      egpNames: [],
      measure: [],
      defaults: { text: {}, ctrl: { Colour: DEFAULT_COLOUR, Logo: 0 } },
    },
    check: {},
    version: 1,
    variants: FORMATS.map((key) => ({ key, ...tokens.video.formats[key] })),
    sweepTimes: [0, C, r6(tm.durationSec - 1 / FPS)],
    rest: C,
  };
}

export const resolve = resolveBars;

const aspectOf = (fmt) => fmt.replace(/_4K$/, '');

// The library entry (library.src.json) the files make: tier T2, a transition by its frame of full cover; «Цвет» and «С
// логотипом» pick the file (variant options), the frame size the format.
export function libraryEntry(p = resolveBars()) {
  return {
    id: ID,
    title_ru: 'Шторка-полосы',
    category: 'transitions',
    tier: 'T2',
    hosts: ['ae', 'pr'],
    version: p.version,
    cutFrame: p.timing.cutFrame,
    alpha: true,
    fields: [
      { key: 'colour', label_ru: 'Цвет', type: 'dropdown', default: DEFAULT_COLOUR, options: COLOURS.map((c, i) => ({ index: i + 1, label_ru: c.label })) },
      { key: 'logo', label_ru: 'С логотипом', type: 'checkbox', default: false },
    ],
    variants: p.files.map((f) => {
      const v = p.variants.find((x) => x.key === f.variant);
      return { key: f.key, aspect: aspectOf(f.variant), w: v.w, h: v.h, fps: FPS, options: f.options, minHostVersion: { ae: '26.0', pr: '26.0' } };
    }),
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = resolveBars();
  const t = r.timing;
  console.log(JSON.stringify({ layers: r.spec.order, timing: { head: t.head, tail: t.tail, extra: t.extra, cutFrame: t.cutFrame, frames: t.frames, durationSec: t.durationSec },
    pack: Object.fromEntries(Object.entries(t.per).map(([k, v]) => [k, { shown: `${v.shown[0]}..${v.shown[v.shown.length - 1]}`, full: v.full.join(',') }])),
    master: Object.fromEntries(Object.entries(t.covered).map(([k, v]) => [k, v.join(',')])),
    logo: r.logo, colours: r.colours.map((c) => [c.key, c.hex, c.logoColours]),
    files: r.files.length, expressions: r.spec.expressions.map((e) => `${e.layer} ${e.path.join('/')}`) }, null, 1));
}
