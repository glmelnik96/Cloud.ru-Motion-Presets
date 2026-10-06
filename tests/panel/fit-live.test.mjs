// A dry run of the live check of «Вписать в окно» (tests/live/fit.mjs) on the Premiere fake: the test-bed
// steps in JS, the rendered frame answered from where the fake left the clip (Motion and Crop).
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { composeHost } from '../../panel/host/compose.mjs';
import { Bridge } from '../../panel/src/bridge/bridge.ts';
import { runFitLive } from '../live/fit.mjs';
import { Report } from '../live/runner.mjs';

const FAKE = readFileSync(new URL('./fake-pr.js', import.meta.url), 'utf8');
const BUNDLE = composeHost();
const example = JSON.parse(readFileSync(new URL('../../docs/library/example.src.json', import.meta.url), 'utf8'));
const ok = (data) => ({ checks: [{ name: 'step', pass: true }], data });

function dry({ effects = ['Crop'] } = {}) {
  const ctx = vm.createContext({});
  vm.runInContext(FAKE, ctx);
  vm.runInContext(BUNDLE, ctx);
  const run = (code) => vm.runInContext(code, ctx);
  run(`__pr.effects = ${JSON.stringify(effects)};`);
  const bridge = new Bridge({ evalScript: async (s) => String(run(s)), loadHost: async () => undefined, sleep: async () => undefined });
  const hostRun = async (op, p) => {
    if (op === 'setup') {
      run(`__pr.sequence(1920, 1080, 25, 3, 0);`);
      return ok({ ids: { fit: 'seq-Edit' } });
    }
    if (op === 'fitPlace') {
      run(`__pr.addMedia(${JSON.stringify(p.file)}, 5, true, 1920, 1080);
        app.project.activeSequence._tracks.forEach(function (t) { t._clips.forEach(function (c) { c._selected = false; }); });
        __pr.clipOf(${JSON.stringify(p.file)}, ${p.track}, ${p.startSec}, true);`);
      return ok({});
    }
    if (op === 'activate') {
      run(`app.project.activeSequence._player = ${p.time} * TPS;`);
      return ok({});
    }
    return ok({});
  };
  // The box of the selected clip on the frame: Motion (normalized centre, scale of the 1920x1080 source) and Crop.
  const boxes = {};
  const frame = async (id, f, key) => {
    boxes[key] = JSON.parse(run(`(function () { var c = null; app.project.activeSequence._tracks[1]._clips.forEach(function (x) { if (x._selected) c = x; });
      var m = c._components[1].properties, s = m[1].getValue() / 100, p = m[0].getValue();
      var cr = c._components[2] ? c._components[2].properties : null, k = function (i) { return cr ? cr[i].getValue() / 100 : 0; };
      var w = 1920 * s, h = 1080 * s, x = p[0] * 1920 - w / 2, y = p[1] * 1080 - h / 2;
      return JSON.stringify({ x0: x + w * k(0), y0: y + h * k(1), w: w * (1 - k(0) - k(2)), h: h * (1 - k(1) - k(3)) }); })()`));
    return key;
  };
  return { bridge, hostRun, frame, colorBox: (key) => boxes[key] };
}

describe('live fit check, dry', () => {
  it('runs both windows on the fake', async () => {
    const d = dry();
    const R = new Report('pr');
    await runFitLive({ ...d, R, clips: { screen: 'C:/w/fit-screen.png', speaker: 'C:/w/fit-speaker.png' }, item: example.items.find((i) => i.id === 'WEB_Screen') });
    expect(R.failed()).toEqual([]);
    expect(R.checks.map((c) => c.name)).toContain('fit speaker: the colour fills the window 1440,162 384x720 and nothing else (±4 px)');
  });

  it('without Crop the speaker window fails its checks', async () => {
    const d = dry({ effects: [] });
    const R = new Report('pr');
    await runFitLive({ ...d, R, clips: { screen: 'a', speaker: 'b' }, item: example.items.find((i) => i.id === 'WEB_Screen') });
    expect(R.failed()).toEqual(['fit speaker: Crop added through QE and set', 'fit speaker: the colour fills the window 1440,162 384x720 and nothing else (±4 px)']);
  });
});
