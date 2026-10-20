import { describe, expect, it } from 'vitest';
import { canonProgress, checkCanon, dumpSegment, fitExpr, SIZE_CTRL, SIZES, visible } from '../../tools/masters/rig-plate.mjs';
import { keyedValue } from '../helpers/master-expr.mjs';

const SEG = { frames: 23, bezier: [0.73, 0, 0.25, 1] };
const dumpKey = (time, out, inn) => ({ time, outEase: [{ speed: 0, influence: out }], inEase: [{ speed: 0, influence: inn }] });

describe('plate rig', () => {
  it('a canon segment becomes a 0..1 slider with zero-speed keys', () => {
    const keys = canonProgress(SEG, 0.52);
    expect(keys.map((k) => [k.t, k.v, k.outEase[0][1], k.inEase[0][1]])).toEqual([[0.52, 0, 73, 33.333333], [1.44, 1, 33.333333, 75]]);
    expect(keyedValue(keys, 0.52)).toBe(0);
    expect(keyedValue(keys, 1.44)).toBe(1);
    expect(keyedValue(keys, 0.98)).toBeGreaterThan(0.3);
    expect(() => canonProgress({ frames: 13, linear: true }, 0)).toThrow(/segment is expected/);
    expect(() => canonProgress({ frames: 13, bezier: [0.2, 0.1, 0.4, 1] }, 0)).toThrow(/zero speed/);
  });

  it('the canon is checked against the pack keys it came from', () => {
    const keys = [dumpKey(1.2, 73.37, 16.667), dumpKey(2.12, 16.667, 75)];
    expect(checkCanon(keys, 0, SEG, { label: 'Box_1' })).toEqual({ t0: 1.2, t1: 2.12, frames: 23 });
    expect(() => checkCanon([dumpKey(1.2, 73.37, 16.667), dumpKey(2.08, 16.667, 75)], 0, SEG, { label: 'Box_1' })).toThrow(/Box_1: .*22 frames, canon 23/);
    expect(() => checkCanon([dumpKey(1.2, 60, 16.667), dumpKey(2.12, 16.667, 75)], 0, SEG)).toThrow(/out influence 60/);
    const fast = [{ time: 0, outEase: [{ speed: 40, influence: 73 }] }, { time: 0.92, inEase: [{ speed: 0, influence: 75 }] }];
    expect(() => checkCanon(fast, 0, SEG)).toThrow(/speeds 40/);
  });

  it('pack keys the canon does not cover become a segment; real speeds are refused', () => {
    const key = (time, value, out, inn, speed = 0) => ({ time, value, outEase: [{ speed, influence: out }], inEase: [{ speed: 0, influence: inn }] });
    expect(dumpSegment([key(1.12, 0, 71.943, 16.667), key(1.48, 100, 33.333, 73.466)], 0)).toEqual({ frames: 9, bezier: [0.71943, 0, 0.26534, 1] });
    // a hand-dragged key: 2.7 %/s against a mean of 309 %/s passes
    expect(dumpSegment([key(9.08, 100, 100, 35, 2.724), key(9.4, 1, 33.333, 77.711)], 0).frames).toBe(8);
    expect(() => dumpSegment([key(0, 0, 40, 30, 80), key(0.4, 100, 30, 40)], 0, { label: 'drift' })).toThrow(/drift: speeds 80/);
    expect(dumpSegment([{ time: 0, value: [0, 100], outEase: [{ speed: 0, influence: 76.688 }, { speed: 0, influence: 33 }] },
      { time: 0.76, value: [182.8, 100], inEase: [{ speed: 0, influence: 79.855 }, { speed: 0, influence: 33 }] }], 0, { dim: 0 })).toEqual({ frames: 19, bezier: [0.76688, 0, 0.20145, 1] });
  });

  it('size and visibility helpers stay as the speaker title built them', () => {
    expect(SIZE_CTRL.items).toHaveLength(SIZES.length);
    expect(SIZES[SIZE_CTRL.value - 1]).toBe(1);
    const js = fitExpr('var k = 1;\n', '500', '1000');
    expect(new Function('thisComp', js.replace(/\n([^\n]*)$/, '\nreturn ($1);'))({ layer: () => ({ effect: () => () => ({ value: 5 }) }) })).toBe(1.6);
    expect(new Function('thisComp', js.replace('500', '800').replace(/\n([^\n]*)$/, '\nreturn ($1);'))({ layer: () => ({ effect: () => () => ({ value: 5 }) }) })).toBeCloseTo(999 / 800, 9);
    expect(visible(2)).toBe('thisComp.layer("CTRL").effect("Style")(1).value == 2 ? 100 : 0');
  });
});
