import { describe, it, expect } from 'vitest';
import {
  LT, LT_KEYS, FRAMES, TOL_PX, REMAP_MODELS, frameTime, xAtTime, masterTime, remapKeys, expectedLtX, explainX, hatchX,
  nearX, round, describeLt, recommendMechanism,
} from '../../spikes/s3-instance/analyze.mjs';

describe('S3 fixture model', () => {
  it('samples whole frames at 25 fps', () => {
    expect(frameTime(FRAMES.intro)).toBeCloseTo(2.48, 10);
    expect(frameTime(FRAMES.outro)).toBeCloseTo(16.48, 10);
    expect(frameTime(FRAMES.hatchOut)).toBeCloseTo(11.48, 10);
  });
  it('interpolates the PROBE_SQ keys linearly and clamps outside them', () => {
    expect(xAtTime(LT_KEYS, 0.48)).toBeCloseTo(148, 10);
    expect(xAtTime(LT_KEYS, 5)).toBe(200);
    expect(xAtTime(LT_KEYS, 9.48)).toBeCloseTo(248, 10);
    expect(xAtTime(LT_KEYS, 12)).toBe(300);
    expect(xAtTime(LT_KEYS, -1)).toBe(100);
  });
});

describe('duration-fitting models', () => {
  const p = { ...LT, layerDur: LT.target };
  it('rdt keeps the intro and the outro at their speed and stretches the middle', () => {
    expect(masterTime(0.48, 'rdt', p)).toBeCloseTo(0.48, 10);
    expect(masterTime(14.48, 'rdt', p)).toBeCloseTo(9.48, 10);
    expect(masterTime(1, 'rdt', p)).toBeCloseTo(1, 10);
    expect(masterTime(14, 'rdt', p)).toBeCloseTo(9, 10);
    expect(masterTime(7.5, 'rdt', p)).toBeCloseTo(5, 10);
  });
  it('uniform stretches everything, none does not stretch', () => {
    expect(masterTime(14.48, 'uniform', p)).toBeCloseTo(9.6533, 4);
    expect(masterTime(14.48, 'none', p)).toBe(14.48);
    expect(() => masterTime(1, 'loop', p)).toThrow(/unknown model/);
  });
  it('predicts PROBE_SQ x at the sampled frames', () => {
    expect(expectedLtX(FRAMES.intro, 'rdt')).toBeCloseTo(148, 6);
    expect(expectedLtX(FRAMES.intro, 'uniform')).toBeCloseTo(132, 6);
    expect(expectedLtX(FRAMES.intro, 'none')).toBeCloseTo(148, 6);
    expect(expectedLtX(FRAMES.outro, 'rdt')).toBeCloseTo(248, 6);
    expect(expectedLtX(FRAMES.outro, 'uniform')).toBeCloseTo(265.333, 3);
    expect(expectedLtX(FRAMES.outro, 'none')).toBeNull();
  });
  it('explains a measurement by the models it matches', () => {
    expect(explainX(FRAMES.intro, { x: 148.3, count: 1600 })).toEqual(['rdt', 'none']);
    expect(explainX(FRAMES.intro, { x: 132.1, count: 1600 })).toEqual(['uniform']);
    expect(explainX(FRAMES.outro, { x: 247.9, count: 1600 })).toEqual(['rdt']);
    expect(explainX(FRAMES.outro, { x: 265.2, count: 1600 })).toEqual(['uniform']);
    expect(explainX(FRAMES.outro, { x: null, count: 0 })).toEqual(['none']);
    expect(explainX(FRAMES.outro, { x: 300, count: 1600 })).toEqual([]);
  });
});

describe('trim template (CRT_Hatch_v1)', () => {
  it('holds at 100 until Duration - 1, then moves to 200 at Duration', () => {
    expect(hatchX(frameTime(FRAMES.hatchHold), 12)).toBe(100);
    expect(hatchX(frameTime(FRAMES.hatchOut), 12)).toBeCloseTo(148, 6);
    expect(hatchX(frameTime(FRAMES.hatchOut), 10)).toBe(200);
    expect(hatchX(frameTime(FRAMES.hatchHold), 10)).toBe(200);
  });
});

describe('time remap model', () => {
  const p = { ...LT, layerDur: LT.target };
  it('keys the 15 s instance 0->0, 1->1, 14->9, 15->10 (layer time -> template time)', () => {
    expect(remapKeys(p)).toEqual([[0, 0], [1, 1], [14, 9], [15, 10]]);
  });
  it('maps time like rdt inside the layer and holds outside the keys', () => {
    for (const t of [0, 0.48, 1, 5, 7.5, 14, 14.48, 15]) {
      expect(masterTime(t, 'remap', p)).toBeCloseTo(masterTime(t, 'rdt', p), 10);
    }
    expect(masterTime(-1, 'remap', p)).toBe(0);
    expect(masterTime(16, 'remap', p)).toBe(10);
  });
  it('predicts PROBE_SQ x at the sampled frames and explains a remapped instance', () => {
    expect(expectedLtX(FRAMES.intro, 'remap')).toBeCloseTo(148, 6);
    expect(expectedLtX(FRAMES.outro, 'remap')).toBeCloseTo(248, 6);
    expect(explainX(FRAMES.outro, { x: 248.4, count: 1600 }, TOL_PX, REMAP_MODELS)).toEqual(['remap']);
    expect(explainX(FRAMES.outro, { x: null, count: 0 }, TOL_PX, REMAP_MODELS)).toEqual(['none']);
    expect(describeLt(FRAMES.intro, { x: 148.1, count: 1600 }, REMAP_MODELS)).toEqual({
      frame: 62, x: 148.1, count: 1600,
      expected: { remap: 148, none: 148 },
      explainedBy: ['remap', 'none'],
    });
  });
});

describe('recommendMechanism (contract rule C27)', () => {
  const ok = (name) => ({ name, pass: true, required: true, detail: '' });
  const bad = (name) => ({ name, pass: false, required: true, detail: '' });
  const RDT = [
    'RDT fit: a time stretch makes the instance last 15 s from 2 s',
    'RDT stretch: intro keeps its speed (PROBE_SQ x~148 at 0.48 s into the instance)',
    'RDT stretch: outro keeps its speed (PROBE_SQ x~248 at 14.48 s into the instance)',
  ];
  const REMAP = [
    'remap: time remap on (AE adds its own keys)',
    'remap: Essential Properties written before time remap still read back',
    'time remap: intro keeps its speed (PROBE_SQ x~148 at 0.48 s into the instance)',
    'time remap: outro keeps its speed (PROBE_SQ x~248 at 14.48 s into the instance)',
  ];
  // Checks of other kinds never decide the mechanism.
  const OTHER = [
    ok('import of the template .aep returns a FolderItem'),
    bad('trim-out (info): moving the out point alone gives an RDT fit'),
    bad('linear: colour patch dE2000 <= 2 vs #26D07C (linearized sRGB project)'),
  ];

  it('prefers rdt when every RDT check passes, whatever time remap did', () => {
    expect(recommendMechanism([...OTHER, ...RDT.map(ok), ...REMAP.map(bad)]).mechanism).toBe('rdt');
  });
  it('falls back to remap when RDT fails and every time-remap check passes', () => {
    const r = recommendMechanism([...OTHER, ok(RDT[0]), ok(RDT[1]), bad(RDT[2]), ...REMAP.map(ok)]);
    expect(r.mechanism).toBe('remap');
    expect(r.mechanismReason).toContain(RDT[2]);
  });
  it('says trim-only when both were measured and both failed', () => {
    const r = recommendMechanism([...OTHER, ...RDT.map(bad), ok(REMAP[0]), bad(REMAP[1]), ok(REMAP[2]), ok(REMAP[3])]);
    expect(r.mechanism).toBe('trim-only');
    expect(r.mechanismReason).toContain(REMAP[1]);
  });
  it('gives no mechanism when the run stopped before the frames', () => {
    expect(recommendMechanism([...OTHER, ok(RDT[0])])).toEqual({
      mechanism: null, mechanismReason: 'not measured: the run stopped before the RDT frames',
    });
    expect(recommendMechanism([...OTHER, ...RDT.map(bad), ok(REMAP[0])])).toEqual({
      mechanism: null, mechanismReason: 'not measured: the run stopped before the time-remap frames',
    });
  });
});

describe('helpers', () => {
  it('describes a measurement for the record', () => {
    expect(describeLt(FRAMES.outro, { x: 248.2, count: 1600 })).toEqual({
      frame: 412, x: 248.2, count: 1600,
      expected: { rdt: 248, uniform: 265.33, none: null },
      explainedBy: ['rdt'],
    });
  });
  it('compares a centroid with a tolerance', () => {
    expect(nearX({ x: 149.9, count: 1600 }, 148)).toBe(true);
    expect(nearX({ x: 151, count: 1600 }, 148)).toBe(false);
    expect(nearX({ x: null, count: 0 }, 148)).toBe(false);
    expect(nearX({ x: 148, count: 1600 }, null)).toBe(false);
  });
  it('rounds for the record', () => {
    expect(round(265.33333, 2)).toBe(265.33);
    expect(round(null, 2)).toBeNull();
  });
});
