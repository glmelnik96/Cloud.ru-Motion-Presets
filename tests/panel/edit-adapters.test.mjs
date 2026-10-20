// blurFields and importTextStyle of the Premiere adapter on the fake, and the chain core -> bridge -> adapter.
// The fake repeats the probes of the build PC (2026-10-07, 2026-10-20): Fast Blur (AE.ADBE Fast Blur) and Crop
// added through QE by name; the copy is a video-only subclip of the clip's range (createSubClip, takeAudio 0)
// overwritten onto the track above; the item itself would bring its audio onto the audio track of the same index
// and cut out what lies there; a .prtextstyle imports as an item named by its style.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { composeHost } from '../../panel/host/compose.mjs';
import { Bridge } from '../../panel/src/bridge/bridge.ts';
import { planStyle, runBlur, runStyle } from '../../panel/src/core/edit.ts';

const FAKE = readFileSync(new URL('./fake-pr.js', import.meta.url), 'utf8');
const BUNDLE = composeHost();
const REC = 'C:/rec/podcast.mp4';
const TPS = 254016000000;

function pr(setup) {
  const ctx = vm.createContext({});
  vm.runInContext(FAKE, ctx);
  vm.runInContext(BUNDLE, ctx);
  const run = (code) => vm.runInContext(code, ctx);
  run(`__pr.sequence(1920, 1080, 25, 3, 0); __pr.addMedia(${JSON.stringify(REC)}, 60, false, 1920, 1080, '1.0', true);`);
  if (setup) run(setup);
  const call = (fn, args) => JSON.parse(run(`BK.call(${JSON.stringify(fn)}, ${JSON.stringify(JSON.stringify(args ?? null))})`));
  const bridge = new Bridge({ evalScript: async (s) => String(run(s)), loadHost: async () => undefined, sleep: async () => undefined });
  return { run, call, bridge };
}

// The clip of the recording on V1 from 4 s, its source from 10 s to 40 s, with its audio on A1.
const SETUP = `var c = __pr.clipOf(${JSON.stringify(REC)}, 0, 4, true); c._in = 10 * TPS; c._out = 40 * TPS; c._end = c._start + 30 * TPS;
  var a = __pr.occupy(0, 4, 34, 'podcast.mp4', true);`;
const ref = { track: 0, startTicks: String(4 * TPS), name: 'podcast.mp4', src: { w: 1920, h: 1080, par: 1 } };
const COPY = 'podcast.mp4 · резкая копия';
const args = { targetId: 'seq-Edit', clip: ref, blurriness: 20, crop: { left: 2.734, top: 4.722, right: 2.734, bottom: 4.722 }, blurNames: ['Fast Blur'], cropNames: ['Crop'], copyName: COPY, bin: 'Cloud.ru BrandKit' };
const binNames = (h, name) => h.run(`(function () { var r = app.project.rootItem._children; for (var i = 0; i < r.length; i++) if (r[i].name === ${JSON.stringify(name)}) return r[i]._children.map(function (c) { return c.name; }).join('|'); return 'no bin'; })()`);
const rootNames = (h) => h.run(`app.project.rootItem._children.map(function (c) { return c.name; }).join('|')`);

const tracks = (h) => JSON.parse(h.run(`(function () { var s = app.project.activeSequence; function list(ts) { return ts.map(function (t) { return t._clips.map(function (c) {
  var fx = {}; c._components.forEach(function (k) { var v = []; for (var i = 0; i < k.properties.numItems; i++) v.push(k.properties[i].getValue()); fx[k.matchName] = v; });
  return { name: c.name, start: c._start / TPS, end: c._end / TPS, in: c._in / TPS, out: c._out / TPS, fx: fx }; }); }); }
  return JSON.stringify({ v: list(s._tracks), a: list(s._atracks) }); })()`));

describe('Premiere blurFields', () => {
  it('Fast Blur on the clip, a video-only subclip of its range on the track above with Crop, in the BrandKit bin', () => {
    const h0 = pr(SETUP);
    const r = h0.call('blurFields', args);
    expect(r.data).toEqual({ name: 'podcast.mp4', copyTrack: 1, blurriness: 20, crop: { left: 2.734, top: 4.722, right: 2.734, bottom: 4.722 }, effects: [], keyed: false });
    const t = tracks(h0);
    expect(t.v[0][0]).toMatchObject({ start: 4, end: 34, in: 10, out: 40 });
    expect(t.v[0][0].fx['AE.ADBE Fast Blur']).toEqual([20, 0, true]);
    expect(t.v[1]).toHaveLength(1);
    expect(t.v[1][0]).toMatchObject({ name: COPY, start: 4, end: 34, in: 0, out: 30 });
    expect(h0.run('JSON.stringify(app.project.activeSequence._tracks[1]._clips[0].projectItem._sub)')).toBe(JSON.stringify({ inT: 10 * TPS, outT: 40 * TPS, video: true, audio: false }));
    expect(binNames(h0, 'Cloud.ru BrandKit')).toBe(COPY);
    expect(rootNames(h0)).toBe('Cloud.ru BrandKit');
    expect(t.v[1][0].fx['AE.ADBE AECrop'].slice(0, 4)).toEqual([2.734, 4.722, 2.734, 4.722]);
    expect(t.v[1][0].fx['AE.ADBE Fast Blur']).toBeUndefined();
    // the audio of the clip stays, nothing lands on A2; the project item keeps its own range
    expect(t.a[0]).toHaveLength(1);
    expect(t.a[1]).toEqual([]);
    expect(h0.run(`JSON.stringify([app.project.activeSequence._tracks[0]._clips[0].projectItem._inT || 0, app.project.activeSequence._tracks[0]._clips[0].projectItem._outT === undefined])`)).toBe('[0,true]');
  });

  it('a sound on the audio track under the copy stays as it was (a music bed on A2 lost 28 s, 2026-10-20)', () => {
    const h0 = pr(`${SETUP}; __pr.occupy(1, 0, 60, 'music.wav', true);`);
    expect(h0.call('blurFields', args).data.copyTrack).toBe(1);
    const t = tracks(h0);
    expect(t.a[1]).toEqual([expect.objectContaining({ name: 'music.wav', start: 0, end: 60 })]);
    expect(t.a[0]).toEqual([expect.objectContaining({ name: 'podcast.mp4', start: 4, end: 34 })]);
  });

  it('no subclip from Premiere (a nested sequence): the item itself, only over a free audio track, its audio removed', () => {
    const free = pr(`${SETUP}; __pr.noSubclip = true;`);
    expect(free.call('blurFields', args).data.copyTrack).toBe(1);
    const t = tracks(free);
    expect(t.v[1][0]).toMatchObject({ name: 'podcast.mp4', start: 4, end: 34, in: 10, out: 40 });
    expect(t.a[1]).toEqual([]);
    expect(free.run('JSON.stringify([app.project.activeSequence._tracks[0]._clips[0].projectItem._inT || 0, app.project.activeSequence._tracks[0]._clips[0].projectItem._outT === undefined])')).toBe('[0,true]');
    const busy = pr(`${SETUP}; __pr.noSubclip = true; __pr.occupy(1, 30, 50, 'music.wav', true);`);
    expect(busy.call('blurFields', args).error.code).toBe('NO_AUDIO_ROOM');
    expect(busy.run('__pr.calls.filter(function (c) { return /overwrite|qe.addVideoEffect/.test(c); }).length')).toBe(0);
    expect(tracks(busy).a[1]).toEqual([expect.objectContaining({ name: 'music.wav', start: 30, end: 50 })]);
  });

  it('the copy takes Motion of the clip; other effects are named, not copied', () => {
    const h0 = pr(`${SETUP}; c._scale._value = 120; c._position._value = [0.45, 0.5]; c._components.push({ matchName: 'AE.ADBE Lumetri', displayName: 'Lumetri Color', properties: { numItems: 0 } });`);
    const r = h0.call('blurFields', args);
    expect(r.data.effects).toEqual(['Lumetri Color']);
    const t = tracks(h0);
    expect(t.v[1][0].fx['AE.ADBE Motion']).toEqual([[0.45, 0.5], 120]);
    expect(t.v[1][0].fx['AE.ADBE Lumetri']).toBeUndefined();
  });

  it('a busy track above or none, and a clip blurred already: nothing changes', () => {
    const busy = pr(`${SETUP}; __pr.occupy(1, 30, 40, 'title')`);
    expect(busy.call('blurFields', args).error.code).toBe('NO_TRACK');
    expect(busy.run(`__pr.calls.filter(function (c) { return /overwrite|qe.addVideoEffect/.test(c); }).length`)).toBe(0);
    const top = pr(`__pr.sequence(1920, 1080, 25, 1, 0); ${SETUP}`);
    expect(top.call('blurFields', args).error.code).toBe('NO_TRACK');
    const again = pr(SETUP);
    again.call('blurFields', args);
    expect(again.call('blurFields', args).error.code).toBe('ALREADY');
  });

  it('the chain: selectedClip reads Motion, the core sends the numbers of the pack', async () => {
    const h0 = pr(SETUP);
    const out = await runBlur(h0.bridge, { id: 'seq-Edit', w: 1920, h: 1080 });
    expect(out.ok).toBe(true);
    expect(out.numbers).toMatchObject({ blurriness: 20, covers: true, crop: { left: 2.734, top: 4.722 } });
    expect(out.problems).toEqual([]);
    expect(binNames(h0, 'Cloud.ru BrandKit')).toBe(COPY);
  });
});

describe('Premiere importTextStyle', () => {
  const item = { id: 'CRS_SubtitleStyle', title_ru: 'Стиль', category: 'courses', tier: 'T3', hosts: ['pr'], version: 1, textStyle: 'CR Субтитры', variants: [{ key: 'style', file: 'items/CRS_SubtitleStyle/CRS_SubtitleStyle_style_v1.prtextstyle', minHostVersion: {} }] };
  const FILE = 'C:/lib/items/CRS_SubtitleStyle/CRS_SubtitleStyle_style_v1.prtextstyle';
  const ctx = { host: 'pr', version: '26.5', project: { saved: true, path: null }, target: null };

  it('imports the file into the BrandKit bin once, under the name of the style', async () => {
    const h0 = pr(`__pr.addStyle(${JSON.stringify(FILE)}, 'CRS_SubtitleStyle_style_v1')`);
    const req = planStyle(item, ctx, 'C:/lib').request;
    expect((await runStyle(h0.bridge, req)).reply).toEqual({ name: 'CR Субтитры', imported: true });
    expect((await runStyle(h0.bridge, req)).reply).toEqual({ name: 'CR Субтитры', imported: false });
    expect(h0.run(`__pr.calls.filter(function (c) { return /import style/.test(c); }).join('|')`)).toBe('import style CRS_SubtitleStyle_style_v1.prtextstyle -> Cloud.ru BrandKit');
  });

  it('a style named inside the file, and a missing file', () => {
    const named = pr(`__pr.addStyle(${JSON.stringify(FILE)}, 'CR Субтитры')`);
    expect(named.call('importTextStyle', { file: FILE, name: 'CR Субтитры', bin: 'Cloud.ru BrandKit' }).data).toEqual({ name: 'CR Субтитры', imported: true });
    expect(pr().call('importTextStyle', { file: FILE, name: 'CR Субтитры', bin: 'Cloud.ru BrandKit' }).error.code).toBe('NO_FILE');
  });
});
