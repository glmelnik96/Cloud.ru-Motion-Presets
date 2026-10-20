// TTL_Plate «Текст на плашке»: up to three lines of text, each on its own plate, in two styles chosen by
// «Стиль»: 1 «Подкаст» (the podcast pack «Текст на плашке_1», «Булит») and 2 «SMM» (the SMM pack «Плашки»),
// placed by «Позиция» (Авто: the pack's side of the style; Слева / По центру / Справа). The second master on
// the plate rig of the speaker title (tools/masters/rig-plate.mjs): «Скорость» and «Размер текста» as there.
// The text fields (TXT_1..TXT_3) are the podcast style's own lines; the SMM lines copy them. Built from a
// declarative spec (tools/masters/jsx/build-spec.jsx); provisional choices: masters/TTL_Plate/README.md.
// buildPlate also makes TTL_PlateSwap, the same plates with a change of phrase (masters/TTL_PlateSwap).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from '../../tools/dump/model.mjs';
import { workDir, workPath } from '../../tools/lib/work.mjs';
import { addPlateBlock, addQaPatch, canonProgress, rigTimes, SIZE_CTRL } from '../../tools/masters/rig-plate.mjs';
import { nul, P, Spec } from '../../tools/masters/spec.mjs';
import { regions, SPEED_CTRL, timeMapJs } from '../../tools/masters/speed.mjs';
import { podcastLayout, podcastTiming, smmLayout, smmTiming } from './plates.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');

export const ID = 'TTL_Plate';
export const COMP = 'CR_TTL_Plate';
const FPS = 25;
// 8 s: a phrase of three lines stays readable for about 4 s at 1× (the pack's hold is 4.0 s); the editor
// stretches the clip in Premiere, the hold is static.
const DURATION = 8;
// a moment of the hold at every speed (0,75×: 2.84–5.04 s, 2×: 1.06–6.90 s): the ink of the lines is read there
const REST = 4.0;
const FIT = { podcast: 'FitPod', smm: 'FitSmm' };
const SLIDERS = {
  podcast: { plateIn: 'PodPlateIn', textIn: 'PodTextIn', textOut: 'PodTextOut', plateOut: 'PodPlateOut' },
  smm: { plateIn: 'SmmPlateIn', textIn: 'SmmTextIn', textOut: 'SmmTextOut', plateOut: 'SmmPlateOut' },
};
const SWAP_SLIDERS = {
  podcast: { swapOut: 'PodSwapOut', resize: 'PodResize', swapIn: 'PodSwapIn' },
  smm: { swapOut: 'SmmSwapOut', resize: 'SmmResize', swapIn: 'SmmSwapIn' },
};

const r6 = (v) => Math.round(v * 1e6) / 1e6;

export function loadSources({ dumps = 'C:/CRBK/work/dumps', repo = REPO } = {}) {
  return {
    pod: readJson(path.join(dumps, 'podcast', 'tekst_na_plashke_1.json')),
    bulit: readJson(path.join(dumps, 'podcast', 'bulit.json')),
    bulit1: readJson(path.join(dumps, 'podcast', 'bulit_1.json')),
    s916: readJson(path.join(dumps, 'smm', 'plashki_9x16.json')),
    s11: readJson(path.join(dumps, 'smm', 'plashki_1x1.json')),
    metrics: JSON.parse(readFileSync(path.join(repo, 'masters', ID, 'source-metrics.json'), 'utf8')),
    tokens: JSON.parse(readFileSync(path.join(repo, 'brand', 'tokens.json'), 'utf8')),
  };
}

// The RIG sliders of a style: progress 0..1 on the canon curves; the out keys belong to the line that
// leaves last (rigTimes).
function styleRig(names, timing, times) {
  return {
    [names.plateIn]: canonProgress(timing.plateIn, 0),
    [names.textIn]: canonProgress(timing.textIn, times.textIn),
    [names.textOut]: canonProgress(timing.textOut, times.textOut),
    [names.plateOut]: canonProgress(timing.plateOut, times.plateOut),
  };
}

// The change of phrase of a style: from `start` phrase 1 leaves line by line (its own exit curve, the style's
// out stagger), `gap` later each plate takes the width of phrase 2 (canon M1 resize) and phrase 2 rises with
// it (the style's in curve). Ends, for the last of three lines, at `end`.
function swapRig(names, timing, { start, gap, resize }) {
  const last = timing.inDelays.length - 1;
  return {
    keys: {
      [names.swapOut]: canonProgress(timing.textOut, start),
      [names.resize]: canonProgress(resize, start + gap),
      [names.swapIn]: canonProgress(timing.textIn, start + gap),
    },
    end: r6(start + gap + last * timing.outStagger + Math.max(resize.frames, timing.textIn.frames) / FPS),
  };
}

// swap: null (TTL_Plate) or { start } — the rig time phrase 1 starts to leave (TTL_PlateSwap).
export function buildPlate(sources, { id = ID, comp = COMP, duration = DURATION, rest = REST, swap = null } = {}) {
  const { pod, bulit, bulit1, s916, s11, metrics, tokens } = sources;
  const base = tokens.color.base;
  const hex = { black: base.black.hex, green: base.green.hex, yellow: base.yellow.hex };
  const canon = tokens.motion;
  const podL = podcastLayout({ pod, bulit, bulit1, metrics });
  const smmL = smmLayout({ s916, s11, metrics });
  const podT = podcastTiming(pod, canon);
  const smmT = smmTiming(s916, s11, canon);
  const podTimes = rigTimes(podT, duration);
  const smmTimes = rigTimes(smmT, duration);
  // the podcast pack has no change of phrase: both styles take the SMM pack's resize and gap
  const change = swap ? { start: swap.start, gap: smmT.swapGap, resize: smmT.resize } : null;
  const podSwap = change ? swapRig(SWAP_SLIDERS.podcast, podT, change) : null;
  const smmSwap = change ? swapRig(SWAP_SLIDERS.smm, smmT, change) : null;
  const introEnd = change ? Math.max(podSwap.end, smmSwap.end) : Math.max(podTimes.introEnd, smmTimes.introEnd);
  const outroStart = Math.min(podTimes.outroStart, smmTimes.outroStart);
  const timeMap = timeMapJs({ introEnd, outroStart });
  const reg = regions({ introEnd, outroStart, duration, fps: FPS });
  const rig = {
    ...styleRig(SLIDERS.podcast, podT, podTimes), ...styleRig(SLIDERS.smm, smmT, smmTimes),
    ...(change ? { ...podSwap.keys, ...smmSwap.keys } : {}),
  };

  const lineStyle = { font: podL.font, size: podL.size, fill: hex.black, tracking: podL.tracking, justify: 'LEFT', allCaps: true };
  const label = (phrase, i) => (change ? `Фраза ${phrase}: строка ${i}` : `Строка ${i}`);
  const text = {
    TXT_1: { value: change ? 'Первая фраза' : 'Текст на плашке', label: label(1, 1), style: lineStyle },
    TXT_2: { value: '', label: label(1, 2), style: lineStyle },
    TXT_3: { value: '', label: label(1, 3), style: lineStyle },
    ...(change ? {
      TXT2_1: { value: 'Вторая фраза', label: label(2, 1), style: lineStyle },
      TXT2_2: { value: '', label: label(2, 2), style: lineStyle },
      TXT2_3: { value: '', label: label(2, 3), style: lineStyle },
    } : {}),
  };
  const ctrl = {
    Style: { label: 'Стиль', items: ['Подкаст', 'SMM'], value: 1 },
    Position: { label: 'Позиция', items: ['Авто', 'Слева', 'По центру', 'Справа'], value: 1 },
    Speed: SPEED_CTRL,
    Size: SIZE_CTRL,
  };
  const P0 = podL.pads;
  const blocks = {
    podcast: {
      style: 1, auto: 3, fit: FIT.podcast, texts: ['TXT_1', 'TXT_2', 'TXT_3'], plates: ['PL_POD_1', 'PL_POD_2', 'PL_POD_3'],
      values: [text.TXT_1.value, text.TXT_2.value, text.TXT_3.value], textStyle: lineStyle, fill: hex.green, rest,
      geo: {
        h: podL.h, step: podL.step, base: podL.base, rise: podL.rise,
        edge: String(podL.edge), margin: String(podL.edge), bottom: `side == 2 ? ${podL.bottom.center} : ${podL.bottom.side}`,
        // the outer pad on the frame edge's side, the inner one toward the frame; centred lines: equal pads
        padL: `[${P0.outer}, ${P0.center}, ${P0.inner}][side - 1] * kt`,
        padR: `[${P0.inner}, ${P0.center}, ${P0.outer}][side - 1] * kt`,
      },
      fromTop: true, timing: podT, sliders: SLIDERS.podcast, textOut: 'start',
    },
    smm: {
      style: 2, auto: 1, fit: FIT.smm, texts: ['SMM_1', 'SMM_2', 'SMM_3'], plates: ['PL_SMM_1', 'PL_SMM_2', 'PL_SMM_3'],
      source: ['TXT_1', 'TXT_2', 'TXT_3'],
      textStyle: { font: smmL.font, size: smmL.size, fill: hex.yellow, tracking: smmL.tracking, justify: 'LEFT' },
      fill: hex.black, rest,
      geo: {
        h: smmL.h, step: smmL.step, base: smmL.base, rise: smmL.rise,
        edge: `vert ? ${smmL.edge.vertical} : ${smmL.edge.horizontal}`, margin: String(smmL.edge.vertical),
        bottom: `vert ? ${smmL.bottom.vertical} : ${smmL.bottom.horizontal}`,
        // «Слева» as the pack: the text at a fixed origin inside the plate; «Справа» mirrors it by the ink
        padL: `side == 1 ? ${smmL.origin} * kt + e.l : ${smmL.padR} * kt`,
        padR: `(side == 3 ? ${smmL.padInk} : ${smmL.padR}) * kt`,
      },
      fromTop: false, timing: smmT, sliders: SLIDERS.smm, textOut: 'end',
    },
  };
  if (change) {
    blocks.podcast.swap = { texts: ['TXT2_1', 'TXT2_2', 'TXT2_3'], values: [text.TXT2_1.value, '', ''], stagger: podT.outStagger };
    blocks.podcast.sliders = { ...SLIDERS.podcast, ...SWAP_SLIDERS.podcast };
    // pads(e) of SMM reads e.l of the line: phrase 2 lines bring their own
    blocks.smm.swap = { texts: ['SMM2_1', 'SMM2_2', 'SMM2_3'], source: ['TXT2_1', 'TXT2_2', 'TXT2_3'], stagger: smmT.outStagger };
    blocks.smm.sliders = { ...SLIDERS.smm, ...SWAP_SLIDERS.smm };
  }

  const spec = new Spec({ name: comp, w: 1920, h: 1080, fps: FPS, duration });
  addPlateBlock(spec, blocks.podcast, timeMap);
  addPlateBlock(spec, blocks.smm, timeMap);
  addQaPatch(spec, hex.green);
  // keyed sliders of the styles, then the Fit sliders (expressions only: the text size in use)
  spec.add(nul('RIG', [
    ...Object.keys(rig).map((name) => ({ kind: 'slider', name })),
    ...Object.values(FIT).map((name) => ({ kind: 'slider', name, value: 1 })),
  ], { shy: true }));
  for (const [name, keys] of Object.entries(rig)) spec.key('RIG', P.slider(name), keys);
  spec.add(nul('CTRL', [
    { kind: 'dropdown', name: 'Style', items: ctrl.Style.items, value: ctrl.Style.value },
    { kind: 'dropdown', name: 'Position', items: ctrl.Position.items, value: ctrl.Position.value },
    { kind: 'dropdown', name: 'Speed', items: ctrl.Speed.items, value: ctrl.Speed.value },
    { kind: 'dropdown', name: 'Size', items: ctrl.Size.items, value: ctrl.Size.value },
    { kind: 'checkbox', name: 'QA', value: false },
  ]));

  // AE lists the newest controller first: added in reverse of the lines (phrase 1, then phrase 2), Стиль,
  // Позиция, Скорость, Размер текста
  const fields = change ? ['TXT_1', 'TXT_2', 'TXT_3', 'TXT2_1', 'TXT2_2', 'TXT2_3'] : ['TXT_1', 'TXT_2', 'TXT_3'];
  const egp = [{ effect: 'Size' }, { effect: 'Speed' }, { effect: 'Position' }, { effect: 'Style' }, ...fields.slice().reverse().map((t) => ({ text: t }))];
  const pack = {
    podcast: { TXT_1: 'текст появляется тут', TXT_2: 'Затем появляется тут', TXT_3: 'И тут, и так далее' },
    bulit: { TXT_1: 'Через несколько лет знание синтаксиса', TXT_2: 'Перестанет быть нужным', TXT_3: '' },
    smm: { TXT_1: 'Разверните свой сервис', TXT_2: 'видеоконференций', TXT_3: '' },
    ...(change ? { smm2: { TXT2_1: 'На виртуальной машине', TXT2_2: 'Cloud.ru Evolution', TXT2_3: '' } } : {}),
  };
  const empty2 = change ? { TXT2_1: '', TXT2_2: '', TXT2_3: '' } : {};
  const built = spec.toJSON();
  return {
    id,
    workDir: workDir(),
    out: { dir: workPath('build', id), aep: workPath('build', id, id + '_work.aep') },
    comp: spec.comp,
    hex,
    layout: { podcast: podL, smm: smmL },
    timing: { podcast: { ...podT, times: podTimes }, smm: { ...smmT, times: smmTimes }, introEnd, outroStart, ...(change ? { change } : {}) },
    text,
    ctrl,
    egp,
    rig,
    markers: reg.markers,
    duration: reg.duration,
    spec: {
      ...built,
      fonts: [podL.font, smmL.font],
      markers: reg.markers,
      egp: egp.map((e) => (e.text ? { text: e.text, label: text[e.text].label } : { effect: e.effect, matchName: 'ADBE Dropdown Control', label: ctrl[e.effect].label })),
      egpNames: [...fields.map((t) => text[t].label), ctrl.Style.label, ctrl.Position.label, ctrl.Speed.label, ctrl.Size.label],
      // the pack texts in both styles (FHD master), for the README; phrase 1 is at rest at 3 s
      measure: [
        { name: 'podcast_right', t: 3.0, ctrl: { Style: 1, Position: 1 }, text: { ...pack.podcast, ...empty2 }, layers: ['PL_POD_1', 'PL_POD_2', 'PL_POD_3', 'TXT_1', 'TXT_2', 'TXT_3'] },
        { name: 'podcast_centre', t: 3.0, ctrl: { Style: 1, Position: 3 }, text: { ...pack.bulit, ...empty2 }, layers: ['PL_POD_1', 'PL_POD_2', 'TXT_1', 'TXT_2'] },
        { name: 'smm_left', t: 3.0, ctrl: { Style: 2, Position: 1 }, text: { ...pack.smm, ...empty2 }, layers: ['PL_SMM_1', 'PL_SMM_2', 'SMM_1', 'SMM_2'] },
      ],
      defaults: { text: Object.fromEntries(fields.map((t) => [t, text[t].value])), ctrl: { Style: 1, Position: 1, Speed: 2, Size: 2 } },
    },
    check: pack,
    version: 1,
    variants: ['16x9', '16x9_4K', '9x16', '1x1'].map((key) => ({ key, ...tokens.video.formats[key] })),
    sweepTimes: change
      ? [0, 0.5, 1.3, 2.1, 3.0, 4.2, 4.6, 5.0, 5.4, 5.8, 6.2, rest, 10.0, 10.4, 10.8, 11.2, 11.6, r6(duration - 1 / FPS)]
      : [0, 0.2, 0.5, 0.9, 1.3, 1.7, 2.1, 4.0, 5.9, 6.3, 6.7, 7.1, 7.5, 7.96],
    rest,
  };
}

export function resolvePlate(sources = loadSources()) {
  return buildPlate(sources);
}

export const resolve = resolvePlate;

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = resolvePlate();
  console.log(JSON.stringify({ layers: r.spec.order, keys: r.spec.keys.length, expressions: r.spec.expressions.length, mattes: r.spec.mattes.length,
    layout: r.layout, timing: r.timing, markers: r.markers, duration: r.duration }, null, 1));
}
