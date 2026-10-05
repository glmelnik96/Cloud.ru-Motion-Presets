// A dry run of the live effects checks (tests/live/effects.mjs) on the AE fake, the test-bed steps in JS.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { composeHost } from '../../panel/host/compose.mjs';
import { Bridge } from '../../panel/src/bridge/bridge.ts';
import { runEffectsLive } from '../live/effects.mjs';
import { Report } from '../live/runner.mjs';
import { exampleCatalog } from './fixtures.ts';

const FAKE_AE = readFileSync(new URL('./fake-ae.js', import.meta.url), 'utf8');
const LIB = 'C:/ProgramData/CloudRuBrandKit/library';
const ok = (data) => ({ checks: [{ name: 'step', pass: true }], data });

describe('live effects checks, dry', () => {
  it('runs every case on the fake', async () => {
    const ctx = vm.createContext({});
    vm.runInContext(FAKE_AE, ctx);
    const run = (code) => vm.runInContext(code, ctx);
    const BUNDLE = composeHost();
    const bridge = new Bridge({ evalScript: async (s) => { try { return String(run(s)); } catch { return 'EvalScript error.'; } }, loadHost: async () => void run(BUNDLE), sleep: async () => undefined });
    for (const [id, text] of [['FX_TextRise', true], ['FX_PlateGrow', false]]) {
      run(`__ae.files['${LIB}/items/${id}/${id}_ffx_v1.ffx'] = 'ffx'; __ae.presets['${LIB}/items/${id}/${id}_ffx_v1.ffx'] = { text: ${text} };`);
    }
    const hostRun = async (op, p) => {
      if (op === 'setup') {
        run(`app.project.file = new File(${JSON.stringify(p.project)})`);
        return ok({ ids: { effects: String(run('__ae.userComp(1920, 1080, 25, 0).id')) } });
      }
      if (op === 'fxLayers') {
        run(`__ae.addLayer(app.project.activeItem, 'BK Имя', 'text'); __ae.addLayer(app.project.activeItem, 'BK Плашка', 'solid');`);
        return ok({});
      }
      if (op === 'select') {
        ctx.__names = p.names;
        run(`app.project.activeItem._layers.forEach(function (l) { l.selected = __names.indexOf(l.name) >= 0; }); app.project.activeItem.time = ${p.time};`);
        return ok({});
      }
      if (op === 'fxRead') {
        return ok({ fx: run(`app.project.activeItem._layers.map(function (l) {
          var keys = l._fx.concat(l._animators).map(function (g) { return g.property(1).keyTime(1); });
          return { name: l.name, effects: l._fx.length, animators: l._animators.length, firstKey: keys.length ? Math.min.apply(null, keys) : null }; })`) });
      }
      return ok({});
    };
    const R = new Report('ae');
    await bridge.call('ping');
    await runEffectsLive({ bridge, hostRun, catalog: exampleCatalog(), libraryRoot: LIB, project: 'C:/CRBK/work/panel-live/ae/effects_live.aep', R });
    expect(R.failed()).toEqual([]);
    const names = R.checks.map((c) => c.name);
    expect(names).toContain('effects mixed: warnings PRESET_PARTIAL');
    expect(names).toContain('effects none: the adapter refuses too and adds no layer');
    expect(names).toContain('effects text: BK Имя keys start at the current time, 2 s');
  });
});
