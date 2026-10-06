// A dry run of the live checks (tests/live/runner.mjs) on the vm fakes: the same flow the build PC runs in
// AE and Premiere, with the test-bed steps (scratch project, activation, listings) done in JS on the fakes.
// It keeps the live harness itself from failing on the first real run; the fakes cannot undo or render.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { composeHost, lintHost } from '../../panel/host/compose.mjs';
import { Bridge } from '../../panel/src/bridge/bridge.ts';
import { aeHooks, prHooks } from '../live/hosts.mjs';
import { framePlan, probeTimes, sampleValues, variantCases } from '../live/plan.mjs';
import { Report, runLive } from '../live/runner.mjs';
import { catalog, item } from './fixtures.ts';
import { lint } from '../../tools/jsx/lint-jsx.cjs';

const FAKE_AE = readFileSync(new URL('./fake-ae.js', import.meta.url), 'utf8');
const FAKE_PR = readFileSync(new URL('./fake-pr.js', import.meta.url), 'utf8');
const BUNDLE = composeHost();
const LIB = 'C:/ProgramData/CloudRuBrandKit/library';
const ok = (data) => ({ checks: [{ name: 'step', pass: true }], data });

function vmHost(fake) {
  const ctx = vm.createContext({});
  vm.runInContext(fake, ctx);
  const run = (code) => vm.runInContext(code, ctx);
  const evalScript = async (script) => {
    try {
      return String(run(script));
    } catch {
      return 'EvalScript error.';
    }
  };
  const bridge = new Bridge({ evalScript, loadHost: async () => void run(BUNDLE), sleep: async () => undefined });
  return { ctx, run, evalScript, bridge, coldStart: async () => void run('BK = undefined') };
}

const epOf = (it) => it.fields.map((f) => ({
  name: f.egpName,
  kind: f.type === 'text' ? 'text' : f.type === 'media' ? 'media' : 'number',
  value: f.type === 'text' ? f.default ?? '' : f.type === 'checkbox' ? (f.default ? 1 : 0) : f.default ?? 1,
}));

function aeDry() {
  const h = vmHost(FAKE_AE);
  const cat = catalog();
  for (const it of cat.items) {
    const D = it.duration.introSec + it.duration.holdSec + it.duration.outroSec;
    h.ctx.__specComps = it.variants.map((v) => ({ name: v.aeComp, w: v.w, h: v.h, duration: D, fps: v.fps, ep: epOf(it) }));
    h.run(`__ae.template(${JSON.stringify(`${LIB}/${it.aep.file}`)}, __specComps, [])`);
  }
  const hostRun = async (op, p) => {
    if (op === 'setup') {
      h.ctx.__targets = p.targets;
      h.run(`app.project.file = new File('C:/CRBK/work/panel-live/ae/panel_live.aep');
        var __ids = {}; __targets.forEach(function (t) { var c = new CompItem(t.name, t.w, t.h, t.dur, t.fps, []); __move(c, app.project.rootFolder); __ids[t.key] = String(c.id); });`);
      return ok({ ids: h.run('__ids') });
    }
    if (op === 'activate') {
      h.run(`app.project.activeItem = app.project.itemByID(${Number(p.id)}); app.project.activeItem.time = ${p.time};`);
      return ok({});
    }
    if (op === 'layer') {
      const l = h.run(`app.project.layerByID(${Number(p.layerId)})`);
      return ok({ layer: { inPoint: l.inPoint, outPoint: l.outPoint, scale: l._scale.value, timeRemap: l.timeRemapEnabled, keys: l._keys.map((k) => [k.t - l.startTime, k.v, k.i === 'linear']), selected: l.selected } });
    }
    if (op === 'count') return ok({ count: { layers: h.run(`app.project.itemByID(${Number(p.id)}).numLayers`) } });
    return ok({});
  };
  return { h, cat, hostRun };
}

function prDry() {
  const h = vmHost(FAKE_PR);
  const cat = catalog();
  for (const it of cat.items) {
    const D = it.duration.introSec + it.duration.holdSec + it.duration.outroSec;
    for (const v of it.variants) {
      h.ctx.__params = it.fields.map((f) => ({ name: f.egpName, kind: f.type === 'text' ? 'text' : 'number', value: f.type === 'text' ? f.default : f.type === 'checkbox' ? Boolean(f.default) : (f.default ?? 1) - 1 }));
      h.run(`__pr.mogrt(${JSON.stringify(`${LIB}/${v.file}`)}, ${D}, __params)`);
    }
  }
  const hostRun = async (op, p) => {
    if (op === 'setup') {
      h.ctx.__targets = p.targets;
      h.run(`var __seqs = {}; var __ids = {}; __targets.forEach(function (t) { var s = new Sequence(t.name, t.w, t.h, t.fps, 3); __seqs[s.sequenceID] = s; __ids[t.key] = s.sequenceID; });`);
      return ok({ ids: h.run('__ids') });
    }
    if (op === 'activate') {
      h.run(`app.project.activeSequence = __seqs[${JSON.stringify(p.id)}]; app.project.activeSequence._player = Math.round(${p.time} * TPS);`);
      return ok({});
    }
    if (op === 'clips') {
      const clips = h.run(`(function () { var s = __seqs[${JSON.stringify(p.id)}]; var out = [];
        s._tracks.forEach(function (t, i) { t._clips.forEach(function (c) { out.push({ track: i + 1, name: c.name, startSec: c._start / TPS, endSec: c._end / TPS, scale: c._scale.getValue(), selected: c._selected }); }); });
        return out; })()`);
      return ok({ clips });
    }
    return ok({});
  };
  return { h, cat, hostRun };
}

const noWait = async () => undefined;

describe('live plan', () => {
  it('gives every variant of the host a case, with values that differ from the defaults', () => {
    const cases = variantCases(catalog(), 'pr');
    expect(cases.map((c) => c.key)).toContain('TTL_LowerThird_1x1');
    expect(cases).toHaveLength(10);
    const v = sampleValues(item('TTL_LowerThird'));
    expect(v).toMatchObject({ name: 'Анна-Мария Ёлкина', style: 3, side: 2, speed: 2, size: 2 });
    expect(sampleValues(item('LOGO_Mark')).plate).toBe(false);
  });

  it('probes the intro and the outro of A and B on the frame grid', () => {
    const ttl = item('TTL_LowerThird');
    expect(probeTimes(ttl, 25)).toEqual({ D: 6, intro: 1.12, outro: 5 });
    expect(framePlan(ttl, 25, 2, 20).frames.map((f) => [f.key, f.at])).toEqual([['a_intro', 3.12], ['b_intro', 21.12], ['a_outro', 7], ['b_outro', 29]]);
  });

  it('lints the JSX of the test bed', () => {
    for (const f of ['ae-live.jsx', 'pr-live.jsx']) {
      expect(lint(readFileSync(new URL(`../live/jsx/${f}`, import.meta.url), 'utf8'), {}).errors, f).toEqual([]);
    }
    expect(lintHost()).toEqual([]);
  });
});

describe('live run, dry', () => {
  for (const [host, make, hooks] of [['ae', aeDry, aeHooks], ['pr', prDry, prHooks]]) {
    it(`runs the whole flow in ${host} on the fakes`, async () => {
      const { h, cat, hostRun } = make();
      const R = new Report(host);
      const allFonts = async (names) => Object.fromEntries(names.map((n) => [n, { found: true, version: null }]));
      await runLive({
        host, bridge: h.bridge, hostRun, coldStart: h.coldStart, catalog: cat, libraryRoot: LIB, platform: 'win', bkVersion: '0.1.13',
        fonts: allFonts, frames: false, framesDir: 'C:/CRBK/work/panel-live/frames', ssimMin: 0.98, compare: async () => 1, R,
        ...hooks({ wait: noWait }),
      });
      // the fakes have no undo: only that information check may fail, and AE does not run it
      expect(R.failed()).toEqual([]);
      expect(R.checks.filter((c) => !c.pass).map((c) => c.name)).toEqual(host === 'pr' ? ['undo: one undo step removes the insert with its field writes'] : []);
      expect(R.checks.length).toBeGreaterThan(80);
      expect(R.toJSON().summary.failed).toBe(0);
    });
  }
});
