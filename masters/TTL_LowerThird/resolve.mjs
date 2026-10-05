// TTL_LowerThird «Подпись спикера»: one master, three styles chosen by «Стиль» (D15):
//   1 «Титры» — the Titles pack (style-titles.mjs), 2 «Подкаст» — the podcast pack (style-podcast.mjs),
//   3 «Вебинар» — the webinars pack, static as there (style-webinar.mjs).
// Speed («Скорость», tools/masters/speed.mjs) and text size («Размер текста», anchored at the block's corner)
// are user requirements of 2026-10-05.
// The text fields (TXT_NAME, TXT_ROLE1, TXT_ROLE2) are shared; every style draws them with its own layers,
// fonts fixed per layer (no font switching by expression). Built from a declarative spec
// (tools/masters/jsx/build-spec.jsx). Provisional choices are listed in masters/TTL_LowerThird/README.md.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from '../../tools/dump/model.mjs';
import { workDir, workPath } from '../../tools/lib/work.mjs';
import { dumpKeys, toBuilderKeys } from '../../tools/masters/dump-keys.mjs';
import { nul, P, rectGroup, shape, Spec } from '../../tools/masters/spec.mjs';
import { regions, SPEED_CTRL, timeMapJs } from '../../tools/masters/speed.mjs';
import { addTitles, checkRise, FIT, layoutFrom, NAME, rigKeys, SIZE_CTRL, START } from './style-titles.mjs';
import { addPodcast, arrowShapes, podcastLayout, podcastRig } from './style-podcast.mjs';
import { addWebinar, webinarLayout } from './style-webinar.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');

export const ID = 'TTL_LowerThird';
export const COMP = 'CR_TTL_LowerThird';
const FPS = 25;
const DURATION = 6;
const IN_END = 1.64;           // the longest intro («Титры» role lines)
const OUT_START = 4.52;        // the longest exit («Подкаст», 1.48 s) ends on the last frame
// Calibrated against the AE ink of the pack texts (measure cases below, 2026-10-03): podcast plate =
// name ink + 25.8 px on the left (the pack's 1334.29 px), the role keeps the same right padding; webinar
// plates = ink + 16 px on the right (the pack: 13.95 / 16.41 / 17.25, hand-fitted). See README.
// roleClipDrop / roleClipRaise: the pack's role mask ends 3.3 px under the last role baseline (it cuts the
// descenders of Д, Ц, Щ in caps) and starts just above the caps (it cuts the breve of Й and the dots of Ё:
// the pack render shows ТЕХНИЧЕСКИИ). The band is 8 px lower and 12 px higher here, still clear of the name.
// roleRise: the pack's 94.5 px leaves the accents of a waiting first line (Й, Ё) inside the band before the
// words rise; 106 px keeps them under it.
// arrowZone: the upper role line of «Подкаст» stops this far from the plate edge of the double arrow (the
// arrow spans 31–78 px from the edge, plus a 20 px gap).
// nameRsb: the name is placed by its ink now; the pack's line ended 3.53 px after the ink (side bearing of «В»).
const PADS = { nameL: 25.8, roleR: 25.8, noRoleH: 133.45, webR: 16, roleClipDrop: 8, roleClipRaise: 12, roleRise: 106, arrowZone: 98, nameRsb: 3.53 };
const TIME_MAP = timeMapJs({ introEnd: IN_END, outroStart: OUT_START });

const r6 = (v) => Math.round(v * 1e6) / 1e6;

export function loadSources({ dumps = 'C:/CRBK/work/dumps', repo = REPO } = {}) {
  return {
    canon: readJson(path.join(dumps, 'titles', 'podpis_spikerov.json')),
    pod: readJson(path.join(dumps, 'podcast', 'podpis_spikera_1.json')),
    web: readJson(path.join(dumps, 'webinars', 'zastavka_so_spikerom.json')),
    metrics: JSON.parse(readFileSync(path.join(repo, 'masters', ID, 'source-metrics.json'), 'utf8')),
    tokens: JSON.parse(readFileSync(path.join(repo, 'brand', 'tokens.json'), 'utf8')),
  };
}

export function resolveLowerThird(sources = loadSources()) {
  const { canon, pod, web, metrics, tokens } = sources;
  const base = tokens.color.base;
  const hex = { black: base.black.hex, white: base.white.hex, green: base.green.hex, gray: base.gray.hex };
  const layout = layoutFrom(canon, metrics);
  checkRise(canon);
  const titlesRig = rigKeys(canon);
  const nameStart = toBuilderKeys(dumpKeys(canon, NAME, ...START));
  const podL = podcastLayout(pod);
  const podK = podcastRig(pod);
  const webL = webinarLayout(web);
  const textStyle = (size) => ({ font: layout.font, size, fill: hex.white, tracking: 0, justify: 'LEFT' });
  const text = {
    TXT_NAME: { value: 'Имя Фамилия', label: 'Имя', style: textStyle(layout.nameSize) },
    TXT_ROLE1: { value: 'Должность', label: 'Должность', style: textStyle(layout.roleSize) },
    TXT_ROLE2: { value: '', label: 'Должность, 2-я строка', style: textStyle(layout.roleSize) },
  };
  const ctrl = {
    Style: { label: 'Стиль', items: ['Титры', 'Подкаст', 'Вебинар'], value: 1 },
    Side: { label: 'Сторона', items: ['Слева', 'Справа'], value: 1 },
    Speed: SPEED_CTRL,
    Size: SIZE_CTRL,
  };
  const rig = { ...titlesRig, ...podK.rig };
  const reg = regions({ introEnd: IN_END, outroStart: OUT_START, duration: DURATION, fps: FPS });

  const spec = new Spec({ name: COMP, w: 1920, h: 1080, fps: FPS, duration: DURATION });
  addTitles(spec, { layout, rig: titlesRig, nameStart, text, hex, timeMap: TIME_MAP });
  addPodcast(spec, { layout: podL, arrows: arrowShapes(pod), keys: podK, hex, pads: PADS, timeMap: TIME_MAP });
  addWebinar(spec, { layout: webL, hex, pads: PADS, timeMap: TIME_MAP });
  const k = 'var k = Math.min(thisComp.width, thisComp.height) / 1080;\n';
  spec.add(shape('QA_PATCH', [rectGroup('Patch', hex.green)]));
  spec.expr('QA_PATCH', P.rectSize('Patch'), k + '[100 * k, 100 * k]');
  spec.expr('QA_PATCH', P.rectPos('Patch'), k + '[thisComp.width - 100 * k, 100 * k]');
  spec.expr('QA_PATCH', P.opacity, 'thisComp.layer("CTRL").effect("QA")(1).value * 100');
  // keyed sliders of the styles, then the Fit sliders (expressions only: the text size in use, see style-titles.mjs)
  spec.add(nul('RIG', [
    ...Object.keys(rig).map((name) => ({ kind: 'slider', name })),
    ...Object.values(FIT).map((name) => ({ kind: 'slider', name, value: 1 })),
  ], { shy: true }));
  for (const [name, keys] of Object.entries(rig)) spec.key('RIG', P.slider(name), keys);
  spec.add(nul('CTRL', [
    { kind: 'dropdown', name: 'Style', items: ctrl.Style.items, value: ctrl.Style.value },
    { kind: 'dropdown', name: 'Side', items: ctrl.Side.items, value: ctrl.Side.value },
    { kind: 'dropdown', name: 'Speed', items: ctrl.Speed.items, value: ctrl.Speed.value },
    { kind: 'dropdown', name: 'Size', items: ctrl.Size.items, value: ctrl.Size.value },
    { kind: 'checkbox', name: 'QA', value: false },
  ]));

  // AE lists the newest controller first: added in reverse of Имя, Должность, 2-я строка, Стиль, Сторона,
  // Скорость, Размер текста
  const egp = [{ effect: 'Size' }, { effect: 'Speed' }, { effect: 'Side' }, { effect: 'Style' }, { text: 'TXT_ROLE2' }, { text: 'TXT_ROLE1' }, { text: 'TXT_NAME' }];
  const pack = { TXT_NAME: 'Александр Стародубцев', TXT_ROLE1: 'Технический лидер', TXT_ROLE2: 'Cloud.ru' };
  const built = spec.toJSON();
  return {
    id: ID,
    workDir: workDir(),
    out: { dir: workPath('build', ID), aep: workPath('build', ID, ID + '_work.aep') },
    comp: spec.comp,
    hex,
    layout: { titles: layout, podcast: podL, webinar: webL },
    pads: PADS,
    text,
    ctrl,
    egp,
    rig,
    markers: reg.markers,
    duration: reg.duration,
    spec: {
      ...built,
      fonts: [layout.font, podL.name.font, podL.role.font, webL.font],
      markers: reg.markers,
      egp: egp.map((e) => (e.text ? { text: e.text, label: text[e.text].label } : { effect: e.effect, matchName: 'ADBE Dropdown Control', label: ctrl[e.effect].label })),
      egpNames: [text.TXT_NAME.label, text.TXT_ROLE1.label, text.TXT_ROLE2.label, ctrl.Style.label, ctrl.Side.label, ctrl.Speed.label, ctrl.Size.label],
      // the pack texts in every style, for the plate calibration and the README
      measure: [
        { name: 'titles', t: 2.0, ctrl: { Style: 1, Side: 1 }, text: pack, layers: ['PL_NAME', 'PL_ROLE', 'TXT_NAME', 'TXT_ROLE1', 'TXT_ROLE2'] },
        { name: 'podcast', t: 3.0, ctrl: { Style: 2, Side: 2 }, text: pack, layers: ['PL_POD', 'POD_NAME', 'POD_ROLE1', 'POD_ROLE2', 'ARROW_1', 'ARROW_2'] },
        { name: 'podcast_guest', t: 3.0, ctrl: { Style: 2, Side: 1 },
          text: { TXT_NAME: 'Анна-Мария Ёлкина', TXT_ROLE1: 'Руководитель облачной платформы', TXT_ROLE2: 'Cloud.ru' },
          layers: ['PL_POD', 'POD_NAME', 'POD_ROLE1', 'POD_ROLE2', 'ARROW_1', 'ARROW_2'] },
        { name: 'webinar', t: 3.0, ctrl: { Style: 3, Side: 1 }, text: { TXT_NAME: 'Александр Константинов', TXT_ROLE1: 'Технический эксперт', TXT_ROLE2: 'по облачным технологиям' },
          layers: ['PL_WEB1', 'PL_WEB2', 'PL_WEB3', 'WEB_L1', 'WEB_L2', 'WEB_L3'] },
      ],
      defaults: { text: { TXT_NAME: text.TXT_NAME.value, TXT_ROLE1: text.TXT_ROLE1.value, TXT_ROLE2: text.TXT_ROLE2.value }, ctrl: { Style: 1, Side: 1, Speed: 2, Size: 2 } },
    },
    check: { name: pack.TXT_NAME, role1: pack.TXT_ROLE1, role2: pack.TXT_ROLE2 },
    version: 1,
    variants: ['16x9', '16x9_4K', '9x16', '1x1'].map((key) => ({ key, ...tokens.video.formats[key] })),
    sweepTimes: [0, 0.2, 0.5, 0.9, 1.3, 2.0, 4.6, 5.0, 5.3, 5.7, 5.96],
    rest: 2.0,
  };
}

export const resolve = resolveLowerThird;

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = resolveLowerThird();
  console.log(JSON.stringify({ layers: r.spec.order, keys: r.spec.keys.length, expressions: r.spec.expressions.length, mattes: r.spec.mattes.length, layout: r.layout, rig: Object.keys(r.rig) }, null, 1).slice(0, 6000));
}
