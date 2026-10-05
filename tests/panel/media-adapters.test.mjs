// T2/T3 files and T1 companions through the host bundle on the fakes (fake-ae.js, fake-pr.js): what
// insertMedia and insertItem do with the layouts of panel/src/core/media.ts. The panel has copied the files
// next to the project before the call (Prepare); here they are registered at those paths.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { composeHost } from '../../panel/host/compose.mjs';
import { Bridge } from '../../panel/src/bridge/bridge.ts';
import { initialValues } from '../../panel/src/core/fields.ts';
import { planItem, runInsert, runMedia } from '../../panel/src/core/insert.ts';
import { ALL_FONTS, exampleItem, lookupExample } from './fixtures.ts';

const FAKE_AE = readFileSync(new URL('./fake-ae.js', import.meta.url), 'utf8');
const FAKE_PR = readFileSync(new URL('./fake-pr.js', import.meta.url), 'utf8');
const BUNDLE = composeHost();
const LIB = 'C:/ProgramData/CloudRuBrandKit/library';
const env = { platform: 'win', libraryRoot: LIB };

function host(fake) {
  const ctx = vm.createContext({});
  vm.runInContext(fake, ctx);
  vm.runInContext(BUNDLE, ctx);
  const run = (code) => vm.runInContext(code, ctx);
  const call = (fn, args) => JSON.parse(run(`BK.call(${JSON.stringify(fn)}, ${JSON.stringify(JSON.stringify(args ?? null))})`));
  return { ctx, run, call, bridge: new Bridge({ evalScript: async (s) => String(run(s)) }) };
}

// Natural lengths of the example files, by name.
function mediaOf(file) {
  const name = file.split('/').pop();
  if (/\.png$/.test(name)) return { sec: 0, still: true };
  if (/_intro_|_outro_/.test(name)) return { sec: 1, still: false };
  if (/^BG_WebinarPortal_.*_loop_/.test(name)) return { sec: 30, still: false };
  if (/_loop_/.test(name)) return { sec: 10, still: false };
  if (/^TRN_/.test(name)) return { sec: 1, still: false };
  if (/^SFX_WhooshIn/.test(name)) return { sec: 0.8, still: false };
  if (/^SFX_WebinarBed/.test(name)) return { sec: 60, still: false };
  throw new Error('no media for ' + name);
}

// What the panel does before the call: the copies and the backdrop still exist next to the project.
function prepared(h, prepare, fn) {
  for (const c of prepare.copies) {
    const m = mediaOf(c.to);
    h.run(`${fn}(${JSON.stringify(c.to)}, ${m.sec}, ${m.still})`);
  }
  for (const s of prepare.solids) h.run(`${fn}(${JSON.stringify(s.path)}, 0, true)`);
}

const plan = (h, item, options = {}, values = {}) =>
  planItem({ item, ctx: h.call('getContext').data, values, fonts: ALL_FONTS, options: { sound: { music: false, sfx: true }, ...options }, env, lookup: lookupExample });

// ---- After Effects ----

function ae({ time = 2 } = {}) {
  const h = host(FAKE_AE);
  h.run(`app.project.file = new File('C:/CRBK/work/user/user.aep'); __ae.folders['C:/CRBK/work/user'] = true; __ae.userComp(1920, 1080, 25, ${time});`);
  return h;
}

const aeLayers = (h) => h.run(`app.project.activeItem._layers.map(function (l) {
  return { name: l.name, start: Math.round(l.inPoint * 1000) / 1000, end: Math.round(l.outPoint * 1000) / 1000, loop: l.source.mainSource ? l.source.mainSource.loop : null, selected: l.selected };
})`);

describe('After Effects: media', () => {
  it('a loop with intro and outro, Interpret Footage > Loop, the #222222 solid under it, one undo group', async () => {
    const h = ae();
    const p = plan(h, exampleItem('BG_Arrows'));
    expect(p.media.lengthSec).toBe(58); // up to the end of the work area (60 s comp)
    prepared(h, p.media.prepare, '__ae.addMedia');
    const out = await runMedia(h.bridge, 'ae', p.media);
    expect(out).toMatchObject({ ok: true, problems: [] });
    expect(aeLayers(h)).toEqual([
      { name: 'BG_Arrows_16x9_intro_v1.mov', start: 2, end: 3, loop: 1, selected: true },
      { name: 'BG_Arrows_16x9_loop_v1.mov', start: 3, end: 59, loop: 6, selected: false },
      { name: 'BG_Arrows_16x9_outro_v1.mov', start: 59, end: 60, loop: 1, selected: false },
      { name: 'BrandKit #222222', start: 2, end: 60, loop: undefined, selected: false },
    ]);
    expect(out.reply).toMatchObject({ imported: 3, startSec: 2, lengthSec: 58 });
    // imports before the undo group: inside it AE 26.5 reported «Undo group mismatch» (build PC, 2026-10-05)
    expect(h.run('__ae.undo')).toEqual(['import BG_Arrows_16x9_intro_v1.mov', 'import BG_Arrows_16x9_loop_v1.mov', 'import BG_Arrows_16x9_outro_v1.mov', 'begin BrandKit: Фон со стрелками, петля 10 с', 'end']);
    expect(h.run('__ae.calls').filter((c) => c.startsWith('solid'))).toEqual(['solid BrandKit #222222 34,34,34']);
    // the files sit in the BrandKit folder, and a second insert reuses them
    expect(h.run(`(function () { var b = app.project.rootFolder.items.filter(function (i) { return i.name === 'Cloud.ru BrandKit'; })[0]; return b.items.length; })()`)).toBe(3);
    const again = h.call('insertMedia', p.media);
    expect(again.data.imported).toBe(0);
  });

  it('a transition puts its marker of full cover on the current time and keeps its own length', () => {
    const h = ae();
    const p = plan(h, exampleItem('TRN_StepWipe'));
    prepared(h, p.media.prepare, '__ae.addMedia');
    const r = h.call('insertMedia', p.media);
    expect(r.data.placed).toEqual([expect.objectContaining({ role: 'transition', startSec: 1.52, lengthSec: 1 })]);
  });

  it('a still is held for the length, a sound plays out', () => {
    const h = ae();
    const still = plan(h, exampleItem('BG_DotGrid'), { lengthSec: 8, backdrop: false });
    prepared(h, still.media.prepare, '__ae.addMedia');
    expect(h.call('insertMedia', still.media).data.placed).toEqual([expect.objectContaining({ role: 'still', startSec: 2, lengthSec: 8 })]);
    const sfx = plan(h, exampleItem('SFX_WhooshIn'));
    prepared(h, sfx.media.prepare, '__ae.addMedia');
    expect(h.call('insertMedia', sfx.media).data.placed).toEqual([expect.objectContaining({ role: 'sound', startSec: 2, lengthSec: 0.8 })]);
    expect(h.call('probeInsert', { targetId: h.call('getContext').data.target.id, startSec: 2, aeComp: null, file: sfx.media.layout.audio[0].file }).data.found).toBe(true);
  });

  it('refuses a missing file before the undo group opens', () => {
    const h = ae();
    const p = plan(h, exampleItem('BG_Arrows'));
    const r = h.call('insertMedia', p.media);
    expect(r.error.code).toBe('NO_FILE');
    expect(h.run('__ae.undo')).toEqual([]);
    expect(h.run('app.project.activeItem.numLayers')).toBe(0);
  });
});

describe('After Effects: companions of a template', () => {
  const D = (it) => it.fit === 'trim' ? it.duration.maxSec : it.duration.introSec + it.duration.holdSec + it.duration.outroSec;
  function withTemplate(it) {
    const h = ae();
    h.ctx.__specComps = it.variants.map((v) => ({ name: v.aeComp, w: v.w, h: v.h, duration: D(it), fps: v.fps, ep: it.fields.map((f) => ({ name: f.egpName, kind: f.type === 'text' ? 'text' : f.type === 'media' ? 'media' : 'number', value: f.type === 'text' ? f.default ?? '' : f.type === 'media' ? null : Number(f.default ?? 1) })) }));
    h.run(`__ae.template(${JSON.stringify(`${LIB}/${it.aep.file}`)}, __specComps, [])`);
    return h;
  }

  it('the webinar background goes right under the template for its length, the music under it', async () => {
    const web = exampleItem('WEB_Screen');
    const h = withTemplate(web);
    h.run('__ae.userComp(1920, 1080, 25, 2)');
    const p = plan(h, web, { sound: { music: true, sfx: true } }, initialValues(web));
    expect(p.ok).toBe(true);
    prepared(h, p.request.prepare, '__ae.addMedia');
    const out = await runInsert(h.bridge, 'ae', p.request);
    expect(out).toMatchObject({ ok: true, problems: [] });
    expect(aeLayers(h).map((l) => [l.name, l.start, l.end, l.loop])).toEqual([
      ['CR_WEB_Screen_16x9_v1', 2, 37, null],
      ['BG_WebinarPortal_16x9_loop_v1.mov', 2, 37, 2],
      ['SFX_WebinarBed_wav_v1.wav', 2, 37, 1],
    ]);
    expect(out.reply.companions.map((c) => c.role)).toEqual(['loop', 'sound']);
    expect(h.run('__ae.undo')).toEqual(['import WEB_Screen_v1.aep', 'import BG_WebinarPortal_16x9_loop_v1.mov', 'import SFX_WebinarBed_wav_v1.wav', 'begin BrandKit: Экран вебинара', 'end']);
  });

  it('a sound placed out ends with the template', () => {
    const ttl = exampleItem('TTL_LowerThird');
    ttl.companions = [{ ref: 'SFX_WhooshIn', kind: 'sfx', placement: 'out', default: true }];
    const h = withTemplate(ttl);
    h.run('__ae.userComp(1920, 1080, 25, 2)');
    const p = plan(h, ttl, {}, initialValues(ttl));
    prepared(h, p.request.prepare, '__ae.addMedia');
    const r = h.call('insertItem', p.request);
    expect(r.data.companions).toEqual([expect.objectContaining({ role: 'sound', startSec: 7.2, lengthSec: 0.8 })]);
  });
});

// ---- Premiere ----

function pr({ tracks = 3, player = 40, outSec = null } = {}) {
  const h = host(FAKE_PR);
  h.run(`__pr.sequence(1920, 1080, 25, ${tracks}, ${player})`);
  if (outSec !== null) h.run(`app.project.activeSequence._outTicks = ${outSec} * TPS`);
  return h;
}

const prClips = (h, audio = false) => h.run(`(function () { var out = [];
  app.project.activeSequence.${audio ? '_atracks' : '_tracks'}.forEach(function (t, i) { t._clips.forEach(function (c) {
    out.push([i + 1, c.name, Math.round(c._start / TPS * 1000) / 1000, Math.round((c._end - c._start) / TPS * 1000) / 1000]); }); });
  return out; })()`);

describe('Premiere: media', () => {
  it('reports the end of the in/out range for the length of loops', () => {
    expect(pr({ outSec: 70 }).call('getContext').data.target.rangeEndSec).toBe(70);
  });

  it('a loop repeats end to end on a track above its backdrop still', async () => {
    const h = pr();
    h.run('__pr.occupy(0, 0, 100)');
    const p = plan(h, exampleItem('BG_Arrows'), { lengthSec: 25 });
    prepared(h, p.media.prepare, '__pr.addMedia');
    const out = await runMedia(h.bridge, 'pr', p.media);
    expect(out).toMatchObject({ ok: true, problems: [] });
    expect(prClips(h).filter((c) => c[0] > 1)).toEqual([
      [2, 'backdrop_222222_1920x1080.png', 40, 25],
      [3, 'BG_Arrows_16x9_intro_v1.mov', 40, 1],
      [3, 'BG_Arrows_16x9_loop_v1.mov', 41, 10],
      [3, 'BG_Arrows_16x9_loop_v1.mov', 51, 10],
      [3, 'BG_Arrows_16x9_loop_v1.mov', 61, 3],
      [3, 'BG_Arrows_16x9_outro_v1.mov', 64, 1],
    ]);
    expect(out.reply.placed.map((x) => [x.role, x.track, x.clips])).toEqual([['intro', 3, 1], ['loop', 3, 3], ['outro', 3, 1], ['backdrop', 2, 1]]);
    expect(out.reply).toMatchObject({ imported: 4, addedTracks: 0 });
    expect(h.run('__pr.calls').filter((c) => c.startsWith('createBin'))).toEqual(['createBin Cloud.ru BrandKit']);
    expect(h.run('app.project.activeSequence.getSelection().map(function (c) { return c.name; })')).toEqual(['BG_Arrows_16x9_intro_v1.mov']);
    // the same files again: nothing imported twice
    h.run('app.project.activeSequence._player = 100 * TPS');
    const again = h.call('insertMedia', plan(h, exampleItem('BG_Arrows'), { lengthSec: 12 }).media);
    expect(again.data.imported).toBe(0);
  });

  it('adds tracks on top when the backdrop and the loop find none free', () => {
    const h = pr({ tracks: 2 });
    h.run('__pr.occupy(1, 0, 100)');
    const p = plan(h, exampleItem('BG_Arrows'), { lengthSec: 12 });
    prepared(h, p.media.prepare, '__pr.addMedia');
    const r = h.call('insertMedia', p.media);
    expect(r.data.addedTracks).toBe(2);
    expect(r.data.placed.map((x) => [x.role, x.track])).toEqual([['intro', 4], ['loop', 4], ['outro', 4], ['backdrop', 3]]);
  });

  it('a transition meets the nearest cut the adapter reports', () => {
    const h = pr();
    h.run('__pr.occupy(0, 0, 37.6); __pr.occupy(0, 37.6, 100)');
    const cuts = h.call('getCuts', { targetId: 'seq-Edit', aroundSec: 40, windowSec: 5 }).data.cuts;
    expect(cuts).toEqual([37.6]);
    const p = plan(h, exampleItem('TRN_StepWipe'), { cuts });
    prepared(h, p.media.prepare, '__pr.addMedia');
    const r = h.call('insertMedia', p.media);
    expect(r.data.placed).toEqual([expect.objectContaining({ role: 'transition', track: 2, startSec: 37.12, lengthSec: 1 })]);
  });

  it('a sound goes on the lowest free audio track from A2, a new one when all are taken', () => {
    const h = pr({ tracks: 2 });
    h.run('__pr.occupy(1, 0, 100, "music", true)');
    const p = plan(h, exampleItem('SFX_WhooshIn'));
    prepared(h, p.media.prepare, '__pr.addMedia');
    const r = h.call('insertMedia', p.media);
    expect(r.data.placed).toEqual([expect.objectContaining({ role: 'sound', audio: true, track: 3, startSec: 40, lengthSec: 0.8 })]);
    expect(h.run('__pr.calls').filter((c) => c.startsWith('qe.'))).toEqual(['qe.addTracks 0,2,1,1,2']);
    expect(h.call('probeInsert', { targetId: 'seq-Edit', startSec: 40, file: p.media.layout.audio[0].file }).data).toEqual({ found: true, name: 'SFX_WhooshIn_wav_v1.wav', track: 3 });
  });
});

describe('a bundle of another panel in the shared engine', () => {
  // Premiere 2026-10-05: an open 0.1.4 panel reloaded its bundle over 0.1.5, and insertMedia, getCuts and the
  // range of getContext were gone (no host function insertMedia). With bundleVersion the bridge loads its own
  // bundle again and repeats the call; nothing ran before, so an insert is not doubled.
  const VERSION = JSON.parse(readFileSync(new URL('../../panel/package.json', import.meta.url), 'utf8')).version;
  const OLD = BUNDLE.replace(`BK.version = '${VERSION}';`, "BK.version = '0.1.4';").replaceAll('A.insertMedia = function', 'A.insertMediaGone = function');

  it('reloads its bundle and runs an insert once', async () => {
    const h = pr();
    let loads = 0;
    const bridge = new Bridge({ evalScript: async (s) => String(h.run(s)), bundleVersion: VERSION, loadHost: async () => { loads += 1; h.run(BUNDLE); }, sleep: async () => undefined });
    const p = plan(h, exampleItem('SFX_WhooshIn'));
    prepared(h, p.media.prepare, '__pr.addMedia');
    h.run(OLD);
    expect(h.call('insertMedia', p.media).error.code).toBe('NO_FUNCTION');
    const out = await runMedia(bridge, 'pr', p.media);
    expect(out).toMatchObject({ ok: true, problems: [] });
    expect(loads).toBe(1);
    expect(prClips(h, true)).toEqual([[2, 'SFX_WhooshIn_wav_v1.wav', 40, 0.8]]);
  });

  it('gives up after its retries when another bundle wins every time', async () => {
    const h = pr();
    h.run(OLD);
    const bridge = new Bridge({ evalScript: async (s) => String(h.run(s)), bundleVersion: VERSION, loadHost: async () => { h.run(OLD); }, sleep: async () => undefined });
    const r = await bridge.call('ping', null, { mutating: true });
    expect(r.error).toEqual({ code: 'HOST_NOT_READY', message: 'в хосте другая версия пакета BrandKit: 0.1.4' });
  });
});

describe('Premiere: companions of a template', () => {
  function withMogrt(it) {
    const h = pr();
    for (const v of it.variants) {
      h.ctx.__params = it.fields.filter((f) => f.type !== 'media').map((f) => ({ name: f.egpName, kind: f.type === 'text' ? 'text' : 'number', value: f.type === 'text' ? f.default ?? '' : f.type === 'checkbox' ? Boolean(f.default) : f.type === 'dropdown' ? (f.default ?? 1) - 1 : f.default ?? 0 }));
      h.run(`__pr.mogrt(${JSON.stringify(`${LIB}/${v.file}`)}, ${it.duration.maxSec ?? it.duration.introSec + it.duration.holdSec + it.duration.outroSec}, __params)`);
    }
    return h;
  }

  it('the background loop under the MOGRT for its length, the music on A2', async () => {
    const web = exampleItem('WEB_Screen');
    const h = withMogrt(web);
    h.run('__pr.occupy(0, 0, 100)');
    const p = plan(h, web, { sound: { music: true, sfx: true } }, initialValues(web));
    prepared(h, p.request.prepare, '__pr.addMedia');
    const out = await runInsert(h.bridge, 'pr', p.request);
    expect(out).toMatchObject({ ok: true, problems: [] });
    expect(out.reply.track).toBe(3);
    expect(prClips(h).filter((c) => c[0] > 1)).toEqual([
      [2, 'BG_WebinarPortal_16x9_loop_v1.mov', 40, 30],
      [2, 'BG_WebinarPortal_16x9_loop_v1.mov', 70, 5],
      [3, 'WEB_Screen_16x9_v1', 40, 35],
    ]);
    expect(prClips(h, true)).toEqual([[2, 'SFX_WebinarBed_wav_v1.wav', 40, 35]]);
    expect(out.reply.companions.map((c) => [c.role, c.track, c.audio])).toEqual([['loop', 2, false], ['sound', 2, true]]);
  });

  it('without companions the MOGRT keeps the lowest free track', () => {
    const ttl = exampleItem('TTL_LowerThird');
    const h = withMogrt(ttl);
    const p = plan(h, ttl, { sound: { music: false, sfx: false } }, initialValues(ttl));
    expect(p.request.companions).toBeNull();
    expect(h.call('insertItem', p.request).data).toMatchObject({ track: 2, companions: [] });
  });
});
