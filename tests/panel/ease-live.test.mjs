// A dry run of the live check of «Движение» (tests/live/ease.mjs) on the AE fake: the test-bed steps in JS.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { composeHost } from '../../panel/host/compose.mjs';
import { Bridge } from '../../panel/src/bridge/bridge.ts';
import { runEaseLive } from '../live/ease.mjs';
import { Report } from '../live/runner.mjs';

const FAKE = readFileSync(new URL('./fake-ae.js', import.meta.url), 'utf8');
const BUNDLE = composeHost();
const ok = (data) => ({ checks: [{ name: 'step', pass: true }], data });

function dry({ selectThird = false } = {}) {
  const ctx = vm.createContext({});
  vm.runInContext(FAKE, ctx);
  vm.runInContext(BUNDLE, ctx);
  const run = (code) => vm.runInContext(code, ctx);
  const bridge = new Bridge({ evalScript: async (s) => String(run(s)), loadHost: async () => undefined, sleep: async () => undefined });
  const hostRun = async (op) => {
    if (op === 'setup') return ok({ ids: { ease: run('var comp = __ae.userComp(1920, 1080, 25, 0); String(comp.id)') } });
    if (op === 'easeLayer') {
      run(`__ae.keyProp(comp, 'BK Ease', 'Position', 1, [0, 0.8, 2], ${selectThird ? '[1, 2, 3]' : '[1, 2]'}); __ae.keyProp(comp, 'BK Ease', 'Scale', 3, [0, 1.16], [1, 2]);`);
      return ok({});
    }
    if (op === 'easeRead') {
      return ok({ eases: JSON.parse(run(`(function () { var out = {}; comp._selectedProps.forEach(function (p) { out['ADBE ' + p.name] = p._keys.map(function (k) {
        return { inEase: k.inEase, outEase: k.outEase, out: k.outI === KeyframeInterpolationType.BEZIER ? 'bezier' : 'other' }; }); }); return JSON.stringify(out); })()`)) });
    }
    return ok({});
  };
  return { bridge, hostRun };
}

describe('live «Движение» check, dry', () => {
  it('passes on the fake', async () => {
    const R = new Report('ae');
    await runEaseLive({ ...dry(), R, project: 'C:/w/ease_live.aep' });
    expect(R.failed()).toEqual([]);
    expect(R.checks.map((c) => c.name)).toContain('ease: Scale has the curve in every dimension');
  });

  it('catches a curve set beyond the selected keys', async () => {
    const R = new Report('ae');
    await runEaseLive({ ...dry({ selectThird: true }), R, project: 'C:/w/ease_live.aep' });
    expect(R.failed()).toEqual(['ease: set on Position and Scale, one pair each']);
  });
});
