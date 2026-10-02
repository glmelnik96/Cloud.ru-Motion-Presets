// TTL_LowerThird «Подпись спикера», style «Титры»: everything the AE builder needs, resolved in Node from
// the Titles pack dump («Подпись_спикеров»), the live text metrics of that comp (source-metrics.json) and
// brand/tokens.json. The pack canvas 1500x500 is laid out at UHD scale (name 100 px), so FHD = canvas / 2.
// Provisional choices (D4, D15, D19 not signed yet) are listed in masters/TTL_LowerThird/README.md.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPoint } from '../../tools/dump/geometry.mjs';
import { readJson } from '../../tools/dump/model.mjs';
import { workDir, workPath } from '../../tools/lib/work.mjs';
import { dumpKeys, dumpLayer, progressSegment, toBuilderKeys } from '../../tools/masters/dump-keys.mjs';
import { layerToCompAt, shapeBoxAt } from '../../tools/masters/dump-geometry.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');

export const ID = 'TTL_LowerThird';
export const COMP = 'CR_TTL_LowerThird';
const FPS = 25;
const DURATION = 6;
const REST = 2.0;              // the pack's hold is 1.52–4.28 s
const CANVAS_TO_FHD = 0.5;     // the pack canvas is UHD-scaled (assumption, see README)
const OUT_SHIFT = 0.48;        // the pack's exit (4.40–5.48 s) moved to end on the last frame (4.88–5.96 s)
const MARGIN = 100;            // block from the frame edge and the tallest block from the bottom, FHD px
// Plate right edge after the ink of the longest line, FHD px: the pack's hand-fitted plates give 13.17
// (name) and 13.82 (role) against the AE ink of the same texts (2026-10-03), so 13.5.
const PAD_R = 13.5;
const NAME = 'Александр Стародубцев';
const ROLE = ' Технический лидер Cloud.ru';
const START = ['ADBE Text Properties', 'ADBE Text Animators', 'ADBE Text Animator', 'ADBE Text Selectors', 'ADBE Text Selector', 'ADBE Text Percent Start'];

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const rgba = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => r6(c / 255)).concat(1);
};
const arr = (a) => '[' + a.join(', ') + ']';

export function loadSources({ dumps = 'C:/CRBK/work/dumps', repo = REPO } = {}) {
  return {
    canon: readJson(path.join(dumps, 'titles', 'podpis_spikerov.json')),
    metrics: JSON.parse(readFileSync(path.join(repo, 'masters', ID, 'source-metrics.json'), 'utf8')),
    tokens: JSON.parse(readFileSync(path.join(repo, 'brand', 'tokens.json'), 'utf8')),
  };
}

// Layout of the canonical title at rest in FHD pixels, relative to the name plate's top-left corner.
export function layoutFrom(canon, metrics) {
  const s = CANVAS_TO_FHD;
  const L = (n) => dumpLayer(canon, n);
  const name = shapeBoxAt(canon, L('Shape Layer 1'), REST);
  const role = shapeBoxAt(canon, L('Shape Layer 2'), REST);
  const at = (layerName, p) => applyPoint(layerToCompAt(canon, L(layerName), REST), p);
  const nm = metrics.layers[NAME].lines[0];
  const rl = metrics.layers[ROLE].lines;
  const nameOrigin = at(NAME, [nm[0], nm[1]]);
  const role1 = at(ROLE, [rl[1][0], rl[1][1]]);
  const role2 = at(ROLE, [rl[2][0], rl[2][1]]);
  const parentScale = Math.hypot(layerToCompAt(canon, L(NAME), REST)[0], 0);   // null 250 % -> 2.5
  return {
    name: { w: r6(name.w * s), h: r6(name.h * s) },
    role: { w: r6(role.w * s), h: r6(role.h * s), y: r6((role.y0 - name.y0) * s), x: r6((role.x0 - name.x0) * s) },
    gap: r6((role.y0 - name.y1) * s),
    textX: r6((nameOrigin[0] - name.x0) * s),
    nameBaseline: r6((nameOrigin[1] - name.y0) * s),
    roleBaselines: [r6((role1[1] - role.y0) * s), r6((role2[1] - role.y0) * s)],
    roleStep: r6((role2[1] - role1[1]) * s),
    nameSize: r6(metrics.layers[NAME].fontSize * parentScale * s),
    roleSize: r6(metrics.layers[ROLE].lineFontSize * parentScale * s),
    nameRise: r6(45 * parentScale * s),
    roleRise: r6(73.1 * parentScale * s),
    font: 'SBSansText-Regular',
    advance: { name: r6((nm[2] - nm[0]) * parentScale * s), role1: r6((rl[1][2] - rl[1][0]) * parentScale * s) },
  };
}

function checkRise(canon) {
  const pos = (n) => {
    const node = dumpLayer(canon, n).props.find((p) => p.matchName === 'ADBE Text Properties').children
      .find((c) => c.matchName === 'ADBE Text Animators').children[0].children
      .find((c) => c.matchName === 'ADBE Text Animator Properties').children
      .find((c) => c.matchName === 'ADBE Text Position 3D');
    return node.value[1];
  };
  return { name: pos(NAME), role: pos(ROLE) };
}

// Plate growth and collapse as 0..1 sliders; the white edges lead (intro) and trail (exit) by one frame,
// which is checked against the edge layers of the pack.
export function rigKeys(canon) {
  const scale = (n) => dumpKeys(canon, n, 'ADBE Transform Group', 'ADBE Scale');
  const name = scale('Shape Layer 1');
  const role = scale('Shape Layer 2');
  const nameOut = scale('Shape Layer 4');
  const roleOut = scale('Shape Layer 3');
  const lead = scale('Shape Layer 8')[0].time - name[0].time;
  const trail = scale('Shape Layer 6')[2].time - nameOut[2].time;
  const frame = 1 / FPS;
  if (Math.abs(lead + frame) > 1e-6 || Math.abs(trail - frame) > 1e-6) {
    throw new Error(`edges: expected to lead and trail by one frame, got ${lead} and ${trail}`);
  }
  const out = (keys) => progressSegment(keys, 2, { dim: 0, t0: r6(keys[2].time + OUT_SHIFT), t1: r6(keys[3].time + OUT_SHIFT) });
  return {
    NameIn: progressSegment(name, 0, { dim: 0 }),
    RoleIn: progressSegment(role, 0, { dim: 0 }),
    NameOut: out(nameOut),
    RoleOut: out(roleOut),
    RoleStart: toBuilderKeys(dumpKeys(canon, ROLE, ...START)),
    edgeFrames: 1,
  };
}

export function expressions(layout, colors) {
  const L = layout;
  const pre = [
    'var C = thisComp.layer("CTRL"), R = thisComp.layer("RIG");',
    'var k = Math.min(thisComp.width, thisComp.height) / 1080;',
    'var W = thisComp.width, H = thisComp.height, M = ' + MARGIN + ' * k;',
    'var right = C.effect("Side")(1).value == 2;',
    'function ink(n) { var r = thisComp.layer(n).sourceRectAtTime(0, false); return r.width > 0 ? r.left + r.width : 0; }',
    'var n = ink("TXT_NAME"), r1 = ink("TXT_ROLE1"), r2 = ink("TXT_ROLE2");',
    'var lines = (r1 > 0 ? 1 : 0) + (r2 > 0 ? 1 : 0);',
    `var TX = ${L.textX} * k, PR = ${PAD_R} * k;`,
    'var Wn = n > 0 ? Math.round((TX + n + PR) / k) * k : 0;',
    'var Wr = lines > 0 ? Math.round((TX + Math.max(r1, r2) + PR) / k) * k : 0;',
    `var Hn = ${L.name.h} * k, G = ${L.gap} * k, Hr2 = ${L.role.h} * k, STEP = ${L.roleStep} * k;`,
    'var Hr = lines == 2 ? Hr2 : (lines == 1 ? Hr2 - STEP : 0);',
    'var y0 = H - M - (Hn + G + Hr2);',
    'var xn = right ? W - M - Wn : M, xr = right ? W - M - Wr : M, yr = y0 + Hn + G;',
    'function sl(e, t) { return R.effect(e)(1).valueAtTime(t); }',
    'var d = thisComp.frameDuration;',
    // dark plate extents along x: grows from its start edge, collapses toward the other edge
    'function span(x, w, a, b) { return right ? [x + w * (1 - a), x + w * (1 - b)] : [x + w * b, x + w * a]; }',
  ].join('\n') + '\n';
  const plate = (x, w, h, y, inn, out) => ({
    size: pre + `var s = span(${x}, ${w}, sl("${inn}", time), sl("${out}", time));\n[Math.max(0, s[1] - s[0]), ${h}]`,
    pos: pre + `var s = span(${x}, ${w}, sl("${inn}", time), sl("${out}", time));\n[(s[0] + s[1]) / 2, ${y} + ${h} / 2]`,
  });
  // edge bands: during the intro the white leads by a frame; during the exit it trails by a frame
  const band = (x, w, h, y, inn, out, which) => {
    const body = which === 'in'
      ? `var a = sl("${inn}", time), b = sl("${inn}", time + d), o = sl("${out}", time);\n` +
        'var e0 = right ? [x0 + w0 * (1 - b), x0 + w0 * (1 - a)] : [x0 + w0 * a, x0 + w0 * b];\n' +
        'var on = b < 1 && o <= 0;\n'
      : `var a = sl("${out}", time), b = sl("${out}", time - d);\n` +
        'var e0 = right ? [x0 + w0 * (1 - a), x0 + w0 * (1 - b)] : [x0 + w0 * b, x0 + w0 * a];\n' +
        'var on = b > 0 && a < 1;\n';
    const head = pre + `var x0 = ${x}, w0 = ${w};\n` + body;
    return {
      size: head + `on ? [Math.max(0, e0[1] - e0[0]), ${h}] : [0, ${h}]`,
      pos: head + `[(e0[0] + e0[1]) / 2, ${y} + ${h} / 2]`,
    };
  };
  return {
    namePlate: plate('xn', 'Wn', 'Hn', 'y0', 'NameIn', 'NameOut'),
    rolePlate: plate('xr', 'Wr', 'Hr', 'yr', 'RoleIn', 'RoleOut'),
    nameEdgeIn: band('xn', 'Wn', 'Hn', 'y0', 'NameIn', 'NameOut', 'in'),
    nameEdgeOut: band('xn', 'Wn', 'Hn', 'y0', 'NameIn', 'NameOut', 'out'),
    roleEdgeIn: band('xr', 'Wr', 'Hr', 'yr', 'RoleIn', 'RoleOut', 'in'),
    roleEdgeOut: band('xr', 'Wr', 'Hr', 'yr', 'RoleIn', 'RoleOut', 'out'),
    namePos: pre + `[xn + TX, y0 + ${L.nameBaseline} * k]`,
    role1Pos: pre + `[xr + TX, yr + ${L.roleBaselines[0]} * k]`,
    // role 2 takes the first line when role 1 is empty
    role2Pos: pre + `[xr + TX, yr + (r1 > 0 ? ${L.roleBaselines[1]} : ${L.roleBaselines[0]}) * k]`,
    nameRise: `var k = Math.min(thisComp.width, thisComp.height) / 1080;\n[0, ${L.nameRise} * k, 0]`,
    roleRise: `var k = Math.min(thisComp.width, thisComp.height) / 1080;\n[0, ${L.roleRise} * k, 0]`,
    // the pack's role selector ran over three lines (an empty first one): line 2 moved while Start passed
    // 33.3-66.7 %, line 3 while it passed 66.7-100 %. Each role layer gets its own window of that Start.
    role1Start: 'var S = thisComp.layer("RIG").effect("RoleStart")(1).value;\nlinear(S, 100 / 3, 200 / 3, 0, 100)',
    role2Start: 'var S = thisComp.layer("RIG").effect("RoleStart")(1).value;\n' +
      'var first = thisComp.layer("TXT_ROLE1").sourceRectAtTime(0, false).width <= 0;\n' +
      'first ? linear(S, 100 / 3, 200 / 3, 0, 100) : linear(S, 200 / 3, 100, 0, 100)',
    plateFill: arr(colors.black),
    edgeFill: arr(colors.white),
    qaSize: 'var k = Math.min(thisComp.width, thisComp.height) / 1080;\n[100 * k, 100 * k]',
    qaPos: 'var k = Math.min(thisComp.width, thisComp.height) / 1080;\n[thisComp.width - 100 * k, 100 * k]',
    qaOpacity: 'thisComp.layer("CTRL").effect("QA")(1).value * 100',
  };
}

export function resolveLowerThird(sources = loadSources()) {
  const { canon, metrics, tokens } = sources;
  const layout = layoutFrom(canon, metrics);
  const rise = checkRise(canon);
  if (Math.abs(rise.name - 45) > 1e-6 || Math.abs(rise.role - 73.1) > 1e-6) throw new Error('animator offsets changed: ' + JSON.stringify(rise));
  const base = tokens.color.base;
  const colors = { black: rgba(base.black.hex), white: rgba(base.white.hex) };
  const nameStart = toBuilderKeys(dumpKeys(canon, NAME, ...START));
  return {
    id: ID,
    workDir: workDir(),
    out: { dir: workPath('build', ID), aep: workPath('build', ID, ID + '_work.aep') },
    comp: { name: COMP, w: 1920, h: 1080, fps: FPS, duration: DURATION },
    hex: { black: base.black.hex, white: base.white.hex, green: base.green.hex },
    layout,
    rig: rigKeys(canon),
    nameStart,
    text: {
      TXT_NAME: { value: 'Имя Фамилия', size: layout.nameSize, label: 'Имя', basedOn: 3 },
      TXT_ROLE1: { value: 'Должность', size: layout.roleSize, label: 'Должность', basedOn: 4 },
      TXT_ROLE2: { value: '', size: layout.roleSize, label: 'Должность, 2-я строка', basedOn: 4 },
    },
    ctrl: { Side: { label: 'Сторона', items: ['Слева', 'Справа'], value: 1 } },
    // the texts of the pack comp, for the rest-layout check and the golden comparison
    check: { name: 'Александр Стародубцев', role1: 'Технический лидер', role2: 'Cloud.ru' },
    // AE lists the newest controller first: added in reverse of Имя, Должность, 2-я строка, Сторона
    egp: [{ effect: 'Side' }, { text: 'TXT_ROLE2' }, { text: 'TXT_ROLE1' }, { text: 'TXT_NAME' }],
    markers: [
      { comment: 'in', time: 0, duration: 1.64 },
      { comment: 'out', time: r6(4.4 + OUT_SHIFT), duration: r6(DURATION - 4.4 - OUT_SHIFT) },
    ],
    expr: expressions(layout, colors),
    version: 1,
    variants: ['16x9', '16x9_4K', '9x16', '1x1'].map((key) => ({ key, ...tokens.video.formats[key] })),
    sweepTimes: [0, 0.2, 0.5, 0.9, 1.3, REST, 4.9, 5.3, 5.7, 5.96],
    rest: REST,
  };
}

export const resolve = resolveLowerThird;

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = resolveLowerThird();
  const { expr, ...rest } = r;
  console.log(JSON.stringify(rest, null, 2));
}
