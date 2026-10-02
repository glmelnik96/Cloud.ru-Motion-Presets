// LOGO_Shot «Логошот с подписью»: everything the AE builder needs, resolved in Node from the pack dump
// (logo / «Умное облако», the canonical 16:9 lockup), the master logo SVG (D18) and brand/tokens.json.
// Provisional choices (decisions D5, D6, D19 not signed yet) are listed in masters/LOGO_Shot/README.md.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bbox, samplePolyline, transformSubpath } from '../../tools/dump/geometry.mjs';
import { readJson } from '../../tools/dump/model.mjs';
import { masterParts } from '../../tools/dump/logo-diff.mjs';
import { workDir, workPath } from '../../tools/lib/work.mjs';
import { dumpKeys, dumpLayer, progressSegment, toBuilderKeys } from '../../tools/masters/dump-keys.mjs';
import { layerToCompAt, shapeBoxAt, textBaselineAt } from '../../tools/masters/dump-geometry.mjs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');

export const ID = 'LOGO_Shot';
export const COMP = 'CR_LOGO_Shot';
const FPS = 25;
const DURATION = 5;          // 125 frames: the work area of the pack's logoshots, rounded to the frame grid
const REST = 3.0;            // inside the hold of «Умное облако» (2.12–3.32 s)
const OUTRO_START = 3.96;    // the pack's outro (3.32 s) moved so that it ends on the last frame
// Caption plate = ink + PAD_L + PAD_R, rounded to whole master pixels. Measured in the pack (hand-fitted
// plates): ink starts 27.2–27.5 px after the plate edge, ends 29.2–30.8 px before it; these two reproduce
// «есть где развернуться» exactly (485 px) and «облачные и ИИ-сервисы» within 1 px (534 vs 535).
const PAD_L = 27.5;
const PAD_R = 29.5;

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const rgba = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => r6(c / 255)).concat(1);
};
const arr = (a) => '[' + a.join(', ') + ']';

export function loadSources({ dumps = 'C:/CRBK/work/dumps', repo = REPO } = {}) {
  return {
    canon: readJson(path.join(dumps, 'logo', 'umnoe_oblako.json')),
    svg: readFileSync(path.join(repo, 'brand', 'logo', 'master-ae-motion-live.svg'), 'utf8'),
    tokens: JSON.parse(readFileSync(path.join(repo, 'brand', 'tokens.json'), 'utf8')),
  };
}

// Layout numbers of the canonical lockup at rest, relative to the logo plate (k = 1, FHD pixels).
export function layoutFrom(canon) {
  const L = (n) => dumpLayer(canon, n);
  const plate = shapeBoxAt(canon, L('Back_1'), REST);
  const capPlate = shapeBoxAt(canon, L('Back_2'), REST);
  const cube = shapeBoxAt(canon, L('LOGO'), REST);
  const word = shapeBoxAt(canon, L('Cloud.ru'), REST);
  const lock = { x0: Math.min(cube.x0, word.x0), y0: Math.min(cube.y0, word.y0), x1: Math.max(cube.x1, word.x1), y1: Math.max(cube.y1, word.y1) };
  const logo = L('LOGO');
  const m = layerToCompAt(canon, logo, REST);
  const anchor = logo.props.find((p) => p.matchName === 'ADBE Transform Group').children
    .find((c) => c.matchName === 'ADBE Anchor Point').value;
  const pivot = [m[0] * anchor[0] + m[2] * anchor[1] + m[4], m[1] * anchor[0] + m[3] * anchor[1] + m[5]];
  const text = textBaselineAt(canon, L('облачные и ИИ-сервисы'), REST);
  const pcx = (plate.x0 + plate.x1) / 2;
  const pcy = (plate.y0 + plate.y1) / 2;
  return {
    plate: { w: r6(plate.w), h: r6(plate.h) },
    gap: r6(capPlate.x0 - plate.x1),
    capPlateH: r6(capPlate.h),
    cube: { w: cube.w, h: cube.h, x0: cube.x0 - lock.x0, y0: cube.y0 - lock.y0 },
    word: { w: word.w, h: word.h, x0: word.x0 - lock.x0, y0: word.y0 - lock.y0 },
    lockup: { x0: r6(lock.x0 - plate.x0), y0: r6(lock.y0 - plate.y0), w: r6(lock.x1 - lock.x0), h: r6(lock.y1 - lock.y0) },
    pivot: { dx: r6(pivot[0] - pcx), dy: r6(pivot[1] - pcy), z: r6(anchor[2]), lx: r6(pivot[0] - lock.x0), ly: r6(pivot[1] - lock.y0) },
    caption: { dy: r6(text.baseline - pcy), fontPx: r6(text.fontPx), font: text.doc.font, tracking: text.doc.tracking },
  };
}

// The master logo SVG scaled so its cube equals the pack's cube; the lockup box starts at (0, 0).
export function lockupPaths(svg, layout) {
  const { parts } = masterParts(svg);
  const box = (sps) => bbox(sps.flatMap((s) => samplePolyline(s)));
  const cube = box(parts.cube);
  const word = box(parts.wordmark);
  const s = layout.cube.w / cube.w;
  const sw = layout.word.w / word.w;
  if (Math.abs(s - sw) > 1e-3) throw new Error(`lockup: cube scale ${s} and wordmark scale ${sw} differ`);
  const all = box(parts.cube.concat(parts.wordmark));
  const m = [s, 0, 0, s, -all.x0 * s, -all.y0 * s];
  const round = (sp) => ({
    closed: sp.closed,
    vertices: sp.vertices.map((p) => p.map(r6)),
    inTangents: sp.inTangents.map((p) => p.map(r6)),
    outTangents: sp.outTangents.map((p) => p.map(r6)),
  });
  const placed = (sps) => sps.map((sp) => round(transformSubpath(sp, m)));
  // Where the master puts cube and wordmark against the pack's copy (same lockup, D18).
  const cubeAt = [r6(cube.x0 * s - all.x0 * s), r6(cube.y0 * s - all.y0 * s)];
  const wordAt = [r6(word.x0 * s - all.x0 * s), r6(word.y0 * s - all.y0 * s)];
  return {
    scale: r6(s),
    cube: placed(parts.cube),
    wordmark: placed(parts.wordmark),
    size: [r6((all.x1 - all.x0) * s), r6((all.y1 - all.y0) * s)],
    drift: { cube: [r6(cubeAt[0] - layout.cube.x0), r6(cubeAt[1] - layout.cube.y0)], wordmark: [r6(wordAt[0] - layout.word.x0), r6(wordAt[1] - layout.word.y0)] },
  };
}

export function rigKeys(canon) {
  const back1Path = dumpKeys(canon, 'Back_1', 'ADBE Root Vectors Group', 'ADBE Vector Group', 'ADBE Vectors Group', 'ADBE Vector Shape - Group', 'ADBE Vector Shape');
  const back2Path = dumpKeys(canon, 'Back_2', 'ADBE Root Vectors Group', 'ADBE Vector Group', 'ADBE Vectors Group', 'ADBE Vector Shape - Group', 'ADBE Vector Shape');
  const back1X = dumpKeys(canon, 'Back_1', 'ADBE Transform Group', 'ADBE Position_0');
  const shift = OUTRO_START - back1Path[2].time;
  const end = (k) => r6(k.time + shift);
  const closeW = progressSegment(back1Path, 2, { t0: OUTRO_START, t1: end(back1Path[3]) });
  const closeCap = progressSegment(back2Path, 2, { t0: OUTRO_START, t1: end(back2Path[3]) });
  if (JSON.stringify(closeW) !== JSON.stringify(closeCap)) {
    throw new Error('rig: the caption plate closes with another curve than the logo plate; one CloseW slider is not enough');
  }
  return {
    Open: progressSegment(back1Path, 0),
    Slide: progressSegment(back1X, 0),
    Unroll: progressSegment(back2Path, 0),
    CloseW: closeW,
    CloseX: progressSegment(back1X, 2, { t0: OUTRO_START, t1: end(back1X[3]) }),
  };
}

// The cube flip: X Rotation of LOGO, first key moved from 1/3 s onto the frame grid (speeds rescaled).
export function flipKeys(canon) {
  const keys = dumpKeys(canon, 'LOGO', 'ADBE Transform Group', 'ADBE Rotate X');
  const times = keys.map((k) => Math.round(k.time * FPS) / FPS);
  return { inPoint: times[0], keys: toBuilderKeys(keys, { fps: FPS, times }) };
}

export function expressions(layout, colors, captions) {
  const P = layout.plate;
  const pre = [
    'var R = thisComp.layer("RIG");',
    'var k = Math.min(thisComp.width, thisComp.height) / 1080;',
    'var cx = thisComp.width / 2, cy = thisComp.height / 2;',
    `var LW = ${P.w} * k, LH = ${P.h} * k, GAP = ${layout.gap} * k, PADL = ${PAD_L} * k;`,
    'var ink = thisComp.layer("CAPTION").sourceRectAtTime(0, false);',
    // whole master pixels, then x k: the 4K variant lands on the same pixels as the pack's 4K render
    `var wc = Math.round(ink.width / k + ${PAD_L + PAD_R}) * k;`,
    'var Wt = LW + GAP + wc;',
    // the lockup starts on a whole pixel, so plate edges stay crisp in every variant
    'var L0 = Math.round(cx - Wt / 2);',
    'var open = R.effect("Open")(1).value, slide = R.effect("Slide")(1).value, unroll = R.effect("Unroll")(1).value;',
    'var closeW = R.effect("CloseW")(1).value, closeX = R.effect("CloseX")(1).value;',
    'var X = L0 + LW / 2 + (Wt / 2 - LW / 2) * (1 - slide) + (Wt / 2 - LW) * closeX;',
  ].join('\n') + '\n';
  const theme = 'thisComp.layer("CTRL").effect("Theme")(1).value';
  const bg = 'thisComp.layer("CTRL").effect("Background")(1).value';
  const k = 'var k = Math.min(thisComp.width, thisComp.height) / 1080;\n';
  const q = (s) => JSON.stringify(s);
  return {
    plateLogoSize: pre + 'var a = X - LW / 2 * open + LW * closeW, b = X + LW / 2 * open;\n[Math.max(0, b - a), LH]',
    plateLogoPos: pre + 'var a = X - LW / 2 * open + LW * closeW, b = X + LW / 2 * open;\n[(a + b) / 2, cy]',
    plateCapSize: pre + '[wc * unroll * (1 - closeW), LH]',
    plateCapPos: pre + 'var w = wc * unroll * (1 - closeW);\n[X + LW / 2 + GAP + w / 2, cy]',
    plateFill: `${theme} == 2 ? ${arr(colors.black)} : ${arr(colors.white)}`,
    lockupPos: pre + `[X + ${layout.pivot.dx} * k, cy + ${layout.pivot.dy} * k, ${layout.pivot.z} * k]`,
    lockupScale: k + '[100 * k, 100 * k, 100 * k]',
    wordFill: `${theme} == 2 ? ${arr(colors.white)} : ${arr(colors.black)}`,
    captionText: 'var c = thisComp.layer("CTRL").effect("Caption")(1).value;\n' +
      `c == 2 ? ${q(captions[1])} : (c == 3 ? ${q(captions[2])} : ${q(captions[0])})`,
    captionPos: pre + `[X + LW / 2 + GAP + PADL - ink.left, cy + ${layout.caption.dy} * k]`,
    captionFill: `${theme} == 2 ? ${arr(colors.white)} : ${arr(colors.black)}`,
    bgSize: '[thisComp.width, thisComp.height]',
    bgPos: '[thisComp.width / 2, thisComp.height / 2]',
    bgFill: `${bg} == 3 ? ${arr(colors.gray)} : ${arr(colors.black)}`,
    bgOpacity: `${bg} == 1 ? 0 : 100`,
    qaSize: k + '[100 * k, 100 * k]',
    qaPos: k + '[thisComp.width - 100 * k, 100 * k]',
    qaOpacity: 'thisComp.layer("CTRL").effect("QA")(1).value * 100',
    // AE's default camera (50 mm: zoom = width * 50 / 36) made explicit: a comp resized by script keeps the
    // default camera of its old size, and the flipping lockup lands off its plate (AE 26.5, seen 2026-10-03).
    cameraZoom: 'thisComp.width * 50 / 36',
    cameraPos: '[thisComp.width / 2, thisComp.height / 2, -thisComp.width * 50 / 36]',
    cameraPoi: '[thisComp.width / 2, thisComp.height / 2, 0]',
  };
}

export function resolveLogoShot(sources = loadSources()) {
  const { canon, svg, tokens } = sources;
  const layout = layoutFrom(canon);
  const lockup = lockupPaths(svg, layout);
  const base = tokens.color.base;
  const colors = { green: rgba(base.green.hex), black: rgba(base.black.hex), white: rgba(base.white.hex), gray: rgba(base.gray.hex) };
  const captions = [tokens.terms.descriptor.packages].concat(tokens.terms.slogans.values);
  return {
    id: ID,
    workDir: workDir(),
    out: { dir: workPath('build', ID), aep: workPath('build', ID, ID + '_work.aep') },
    comp: { name: COMP, w: 1920, h: 1080, fps: FPS, duration: DURATION },
    font: layout.caption.font,
    fontPx: layout.caption.fontPx,
    hex: { green: base.green.hex, black: base.black.hex, white: base.white.hex },
    layout,
    lockup,
    rig: rigKeys(canon),
    flip: flipKeys(canon),
    markers: [
      { comment: 'in', time: 0, duration: 2.12 },
      { comment: 'out', time: OUTRO_START, duration: r6(DURATION - OUTRO_START) },
    ],
    ctrl: {
      Caption: { label: 'Подпись', items: captions, value: 1 },
      Theme: { label: 'Тема', items: ['Светлая', 'Тёмная'], value: 1 },
      Background: { label: 'Фон', items: ['Прозрачный', 'Тёмный', 'Светлый'], value: 1 },
    },
    // Essential Graphics: AE lists the newest controller first (S1), so they are added in reverse of the
    // order the panel and Premiere should show (Подпись, Тема, Фон).
    egp: ['Background', 'Theme', 'Caption'],
    expr: expressions(layout, colors, captions),
    version: 1,
    // Formats (tokens.video.formats); 9x16 joins when its stacked layout is in the master.
    variants: ['16x9', '16x9_4K'].map((key) => ({ key, ...tokens.video.formats[key] })),
    sweepTimes: [0, 0.32, 0.6, 1, 1.5, 2.12, REST, OUTRO_START, 4.4, 4.96],
    rest: REST,
  };
}

export const resolve = resolveLogoShot;

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = resolveLogoShot();
  const { lockup, expr, ...rest } = r;
  console.log(JSON.stringify({ ...rest, lockup: { scale: lockup.scale, size: lockup.size, drift: lockup.drift, paths: lockup.cube.length + lockup.wordmark.length } }, null, 2));
  void require;
}
