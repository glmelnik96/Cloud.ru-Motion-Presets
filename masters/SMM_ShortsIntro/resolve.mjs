// SMM_ShortsIntro «Интро шортсов»: the vertical intro of the SMM pack «Заставка_9x16» (1080x1920, 24 fps in the
// pack, 25 here): a green card with the title of up to four lines, each rising into its own band two frames after
// the one above, a white card with the episode's video, the dark ground; at the end the bar wipe «Transition_gray»
// with the logo on its bars covers it all and opens onto the episode under the intro. The video is a Media
// Replacement slot (C28) whose default is the plain white card (D13: the pack's AI clip is not a default). A slot
// that takes video makes the master `trim` (C23): the panel cuts the clip and writes «Длительность» (C24), and the
// wipe plays at the clip's end. The wipe is the pack's own layer moved over (spec.transplant); the logo on it is
// the master logo (D18). Built from a declarative spec (tools/masters/jsx/build-spec.jsx); choices:
// masters/SMM_ShortsIntro/README.md.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPoint } from '../../tools/dump/geometry.mjs';
import { layerProp, readJson } from '../../tools/dump/model.mjs';
import { packProject } from '../../tools/dump/dump.mjs';
import { workDir, workPath } from '../../tools/lib/work.mjs';
import { layerToCompAt, restValueAt, shapeBoxAt } from '../../tools/masters/dump-geometry.mjs';
import { dumpLayer } from '../../tools/masters/dump-keys.mjs';
import { fitCube, masterLockup } from '../../tools/masters/logo.mjs';
import { addQaPatch, canonProgress, dumpSegment, HAS_TEXT_JS, START } from '../../tools/masters/rig-plate.mjs';
import { nul, P, pathGroup, precomp, rectGroup, shape, slot, Spec, text as textLayer } from '../../tools/masters/spec.mjs';
import { SPEED_CTRL, SPEEDS, timeMapJs } from '../../tools/masters/speed.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');

export const ID = 'SMM_ShortsIntro';
export const COMP = 'CR_SMM_ShortsIntro';
const FPS = 25;
const MAX_SEC = 15;            // trim (C23): the comp is the longest insert
const DEFAULT_SEC = 4;         // the pack's intro is over at 4.04 s
const PACK = { name: 'Заставка_9x16', w: 1080, h: 1920, layers: 12 };
const PACK_REST = 2.0;         // the lines at rest 1.21–3.54 s
const REST = 3.0;              // a moment of the hold at every speed: the ink of the lines is read there
const T = ['ADBE Transform Group'];
// the pack's lines top first, and the wipe's layer
const LINES = ['Как быстро создать ', 'Telegram-бота с AI', 'под обучение', 'сотрудников?'];
const WIPE = 'Transition_gray';
const LOGO = 'Cloud.ru_BlackMono';
export const TXT = ['TXT_LINE1', 'TXT_LINE2', 'TXT_LINE3', 'TXT_LINE4'];

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const mean = (list) => r6(list.reduce((s, v) => s + v, 0) / list.length);
const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();

export function loadSources({ dumps = 'C:/CRBK/work/dumps', repo = REPO } = {}) {
  return {
    intro: readJson(path.join(dumps, 'smm', 'zastavka_9x16.json')),
    logo: readJson(path.join(dumps, 'smm', 'cloud_ru_blackmono.json')),
    wipe: readJson(path.join(dumps, 'smm', 'transition_gray.json')),
    metrics: JSON.parse(readFileSync(path.join(repo, 'masters', ID, 'source-metrics.json'), 'utf8')),
    svg: readFileSync(path.join(repo, 'brand', 'logo', 'master-ae-motion-live.svg'), 'utf8'),
    tokens: JSON.parse(readFileSync(path.join(repo, 'brand', 'tokens.json'), 'utf8')),
  };
}

const fillOf = (layer) => {
  let c = null;
  const walk = (n) => { for (const x of n.children || []) { if (x.matchName === 'ADBE Vector Fill Color') c = x.value; walk(x); } };
  walk(layerProp(layer, 'ADBE Root Vectors Group'));
  return hex(c);
};

// The pack at rest, in its pixels (1080 wide: FHD of a vertical frame): the cards, the ground, the lines (origin,
// baselines, their bands), the logo's cube on the wipe.
export function introLayout({ intro, logo, metrics }) {
  const box = (name) => { const b = shapeBoxAt(intro, dumpLayer(intro, name), PACK_REST); return { x0: r6(b.x0), x1: r6(b.x1), y0: r6(b.y0), y1: r6(b.y1) }; };
  const green = box('Green_cube_1');
  const white = box('Green_cube_2');
  const rows = metrics.cases.find((c) => c.comp === PACK.name).layers;
  const lines = LINES.map((name) => {
    const L = dumpLayer(intro, name);
    const m = layerToCompAt(intro, L, PACK_REST);
    const row = rows[name];
    const band = L.masks[0].path.value.vertices.map((p) => applyPoint(m, p));
    return {
      origin: r6(applyPoint(m, [row.lines[0][0], 0])[0]),
      baseline: r6(applyPoint(m, [0, row.lines[0][1]])[1]),
      band: { y0: r6(Math.min(...band.map((p) => p[1]))), y1: r6(Math.max(...band.map((p) => p[1]))) },
      font: row.font, size: row.fontSize, tracking: row.tracking,
      rise: layerProp(L, 'ADBE Text Properties', 'ADBE Text Animators').children[0].children
        .find((c) => c.matchName === 'ADBE Text Animator Properties').children.find((c) => c.matchName === 'ADBE Text Position 3D').value[1],
      fill: hex(restValueAt(layerProp(L, 'ADBE Text Properties', 'ADBE Text Document'), PACK_REST).fillColor),
    };
  });
  const step = mean(lines.slice(1).map((l, i) => l.baseline - lines[i].baseline));
  // the logo comp at its layer (scale, anchor, position): the cube's box in the frame
  const LL = dumpLayer(intro, LOGO);
  const lm = layerToCompAt(intro, LL, 3.5);
  const cubeLayer = logo.layers.find((l) => fillOf(l) === '#26D07C');
  const cb = shapeBoxAt(logo, cubeLayer, 1);
  const a = applyPoint(lm, [cb.x0, cb.y0]);
  const b = applyPoint(lm, [cb.x1, cb.y1]);
  return {
    W: PACK.w, H: PACK.h,
    ground: hex(dumpLayer(intro, 'Dark Gray Solid 3').source.color || [0.133, 0.133, 0.133]),
    green: { ...green, fill: fillOf(dumpLayer(intro, 'Green_cube_1')) },
    white: { ...white, fill: fillOf(dumpLayer(intro, 'Green_cube_2')) },
    lines: {
      origin: mean(lines.map((l) => l.origin)), first: lines[0].baseline, step,
      above: mean(lines.map((l) => l.baseline - l.band.y0)), below: r6(Math.max(...lines.map((l) => l.band.y1 - l.baseline))),
      font: lines[0].font, size: lines[0].size, tracking: lines[0].tracking, fill: lines[0].fill, rise: lines[0].rise,
      // the room for a line: from the origin to the card's right edge less the left pad
      room: r6(green.x1 - lines[0].origin - (lines[0].origin - green.x0)),
      pack: lines.map((l, i) => LINES[i].trim()),
    },
    logo: { cube: { x0: r6(a[0]), y0: r6(a[1]), w: r6(b[0] - a[0]), h: r6(b[1] - a[1]) } },
  };
}

// The pack's curves: each line's rise (Start of its line selector, 23 frames at 24 fps) two frames after the one
// above; the wipe's time in the pack comp (its layer's span) and the moment the cards are cut under the bars.
export function introTiming({ intro }) {
  const keys = (name) => layerProp(dumpLayer(intro, name), ...START).keys;
  const k0 = keys(LINES[0]);
  const rise = { ...dumpSegment(k0, 0, { label: 'line rise' }), t0: 0 };
  const stagger = r6(keys(LINES[1])[0].time - k0[0].time);
  LINES.forEach((n, i) => {
    const d = keys(n)[0].time - k0[0].time;
    if (Math.abs(d - i * stagger) > 1e-3) throw new Error(`Заставка_9x16: line ${i + 1} starts at ${d}, not ${i * stagger}`);
  });
  const W = dumpLayer(intro, WIPE);
  const card = dumpLayer(intro, 'Green_cube_1');
  return {
    rise, stagger,
    introEnd: r6((LINES.length - 1) * stagger + rise.frames / FPS),
    wipe: { start: r6(W.inPoint), length: r6(W.outPoint - W.inPoint), cover: r6(card.outPoint - W.inPoint) },
  };
}

export function resolveIntro(sources = loadSources()) {
  const { svg, tokens } = sources;
  const base = tokens.color.base;
  const L = introLayout(sources);
  const tm = introTiming(sources);
  const Ln = L.lines;
  // D1: the pack's #FEFEFE card is the brand white
  const colors = { ground: base.black.hex, green: base.green.hex, white: base.white.hex, text: base.black.hex };
  for (const [got, want, what] of [[L.ground, colors.ground, 'ground'], [L.green.fill, colors.green, 'green card'], [Ln.fill, colors.text, 'title']]) {
    if (got !== want) throw new Error(`Заставка_9x16: ${what} ${got}, the brand has ${want}`);
  }
  const timeMap = timeMapJs({ introEnd: tm.introEnd, outroStart: null });
  const rig = { LineRise: canonProgress(tm.rise, 0) };
  // the library's intro and outro at the slowest speed, on the frame grid
  const slow = Math.min(...SPEEDS);
  const up = (s) => Math.ceil(r6((s / slow) * FPS)) / FPS;
  const duration = { introSec: r6(up(tm.introEnd)), holdSec: 0, outroSec: r6(up(tm.wipe.length)), maxSec: MAX_SEC };
  duration.holdSec = r6(DEFAULT_SEC - duration.introSec - duration.outroSec);
  if (!(duration.holdSec > 0)) throw new Error('the default length leaves no hold');

  const lineStyle = { font: Ln.font, size: Ln.size, fill: colors.text, tracking: Ln.tracking, justify: 'LEFT' };
  const text = {
    TXT_LINE1: { value: 'Заголовок шортса', label: 'Заголовок, строка 1', style: lineStyle },
    TXT_LINE2: { value: 'в несколько строк', label: 'Заголовок, строка 2', style: lineStyle },
    TXT_LINE3: { value: '', label: 'Заголовок, строка 3', style: lineStyle },
    TXT_LINE4: { value: '', label: 'Заголовок, строка 4', style: lineStyle },
  };
  const ctrl = {
    Speed: SPEED_CTRL,
    Duration: { label: 'Длительность (служебное, не менять)', kind: 'slider', value: DEFAULT_SEC },
  };
  const slots = { SLOT_VIDEO: { label: 'Видео' } };
  const lineSlots = js(TXT);

  const pre = [
    'var C = thisComp.layer("CTRL"), R = thisComp.layer("RIG");',
    'var k = Math.min(thisComp.width, thisComp.height) / 1080;',
    timeMap.trim(),
    'var TT = T(time);',
    'function sl(e, t) { return R.effect(e)(1).valueAtTime(t); }',
    // the clip's end (the panel writes it), the wipe at the chosen speed before it, the cards cut under the bars
    `var D = C.effect("Duration")(1).value, t0 = D - ${tm.wipe.length} / SPEED, cut = t0 + ${tm.wipe.cover} / SPEED;`,
  ].join('\n') + '\n';
  // the lines: empty ones collapse, the block shrinks to the card's room; each line rises into its band
  const linesPre = pre + [
    `var N = ${lineSlots};`,
    HAS_TEXT_JS,
    `function ink(n) { if (!hasText(n)) { return null; } var r = thisComp.layer(n).sourceRectAtTime(${REST}, false); return r.width > 0 ? { l: r.left / k, w: r.width / k } : null; }`,
    'var at = [], n = 0, m = 0;',
    'for (var i = 0; i < N.length; i++) { var e = ink(N[i]); at.push(e ? n : -1); if (e) { n++; m = Math.max(m, e.l + e.w); } }',
    `var f = m > ${Ln.room} ? ${Ln.room} / m : 1;`,
  ].join('\n') + '\n';
  const lineJs = (i) => linesPre + `var me = at[${i}], b = (${Ln.first} + Math.max(0, me) * ${Ln.step} * f) * k;\n`;
  // the selectors: the line's slot from the source texts, never their ink (rig-plate HAS_TEXT_JS)
  const slotJs = (i) => pre + HAS_TEXT_JS + '\n' + `var N = ${lineSlots}, me = -1, n = 0;\nfor (var i = 0; i < N.length; i++) { if (hasText(N[i])) { if (i == ${i}) { me = n; } n++; } }\n`;

  const spec = new Spec({ name: COMP, w: L.W, h: L.H, fps: FPS, duration: MAX_SEC });
  // bottom first: the ground, the green card, the video in the white card, the lines, the wipe, the logo on it
  const cut = pre + 'time < cut ? 100 : 0';
  spec.add(shape('GROUND', [rectGroup('Ground', colors.ground)]), shape('CARD', [rectGroup('Card', colors.green)]));
  spec.expr('GROUND', P.rectSize('Ground'), '[thisComp.width, thisComp.height]');
  spec.expr('GROUND', P.rectPos('Ground'), '[thisComp.width / 2, thisComp.height / 2]');
  const card = (b) => `var k = Math.min(thisComp.width, thisComp.height) / 1080;\n`;
  spec.expr('CARD', P.rectSize('Card'), card() + `[${r6(L.green.x1 - L.green.x0)} * k, ${r6(L.green.y1 - L.green.y0)} * k]`);
  spec.expr('CARD', P.rectPos('Card'), card() + `[${r6((L.green.x0 + L.green.x1) / 2)} * k, ${r6((L.green.y0 + L.green.y1) / 2)} * k]`);
  const ph = { name: 'CR_SMM_ShortsIntro_video', w: Math.round(L.white.x1 - L.white.x0), h: Math.round(L.white.y1 - L.white.y0) };
  ph.layers = [shape('Card', [pathGroup('Card', colors.white, [{ vertices: [[0, 0], [ph.w, 0], [ph.w, ph.h], [0, ph.h]], inTangents: [[0, 0], [0, 0], [0, 0], [0, 0]], outTangents: [[0, 0], [0, 0], [0, 0], [0, 0]], closed: true }])])];
  spec.add(slot('SLOT_VIDEO', ph));
  spec.expr('SLOT_VIDEO', P.pos, card() + `[${r6((L.white.x0 + L.white.x1) / 2)} * k, ${r6((L.white.y0 + L.white.y1) / 2)} * k]`);
  spec.expr('SLOT_VIDEO', P.scale, card() + `var s = 100 * k * ${r6(L.white.x1 - L.white.x0)} / ${ph.w};\n[s, s]`);
  for (const l of ['GROUND', 'CARD', 'SLOT_VIDEO']) spec.expr(l, P.opacity, cut);
  for (let i = TXT.length - 1; i >= 0; i -= 1) {
    spec.add(shape(`CL_LINE${i + 1}`, [rectGroup('Band', colors.green)]));
    spec.add(textLayer(TXT[i], { ...lineStyle, value: text[TXT[i]].value }, [{ name: 'Rise', basedOn: 4 }]));
  }
  for (let i = 0; i < TXT.length; i += 1) {
    const t = TXT[i];
    const j = lineJs(i);
    spec.expr(t, P.pos, j + `[${Ln.origin} * k, b]`);
    spec.expr(t, P.scale, j + '[100 * f, 100 * f]');
    spec.expr(t, P.rise(), 'var k = Math.min(thisComp.width, thisComp.height) / 1080;\n' + `[0, ${Ln.rise} * k, 0]`);
    // the pack's Start 0 -> 100 over the line: the whole line comes up; two frames after the line above
    spec.expr(t, P.start(), slotJs(i) + `me < 0 ? 100 : 100 * sl("LineRise", TT - me * ${tm.stagger})`);
    spec.expr(t, P.opacity, cut);
    // the band: from a leading above the baseline (any capital fits) to the pack's band bottom under it
    spec.expr(`CL_LINE${i + 1}`, P.rectSize('Band'), j + `me < 0 ? [0, 0] : [${r6(L.green.x1 - L.green.x0)} * k, (${Ln.step} + ${Ln.below}) * f * k]`);
    spec.expr(`CL_LINE${i + 1}`, P.rectPos('Band'), j + `[${r6((L.green.x0 + L.green.x1) / 2)} * k, b + (${Ln.below} - ${Ln.step}) * f * k / 2]`);
    spec.matte(t, `CL_LINE${i + 1}`, 'ALPHA', { keepVisible: false });
  }
  // the wipe: the pack's layer in its comp, played at the clip's end at the chosen speed
  spec.add(precomp('DECOR_WIPE', 'DECOR_WIPE', { timeRemap: true }));
  spec.expr('DECOR_WIPE', P.pos, '[thisComp.width / 2, thisComp.height / 2]');
  spec.expr('DECOR_WIPE', P.scale, `var s = 100 * Math.min(thisComp.width, thisComp.height) / ${PACK.w};\n[s, s]`);
  spec.expr('DECOR_WIPE', P.timeRemap, pre + `${tm.wipe.start} + Math.min(${r6(tm.wipe.length - 1 / FPS / 4)}, Math.max(0, (time - t0) * SPEED))`);
  // the logo on the bars: the master logo with its cube where the pack's is (onBlack: green cube, white wordmark)
  const fit = fitCube(svg, { x0: L.logo.cube.x0, y0: L.logo.cube.y0, w: L.logo.cube.w });
  const lockup = masterLockup(svg, fit);
  spec.add(shape('LOGO', [pathGroup('Wordmark', colors.white, lockup.wordmark), pathGroup('Cube', colors.green, lockup.cube)]));
  spec.expr('LOGO', P.scale, 'var k = Math.min(thisComp.width, thisComp.height) / 1080;\n[100 * k, 100 * k]');
  spec.matte('LOGO', 'DECOR_WIPE', 'ALPHA');
  addQaPatch(spec, colors.green);
  spec.add(nul('RIG', Object.keys(rig).map((name) => ({ kind: 'slider', name })), { shy: true }));
  for (const [name, keys] of Object.entries(rig)) spec.key('RIG', P.slider(name), keys);
  spec.add(nul('CTRL', [
    { kind: 'dropdown', name: 'Speed', items: ctrl.Speed.items, value: ctrl.Speed.value },
    { kind: 'slider', name: 'Duration', value: DEFAULT_SEC },
    { kind: 'checkbox', name: 'QA', value: false },
  ]));

  // AE lists the newest controller first: added in reverse of Видео, Заголовок 1–4, Скорость, Длительность
  const order = [{ slot: 'SLOT_VIDEO' }, ...TXT.map((t) => ({ text: t })), { effect: 'Speed' }, { effect: 'Duration', matchName: 'ADBE Slider Control' }];
  const egp = [...order].reverse();
  const label = (e) => (e.text ? text[e.text].label : e.slot ? slots[e.slot].label : ctrl[e.effect].label);
  const pack = Object.fromEntries(TXT.map((t, i) => [t, Ln.pack[i]]));
  const built = spec.toJSON();
  const keep = (name) => {
    const hit = sources.intro.layers.filter((l) => l.name === name);
    if (hit.length !== 1) throw new Error(`Заставка_9x16: ${hit.length} layers named ${name}`);
    return { index: hit[0].index, name };
  };
  return {
    id: ID,
    workDir: workDir(),
    out: { dir: workPath('build', ID), aep: workPath('build', ID, ID + '_work.aep') },
    comp: spec.comp,
    colors,
    layout: L,
    timing: tm,
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
      fonts: [Ln.font],
      markers: [],
      transplant: {
        aep: packProject('smm'),
        folder: 'BK_DECOR',
        source: PACK,
        comps: [{ name: 'DECOR_WIPE', keep: [keep(WIPE)] }],
      },
      egp: egp.map((e) => (e.text ? { text: e.text, label: label(e) } : e.slot ? { slot: e.slot, label: label(e) }
        : { effect: e.effect, matchName: e.matchName || 'ADBE Dropdown Control', label: label(e) })),
      egpNames: order.map(label),
      measure: [{ name: 'pack', t: REST, ctrl: {}, text: pack, layers: [...TXT, 'CL_LINE1', 'CL_LINE4', 'CARD', 'LOGO'] }],
      defaults: { text: Object.fromEntries(TXT.map((t) => [t, text[t].value])), ctrl: { Speed: 2, Duration: DEFAULT_SEC } },
    },
    check: {},
    version: 1,
    variants: ['9x16'].map((key) => ({ key, ...tokens.video.formats[key] })),
    sweepTimes: [0, 0.2, 0.5, 1.0, 1.3, 2.0, 3.0, 3.2, 3.5, 3.9, 7, 14.96],
    rest: REST,
  };
}

function js(v) {
  return JSON.stringify(v);
}

export const resolve = resolveIntro;

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = resolveIntro();
  console.log(JSON.stringify({ layers: r.spec.order, keys: r.spec.keys.length, expressions: r.spec.expressions.length, mattes: r.spec.mattes.length,
    layout: r.layout, timing: r.timing, duration: r.duration, egp: r.spec.egpNames, transplant: r.spec.transplant }, null, 1).slice(0, 6000));
}
