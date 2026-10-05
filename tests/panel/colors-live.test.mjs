// A dry run of the live colour checks (tests/live/colors.mjs) on the AE fake, the test-bed steps in JS.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { composeHost } from '../../panel/host/compose.mjs';
import { Bridge } from '../../panel/src/bridge/bridge.ts';
import { runColorsLive } from '../live/colors.mjs';
import { Report } from '../live/runner.mjs';

const FAKE_AE = readFileSync(new URL('./fake-ae.js', import.meta.url), 'utf8');
const ok = (data) => ({ checks: [{ name: 'step', pass: true }], data });

describe('live colour checks, dry', () => {
  it('runs every case on the fake', async () => {
    const ctx = vm.createContext({});
    vm.runInContext(FAKE_AE, ctx);
    const run = (code) => vm.runInContext(code, ctx);
    const BUNDLE = composeHost();
    const bridge = new Bridge({ evalScript: async (s) => { try { return String(run(s)); } catch { return 'EvalScript error.'; } }, loadHost: async () => void run(BUNDLE), sleep: async () => undefined });
    const hostRun = async (op, p) => {
      if (op === 'setup') {
        run(`app.project.file = new File(${JSON.stringify(p.project)})`);
        return ok({ ids: { colors: String(run('__ae.userComp(1920, 1080, 25, 0).id')) } });
      }
      if (op === 'colorLayers') {
        run(`var c = app.project.activeItem;
          __ae.addLayer(c, 'BK Shape', 'shape', { groups: 2 });
          __ae.addLayer(c, 'BK Keyed', 'shape', { groups: 1, fill: { keys: [0, 2] } });
          __ae.addLayer(c, 'BK Expr', 'shape', { groups: 1, fill: { expression: '[1, 0, 1, 1]' } });
          __ae.addLayer(c, 'BK Text', 'text');
          c.layers.addSolid([1, 1, 1], 'BK Solid', 400, 200, 1, 60);`);
        return ok({});
      }
      if (op === 'select') {
        ctx.__names = p.names;
        run(`app.project.activeItem._layers.forEach(function (l) { l.selected = __names.indexOf(l.name) >= 0; }); app.project.activeItem.time = ${p.time};`);
        return ok({});
      }
      if (op === 'colorRead') {
        return ok({ colors: run(`(function () { var c = app.project.activeItem; var out = {};
          c._layers.forEach(function (l) {
            var rec = { fills: [], strokes: [], fillKeys: 0, text: null, solid: null };
            for (var g = 1; l._contents && g <= l._contents.numProperties; g++) {
              var inner = l._contents.property(g).property(1);
              var fill = inner.property(1).property(1);
              var stroke = inner.property(2).property(1);
              rec.fills.push(fill.valueAtTime(c.time));
              rec.strokes.push(stroke.valueAtTime(c.time));
              rec.fillKeys += fill.numKeys;
            }
            if (l._sourceText) rec.text = l._sourceText.value.fillColor;
            if (l.source.mainSource instanceof SolidSource) rec.solid = l.source.mainSource.color;
            var fills = l._fx.filter(function (e) { return e.matchName === 'ADBE Fill'; });
            rec.fillEffects = fills.length;
            rec.fillEffect = fills.length ? fills[fills.length - 1]._color.value : null;
            out[l.name] = rec;
          });
          return out; })()`) });
      }
      return ok({});
    };
    const R = new Report('ae');
    await bridge.call('ping');
    await runColorsLive({ bridge, hostRun, project: 'C:/CRBK/work/panel-live/ae/colors_live.aep', R });
    expect(R.failed()).toEqual([]);
    const names = R.checks.map((c) => c.name);
    for (const n of ['colors fill: both rectangles green, alpha kept, strokes untouched', 'colors keyed: a third key at 5 s, the colour there is #A068FF', 'colors expression: nothing changed', 'colors none: the adapter refuses too', 'colors solid: the solid is #F2F2F2', 'colors effect: the effect added', 'colors effectAgain: one Fill effect on each layer, #A068FF']) {
      expect(names).toContain(n);
    }
  });
});
