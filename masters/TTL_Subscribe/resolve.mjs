// TTL_Subscribe «Призыв „Подписывайся“»: two lines on green plates, from the podcast pack «Подписывайся!
// Ссылки в описании» (3840x2160, FHD = / 2). The third master on the plate rig (tools/masters/rig-plate.mjs):
// the block of TTL_Plate's «Подкаст» with the pack's own, quicker curves (the canon D19 does not cover this
// comp: plate 19 frames, words 9), bigger caps and «Позиция» (Авто: centred, as the pack). Built from a
// declarative spec (tools/masters/jsx/build-spec.jsx); provisional choices: masters/TTL_Subscribe/README.md.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from '../../tools/dump/model.mjs';
import { workDir, workPath } from '../../tools/lib/work.mjs';
import { shapeBoxAt } from '../../tools/masters/dump-geometry.mjs';
import { dumpKeys, dumpLayer } from '../../tools/masters/dump-keys.mjs';
import { addPlateBlock, addQaPatch, canonProgress, dumpSegment, lineAt, rigTimes, SIZE_CTRL, START } from '../../tools/masters/rig-plate.mjs';
import { nul, P, Spec } from '../../tools/masters/spec.mjs';
import { regions, SPEED_CTRL, timeMapJs } from '../../tools/masters/speed.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');

export const ID = 'TTL_Subscribe';
export const COMP = 'CR_TTL_Subscribe';
const FPS = 25;
const DURATION = 6;
// a moment of the hold at every speed (0,75×: 1.52–4.72 s, 2×: 0.56–5.52 s): the ink of the lines is read there
const REST = 3.0;
const PACK_REST = 4.0;         // the pack: both lines at rest 1.84–8.84 s
const T = ['ADBE Transform Group'];
// [text, plate] from the top; the pack splits line 2 at 1.84 s: «ПОДПИСАТЬСЯЁ» rises, «ПОДПИСАТЬСЯЁ 3» stays
export const LINES = [['ПОДПИСАТЬСЯЁ 2', 'Cube_4'], ['ПОДПИСАТЬСЯЁ 3', 'Cube_3']];
const RISE_2 = 'ПОДПИСАТЬСЯЁ';
const FIT = 'FitSub';
const SLIDERS = { plateIn: 'SubPlateIn', textIn: 'SubTextIn', textOut: 'SubTextOut', plateOut: 'SubPlateOut' };

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const mean = (list) => r6(list.reduce((s, v) => s + v, 0) / list.length);
const same = (list, label, tol = 1e-6) => {
  if (list.some((v) => Math.abs(v - list[0]) > tol)) throw new Error(`${label}: the pack is no longer uniform: ${list.join(', ')}`);
  return r6(list[0]);
};

export function loadSources({ dumps = 'C:/CRBK/work/dumps', repo = REPO } = {}) {
  return {
    sub: readJson(path.join(dumps, 'podcast', 'podpisyvaysya_ssylki_v_opisanii.json')),
    pod: readJson(path.join(dumps, 'podcast', 'tekst_na_plashke_1.json')),
    metrics: JSON.parse(readFileSync(path.join(repo, 'masters', ID, 'source-metrics.json'), 'utf8')),
    tokens: JSON.parse(readFileSync(path.join(repo, 'brand', 'tokens.json'), 'utf8')),
  };
}

// The pack's two lines at rest. Each plate stands 66 px over its baseline; line 1 reaches 10.75 px under it,
// to cover the Д of «ПОДПИСЫВАЙСЯ!» and meet line 2 (the rig does both from the ink). The sides come from
// the podcast frame window of «Текст на плашке_1», as TTL_Plate.
export function subscribeLayout({ sub, pod, metrics }) {
  const [a, b] = LINES.map(([t, p]) => lineAt(sub, metrics, t, p, PACK_REST));
  const edge = mean([1, 2, 3].map((i) => (pod.comp.width - shapeBoxAt(pod, dumpLayer(pod, `Box_${i}`), PACK_REST).x1) / 2));
  return {
    font: a.font === b.font ? a.font : null,
    size: same([a.size, b.size], 'subscribe size'),
    tracking: same([a.tracking, b.tracking], 'subscribe tracking'),
    rise: same([a.rise, b.rise], 'subscribe rise'),
    h: same([a.baseline - a.plate.y0, b.baseline - b.plate.y0], 'subscribe plate over the baseline', 0.05),
    step: r6(b.baseline - a.baseline),
    base: r6(b.plate.y1 - b.baseline),
    reach: r6(a.plate.y1 - a.baseline),
    pad: mean([a.ink.x0 - a.plate.x0, a.plate.x1 - a.ink.x1, b.ink.x0 - b.plate.x0, b.plate.x1 - b.ink.x1]),
    bottom: r6(b.H - b.plate.y1),
    centre: mean([a, b].map((x) => (x.plate.x0 + x.plate.x1) / 2 - x.W / 2)),
    edge,
  };
}

// The pack's curves of line 1 for both lines (line 2 leaves a frame quicker: plate 16 frames, text eases
// [1, 0, 0.22, 1]); line 2 starts 0.36 s after line 1, each text 0.4 s after its plate; on the way out the
// texts go 0.24 s apart and each plate with its text (line 2's 0.04 s later in the pack).
export function subscribeTiming(sub) {
  const plates = LINES.map(([, p]) => dumpKeys(sub, p, ...T, 'ADBE Scale'));
  const t1 = dumpKeys(sub, LINES[0][0], ...START);
  const t2in = dumpKeys(sub, RISE_2, ...START);
  const t2out = dumpKeys(sub, LINES[1][0], ...START);
  return {
    plateIn: dumpSegment(plates[0], 0, { dim: 0, label: 'Cube_4 in' }),
    plateOut: dumpSegment(plates[0], 2, { dim: 0, label: 'Cube_4 out' }),
    textIn: dumpSegment(t1, 0, { label: 'line 1 in' }),
    textOut: dumpSegment(t1, 2, { label: 'line 1 out' }),
    inDelays: [0, r6(plates[1][0].time - plates[0][0].time)],
    textLag: same([t1[0].time - plates[0][0].time, t2in[0].time - plates[1][0].time], 'subscribe text after plate'),
    outStagger: r6(t2out[0].time - t1[2].time),
    plateLag: r6(plates[0][2].time - t1[2].time),
  };
}

export function resolveSubscribe(sources = loadSources()) {
  const { tokens } = sources;
  const base = tokens.color.base;
  const hex = { black: base.black.hex, green: base.green.hex };
  const L = subscribeLayout(sources);
  const tm = subscribeTiming(sources.sub);
  const times = rigTimes(tm, DURATION);
  const timeMap = timeMapJs({ introEnd: times.introEnd, outroStart: times.outroStart });
  const reg = regions({ introEnd: times.introEnd, outroStart: times.outroStart, duration: DURATION, fps: FPS });
  const rig = {
    [SLIDERS.plateIn]: canonProgress(tm.plateIn, 0),
    [SLIDERS.textIn]: canonProgress(tm.textIn, times.textIn),
    [SLIDERS.textOut]: canonProgress(tm.textOut, times.textOut),
    [SLIDERS.plateOut]: canonProgress(tm.plateOut, times.plateOut),
  };
  // the pack typed its capitals: capitals by expression (block.upper), not All Caps, which spaces them wider
  const lineStyle = { font: L.font, size: L.size, fill: hex.black, tracking: L.tracking, justify: 'LEFT' };
  const text = {
    TXT_1: { value: 'Подписывайся!', label: 'Строка 1', style: lineStyle },
    TXT_2: { value: 'Ссылки в описании', label: 'Строка 2', style: lineStyle },
  };
  const ctrl = {
    Position: { label: 'Позиция', items: ['Авто', 'Слева', 'По центру', 'Справа'], value: 1 },
    Speed: SPEED_CTRL,
    Size: SIZE_CTRL,
  };
  const pad = `${L.pad} * kt`;
  const block = {
    auto: 2, fit: FIT, texts: ['TXT_1', 'TXT_2'], plates: ['PL_1', 'PL_2'], values: [text.TXT_1.value, text.TXT_2.value],
    textStyle: lineStyle, fill: hex.green, rest: REST, upper: true,
    geo: { h: L.h, step: L.step, base: L.base, rise: L.rise, edge: String(L.edge), margin: String(L.edge), bottom: String(L.bottom), padL: pad, padR: pad },
    fromTop: true, timing: tm, sliders: SLIDERS, textOut: 'start',
  };

  const spec = new Spec({ name: COMP, w: 1920, h: 1080, fps: FPS, duration: DURATION });
  addPlateBlock(spec, block, timeMap);
  addQaPatch(spec, hex.green);
  spec.add(nul('RIG', [
    ...Object.keys(rig).map((name) => ({ kind: 'slider', name })),
    { kind: 'slider', name: FIT, value: 1 },
  ], { shy: true }));
  for (const [name, keys] of Object.entries(rig)) spec.key('RIG', P.slider(name), keys);
  spec.add(nul('CTRL', [
    { kind: 'dropdown', name: 'Position', items: ctrl.Position.items, value: ctrl.Position.value },
    { kind: 'dropdown', name: 'Speed', items: ctrl.Speed.items, value: ctrl.Speed.value },
    { kind: 'dropdown', name: 'Size', items: ctrl.Size.items, value: ctrl.Size.value },
    { kind: 'checkbox', name: 'QA', value: false },
  ]));

  // AE lists the newest controller first: added in reverse of Строка 1, Строка 2, Позиция, Скорость, Размер текста
  const egp = [{ effect: 'Size' }, { effect: 'Speed' }, { effect: 'Position' }, { text: 'TXT_2' }, { text: 'TXT_1' }];
  const pack = { TXT_1: 'ПОДПИСЫВАЙСЯ!', TXT_2: 'ССЫЛКИ В ОПИСАНИИ' };
  const built = spec.toJSON();
  return {
    id: ID,
    workDir: workDir(),
    out: { dir: workPath('build', ID), aep: workPath('build', ID, ID + '_work.aep') },
    comp: spec.comp,
    hex,
    layout: L,
    timing: { ...tm, times },
    text,
    ctrl,
    egp,
    rig,
    markers: reg.markers,
    duration: reg.duration,
    spec: {
      ...built,
      fonts: [L.font],
      markers: reg.markers,
      egp: egp.map((e) => (e.text ? { text: e.text, label: text[e.text].label } : { effect: e.effect, matchName: 'ADBE Dropdown Control', label: ctrl[e.effect].label })),
      egpNames: [text.TXT_1.label, text.TXT_2.label, ctrl.Position.label, ctrl.Speed.label, ctrl.Size.label],
      measure: [{ name: 'pack', t: REST, ctrl: { Position: 1 }, text: pack, layers: ['PL_1', 'PL_2', 'TXT_1', 'TXT_2'] }],
      defaults: { text: { TXT_1: text.TXT_1.value, TXT_2: text.TXT_2.value }, ctrl: { Position: 1, Speed: 2, Size: 2 } },
    },
    check: pack,
    version: 1,
    variants: ['16x9', '16x9_4K', '9x16', '1x1'].map((key) => ({ key, ...tokens.video.formats[key] })),
    sweepTimes: [0, 0.2, 0.4, 0.7, 1.0, 1.2, 3.0, 5.0, 5.2, 5.4, 5.6, 5.8, 5.96],
    rest: REST,
  };
}

export const resolve = resolveSubscribe;

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = resolveSubscribe();
  console.log(JSON.stringify({ layers: r.spec.order, keys: r.spec.keys.length, expressions: r.spec.expressions.length, mattes: r.spec.mattes.length,
    layout: r.layout, timing: r.timing, markers: r.markers, duration: r.duration }, null, 1));
}
