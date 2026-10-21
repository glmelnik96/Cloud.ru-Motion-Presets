// POD_Content «Окно контента»: a window in the podcast frame for a screenshot, a slide or a video — the grey
// box of the pack's «Контент_1» (left), «Контент_2» (right) and «Контент_3» (centre, with a caption under it),
// 3840x2160, FHD = / 2. The pack has no media in it (editors stacked their own over the box); the master
// puts a Media Replacement slot in the window (C28), the media whole or filling it, and the caption of
// «Контент_3» — the plate block of «Текст на плашке», style «Подкаст» — under any window. The window opens
// from its top edge on the signed canon M4 (D19: the content window's vertical reveal moves onto it). A slot
// that takes video makes the master `trim` (C23): its comp is the longest insert, the service slider
// Duration says where the clip ends (C24) and the outro plays there. The frame round it is POD_Frame.
// Built from a declarative spec (tools/masters/jsx/build-spec.jsx); choices: masters/POD_Content/README.md.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { layerProp, readJson } from '../../tools/dump/model.mjs';
import { workDir, workPath } from '../../tools/lib/work.mjs';
import { shapeBoxAt } from '../../tools/masters/dump-geometry.mjs';
import { dumpLayer } from '../../tools/masters/dump-keys.mjs';
import { addPlateBlock, addQaPatch, canonProgress, rigTimes, START } from '../../tools/masters/rig-plate.mjs';
import { nul, P, rectGroup, shape, slot, Spec } from '../../tools/masters/spec.mjs';
import { SPEED_CTRL, SPEEDS, timeMapJs } from '../../tools/masters/speed.mjs';
import { loadSources as plateSources } from '../TTL_Plate/resolve.mjs';
import { podcastLayout, podcastTiming } from '../TTL_Plate/plates.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');

export const ID = 'POD_Content';
export const COMP = 'CR_POD_Content';
const FPS = 25;
// trim (C23): the comp is the longest insert, 5 minutes of a slide or a video
const MAX_SEC = 300;
// the rig plays its exit to RIG_END; Duration (the clip's length) maps it to the clip's end (timeMapJs)
const RIG_END = 10;
const PACK_REST = 4.0;         // «Контент_1–3»: the window at rest 2.2–7.0 s
const REST = 4.0;              // a moment of the hold at every speed: the ink of the caption is read there
const SLOT = { name: 'CR_POD_Content_media', w: 3840, h: 2160 };
const CAPTION = ['TXT_1', 'TXT_2', 'TXT_3'];
const SLIDERS = { plateIn: 'CapPlateIn', textIn: 'CapTextIn', textOut: 'CapTextOut', plateOut: 'CapPlateOut' };
const FIT = 'FitCap';

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const near = (a, b, label, tol = 0.05) => {
  if (Math.abs(a - b) > tol) throw new Error(`${label}: ${a} against ${b}`);
  return r6(b);
};

export function loadSources({ dumps = 'C:/CRBK/work/dumps', repo = REPO } = {}) {
  return {
    left: readJson(path.join(dumps, 'podcast', 'kontent_1.json')),
    right: readJson(path.join(dumps, 'podcast', 'kontent_2.json')),
    centre: readJson(path.join(dumps, 'podcast', 'kontent_3.json')),
    plate: plateSources({ dumps, repo }),
  };
}

const boxOf = (dump, name) => {
  const b = shapeBoxAt(dump, dumpLayer(dump, name), PACK_REST);
  return { x0: b.x0 / 2, x1: b.x1 / 2, y0: b.y0 / 2, y1: b.y1 / 2 };
};

// The three windows at rest, FHD, against the frame's window (52.5–1867.5 × 51–1029): left and right in its
// top corners, 731 × 721; the centre one 692 square at the frame's centre. The caption of «Контент_3»: its
// first plate 50.7 px under the window.
export function contentLayout({ left, right, centre }) {
  const L = boxOf(left, 'Контент');
  const R = boxOf(right, 'Контент');
  const C = boxOf(centre, 'Контент');
  const side = {
    w: near(L.x1 - L.x0, R.x1 - R.x0, 'left and right widths', 0.01),
    h: near(L.y1 - L.y0, R.y1 - R.y0, 'left and right heights', 0.01),
    x0: near(L.x0, 52.5, 'left window edge'), x1: near(R.x1, 1867.5, 'right window edge'), y0: near(L.y0, 51, 'window top'),
  };
  const mid = { w: r6(C.x1 - C.x0), h: r6(C.y1 - C.y0), cx: near((C.x0 + C.x1) / 2, 960, 'centre window'), y0: near(C.y0, 51, 'centre window top') };
  const box1 = shapeBoxAt(centre, dumpLayer(centre, 'Box_1'), PACK_REST);
  let fill = null;
  const walk = (n) => { for (const c of n.children || []) { if (c.matchName === 'ADBE Vector Fill Color') fill = c.value; walk(c); } };
  walk(layerProp(dumpLayer(left, 'Контент'), 'ADBE Root Vectors Group'));
  return {
    side, mid,
    fill: '#' + fill.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase(),
    captionGap: r6(box1.y0 / 2 - C.y1),
  };
}

export function resolveContent(sources = loadSources()) {
  const { plate } = sources;
  const { tokens } = plate;
  const base = tokens.color.base;
  const L = contentLayout(sources);
  // the window in the pack's podcast grey (the user, 2026-10-21: «серым, как в пакете»); «Контент_3» drew
  // its box #CECECE, the same grey drifted
  const hex = { black: base.black.hex, green: base.green.hex, panel: L.fill };
  const podL = podcastLayout(plate);
  const podT = podcastTiming(plate.pod, tokens.motion);
  const M4 = tokens.motion.M4;
  // the caption as «Контент_3» plays it: its first plate 0.16 s after the window starts to open, the canon
  // curves of «Текст на плашке», the pack's own lags (text 0.2 s after its plate, the plate 0.08 s after it)
  const cap = captionTiming(sources.centre, podT);
  const capIn = cap.start;
  const capT = { ...podT, textLag: cap.textLag, plateLag: cap.plateLag };
  const times = rigTimes(capT, RIG_END);
  const win = { in: { ...M4.in, t0: 0 }, out: { ...M4.out, t0: r6(RIG_END - M4.out.frames / FPS) } };
  const introEnd = r6(Math.max(M4.in.frames / FPS, capIn + times.introEnd));
  const outroStart = r6(Math.min(win.out.t0, times.outroStart));
  const timeMap = timeMapJs({ introEnd, outroStart, end: 'thisComp.layer("CTRL").effect("Duration")(1).value', rigEnd: RIG_END });
  const rig = {
    WinIn: canonProgress(win.in, win.in.t0),
    WinOut: canonProgress(win.out, win.out.t0),
    [SLIDERS.plateIn]: canonProgress(capT.plateIn, capIn),
    [SLIDERS.textIn]: canonProgress(capT.textIn, r6(capIn + times.textIn)),
    [SLIDERS.textOut]: canonProgress(capT.textOut, times.textOut),
    [SLIDERS.plateOut]: canonProgress(capT.plateOut, times.plateOut),
  };
  // the library's intro and outro at the slowest speed, on the frame grid; the default insert is RIG_END long
  const slow = Math.min(...SPEEDS);
  const introSec = Math.ceil(r6((introEnd / slow) * FPS)) / FPS;
  const outroSec = Math.ceil(r6(((RIG_END - outroStart) / slow) * FPS)) / FPS;
  const duration = { introSec: r6(introSec), holdSec: r6(RIG_END - introSec - outroSec), outroSec: r6(outroSec), maxSec: MAX_SEC };

  const lineStyle = { font: podL.font, size: podL.size, fill: hex.black, tracking: podL.tracking, justify: 'LEFT', allCaps: true };
  const text = {
    TXT_1: { value: '', label: 'Подпись, строка 1', style: lineStyle },
    TXT_2: { value: '', label: 'Подпись, строка 2', style: lineStyle },
    TXT_3: { value: '', label: 'Подпись, строка 3', style: lineStyle },
  };
  const ctrl = {
    Side: { label: 'Сторона', items: ['Слева', 'Справа', 'По центру'], value: 1 },
    Fill: { label: 'Медиа в окне', items: ['Целиком', 'Заполнить'], value: 1 },
    Speed: SPEED_CTRL,
    Duration: { label: 'Длительность (служебное, не менять)', kind: 'slider', value: RIG_END },
  };
  const slots = { SLOT_MEDIA: { label: 'Медиа' } };

  // the window of the side at rest and its wipe from the top edge (canon M4 in and out)
  const winJs = [
    'var C = thisComp.layer("CTRL"), R = thisComp.layer("RIG");',
    'var k = Math.min(thisComp.width, thisComp.height) / 1080;',
    timeMap.trim(),
    'var TT = T(time);',
    'function sl(e, t) { return R.effect(e)(1).valueAtTime(t); }',
    'var sd = C.effect("Side")(1).value;',
    `var bw = (sd == 3 ? ${L.mid.w} : ${L.side.w}) * k, bh = (sd == 3 ? ${L.mid.h} : ${L.side.h}) * k;`,
    `var bx0 = sd == 1 ? ${L.side.x0} * k : (sd == 2 ? ${L.side.x1} * k - bw : ${L.mid.cx} * k - bw / 2), by0 = ${L.side.y0} * k;`,
    'var g = sl("WinIn", TT) * (1 - sl("WinOut", TT)), vh = bh * g;',
  ].join('\n') + '\n';

  const spec = new Spec({ name: COMP, w: 1920, h: 1080, fps: FPS, duration: MAX_SEC });
  spec.add(shape('PANEL', [rectGroup('Panel', hex.panel)]));
  spec.expr('PANEL', P.rectSize('Panel'), winJs + '[bw, vh]');
  spec.expr('PANEL', P.rectPos('Panel'), winJs + '[bx0 + bw / 2, by0 + vh / 2]');
  // the media: the slot's 16:9 frame (the media fills it, AE and Premiere) whole in the window or filling it,
  // at the window's centre, clipped to the window as it opens
  spec.add(slot('SLOT_MEDIA', SLOT));
  spec.expr('SLOT_MEDIA', P.pos, winJs + '[bx0 + bw / 2, by0 + bh / 2]');
  spec.expr('SLOT_MEDIA', P.scale, winJs + `var fx = bw / ${SLOT.w}, fy = bh / ${SLOT.h}, s = 100 * (C.effect("Fill")(1).value == 2 ? Math.max(fx, fy) : Math.min(fx, fy));\n[s, s]`);
  spec.matte('SLOT_MEDIA', 'PANEL');

  // the caption: «Текст на плашке», style «Подкаст», centred under the window, its first plate captionGap
  // under it; the block shrinks to the window's width
  const P0 = podL.pads;
  addPlateBlock(spec, {
    fit: FIT, sizeCtrl: false, texts: CAPTION, plates: ['PL_1', 'PL_2', 'PL_3'], values: ['', '', ''], textStyle: lineStyle, fill: hex.green, rest: REST,
    geo: {
      h: podL.h, step: podL.step, base: podL.base, rise: podL.rise,
      edge: String(podL.edge), margin: String(podL.edge), bottom: '0',
      padL: `${P0.center} * kt`, padR: `${P0.center} * kt`,
    },
    place: {
      side: 'var side = 2;',
      bottom: [
        'var sdw = C.effect("Side")(1).value;',
        `var cw = (sdw == 3 ? ${L.mid.w} : ${L.side.w}) * k, ch = (sdw == 3 ? ${L.mid.h} : ${L.side.h}) * k;`,
        `var cx0 = sdw == 1 ? ${L.side.x0} * k : (sdw == 2 ? ${L.side.x1} * k - cw : ${L.mid.cx} * k - cw / 2);`,
        `B0 = ${L.side.y0} * k + ch + ${L.captionGap} * k + (${podL.h} + Math.max(0, n - 1) * ${podL.step}) * kt;`,
      ].join(' '),
      left: 'function left(w) { return cx0 + (cw - w) / 2; }',
      avail: `(C.effect("Side")(1).value == 3 ? ${L.mid.w} : ${L.side.w}) * k`,
    },
    fromTop: true, timing: capT, sliders: SLIDERS, textOut: 'start',
  }, timeMap);
  addQaPatch(spec, hex.green);
  spec.add(nul('RIG', [...Object.keys(rig).map((name) => ({ kind: 'slider', name })), { kind: 'slider', name: FIT, value: 1 }], { shy: true }));
  for (const [name, keys] of Object.entries(rig)) spec.key('RIG', P.slider(name), keys);
  spec.add(nul('CTRL', [
    { kind: 'dropdown', name: 'Side', items: ctrl.Side.items, value: ctrl.Side.value },
    { kind: 'dropdown', name: 'Fill', items: ctrl.Fill.items, value: ctrl.Fill.value },
    { kind: 'dropdown', name: 'Speed', items: ctrl.Speed.items, value: ctrl.Speed.value },
    { kind: 'slider', name: 'Duration', value: RIG_END },
    { kind: 'checkbox', name: 'QA', value: false },
  ]));

  // AE lists the newest controller first: added in reverse of Медиа, Подпись 1–3, Сторона, Медиа в окне,
  // Скорость, Длительность
  const egp = [{ effect: 'Duration', matchName: 'ADBE Slider Control' }, { effect: 'Speed' }, { effect: 'Fill' }, { effect: 'Side' },
    ...[...CAPTION].reverse().map((t) => ({ text: t })), { slot: 'SLOT_MEDIA' }];
  const built = spec.toJSON();
  // the caption of «Контент_3» (the pack's placeholder words), for the comparison
  const pack = { TXT_1: 'текст появляется тут', TXT_2: 'Затем появляется тут', TXT_3: 'И тут, и так далее' };
  return {
    id: ID,
    workDir: workDir(),
    out: { dir: workPath('build', ID), aep: workPath('build', ID, ID + '_work.aep') },
    comp: spec.comp,
    hex,
    layout: { ...L, caption: podL },
    timing: { window: win, caption: { start: capIn, textLag: capT.textLag, plateLag: capT.plateLag, ...times }, introEnd, outroStart, rigEnd: RIG_END },
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
      fonts: [podL.font],
      markers: [],
      egp: egp.map((e) => (e.text ? { text: e.text, label: text[e.text].label }
        : e.slot ? { slot: e.slot, label: slots[e.slot].label }
          : { effect: e.effect, matchName: e.matchName || 'ADBE Dropdown Control', label: ctrl[e.effect].label })),
      egpNames: [slots.SLOT_MEDIA.label, ...CAPTION.map((t) => text[t].label), ctrl.Side.label, ctrl.Fill.label, ctrl.Speed.label, ctrl.Duration.label],
      measure: [{ name: 'caption', t: REST, ctrl: { Side: 3 }, text: pack, layers: [...CAPTION, 'PL_1', 'PL_2', 'PL_3', 'PANEL'] }],
      defaults: { text: { TXT_1: '', TXT_2: '', TXT_3: '' }, ctrl: { Side: 1, Fill: 1, Speed: 2, Duration: RIG_END } },
    },
    check: {},
    version: 1,
    variants: ['16x9', '16x9_4K'].map((key) => ({ key, ...tokens.video.formats[key] })),
    sweepTimes: [0, 0.4, 0.8, 1.2, 1.6, 2.0, 2.4, 3.0, 4.0, 8.6, 9.0, 9.4, 9.8, 9.96, 120, 299.96],
    rest: REST,
  };
}

// «Контент_3»: when its caption starts against its window (the window's mask, the first plate's Scale), the
// lags between each plate and its text (Start of the words); the delays and stagger are the rig's.
function captionTiming(dump, podT) {
  const win = dumpLayer(dump, 'Контент').masks[0].path.keys[0].time;
  const scale = (i) => layerProp(dumpLayer(dump, `Box_${i}`), 'ADBE Transform Group', 'ADBE Scale').keys;
  const words = (i) => layerProp(dumpLayer(dump, `Text_${i}`), ...START).keys;
  const plates = [1, 2, 3].map(scale);
  const texts = [1, 2, 3].map(words);
  const t0 = plates[0][0].time;
  const same = (list, label) => { if (list.some((v) => Math.abs(v - list[0]) > 1e-6)) throw new Error(`Контент_3: ${label} ${list.join(', ')}`); return r6(list[0]); };
  plates.forEach((k, i) => { if (Math.abs(k[0].time - t0 - podT.inDelays[i]) > 1e-6) throw new Error(`Контент_3: plate ${i + 1} delay ${k[0].time - t0}`); });
  return {
    start: r6(t0 - win),
    textLag: same(texts.map((k, i) => k[0].time - plates[i][0].time), 'text lags'),
    plateLag: same(texts.map((k, i) => plates[i][2].time - k[2].time), 'plate lags'),
  };
}

export const resolve = resolveContent;

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = resolveContent();
  console.log(JSON.stringify({ layers: r.spec.order, keys: r.spec.keys.length, expressions: r.spec.expressions.length, mattes: r.spec.mattes.length,
    layout: { side: r.layout.side, mid: r.layout.mid, fill: r.layout.fill, captionGap: r.layout.captionGap }, timing: r.timing, duration: r.duration, egp: r.spec.egpNames }, null, 1).slice(0, 5000));
}
