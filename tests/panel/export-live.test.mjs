// A dry run of the live export checks (tests/live/export.mjs) on the vm fakes: the flow the build PC runs,
// with the test-bed steps done in JS on the fakes and ffprobe answered from what the fakes rendered.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { composeHost } from '../../panel/host/compose.mjs';
import { Bridge } from '../../panel/src/bridge/bridge.ts';
import { runExportLive, EXPORT_TARGETS } from '../live/export.mjs';
import { Report } from '../live/runner.mjs';
import { EXPORT_CANON } from '../../tools/library/export-pack.mjs';
import { exampleCatalog } from './fixtures.ts';

const FAKE = { ae: readFileSync(new URL('./fake-ae.js', import.meta.url), 'utf8'), pr: readFileSync(new URL('./fake-pr.js', import.meta.url), 'utf8') };
const BUNDLE = composeHost();
const LIB = 'C:/ProgramData/CloudRuBrandKit/library';
const OUT = 'C:/CRBK/work/panel-live';
const ok = (data) => ({ checks: [{ name: 'step', pass: true }], data });
const byTemplate = (t) => EXPORT_CANON.find((c) => c.omTemplate === t);
const byEpr = (p) => EXPORT_CANON.find((c) => p.endsWith(`/${c.id}_epr_v1.epr`));
const media = (c, w, h, fps, duration) => ({ duration, video: { codec: 'h264', profile: 'High', level: c.level, width: w, height: h, fps }, audio: { codec: 'aac', sampleRate: 48000, channels: 2 } });

function dry(host, { templates = EXPORT_CANON.map((c) => c.omTemplate) } = {}) {
  const ctx = vm.createContext({});
  vm.runInContext(FAKE[host], ctx);
  vm.runInContext(BUNDLE, ctx);
  const run = (code) => vm.runInContext(code, ctx);
  const bridge = new Bridge({ evalScript: async (s) => { try { return String(run(s)); } catch { return 'EvalScript error.'; } }, loadHost: async () => undefined, sleep: async () => undefined });
  const dir = `${OUT}/${host}`;
  const ids = {};
  const hostRun = async (op, p) => {
    if (host === 'ae') {
      if (op === 'exportSetup') {
        run(`app.project.file = new File(${JSON.stringify(p.project)}); __ae.folders['C:/CRBK/work/panel-live'] = true; __ae.folders[${JSON.stringify(dir)}] = true; __ae.omTemplates = __ae.omTemplates.concat(${JSON.stringify(templates)}); __ae.aerender(true);`);
        for (const t of p.targets) {
          ids[t.key] = String(run(`(function () { var c = new CompItem(${JSON.stringify(t.name)}, ${t.w}, ${t.h}, ${t.dur}, ${t.fps}, []); c.workAreaStart = ${p.range.ae.startSec}; c.workAreaDuration = ${p.range.ae.durSec}; __move(c, app.project.rootFolder); return c.id; })()`));
        }
        return ok({ ids });
      }
      if (op === 'templates') return ok({ names: JSON.parse(run('JSON.stringify(__ae.omTemplates)')) });
      if (op === 'queueUser') {
        run(`(function () { var it = __rq.items.add(app.project.itemByID(${Number(p.id)})); it._om.file = new File(${JSON.stringify(dir + '/user_item.mov')}); })()`);
        return ok({});
      }
      if (op === 'rq') return ok({ items: JSON.parse(run(`JSON.stringify(__rq._items.map(function (it) { return { comp: it.comp.name, render: it.render, status: String(it.status), file: it._om.file ? it._om.file._path : null }; }))`)) });
      if (op === 'activate') {
        run(`app.project.activeItem = app.project.itemByID(${Number(p.id)}); app.project.activeItem.time = ${p.time};`);
        return ok({});
      }
    } else {
      if (op === 'exportSetup') {
        run(`app.project.path = ${JSON.stringify(p.project)}; __pr.folders[${JSON.stringify(dir)}] = true; __seqs = {};`);
        for (const c of EXPORT_CANON) run(`__pr.files[${JSON.stringify(`${LIB}/items/${c.id}/${c.id}_epr_v1.epr`)}] = 'epr'`);
        for (const t of p.targets) {
          ids[t.key] = run(`(function () { var s = new Sequence(${JSON.stringify(t.key)}, ${t.w}, ${t.h}, ${t.fps}, 3); __seqs[s.sequenceID] = s;
            s._tracks[0]._clips.push(new TrackItem('clip', 0, 3 * TPS, { params: [] }));
            ${t.key === 'whole' ? '' : `s._inTicks = ${p.range.pr.inSec} * TPS; s._outTicks = ${p.range.pr.outSec} * TPS;`}
            return s.sequenceID; })()`);
        }
        return ok({ ids });
      }
      if (op === 'activate') {
        run(`app.project.activeSequence = __seqs[${JSON.stringify(p.id)}];`);
        return ok({});
      }
    }
    return ok({});
  };
  const exists = (p) => run(`(${host === 'ae' ? '__ae' : '__pr'}.files[${JSON.stringify(p)}] !== undefined)`);
  const probe = (file) => {
    if (host === 'ae') {
      const r = JSON.parse(run(`JSON.stringify(__ae.renders.filter(function (x) { return x.out === ${JSON.stringify(file)}; })[0] || null)`));
      const t = EXPORT_TARGETS.ae.find((x) => x.name === r.comp);
      const [w, h] = r.resize ? r.resize.split(',').map(Number) : [t.w, t.h];
      return media(byTemplate(r.template), w, h, r.fps ? Number(r.fps) : t.fps, r.span[1]);
    }
    const r = JSON.parse(run(`JSON.stringify(__pr.exports.filter(function (x) { return x.out === ${JSON.stringify(file)}; })[0] || null)`));
    const s = JSON.parse(run(`(function () { var s = app.project.activeSequence; for (var k in __seqs) if (__seqs[k].name === ${JSON.stringify(r.seq)}) s = __seqs[k];
      var end = 0; s._tracks[0]._clips.forEach(function (c) { end = Math.max(end, c._end); });
      return JSON.stringify({ inSec: (s._inTicks || 0) / TPS, outSec: (s._outTicks === null ? end : s._outTicks) / TPS }); })()`));
    const c = byEpr(r.epr);
    return media(c, c.w, c.h, 25, s.outSec - s.inSec);
  };
  // aerender, dry: the item the adapter saved with the project is rendered as the Render Queue would.
  const aerender = async (job) => {
    run(`(function () { var q = __ae.savedQueue[${job.rqIndex - 1}]; __ae.files[q.out] = 'mp4';
      __ae.renders.push({ comp: q.comp, template: q.template, resize: q.resize, fps: q.fps, span: q.span, out: q.out }); })()`);
    return { ok: true, code: 0, tail: [] };
  };
  const mkdirp = (d) => run(`${host === 'ae' ? '__ae' : '__pr'}.folders[${JSON.stringify(d)}] = true`);
  return { bridge, hostRun, exists, probe, aerender, mkdirp, dir };
}

const catalog = () => exampleCatalog();

describe('live export checks, dry', () => {
  for (const host of ['ae', 'pr']) {
    it(`runs every case in ${host} on the fakes`, async () => {
      const d = dry(host);
      const R = new Report(host);
      await runExportLive({
        host, bridge: d.bridge, hostRun: d.hostRun, catalog: catalog(), libraryRoot: LIB, R,
        project: `${d.dir}/export_live.${host === 'ae' ? 'aep' : 'prproj'}`, clip: `${OUT}/export-clip.mp4`, documents: 'C:/Users/u/Documents',
        exists: d.exists, mkdirp: d.mkdirp, probe: d.probe, aerender: d.aerender, waitFile: async (f) => d.exists(f),
      });
      expect(R.failed()).toEqual([]);
      expect(R.checks.length).toBeGreaterThan(host === 'ae' ? 70 : 60);
      expect(R.checks.map((c) => c.name)).toContain(host === 'ae'
        ? 'export background (AME_WebinarIntro, background): aerender finished while AE is open'
        : 'export whole (AME_WebinarTimer, direct): 3 s long');
    });
  }

  it('stops at once when the brand templates are not loaded in AE', async () => {
    const d = dry('ae', { templates: ['CR FullHD'] });
    const R = new Report('ae');
    await runExportLive({ host: 'ae', bridge: d.bridge, hostRun: d.hostRun, catalog: catalog(), libraryRoot: LIB, R, project: `${d.dir}/x.aep`, clip: 'c', documents: 'D:',
      exists: d.exists, mkdirp: d.mkdirp, probe: d.probe, aerender: d.aerender, waitFile: async () => true });
    expect(R.failed()).toEqual(['export: every «CR …» template is loaded in AE (Edit → Templates → Output Module → Load)']);
  });
});
