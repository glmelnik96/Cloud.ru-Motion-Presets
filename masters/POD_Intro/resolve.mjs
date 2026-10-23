// POD_Intro «Интро подкаста»: the podcast pack's intro («Заставка_ПОДКАСТ_CLOUD.RU»: the frame's contour, hatches,
// arrows, a globe and numbered circles drawn in white over the video, then from 1 s the grey card with the green-plated
// «ПОДКАСТ CLOUD.RU», 7 s) as a T2 clip on alpha (spec 5 «Интро и аутро»). This master is only its source:
// tools/masters/render-files.mjs renders it.
// - 16:9: the pack's 4K comp moved over as it is (spec.transplant), without its logo, its music and a reference still.
// - 9:16: the pack has only its render (D12: rebuilt by the render). It is the same comp re-laid out, so the comp is moved
//   over a second time into 2160x3840 and placed by masters/POD_Intro/layout-9x16.json (measure-9x16.mjs): the title
//   group, the circles and the globe scaled and moved, the hatches turned -90°, the arrows turned and flying the curves
//   the render shows (two of them copies), the contour's path by expression.
// - The logo: the master logo (D18) where the pack's stands — white letters over the video in its three flashes, dark
//   ones on the card from 1 s (L6, tokens color.logoVariants).
// Choices: masters/POD_Intro/README.md.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { layerProp, readJson } from '../../tools/dump/model.mjs';
import { packProject } from '../../tools/dump/dump.mjs';
import { shapeBoxAt, shapePathsAt } from '../../tools/masters/dump-geometry.mjs';
import { workDir, workPath } from '../../tools/lib/work.mjs';
import { fitCube, masterLockup } from '../../tools/masters/logo.mjs';
import { addQaPatch } from '../../tools/masters/rig-plate.mjs';
import { M10_JS } from '../SMM_FrameNotched/resolve.mjs';
import { nul, P, pathGroup, precomp, shape, Spec } from '../../tools/masters/spec.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');

export const ID = 'POD_Intro';
export const COMP = 'CR_POD_Intro';
const FPS = 25;
export const DURATION = 7;
export const SOURCE = { name: 'Заставка_ПОДКАСТ_CLOUD.RU', w: 3840, h: 2160, layers: 34 };
export const TALL = { w: 2160, h: 3840 };
// Not moved over: the logo (the master draws its own), the music bed (sounds come with the sounds of the library, D14)
// and the reference still the pack keeps switched off.
const LOGOS = ['Cloud.ru_BlackColour', 'Cloud.ru_WhiteColour'];
const LEFT_OUT = [...LOGOS, 'Заставка_ПОДКАСТ_CLOUD.RU.wav', 'Still 2025-12-10 132207_1.2.1.png'];
// The vertical frame drops the four arrows that point down in 16:9 (its arrows are the others, turned).
const NOT_TALL = ['Стрелка_3 Outlines', 'Стрелка_5 Outlines', 'Стрелка_4 Outlines', 'Стрелка_7 Outlines'];
const TITLE = ['ПОДКАСТ 2', 'ПОДКАСТ', 'GREEN_CUBE_1 Outlines 2', 'GREEN_CUBE_1 Outlines', 'CLOUD.RU 2', 'CLOUD.RU', 'CREEN_CUBE_2 Outlines 2', 'CREEN_CUBE_2 Outlines'];
const NULL = 'scale';
// The logo flashes white on frames 10 and 12 and from 14, and stands dark on the card from frame 25 (the pack's layers).
export const LOGO_FRAMES = { flashes: [10, 12], from: 14, dark: 25 };

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const js = (v) => JSON.stringify(v);
const rgba = (hex) => [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255, 1].map(r6);

export function loadSources({ dumps = 'C:/CRBK/work/dumps', repo = REPO } = {}) {
  const pod = (f) => readJson(path.join(dumps, 'podcast', f + '.json'));
  return {
    intro: pod('zastavka_podkast_cloud_ru'),
    logo: pod('cloud_ru_blackcolour'),
    hatch: pod('lines_2_comp_1'),
    layout: JSON.parse(readFileSync(path.join(here, 'layout-9x16.json'), 'utf8')),
    tokens: JSON.parse(readFileSync(path.join(repo, 'brand', 'tokens.json'), 'utf8')),
    svg: readFileSync(path.join(repo, 'brand', 'logo', 'master-ae-motion-live.svg'), 'utf8'),
  };
}

const layerOf = (dump, name) => {
  const hits = dump.layers.filter((l) => l.name === name);
  if (hits.length !== 1) throw new Error(`${dump.comp.name}: ${hits.length} layers named ${name}`);
  return hits[0];
};
const tr = (L, mn) => layerProp(L, 'ADBE Transform Group', mn);
const restOf = (p) => (p.keys && p.keys.length ? p.keys[p.keys.length - 1].value : p.value);

// The pack's comp as the master needs it: the «scale» null every element hangs on (300 %, at the frame's middle), where
// each element's anchor rests, the logo layer, the grey card, the contour's group and keys, the top hatch's mask.
export function introModel(dump) {
  const c = dump.comp;
  if (c.name !== SOURCE.name || c.width !== SOURCE.w || c.height !== SOURCE.h || dump.layers.length !== SOURCE.layers || c.duration !== DURATION) throw new Error(`«${c.name}»: not the pack's intro`);
  const nl = layerOf(dump, NULL);
  const null16 = { pos: tr(nl, 'ADBE Position').value.slice(0, 2), anchor: tr(nl, 'ADBE Anchor Point').value.slice(0, 2), scale: tr(nl, 'ADBE Scale').value[0] / 100 };
  if (js(null16) !== js({ pos: [1920, 1080], anchor: [50, 50], scale: 3 })) throw new Error(`${NULL}: not the 300 % null at the middle`);
  // a layer's anchor in the 16:9 frame at rest (null children through the null)
  const anchorAt = (name) => {
    const L = layerOf(dump, name);
    const v = restOf(tr(L, 'ADBE Position'));
    if (L.parent === null) return [v[0], v[1]];
    if (L.parent !== nl.index) throw new Error(`${name}: hangs on another layer`);
    return [null16.pos[0] + null16.scale * (v[0] - null16.anchor[0]), null16.pos[1] + null16.scale * (v[1] - null16.anchor[1])];
  };
  const logo = layerOf(dump, LOGOS[0]);
  const whites = dump.layers.filter((l) => l.name === LOGOS[1]);
  const frames = whites.map((l) => [Math.round(l.inPoint * FPS), Math.round(l.outPoint * FPS)]).sort((a, b) => a[0] - b[0]);
  if (js(frames) !== js([[10, 11], [12, 13], [14, 25]]) || Math.round(logo.inPoint * FPS) !== LOGO_FRAMES.dark) throw new Error('the logo does not flash on frames 10, 12, 14–24 and stand from 25');
  for (const l of [logo, ...whites]) {
    if (js([tr(l, 'ADBE Position').value, tr(l, 'ADBE Anchor Point').value, tr(l, 'ADBE Scale').value]) !== js([tr(logo, 'ADBE Position').value, tr(logo, 'ADBE Anchor Point').value, tr(logo, 'ADBE Scale').value])) throw new Error('the logo layers stand apart');
  }
  const card = layerOf(dump, 'Light Gray Solid 4');
  const lines = layerOf(dump, 'LINES');
  const group = ((lines.props || []).find((n) => n.matchName === 'ADBE Root Vectors Group').children || [])[0];
  const gtr = (group.children || []).find((n) => n.matchName === 'ADBE Vector Transform Group').children;
  const gv = (mn) => gtr.find((n) => n.matchName === mn).value;
  const pathKeys = (function find(n) {
    for (const ch of n.children || []) {
      if (ch.matchName === 'ADBE Vector Shape') return ch.keys;
      const hit = find(ch);
      if (hit) return hit;
    }
    return null;
  })(group);
  const mask = layerOf(dump, 'LINES 2 Comp 1').masks[0];
  return {
    null16, anchorAt,
    logo: { pos: tr(logo, 'ADBE Position').value.slice(0, 2), anchor: tr(logo, 'ADBE Anchor Point').value.slice(0, 2), scale: tr(logo, 'ADBE Scale').value[0] / 100 },
    card: { size: [card.source.width, card.source.height], anchor: tr(card, 'ADBE Anchor Point').value.slice(0, 2) },
    contour: { name: group.name, position: gv('ADBE Vector Position'), scale: gv('ADBE Vector Scale').map((v) => v / 100), keys: pathKeys.map((k) => ({ t: k.time, out: k.outEase[0].influence, in: k.inEase[0].influence })) },
    hatchMask: { name: mask.name, vertices: mask.path.value.vertices },
  };
}

// The cube of the pack's logo in the 16:9 frame (4K px): the green layer of its logo comp through the logo layer.
export function packCube(logoDump, logo) {
  const cube = logoDump.layers.find((l) => (l.name === 'Layer 4 Outlines'));
  const b = shapeBoxAt(logoDump, cube, 1);
  const at = (q) => [logo.pos[0] + logo.scale * (q[0] - logo.anchor[0]), logo.pos[1] + logo.scale * (q[1] - logo.anchor[1])];
  const a = at([b.x0, b.y0]);
  const z = at([b.x1, b.y1]);
  return { x0: r6(a[0]), y0: r6(a[1]), w: r6(z[0] - a[0]), h: r6(z[1] - a[1]) };
}

// The top hatch's lines repeat: the comp's 18 lines are one group of nine twice, a period apart (precomp px). The
// vertical frame shows more of them than the comp has: one more group, a copy of the layer a period further on.
export function hatchPeriod(dump) {
  const L = dump.layers.find((l) => l.name === 'LINES 2');
  const xs = shapePathsAt(dump, L, 0).map((sp) => Math.round(sp.vertices[0][0] * 100) / 100).sort((a, b) => a - b);
  for (const p of xs.map((x) => x - xs[0]).filter((d) => d > 0)) {
    const hits = xs.filter((x) => xs.some((y) => Math.abs(y - (x + p)) < 0.5)).length;
    if (hits === xs.length / 2) return { period: p, lines: xs.length };
  }
  throw new Error('LINES 2: its lines do not repeat');
}

// An ease of the pack's kind (zero speeds, two influences) over [t0, t1] as an expression's progress `e`.
const easeJs = (t0, t1, out, inn) => [
  `var X1 = ${r6(out / 100)}, X2 = ${r6(1 - inn / 100)};`,
  M10_JS,
  `var e = m10(Math.max(0, Math.min(1, (time - ${r6(t0)}) / ${r6(t1 - t0)})));`,
].join('\n');

// The vertical copy of the comp: every change as a transplant entry (positions in the null's units).
export function tallLayout(model, layout) {
  const C9 = [TALL.w / 2, TALL.h / 2];
  const U = model.null16.scale;
  const local = (p) => [r6((p[0] - C9[0]) / U + model.null16.anchor[0]), r6((p[1] - C9[1]) / U + model.null16.anchor[1])];
  const set = [];
  const span = [];
  const pos = (layer, p) => set.push({ layer, path: ['transform', 'ADBE Position'], value: [...local(p), 0] });
  const keyedScale = (layer, s) => set.push({ layer, path: ['transform', 'ADBE Scale'], expr: `[value[0] * ${s}, value[1] * ${s}, value[2]]` });
  // The null stays where the pack has it: in a comp resized by script AE places a parent's children half the size
  // difference off (AE 26.5, seen 2026-10-24: with the null moved to the new middle, every child landed 840 px left and
  // 840 px down), so the null left at the old middle puts them about the new one.
  // the title group: one similarity for all its layers
  const t = layout.title;
  for (const name of TITLE) {
    const p = model.anchorAt(name);
    pos(name, [t.scale * p[0] + t.shift[0], t.scale * p[1] + t.shift[1]]);
    if (/^(ПОДКАСТ|CLOUD\.RU)/.test(name)) set.push({ layer: name, path: ['transform', 'ADBE Scale'], value: [r6(100 * t.scale), r6(100 * t.scale), 100] });
    else keyedScale(name, t.scale);
  }
  // the circles: «1» is ①, «2» is ②
  for (const [name, c] of [['1', layout.circles.one], ['2', layout.circles.two]]) {
    const p = model.anchorAt(name);
    const s = layout.circles.scale;
    pos(name, [c.c9[0] - s * (c.c16[0] - p[0]), c.c9[1] - s * (c.c16[1] - p[1])]);
    keyedScale(name, s);
  }
  // the globe hangs on nothing: its position is in the frame's px
  const g = layout.globe;
  const gp = model.anchorAt('Pattern_1');
  set.push({ layer: 'Pattern_1', path: ['transform', 'ADBE Position'], value: [r6(g.c9[0] - g.scale * (g.c16[0] - gp[0])), r6(g.c9[1] - g.scale * (g.c16[1] - gp[1])), 0] });
  set.push({ layer: 'Pattern_1', path: ['transform', 'ADBE Scale'], value: [100 * g.scale, 100 * g.scale, 100] });
  // the hatches, turned; the top one windowed anew (its mask's long sides kept, its ends where the render cuts the lines)
  // and run on by a copy a period of its lines further on (the window shows one group of nine more than the comp has)
  const copies = [];
  for (const [name, h] of Object.entries(layout.hatches)) {
    const layers = h.window ? [[name, h.anchor9, 0], [`${name} b`, [h.anchor9[0], h.anchor9[1] + U * model.hatch.period], model.hatch.period]] : [[name, h.anchor9, 0]];
    for (const [layer, anchor9, shift] of layers) {
      if (shift) copies.push({ layer: name, name: layer });
      pos(layer, anchor9);
      set.push({ layer, path: ['transform', 'ADBE Rotate Z'], value: h.rotation });
      if (h.window) {
        const q = (y) => r6(640 - (y - h.anchor9[1]) / U + shift);
        const v = model.hatchMask.vertices;
        const pts = [[q(h.window[0]), v[0][1]], [q(h.window[1]), v[1][1]], [q(h.window[1]), v[2][1]], [q(h.window[0]), v[3][1]]];
        set.push({ layer, path: ['mask', model.hatchMask.name, 'ADBE Mask Shape'], expr: `createPath(${js(pts)}, [], [], true)` });
      }
    }
    // the hatch comp's own matte made wide: in a comp resized by script AE cuts a continuously rasterized comp's matte
    // short once the layer is turned (AE 26.5, 2026-10-24: three lines of the lower hatch gone)
    set.push({ comp: name, layer: 'Background Outlines', path: ['transform', 'ADBE Scale'], value: [1000, 1000, 100] });
  }
  // the arrows: turned, flying their own curves to their rests, showing from their own frames
  for (const a of layout.arrows) {
    const layer = a.copy || a.source;
    const E = local(a.anchor9);
    const f = a.flight;
    set.push({ layer, path: ['transform', 'ADBE Rotate Z'], value: a.rotation });
    if (a.scale !== 1) set.push({ layer, path: ['transform', 'ADBE Scale'], value: [r6(100 * a.scale), r6(100 * a.scale), 100] });
    // z 0: the big arrows of the pack keep -35 on their 2D layers, which in the resized comp moves them 0.66 % off the
    // middle (AE 26.5, 2026-10-24)
    set.push({ layer, path: ['transform', 'ADBE Position'], expr: [
      easeJs(f.t0, f.t1, f.out, f.in),
      `var r = ${r6(f.travel / U)} * (1 - e);`,
      `[${E[0]} - ${a.dir[0]} * r, ${E[1]} - ${a.dir[1]} * r, 0]`,
    ].join('\n') });
    span.push({ layer, inPoint: Math.max(a.inPoint, model.startOf(a.source)) });
  }
  // the contour: its corners in the group's space, contracting on the pack's path keys
  const k = model.contour.keys;
  const inGroup = (p) => [r6(((p[0] - C9[0]) / U - model.contour.position[0]) / model.contour.scale[0]), r6(((p[1] - C9[1]) / U - model.contour.position[1]) / model.contour.scale[1])];
  set.push({ layer: 'LINES', path: ['group', model.contour.name, 'Path 1', 'ADBE Vector Shape'], expr: [
    easeJs(k[0].t, k[1].t, k[0].out, k[1].in),
    `var S = ${js(layout.contour.start.map(inGroup))}, E = ${js(layout.contour.end.map(inGroup))}, p = [];`,
    'for (var i = 0; i < E.length; i++) { p.push([S[i][0] + (E[i][0] - S[i][0]) * e, S[i][1] + (E[i][1] - S[i][1]) * e]); }',
    'createPath(p, [], [], true)',
  ].join('\n') });
  // the matte every element is cut by covers the frame; the card covers it from its anchor (the solid's right middle)
  set.push({ layer: 'Background Outlines', path: ['transform', 'ADBE Scale'], value: [200, 200, 100] });
  const cs = r6(Math.ceil((TALL.h / model.card.size[1]) * 100) / 100);
  set.push({ layer: 'Light Gray Solid 4', path: ['transform', 'ADBE Scale'], value: [100 * cs, 100 * cs, 100] });
  set.push({ layer: 'Light Gray Solid 4', path: ['transform', 'ADBE Position'], value: [TALL.w + 40, C9[1], 0] });
  return { set, span, copies };
}

export function resolveIntro(sources = loadSources()) {
  const { tokens, svg, layout } = sources;
  const base = tokens.color.base;
  const dump = sources.intro;
  const model = { ...introModel(dump), startOf: (name) => layerOf(dump, name).startTime, hatch: hatchPeriod(sources.hatch) };
  const all = dump.layers.map((l) => ({ index: l.index, name: l.name }));
  const keepWide = all.filter((l) => !LEFT_OUT.includes(l.name));
  const keepTall = keepWide.filter((l) => !NOT_TALL.includes(l.name));
  const tall = tallLayout(model, layout);
  // the logo: the master lockup on the pack's cube in FHD px of the 16:9 frame; the vertical frame scales it about the
  // pack layer's anchor as the pack's vertical logo is (70 % against 62 %)
  const cube16 = packCube(sources.logo, model.logo);
  const fhd = (v) => r6(v / 2);
  const fit = fitCube(svg, { x0: fhd(cube16.x0), y0: fhd(cube16.y0), w: fhd(cube16.w) });
  const lockup = masterLockup(svg, fit);
  const L16 = model.logo.pos.map(fhd);
  const L9 = layout.logo.position.map(fhd);
  const ls = r6(layout.logo.scale / (100 * model.logo.scale));
  const onLight = tokens.color.logoVariants.onWhite;
  const onDark = tokens.color.logoVariants.onBlack;

  const spec = new Spec({ name: COMP, w: 1920, h: 1080, fps: FPS, duration: DURATION });
  const pre = 'var w = thisComp.width, h = thisComp.height, k = Math.min(w, h) / 1080;\n';
  for (const [layer, decor, wide, size] of [['DECOR_16X9', 'DECOR_16x9', true, SOURCE.w], ['DECOR_9X16', 'DECOR_9x16', false, TALL.w]]) {
    spec.add(precomp(layer, decor));
    spec.expr(layer, P.pos, '[thisComp.width / 2, thisComp.height / 2]');
    spec.expr(layer, P.scale, `var s = 100 * thisComp.width / ${size};\n[s, s]`);
    spec.expr(layer, P.opacity, `(thisComp.width > thisComp.height) == ${wide} ? 100 : 0`);
  }
  spec.add(shape('LOGO', [pathGroup('Wordmark', base[onDark.wordmark].hex, lockup.wordmark), pathGroup('Cube', base[onDark.mark].hex, lockup.cube)], { anchor: L16 }));
  spec.expr('LOGO', P.pos, pre + `w > h ? [${L16[0]} * k, ${L16[1]} * k] : [${L9[0]} * k, ${L9[1]} * k]`);
  spec.expr('LOGO', P.scale, pre + `var s = 100 * k * (w > h ? 1 : ${ls});\n[s, s]`);
  const frame = 'var f = Math.round(time * 25);\n';
  spec.expr('LOGO', P.opacity, frame + `(${LOGO_FRAMES.flashes.map((n) => `f == ${n}`).join(' || ')} || f >= ${LOGO_FRAMES.from}) ? 100 : 0`);
  spec.expr('LOGO', P.fill('Wordmark'), frame + `f < ${LOGO_FRAMES.dark} ? ${js(rgba(base[onDark.wordmark].hex))} : ${js(rgba(base[onLight.wordmark].hex))}`);
  spec.expr('LOGO', P.fill('Cube'), frame + `f < ${LOGO_FRAMES.dark} ? ${js(rgba(base[onDark.mark].hex))} : ${js(rgba(base[onLight.mark].hex))}`);
  addQaPatch(spec, base.green.hex);
  spec.add(nul('CTRL', [{ kind: 'checkbox', name: 'QA', value: false }]));

  const built = spec.toJSON();
  const FORMATS = ['16x9', '9x16'];
  const files = FORMATS.map((fmt) => ({ key: fmt, variant: fmt, ctrl: {}, kind: 'clip', seconds: DURATION, options: {} }));
  return {
    id: ID,
    workDir: workDir(),
    out: { dir: workPath('build', ID), aep: workPath('build', ID, ID + '_work.aep') },
    comp: spec.comp,
    logo: { cube16, fit, L16, L9, scale9: ls },
    ctrl: {},
    text: {},
    egp: [],
    rig: {},
    markers: [],
    duration: { introSec: 0, holdSec: DURATION, outroSec: 0 },
    files,
    spec: {
      ...built,
      fonts: ['SBSansDisplay-Bold'],
      markers: [],
      transplant: {
        aep: packProject('podcast'),
        folder: 'BK_DECOR',
        source: SOURCE,
        comps: [
          { name: 'DECOR_16x9', keep: keepWide },
          {
            name: 'DECOR_9x16', keep: keepTall, size: [TALL.w, TALL.h],
            copies: [...layout.arrows.filter((a) => a.copy).map((a) => ({ layer: a.source, name: a.copy })), ...tall.copies],
            set: tall.set, span: tall.span,
          },
        ],
      },
      egp: [],
      egpNames: [],
      measure: [],
      defaults: { text: {}, ctrl: {} },
    },
    check: {},
    version: 1,
    variants: FORMATS.map((key) => ({ key, ...tokens.video.formats[key] })),
    sweepTimes: [0, 0.4, 0.96, 1, 2, r6(DURATION - 1 / FPS)],
    rest: 3,
  };
}

export const resolve = resolveIntro;

// The library entry (library.src.json): a T2 clip on alpha (its first second draws over the video), a file per format.
export function libraryEntry(p = resolveIntro()) {
  return {
    id: ID,
    title_ru: 'Интро подкаста',
    category: 'podcast',
    tier: 'T2',
    hosts: ['ae', 'pr'],
    version: p.version,
    alpha: true,
    duration: p.duration,
    variants: p.files.map((f) => {
      const v = p.variants.find((x) => x.key === f.variant);
      return { key: f.key, aspect: f.variant, w: v.w, h: v.h, fps: FPS, minHostVersion: { ae: '26.0', pr: '26.0' } };
    }),
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = resolveIntro();
  const tp = r.spec.transplant.comps;
  console.log(JSON.stringify({ layers: r.spec.order, logo: r.logo, wide: tp[0].keep.length, tall: tp[1].keep.length, copies: tp[1].copies, sets: tp[1].set.length, span: tp[1].span }, null, 1));
}
