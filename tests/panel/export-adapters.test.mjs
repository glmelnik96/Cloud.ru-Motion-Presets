// exportComp (AE) and exportSequence (Premiere) of the host bundle on the fakes, then the chain core -> bridge
// -> adapter (decisions P19–P21). The fakes repeat what the export research measured on AE 26.5 and Premiere
// 26.5.2 (docs/research/export): templates by name, Resize as "w,h", the .epr into AME or straight out.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { composeHost } from '../../panel/host/compose.mjs';
import { Bridge } from '../../panel/src/bridge/bridge.ts';
import { exportPresets, planExport, runExport } from '../../panel/src/core/export.ts';
import { exampleCatalog } from './fixtures.ts';

const FAKE = { ae: readFileSync(new URL('./fake-ae.js', import.meta.url), 'utf8'), pr: readFileSync(new URL('./fake-pr.js', import.meta.url), 'utf8') };
const BUNDLE = composeHost();
const LIB = 'C:/ProgramData/CloudRuBrandKit/library';

function host(kind) {
  const ctx = vm.createContext({});
  vm.runInContext(FAKE[kind], ctx);
  vm.runInContext(BUNDLE, ctx);
  const run = (code) => vm.runInContext(code, ctx);
  const call = (fn, args) => JSON.parse(run(`BK.call(${JSON.stringify(fn)}, ${JSON.stringify(JSON.stringify(args ?? null))})`));
  const bridge = new Bridge({ evalScript: async (s) => String(run(s)), loadHost: async () => undefined, sleep: async () => undefined });
  return { run, call, bridge };
}

const preset = (kind, id) => exportPresets(exampleCatalog(), kind, LIB).find((p) => p.id === id);

function ae({ w = 1920, h = 1080, fps = 25, saved = true, templates = ['CR FullHD', 'CR 4K'] } = {}) {
  const h0 = host('ae');
  h0.run(`__ae.userComp(${w}, ${h}, ${fps}, 0); app.project.activeItem.workAreaStart = 2; app.project.activeItem.workAreaDuration = 10;
    __ae.omTemplates = __ae.omTemplates.concat(${JSON.stringify(templates)});
    ${saved ? "app.project.file = new File('C:/work/p/user.aep'); __ae.folders['C:/work'] = true; __ae.folders['C:/work/p'] = true;" : ''}`);
  return h0;
}

const aeReq = (h0, over = {}) => ({ host: 'ae', mode: 'render', targetId: String(h0.run('app.project.activeItem.id')), targetName: 'Main', presetId: 'AME_FullHD', title: 'Full HD',
  epr: null, omTemplate: 'CR FullHD', output: 'C:/work/p/Export/Main_FullHD.mp4', resize: null, fps: null, ...over });

describe('AE exportComp', () => {
  it('renders the work area of the comp with the template into Export, made on the way', () => {
    const h0 = ae();
    h0.run(`__rq.items.add(app.project.activeItem)`); // a queued item of the user's own
    const r = h0.call('exportComp', aeReq(h0));
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({ file: 'C:/work/p/Export/Main_FullHD.mp4', bytes: 1000 });
    expect(h0.run('JSON.stringify(__ae.renders)')).toBe(JSON.stringify([{ comp: 'Main', template: 'CR FullHD', resize: null, fps: null, span: [2, 10], out: 'C:/work/p/Export/Main_FullHD.mp4' }]));
    // the user's item stayed queued and marked; ours left the queue
    expect(JSON.parse(h0.run('JSON.stringify(__rq._items.map(function (i) { return [i.render, i.status === RQItemStatus.QUEUED]; }))'))).toEqual([[true, true]]);
  });

  it('sets Resize to "w,h" and the preset frame rate when the comp differs', () => {
    const h0 = ae({ w: 3840, h: 2160, fps: 30 });
    const r = h0.call('exportComp', aeReq(h0, { resize: { w: 1920, h: 1080 }, fps: 25 }));
    expect(r.ok).toBe(true);
    expect(JSON.parse(h0.run('JSON.stringify(__ae.renders[0])'))).toMatchObject({ resize: '1920,1080', fps: '25' });
  });

  it('refuses without the template and leaves the queue as it was', () => {
    const h0 = ae({ templates: [] });
    const r = h0.call('exportComp', aeReq(h0));
    expect(r).toMatchObject({ ok: false, error: { code: 'NO_TEMPLATE', message: 'CR FullHD' } });
    expect(h0.run('__rq.numItems')).toBe(0);
  });

  it('refuses while the queue renders, and a background render of an unsaved project', () => {
    let h0 = ae();
    h0.run('__rq.rendering = true');
    expect(h0.call('exportComp', aeReq(h0)).error.code).toBe('RENDERING');
    h0 = ae({ saved: false });
    h0.run('__ae.aerender(true)');
    expect(h0.call('exportComp', aeReq(h0, { mode: 'background' })).error.code).toBe('NOT_SAVED');
  });

  it('background: saves the project with the item for aerender -rqindex, then takes it out of the open queue', () => {
    const h0 = ae();
    h0.run('__ae.aerender(true); __rq.items.add(app.project.activeItem)');
    const r = h0.call('exportComp', aeReq(h0, { mode: 'background' }));
    expect(r.ok).toBe(true);
    expect(r.data).toEqual({ file: 'C:/work/p/Export/Main_FullHD.mp4', aerender: { exe: 'C:/Program Files/Adobe/Adobe After Effects 2026/Support Files/aerender.exe', project: 'C:/work/p/user.aep', rqIndex: 2 } });
    expect(JSON.parse(h0.run('JSON.stringify(__ae.savedQueue)'))[1]).toEqual({ comp: 'Main', render: true, out: 'C:/work/p/Export/Main_FullHD.mp4', template: 'CR FullHD', resize: null, fps: null, span: [2, 10] });
    expect(h0.run('__rq.numItems')).toBe(1);
    expect(h0.run('JSON.stringify(__ae.renders)')).toBe('[]');
  });

  it('a failed render comes back as EXPORT_FAILED, the item out of the queue and the user\'s item marked again', () => {
    const h0 = ae();
    h0.run(`__rq.items.add(app.project.activeItem); __rq.render = function () { throw new Error('After Effects error: disk full'); };`);
    const r = h0.call('exportComp', aeReq(h0));
    expect(r.error).toMatchObject({ code: 'EXPORT_FAILED', message: 'After Effects error: disk full' });
    expect(JSON.parse(h0.run('JSON.stringify(__rq._items.map(function (i) { return i.render; }))'))).toEqual([true]);
  });

  it('background without aerender next to AE is refused before anything is saved', () => {
    const h0 = ae();
    const r = h0.call('exportComp', aeReq(h0, { mode: 'background' }));
    expect(r.error.code).toBe('EXPORT_FAILED');
    expect(h0.run('__ae.saves')).toBe(0);
  });
});

function pr() {
  const h0 = host('pr');
  h0.run(`__pr.sequence(1920, 1080, 25, 3, 4); __pr.files['${LIB}/items/AME_FullHD/AME_FullHD_epr_v1.epr'] = 'epr'; __pr.folders['C:/work/pr'] = true;`);
  return h0;
}
const prReq = (over = {}) => ({ host: 'pr', mode: 'queue', targetId: 'seq-Edit', targetName: 'Edit', presetId: 'AME_FullHD', title: 'Full HD',
  epr: `${LIB}/items/AME_FullHD/AME_FullHD_epr_v1.epr`, omTemplate: 'CR FullHD', output: 'C:/work/pr/Export/Edit_FullHD.mp4', resize: null, fps: null, ...over });

describe('Premiere exportSequence', () => {
  it('queue: one AME job from In to Out, the batch started, the folder made', () => {
    const h0 = pr();
    h0.run('app.project.activeSequence._inTicks = 2 * TPS; app.project.activeSequence._outTicks = 12 * TPS;');
    const r = h0.call('exportSequence', prReq());
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({ file: 'C:/work/pr/Export/Edit_FullHD.mp4', queued: true, job: '1', inSec: 2, outSec: 12 });
    expect(JSON.parse(h0.run('JSON.stringify(__pr.exports)'))).toEqual([{ how: 'queue', seq: 'Edit', out: 'C:/work/pr/Export/Edit_FullHD.mp4', epr: `${LIB}/items/AME_FullHD/AME_FullHD_epr_v1.epr`, workArea: 1, remove: 1, job: '1' }]);
  });

  it('direct: exportAsMediaDirect and the file is there', () => {
    const h0 = pr();
    const r = h0.call('exportSequence', prReq({ mode: 'direct' }));
    expect(r.data).toMatchObject({ file: 'C:/work/pr/Export/Edit_FullHD.mp4', bytes: 1000 });
    expect(JSON.parse(h0.run('JSON.stringify(__pr.exports[0])'))).toMatchObject({ how: 'direct', workArea: 1 });
  });

  it('refuses a missing .epr and another active sequence', () => {
    const h0 = pr();
    expect(h0.call('exportSequence', prReq({ epr: 'C:/nope.epr' })).error.code).toBe('NO_FILE');
    expect(h0.call('exportSequence', prReq({ targetId: 'seq-Other' })).error.code).toBe('NO_TARGET');
  });
});

describe('export through the bridge', () => {
  it('Premiere: plan, bridge, adapter', async () => {
    const h0 = pr();
    const ctx = (await h0.bridge.call('getContext')).data;
    const plan = planExport({ ctx: { ...ctx, project: { saved: true, path: 'C:/work/pr/edit.prproj' } }, preset: preset('pr', 'AME_FullHD'), mode: 'queue', documents: 'D:', exists: () => false });
    const out = await runExport(h0.bridge, plan.request, null);
    expect(out).toMatchObject({ ok: true, reply: { queued: true, file: 'C:/work/pr/Export/Edit_FullHD.mp4' } });
  });

  it('AE: a missing template comes back as the instruction', async () => {
    const h0 = ae({ templates: [] });
    const ctx = (await h0.bridge.call('getContext')).data;
    const plan = planExport({ ctx, preset: preset('ae', 'AME_FullHD'), mode: 'render', documents: 'D:', exists: () => false });
    const out = await runExport(h0.bridge, plan.request, 'C:/lib/x.aom');
    expect(out.problems.map((p) => p.code)).toEqual(['EXPORT_NO_TEMPLATE']);
  });
});
