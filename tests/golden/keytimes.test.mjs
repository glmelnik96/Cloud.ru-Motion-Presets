import { describe, it, expect } from 'vitest';
import { keyFrames } from '../../tools/golden/keytimes.mjs';

const fr = (list) => list.map((k) => k.f);

describe('keyFrames', () => {
  it('samples a 10 s comp at 25 fps every 0.25 s and ends on the last frame', () => {
    const k = keyFrames({ duration: 10, fps: 25 });
    expect(k).toHaveLength(41);
    expect(fr(k).slice(0, 5)).toEqual([0, 6, 13, 19, 25]);
    expect(k[k.length - 1]).toEqual({ f: 249, ms: 9960 });
  });
  it('switches to 5 s steps after 15 s and stops them at 60 s', () => {
    const k = keyFrames({ duration: 60, fps: 25 });
    expect(k).toHaveLength(78);
    expect(fr(k)).toContain(375); // 15 s
    expect(fr(k)).toContain(1375); // 55 s
    expect(fr(k).slice(-9)).toEqual([1450, 1456, 1463, 1469, 1475, 1481, 1488, 1494, 1499]);
  });
  it('covers the first minute and the last 2 s of a one-hour overlay', () => {
    const k = keyFrames({ duration: 3600, fps: 25 });
    expect(k).toHaveLength(79);
    expect(fr(k)).toContain(1500); // 60 s
    expect(k[k.length - 1]).toEqual({ f: 89999, ms: 3599960 });
  });
  it('adds marker times and the ends of marker ranges, frame-aligned and deduplicated', () => {
    const k = keyFrames({ duration: 10, fps: 25, markers: [{ time: 3.3, duration: 0 }, { time: 9, duration: 1 }, { time: 0.5, duration: 0 }] });
    expect(k).toHaveLength(42); // 3.3 s = frame 83 is new; 9 s, 10 s and 0.5 s are already there
    expect(fr(k)).toContain(83);
  });
  it('handles a transition shorter than 2 s at 24 fps', () => {
    expect(fr(keyFrames({ duration: 0.875, fps: 24 }))).toEqual([0, 3, 6, 9, 12, 15, 18, 20]);
  });
  it('names frames in whole milliseconds at 29.97 fps', () => {
    const k = keyFrames({ duration: 1, fps: 30000 / 1001 });
    expect(k[1]).toEqual({ f: 7, ms: 234 });
  });
  it('rejects a comp without timing', () => {
    expect(() => keyFrames({ duration: 0, fps: 25 })).toThrow(/bad comp timing/);
  });
});
