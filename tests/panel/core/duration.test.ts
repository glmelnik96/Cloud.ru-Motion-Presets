import { describe, it, expect } from 'vitest';
import {
  TICKS_PER_SECOND, defaultLen, minLen, round6, toFrames, framesToSec, minFrames, insertFrames, secToTicks, c27Keys,
} from '../../../panel/src/core/duration';
import type { Item } from '../../../panel/src/core/types';
import { item } from './fixture';

describe('insert length (P3)', () => {
  it('defaults to intro + hold + outro, the MOGRT default length', () => {
    // 2.84 + 0.76 + 1.4 is 4.999999999999999 in floating point
    expect(defaultLen(item('LOGO_Shot'))).toBe(5);
    expect(defaultLen(item('LOGO_Mark'))).toBe(4);
    expect(defaultLen(item('TTL_LowerThird'))).toBe(6);
  });
  it('has a minimum of intro + outro', () => {
    expect(minLen(item('LOGO_Shot'))).toBe(4.24);
    expect(minLen(item('LOGO_Mark'))).toBe(3.76);
    expect(minLen(item('TTL_LowerThird'))).toBe(4.2);
  });
  it('is 0 for an item without a duration', () => {
    const loose: Item = { ...item('LOGO_Mark'), tier: 'T3' };
    delete loose.duration;
    expect(defaultLen(loose)).toBe(0);
    expect(minLen(loose)).toBe(0);
  });
});

describe('frames', () => {
  it('rounds to the frame grid', () => {
    expect(2.2 * 25).not.toBe(55);
    expect(toFrames(2.2, 25)).toBe(55);
    expect(toFrames(6, 25)).toBe(150);
    expect(toFrames(4.24, 25)).toBe(106);
    expect(toFrames(5, 29.97)).toBe(150);
    expect(toFrames(0.02, 25)).toBe(1);
    expect(toFrames(0.019, 25)).toBe(0);
  });
  it('turns frames back into seconds without float noise', () => {
    expect(framesToSec(55, 25)).toBe(2.2);
    expect(framesToSec(128, 30)).toBe(4.266667);
  });
  it('snaps an insert to the grid but never below the minimum it passed', () => {
    const shot = item('LOGO_Shot'); // minimum 4.24 s
    expect(insertFrames(shot, 8, 25, 'pr')).toBe(200);
    expect(insertFrames(shot, 8.01, 25, 'pr')).toBe(200);
    expect(insertFrames(shot, 4.24, 25, 'pr')).toBe(106);
    expect(insertFrames(shot, 4.24, 30, 'pr')).toBe(128); // 127.2 frames: 127 would cut the outro
    expect(insertFrames(item('TTL_LowerThird'), 4.2, 25, 'pr')).toBe(105); // 4.2 * 25 is 105.00000000000001
    expect(insertFrames(shot, 4, 25, 'pr')).toBe(100); // too short: preflight refuses it, the count stays honest
    expect(insertFrames(shot, Number.NaN, 25, 'pr')).toBe(0);
    expect(insertFrames(shot, 8, 0, 'pr')).toBe(0);
    expect(insertFrames(shot, 8, 0, 'ae')).toBe(0); // no frame rate: not the one frame AE keeps for its hold
    expect(insertFrames(shot, 8, -25, 'ae')).toBe(0);
    // preflight refuses anything but a microsecond under the minimum, so the count is the plain rounding there
    expect(insertFrames(shot, 4.24 - 5e-7, 30, 'pr')).toBe(128);
    expect(insertFrames(shot, 4.24 - 5e-6, 30, 'pr')).toBe(127);
  });
  it('keeps a whole frame of hold in AE, where the minimum itself would collide two C27 keys', () => {
    const shot = item('LOGO_Shot');
    const ttl = item('TTL_LowerThird');
    expect([minFrames(shot, 25, 'pr'), minFrames(shot, 25, 'ae')]).toEqual([106, 107]);
    expect([minFrames(ttl, 25, 'pr'), minFrames(ttl, 25, 'ae')]).toEqual([105, 106]); // 105.00000000000001 is 105
    // 127.2 frames: Premiere rounds up to 128, AE needs 128.2 for a whole frame of hold (128 would leave 0.8 of it)
    expect([minFrames(shot, 30, 'pr'), minFrames(shot, 30, 'ae')]).toEqual([128, 129]);
    expect([minFrames(shot, 23.976, 'pr'), minFrames(shot, 23.976, 'ae')]).toEqual([102, 103]); // 101.66 frames
    expect(insertFrames(shot, 4.24, 25, 'ae')).toBe(107);
    expect(insertFrames(shot, 4.259, 25, 'ae')).toBe(107);
    expect(insertFrames(shot, 8, 25, 'ae')).toBe(200);
    expect(insertFrames(shot, 4, 25, 'ae')).toBe(100); // too short stays honest in AE too
    const loose: Item = { ...shot, tier: 'T3' };
    delete loose.duration; // no C27 split: nothing to keep
    expect(minFrames(loose, 25, 'ae')).toBe(0);
  });
  it('puts C27 keys 2 and 3 at least a frame apart at the AE minimum, at any frame rate', () => {
    for (const id of ['LOGO_Shot', 'LOGO_Mark', 'TTL_LowerThird']) {
      const it = item(id);
      const { introSec, outroSec } = it.duration!;
      for (const fps of [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60]) {
        const keys = c27Keys(defaultLen(it), introSec, round6(defaultLen(it) - outroSec), framesToSec(minFrames(it, fps, 'ae'), fps));
        expect((keys[2]![0] - keys[1]![0]) * fps, `${id} ${fps}`).toBeGreaterThanOrEqual(1 - 1e-3); // 1e-3 frame: keys round to 1 us
      }
    }
  });
});

describe('Premiere ticks', () => {
  it('has 254016000000 ticks per second', () => {
    expect(TICKS_PER_SECOND).toBe(254016000000);
  });
  it('converts whole seconds exactly, as a decimal string', () => {
    expect(secToTicks(0)).toBe('0');
    expect(secToTicks(1)).toBe('254016000000');
    expect(secToTicks(12)).toBe('3048192000000');
    expect(secToTicks(36000)).toBe('9144576000000000'); // 10 h
    expect(secToTicks(1e6)).toBe('254016000000000000');
    // past 1e21 ticks String(number) switches to '1.016064e+21'; BigInt stays a plain integer
    expect(secToTicks(4e9)).toBe('1016064000000000000000');
  });
  it('converts fractions on the frame grid', () => {
    expect(secToTicks(0.04)).toBe('10160640000'); // one frame at 25p
    expect(secToTicks(2.2)).toBe('558835200000');
    expect(secToTicks(36000.04)).toBe('9144586160640000');
    expect(secToTicks(1001 / 30000)).toBe('8475667200'); // one frame at 29.97
  });
  it('stays on the frame grid past 4.5 h, where seconds times ticks in Number math is a tick off', () => {
    // 25p frame 409602 and 29.97 frame 491044; Math.round(sec * TICKS_PER_SECOND) gives ...280001 and ...556801
    expect(16384.08 * TICKS_PER_SECOND).not.toBe(4161818465280000);
    expect(secToTicks(16384.08)).toBe('4161818465280000');
    expect(secToTicks((491044 * 1001) / 30000)).toBe(String(491044n * 8475667200n));
    // frame f of fps num/den starts at f * den / num s, f * perFrame ticks
    const grids = [[409602, 25, 1, 10160640000n], [491044, 30000, 1001, 8475667200n], [393217, 24, 1, 10584000000n]] as const;
    for (const [first, num, den, perFrame] of grids) {
      const off: number[] = [];
      for (let f = first; f < first + 3000; f += 1) {
        if (secToTicks((f * den) / num) !== String(BigInt(f) * perFrame)) off.push(f);
      }
      expect(off, `${num}/${den}`).toEqual([]);
    }
  });
  it('refuses a time that is not a number', () => {
    expect(() => secToTicks(Number.NaN)).toThrow(RangeError);
  });
});

describe('C27 time-remap keys (AE, fit rdt)', () => {
  it('ports remapKeys of spikes/s3-instance/analyze.mjs: D=10, in=1, out=9, L=15', () => {
    expect(c27Keys(10, 1, 9, 15)).toEqual([[0, 0], [1, 1], [14, 9], [15, 10]]);
  });
  it('gives the identity when the length is the template length', () => {
    expect(c27Keys(10, 1, 9, 10)).toEqual([[0, 0], [1, 1], [9, 9], [10, 10]]);
    expect(c27Keys(5, 2.84, 3.6, 5)).toEqual([[0, 0], [2.84, 2.84], [3.6, 3.6], [5, 5]]);
  });
  it('stretches or squeezes only the hold of the pack-1 templates', () => {
    expect(c27Keys(5, 2.84, 3.6, 8)).toEqual([[0, 0], [2.84, 2.84], [6.6, 3.6], [8, 5]]);
    expect(c27Keys(6, 2.2, 4, 8)).toEqual([[0, 0], [2.2, 2.2], [6, 4], [8, 6]]);
    // the shortest AE length at 25p (minFrames 'ae'): one frame of hold between the intro and the outro
    expect(c27Keys(6, 2.2, 4, 4.24)).toEqual([[0, 0], [2.2, 2.2], [2.24, 4], [4.24, 6]]);
  });
  it('collides keys 2 and 3 at the minimum, which AE cannot hold: planInsert never asks for it in AE', () => {
    // setValueAtTime on an existing key time replaces that key: [0,0] [2.2,4] [4.2,6] plays 4 s of template in 2.2 s
    const [, intro, outro] = c27Keys(6, 2.2, 4, 4.2);
    expect(intro![0]).toBe(outro![0]);
  });
});
