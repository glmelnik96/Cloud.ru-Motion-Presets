// CRS_Subtitles «Субтитры» (AE only, D25): one or two lines of subtitles on dark plates, the AE side of the
// Premiere caption style «CR Субтитры». The lines are the courses pack's subtitle kit («Оверлей 16 на 9» and
// «3 на 2»: SB Sans Text Regular 35, white, tracking −32, centred, on the pack's two baselines); the plates are
// the Premiere style's background (#222222, measured on its frame), on the plate rig (tools/masters/rig-plate.mjs).
// Static: subtitles cut in and out with their layer. A trim master (C23): the comp is the longest insert, the
// panel cuts the layer to the length. Provisional choices: masters/CRS_Subtitles/README.md.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from '../../tools/dump/model.mjs';
import { applyPoint } from '../../tools/dump/geometry.mjs';
import { workDir, workPath } from '../../tools/lib/work.mjs';
import { layerToCompAt } from '../../tools/masters/dump-geometry.mjs';
import { dumpLayer } from '../../tools/masters/dump-keys.mjs';
import { layerProp } from '../../tools/dump/model.mjs';
import { addPlateBlock, addQaPatch } from '../../tools/masters/rig-plate.mjs';
import { nul, P, Spec } from '../../tools/masters/spec.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');

export const ID = 'CRS_Subtitles';
export const COMP = 'CR_CRS_Subtitles';
const FPS = 25;
const MAX_SEC = 300;           // the comp: the longest insert (C23)
const DEFAULT_SEC = 4;         // the length the panel proposes
const REST = 1.0;              // any moment: nothing moves
const PACK_T = 10;             // the pack's overlay is an hour long and still
export const LINES = ['SUBTITLES_1 строка', 'SUBTITLES_2 строка'];
// The Premiere style «CR Субтитры» (D25; docs/research/premiere-transfer-reply-2026-10-06.md): background
// #222222, «Size 10». On its frame (docs/research/premiere/captions-cr-style.png, SB Sans Text 35 px) the plate
// runs from 35.0 px over the baseline to 14.7 px under it and ends 9 px past the ink at both ends.
const STYLE_PLATE = { above: 35.0, below: 14.7, pad: 9 };
const MARGIN = 100;            // a longer line shrinks the block between these side margins (FHD)
const FIT = 'FitSubs';
const SLIDERS = { plateIn: 'SubsPlate', textIn: 'SubsText', textOut: 'SubsTextOut', plateOut: 'SubsPlateOut' };

const r6 = (v) => Math.round(v * 1e6) / 1e6;

export function loadSources({ dumps = 'C:/CRBK/work/dumps', repo = REPO } = {}) {
  return {
    overlay: readJson(path.join(dumps, 'courses', 'overley_16_na_9.json')),
    overlay32: readJson(path.join(dumps, 'courses', 'overley_3_na_2.json')),
    tokens: JSON.parse(readFileSync(path.join(repo, 'brand', 'tokens.json'), 'utf8')),
  };
}

// A subtitle line of the pack: its text style and where its glyphs stand. The pack lifts the glyphs by a
// baseline shift of 8 px over the layer's own baseline, so the visible baseline is the origin minus the shift.
function packLine(dump, name) {
  const L = dumpLayer(dump, name);
  const doc = layerProp(L, 'ADBE Text Properties', 'ADBE Text Document').value;
  const o = applyPoint(layerToCompAt(dump, L, PACK_T), [0, 0]);
  return {
    font: doc.font, size: doc.fontSize, tracking: doc.tracking, fill: doc.fillColor, justify: doc.justification,
    baseline: r6(o[1] - doc.baselineShift), x: r6(o[0]), text: doc.text,
  };
}

export function subtitlesLayout({ overlay, overlay32 }) {
  const lines = LINES.map((n) => packLine(overlay, n));
  const other = LINES.map((n) => packLine(overlay32, n));
  // both overlays carry the same kit
  lines.forEach((l, i) => {
    for (const k of ['font', 'size', 'tracking', 'baseline']) {
      if (l[k] !== other[i][k]) throw new Error(`subtitles: «${LINES[i]}» ${k} differs between the overlays: ${l[k]} / ${other[i][k]}`);
    }
  });
  const [a, b] = lines;
  for (const k of ['font', 'size', 'tracking', 'justify']) {
    if (a[k] !== b[k]) throw new Error(`subtitles: the lines differ in ${k}: ${a[k]} / ${b[k]}`);
  }
  if (a.justify !== 'CENTER_JUSTIFY') throw new Error(`subtitles: the pack's lines are no longer centred (${a.justify})`);
  const W = overlay.comp.width;
  const H = overlay.comp.height;
  return {
    font: a.font, size: a.size, tracking: a.tracking,
    baselines: [a.baseline, b.baseline],
    step: r6(b.baseline - a.baseline),
    // the pack's lines stand a few pixels left of the frame centre (its nulls were placed by hand)
    packCentre: [r6(a.x - W / 2), r6(b.x - W / 2)],
    h: r6(STYLE_PLATE.above + STYLE_PLATE.below),
    base: STYLE_PLATE.below,
    pad: STYLE_PLATE.pad,
    bottom: r6(H - (b.baseline + STYLE_PLATE.below)),
    margin: MARGIN,
  };
}

export function resolveSubtitles(sources = loadSources()) {
  const { tokens } = sources;
  const base = tokens.color.base;
  const hex = { black: base.black.hex, white: base.white.hex, green: base.green.hex };
  const L = subtitlesLayout(sources);
  const lineStyle = { font: L.font, size: L.size, fill: hex.white, tracking: L.tracking, justify: 'LEFT' };
  const text = {
    TXT_LINE1: { value: 'Текст субтитра', label: 'Строка 1', style: lineStyle },
    TXT_LINE2: { value: 'во вторую строку', label: 'Строка 2', style: lineStyle },
  };
  const ctrl = {};
  // still sliders: the plates stand grown, the words risen, at every moment
  const rig = { [SLIDERS.plateIn]: 1, [SLIDERS.textIn]: 1, [SLIDERS.textOut]: 0, [SLIDERS.plateOut]: 0 };
  const pad = `${L.pad} * kt`;
  const block = {
    auto: 2, fit: FIT, texts: ['TXT_LINE1', 'TXT_LINE2'], plates: ['PL_1', 'PL_2'],
    values: [text.TXT_LINE1.value, text.TXT_LINE2.value], textStyle: lineStyle, fill: hex.black, rest: REST,
    geo: { h: L.h, step: L.step, base: L.base, rise: 0, edge: String(L.margin), margin: String(L.margin), bottom: String(L.bottom), padL: pad, padR: pad },
    fromTop: false, timing: { inDelays: [0, 0], outStagger: 0 }, sliders: SLIDERS, textOut: 'start',
    // always centred; one line stands on the lower baseline
    place: {
      side: 'var side = 2;',
      bottom: '',
      left: 'function left(w) { return (W - w) / 2; }',
      avail: 'W - 2 * M',
    },
    sizeCtrl: false,
  };

  const spec = new Spec({ name: COMP, w: 1920, h: 1080, fps: FPS, duration: MAX_SEC });
  addPlateBlock(spec, block, 'function T(t) { return t; }\n');
  addQaPatch(spec, hex.green);
  spec.add(nul('RIG', [
    ...Object.entries(rig).map(([name, value]) => ({ kind: 'slider', name, value })),
    { kind: 'slider', name: FIT, value: 1 },
  ], { shy: true }));
  spec.add(nul('CTRL', [{ kind: 'checkbox', name: 'QA', value: false }]));

  // AE lists the newest controller first: added in reverse of Строка 1, Строка 2
  const egp = [{ text: 'TXT_LINE2' }, { text: 'TXT_LINE1' }];
  // the golden case runs on the pack's own lines, read from the dump (ref.json: "text": "pack")
  const pack = { TXT_LINE1: packLine(sources.overlay, LINES[0]).text, TXT_LINE2: packLine(sources.overlay, LINES[1]).text };
  const sample = { TXT_LINE1: 'Пишем текст, много текста', TXT_LINE2: 'и вторая строка' };
  const built = spec.toJSON();
  return {
    id: ID,
    workDir: workDir(),
    out: { dir: workPath('build', ID), aep: workPath('build', ID, ID + '_work.aep') },
    comp: spec.comp,
    hex,
    layout: L,
    timing: { still: true },
    text,
    ctrl,
    egp,
    rig: {},
    markers: [],
    duration: { introSec: 0, holdSec: DEFAULT_SEC, outroSec: 0, maxSec: MAX_SEC },
    spec: {
      ...built,
      fonts: [L.font],
      markers: [],
      egp: egp.map((e) => ({ text: e.text, label: text[e.text].label })),
      egpNames: [text.TXT_LINE1.label, text.TXT_LINE2.label],
      measure: [{ name: 'two', t: REST, ctrl: {}, text: sample, layers: ['PL_1', 'PL_2', 'TXT_LINE1', 'TXT_LINE2'] }],
      defaults: { text: { TXT_LINE1: text.TXT_LINE1.value, TXT_LINE2: text.TXT_LINE2.value }, ctrl: {} },
    },
    check: sample,
    pack,
    version: 1,
    variants: ['16x9', '16x9_4K'].map((key) => ({ key, ...tokens.video.formats[key] })),
    sweepTimes: [0, 1, 4, 150, 299.96],
    rest: REST,
  };
}

export const resolve = resolveSubtitles;

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = resolveSubtitles();
  console.log(JSON.stringify({ layers: r.spec.order, keys: r.spec.keys.length, expressions: r.spec.expressions.length, mattes: r.spec.mattes.length, layout: r.layout, egp: r.spec.egpNames }, null, 1));
}
