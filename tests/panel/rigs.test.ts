// «Движения» (panel/src/core/rigs.ts): the movements of the canon (brand/tokens.json, D19) as operations of the
// adapter, the plan of the call and what the reply becomes.
import { describe, expect, it } from 'vitest';
import { brandRigs, pair, planRig, runRig, type MaskOp, type NoiseMatteOp, type TextRiseOp, type TrackOp } from '../../panel/src/core/rigs';
import type { HostCaller } from '../../panel/src/core/host';
import type { HostContext } from '../../panel/src/core/types';

const FHD = { w: 1920, h: 1080 };
const ae = (target = true, w = 1920, h = 1080): HostContext => ({ host: 'ae', version: '26.5', project: { saved: true, path: null }, target: target ? { kind: 'comp', id: '7', name: 'Main', w, h, fps: 25, timeSec: 2, durationSec: 10 } : null });
const answer = (a: unknown): HostCaller => ({ call: async () => a }) as unknown as HostCaller;
const rig = (key: string) => {
  const r = brandRigs().find((x) => x.key === key);
  if (!r) throw new Error('no rig ' + key);
  return r;
};

describe('brand rigs: the canon as operations', () => {
  it('a pair of keys of a canon curve: speed 0, outgoing x1, incoming 1 − x2, seconds at 25 fps', () => {
    expect(pair(20, [0.333, 0, 0, 1], 0, 1)).toEqual([{ t: 0, v: 0, out: [0, 33.3] }, { t: 0.8, v: 1, in: [0, 100] }]);
    // an offset start; an influence below 0.1 % is raised to what AE accepts
    expect(pair(7, [0.0001, 0, 0.83, 1], [0, 0.83], [0, 1], 9)).toEqual([{ t: 0.36, v: [0, 0.83], out: [0, 0.1] }, { t: 0.64, v: [0, 1], in: [0, 17] }]);
  });

  it('every movement M1…M12 of the canon, in order, with buttons per style and direction', () => {
    const list = brandRigs();
    const types = [...new Set(list.map((r) => r.key.split('.')[0]))];
    expect(types).toEqual(['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12']);
    expect(list.filter((r) => r.key.startsWith('M1.')).map((r) => r.key)).toEqual([
      'M1.titles.in', 'M1.titles.out', 'M1.podcast.in', 'M1.podcast.out', 'M1.smm.in', 'M1.smm.out', 'M1.logo.in', 'M1.logo.out',
    ]);
    // M2: an exit only where the canon has one
    expect(list.filter((r) => r.key.startsWith('M2.')).map((r) => r.key)).toEqual([
      'M2.titlesName.in', 'M2.titlesRole.in', 'M2.podcast.in', 'M2.podcast.out', 'M2.smmPlates.in', 'M2.smmPlates.out', 'M2.smmIntro.in', 'M2.courses.in',
    ]);
    expect(list.find((r) => r.key === 'M1.titles.in')).toMatchObject({ group: 'Плашка по X (M1): титры', label: 'вход', frames: 20, layers: 'any', hint: expect.stringContaining('от опорной точки') });
    expect(list.every((r) => r.hint.length > 10)).toBe(true);
    // every influence is one AE accepts
    const keys = list.flatMap((r) => r.ops(FHD)).flatMap((o) => ('keys' in o ? o.keys : 'startKeys' in o ? [...(o.startKeys ?? []), ...(o.positionKeys ?? [])] : []));
    expect(keys.length).toBeGreaterThan(50);
    for (const k of keys) for (const e of [k.in, k.out]) if (e) expect(e[1] >= 0.1 && e[1] <= 100).toBe(true);
  });

  it('M1: Scale X from 0 to the plate, stagger of the style; the exit of the logo shots along Y', () => {
    const titles = rig('M1.titles.in');
    expect(titles.stagger).toBe(0.04);
    expect(titles.ops(FHD)).toEqual([{ kind: 'track', prop: 'scale', mode: 'mul', dims: [0], keys: [{ t: 0, v: 0, out: [0, 33.3] }, { t: 0.8, v: 1, in: [0, 100] }] }]);
    expect((rig('M1.smm.out').ops(FHD)[0] as TrackOp).keys).toEqual([{ t: 0, v: 1, out: [0, 92] }, { t: 0.8, v: 0, in: [0, 84.2] }]);
    expect(rig('M1.smm.in').stagger).toBe(0.4);
    expect((rig('M1.logo.out').ops(FHD)[0] as TrackOp).dims).toEqual([1]);
  });

  it('M2: an animator rising by the height of its block, by words or by lines; the keyed role and the delays of courses', () => {
    expect(rig('M2.titlesName.in').ops(FHD)).toEqual([{ kind: 'textRise', name: 'BrandKit M2', basedOn: 3, rise: 1.15, startKeys: [{ t: 0, v: 0, linear: true }, { t: 0.52, v: 100, linear: true }] }]);
    const role = rig('M2.titlesRole.in').ops(FHD)[0] as TextRiseOp;
    expect(role.basedOn).toBe(4);
    expect(role.startKeys).toEqual([
      { t: 0, v: 0, out: [0, 38.892] },
      { t: 0.68, v: 91.762, in: [92.801, 53.725], out: [92.801, 27.618] },
      { t: 1.08, v: 100, in: [0, 66.124] },
    ]);
    expect((rig('M2.podcast.out').ops(FHD)[0] as TextRiseOp).startKeys).toEqual([{ t: 0, v: 100, out: [0, 77] }, { t: 0.72, v: 0, in: [0, 80] }]);
    expect(rig('M2.courses.in')).toMatchObject({ frames: 27, delays: [0, 0.52, 0.92], layers: 'text' });
    expect(rig('M2.smmIntro.in').stagger).toBe(0.08);
  });

  it('M3: the line rises 1.1 of its height in 16 frames, the lower edge of its mask opens over the last 7', () => {
    const [rise, mask] = rig('M3.in').ops(FHD) as [TextRiseOp, MaskOp];
    expect(rise).toEqual({ kind: 'textRise', name: 'BrandKit M3', basedOn: 1, positionKeys: [{ t: 0, v: 1.1, out: [0, 80] }, { t: 0.64, v: 0, in: [0, 81.5] }] });
    expect(mask).toEqual({ kind: 'mask', name: 'BrandKit M3', axis: 'y', keys: [{ t: 0.36, v: [0, 0.83], out: [0, 17] }, { t: 0.64, v: [0, 1], in: [0, 17] }] });
  });

  it('M4: the mask opens from the left or top edge and closes after it, one mask named for both', () => {
    expect(rig('M4.x.in').ops(FHD)).toEqual([{ kind: 'mask', name: 'BrandKit M4', axis: 'x', keys: [{ t: 0, v: [0, 0], out: [0, 67] }, { t: 1.16, v: [0, 1], in: [0, 89] }] }]);
    expect((rig('M4.y.out').ops(FHD)[0] as MaskOp)).toMatchObject({ axis: 'y', keys: [{ t: 0, v: [0, 1], out: [0, 64] }, { t: 1.12, v: [1, 1], in: [0, 74] }] });
    expect(rig('M4.y.out').label).toBe('по вертикали: выход');
  });

  it('M5, M6, M12: pops from the layer as it is; the flip and the logo pop keep the keys of the pack', () => {
    expect(rig('M5.in').ops(FHD)).toEqual([{ kind: 'track', prop: 'scale', mode: 'mul', keys: [{ t: 0, v: 0, out: [0, 33.3] }, { t: 0.52, v: 1, in: [0, 100] }] }]);
    expect(rig('M5.dots')).toMatchObject({ frames: 11, stagger: 0.16 });
    const [d3, flip] = rig('M6.in').ops(FHD) as [unknown, TrackOp];
    expect(d3).toEqual({ kind: 'make3D' });
    expect(flip).toMatchObject({ prop: 'rotationX', mode: 'add' });
    expect(flip.keys.map((k) => [k.t, k.v])).toEqual([[0, -90], [0.667, -3.612], [1.267, 0]]);
    expect(flip.keys[0].out).toEqual([11930.136, 0.541]);
    const [scale, x, opacity] = rig('M12.in').ops({ w: 3840, h: 2160 }) as TrackOp[];
    expect(scale.keys.map((k) => k.v)).toEqual([1.3228, 1.8519, 1.1673, 1]);
    expect(scale.keys[2].in).toEqual([-1.07371, 25.673]);
    // X in FHD pixels, doubled in a 4K comp; speeds with it
    expect(x).toMatchObject({ prop: 'position', mode: 'add', dims: [0] });
    expect(x.keys.map((k) => k.v)).toEqual([393.282, 554.13, 108.844, 0]);
    expect(x.keys[2].in).toEqual([-698.452, 25.673]);
    expect(opacity.keys.map((k) => k.v)).toEqual([0, 1]);
  });

  it('M7, M9: a Fractal Noise matte, its Scale by the short side of the comp; M8 in pixels of a 3840 frame', () => {
    expect(rig('M7.in').ops(FHD)).toEqual([{ kind: 'noiseMatte', name: 'BrandKit M7', scale: 224.48, seed: 'Math.floor(time * 25 / 8)' }]);
    // a vertical frame keeps the blocks of its short side
    expect((rig('M7.in').ops({ w: 1080, h: 1920 })[0] as NoiseMatteOp).scale).toBe(224.48);
    expect((rig('M9.in').ops(FHD)[0] as NoiseMatteOp).scale).toBe(112.5);
    expect((rig('M9.in').ops({ w: 3840, h: 2160 })[0] as NoiseMatteOp)).toEqual({ kind: 'noiseMatte', name: 'BrandKit M9', scale: 225, evolution: 'time*40' });
    const [d3, z, stroke] = rig('M8.in').ops(FHD) as [unknown, TrackOp, TrackOp];
    expect(d3).toEqual({ kind: 'make3D' });
    expect(z).toMatchObject({ prop: 'position', mode: 'add', dims: [2], keys: [{ t: 0, v: -645 }, { t: 0.92, v: 0 }] });
    expect(stroke).toMatchObject({ prop: 'strokeWidth', mode: 'add', keys: [{ t: 0, v: 44 }, { t: 0.8, v: 0 }] });
    expect((rig('M8.out').ops(FHD)[1] as TrackOp).keys.map((k) => k.v)).toEqual([0, -633]);
  });

  it('M10: four segments of 15 s back to the start with loopOut(), a drawing per neighbour; M11 an expression on Repeaters', () => {
    const op = rig('M10.a60').ops(FHD)[0] as TrackOp;
    expect(op).toMatchObject({ prop: 'position', mode: 'add', dims: [0, 1], expression: 'loopOut()' });
    expect(op.keySets).toHaveLength(3);
    expect(op.keySets![0].map((k) => [k.t, k.v])).toEqual([[0, [0, 0]], [15, [-60, 0]], [30, [-60, 15]], [45, [-60, -15]], [60, [0, 0]]]);
    expect(op.keySets![0][0]).toEqual({ t: 0, v: [0, 0], out: [0, 77.5] });
    expect(op.keySets![0][4]).toEqual({ t: 60, v: [0, 0], in: [0, 33.3] });
    expect(op.keySets![1][1].v).toEqual([15, -27]);
    expect(rig('M10.a120').frames).toBe(1500);
    expect(rig('M11.in')).toMatchObject({ layers: 'shape' });
    expect(rig('M11.in').ops(FHD)).toEqual([{ kind: 'expression', match: 'ADBE Vector Repeater Offset', expression: '-100 + time*0.5' }]);
  });
});

describe('brand rigs: plan and reply', () => {
  it('After Effects with a comp only; the ops for the frame of the comp; an undo label', () => {
    expect(planRig(ae(), rig('M5.in')).request).toMatchObject({ targetId: '7', rig: 'M5.in', layers: 'any', stagger: 0, delays: [], undoLabel: 'BrandKit: Поп (M5), поп' });
    expect(planRig({ ...ae(), host: 'pr' }, rig('M5.in')).problems[0].code).toBe('NOT_SUPPORTED');
    expect(planRig(ae(false), rig('M5.in')).problems[0].code).toBe('NO_TARGET');
    expect(planRig(ae(), undefined).problems[0].code).toBe('NOT_SUPPORTED');
    expect((planRig(ae(true, 3840, 2160), rig('M9.in')).request!.ops[0] as NoiseMatteOp).scale).toBe(225);
  });

  it('done layers with warnings for the skipped ones and for 3D switched on; nothing done is an error', async () => {
    const req = planRig(ae(), rig('M6.in')).request!;
    const ok = await runRig(answer({ ok: true, data: { layers: [{ name: 'Logo', done: true, made3D: true, keys: 3 }, { name: 'Звук', done: false, skipped: 'bounds', keys: 0 }] } }), req);
    expect(ok.ok).toBe(true);
    expect(ok.problems.map((p) => [p.code, p.severity])).toEqual([['RIG_SKIPPED', 'warning'], ['RIG_3D', 'warning']]);
    expect(ok.problems[0].message).toContain('Звук (у слоя нет размера)');
    const none = await runRig(answer({ ok: true, data: { layers: [{ name: 'Plate', done: false, skipped: 'text', keys: 0 }] } }), planRig(ae(), rig('M2.podcast.in')).request!);
    expect(none.ok).toBe(false);
    expect(none.problems[0]).toMatchObject({ code: 'RIG_NOTHING', message: expect.stringContaining('Plate (нужен текстовый слой)') });
    expect((await runRig(answer({ ok: false, error: { code: 'NO_SELECTION', message: '' } }), req)).problems[0].code).toBe('NO_SELECTION');
    expect((await runRig(answer({ ok: false, error: { code: 'HOST_EXCEPTION', message: 'boom' } }), req)).problems[0].code).toBe('HOST_ERROR');
  });
});
