// The host bundle (panel/host) in node:vm against fakes of the AE and Premiere object models, then the whole
// chain core -> bridge -> adapter. The fakes follow what S3 and S5 measured on AE 26.5 and Premiere 26.5.2;
// the live runs on the PC (docs/superpowers/plans/2026-10-05-phase3-panel-core.md) check the real hosts.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { composeHost, lintHost } from '../../panel/host/compose.mjs';
import { Bridge } from '../../panel/src/bridge/bridge.ts';
import { initialValues } from '../../panel/src/core/fields.ts';
import { planInsert, runInsert } from '../../panel/src/core/insert.ts';
import { ALL_FONTS, item, webScreen } from './fixtures.ts';

const FAKE_AE = readFileSync(new URL('./fake-ae.js', import.meta.url), 'utf8');
const FAKE_PR = readFileSync(new URL('./fake-pr.js', import.meta.url), 'utf8');
const BUNDLE = composeHost();
const LIB = 'C:/ProgramData/CloudRuBrandKit/library';

function host(fake) {
  const ctx = vm.createContext({});
  vm.runInContext(fake, ctx);
  vm.runInContext(BUNDLE, ctx);
  const evalScript = async (script) => String(vm.runInContext(script, ctx));
  const call = (fn, args) => {
    const raw = vm.runInContext(`BK.call(${JSON.stringify(fn)}, ${JSON.stringify(JSON.stringify(args ?? null))})`, ctx);
    expect(/^[\x00-\x7e]*$/.test(raw)).toBe(true);
    return JSON.parse(raw);
  };
  return { ctx, run: (code) => vm.runInContext(code, ctx), call, evalScript };
}

// Essential Properties of a template comp from the fields of its item.
const epOf = (it) => it.fields.map((f) => ({
  name: f.egpName,
  kind: f.type === 'text' ? 'text' : f.type === 'media' ? 'media' : 'number',
  value: f.type === 'text' ? f.default ?? '' : f.type === 'checkbox' ? (f.default ? 1 : 0) : f.type === 'media' ? null : f.default ?? 1,
}));

function aeWith(it, { footage = [] } = {}) {
  const h = host(FAKE_AE);
  const D = it.fit === 'trim' ? it.duration.maxSec : it.duration.introSec + it.duration.holdSec + it.duration.outroSec;
  h.ctx.__specComps = it.variants.map((v) => ({ name: v.aeComp, w: v.w, h: v.h, duration: D, fps: v.fps, ep: epOf(it) }));
  h.ctx.__specFootage = footage;
  h.run(`__ae.template(${JSON.stringify(`${LIB}/${it.aep.file}`)}, __specComps, __specFootage)`);
  h.run(`app.project.file = new File('C:/CRBK/work/user/user.aep'); __ae.folders['C:/CRBK/work/user'] = true; __ae.userComp(1920, 1080, 25, 2);`);
  return h;
}

const aeCtx = (h) => h.call('getContext').data;

describe('host bundle', () => {
  it('is ES3 without lint errors and ASCII only', () => {
    expect(lintHost()).toEqual([]);
    expect(/^[\x00-\x7f]*$/.test(BUNDLE)).toBe(true);
  });

  it('escapes strings without looking characters up in an object: ExtendScript operators are inherited members', () => {
    // After Effects 26.5 on the build PC (recheck 2026-10-05): a plain object answered esc['-'] with a function
    // (operator overloading), so a hyphen in the project path broke every reply of getContext.
    const h = host(FAKE_AE);
    h.run(`(function () {
      var ops = ['+', '-', '*', '/', '<', '==', '~'];
      for (var i = 0; i < ops.length; i++) {
        Object.defineProperty(Object.prototype, ops[i], { value: function () { return 1; }, enumerable: false, configurable: true });
      }
    })();
      app.project.file = new File('C:/CRBK/work/panel-live/ae/panel_ui.aep');
      __ae.userComp(1920, 1080, 25, 2);`);
    const r = h.call('getContext');
    expect(r.ok).toBe(true);
    expect(r.data.project.path).toBe('C:/CRBK/work/panel-live/ae/panel_ui.aep');
    expect(h.call('ping', { s: 'a-b+c*d/e<f~g', q: '"\\', n: 'x\ny\tz' }).ok).toBe(true);
    for (const op of ['-', '+', '==']) expect(h.call(op).error.code).toBe('NO_FUNCTION');
  });

  it('does not rely on the JSON of the engine: a stringify that throws on a hyphen changes nothing', () => {
    // After Effects 26.5 on the build PC (installer check 2026-10-05): the JSON the panel found threw on «-».
    const h = host(FAKE_AE);
    h.run(`var __broken = { stringify: function (v) { if (/-/.test(String(v))) { throw new Error('broken'); } return '{}'; },
      parse: function () { throw new Error('broken'); } };
      JSON = __broken;
      app.project.file = new File('C:/CRBK/work/panel-live/ae/panel_ui.aep');
      __ae.userComp(1920, 1080, 25, 2);`);
    const r = h.call('getContext');
    expect(r.ok).toBe(true);
    expect(r.data.project.path).toBe('C:/CRBK/work/panel-live/ae/panel_ui.aep');
    expect(h.run('JSON === __broken')).toBe(true);
    expect(h.call('ping', { note: 'a-b', nested: [1, null, 'x\ny', { q: '"' }] }).ok).toBe(true);
  });

  it('answers unknown functions, private names and bad arguments with a code', () => {
    const h = host(FAKE_AE);
    expect(h.call('nope').error.code).toBe('NO_FUNCTION');
    expect(h.call('_private').error.code).toBe('NO_FUNCTION');
    const raw = h.run('BK.call("ping", "{broken")');
    expect(JSON.parse(raw).error.code).toBe('BAD_ARGS');
    expect(h.call('ping')).toEqual({ ok: true, data: { app: 'ae', version: '26.5x89', bk: '0.1.5' } });
  });
});

describe('After Effects adapter', () => {
  const ttl = item('TTL_LowerThird');

  it('reports the active comp, the project and its colour settings', () => {
    const h = aeWith(ttl);
    expect(aeCtx(h)).toMatchObject({
      host: 'ae',
      project: { saved: true, path: 'C:/CRBK/work/user/user.aep' },
      target: { kind: 'comp', w: 1920, h: 1080, fps: 25, timeSec: 2 },
      color: { workingSpace: 'None', linearize: false, bpc: 8, colorManagement: 'adobe' },
    });
    h.run('app.project.activeItem = null');
    expect(aeCtx(h).target).toBeNull();
  });

  it('imports the template once, adds the variant at the current time, writes fields and maps the length', () => {
    const h = aeWith(ttl);
    const ctx = aeCtx(h);
    const values = { ...initialValues(ttl), name: 'Анна-Мария Ёлкина', style: 2, side: 2 };
    const plan = planInsert({ item: ttl, ctx, values, fonts: ALL_FONTS, options: { lengthSec: 10 }, env: { platform: 'win', libraryRoot: LIB } });
    expect(plan.ok).toBe(true);
    const r = h.call('insertItem', plan.request);
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({ name: 'CR_TTL_LowerThird_16x9_v1', startSec: 2, lengthSec: 10, imported: true });
    expect(r.data.readback).toMatchObject({ 'Имя': 'Анна-Мария Ёлкина', 'Стиль': 2, 'Сторона': 2, 'Скорость': 2 });
    const layer = h.run('app.project.activeItem.layer(1)');
    expect(layer.timeRemapEnabled).toBe(true);
    expect(layer._keys.map((k) => [Math.round((k.t - 2) * 1000) / 1000, k.v, k.i])).toEqual([[0, 0, 'linear'], [2.2, 2.2, 'linear'], [8, 4, 'linear'], [10, 6, 'linear']]);
    expect(layer.selected).toBe(true);
    expect(h.run('__ae.undo')).toEqual(['begin BrandKit: Подпись спикера', 'end']);
    const bin = h.run('app.project.rootFolder.items.filter(function (f) { return f.name === "Cloud.ru BrandKit"; })[0]');
    expect(bin.items.map((f) => f.comment)).toEqual(['BrandKit TTL_LowerThird@1']);

    // a second insert reuses the imported template
    h.run('app.project.activeItem.time = 20');
    const again = h.call('insertItem', { ...plan.request, startSec: 20, remap: null, lengthSec: 6 });
    expect(again.data).toMatchObject({ imported: false, startSec: 20, lengthSec: 6 });
    expect(h.run('__ae.imports')).toBe(1);
  });

  it('reads fields back in a call of their own and finds an insert after a timeout', () => {
    const h = aeWith(ttl);
    const plan = planInsert({ item: ttl, ctx: aeCtx(h), values: { ...initialValues(ttl), name: 'Олег' }, fonts: ALL_FONTS, env: { platform: 'win', libraryRoot: LIB } });
    const r = h.call('insertItem', plan.request);
    const back = h.call('readFields', { layerId: r.data.layerId, fields: [{ egpName: 'Имя', type: 'text' }, { egpName: 'Стиль', type: 'dropdown' }] });
    expect(back.data).toMatchObject({ values: { 'Имя': 'Олег', 'Стиль': 1 }, startSec: 2, lengthSec: 6, timeRemap: false });
    expect(h.call('probeInsert', { targetId: plan.request.targetId, startSec: 2, aeComp: 'CR_TTL_LowerThird_16x9_v1' }).data.found).toBe(true);
    expect(h.call('probeInsert', { targetId: plan.request.targetId, startSec: 3, aeComp: 'CR_TTL_LowerThird_16x9_v1' }).data.found).toBe(false);
  });

  it('refuses another comp than planned and an unsaved project', () => {
    const h = aeWith(ttl);
    const plan = planInsert({ item: ttl, ctx: aeCtx(h), values: initialValues(ttl), fonts: ALL_FONTS, env: { platform: 'win', libraryRoot: LIB } });
    h.run('__ae.userComp(1920, 1080, 25, 0)');
    expect(h.call('insertItem', plan.request).error.code).toBe('NO_TARGET');
    const h2 = aeWith(ttl);
    const plan2 = planInsert({ item: ttl, ctx: aeCtx(h2), values: initialValues(ttl), fonts: ALL_FONTS, env: { platform: 'win', libraryRoot: LIB } });
    h2.run('app.project.file = null');
    expect(h2.call('insertItem', plan2.request).error.code).toBe('NOT_SAVED');
    expect(h2.run('app.project.activeItem.numLayers')).toBe(0);
  });

  it('refuses a template without the variant comp', () => {
    const h = aeWith(ttl);
    const plan = planInsert({ item: ttl, ctx: aeCtx(h), values: initialValues(ttl), fonts: ALL_FONTS, env: { platform: 'win', libraryRoot: LIB } });
    const r = h.call('insertItem', { ...plan.request, variant: { ...plan.request.variant, aeComp: 'CR_TTL_LowerThird_5x5_v1' } });
    expect(r.error).toMatchObject({ code: 'TEMPLATE_BROKEN' });
    expect(h.run('__ae.undo')).toEqual(['begin BrandKit: Подпись спикера', 'end']);
  });

  it('scales the nearest variant into the frame', () => {
    const h = aeWith(ttl);
    h.run('__ae.userComp(2560, 1440, 25, 0)');
    const plan = planInsert({ item: ttl, ctx: aeCtx(h), values: initialValues(ttl), fonts: ALL_FONTS, options: { acceptNearest: true }, env: { platform: 'win', libraryRoot: LIB } });
    expect(h.call('insertItem', plan.request).ok).toBe(true);
    expect(h.run('app.project.activeItem.layer(1)._scale.value')).toEqual([66.6667, 66.6667]);
  });

  it('cuts a trim template, writes its duration, fills a media slot and copies template footage', () => {
    const web = webScreen();
    const h = aeWith(web, { footage: [`${LIB}/items/WEB_Screen/qr_telegram.png`] });
    h.run(`__ae.files['C:/media/visual.mp4'] = 'media'`);
    const values = { ...initialValues(web), timer: true, minutes: 2, visual: 'C:/media/visual.mp4' };
    const plan = planInsert({ item: web, ctx: aeCtx(h), values, fonts: ALL_FONTS, env: { platform: 'win', libraryRoot: LIB } });
    expect(plan.request).toMatchObject({ lengthSec: 125, remap: null, serviceDuration: { value: 125 } });
    const r = h.call('insertItem', plan.request);
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({ lengthSec: 125, readback: { 'Длительность (служебное, не менять)': 125, 'Визуал': 'Визуал_visual.mp4', 'Минуты': 2 } });
    expect(h.run('app.project.activeItem.layer(1).timeRemapEnabled')).toBe(false);
    expect(h.run('__ae.calls').filter((c) => /^(copy|replace)/.test(c))).toEqual([
      `copy ${LIB}/items/WEB_Screen/qr_telegram.png -> C:/CRBK/work/user/Cloud.ru BrandKit/WEB_Screen@1/qr_telegram.png`,
      'replace qr_telegram.png -> C:/CRBK/work/user/Cloud.ru BrandKit/WEB_Screen@1/qr_telegram.png',
    ]);
  });

  it('checks fonts by PostScript name with their build', () => {
    const h = host(FAKE_AE);
    h.run(`__ae.fonts['SBSansText-Regular'] = { version: 'Version 1.003', isSubstitute: false, location: 'C:\\\\Windows\\\\Fonts\\\\SBSansText-Regular.otf' }`);
    expect(h.call('checkFonts', { names: ['SBSansText-Regular', 'SBSansDisplay-Bold'] }).data).toEqual({
      'SBSansText-Regular': { found: true, version: 'Version 1.003', substitute: false, location: 'C:/Windows/Fonts/SBSansText-Regular.otf' },
      'SBSansDisplay-Bold': { found: false, version: null, substitute: false, location: null },
    });
  });

  it('runs the whole chain: core plan, bridge, adapter, readback', async () => {
    const h = aeWith(ttl);
    const bridge = new Bridge({ evalScript: h.evalScript });
    const ctx = (await bridge.call('getContext')).data;
    const fonts = (await bridge.call('checkFonts', { names: ttl.requiredFonts.map((f) => f.postScriptName) })).data;
    const plan = planInsert({ item: ttl, ctx, values: { ...initialValues(ttl), name: 'Ёжик' }, fonts: { ...fonts, ...ALL_FONTS }, env: { platform: 'win', libraryRoot: LIB } });
    const out = await runInsert(bridge, 'ae', plan.request);
    expect(out).toMatchObject({ ok: true, problems: [] });
    expect(out.reply.readback['Имя']).toBe('Ёжик');
  });
});

function prWith(it, { tracks = 3, player = 40 } = {}) {
  const h = host(FAKE_PR);
  h.run(`__pr.sequence(1920, 1080, 25, ${tracks}, ${player})`);
  for (const v of it.variants) {
    const params = it.fields.filter((f) => f.type !== 'media').map((f) => ({
      name: f.egpName,
      kind: f.type === 'text' ? 'text' : 'number',
      value: f.type === 'text' ? f.default ?? '' : f.type === 'checkbox' ? Boolean(f.default) : f.type === 'dropdown' ? (f.default ?? 1) - 1 : f.default ?? 0,
    }));
    const D = it.fit === 'trim' ? it.duration.maxSec : it.duration.introSec + it.duration.holdSec + it.duration.outroSec;
    h.ctx.__params = params;
    h.run(`__pr.mogrt(${JSON.stringify(`${LIB}/${v.file}`)}, ${D}, __params)`);
  }
  return h;
}

const prPlan = (h, it, values, options = {}) =>
  planInsert({ item: it, ctx: h.call('getContext').data, values: values ?? initialValues(it), fonts: ALL_FONTS, options, env: { platform: 'win', libraryRoot: LIB } });

describe('Premiere adapter', () => {
  const ttl = item('TTL_LowerThird');

  it('reports the active sequence at the playhead', () => {
    const h = prWith(ttl);
    expect(h.call('getContext').data).toMatchObject({
      host: 'pr',
      project: { saved: true, path: 'C:/CRBK/work/pr/edit.prproj' },
      target: { kind: 'sequence', id: 'seq-Edit', w: 1920, h: 1080, fps: 25, timeSec: 40 },
    });
  });

  it('inserts on the lowest free track from V2, cuts the length, writes and reads back the fields', () => {
    const h = prWith(ttl);
    h.run('__pr.occupy(0, 0, 100); __pr.occupy(1, 44, 50)');
    const plan = prPlan(h, ttl, { ...initialValues(ttl), name: 'Анна', style: 3, side: 2 }, { lengthSec: 15 });
    const r = h.call('insertItem', plan.request);
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({ track: 3, startSec: 40, lengthSec: 15, retried: false, addedTracks: 0 });
    expect(r.data.readback).toMatchObject({ 'Имя': 'Анна', 'Стиль': 2, 'Сторона': 1, 'Должность, 2-я строка': '' });
    expect(h.run('app.project.activeSequence._tracks[1]._clips.length')).toBe(1);
    expect(h.run('app.project.activeSequence.getSelection().map(function (c) { return c.name; })')).toEqual(['TTL_LowerThird_16x9_v1']);
  });

  it('keeps the track free over the length the MOGRT is placed with before the cut', () => {
    const h = prWith(ttl);
    h.run('__pr.occupy(1, 44.5, 50)');
    const plan = prPlan(h, ttl, undefined, { lengthSec: 4.4 });
    expect(plan.request.placeSec).toBe(6);
    expect(h.call('insertItem', plan.request).data.track).toBe(3);
  });

  it('adds a track when every track is taken', () => {
    const h = prWith(ttl, { tracks: 2 });
    h.run('__pr.occupy(1, 0, 100)');
    const r = h.call('insertItem', prPlan(h, ttl).request);
    expect(r.data).toMatchObject({ track: 3, addedTracks: 1 });
    expect(h.run('__pr.calls').filter((c) => c.indexOf('qe.') === 0)).toEqual(['qe.addTracks 1,2,0']);
  });

  it('inserts once more only when the clip never appeared', () => {
    const h = prWith(ttl);
    h.run('__pr.drop = [1]');
    const r = h.call('insertItem', { ...prPlan(h, ttl).request, waitMs: 50 });
    expect(r.data).toMatchObject({ retried: true, track: 2 });
    expect(h.run('app.project.activeSequence._tracks[1]._clips.length')).toBe(1);
    const h2 = prWith(ttl);
    h2.run('__pr.drop = [1, 2]');
    const r2 = h2.call('insertItem', { ...prPlan(h2, ttl).request, waitMs: 50 });
    expect(r2.error).toMatchObject({ code: 'INSERT_FAILED', message: 'клип не появился на V2' });
    expect(h2.run('__pr.imports')).toBe(2);
  });

  it('scales the nearest variant into a 1440p sequence', () => {
    const h = prWith(ttl);
    h.run('app.project.activeSequence.frameSizeHorizontal = 2560; app.project.activeSequence.frameSizeVertical = 1440');
    const plan = prPlan(h, ttl, undefined, { acceptNearest: true });
    const r = h.call('insertItem', plan.request);
    expect(r.data.notes).toContain('scale: 66.667');
  });

  it('refuses another sequence, an unsaved project and a missing MOGRT', () => {
    const h = prWith(ttl);
    const plan = prPlan(h, ttl);
    expect(h.call('insertItem', { ...plan.request, targetId: 'other' }).error.code).toBe('NO_TARGET');
    expect(h.call('insertItem', { ...plan.request, variant: { ...plan.request.variant, file: `${LIB}/items/x.mogrt` } }).error.code).toBe('NO_FILE');
    h.run('app.project.path = ""');
    expect(h.call('insertItem', plan.request).error.code).toBe('NOT_SAVED');
    expect(h.run('__pr.imports')).toBe(0);
  });

  it('reads fields back and finds an insert after a timeout', () => {
    const h = prWith(ttl);
    const plan = prPlan(h, ttl, { ...initialValues(ttl), name: 'Олег', style: 2 });
    h.call('insertItem', plan.request);
    const back = h.call('readFields', { targetId: 'seq-Edit', startSec: 40, fields: [{ egpName: 'Имя', type: 'text' }, { egpName: 'Стиль', type: 'dropdown' }] });
    expect(back.data).toMatchObject({ values: { 'Имя': 'Олег', 'Стиль': 1 }, track: 2, lengthSec: 6 });
    expect(h.call('probeInsert', { targetId: 'seq-Edit', startSec: 40, file: plan.request.variant.file }).data).toEqual({ found: true, name: 'TTL_LowerThird_16x9_v1', track: 2 });
    expect(h.call('probeInsert', { targetId: 'seq-Edit', startSec: 41, file: plan.request.variant.file }).data.found).toBe(false);
  });

  it('runs the whole chain for a trim template: cut and service duration', async () => {
    const web = webScreen();
    const h = prWith(web);
    const bridge = new Bridge({ evalScript: h.evalScript });
    const ctx = (await bridge.call('getContext')).data;
    const plan = planInsert({ item: web, ctx, values: { ...initialValues(web), timer: true, minutes: 1 }, fonts: ALL_FONTS, env: { platform: 'win', libraryRoot: LIB } });
    const out = await runInsert(bridge, 'pr', plan.request);
    expect(out).toMatchObject({ ok: true, problems: [], reply: { lengthSec: 65, readback: { 'Длительность (служебное, не менять)': 65, 'Таймер': true, 'Минуты': 1 } } });
  });
});
