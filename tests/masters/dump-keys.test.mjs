import { describe, expect, it } from 'vitest';
import { dumpKeys, easedProgress, progressSegment, snap, toBuilderKeys } from '../../tools/masters/dump-keys.mjs';

const key = (time, value, out = [[0, 33.333333]], inn = [[0, 33.333333]], interp = 'BEZIER') => ({
  time, value, inInterp: interp, outInterp: interp,
  inEase: inn.map(([speed, influence]) => ({ speed, influence })),
  outEase: out.map(([speed, influence]) => ({ speed, influence })),
});

const dump = {
  comp: { name: 'C' },
  layers: [{
    index: 1, name: 'Back', props: [{ matchName: 'ADBE Transform Group', children: [
      { matchName: 'ADBE Position_0', name: 'X Position', keys: [key(1, 407.5, [[0, 70.03]]), key(2.12, 139.5, undefined, [[0, 59.42]])] },
      { matchName: 'ADBE Rotate X', name: 'X Rotation', keys: [key(1 / 3, -90, [[11930, 0.541]]), key(1, -3.6, [[27.4, 19.15]], [[28.4, 34.5]])] },
      { matchName: 'ADBE Opacity', name: 'Opacity', value: 100 },
    ] }],
  }],
};

describe('dump-keys', () => {
  it('finds keys by layer name and matchName path', () => {
    expect(dumpKeys(dump, 'Back', 'ADBE Transform Group', 'ADBE Position_0')).toHaveLength(2);
    expect(() => dumpKeys(dump, 'Back', 'ADBE Transform Group', 'ADBE Opacity')).toThrow(/no keys/);
    expect(() => dumpKeys(dump, 'Nope', 'ADBE Transform Group')).toThrow(/expected one layer/);
  });

  it('snaps times to the frame grid', () => {
    expect(snap(1 / 3, 25)).toBeCloseTo(0.32, 9);
    expect(snap(1.75, 25)).toBeCloseTo(1.76, 9);
  });

  it('turns a zero-speed segment into a 0..1 progress with the same influences', () => {
    const p = progressSegment(dumpKeys(dump, 'Back', 'ADBE Transform Group', 'ADBE Position_0'), 0);
    expect(p.map((k) => [k.t, k.v])).toEqual([[1, 0], [2.12, 1]]);
    expect(p[0].outEase).toEqual([[0, 70.03]]);
    expect(p[1].inEase).toEqual([[0, 59.42]]);
    const moved = progressSegment(dumpKeys(dump, 'Back', 'ADBE Transform Group', 'ADBE Position_0'), 0, { t0: 3.96, t1: 5.08 });
    expect(moved.map((k) => k.t)).toEqual([3.96, 5.08]);
  });

  it('takes one dimension of a multi-dimensional ease (Scale X)', () => {
    const keys = [key(0, [0, 100, 100], [[0, 33.3], [0, 10], [0, 10]]), key(0.8, [183.7, 100, 100], undefined, [[0, 100], [0, 20], [0, 20]])];
    const p = progressSegment(keys, 0, { dim: 0 });
    expect([p[0].outEase, p[1].inEase]).toEqual([[[0, 33.3]], [[0, 100]]]);
    expect(() => progressSegment(keys, 0)).toThrow(/pass dim/);
  });

  it('refuses a segment with ease speed (its curve depends on the value range)', () => {
    expect(() => progressSegment(dumpKeys(dump, 'Back', 'ADBE Transform Group', 'ADBE Rotate X'), 0)).toThrow(/non-zero ease speed/);
  });

  it('rescales speeds of a retimed segment so the curve keeps its shape', () => {
    const keys = dumpKeys(dump, 'Back', 'ADBE Transform Group', 'ADBE Rotate X');
    const b = toBuilderKeys(keys, { times: [0.32, 1] });
    const f = (1 - 1 / 3) / (1 - 0.32);
    expect(b[0].outEase[0][0]).toBeCloseTo(11930 * f, 3);
    expect(b[1].inEase[0][0]).toBeCloseTo(28.4 * f, 4);
    expect(b[1].outEase[0][0]).toBeCloseTo(27.4, 6);       // the next segment keeps its duration
    expect(b[0].outEase[0][1]).toBeCloseTo(0.541, 6);       // influences are fractions of the segment
  });

  it('maps values linearly and scales speeds with them', () => {
    const b = toBuilderKeys(dumpKeys(dump, 'Back', 'ADBE Transform Group', 'ADBE Rotate X'), { a: 2, b: 10 });
    expect(b[0].v).toBe(-170);
    expect(b[1].outEase[0][0]).toBeCloseTo(54.8, 6);
  });

  it('evaluates a zero-speed ease segment', () => {
    expect(easedProgress(0, 33.333, 33.333)).toBeCloseTo(0, 6);
    expect(easedProgress(1, 33.333, 33.333)).toBeCloseTo(1, 6);
    expect(easedProgress(0.5, 33.333, 33.333)).toBeCloseTo(0.5, 4);
    expect(easedProgress(0.5, 70, 33.333)).toBeLessThan(0.5);   // a long ease-out starts slower
  });
});
