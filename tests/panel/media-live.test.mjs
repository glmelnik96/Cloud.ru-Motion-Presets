// A dry run of the live media checks (tests/live/media.mjs) on the vm fakes: the flow the build PC runs with
// the synthetic pack of tools/panel/media-fixtures.mjs, with the test-bed steps done in JS on the fakes.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { composeHost } from '../../panel/host/compose.mjs';
import { Bridge } from '../../panel/src/bridge/bridge.ts';
import { mediaJobs, mediaSource, MEDIA_IDS } from '../../tools/panel/media-fixtures.mjs';
import { runMediaLive } from '../live/media.mjs';
import { Report } from '../live/runner.mjs';
import { toCatalogItem } from './fixtures.ts';

const FAKE = { ae: readFileSync(new URL('./fake-ae.js', import.meta.url), 'utf8'), pr: readFileSync(new URL('./fake-pr.js', import.meta.url), 'utf8') };
const BUNDLE = composeHost();
const LIB = 'C:/ProgramData/CloudRuBrandKit/library';
const readJson = (u) => JSON.parse(readFileSync(new URL(u, import.meta.url), 'utf8'));
const ok = (data) => ({ checks: [{ name: 'step', pass: true }], data });

const SRC = mediaSource(readJson('../../library/library.src.json'), readJson('../../docs/library/example.src.json'));
const catalog = () => ({ schemaVersion: 1, libraryVersion: '2026.10.05', minPluginVersion: '0.1.0', items: SRC.items.map((i) => toCatalogItem(i, true)) });

function natural(file) {
  const name = file.split('/').pop();
  if (/\.png$/.test(name)) return { sec: 0, still: true };
  if (/_loop_/.test(name)) return { sec: 10, still: false };
  if (/\.wav$/.test(name)) return { sec: 0.8, still: false };
  return { sec: 1, still: false };
}

function dry(host) {
  const ctx = vm.createContext({});
  vm.runInContext(FAKE[host], ctx);
  const run = (code) => vm.runInContext(code, ctx);
  const bridge = new Bridge({ evalScript: async (s) => { try { return String(run(s)); } catch { return 'EvalScript error.'; } }, loadHost: async () => void run(BUNDLE), sleep: async () => undefined });
  const cat = catalog();
  const ttl = cat.items.find((i) => i.id === 'TTL_LowerThird');
  const D = ttl.duration.introSec + ttl.duration.holdSec + ttl.duration.outroSec;
  if (host === 'ae') {
    ctx.__comps = ttl.variants.map((v) => ({ name: v.aeComp, w: v.w, h: v.h, duration: D, fps: v.fps, ep: ttl.fields.map((f) => ({ name: f.egpName, kind: f.type === 'text' ? 'text' : 'number', value: f.type === 'text' ? f.default ?? '' : Number(f.default ?? 1) })) }));
    run(`__ae.template(${JSON.stringify(`${LIB}/${ttl.aep.file}`)}, __comps, [])`);
  } else {
    ctx.__params = ttl.fields.map((f) => ({ name: f.egpName, kind: f.type === 'text' ? 'text' : 'number', value: f.type === 'text' ? f.default : (f.default ?? 1) - 1 }));
    for (const v of ttl.variants) run(`__pr.mogrt(${JSON.stringify(`${LIB}/${v.file}`)}, ${D}, __params)`);
  }
  const files = new Set();
  const add = (p) => {
    files.add(p);
    const m = natural(p);
    run(`${host === 'ae' ? '__ae' : '__pr'}.addMedia(${JSON.stringify(p)}, ${m.sec}, ${m.still})`);
  };
  const seqs = {};
  const hostRun = async (op, p) => {
    if (op === 'setup') {
      if (host === 'ae') {
        run(`app.project.file = new File('C:/CRBK/work/panel-live/ae/media_live.aep'); __ae.folders['C:/CRBK/work/panel-live/ae'] = true;`);
        const ids = {};
        for (const t of p.targets) ids[t.key] = String(run(`(function () { var c = new CompItem(${JSON.stringify(t.name)}, ${t.w}, ${t.h}, ${t.dur}, ${t.fps}, []); __move(c, app.project.rootFolder); return c.id; })()`));
        return ok({ ids });
      }
      const ids = {};
      for (const t of p.targets) {
        ids[t.key] = run(`(function () { var s = new Sequence(${JSON.stringify(t.key)}, ${t.w}, ${t.h}, ${t.fps}, 3); __seqs = typeof __seqs === 'undefined' ? {} : __seqs; __seqs[s.sequenceID] = s; return s.sequenceID; })()`);
        seqs[t.key] = ids[t.key];
      }
      return ok({ ids });
    }
    if (op === 'range') {
      run(host === 'ae' ? `app.project.itemByID(${Number(p.id)}).workAreaDuration = ${p.endSec}` : `__seqs[${JSON.stringify(p.id)}]._outTicks = ${p.endSec} * TPS`);
      return ok({});
    }
    if (op === 'cuts') {
      run(`(function () { var s = __seqs[${JSON.stringify(p.id)}]; var e = ${JSON.stringify(p.edges)};
        for (var i = 0; i + 1 < e.length; i++) s._tracks[0]._clips.push(new TrackItem('cut', Math.round(e[i] * TPS), Math.round((e[i + 1] - e[i]) * TPS), { params: [] })); })()`);
      return ok({});
    }
    if (op === 'activate') {
      run(host === 'ae'
        ? `app.project.activeItem = app.project.itemByID(${Number(p.id)}); app.project.activeItem.time = ${p.time};`
        : `app.project.activeSequence = __seqs[${JSON.stringify(p.id)}]; app.project.activeSequence._player = Math.round(${p.time} * TPS);`);
      return ok({});
    }
    if (op === 'timeline') {
      if (host === 'ae') {
        return ok({ layers: run(`app.project.itemByID(${Number(p.id)})._layers.map(function (l, i) { return { index: i + 1, name: l.name, startSec: Math.round(l.inPoint * 1000) / 1000, endSec: Math.round(l.outPoint * 1000) / 1000,
          file: l.source.file ? l.source.file.fsName : null, loop: l.source.mainSource && !l.source.mainSource.isStill ? l.source.mainSource.loop : null,
          solid: l.source._solid ? l.source._solid.map(function (c) { return Math.round(c * 255); }) : null }; })`) });
      }
      return ok({ clips: run(`(function () { var s = __seqs[${JSON.stringify(p.id)}]; var out = [];
        [['v', s._tracks], ['a', s._atracks]].forEach(function (k) { k[1].forEach(function (t, i) { t._clips.forEach(function (c) {
          out.push({ track: i + 1, audio: k[0] === 'a', name: c.name, startSec: c._start / TPS, endSec: c._end / TPS, file: c.projectItem ? c.projectItem._path : null }); }); }); });
        return out; })()`) });
    }
    return ok({});
  };
  return { bridge, hostRun, cat, add, files };
}

describe('live media checks, dry', () => {
  it('makes ffmpeg jobs for every file of the synthetic pack', () => {
    const files = SRC.items.filter((i) => MEDIA_IDS.includes(i.id)).flatMap((i) => mediaJobs(i).map((j) => j.file));
    expect(files).toEqual([
      'TRN_StepWipe/TRN_StepWipe_16x9_v1.mov', 'TRN_StepWipe/TRN_StepWipe_9x16_v1.mov',
      'BG_Arrows/BG_Arrows_16x9_intro_v1.mov', 'BG_Arrows/BG_Arrows_16x9_loop_v1.mov', 'BG_Arrows/BG_Arrows_16x9_outro_v1.mov',
      'BG_Arrows/BG_Arrows_9x16_intro_v1.mov', 'BG_Arrows/BG_Arrows_9x16_loop_v1.mov', 'BG_Arrows/BG_Arrows_9x16_outro_v1.mov',
      'BG_DotGrid/BG_DotGrid_16x9_v1.png', 'BG_DotGrid/BG_DotGrid_svg_v1.svg',
      'SFX_WhooshIn/SFX_WhooshIn_wav_v1.wav',
    ]);
    expect(SRC.items[0].companions.map((c) => c.ref)).toEqual(['BG_Arrows', 'SFX_WhooshIn']);
  });

  for (const host of ['ae', 'pr']) {
    it(`runs every case in ${host} on the fakes`, async () => {
      const d = dry(host);
      const R = new Report(host);
      await runMediaLive({
        host, bridge: d.bridge, hostRun: d.hostRun, catalog: d.cat, libraryRoot: LIB, platform: 'win', bkVersion: '0.1.19', R,
        prepare: async (prep) => {
          for (const c of prep.copies) d.add(c.to);
          for (const s of prep.solids) d.add(s.path);
          return { copied: prep.copies.map((c) => c.to), reused: [], written: prep.solids.map((s) => s.path) };
        },
        fileExists: (p) => d.files.has(p),
        scratchDir: `C:/CRBK/work/panel-live/${host}`,
        backdropPixel: async () => [34, 34, 34, 255],
      });
      expect(R.failed()).toEqual([]);
      expect(R.checks.map((c) => c.name)).toContain('loop: the rendered backdrop is #222222 (34, 34, 34 ± 2) where nothing covers it');
      expect(R.checks.length).toBeGreaterThan(40);
    });
  }
});
