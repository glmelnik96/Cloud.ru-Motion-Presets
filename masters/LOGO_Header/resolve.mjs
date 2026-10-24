// LOGO_Header «Шапка с логотипом»: the brand header over a video — the logo, the running hatching and the descriptor
// «облачные и ИИ-сервисы» — from the webinars pack's «Логоблок с челкой» (the courses covers carry the same header),
// for 16:9 (FHD and 4K) and 9:16 (spec 5: T1 `trim`, «дескриптор вкл/выкл»).
// - The hatching is the canon M11 (the repeater's offset -100 + time·0.5: half a line a second): its lines drawn once
//   and the layer moved by the fraction of a line, which is the same picture without a seam at any length.
// - Its window runs from the logo to the descriptor, or to the right margin when the descriptor is off; on 9:16 the
//   descriptor keeps the 16:9 right margin and the window is shorter.
// - The logo is the master logo (D18) where the pack has its own.
// Built from a declarative spec (tools/masters/jsx/build-spec.jsx); choices: masters/LOGO_Header/README.md.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPoint } from '../../tools/dump/geometry.mjs';
import { layerProp, readJson } from '../../tools/dump/model.mjs';
import { workDir, workPath } from '../../tools/lib/work.mjs';
import { layerToCompAt, restValueAt, shapeBoxAt } from '../../tools/masters/dump-geometry.mjs';
import { dumpLayer } from '../../tools/masters/dump-keys.mjs';
import { fitCube, masterLockup } from '../../tools/masters/logo.mjs';
import { addQaPatch } from '../../tools/masters/rig-plate.mjs';
import { nul, P, pathGroup, rectGroup, shape, Spec, strokeGroup, text as textLayer } from '../../tools/masters/spec.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');

export const ID = 'LOGO_Header';
export const COMP = 'CR_LOGO_Header';
const FPS = 25;
const MAX_SEC = 900;           // trim (C23): the comp is the longest insert, 15 min
const DEFAULT_SEC = 10;
const PACK_T = 0;
const HEADER = 'Логоблок с челкой';
const HATCH = 'Shape Layer 4';
const WINDOW = 'Shape Layer 5';
const DESCRIPTOR = 'облачные  и ИИ-сервисы';
const V_JS = 'var V = thisComp.height > thisComp.width;';

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();

export function loadSources({ dumps = 'C:/CRBK/work/dumps', repo = REPO } = {}) {
  const web = (f) => readJson(path.join(dumps, 'webinars', f + '.json'));
  return {
    header: web('logoblok_s_chelkoy'),
    logo: web('logo'),
    // the descriptor's ink was measured with the webinar screens (masters/WEB_Screen/source-metrics.json)
    metrics: JSON.parse(readFileSync(path.join(repo, 'masters', 'WEB_Screen', 'source-metrics.json'), 'utf8')),
    svg: readFileSync(path.join(repo, 'brand', 'logo', 'master-ae-motion-live.svg'), 'utf8'),
    tokens: JSON.parse(readFileSync(path.join(repo, 'brand', 'tokens.json'), 'utf8')),
  };
}

const find = (node, mn, out = []) => {
  if (node.enabled !== false && node.matchName === mn) out.push(node);
  if (node.enabled !== false) for (const c of node.children || []) find(c, mn, out);
  return out;
};
const scaleOf = (m) => r6(Math.hypot(m[0], m[1]));

// The header in the pack's FHD frame: the hatching's line, step, stroke, drift and window; the descriptor; the cube.
export function headerLayout({ header, logo, metrics }) {
  if (header.comp.name !== HEADER || header.comp.width !== 1920 || header.comp.height !== 1080) throw new Error('the logo block changed');
  const H = dumpLayer(header, HATCH);
  const hm = layerToCompAt(header, H, PACK_T);
  const s = scaleOf(hm);
  const root = layerProp(H, 'ADBE Root Vectors Group');
  const pathNode = find(root, 'ADBE Vector Shape')[0];
  const line = restValueAt(pathNode, PACK_T).vertices;
  const groupPos = find(root, 'ADBE Vector Position')[0].value;
  const rep = find(root, 'ADBE Vector Filter - Repeater')[0];
  const repStep = rep.children.find((c) => c.matchName === 'ADBE Vector Repeater Transform').children.find((c) => c.matchName === 'ADBE Vector Repeater Position').value;
  const offset = rep.children.find((c) => c.matchName === 'ADBE Vector Repeater Offset');
  if (!offset.expression || offset.expression.text.replace(/\s/g, '') !== '-100+time*0.5') throw new Error(`the hatching's offset is ${offset.expression && offset.expression.text}, not M11`);
  if (line.length !== 2 || line[0][0] !== line[1][0] || repStep[1] !== 0) throw new Error('the hatching is no longer vertical lines in a row');
  const a = applyPoint(hm, [line[0][0] + groupPos[0], line[0][1] + groupPos[1]]);
  const b = applyPoint(hm, [line[1][0] + groupPos[0], line[1][1] + groupPos[1]]);
  const stroke = find(root, 'ADBE Vector Stroke Width')[0].value;
  const strokeColour = hex(find(root, 'ADBE Vector Stroke Color')[0].value);
  const win = shapeBoxAt(header, dumpLayer(header, WINDOW), PACK_T);
  // the descriptor: two lines, its ink (measured live) through its layer
  const D = dumpLayer(header, DESCRIPTOR);
  const dm = layerToCompAt(header, D, PACK_T);
  const ds = scaleOf(dm);
  const o = applyPoint(dm, [0, 0]);
  const row = metrics.cases.find((c) => c.comp === HEADER).layers[String(D.index)];
  const doc = restValueAt(layerProp(D, 'ADBE Text Properties', 'ADBE Text Document'), PACK_T);
  // the cube of the pack's logo in the frame: the master logo's goes there
  const LL = dumpLayer(header, 'Logo');
  const lm = layerToCompAt(header, LL, PACK_T);
  const cubeL = logo.layers.find((l) => hex(find(layerProp(l, 'ADBE Root Vectors Group'), 'ADBE Vector Fill Color')[0].value) === '#26D07C');
  const cb = shapeBoxAt(logo, cubeL, 1);
  const ca = applyPoint(lm, [cb.x0, cb.y0]);
  const cz = applyPoint(lm, [cb.x1, cb.y1]);
  const ink = { x0: r6(o[0] + row.rect[0] * ds), x1: r6(o[0] + (row.rect[0] + row.rect[2]) * ds) };
  return {
    W: header.comp.width, H: header.comp.height,
    hatch: {
      base: r6(a[0]), y0: r6(Math.min(a[1], b[1])), y1: r6(Math.max(a[1], b[1])), step: r6(repStep[0] * s), width: r6(stroke * s), colour: strokeColour,
      speed: 0.5,
      window: { x0: r6(win.x0), y0: r6(win.y0), x1: r6(win.x1), y1: r6(win.y1) },
    },
    descriptor: {
      text: doc.text, font: doc.font, size: r6(doc.fontSize * ds), tracking: doc.tracking, leading: r6(doc.leading * ds), fill: hex(doc.fillColor),
      origin: [r6(o[0]), r6(o[1])], base: r6(o[1] + row.lines[0][1] * ds), ink,
      // its ink's right end from the origin: a right-aligned descriptor puts the origin this far left of its margin
      reach: r6((row.rect[0] + row.rect[2]) * ds),
    },
    margin: { right: r6(header.comp.width - ink.x1) },
    gap: r6(ink.x0 - win.x1),
    logo: { cube: { x0: r6(ca[0]), y0: r6(ca[1]), w: r6(cz[0] - ca[0]) } },
  };
}

export function resolveHeader(sources = loadSources()) {
  const { svg, tokens } = sources;
  const base = tokens.color.base;
  const L = headerLayout(sources);
  const Hh = L.hatch;
  const Dd = L.descriptor;
  for (const [got, want, what] of [[Hh.colour, base.white.hex, 'hatching'], [Dd.fill, base.white.hex, 'descriptor']]) {
    if (got !== want) throw new Error(`the header: ${what} ${got}, the brand has ${want}`);
  }
  const colors = { white: base.white.hex, green: base.green.hex };
  const duration = { introSec: 0, holdSec: DEFAULT_SEC, outroSec: 0, maxSec: MAX_SEC };
  const ctrl = { Descriptor: { label: 'Дескриптор', kind: 'checkbox', value: 1 } };
  // the descriptor's origin on each frame: where the pack has it on 16:9; on 9:16 its ink ends at the same right margin
  const vOrigin = r6(1080 - L.margin.right - Dd.reach);
  const wRight = { h: { on: Hh.window.x1, off: r6(L.W - L.margin.right) }, v: { on: r6(vOrigin + (Dd.ink.x0 - Dd.origin[0]) - L.gap), off: r6(1080 - L.margin.right) } };
  if (wRight.v.on - Hh.window.x0 < 10 * Hh.step) throw new Error('the vertical header leaves less than ten lines of hatching');

  const pre = [
    V_JS,
    'var k = Math.min(thisComp.width, thisComp.height) / 1080;',
    'var ON = thisComp.layer("CTRL").effect("Descriptor")(1).value == 1;',
  ].join('\n') + '\n';
  const spec = new Spec({ name: COMP, w: L.W, h: L.H, fps: FPS, duration: MAX_SEC });
  // the window of the hatching (a matte), the lines, the logo, the descriptor
  spec.add(shape('WINDOW', [rectGroup('Window', colors.white)]));
  const winJs = pre + `var x0 = ${Hh.window.x0}, x1 = V ? (ON ? ${wRight.v.on} : ${wRight.v.off}) : (ON ? ${wRight.h.on} : ${wRight.h.off}), y0 = ${Hh.window.y0}, y1 = ${Hh.window.y1};\n`;
  spec.expr('WINDOW', P.rectSize('Window'), winJs + '[(x1 - x0) * k, (y1 - y0) * k]');
  spec.expr('WINDOW', P.rectPos('Window'), winJs + '[(x0 + x1) / 2 * k, (y0 + y1) / 2 * k]');
  // the lines at the pack's step, from a step before the window to a step past its widest right edge
  const first = Math.floor((Hh.window.x0 - Hh.base) / Hh.step) - 1;
  const last = Math.ceil((Math.max(wRight.h.off, wRight.h.on) - Hh.base) / Hh.step) + 1;
  const lines = [];
  for (let m = first; m <= last; m += 1) {
    const x = r6(Hh.base + m * Hh.step);
    lines.push({ closed: false, vertices: [[x, Hh.y0], [x, Hh.y1]], inTangents: [[0, 0], [0, 0]], outTangents: [[0, 0], [0, 0]] });
  }
  spec.add(shape('HATCH', [strokeGroup('Lines', { color: Hh.colour, width: Hh.width }, lines)]));
  // M11: the repeater's offset grows half a line a second; the lines move by its fraction, whole lines look the same
  spec.expr('HATCH', P.pos, pre + `var u = (${Hh.speed} * time) % 1;\n[u * ${Hh.step} * k, 0]`);
  spec.expr('HATCH', P.scale, pre + '[100 * k, 100 * k]');
  spec.matte('HATCH', 'WINDOW', 'ALPHA', { keepVisible: false });
  const lockup = masterLockup(svg, fitCube(svg, L.logo.cube));
  spec.add(shape('LOGO', [pathGroup('Wordmark', colors.white, lockup.wordmark), pathGroup('Cube', colors.green, lockup.cube)]));
  spec.expr('LOGO', P.scale, pre + '[100 * k, 100 * k]');
  const text = { TXT_DESCRIPTOR: { value: Dd.text, label: 'Дескриптор (текст)', style: { font: Dd.font, size: Dd.size, fill: colors.white, tracking: Dd.tracking, leading: Dd.leading, justify: 'LEFT' } } };
  spec.add(textLayer('TXT_DESCRIPTOR', { ...text.TXT_DESCRIPTOR.style, value: Dd.text }, []));
  spec.expr('TXT_DESCRIPTOR', P.pos, pre + `[(V ? ${vOrigin} : ${Dd.origin[0]}) * k, ${Dd.base} * k]`);
  spec.expr('TXT_DESCRIPTOR', P.opacity, pre + 'ON ? 100 : 0');
  addQaPatch(spec, colors.green);
  spec.add(nul('CTRL', [
    { kind: 'checkbox', name: 'Descriptor', value: true },
    { kind: 'checkbox', name: 'QA', value: false },
  ]));

  const order = [{ effect: 'Descriptor', matchName: 'ADBE Checkbox Control' }];
  const egp = [...order].reverse();
  const built = spec.toJSON();
  return {
    id: ID,
    workDir: workDir(),
    out: { dir: workPath('build', ID), aep: workPath('build', ID, ID + '_work.aep') },
    comp: spec.comp,
    colors,
    layout: L,
    fit: { vOrigin, wRight, lines: lines.length },
    text: {},
    slots: {},
    ctrl,
    egp,
    rig: {},
    markers: [],
    duration,
    spec: {
      ...built,
      fonts: [Dd.font],
      markers: [],
      egp: egp.map((e) => ({ effect: e.effect, matchName: e.matchName, label: ctrl[e.effect].label })),
      egpNames: order.map((e) => ctrl[e.effect].label),
      measure: [{ name: 'on', t: 1, ctrl: { Descriptor: 1 }, text: {}, layers: ['TXT_DESCRIPTOR', 'WINDOW', 'HATCH', 'LOGO'] }],
      defaults: { text: {}, ctrl: { Descriptor: 1 } },
    },
    check: {},
    version: 1,
    variants: ['16x9', '16x9_4K', '9x16'].map((key) => ({ key, ...tokens.video.formats[key] })),
    sweepTimes: [0, 1, 1.96, 2, 5, 59.96, 300, 899.96],
    rest: 1,
  };
}

export const resolve = resolveHeader;

// The library entry (library.src.json): a trim template; the descriptor switches on and off.
export function libraryEntry(p = resolveHeader()) {
  return {
    id: ID,
    title_ru: 'Шапка с логотипом',
    category: 'logo',
    tier: 'T1',
    hosts: ['ae', 'pr'],
    version: p.version,
    fit: 'trim',
    duration: p.duration,
    requiredFonts: p.spec.fonts.map((f) => ({ postScriptName: f })),
    fields: [{ key: 'descriptor', label_ru: 'Дескриптор', type: 'checkbox', egpName: p.ctrl.Descriptor.label, egpIndex: 0, default: true }],
    variants: p.variants.map((v) => ({ key: v.key, aspect: v.key === '9x16' ? '9x16' : '16x9', w: v.w, h: v.h, fps: FPS, aeComp: `${COMP}_${v.key}`, minHostVersion: { ae: '26.0', pr: '26.0' } })),
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = resolveHeader();
  console.log(JSON.stringify({ layers: r.spec.order, expressions: r.spec.expressions.length, layout: r.layout, fit: r.fit, egp: r.spec.egpNames }, null, 1));
}
