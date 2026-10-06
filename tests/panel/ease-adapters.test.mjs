// applyEase of the AE adapter on the fake, and the chain core -> bridge -> adapter: the brand curve between
// neighbouring selected keys, one ease entry per dimension, the other side of each key kept, one undo group.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { composeHost } from '../../panel/host/compose.mjs';
import { Bridge } from '../../panel/src/bridge/bridge.ts';
import { brandCurves, planEase, runEase } from '../../panel/src/core/ease.ts';

const FAKE = readFileSync(new URL('./fake-ae.js', import.meta.url), 'utf8');
const BUNDLE = composeHost();

function ae(setup) {
  const ctx = vm.createContext({});
  vm.runInContext(FAKE, ctx);
  vm.runInContext(BUNDLE, ctx);
  const run = (code) => vm.runInContext(code, ctx);
  run(`var comp = __ae.userComp(1920, 1080, 25, 0);`);
  if (setup) run(setup);
  const call = (fn, args) => JSON.parse(run(`BK.call(${JSON.stringify(fn)}, ${JSON.stringify(JSON.stringify(args ?? null))})`));
  const bridge = new Bridge({ evalScript: async (s) => String(run(s)), loadHost: async () => undefined, sleep: async () => undefined });
  return { run, call, bridge };
}

const keys = (h, name) => JSON.parse(h.run(`JSON.stringify(comp._selectedProps.filter(function (p) { return p.name === ${JSON.stringify(name)}; })[0]._keys)`));

describe('AE applyEase', () => {
  it('the curve between each pair of selected keys; the outer sides stay; Scale gets three entries', () => {
    const h = ae(`__ae.keyProp(comp, 'Плашка', 'Position', 1, [0, 0.8, 2, 3], [1, 2, 3]); __ae.keyProp(comp, 'Плашка', 'Scale', 3, [0, 1], [1, 2]);`);
    const r = h.call('applyEase', { targetId: h.run('String(comp.id)'), curve: 'M4.in', outInfluence: 67, inInfluence: 89, undoLabel: 'BrandKit: кривая' });
    expect(r.data).toEqual({ props: [{ name: 'Position', layer: 'Плашка', pairs: 2 }, { name: 'Scale', layer: 'Плашка', pairs: 1 }], single: [] });
    const pos = keys(h, 'Position');
    expect(pos[0].outEase).toEqual([{ speed: 0, influence: 67 }]);
    expect(pos[0].inEase).toEqual([{ speed: 0, influence: 16.666667 }]);
    expect(pos[1].inEase).toEqual([{ speed: 0, influence: 89 }]);
    expect(pos[1].outEase).toEqual([{ speed: 0, influence: 67 }]);
    expect(pos[2].inEase).toEqual([{ speed: 0, influence: 89 }]);
    // the unselected key 4 is untouched, and so is the out side of the last selected key
    expect(pos[2].outEase).toEqual([{ speed: 0, influence: 16.666667 }]);
    expect(pos[3].inEase).toEqual([{ speed: 0, influence: 16.666667 }]);
    expect(keys(h, 'Scale')[0].outEase).toHaveLength(3);
    expect(h.run('JSON.stringify(__ae.undo)')).toBe('["begin BrandKit: кривая","end"]');
  });

  it('one selected key is named, nothing is changed', () => {
    const h = ae(`__ae.keyProp(comp, 'L', 'Opacity', 1, [0, 1], [2]);`);
    expect(h.call('applyEase', { targetId: h.run('String(comp.id)'), outInfluence: 50, inInfluence: 50 }).data).toEqual({ props: [], single: ['Opacity'] });
    expect(h.run(`__ae.calls.filter(function (c) { return /^ease/.test(c); }).length`)).toBe(0);
  });

  it('the chain from the curve of the canon', async () => {
    const h = ae(`__ae.keyProp(comp, 'Плашка', 'Scale', 3, [0, 0.8], [1, 2]);`);
    const ctx = { host: 'ae', version: '26.5', project: { saved: true, path: null }, target: { kind: 'comp', id: h.run('String(comp.id)'), name: 'Main', w: 1920, h: 1080, fps: 25, timeSec: 0, durationSec: 60 } };
    const out = await runEase(h.bridge, planEase(ctx, brandCurves().find((c) => c.key === 'M1.titles.in')).request);
    expect(out).toMatchObject({ ok: true, problems: [] });
    const k = keys(h, 'Scale');
    expect(k[0].outEase.map((e) => e.influence)).toEqual([33.3, 33.3, 33.3]);
    expect(k[1].inEase.map((e) => e.influence)).toEqual([100, 100, 100]);
  });
});
