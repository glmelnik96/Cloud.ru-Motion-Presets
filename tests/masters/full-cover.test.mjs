// tools/masters/full-cover.mjs: where a transition's rectangles cover the frame (exactly, with a pixel to spare), the
// master's timeline that holds the first full frame until four cover (spec 5), and the time remap that plays it.
import { describe, expect, it } from 'vitest';
import { coverFrames, coverOf, holdRemapJs, holdTimeline } from '../../tools/masters/full-cover.mjs';

describe('full cover', () => {
  it('covers a window only when every point of it is under a rectangle, with a pixel to spare', () => {
    const win = { l: 0, r: 100, t: 0, b: 100 };
    expect(coverOf([{ l: -1, r: 101, t: -1, b: 101 }], win)).toEqual({ full: true, shows: true });
    expect(coverOf([{ l: 0, r: 100, t: 0, b: 100 }], win).full).toBe(false);
    // two halves that meet cover it; a gap between them does not
    expect(coverOf([{ l: -1, r: 50, t: -1, b: 101 }, { l: 50, r: 101, t: -1, b: 101 }], win).full).toBe(true);
    expect(coverOf([{ l: -1, r: 50, t: -1, b: 101 }, { l: 51, r: 101, t: -1, b: 101 }], win).full).toBe(false);
    // stacked rows meet too
    expect(coverOf([{ l: -1, r: 101, t: -1, b: 40 }, { l: -1, r: 101, t: 40, b: 101 }], win).full).toBe(true);
    expect(coverOf([{ l: 99.8, r: 200, t: 0, b: 100 }], win)).toEqual({ full: false, shows: false });
  });

  it('a bar crossing a window: the frames it shows on and covers it', () => {
    // 220 wide, its middle from x -300 by 100 a frame: covers [0, 100] while it spans it with a pixel each side
    const rects = (t) => [{ l: -300 + 100 * t - 110, r: -300 + 100 * t + 110, t: -10, b: 110 }];
    const per = coverFrames(rects, { w: { l: 0, r: 100, t: 0, b: 100 } }, 7, 1);
    expect(per.w).toEqual({ shown: [2, 3, 4, 5], full: [3, 4] });
  });

  it('holds the first full frame until four cover, trimmed to the shown frames', () => {
    const tl = holdTimeline({ shown: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], full: [10, 11, 12] }, 25, 4);
    expect(tl).toMatchObject({ head: 1, tail: 20, extra: 1, cutFrame: 9, frames: 21, durationSec: 0.84 });
    expect([0, 8, 9, 10, 11, 20].map((f) => Math.round(tl.packTime(f) * 25))).toEqual([1, 9, 10, 10, 11, 20]);
    // enough cover already: no hold
    expect(holdTimeline({ shown: [0, 1, 2, 3, 4, 5], full: [1, 2, 3, 4] }, 25, 4)).toMatchObject({ extra: 0, cutFrame: 1, frames: 6 });
    expect(() => holdTimeline({ shown: [1, 2, 4], full: [2] }, 25, 4)).toThrow(/not one run/);
  });

  it('plays it by a time remap that matches the timeline', () => {
    const tl = holdTimeline({ shown: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], full: [10, 11, 12] }, 25, 4);
    const src = holdRemapJs(tl, 25);
    const remap = new Function('time', src.replace(/\n([^\n]*)$/, '\nreturn ($1);'));
    for (let f = 0; f < tl.frames; f += 1) expect(Math.round(remap(f / 25) * 1e6) / 1e6).toBe(tl.packTime(f));
  });
});
