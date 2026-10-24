// BG_Plus «Фон: плюсы»: the SMM pack's flickering grid of pluses («BG_pattern_9x16_2», «BG_pattern_1x1_2»: the «+» tile
// repeated over the frame by CC RepeTile at 35 %, its luma matte a block Fractal Noise whose evolution runs) as a T2
// loop on alpha (spec 5: the panel puts #222222 under it). This master is only its source: render-files.mjs renders it.
// - The «+» tile moved over as it is (spec.transplant), tiled and placed as the pack does it per format (9:16 from
//   (9, 12) at 50 %, the 1440 square at 50 % — 0.75 of it here; 16:9 as 9:16, the same pixel size).
// - The noise rebuilt with the pack's numbers (block, scale 111.7, offset, complexity 1; the square's matte at 50 %),
//   its evolution on the canon M9 (D19, signed: 40° a second; the pack's SMM backgrounds ran at 50) and cycled: one
//   revolution, so the loop is 9 s without a seam.
// Choices: masters/BG_Plus/README.md.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { layerProp, readJson } from '../../tools/dump/model.mjs';
import { packProject } from '../../tools/dump/dump.mjs';
import { workDir, workPath } from '../../tools/lib/work.mjs';
import { dumpLayer } from '../../tools/masters/dump-keys.mjs';
import { addQaPatch } from '../../tools/masters/rig-plate.mjs';
import { aspectOf, packOf, with4k } from '../../tools/masters/pack4k.mjs';
import { nul, P, precomp, rectGroup, shape, Spec } from '../../tools/masters/spec.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');

export const ID = 'BG_Plus';
export const COMP = 'CR_BG_Plus';
const FPS = 25;
export const TILE = { name: '+', w: 150, h: 150, layers: 2 };
const PACK = {
  tall: { slug: 'bg_pattern_9x16_2', name: 'BG_pattern_9x16_2', w: 1080, h: 1920, plus: '+ 3', noise: 'Dark Gray Solid 6' },
  square: { slug: 'bg_pattern_1x1_2', name: 'BG_pattern_1x1_2', w: 1440, h: 1440, plus: '+ 2', noise: 'Dark Gray Solid 5' },
};
export const FORMATS = ['9x16', '1x1', '16x9'];
const FN = (n) => `ADBE Fractal Noise-${String(n).padStart(4, '0')}`;

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const js = (v) => JSON.stringify(v);

export function loadSources({ dumps = 'C:/CRBK/work/dumps', repo = REPO } = {}) {
  const smm = (f) => readJson(path.join(dumps, 'smm', f + '.json'));
  return {
    tall: smm(PACK.tall.slug),
    square: smm(PACK.square.slug),
    tile: smm('plus'),
    tokens: JSON.parse(readFileSync(path.join(repo, 'brand', 'tokens.json'), 'utf8')),
  };
}

// One layout of the pack: the tile layer (place, scale, opacity, how far RepeTile spreads it) and the noise that mattes
// it (its parameters, the solid's opacity).
export function gridModel(dump, pack) {
  const c = dump.comp;
  if (c.name !== pack.name || c.width !== pack.w || c.height !== pack.h) throw new Error(`«${c.name}»: not the pack's ${pack.name}`);
  const plus = dumpLayer(dump, pack.plus);
  const noise = dumpLayer(dump, pack.noise);
  if (plus.source?.name !== TILE.name || plus.trackMatte.type !== 'LUMA') throw new Error(`${pack.plus}: not the «+» tile under a luma matte`);
  if (noise.index !== plus.index - 1 || noise.switches.enabled) throw new Error(`${pack.noise}: not the hidden matte right above the tiles`);
  const tr = (L, mn) => layerProp(L, 'ADBE Transform Group', mn).value;
  const rt = plus.effects.find((e) => e.matchName === 'CC RepeTile');
  const fn = noise.effects.find((e) => e.matchName === 'ADBE Fractal Noise');
  const param = (e, mn) => e.params.find((p) => p.matchName === mn);
  const ev = param(fn, FN(23));
  return {
    plus: {
      pos: tr(plus, 'ADBE Position').slice(0, 2), anchor: tr(plus, 'ADBE Anchor Point').slice(0, 2), scale: tr(plus, 'ADBE Scale')[0], opacity: tr(plus, 'ADBE Opacity'),
      expand: { right: param(rt, 'CC RepeTile-0001').value, left: param(rt, 'CC RepeTile-0002').value, down: param(rt, 'CC RepeTile-0003').value, up: param(rt, 'CC RepeTile-0004').value, tiling: param(rt, 'CC RepeTile-0005').value },
    },
    noise: {
      opacity: tr(noise, 'ADBE Opacity'),
      fractalType: param(fn, FN(1)).value, noiseType: param(fn, FN(2)).value, contrast: param(fn, FN(4)).value, brightness: param(fn, FN(5)).value,
      overflow: param(fn, FN(6)).value, scale: param(fn, FN(10)).value, offset: param(fn, FN(13)).value, complexity: param(fn, FN(15)).value,
      evolution: ev.expression?.text ?? null, cycle: param(fn, FN(25)).value,
    },
  };
}

export function resolvePlus(sources = loadSources()) {
  const { tokens } = sources;
  const tall = gridModel(sources.tall, PACK.tall);
  const square = gridModel(sources.square, PACK.square);
  const m9 = tokens.motion.M9;
  const period = r6(360 / m9.evolutionDegPerSec);
  // the two layouts share the tile and the noise but for the square's scale (0.75 of it here) and its matte at 50 %
  const same = (a, b) => js({ ...a.noise, opacity: 0 }) === js({ ...b.noise, opacity: 0 }) && a.plus.scale === b.plus.scale && js(a.plus.pos) === js(b.plus.pos);
  if (!same(tall, square)) throw new Error('the pack\'s two plus grids differ beyond the square\'s matte');
  if (tile(sources.tile).layers !== TILE.layers) throw new Error('the «+» tile changed');
  const k1 = 1080 / PACK.square.w;
  const n = tall.noise;
  const spec = new Spec({ name: COMP, w: PACK.tall.w, h: PACK.tall.h, fps: FPS, duration: period });
  // the tiles: the pack's «+» comp at its place from the top left, spread over the frame (its expand covers FHD)
  const pre = 'var w = thisComp.width, h = thisComp.height, q = w == h ? ' + k1 + ' : 1;\n';
  spec.add(precomp('PLUSES', 'DECOR_PLUS', {
    anchor: tall.plus.anchor,
    effects: [{ matchName: 'CC RepeTile', name: 'RepeTile', values: { 'CC RepeTile-0001': 4000, 'CC RepeTile-0002': 0, 'CC RepeTile-0003': 4000, 'CC RepeTile-0004': 0, 'CC RepeTile-0005': tall.plus.expand.tiling } }],
  }));
  spec.expr('PLUSES', P.pos, pre + `[${tall.plus.pos[0]} * q, ${tall.plus.pos[1]} * q]`);
  spec.expr('PLUSES', P.scale, pre + `[${tall.plus.scale} * q, ${tall.plus.scale} * q]`);
  spec.expr('PLUSES', P.opacity, String(tall.plus.opacity));
  // the noise over the frame, the tiles' luma matte
  spec.add(shape('NOISE', [rectGroup('Ground', '#FFFFFF')], {
    effects: [{ matchName: 'ADBE Fractal Noise', name: 'Fractal Noise', values: {
      [FN(1)]: n.fractalType, [FN(2)]: n.noiseType, [FN(4)]: n.contrast, [FN(5)]: n.brightness, [FN(6)]: n.overflow, [FN(15)]: n.complexity, [FN(25)]: 1, [FN(26)]: 1,
    } }],
  }));
  spec.expr('NOISE', P.rectSize('Ground'), '[thisComp.width, thisComp.height]');
  spec.expr('NOISE', P.rectPos('Ground'), '[thisComp.width / 2, thisComp.height / 2]');
  spec.expr('NOISE', ['effect', 'Fractal Noise', 'ADBE Fractal Noise', FN(10)], pre + `${n.scale} * q`);
  spec.expr('NOISE', ['effect', 'Fractal Noise', 'ADBE Fractal Noise', FN(13)], pre + `[${n.offset[0]} * q, ${n.offset[1]} * q]`);
  spec.expr('NOISE', ['effect', 'Fractal Noise', 'ADBE Fractal Noise', FN(23)], m9.expression);
  spec.expr('NOISE', P.opacity, `thisComp.width == thisComp.height ? ${square.noise.opacity} : ${tall.noise.opacity}`);
  spec.matte('PLUSES', 'NOISE', 'LUMA', { keepVisible: false });
  addQaPatch(spec, tokens.color.base.green.hex);
  spec.add(nul('CTRL', [{ kind: 'checkbox', name: 'QA', value: false }]));

  const built = spec.toJSON();
  const files = with4k(FORMATS.map((fmt) => ({ key: fmt, variant: fmt, ctrl: {}, kind: 'loop', seconds: period, options: {} })));
  return {
    id: ID,
    workDir: workDir(),
    out: { dir: workPath('build', ID), aep: workPath('build', ID, ID + '_work.aep') },
    comp: spec.comp,
    layouts: { tall, square, k1 },
    period,
    ctrl: {},
    text: {},
    egp: [],
    rig: {},
    markers: [],
    duration: { introSec: 0, holdSec: period, outroSec: 0 },
    files,
    spec: {
      ...built,
      fonts: [],
      markers: [],
      transplant: {
        aep: packProject('smm'),
        folder: 'BK_DECOR',
        source: TILE,
        comps: [{ name: 'DECOR_PLUS', keep: sources.tile.layers.map((l) => ({ index: l.index, name: l.name })) }],
      },
      egp: [],
      egpNames: [],
      measure: [],
      defaults: { text: {}, ctrl: {} },
    },
    check: {},
    version: 1,
    variants: [...FORMATS, '16x9_4K'].map((key) => ({ key, ...tokens.video.formats[key] })),
    sweepTimes: [0, r6(period / 2), r6(period - 1 / FPS)],
    rest: 0,
  };
}

function tile(dump) {
  const c = dump.comp;
  if (c.name !== TILE.name || c.width !== TILE.w || c.height !== TILE.h) throw new Error(`«${c.name}»: not the pack's «+» tile`);
  return { layers: dump.layers.length };
}

export const resolve = resolvePlus;

// The library entry (library.src.json): a T2 loop on alpha, a file per format; the panel puts #222222 under it.
export function libraryEntry(p = resolvePlus()) {
  return {
    id: ID,
    title_ru: 'Фон: плюсы',
    category: 'backgrounds',
    tier: 'T2',
    hosts: ['ae', 'pr'],
    version: p.version,
    alpha: true,
    loop: { periodFrames: Math.round(p.period * FPS) },
    duration: p.duration,
    variants: p.files.map((f) => {
      const v = p.variants.find((x) => x.key === f.variant);
      return { key: f.key, aspect: aspectOf(f.variant), w: v.w, h: v.h, fps: FPS, ...packOf(f), minHostVersion: { ae: '26.0', pr: '26.0' } };
    }),
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = resolvePlus();
  console.log(JSON.stringify({ layers: r.spec.order, period: r.period, tall: r.layouts.tall, square: { noise: r.layouts.square.noise.opacity }, files: r.files.map((f) => f.key) }, null, 1));
}
