// TRN_StepWipe «Ступенчатая шторка»: the courses pack's transition «Переход» (2560x1440, 2.04 s: a green rectangle
// crosses the frame from right to left, five steps riding on its edges) as files, not a template (spec 5, T2): a clip
// per format and colour, on alpha. This master is only their source: tools/masters/render-files.mjs renders them.
// - The pack's six layers moved over as they are (spec.transplant), played by a time remap.
// - The full cover held: the pack covers the whole frame for one frame (1.00 s), the cut needs at least four
//   (spec 5; cutFrame, the first frame of full cover, is where the panel puts the cut). The comp stands still there
//   for the missing frames: nothing shows but the colour, so the stop does not show.
// - Trimmed to the frames where the wipe shows: the pack's first four and last eight frames are empty.
// - «Цвет»: green (the pack's), dark or white — a Fill over the collapsed wipe.
// - Formats: 16:9 and its 4K twin; 1:1 the middle of the 16:9 wipe; 9:16 the wipe turned a quarter, crossing from
//   the bottom up (the middle of the horizontal one would show only its fastest 16 frames).
// Choices: masters/TRN_StepWipe/README.md.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { layerProp, readJson } from '../../tools/dump/model.mjs';
import { packProject } from '../../tools/dump/dump.mjs';
import { workDir, workPath } from '../../tools/lib/work.mjs';
import { easedProgress } from '../../tools/masters/dump-keys.mjs';
import { addQaPatch } from '../../tools/masters/rig-plate.mjs';
import { nul, P, precomp, Spec } from '../../tools/masters/spec.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');

export const ID = 'TRN_StepWipe';
export const COMP = 'CR_TRN_StepWipe';
const FPS = 25;
export const HOLD = 4;          // frames of full cover the cut needs (spec 5)
export const SOURCE = { name: 'Переход', w: 2560, h: 1440, layers: 6 };
// «Цвет», in its order: the file key, the label, the brand colour (tokens.json -> color.base)
export const COLOURS = [
  { key: 'green', label: 'Зелёный', token: 'green' },
  { key: 'dark', label: 'Тёмный', token: 'black' },
  { key: 'white', label: 'Белый', token: 'white' },
];
export const FORMATS = ['16x9', '16x9_4K', '9x16', '1x1'];

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const rgba = (h) => [1, 3, 5].map((i) => r6(parseInt(h.slice(i, i + 2), 16) / 255)).concat(1);
const js = (v) => JSON.stringify(v);

export function loadSources({ dumps = 'C:/CRBK/work/dumps', repo = REPO } = {}) {
  return {
    wipe: readJson(path.join(dumps, 'courses', 'perekhod.json')),
    tokens: JSON.parse(readFileSync(path.join(repo, 'brand', 'tokens.json'), 'utf8')),
  };
}

const find = (node, mn) => {
  if (node.matchName === mn) return node;
  for (const c of node.children || []) { const hit = find(c, mn); if (hit) return hit; }
  return null;
};
const xform = (L, mn) => layerProp(L, 'ADBE Transform Group', mn);

// One layer's rectangle: its size, where its group puts it in the layer, its fill; the stroke must be off.
function rectOf(L) {
  const root = layerProp(L, 'ADBE Root Vectors Group');
  const groups = root.children.filter((c) => c.matchName === 'ADBE Vector Group');
  if (groups.length !== 1) throw new Error(`${L.name}: ${groups.length} groups, one rectangle expected`);
  const g = groups[0];
  const gt = find(g, 'ADBE Vector Transform Group');
  const at = (mn) => gt.children.find((c) => c.matchName === mn).value;
  if (js(at('ADBE Vector Anchor')) !== js([0, 0]) || js(at('ADBE Vector Scale')) !== js([100, 100]) || at('ADBE Vector Rotation') !== 0) {
    throw new Error(`${L.name}: the rectangle's group is moved otherwise than by its position`);
  }
  if (js(find(g, 'ADBE Vector Rect Position').value) !== js([0, 0])) throw new Error(`${L.name}: the rectangle is off its group's centre`);
  const stroke = find(g, 'ADBE Vector Graphic - Stroke');
  if (stroke && stroke.enabled !== false) throw new Error(`${L.name}: the stroke is on`);
  return { size: find(g, 'ADBE Vector Rect Size').value, at: at('ADBE Vector Position'), fill: hex(find(g, 'ADBE Vector Fill Color').value) };
}

// The pack's wipe as numbers: the big rectangle (the parent, X keyed with its ease, uniform scale) and the five steps
// parented to it (each a rectangle centred on its anchor, Scale keyed linearly).
export function wipeModel(dump) {
  const c = dump.comp;
  if (c.name !== SOURCE.name || c.width !== SOURCE.w || c.height !== SOURCE.h || c.frameRate !== FPS || dump.layers.length !== SOURCE.layers) {
    throw new Error(`«${c.name}» ${c.width}x${c.height} ${c.frameRate} fps, ${dump.layers.length} layers: not the pack's «Переход»`);
  }
  const roots = dump.layers.filter((l) => l.parent === null);
  if (roots.length !== 1) throw new Error(`«Переход»: ${roots.length} layers without a parent, one expected`);
  const P0 = roots[0];
  const xk = xform(P0, 'ADBE Position_0').keys;
  if (!xk || xk.length !== 2) throw new Error('«Переход»: the big rectangle\'s X has not two keys');
  for (const [k, side] of [[xk[0], 'outEase'], [xk[1], 'inEase']]) {
    if (Math.abs(k[side][0].speed) > 1e-3) throw new Error('«Переход»: the X ease has speed, not the zero-speed curve');
  }
  const scale = xform(P0, 'ADBE Scale').value;
  if (scale[0] !== scale[1] || js(xform(P0, 'ADBE Anchor Point').value.slice(0, 2)) !== js([0, 0])) throw new Error('«Переход»: the big rectangle is scaled or anchored otherwise');
  const parent = {
    name: P0.name,
    x: { t0: xk[0].time, t1: xk[1].time, v0: xk[0].value, v1: xk[1].value, out: xk[0].outEase[0].influence, in: xk[1].inEase[0].influence },
    y: xform(P0, 'ADBE Position_1').value,
    scale: scale[0] / 100,
    ...rectOf(P0),
  };
  const steps = dump.layers.filter((l) => l.parent === P0.index).map((L) => {
    const r = rectOf(L);
    const anchor = xform(L, 'ADBE Anchor Point').value.slice(0, 2);
    if (Math.abs(anchor[0] - r.at[0]) > 1e-6 || Math.abs(anchor[1] - r.at[1]) > 1e-6) throw new Error(`${L.name}: the rectangle is not on the layer's anchor`);
    const sk = xform(L, 'ADBE Scale').keys;
    if (!sk || sk.length !== 2 || sk.some((k) => k.inInterp !== 'LINEAR' || k.outInterp !== 'LINEAR')) throw new Error(`${L.name}: Scale is not two linear keys`);
    if (xform(L, 'ADBE Position').keys?.length) throw new Error(`${L.name}: its position moves`);
    return { name: L.name, pos: xform(L, 'ADBE Position').value.slice(0, 2), size: r.size, fill: r.fill, scale: sk.map((k) => ({ t: k.time, v: k.value.slice(0, 2) })) };
  });
  if (steps.length !== SOURCE.layers - 1) throw new Error(`«Переход»: ${steps.length} steps, ${SOURCE.layers - 1} expected`);
  const fills = [...new Set([parent.fill, ...steps.map((s) => s.fill)])];
  if (fills.length !== 1) throw new Error(`«Переход»: rectangles of colours ${fills.join(', ')}`);
  return { w: c.width, h: c.height, fps: c.frameRate, duration: c.duration, fill: fills[0], parent, steps };
}

// The rectangles of the wipe at pack time t, in pack px: { l, r, t, b }.
export function rectsAt(m, t) {
  const { x, scale: S } = m.parent;
  const u = Math.max(0, Math.min(1, (t - x.t0) / (x.t1 - x.t0)));
  const X = x.v0 + (x.v1 - x.v0) * easedProgress(u, x.out, x.in);
  const box = (cx, cy, w, h) => ({ l: cx - w / 2, r: cx + w / 2, t: cy - h / 2, b: cy + h / 2 });
  const out = [box(X + S * m.parent.at[0], m.parent.y + S * m.parent.at[1], S * m.parent.size[0], S * m.parent.size[1])];
  for (const s of m.steps) {
    const [a, z] = s.scale;
    const v = (i) => a.v[i] + (z.v[i] - a.v[i]) * Math.max(0, Math.min(1, (t - a.t) / (z.t - a.t)));
    out.push(box(X + S * s.pos[0], m.parent.y + S * s.pos[1], (S * s.size[0] * v(0)) / 100, (S * s.size[1] * v(1)) / 100));
  }
  return out;
}

// How the rectangles meet a window of the frame, exactly: full — every point of it covered with a pixel to spare (no
// half-covered edge pixel), shows — some rectangle reaches half a pixel into it.
export function coverOf(rects, win) {
  const g = { l: win.l - 1, r: win.r + 1, t: win.t - 1, b: win.b + 1 };
  const shows = rects.some((q) => Math.min(q.r, win.r) - Math.max(q.l, win.l) >= 0.5 && Math.min(q.b, win.b) - Math.max(q.t, win.t) >= 0.5);
  const xs = [...new Set([g.l, g.r, ...rects.flatMap((q) => [q.l, q.r]).filter((x) => x > g.l && x < g.r)])].sort((a, b) => a - b);
  let full = true;
  for (let i = 0; full && i < xs.length - 1; i += 1) {
    const mid = (xs[i] + xs[i + 1]) / 2;
    const spans = rects.filter((q) => q.l <= mid && q.r >= mid).map((q) => [q.t, q.b]).sort((a, b) => a[0] - b[0]);
    let reach = g.t;
    for (const [a, b] of spans) if (a <= reach + 1e-9) reach = Math.max(reach, b);
    full = reach >= g.b - 1e-9;
  }
  return { full, shows };
}

// The windows of the pack frame each format shows: 16:9 and the turned 9:16 the whole of it, 1:1 its middle square.
export function windowsOf(m) {
  const whole = { l: 0, r: m.w, t: 0, b: m.h };
  const side = m.h;
  return { '16x9': whole, '9x16': whole, '1x1': { l: (m.w - side) / 2, r: (m.w + side) / 2, t: 0, b: m.h } };
}

// The pack's frames per window: where the wipe shows and where it covers it all; then the master's timeline — the
// shown frames of the widest window, the first full frame held to HOLD frames — and the pack time of each frame.
export function wipeTiming(m, hold = HOLD) {
  const n = Math.round(m.duration * m.fps);
  const wins = windowsOf(m);
  const per = {};
  for (const [k, win] of Object.entries(wins)) {
    const shown = [];
    const full = [];
    for (let f = 0; f < n; f += 1) {
      const c = coverOf(rectsAt(m, f / m.fps), win);
      if (c.shows) shown.push(f);
      if (c.full) full.push(f);
    }
    per[k] = { shown, full };
  }
  const { shown, full } = per['16x9'];
  const run = (fs) => fs.length > 0 && fs[fs.length - 1] - fs[0] === fs.length - 1;
  if (!run(shown) || !run(full)) throw new Error(`«Переход»: the wipe shows on ${shown.join(',')}, covers on ${full.join(',')}: not one run each`);
  const head = shown[0];
  const extra = Math.max(0, hold - full.length);
  const cutFrame = full[0] - head;
  const frames = shown.length + extra;
  const packTime = (f) => r6((f <= cutFrame ? f + head : f < cutFrame + extra ? cutFrame + head : f + head - extra) / m.fps);
  return { head, tail: shown[shown.length - 1], extra, cutFrame, frames, durationSec: r6(frames / m.fps), packTime, per };
}

export function resolveWipe(sources = loadSources()) {
  const { tokens } = sources;
  const m = wipeModel(sources.wipe);
  const base = tokens.color.base;
  if (m.fill !== base.green.hex) throw new Error(`«Переход»: fill ${m.fill}, the brand green is ${base.green.hex}`);
  const tm = wipeTiming(m);
  // the master's frames, checked in every window: the cover holds HOLD frames from cutFrame (1:1 shows more)
  const covered = {};
  for (const [k, win] of Object.entries(windowsOf(m))) {
    covered[k] = Array.from({ length: tm.frames }, (_, f) => f).filter((f) => coverOf(rectsAt(m, tm.packTime(f)), win).full);
    const want = Array.from({ length: HOLD }, (_, i) => tm.cutFrame + i);
    if (!want.every((f) => covered[k].includes(f))) throw new Error(`${k}: the master covers on ${covered[k].join(',')}, not ${want.join(',')}`);
  }
  const colours = COLOURS.map((c) => ({ ...c, hex: base[c.token].hex }));
  const ctrl = { Colour: { label: 'Цвет', items: colours.map((c) => c.label), value: 1 } };

  const A = r6(tm.head / FPS);
  const C = r6(tm.cutFrame / FPS);
  const E = r6(tm.extra / FPS);
  const spec = new Spec({ name: COMP, w: 1920, h: 1080, fps: FPS, duration: tm.durationSec });
  spec.add(precomp('WIPE', 'DECOR_WIPE', { timeRemap: true, collapse: true, effects: [{ matchName: 'ADBE Fill', name: 'Fill' }] }));
  // the pack's time: the shown frames from its first, the first full frame held E more
  spec.expr('WIPE', P.timeRemap, `var A = ${A}, C = ${C}, E = ${E}, e = 1e-6;\ntime <= C + e ? time + A : (time < C + E - e ? C + A : time + A - E)`);
  spec.expr('WIPE', P.pos, '[thisComp.width / 2, thisComp.height / 2]');
  // a portrait frame turns the wipe a quarter: it crosses from the bottom up
  const portrait = 'var p = thisComp.height > thisComp.width;';
  spec.expr('WIPE', ['transform', 'ADBE Rotate Z'], `${portrait}\np ? 90 : 0`);
  spec.expr('WIPE', P.scale, `${portrait}\nvar s = 100 * Math.max(thisComp.width / (p ? ${m.h} : ${m.w}), thisComp.height / (p ? ${m.w} : ${m.h}));\n[s, s]`);
  spec.expr('WIPE', ['effect', 'Fill', 'ADBE Fill', 'ADBE Fill-0002'], `var c = thisComp.layer("CTRL").effect("Colour")(1).value;\n${js(colours.map((c) => rgba(c.hex)))}[c - 1]`);
  addQaPatch(spec, base.green.hex);
  spec.add(nul('CTRL', [
    { kind: 'dropdown', name: 'Colour', items: ctrl.Colour.items, value: ctrl.Colour.value },
    { kind: 'checkbox', name: 'QA', value: false },
  ]));

  const built = spec.toJSON();
  // the files: per format and colour the whole clip
  const files = FORMATS.flatMap((fmt) => colours.map((c, i) => ({
    key: `${fmt}_${c.key}`, variant: fmt, ctrl: { Colour: i + 1 }, kind: 'clip', seconds: tm.durationSec, options: { colour: i + 1 },
  })));
  return {
    id: ID,
    workDir: workDir(),
    out: { dir: workPath('build', ID), aep: workPath('build', ID, ID + '_work.aep') },
    comp: spec.comp,
    colours,
    model: m,
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
        aep: packProject('courses'),
        folder: 'BK_DECOR',
        source: SOURCE,
        comps: [{ name: 'DECOR_WIPE', keep: sources.wipe.layers.map((l) => ({ index: l.index, name: l.name })) }],
      },
      egp: [],
      egpNames: [],
      measure: [],
      defaults: { text: {}, ctrl: { Colour: 1 } },
    },
    check: {},
    version: 1,
    variants: FORMATS.map((key) => ({ key, ...tokens.video.formats[key] })),
    sweepTimes: [0, C, r6(tm.durationSec - 1 / FPS)],
    rest: C,
  };
}

export const resolve = resolveWipe;

const aspectOf = (fmt) => fmt.replace(/_4K$/, '');

// The library entry (library.src.json) the files make: tier T2, a transition by its frame of full cover, «Цвет» picks
// the file (variant options) and the frame size the format.
export function libraryEntry(p = resolveWipe()) {
  return {
    id: ID,
    title_ru: 'Ступенчатая шторка',
    category: 'transitions',
    tier: 'T2',
    hosts: ['ae', 'pr'],
    version: p.version,
    cutFrame: p.timing.cutFrame,
    alpha: true,
    fields: [
      { key: 'colour', label_ru: 'Цвет', type: 'dropdown', default: 1, options: COLOURS.map((c, i) => ({ index: i + 1, label_ru: c.label })) },
    ],
    variants: p.files.map((f) => {
      const v = p.variants.find((x) => x.key === f.variant);
      return { key: f.key, aspect: aspectOf(f.variant), w: v.w, h: v.h, fps: FPS, options: f.options, minHostVersion: { ae: '26.0', pr: '26.0' } };
    }),
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = resolveWipe();
  const t = r.timing;
  console.log(JSON.stringify({ layers: r.spec.order, timing: { head: t.head, tail: t.tail, extra: t.extra, cutFrame: t.cutFrame, frames: t.frames, durationSec: t.durationSec },
    pack: Object.fromEntries(Object.entries(t.per).map(([k, v]) => [k, { shown: `${v.shown[0]}..${v.shown[v.shown.length - 1]}`, full: v.full.join(',') }])),
    master: Object.fromEntries(Object.entries(t.covered).map(([k, v]) => [k, v.join(',')])),
    files: r.files.map((f) => f.key), expressions: r.spec.expressions.map((e) => `${e.layer} ${e.path.join('/')}`) }, null, 1));
}
