// BG_Arrows «Фон: стрелки»: the SMM pack's arrows background («BG_pattern_9x16_1», «BG_pattern_1x1_1»: the 4K comp
// «PATTERN_EDIT» — 390 tiles of a white arrow at 25 %, each shown only within 2000 px of a point that wanders by
// wiggle(0.3, 1000)) as a T2 loop on alpha (spec 5: the panel puts #222222 under it). This master is only its source:
// tools/masters/render-files.mjs renders it.
// - «PATTERN_EDIT» moved over as it is (spec.transplant), placed as the pack places it per format (9:16 at 125 % from
//   (570, 933), the 1440 square at 100 % from (690, 750) — 0.75 of it here; 16:9, not in the pack, the 4K comp whole).
// - The wandering point made a 15 s loop (the pack's 30 s render does not loop): its wiggle cross-faded with itself a
//   period later, so frame 0 is the pack's and the loop has no seam.
// Choices: masters/BG_Arrows/README.md.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { layerProp, readJson } from '../../tools/dump/model.mjs';
import { packProject } from '../../tools/dump/dump.mjs';
import { workDir, workPath } from '../../tools/lib/work.mjs';
import { dumpLayer } from '../../tools/masters/dump-keys.mjs';
import { addQaPatch } from '../../tools/masters/rig-plate.mjs';
import { aspectOf, packOf, with4k } from '../../tools/masters/pack4k.mjs';
import { nul, P, precomp, Spec } from '../../tools/masters/spec.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');

export const ID = 'BG_Arrows';
export const COMP = 'CR_BG_Arrows';
const FPS = 25;
export const PERIOD = 15;        // the loop (the pack's render is 30 s and does not loop)
export const SOURCE = { name: 'PATTERN_EDIT', w: 3840, h: 2160, layers: 394 };
const PACK = {
  tall: { slug: 'bg_pattern_9x16_1', name: 'BG_pattern_9x16_1', w: 1080, h: 1920 },
  square: { slug: 'bg_pattern_1x1_1', name: 'BG_pattern_1x1_1', w: 1440, h: 1440 },
};
export const FORMATS = ['9x16', '1x1', '16x9'];
const NULL = 'Null 1';

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const js = (v) => JSON.stringify(v);

export function loadSources({ dumps = 'C:/CRBK/work/dumps', repo = REPO } = {}) {
  const smm = (f) => readJson(path.join(dumps, 'smm', f + '.json'));
  return {
    pattern: smm('pattern_edit_2'),
    tall: smm(PACK.tall.slug),
    square: smm(PACK.square.slug),
    tokens: JSON.parse(readFileSync(path.join(repo, 'brand', 'tokens.json'), 'utf8')),
  };
}

// The pattern of the pack: its comp, the wandering point's wiggle (frequency and amplitude), the tiles' rule.
export function patternModel(dump) {
  const c = dump.comp;
  if (c.name !== SOURCE.name || c.width !== SOURCE.w || c.height !== SOURCE.h || dump.layers.length !== SOURCE.layers) throw new Error(`«${c.name}»: not the pack's ${SOURCE.name}`);
  const nul0 = dumpLayer(dump, NULL);
  const pos = layerProp(nul0, 'ADBE Transform Group', 'ADBE Position');
  const m = /wiggle\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/.exec(pos.expression?.text || '');
  if (!m) throw new Error(`${NULL}: its position is not a wiggle`);
  const tiles = dump.layers.filter((l) => l.name === 'Pattern_edit');
  const rule = new Set(tiles.map((l) => layerProp(l, 'ADBE Transform Group', 'ADBE Scale').expression?.text));
  if (tiles.length !== 390 || rule.size !== 1 || !/length\(p1, p2\)/.test([...rule][0])) throw new Error('the tiles of PATTERN_EDIT changed');
  return { freq: Number(m[1]), amp: Number(m[2]), rest: pos.value.slice(0, 2), tiles: tiles.length };
}

// Where a layout of the pack puts the pattern: its layer's position, scale, collapse.
export function placement(dump, pack) {
  const c = dump.comp;
  if (c.name !== pack.name || c.width !== pack.w || c.height !== pack.h || dump.layers.length !== 1) throw new Error(`«${c.name}»: not the pack's ${pack.name}`);
  const L = dump.layers[0];
  if (L.source?.name !== SOURCE.name) throw new Error(`«${c.name}»: does not play ${SOURCE.name}`);
  const tr = (mn) => layerProp(L, 'ADBE Transform Group', mn).value;
  if (js(tr('ADBE Anchor Point').slice(0, 2)) !== js([SOURCE.w / 2, SOURCE.h / 2])) throw new Error(`«${c.name}»: the pattern is anchored off its middle`);
  return { pos: tr('ADBE Position').slice(0, 2), scale: tr('ADBE Scale')[0], collapse: L.switches.collapseTransformation };
}

// The wandering point's position as a loop of `period`: its wiggle at t cross-faded into the same wiggle a period
// earlier, so the end meets the start (the wiggle at 0, as in the pack).
export function loopWiggleJs({ freq, amp }, period) {
  return [
    `var T = ${period}, t = time % T;`,
    `var w1 = wiggle(${freq}, ${amp}, 1, 0.5, t), w2 = wiggle(${freq}, ${amp}, 1, 0.5, t - T);`,
    'linear(t, 0, T, w1, w2)',
  ].join('\n');
}

export function resolveArrows(sources = loadSources()) {
  const { tokens } = sources;
  const pattern = patternModel(sources.pattern);
  const tall = placement(sources.tall, PACK.tall);
  const square = placement(sources.square, PACK.square);
  const k1 = 1080 / PACK.square.w;
  const spec = new Spec({ name: COMP, w: PACK.tall.w, h: PACK.tall.h, fps: FPS, duration: PERIOD });
  // collapsed: the arrows' lines are drawn at the frame's size (9:16 enlarges the 4K pattern, as the pack does)
  spec.add(precomp('PATTERN', 'DECOR_PATTERN', { collapse: true }));
  const pre = 'var w = thisComp.width, h = thisComp.height, k = Math.min(w, h) / 1080;\n';
  spec.expr('PATTERN', P.pos, pre + `w > h ? [w / 2, h / 2] : (w == h ? [${r6(square.pos[0] * k1)} * k, ${r6(square.pos[1] * k1)} * k] : [${tall.pos[0]} * k, ${tall.pos[1]} * k])`);
  spec.expr('PATTERN', P.scale, pre + `var s = w > h ? 100 * w / ${SOURCE.w} : (w == h ? ${r6(square.scale * k1)} * k : ${tall.scale} * k);\n[s, s]`);
  addQaPatch(spec, tokens.color.base.green.hex);
  spec.add(nul('CTRL', [{ kind: 'checkbox', name: 'QA', value: false }]));

  const built = spec.toJSON();
  const files = with4k(FORMATS.map((fmt) => ({ key: fmt, variant: fmt, ctrl: {}, kind: 'loop', seconds: PERIOD, options: {} })));
  return {
    id: ID,
    workDir: workDir(),
    out: { dir: workPath('build', ID), aep: workPath('build', ID, ID + '_work.aep') },
    comp: spec.comp,
    pattern,
    layouts: { tall, square, k1 },
    ctrl: {},
    text: {},
    egp: [],
    rig: {},
    markers: [],
    duration: { introSec: 0, holdSec: PERIOD, outroSec: 0 },
    files,
    spec: {
      ...built,
      fonts: [],
      markers: [],
      transplant: {
        aep: packProject('smm'),
        folder: 'BK_DECOR',
        source: SOURCE,
        comps: [{
          name: 'DECOR_PATTERN',
          keep: sources.pattern.layers.map((l) => ({ index: l.index, name: l.name })),
          set: [{ layer: NULL, path: ['transform', 'ADBE Position'], expr: loopWiggleJs(pattern, PERIOD) }],
        }],
      },
      egp: [],
      egpNames: [],
      measure: [],
      defaults: { text: {}, ctrl: {} },
    },
    check: {},
    version: 1,
    variants: [...FORMATS, '16x9_4K'].map((key) => ({ key, ...tokens.video.formats[key] })),
    sweepTimes: [0, 7.5, r6(PERIOD - 1 / FPS)],
    rest: 0,
  };
}

export const resolve = resolveArrows;

// The library entry (library.src.json): a T2 loop on alpha, a file per format; the panel puts #222222 under it.
export function libraryEntry(p = resolveArrows()) {
  return {
    id: ID,
    title_ru: 'Фон: стрелки',
    category: 'backgrounds',
    tier: 'T2',
    hosts: ['ae', 'pr'],
    version: p.version,
    alpha: true,
    loop: { periodFrames: PERIOD * FPS },
    duration: p.duration,
    variants: p.files.map((f) => {
      const v = p.variants.find((x) => x.key === f.variant);
      return { key: f.key, aspect: aspectOf(f.variant), w: v.w, h: v.h, fps: FPS, ...packOf(f), minHostVersion: { ae: '26.0', pr: '26.0' } };
    }),
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = resolveArrows();
  console.log(JSON.stringify({ layers: r.spec.order, pattern: r.pattern, layouts: r.layouts, wiggle: r.spec.transplant.comps[0].set[0].expr, keep: r.spec.transplant.comps[0].keep.length }, null, 1));
}
