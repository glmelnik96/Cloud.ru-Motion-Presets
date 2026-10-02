// LOGO_Mark «Логотип без подписи»: the cube pops in the frame centre, shrinks to the left while the wordmark
// slides out from behind it; optional plate. Resolved in Node from the pack dumps «Логошот без саблайна» (A)
// and «…с плашкой» (B) — two animations with their own timing, chosen by the Plate checkbox — plus the
// master logo SVG (D18) and brand/tokens.json. Provisional choices are listed in masters/LOGO_Mark/README.md.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from '../../tools/dump/model.mjs';
import { workDir, workPath } from '../../tools/lib/work.mjs';
import { dumpKeys, dumpLayer, toBuilderKeys } from '../../tools/masters/dump-keys.mjs';
import { layerToCompAt, restValueAt, shapeBoxAt } from '../../tools/masters/dump-geometry.mjs';
import { fitCube, masterLockup } from '../../tools/masters/logo.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');

export const ID = 'LOGO_Mark';
export const COMP = 'CR_LOGO_Mark';
const FPS = 25;
const REST = 2.6;              // the pack holds 2.20–3.00 s
const DURATION = 3.6;          // intro 0–2.20, hold, outro 3.00–3.60 (new, provisional)
const OUTRO = { wipe: [3.0, 3.36], collapse: [3.2, 3.56] };
const PORTRAIT_SCALE = 1.35;   // the pack's 9:16 wrappers hold the FHD comp at 135 %
const CUBE = 'Layer 3 Outlines 2';
const WIPE = 'Shape Layer 1';
const PLATE = 'Подложка';
const T = ['ADBE Transform Group'];

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const rgba = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => r6(c / 255)).concat(1);
};
const arr = (a) => '[' + a.join(', ') + ']';
const snapTimes = (keys) => keys.map((k) => Math.round(k.time * FPS) / FPS);

export function loadSources({ dumps = 'C:/CRBK/work/dumps', repo = REPO } = {}) {
  return {
    a: readJson(path.join(dumps, 'logo', 'logoshot_bez_sablayna.json')),
    b: readJson(path.join(dumps, 'logo', 'logoshot_bez_sablayna_s_plashkoy.json')),
    svg: readFileSync(path.join(repo, 'brand', 'logo', 'master-ae-motion-live.svg'), 'utf8'),
    tokens: JSON.parse(readFileSync(path.join(repo, 'brand', 'tokens.json'), 'utf8')),
  };
}

const prop = (layer, ...mns) => {
  let nodes = layer.props;
  let cur = null;
  for (const mn of mns) {
    cur = (nodes || []).find((n) => n.matchName === mn);
    if (!cur) return null;
    nodes = cur.children;
  }
  return cur;
};
const val = (layer, ...mns) => prop(layer, ...mns).value;

// A rect shape layer of the pack in its parent's space: the rect (group position, size), the layer
// anchor / position / scale. Returns x0(sx), x1(sx), y0, y1 for a horizontal scale sx (fraction).
function rectInParent(layer, { scaleY }) {
  const g = layer.props.find((p) => p.matchName === 'ADBE Root Vectors Group').children[0];
  const vecs = g.children.find((c) => c.matchName === 'ADBE Vectors Group');
  const rect = vecs.children.find((c) => c.matchName === 'ADBE Vector Shape - Rect');
  const size = rect.children.find((c) => c.matchName === 'ADBE Vector Rect Size').value;
  const gpos = g.children.find((c) => c.matchName === 'ADBE Vector Transform Group').children
    .find((c) => c.matchName === 'ADBE Vector Position').value;
  const anchor = val(layer, ...T, 'ADBE Anchor Point');
  const pos = prop(layer, ...T, 'ADBE Position');
  const p = pos.keys ? pos.keys[0].value : pos.value;
  const lx0 = gpos[0] - size[0] / 2 - anchor[0];
  const lx1 = gpos[0] + size[0] / 2 - anchor[0];
  const ly0 = gpos[1] - size[1] / 2 - anchor[1];
  const ly1 = gpos[1] + size[1] / 2 - anchor[1];
  return { lx0: r6(lx0), lx1: r6(lx1), x: r6(p[0]), y0: r6(p[1] + ly0 * scaleY), y1: r6(p[1] + ly1 * scaleY) };
}

// Layout in the cube layer's own units ("L units"; the pack scales that layer 250-350-189 %).
export function layoutFrom(a, b, svg) {
  const cube = dumpLayer(a, CUBE);
  const m = layerToCompAt(a, cube, REST);
  const box = shapeBoxAt(a, cube, REST);
  const toL = (x, y) => [(x - m[4]) / m[0], (y - m[5]) / m[3]];
  const [x0, y0] = toL(box.x0, box.y0);
  const [x1, y1] = toL(box.x1, box.y1);
  const fit = fitCube(svg, { x0, y0, w: x1 - x0, h: y1 - y0 });
  const lock = masterLockup(svg, fit);
  const anchor = val(cube, ...T, 'ADBE Anchor Point').slice(0, 2);
  const wipeScale = val(dumpLayer(a, WIPE), ...T, 'ADBE Scale')[0] / 100;
  const wipe = rectInParent(dumpLayer(a, WIPE), { scaleY: wipeScale });
  const plateLayer = dumpLayer(b, PLATE);
  const plateScaleY = dumpKeys(b, PLATE, ...T, 'ADBE Scale')[0].value[1] / 100;
  const plate = rectInParent(plateLayer, { scaleY: plateScaleY });
  const y = restValueAt(prop(cube, ...T, 'ADBE Position_1'), REST);
  return {
    lockup: lock,
    fit,
    anchor: anchor.map(r6),
    cubeCentre: [r6((lock.boxes.cube.x0 + lock.boxes.cube.x1) / 2), r6((lock.boxes.cube.y0 + lock.boxes.cube.y1) / 2)],
    dy: r6(y - 540),
    // wipe rect (hides the wordmark, inverted matte): x0 = X + w0, x1 = X + w1 for the keyed X
    wipe: { w0: r6(wipe.lx0 * wipeScale), w1: r6(wipe.lx1 * wipeScale), y0: wipe.y0, y1: wipe.y1 },
    // plate: x0 = px + p0 * sx, x1 = px + p1 * sx for the keyed horizontal scale sx
    plate: { px: plate.x, p0: plate.lx0, p1: plate.lx1, y0: plate.y0, y1: plate.y1 },
  };
}

function scalarKeys(keys, dim) {
  return keys.map((k) => ({ ...k, value: k.value[dim], inEase: [k.inEase[dim]], outEase: [k.outEase[dim]] }));
}

// The pack's curves on 0..1-free sliders (real values: X offset from the frame centre in px at k = 1,
// scale in %, opacity, wipe X, plate scale in %), key times snapped to the frame grid, speeds rescaled.
export function animation(d, { withPlate }) {
  const x = dumpKeys(d, CUBE, ...T, 'ADBE Position_0');
  const s = scalarKeys(dumpKeys(d, CUBE, ...T, 'ADBE Scale'), 0);
  const o = dumpKeys(d, CUBE, ...T, 'ADBE Opacity');
  const w = dumpKeys(d, WIPE, ...T, 'ADBE Position_0');
  const out = {
    X: toBuilderKeys(x, { fps: FPS, times: snapTimes(x), b: -960 }),
    S: toBuilderKeys(s, { fps: FPS, times: snapTimes(s) }),
    O: toBuilderKeys(o, { fps: FPS, times: snapTimes(o) }),
    W: toBuilderKeys(w, { fps: FPS, times: snapTimes(w) }),
  };
  if (withPlate) {
    const p = scalarKeys(dumpKeys(d, PLATE, ...T, 'ADBE Scale'), 0);
    out.P = toBuilderKeys(p, { fps: FPS, times: snapTimes(p) });
  }
  return out;
}

function outroKeys(t0, t1, outInf, inInf) {
  return [
    { t: t0, v: 0, inType: 'BEZIER', outType: 'BEZIER', inEase: [[0, 33.333333]], outEase: [[0, outInf]] },
    { t: t1, v: 1, inType: 'BEZIER', outType: 'BEZIER', inEase: [[0, inInf]], outEase: [[0, 33.333333]] },
  ];
}

export function expressions(L, colors) {
  const [ax, ay] = L.anchor;
  const [ccx, ccy] = L.cubeCentre;
  const pre = [
    'var R = thisComp.layer("RIG"), C = thisComp.layer("CTRL");',
    'var W = thisComp.width, H = thisComp.height;',
    `var k = Math.min(W, H) / 1080 * (H > W ? ${PORTRAIT_SCALE} : 1), cx = W / 2, cy = H / 2;`,
    'function sv(n) { return R.effect(n)(1).value; }',
    'var B = C.effect("Plate")(1).value == 1;',
    'var X = B ? sv("X_B") : sv("X_A"), S = (B ? sv("S_B") : sv("S_A")) / 100;',
    'var wb = sv("WipeBack"), cl = sv("Collapse");',
    // the outro collapses toward the cube centre
    'var S1 = S * (1 - cl);',
    `var px = cx + (X + ${r6(ccx - ax)} * (S - S1)) * k, py = cy + (${L.dy} + ${r6(ccy - ay)} * (S - S1)) * k;`,
  ].join('\n') + '\n';
  const theme = 'thisComp.layer("CTRL").effect("Theme")(1).value';
  const bg = 'thisComp.layer("CTRL").effect("Background")(1).value';
  const k1 = 'var k = Math.min(thisComp.width, thisComp.height) / 1080;\n';
  return {
    position: pre + '[px, py]',
    scale: pre + '[100 * S1 * k, 100 * S1 * k]',
    cubeOpacity: 'var R = thisComp.layer("RIG"), B = thisComp.layer("CTRL").effect("Plate")(1).value == 1;\n' +
      '(B ? R.effect("O_B")(1).value : R.effect("O_A")(1).value)',
    // the wipe rect leaves the wordmark (inverted matte) as it moves; the outro moves it back
    wipeSize: pre + 'var wx = (B ? sv("W_B") : sv("W_A"));\n' +
      `var w0 = B ? ${'W_B_START'} : ${'W_A_START'};\n` +
      `wx = wx - (wx - w0) * wb;\n[${r6(L.wipe.w1 - L.wipe.w0)}, ${r6(L.wipe.y1 - L.wipe.y0)}]`,
    wipePos: pre + 'var wx = (B ? sv("W_B") : sv("W_A"));\n' +
      `var w0 = B ? ${'W_B_START'} : ${'W_A_START'};\n` +
      `wx = wx - (wx - w0) * wb;\n[wx + ${r6((L.wipe.w0 + L.wipe.w1) / 2)}, ${r6((L.wipe.y0 + L.wipe.y1) / 2)}]`,
    plateSize: pre + `var sx = B ? sv("P_B") / 100 * (1 - wb) : 0;\n[Math.max(0, ${r6(L.plate.p1 - L.plate.p0)} * sx), ${r6(L.plate.y1 - L.plate.y0)}]`,
    platePos: pre + `var sx = B ? sv("P_B") / 100 * (1 - wb) : 0;\n[${L.plate.px} + ${r6((L.plate.p0 + L.plate.p1) / 2)} * sx, ${r6((L.plate.y0 + L.plate.y1) / 2)}]`,
    plateFill: `${theme} == 2 ? ${arr(colors.black)} : ${arr(colors.white)}`,
    wordFill: `${theme} == 2 ? ${arr(colors.white)} : ${arr(colors.black)}`,
    bgSize: '[thisComp.width, thisComp.height]',
    bgPos: '[thisComp.width / 2, thisComp.height / 2]',
    bgFill: `${bg} == 3 ? ${arr(colors.gray)} : ${arr(colors.black)}`,
    bgOpacity: `${bg} == 1 ? 0 : 100`,
    qaSize: k1 + '[100 * k, 100 * k]',
    qaPos: k1 + '[thisComp.width - 100 * k, 100 * k]',
    qaOpacity: 'thisComp.layer("CTRL").effect("QA")(1).value * 100',
  };
}

export function resolveLogoMark(sources = loadSources()) {
  const { a, b, svg, tokens } = sources;
  const L = layoutFrom(a, b, svg);
  const A = animation(a, { withPlate: false });
  const Bk = animation(b, { withPlate: true });
  const base = tokens.color.base;
  const colors = { black: rgba(base.black.hex), white: rgba(base.white.hex), gray: rgba(base.gray.hex) };
  const expr = expressions(L, colors);
  for (const key of ['wipeSize', 'wipePos']) {
    expr[key] = expr[key].replace('W_A_START', String(A.W[0].v)).replace('W_B_START', String(Bk.W[0].v));
  }
  const rig = {
    X_A: A.X, S_A: A.S, O_A: A.O, W_A: A.W,
    X_B: Bk.X, S_B: Bk.S, O_B: Bk.O, W_B: Bk.W, P_B: Bk.P,
    WipeBack: outroKeys(OUTRO.wipe[0], OUTRO.wipe[1], 60, 60),
    Collapse: outroKeys(OUTRO.collapse[0], OUTRO.collapse[1], 70, 20),
  };
  return {
    id: ID,
    workDir: workDir(),
    out: { dir: workPath('build', ID), aep: workPath('build', ID, ID + '_work.aep') },
    comp: { name: COMP, w: 1920, h: 1080, fps: FPS, duration: DURATION },
    hex: { green: base.green.hex, black: base.black.hex, white: base.white.hex },
    layout: L,
    lockup: L.lockup,
    rig,
    markers: [
      { comment: 'in', time: 0, duration: 2.2 },
      { comment: 'out', time: OUTRO.wipe[0], duration: r6(DURATION - OUTRO.wipe[0]) },
    ],
    ctrl: {
      Plate: { label: 'Подложка', kind: 'checkbox', value: 1 },
      Theme: { label: 'Тема', items: ['Светлая', 'Тёмная'], value: 2 },
      Background: { label: 'Фон', items: ['Прозрачный', 'Тёмный', 'Светлый'], value: 1 },
    },
    egp: [{ effect: 'Background' }, { effect: 'Theme' }, { effect: 'Plate' }],
    expr,
    version: 1,
    variants: ['16x9', '16x9_4K', '9x16'].map((key) => ({ key, ...tokens.video.formats[key] })),
    sweepTimes: [0, 0.5, 1, 1.4, 1.76, 2.2, REST, 3.1, 3.3, 3.56],
    rest: REST,
  };
}

export const resolve = resolveLogoMark;

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = resolveLogoMark();
  const { expr, lockup, rig, ...rest } = r;
  console.log(JSON.stringify({ ...rest, layout: { ...rest.layout, lockup: lockup.boxes }, rig: Object.fromEntries(Object.entries(rig).map(([k, v]) => [k, v.map((x) => [x.t, x.v])])) }, null, 2));
}
