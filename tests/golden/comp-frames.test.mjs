import { describe, it, expect } from 'vitest';
import { framesSlug, parseFrames, nestedManifestFile } from '../../tools/golden/comp-frames.mjs';

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
  it('a 24 fps comp sampled at 25 fps: frames on the master\'s grid, in a folder of its own', () => {
    const smm = { duration: 0.875, frameRate: 24 };
    const at25 = parseFrames('all', { ...smm, frameRate: 25 });
    expect(at25).toHaveLength(22);
    expect(at25[21]).toEqual({ f: 21, ms: 840 });
    expect(framesSlug('transition_gray', smm, 25)).toBe('transition_gray_25fps');
    expect(framesSlug('transition_gray', smm, 24)).toBe('transition_gray');
    expect(framesSlug('perekhod', comp, null)).toBe('perekhod');
  });

  it('keeps its manifest apart from the roots\' one', () => {
    expect(nestedManifestFile('courses')).toMatch(/docs[\\/]research[\\/]golden[\\/]courses-nested\.json$/);
  });
});
