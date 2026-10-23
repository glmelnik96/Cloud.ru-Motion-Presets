import { describe, it, expect } from 'vitest';
import { parseFrames, nestedManifestFile } from '../../tools/golden/comp-frames.mjs';

const comp = { duration: 2.04, frameRate: 25 };

describe('golden frames of a nested comp', () => {
  it('renders every frame of [0, duration) by default, named by ms', () => {
    const all = parseFrames('all', comp);
    expect(all).toHaveLength(51);
    expect(all[25]).toEqual({ f: 25, ms: 1000 });
    expect(all[50]).toEqual({ f: 50, ms: 2000 });
    expect(parseFrames(undefined, comp)).toEqual(all);
  });
  it('takes a range or a list, sorted and without repeats', () => {
    expect(parseFrames('4-6', comp).map((p) => p.f)).toEqual([4, 5, 6]);
    expect(parseFrames('25,4,25', comp)).toEqual([{ f: 4, ms: 160 }, { f: 25, ms: 1000 }]);
  });
  it('refuses frames past the comp', () => {
    expect(() => parseFrames('49-51', comp)).toThrow(/0\.\.50/);
    expect(() => parseFrames('x', comp)).toThrow();
  });
  it('keeps its manifest apart from the roots\' one', () => {
    expect(nestedManifestFile('courses')).toMatch(/docs[\\/]research[\\/]golden[\\/]courses-nested\.json$/);
  });
});
