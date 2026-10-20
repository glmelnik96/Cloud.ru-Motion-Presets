// Live check of «Движения» in After Effects (panel/src/core/rigs.ts, panel/host/ae-rigs.jsx): fresh layers per
// movement in a scratch comp, each movement through planRig, runRig and the Bridge at 1 s, then the test bed reads
// back what is on the layers — keys, values, eases, text animators, masks, the noise mattes, the expressions (and
// whether AE evaluates them without an error).
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { brandRigs, planRig, runRig } from '../../panel/src/core/rigs.ts';
import { waitForStableFiles } from '../../tools/golden/png.mjs';
import { blit } from '../../tools/masters/contact-sheet.mjs';
import { readPng } from '../../tools/png/read-png.mjs';

const near = (a, b, eps = 0.01) => Math.abs(Number(a) - Number(b)) <= eps;
const allNear = (a, b, eps) => Array.isArray(a) && a.length === b.length && a.every((x, i) => near(x, b[i], eps));
const T0 = 1;

// The cases on a grid of 4 x 4 cells of 480 x 270 in the 1920 x 1080 comp, each with its label above.
const cell = (col, row) => ({ x: 240 + 480 * col, y: 150 + 270 * row });
export const RIG_LAYERS = [
  { name: 'P1', kind: 'shape', ...cell(0, 0) },
  { name: 'T1', kind: 'text', ...cell(1, 0) }, { name: 'P2', kind: 'shape', ...cell(2, 3) },
  { name: 'T2', kind: 'text', ...cell(2, 0) },
  { name: 'S1', kind: 'solid', ...cell(3, 0) },
  { name: 'S2', kind: 'solid', ...cell(0, 1) },
  { name: 'S3', kind: 'solid', ...cell(1, 1) },
  { name: 'P3', kind: 'shape', ...cell(2, 1) },
  { name: 'P4', kind: 'shape', ...cell(3, 1) }, { name: 'P5', kind: 'shape', separated: true, ...cell(0, 2) },
  { name: 'H1', kind: 'hatch', ...cell(1, 2) }, { name: 'P6', kind: 'shape', ...cell(3, 3) },
  { name: 'P7', kind: 'shape', ...cell(2, 2) },
  { name: 'S4', kind: 'solid', ...cell(3, 2) },
];
const LABELS = [
  ['M1 плашка по X', 0, 0], ['M2 подъём текста', 1, 0], ['M3 подъём строк', 2, 0], ['M4 маска ↕ (вход, выход в 3 с)', 3, 0],
  ['M6 флип куба', 0, 1], ['M7 блоки', 1, 1], ['M8 пролёт по Z', 2, 1], ['M10 дрейф (1)', 3, 1],
  ['M10 дрейф (2, X/Y отдельно)', 0, 2], ['M11 штриховка', 1, 2], ['M12 поп куба', 2, 2], ['M9 сетка', 3, 2],
  ['пропущен: не текст (M2)', 2, 3], ['пропущен: нет повторителя (M11)', 3, 3],
].map(([text, col, row]) => ({ text, x: 240 + 480 * col, y: 40 + 270 * row }));
// Frames of the comp for the sheet: the movements on their way, then at rest, and the exit of M4.
const SHEET_TIMES = [1.2, 1.5, 2.2, 3.6];

export async function runRigsLive(o) {
  const { bridge, hostRun, R } = o;
  const setup = R.fromHost('rigs: setup', await hostRun('setup', { project: o.project, targets: [{ key: 'rigs', name: 'BK rigs', w: 1920, h: 1080, fps: 25, dur: 70 }] }));
  const id = setup?.ids?.rigs;
  if (!id) return;
  if (!R.fromHost('rigs: layers', await hostRun('rigLayers', { id, layers: RIG_LAYERS, labels: LABELS }))) return;
  const rigs = brandRigs();
  const apply = async (key, names, time = T0) => {
    if (!R.fromHost(`rigs: ${key}: select ${names.join(', ')}`, await hostRun('select', { id, names, time }))) return null;
    const ctx = (await bridge.call('getContext')).data;
    const plan = planRig(ctx, rigs.find((r) => r.key === key));
    if (!R.check(`rigs: ${key}: planned`, !!plan.request, plan.problems)) return null;
    const out = await runRig(bridge, plan.request);
    return R.check(`rigs: ${key}: applied`, out.ok, out) ? out : null;
  };
  const read = async (names) => R.fromHost(`rigs: read ${names.join(', ')}`, await hostRun('rigRead', { id, names }));
  const times = (keys) => (keys ?? []).map((k) => k.t);

  // M1: Scale X from 0 to the plate as it is
  if (await apply('M1.titles.in', ['P1'])) {
    const l = (await read(['P1']))?.layers?.P1;
    const k = l?.transform['ADBE Scale']?.keys;
    R.check('rigs: M1 Scale X 0 -> 100 at 1 and 1.8 s, Y kept, the ease of the titles', allNear(times(k), [1, 1.8], 1e-3) && k[0].v[0] === 0 && k[1].v[0] === 100 && k[0].v[1] === 100
      && k[0].outEase.every((e) => near(e.influence, 33.3) && e.speed === 0) && k[1].inEase.every((e) => near(e.influence, 100)) && k[0].outI === 'bezier', k);
  }

  // M2: an animator of words on the text, the shape skipped
  const m2 = await apply('M2.podcast.in', ['T1', 'P2']);
  if (m2) {
    R.check('rigs: M2 the shape is skipped as not a text layer', m2.reply.layers.find((x) => x.name === 'P2')?.skipped === 'text' && m2.problems.some((p) => p.code === 'RIG_SKIPPED'), m2.reply);
    const l = (await read(['T1']))?.layers?.T1;
    const a = l?.animators?.[0];
    R.check('rigs: M2 animator «BrandKit M2» by words, Position 1.15 of the block, Start 0 -> 100 at 1 and 1.92 s',
      l?.animators.length === 1 && a.name === 'BrandKit M2' && a.basedOn === 3 && near(a.position[1], 1.15 * l.rect.height, 0.01) && a.position[0] === 0
      && allNear(times(a.start), [1, 1.92], 1e-3) && a.start[0].v === 0 && a.start[1].v === 100 && near(a.start[0].outEase[0].influence, 41), { a, rect: l?.rect });
  }

  // M3: the line rises on an animator of all characters; its mask opens at the end
  if (await apply('M3.in', ['T2'])) {
    const l = (await read(['T2']))?.layers?.T2;
    const a = l?.animators?.[0];
    const m = l?.masks?.[0];
    R.check('rigs: M3 animator «BrandKit M3» of characters, Position 1.1 of the block -> 0 at 1 and 1.64 s',
      a?.name === 'BrandKit M3' && a.basedOn === 1 && allNear(times(a.position), [1, 1.64], 1e-3) && near(a.position[0].v[1], 1.1 * l.rect.height, 0.01) && a.position[1].v[1] === 0, { a, rect: l?.rect });
    R.check('rigs: M3 mask «BrandKit M3» opens its lower edge at 1.36 -> 1.64 s', m?.name === 'BrandKit M3' && m.mode === 'add' && allNear(times(m.keys), [1.36, 1.64], 1e-3)
      && m.keys[1].v[2][1] > m.keys[0].v[2][1] && near(m.keys[0].v[0][1], m.keys[1].v[0][1]), m);
  }

  // M4: the mask opens down from the top edge at 1 s, and an exit at 3 s closes the same mask after it
  if (await apply('M4.y.in', ['S1']) && await apply('M4.y.out', ['S1'], 3)) {
    const m = (await read(['S1']))?.layers?.S1?.masks;
    const k = m?.[0]?.keys;
    // the solid is 240x120 at 0, 0: margin 2 % of 240 + 2 = 6.8
    R.check('rigs: M4 one mask «BrandKit M4», keys at 1, 2.16, 3, 4.12 s, collapsed at the top, open, closed at the foot',
      m?.length === 1 && m[0].name === 'BrandKit M4' && allNear(times(k), [1, 2.16, 3, 4.12], 1e-3)
      && near(k[0].v[0][1], -6.8) && near(k[0].v[2][1], -6.8) && near(k[1].v[2][1], 126.8) && near(k[3].v[0][1], 126.8) && near(k[0].v[0][0], -6.8) && near(k[0].v[1][0], 246.8)
      && near(k[1].inEase[0].influence, 89), m);
  }

  // M6: a 2D solid made 3D, Rotation X of «Умное облако»
  const m6 = await apply('M6.in', ['S2']);
  if (m6) {
    const l = (await read(['S2']))?.layers?.S2;
    const k = l?.transform['ADBE Rotate X']?.keys;
    R.check('rigs: M6 the layer is made 3D and the panel says so', l?.threeD === true && m6.reply.layers[0].made3D === true && m6.problems.some((p) => p.code === 'RIG_3D'), m6.reply);
    R.check('rigs: M6 Rotation X -90 -> -3.612 -> 0 at 1, 1.667, 2.267 s with the speeds of the pack',
      allNear(times(k), [1, 1.667, 2.267], 1e-3) && allNear(k.map((x) => x.v), [-90, -3.612, 0], 1e-3) && near(k[0].outEase[0].speed, 11930.136, 0.01) && near(k[0].outEase[0].influence, 0.541, 1e-3)
      && near(k[1].inEase[0].speed, 28.415, 1e-3) && near(k[2].inEase[0].influence, 9.877, 1e-3), k);
  }

  // M7 and M9: the noise mattes
  for (const [key, name, n] of [['M7.in', 'S3', 27], ['M9.in', 'S4', 23]]) {
    const out = await apply(key, [name]);
    if (!out) continue;
    const matte = out.reply.layers[0].matte;
    const r = await read([name, matte]);
    const l = r?.layers?.[name];
    const fx = r?.layers?.[matte]?.effects?.[0];
    const at = r?.order?.indexOf(name) ?? -1;
    R.check(`rigs: ${key} a solid «${matte}» right over the layer, its video off, the layer's Luma matte`, at > 0 && r.order[at - 1] === `${matte} (off)` && l.matte.layer === matte && /LUMA/.test(l.matte.type), { order: r?.order, matte: l?.matte });
    R.check(`rigs: ${key} Fractal Noise of the packs, its expression evaluates without an error`,
      fx?.matchName === 'ADBE Fractal Noise' && fx.values[1] === 5 && fx.values[2] === 1 && fx.values[4] === 400 && fx.values[5] === -100 && fx.values[6] === 1
      && fx.expressions[n]?.enabled === true && fx.expressions[n].error === '' && Object.keys(fx.expressions).length === 1, fx);
  }

  // M8: in along Z from the plate as it is, its stroke thins from 48 to its own 4
  if (await apply('M8.in', ['P3'])) {
    const l = (await read(['P3']))?.layers?.P3;
    const k = l?.transform['ADBE Position']?.keys;
    R.check('rigs: M8 3D, Z -645 -> 0 at 1 and 1.92 s, the stroke 48 -> 4 at 1 and 1.8 s',
      l?.threeD === true && allNear(times(k), [1, 1.92], 1e-3) && near(k[0].v[2], -645) && near(k[1].v[2], 0) && near(k[0].v[0], k[1].v[0])
      && allNear(times(l.strokes[0].keys), [1, 1.8], 1e-3) && allNear(l.strokes[0].keys.map((x) => x.v), [48, 4]), { k, strokes: l?.strokes });
  }

  // M10: two neighbours drift in a loop of four segments; the separated one keyed on X and Y Position
  if (await apply('M10.a60', ['P4', 'P5'])) {
    const r = await read(['P4', 'P5']);
    const [top, below] = ['P4', 'P5'].sort((a, b) => r.layers[a].index - r.layers[b].index);
    const plain = r.layers.P4.transform['ADBE Position'];
    const sx = r.layers.P5.transform['ADBE Position_0'];
    const sy = r.layers.P5.transform['ADBE Position_1'];
    const first = (name) => (name === 'P4' ? plain.keys.map((x) => [x.v[0] - plain.keys[0].v[0], x.v[1] - plain.keys[0].v[1]]) : sx.keys.map((x, i) => [x.v - sx.keys[0].v, sy.keys[i].v - sy.keys[0].v]));
    R.check('rigs: M10 five keys 15 s apart from 1 s with loopOut(), evaluating', allNear(times(plain?.keys), [1, 16, 31, 46, 61], 1e-3) && allNear(times(sx?.keys), [1, 16, 31, 46, 61], 1e-3)
      && [plain, sx, sy].every((p) => p.expression === 'loopOut()' && p.expressionEnabled && p.expressionError === ''), { plain, sx, sy });
    R.check('rigs: M10 the top layer the first drawing, the one below the second', JSON.stringify(first(top)) === JSON.stringify([[0, 0], [-60, 0], [-60, 15], [-60, -15], [0, 0]])
      && JSON.stringify(first(below)) === JSON.stringify([[0, 0], [15, -27], [60, -27], [60, -7.5], [0, 0]]), { top: first(top), below: first(below) });
  }

  // M11: the Repeater of the hatch runs; a shape without one is skipped
  const m11 = await apply('M11.in', ['H1', 'P6']);
  if (m11) {
    const l = (await read(['H1']))?.layers?.H1;
    R.check('rigs: M11 Repeater Offset `-100 + time*0.5`, evaluating; the plain shape skipped', l?.repeaters.length === 1 && l.repeaters[0].expression === '-100 + time*0.5' && l.repeaters[0].enabled && l.repeaters[0].error === ''
      && m11.reply.layers.find((x) => x.name === 'P6')?.skipped === 'repeater', { repeaters: l?.repeaters, reply: m11.reply });
  }

  // M12: the logo pop from the plate as it is
  if (await apply('M12.in', ['P7'])) {
    const l = (await read(['P7']))?.layers?.P7;
    const s = l?.transform['ADBE Scale']?.keys;
    const p = l?.transform['ADBE Position']?.keys;
    const op = l?.transform['ADBE Opacity']?.keys;
    R.check('rigs: M12 Scale 132.28 -> 185.19 -> 116.73 -> 100 %, X +196.6 -> +277.1 -> +54.4 -> 0, Opacity 0 -> 100',
      allNear(times(s), [1, 2, 2.75, 3.2], 1e-3) && allNear(s.map((x) => x.v[0]), [132.28, 185.19, 116.73, 100], 0.01)
      && allNear(p.map((x) => x.v[0] - p[3].v[0]), [196.641, 277.065, 54.422, 0], 0.01) && allNear(op.map((x) => x.v), [0, 100], 0.01)
      && near(s[2].inEase[0].speed, -107.371, 0.01) && near(p[2].inEase[0].speed, 349.226, 0.01), { s, p, op });
  }

  // A sheet of the comp at a few times, for the eye: docs/research/panel-live/ae-rigs-sheet.png
  if (o.sheet) {
    mkdirSync(o.framesDir, { recursive: true });
    const frames = SHEET_TIMES.map((t) => ({ compId: id, t, file: path.posix.join(o.framesDir, `rigs-${Math.round(t * 1000)}.png`) }));
    if (R.fromHost('rigs: frames of the comp', await hostRun('frames', { frames }))) {
      await waitForStableFiles(frames.map((f) => f.file), { timeoutMs: 120000 });
      const W = 960;
      const H = 540;
      const sheet = new PNG({ width: W * 2, height: H * 2 });
      frames.forEach((f, i) => blit(sheet, readPng(f.file), (i % 2) * W, Math.floor(i / 2) * H, W, H, [34, 34, 34]));
      writeFileSync(o.sheet, PNG.sync.write(sheet));
      R.check(`rigs: sheet of ${SHEET_TIMES.join(', ')} s written`, true, o.sheet);
    }
  }
}
