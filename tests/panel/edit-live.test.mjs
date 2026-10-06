// A dry run of the live check of «Монтаж» (tests/live/edit.mjs) on the Premiere fake: the test-bed steps in JS,
// the rendered frame answered from where the fake left the copy (its Crop) — sharp inside, grey on the margins.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { composeHost } from '../../panel/host/compose.mjs';
import { Bridge } from '../../panel/src/bridge/bridge.ts';
import { checker, runEditLive } from '../live/edit.mjs';
import { Report } from '../live/runner.mjs';

const FAKE = readFileSync(new URL('./fake-pr.js', import.meta.url), 'utf8');
const BUNDLE = composeHost();
const ok = (data) => ({ checks: [{ name: 'step', pass: true }], data });
const STYLE = { root: 'C:/CRBK/work/materials/premiere', file: 'CR Субтитры.prtextstyle' };

function dry({ effects = ['Crop', 'Fast Blur'], tracks = 3 } = {}) {
  const ctx = vm.createContext({});
  vm.runInContext(FAKE, ctx);
  vm.runInContext(BUNDLE, ctx);
  const run = (code) => vm.runInContext(code, ctx);
  run(`__pr.effects = ${JSON.stringify(effects)}; __pr.addStyle(${JSON.stringify(`${STYLE.root}/${STYLE.file}`)}, 'CR Субтитры');`);
  const bridge = new Bridge({ evalScript: async (s) => String(run(s)), loadHost: async () => undefined, sleep: async () => undefined });
  const hostRun = async (op, p) => {
    if (op === 'setup') {
      run(`__pr.sequence(1920, 1080, 25, ${tracks}, 0);`);
      return ok({ ids: { blur: 'seq-Edit' } });
    }
    if (op === 'fitPlace') {
      run(`__pr.addMedia(${JSON.stringify(p.file)}, 5, true, 1920, 1080); __pr.clipOf(${JSON.stringify(p.file)}, ${p.track}, ${p.startSec}, true);`);
      return ok({});
    }
    if (op === 'editState') {
      return ok({ video: JSON.parse(run(`JSON.stringify(app.project.activeSequence._tracks.map(function (t) { return t._clips.map(function (c) {
        return { name: c.name, start: c._start / (TPS / 25), end: c._end / (TPS / 25), fx: c._components.map(function (k) { return k.matchName; }) }; }); }))`)) });
    }
    return ok({});
  };
  // The frame: the copy on V2 shows the source inside its Crop, the blurred clip under it shows grey.
  const frame = async () => JSON.parse(run(`(function () { var c = app.project.activeSequence._tracks[1]._clips[0]; if (!c) return 'null';
    var k = c._components.filter(function (x) { return x.matchName === 'AE.ADBE AECrop'; })[0]; var v = function (i) { return k ? k.properties[i].getValue() / 100 : 0; };
    return JSON.stringify({ l: 1920 * v(0), t: 1080 * v(1), r: 1920 * (1 - v(2)), b: 1080 * (1 - v(3)) }); })()`));
  const gray = (f, x, y) => (x >= f.l && x < f.r && y >= f.t && y < f.b ? checker(x, y) : 128);
  return { bridge, hostRun, frame, gray, run };
}

describe('live «Монтаж» check, dry', () => {
  it('blurs the margins of the still and imports the style once', async () => {
    const d = dry();
    const R = new Report('pr');
    await runEditLive({ ...d, R, checker: 'C:/w/checker.png', style: STYLE });
    expect(R.failed()).toEqual([]);
    expect(R.checks.map((c) => c.name)).toEqual(expect.arrayContaining(['blur: inside the margins the frame is the source (±3)', 'style: a second time it is found, not imported again']));
  });

  it('catches a missing Fast Blur, a busy track and no style file', async () => {
    const R = new Report('pr');
    await runEditLive({ ...dry({ effects: ['Crop'] }), R, checker: 'C:/w/checker.png', style: null });
    expect(R.failed()).toEqual(['blur: done']);
    expect(R.checks.at(-1)).toMatchObject({ name: 'style: no .prtextstyle on this PC — skipped', required: false });
    const R2 = new Report('pr');
    await runEditLive({ ...dry({ tracks: 1 }), R: R2, checker: 'C:/w/checker.png', style: null });
    expect(R2.checks.find((c) => c.name === 'blur: done').detail.problems[0].code).toBe('BLUR_NO_TRACK');
  });
});
