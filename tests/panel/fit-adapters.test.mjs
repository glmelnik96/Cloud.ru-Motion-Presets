// selectedClip and fitClip of the Premiere adapter on the fake, then the chain core -> bridge -> adapter.
// The fake repeats S7 on Premiere 26.5.2: Motion by match name (0 Position normalized, 1 Scale), Crop added
// through QE by its name, matchName AE.ADBE AECrop, parameters Left, Top, Right, Bottom in percent.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { composeHost } from '../../panel/host/compose.mjs';
import { Bridge } from '../../panel/src/bridge/bridge.ts';
import { planFit, runFit } from '../../panel/src/core/fit.ts';
import { exampleItem } from './fixtures.ts';

const FAKE = readFileSync(new URL('./fake-pr.js', import.meta.url), 'utf8');
const BUNDLE = composeHost();
const REC = 'C:/rec/speaker.mp4';

function pr(setup) {
  const ctx = vm.createContext({});
  vm.runInContext(FAKE, ctx);
  vm.runInContext(BUNDLE, ctx);
  const run = (code) => vm.runInContext(code, ctx);
  run(`__pr.sequence(1920, 1080, 25, 4, 2); __pr.addMedia(${JSON.stringify(REC)}, 30, false, 1920, 1080);`);
  if (setup) run(setup);
  const call = (fn, args) => JSON.parse(run(`BK.call(${JSON.stringify(fn)}, ${JSON.stringify(JSON.stringify(args ?? null))})`));
  const bridge = new Bridge({ evalScript: async (s) => String(run(s)), loadHost: async () => undefined, sleep: async () => undefined });
  return { run, call, bridge };
}

const motion = (h0) => JSON.parse(h0.run(`(function () { var c = app.project.activeSequence._tracks[1]._clips[0]; var out = {};
  c._components.forEach(function (k) { out[k.matchName] = []; for (var i = 0; i < k.properties.numItems; i++) out[k.matchName].push(k.properties[i].getValue()); });
  return JSON.stringify(out); })()`));

describe('Premiere selectedClip', () => {
  it('the one selected video clip, its track, start and frame size', () => {
    const h0 = pr(`__pr.clipOf(${JSON.stringify(REC)}, 1, 4, true)`);
    expect(h0.call('selectedClip', { targetId: 'seq-Edit' }).data).toEqual({ track: 1, startTicks: String(4 * 254016000000), name: 'speaker.mp4', src: { w: 1920, h: 1080, par: 1 }, motion: { position: [960, 540], scale: 100, scaleWidth: null, uniform: null } });
  });

  it('refuses none, two, the template itself, and a clip without a frame size', () => {
    expect(pr().call('selectedClip', {}).error).toMatchObject({ code: 'NO_SELECTION', message: '' });
    expect(pr(`__pr.clipOf(${JSON.stringify(REC)}, 1, 4, true); __pr.clipOf(${JSON.stringify(REC)}, 2, 4, true)`).call('selectedClip', {}).error).toMatchObject({ code: 'NO_SELECTION', message: 'выделено клипов: 2' });
    const mg = pr(`var c = __pr.clipOf(${JSON.stringify(REC)}, 1, 4, true); c._isMgt = true;`);
    expect(mg.call('selectedClip', {}).error.message).toBe('выделен шаблон, а не клип');
    const nosize = pr(`__pr.addMedia('C:/rec/a.wav', 3, false); __pr.clipOf('C:/rec/a.wav', 1, 0, true)`);
    expect(nosize.call('selectedClip', {}).error.code).toBe('NO_SIZE');
  });
});

describe('Premiere fitClip', () => {
  const ref = { track: 1, startTicks: String(4 * 254016000000), name: 'speaker.mp4' };

  it('sets Position (normalized) and Scale, adds Crop through QE and reads everything back', () => {
    const h0 = pr(`__pr.clipOf(${JSON.stringify(REC)}, 1, 4, true)`);
    const r = h0.call('fitClip', { targetId: 'seq-Edit', clip: ref, frame: { w: 1920, h: 1080 }, scale: 66.667, position: [1632, 522], crop: { left: 35, top: 0, right: 35, bottom: 0 }, cropNames: ['Crop'] });
    expect(r.data).toEqual({ name: 'speaker.mp4', scale: 66.667, position: [1632, 522], normalized: true, crop: { left: 35, top: 0, right: 35, bottom: 0 }, cropAdded: true, cropMissing: false });
    const m = motion(h0);
    expect(m['AE.ADBE Motion'][0]).toEqual([0.85, 0.48333333333333334]);
    expect(m['AE.ADBE AECrop'].slice(0, 4)).toEqual([35, 0, 35, 0]);
  });

  it('a second fit reuses the Crop and clears it when the clip fits', () => {
    const h0 = pr(`__pr.clipOf(${JSON.stringify(REC)}, 1, 4, true)`);
    const args = { targetId: 'seq-Edit', clip: ref, frame: { w: 1920, h: 1080 }, scale: 66.667, position: [1632, 522], crop: { left: 35, top: 0, right: 35, bottom: 0 }, cropNames: ['Crop'] };
    h0.call('fitClip', args);
    const r = h0.call('fitClip', { ...args, position: [736, 522], crop: null });
    expect(r.data).toMatchObject({ crop: null, cropAdded: false, cropMissing: false });
    expect(motion(h0)['AE.ADBE AECrop'].slice(0, 4)).toEqual([0, 0, 0, 0]);
    expect(h0.run(`__pr.calls.filter(function (c) { return /qe.addVideoEffect/.test(c); }).length`)).toBe(1);
  });

  it('Russian interface: «Обрезка»; no such effect at all: cropMissing', () => {
    const ru = pr(`__pr.effects = ['Обрезка']; __pr.clipOf(${JSON.stringify(REC)}, 1, 4, true)`);
    const args = { targetId: 'seq-Edit', clip: ref, frame: { w: 1920, h: 1080 }, scale: 66.667, position: [1632, 522], crop: { left: 35, top: 0, right: 35, bottom: 0 }, cropNames: ['Crop', 'Обрезка'] };
    expect(ru.call('fitClip', args).data.cropAdded).toBe(true);
    const none = pr(`__pr.effects = []; __pr.clipOf(${JSON.stringify(REC)}, 1, 4, true)`);
    expect(none.call('fitClip', args).data).toMatchObject({ cropAdded: false, cropMissing: true, crop: null, scale: 66.667 });
  });

  it('refuses a clip that moved', () => {
    const h0 = pr(`__pr.clipOf(${JSON.stringify(REC)}, 1, 4, true)`);
    expect(h0.call('fitClip', { targetId: 'seq-Edit', clip: { ...ref, startTicks: '1' }, frame: { w: 1920, h: 1080 }, scale: 50, position: [0, 0], crop: null }).error.code).toBe('NO_TARGET');
  });
});

describe('fit through the bridge', () => {
  it('plan, selectedClip, numbers, fitClip; a warning when Crop cannot be added', async () => {
    const h0 = pr(`__pr.effects = []; __pr.clipOf(${JSON.stringify(REC)}, 1, 4, true)`);
    const ctx = (await h0.bridge.call('getContext')).data;
    const plan = planFit(exampleItem('WEB_Screen'), ctx, {}, 'speaker');
    const out = await runFit(h0.bridge, plan.request);
    expect(out.ok).toBe(true);
    expect(out.numbers).toEqual({ scale: 66.667, position: [1632, 522], crop: { left: 35, top: 0, right: 35, bottom: 0 } });
    expect(out.problems.map((p) => p.code)).toEqual(['FIT_NO_CROP']);
  });

  it('nothing selected: the message asks for one clip', async () => {
    const h0 = pr();
    const ctx = (await h0.bridge.call('getContext')).data;
    const out = await runFit(h0.bridge, planFit(exampleItem('WEB_Screen'), ctx, {}, 'screen').request);
    expect(out.problems[0].message).toBe('Выделите на таймлайне один видеоклип, который вписать в окно.');
  });
});
