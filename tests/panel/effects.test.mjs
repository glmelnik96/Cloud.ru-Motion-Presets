// Effects in After Effects (panel/src/core/effects.ts, applyPreset of panel/host/ae.jsx) on the AE fake:
// the preset goes on the selected layers at the current time, in one undo group; no selection is refused
// before AE would make a new solid (S4); a layer the preset does not fit is reported.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { composeHost } from '../../panel/host/compose.mjs';
import { Bridge } from '../../panel/src/bridge/bridge.ts';
import { planPreset, runPreset } from '../../panel/src/core/effects.ts';
import { exampleItem } from './fixtures.ts';

const FAKE_AE = readFileSync(new URL('./fake-ae.js', import.meta.url), 'utf8');
const BUNDLE = composeHost();
const LIB = 'C:/ProgramData/CloudRuBrandKit/library';

function ae({ select = ['Имя'] } = {}) {
  const ctx = vm.createContext({});
  vm.runInContext(FAKE_AE, ctx);
  vm.runInContext(BUNDLE, ctx);
  const run = (code) => vm.runInContext(code, ctx);
  run(`__ae.userComp(1920, 1080, 25, 3);
    __ae.addLayer(app.project.activeItem, 'Плашка', 'solid');
    __ae.addLayer(app.project.activeItem, 'Имя', 'text');`);
  ctx.__sel = select;
  run(`app.project.activeItem._layers.forEach(function (l) { l.selected = __sel.indexOf(l.name) >= 0; })`);
  for (const [id, text] of [['FX_TextRise', true], ['FX_PlateGrow', false]]) {
    run(`__ae.files['${LIB}/items/${id}/${id}_ffx_v1.ffx'] = 'ffx'; __ae.presets['${LIB}/items/${id}/${id}_ffx_v1.ffx'] = { text: ${text} };`);
  }
  const bridge = new Bridge({ evalScript: async (s) => String(run(s)) });
  return { run, bridge, ctx: async () => (await bridge.call('getContext')).data };
}

describe('effects', () => {
  it('plans a preset only in AE, only with a selection', async () => {
    const h = ae();
    const item = exampleItem('FX_TextRise');
    const ctx = await h.ctx();
    expect(ctx.selection).toBe(1);
    expect(planPreset(item, ctx, LIB)).toMatchObject({ ok: true, request: { file: `${LIB}/items/FX_TextRise/FX_TextRise_ffx_v1.ffx`, timeSec: 3, selection: 1 } });
    expect(planPreset(item, { ...ctx, selection: 0 }, LIB).problems.map((p) => p.code)).toEqual(['NO_SELECTION']);
    expect(planPreset(item, { ...ctx, host: 'pr' }, LIB).problems.map((p) => p.code)).toEqual(['NOT_SUPPORTED']);
  });

  it('applies the text preset to the selected text layer at the current time, one undo group', async () => {
    const h = ae();
    const out = await runPreset(h.bridge, planPreset(exampleItem('FX_TextRise'), await h.ctx(), LIB).request);
    expect(out).toMatchObject({ ok: true, problems: [] });
    expect(out.reply.layers).toEqual([{ name: 'Имя', layerId: expect.any(Number), changed: true, firstKeySec: 3 }]);
    expect(h.run('__ae.undo')).toEqual(['begin BrandKit: Подъём текста по словам', 'applyPreset FX_TextRise_ffx_v1.ffx suppress=1', 'end']);
    expect(h.run('__ae.suppress')).toBe(0);
  });

  it('says which selected layers the preset did not fit, and refuses when it fit none', async () => {
    const h = ae({ select: ['Имя', 'Плашка'] });
    const out = await runPreset(h.bridge, planPreset(exampleItem('FX_TextRise'), await h.ctx(), LIB).request);
    expect(out.ok).toBe(true);
    expect(out.problems.map((p) => [p.code, p.message])).toEqual([['PRESET_PARTIAL', 'К слоям Плашка пресет не применился: возможно, он для другого типа слоя.']]);
    const h2 = ae({ select: ['Плашка'] });
    const none = await runPreset(h2.bridge, planPreset(exampleItem('FX_TextRise'), await h2.ctx(), LIB).request);
    expect(none.problems.map((p) => p.code)).toEqual(['PRESET_NO_EFFECT']);
    const plate = await runPreset(h2.bridge, planPreset(exampleItem('FX_PlateGrow'), await h2.ctx(), LIB).request);
    expect(plate).toMatchObject({ ok: true, problems: [] });
  });

  it('refuses in the host too when the selection is gone, and never makes a new solid', async () => {
    const h = ae();
    const req = planPreset(exampleItem('FX_PlateGrow'), await h.ctx(), LIB).request;
    h.run('app.project.activeItem._layers.forEach(function (l) { l.selected = false; })');
    const out = await runPreset(h.bridge, req);
    expect(out.problems.map((p) => p.code)).toEqual(['NO_SELECTION']);
    expect(h.run('app.project.activeItem.numLayers')).toBe(2);
    expect(h.run('__ae.undo')).toEqual([]);
  });

  it('reports a missing preset file without touching the comp', async () => {
    const h = ae();
    const req = { ...planPreset(exampleItem('FX_PlateGrow'), await h.ctx(), LIB).request, file: `${LIB}/items/FX_Gone/FX_Gone_ffx_v1.ffx` };
    const out = await runPreset(h.bridge, req);
    expect(out.problems[0]).toMatchObject({ code: 'INSERT_FAILED' });
    expect(h.run('__ae.undo')).toEqual([]);
  });
});
