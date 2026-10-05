// Live checks of the «Эффекты» tab in After Effects (spec 6.1 step 7, 8.3 «каждый .ffx»): the panel code —
// planPreset and runPreset through the Bridge — on a scratch comp with a text layer and a solid, and the
// effects the test bed reads back. Stand-ins for the brand presets: AE's own Fade Up Characters (text) and
// Linear Wipe (any layer), as in S4. tests/panel/effects-live.test.mjs runs it dry on the fake.
import { planPreset, runPreset } from '../../panel/src/core/effects.ts';

const near = (a, b, eps = 0.021) => a !== null && Math.abs(Number(a) - Number(b)) <= eps;

export const EFFECT_CASES = [
  { key: 'text', id: 'FX_TextRise', select: ['BK Имя'], time: 2, expect: { changed: ['BK Имя'], warn: [] } },
  { key: 'plate', id: 'FX_PlateGrow', select: ['BK Плашка'], time: 4, expect: { changed: ['BK Плашка'], warn: [] } },
  { key: 'mixed', id: 'FX_TextRise', select: ['BK Имя', 'BK Плашка'], time: 6, expect: { changed: ['BK Имя'], warn: ['PRESET_PARTIAL'] } },
  { key: 'none', id: 'FX_PlateGrow', select: [], time: 8, expect: { refused: 'NO_SELECTION' } },
];

export async function runEffectsLive(o) {
  const { bridge, hostRun, catalog, R } = o;
  const byId = new Map(catalog.items.map((i) => [i.id, i]));
  const setup = R.fromHost('effects: setup', await hostRun('setup', { project: o.project, targets: [{ key: 'effects', name: 'BK effects', w: 1920, h: 1080, fps: 25, dur: 30 }] }));
  const id = setup?.ids?.effects;
  if (!id) return;
  R.fromHost('effects: layers', await hostRun('fxLayers', { id }));
  const read = async (step) => (R.fromHost(step, await hostRun('fxRead', { id }))?.fx ?? []);
  let before = await read('effects: read before');

  for (const c of EFFECT_CASES) {
    const item = byId.get(c.id);
    if (!R.check(`effects ${c.key}: ${c.id} is in the catalog`, Boolean(item), c.id)) continue;
    R.fromHost(`effects ${c.key}: select`, await hostRun('select', { id, names: c.select, time: c.time }));
    const ctx = (await bridge.call('getContext')).data;
    R.check(`effects ${c.key}: getContext counts ${c.select.length} selected layers`, ctx?.selection === c.select.length, ctx?.selection);
    const plan = planPreset(item, ctx, o.libraryRoot);
    if (c.expect.refused) {
      R.check(`effects ${c.key}: refused before the host (${c.expect.refused})`, !plan.ok && plan.problems[0]?.code === c.expect.refused, plan.problems);
      // The adapter refuses as well: AE would put the preset on a new solid.
      const direct = await bridge.call('applyPreset', { ...planPreset(item, { ...ctx, selection: 1 }, o.libraryRoot).request }, { mutating: true });
      const after = await read(`effects ${c.key}: read`);
      R.check(`effects ${c.key}: the adapter refuses too and adds no layer`, direct.error?.code === 'NO_SELECTION' && after.length === before.length, { direct, layers: after.map((l) => l.name) });
      continue;
    }
    if (!R.check(`effects ${c.key}: planned`, plan.ok, plan.problems)) continue;
    const out = await runPreset(bridge, plan.request);
    R.check(`effects ${c.key}: applied to ${c.expect.changed.join(', ')}`, out.ok && out.reply.layers.filter((l) => l.changed).map((l) => l.name).join() === c.expect.changed.join(), out);
    R.check(`effects ${c.key}: warnings ${c.expect.warn.join(', ') || 'none'}`, out.problems.map((p) => p.code).join() === c.expect.warn.join(), out.problems);
    const after = await read(`effects ${c.key}: read`);
    for (const name of c.expect.changed) {
      const a = after.find((l) => l.name === name);
      const b = before.find((l) => l.name === name);
      R.check(`effects ${c.key}: ${name} got an effect or text animator`, a && b && (a.effects > b.effects || a.animators > b.animators), { before: b, after: a });
      // firstKeySec is the earliest key of the layer: it shows the preset's start only on a layer without keys.
      if (b && b.firstKey === null) {
        const rep = out.reply.layers.find((l) => l.name === name);
        R.check(`effects ${c.key}: ${name} keys start at the current time, ${c.time} s`, rep && near(rep.firstKeySec, c.time) && near(a?.firstKey, c.time), { reply: rep, read: a });
      }
    }
    R.check(`effects ${c.key}: no new layer`, after.length === before.length && out.reply.newLayers.length === 0, out.reply.newLayers);
    before = after;
  }
  R.fromHost('effects: save', await hostRun('save', {}));
}
