// POD_Outro «Аутро подкаста»: the podcast pack's OUTRO (the logo shot «есть где развернуться» on #222222, frozen from
// 2.88 s to the end of its 10 s) as a T2 clip, opaque (spec 5 «Интро и аутро»). This master is only its source:
// tools/masters/render-files.mjs renders it.
// - The logo shot is LOGO_Shot's, not the pack's copy (M6: the podcast repeats the logo shot; D18: the master logo): the
//   packaged LOGO_Shot's 16:9 and 9:16 comps moved over (spec.transplant), «Подпись» on «есть где развернуться» and «Фон»
//   on «Тёмный» (its plates turn light there, as the pack's are). So LOGO_Shot is packaged before this master is built.
// - Frozen where the pack freezes it: time remapped to 2.88 s, inside the logo shot's hold (2.12–3.96 s, 9:16 to 4.56).
// - 9:16, not in the pack, is LOGO_Shot's stacked layout («есть где⏎развернуться»).
// Choices: masters/POD_Outro/README.md.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from '../../tools/dump/model.mjs';
import { workDir, workPath } from '../../tools/lib/work.mjs';
import { addQaPatch } from '../../tools/masters/rig-plate.mjs';
import { aspectOf, packOf, with4k } from '../../tools/masters/pack4k.mjs';
import { nul, P, precomp, Spec } from '../../tools/masters/spec.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');

export const ID = 'POD_Outro';
export const COMP = 'CR_POD_Outro';
const FPS = 25;
export const DURATION = 10;
// The logo shot's packaged comps (tools/masters/package.mjs: CR_LOGO_Shot_<format>_v1, 10 layers each) and the values
// of its form: «Подпись» 3 «есть где развернуться», «Фон» 2 «Тёмный»; «Тема» and «Скорость» stay at the defaults.
export const SHOT = { id: 'LOGO_Shot', version: 1, layers: ['CTRL', 'RIG', 'CAMERA', 'QA_PATCH', 'CAPTION_V', 'CAPTION', 'LOCKUP', 'PL_CAPTION', 'PL_LOGO', 'BG'] };
export const SHOT_CTRL = { Caption: 3, Background: 2 };
export const FORMATS = ['16x9', '9x16'];

const r6 = (v) => Math.round(v * 1e6) / 1e6;

export function loadSources({ dumps = 'C:/CRBK/work/dumps', repo = REPO } = {}) {
  return {
    outro: readJson(path.join(dumps, 'podcast', 'outro.json')),
    tokens: JSON.parse(readFileSync(path.join(repo, 'brand', 'tokens.json'), 'utf8')),
  };
}

// The pack's outro: the logo shot played to its freeze, then held on that frame (Time Remap, one hold key) on the dark
// solid, 10 s.
export function outroModel(dump) {
  const c = dump.comp;
  if (c.name !== 'OUTRO' || c.width !== 3840 || c.height !== 2160 || c.duration !== DURATION || dump.layers.length !== 3) throw new Error(`«${c.name}»: not the pack's OUTRO`);
  const [held, played, ground] = dump.layers;
  if (held.source?.name !== 'Есть где развернуться' || played.source?.name !== held.source.name) throw new Error('OUTRO: not the logo shot «Есть где развернуться»');
  const remap = (held.props || []).find((n) => n.matchName === 'ADBE Time Remapping');
  const keys = remap?.keys || [];
  if (keys.length !== 1 || keys[0].inInterp !== 'HOLD' || keys[0].value !== held.inPoint || played.outPoint !== held.inPoint) throw new Error('OUTRO: the freeze is not a hold on the cut');
  if (ground.source?.name !== 'Dark Gray Solid 1') throw new Error('OUTRO: no dark ground');
  return { freeze: r6(held.inPoint), duration: c.duration };
}

export function resolveOutro(sources = loadSources()) {
  const { tokens } = sources;
  const pack = outroModel(sources.outro);
  const spec = new Spec({ name: COMP, w: 1920, h: 1080, fps: FPS, duration: DURATION });
  // a shot per frame: LOGO_Shot's own comp of that size (its 4K one for the 4K clip)
  const shots = [...FORMATS, '16x9_4K'].map((fmt) => {
    const f = tokens.video.formats[fmt];
    return { fmt, layer: `SHOT_${fmt.toUpperCase()}`, decor: `DECOR_${fmt}`, source: { name: `CR_${SHOT.id}_${fmt}_v${SHOT.version}`, w: f.w, h: f.h, layers: SHOT.layers.length } };
  });
  for (const s of shots) {
    spec.add(precomp(s.layer, s.decor, { timeRemap: true }));
    spec.expr(s.layer, P.timeRemap, `Math.min(time, ${pack.freeze})`);
    spec.expr(s.layer, P.pos, '[thisComp.width / 2, thisComp.height / 2]');
    spec.expr(s.layer, P.opacity, `thisComp.width == ${s.source.w} && thisComp.height == ${s.source.h} ? 100 : 0`);
  }
  addQaPatch(spec, tokens.color.base.green.hex);
  spec.add(nul('CTRL', [{ kind: 'checkbox', name: 'QA', value: false }]));

  const built = spec.toJSON();
  const files = with4k(FORMATS.map((fmt) => ({ key: fmt, variant: fmt, ctrl: {}, kind: 'clip', seconds: DURATION, options: {} })));
  return {
    id: ID,
    workDir: workDir(),
    out: { dir: workPath('build', ID), aep: workPath('build', ID, ID + '_work.aep') },
    comp: spec.comp,
    pack,
    ctrl: {},
    text: {},
    egp: [],
    rig: {},
    markers: [],
    duration: { introSec: 0, holdSec: DURATION, outroSec: 0 },
    files,
    spec: {
      ...built,
      fonts: [],
      markers: [],
      transplant: {
        aep: workPath('build', SHOT.id, `${SHOT.id}_v${SHOT.version}.aep`),
        folder: 'BK_DECOR',
        source: shots[0].source,
        comps: shots.map((s) => ({
          name: s.decor,
          source: s.source,
          keep: SHOT.layers.map((name, i) => ({ index: i + 1, name })),
          set: Object.entries(SHOT_CTRL).map(([name, value]) => ({ layer: 'CTRL', path: ['effect', name, 'ADBE Dropdown Control', 1], value })),
        })),
      },
      egp: [],
      egpNames: [],
      measure: [],
      defaults: { text: {}, ctrl: {} },
    },
    check: {},
    version: 1,
    variants: [...FORMATS, '16x9_4K'].map((key) => ({ key, ...tokens.video.formats[key] })),
    sweepTimes: [0, 1, pack.freeze, r6(DURATION - 1 / FPS)],
    rest: pack.freeze,
  };
}

export const resolve = resolveOutro;

// The library entry (library.src.json): a T2 clip, opaque, a file per format.
export function libraryEntry(p = resolveOutro()) {
  return {
    id: ID,
    title_ru: 'Аутро подкаста',
    category: 'podcast',
    tier: 'T2',
    hosts: ['ae', 'pr'],
    version: p.version,
    duration: p.duration,
    variants: p.files.map((f) => {
      const v = p.variants.find((x) => x.key === f.variant);
      return { key: f.key, aspect: aspectOf(f.variant), w: v.w, h: v.h, fps: FPS, ...packOf(f), minHostVersion: { ae: '26.0', pr: '26.0' } };
    }),
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = resolveOutro();
  console.log(JSON.stringify({ layers: r.spec.order, pack: r.pack, comps: r.spec.transplant.comps.map((c) => [c.name, c.source.name, c.set.length]), expressions: r.spec.expressions.map((e) => `${e.layer} ${e.path.join('/')}: ${e.expr}`) }, null, 1));
}
